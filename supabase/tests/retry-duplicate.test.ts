import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  monthRange,
  monthTotal,
  type Month,
  type MonthTotal,
  type ReceiptForTotal,
} from "../../packages/core/src/index.ts";
import { invoke, rest, signUp, upload, type User } from "./api";
import { localStack, type LocalStack } from "./local-stack";

// ROADMAP v1 2: a forced failure ends `başarısız` (failed) with retry;
// retrying and re-sending an interrupted upload (same idempotency key)
// end in one receipt; saving a receipt with the same image hash, or the
// same store, date and total, as a saved one returns a duplicate warning
// and deletes nothing. Failure looks like two receipts after a retry, a
// silent duplicate, or an automatic delete.

let stack: LocalStack;

type Row = Record<string, unknown>;

// The mock's printed total, store and the first line's amount.
const MOCK_TOTAL = 61235;
const MOCK_STORE = "Örnek Market";

/** A SHA-256 in hex, as the app sends it for the picked photo. */
const hash = (seed: string) => seed.repeat(64).slice(0, 64);

/** The app's call: creates the receipt for its key, or finds the one there. */
const create = (
  owner: User,
  receipt: { id: string; key: string; sha256?: string | null },
) =>
  rest(stack, owner, "POST", "rpc/create_receipt", {
    p_id: receipt.id,
    p_idempotency_key: receipt.key,
    p_image_path: `${owner.id}/${receipt.id}.jpg`,
    p_image_sha256: receipt.sha256 ?? null,
  });

async function receiptsOf(owner: User): Promise<Row[]> {
  const { status, rows } = await rest(
    stack,
    owner,
    "GET",
    "receipts?select=id,idempotency_key,status,error_code,store_name,purchased_on,total_kurus,image_sha256",
  );
  // A refused read would give no rows; fail instead.
  if (status !== 200) throw new Error(`reading receipts: HTTP ${status}`);
  return rows as Row[];
}

async function itemCount(owner: User, id: string): Promise<number> {
  const { status, rows } = await rest(
    stack,
    owner,
    "GET",
    `receipt_items?select=id&receipt_id=eq.${id}`,
  );
  if (status !== 200) throw new Error(`reading items: HTTP ${status}`);
  return rows.length;
}

/** The home screen's number, read as the app reads it. */
async function homeTotal(owner: User, month: Month): Promise<MonthTotal> {
  const range = monthRange(month);
  const inMonth =
    `and(purchased_on.gte.${range.firstDay},purchased_on.lt.${range.nextFirstDay}),` +
    `and(purchased_on.is.null,saved_at.gte.${range.startsAt},saved_at.lt.${range.endsAt})`;
  const { status, rows } = await rest(
    stack,
    owner,
    "GET",
    `receipts?select=status,total_kurus,purchased_on,saved_at&status=eq.saved&or=(${encodeURIComponent(inMonth)})`,
  );
  if (status !== 200) throw new Error(`reading the month: HTTP ${status}`);
  return monthTotal(rows as ReceiptForTotal[], month);
}

type Draft = { id: string; key: string; month: Month };

/** A mock draft made the way the app makes it, with the photo's hash. */
async function newDraft(owner: User, sha256: string | null): Promise<Draft> {
  const id = randomUUID();
  const key = randomUUID();
  const created = await create(owner, { id, key, sha256 });
  if (created.rows.length !== 1) {
    throw new Error(`could not create a receipt: HTTP ${created.status}`);
  }
  const read = await invoke(stack, owner, "extract-receipt", {
    receipt_id: id,
  });
  if (read.status !== 200) {
    throw new Error(`extraction answered HTTP ${read.status}`);
  }
  const row = (await receiptsOf(owner)).find((r) => r.id === id);
  if (typeof row?.purchased_on !== "string") {
    throw new Error("the mock draft has no printed date");
  }
  return { id, key, month: row.purchased_on.slice(0, 7) };
}

/** `save_receipt` with a raw answer, so a refusal's code can be read. */
async function save(
  owner: User,
  key: string,
  options: { receipt?: Row; allowDuplicate?: boolean } = {},
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${stack.apiUrl}/rest/v1/rpc/save_receipt`, {
    method: "POST",
    headers: {
      apikey: stack.anonKey,
      Authorization: `Bearer ${owner.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_idempotency_key: key,
      p_items: [],
      p_receipt: options.receipt ?? {},
      ...(options.allowDuplicate === undefined
        ? {}
        : { p_allow_duplicate: options.allowDuplicate }),
    }),
  });
  return { status: response.status, body: await response.json() };
}

/** The warning's details: which saved receipt this one looks like. */
function warning(answer: { status: number; body: unknown }): unknown {
  const body = answer.body as { code?: unknown; details?: unknown };
  expect(answer.status).toBe(409);
  expect(body.code).toBe("KF001");
  return typeof body.details === "string" ? JSON.parse(body.details) : null;
}

beforeAll(() => {
  stack = localStack();
});

describe("a forced failure, then Tekrar dene", () => {
  let user: User;
  let id: string;
  let key: string;

  beforeAll(async () => {
    user = await signUp(stack);
    id = randomUUID();
    key = randomUUID();
    await create(user, { id, key });
  });

  it("ends failed with an error code and no items", async () => {
    const failed = await invoke(stack, user, "extract-receipt", {
      receipt_id: id,
      mock: "invalid",
    });
    expect(failed.body).toMatchObject({ status: "failed" });
    expect(await receiptsOf(user)).toEqual([
      expect.objectContaining({
        id,
        status: "failed",
        error_code: "extraction_invalid",
      }),
    ]);
    expect(await itemCount(user, id)).toBe(0);
  });

  it("can be read again into a draft, and there is still one receipt", async () => {
    const retried = await invoke(stack, user, "extract-receipt", {
      receipt_id: id,
    });
    expect(retried).toEqual({
      status: 200,
      body: { receipt_id: id, status: "needs_review", source: "mock" },
    });
    const rows = await receiptsOf(user);
    expect(rows).toEqual([
      expect.objectContaining({
        id,
        idempotency_key: key,
        status: "needs_review",
        error_code: null,
      }),
    ]);
    expect(await itemCount(user, id)).toBe(7);
  });

  it("saves once after the retry", async () => {
    const saved = await save(user, key);
    expect(saved.status).toBe(200);
    expect((await receiptsOf(user)).map((r) => r.status)).toEqual(["saved"]);
  });
});

describe("re-sending after the network dropped mid-upload", () => {
  let user: User;
  const id = randomUUID();
  const key = randomUUID();
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

  beforeAll(async () => {
    user = await signUp(stack);
  });

  it("stores the photo again over the half-sent one", async () => {
    const path = `${user.id}/${id}.jpg`;
    expect(await upload(stack, user, "receipts", path, bytes)).toBe(200);
    // The answer was lost: the app sends the same photo to the same name.
    expect(await upload(stack, user, "receipts", path, bytes, "upsert")).toBe(
      200,
    );
  });

  it("finds the receipt already made for the key instead of a second one", async () => {
    const first = await create(user, { id, key, sha256: hash("a") });
    const again = await create(user, { id, key, sha256: hash("a") });
    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(first.rows).toEqual([
      expect.objectContaining({ id, status: "uploading" }),
    ]);
    expect(again.rows).toEqual(first.rows);
    expect(await receiptsOf(user)).toHaveLength(1);
  });

  it("keys on the idempotency key, not on the id sent with it", async () => {
    const other = await create(user, { id: randomUUID(), key });
    expect(other.rows).toEqual([expect.objectContaining({ id })]);
    expect(await receiptsOf(user)).toHaveLength(1);
  });

  it("answers the draft's state after it was read, so the app need not read it again", async () => {
    await invoke(stack, user, "extract-receipt", { receipt_id: id });
    const again = await create(user, { id, key, sha256: hash("a") });
    expect(again.rows).toEqual([
      expect.objectContaining({ id, status: "needs_review" }),
    ]);
    expect(await receiptsOf(user)).toHaveLength(1);
    expect(await itemCount(user, id)).toBe(7);
  });

  it("gives another user nothing of the receipt", async () => {
    const intruder = await signUp(stack);
    // Same key: B gets a receipt of B's own, A's stays as it was.
    const theirs = await create(intruder, { id: randomUUID(), key });
    expect(theirs.rows).toEqual([expect.not.objectContaining({ id })]);
    // Same id: refused, never A's row.
    const clash = await create(intruder, { id, key: randomUUID() });
    expect(clash.status).toBeGreaterThanOrEqual(400);
    expect(clash.rows).toEqual([]);
    expect(await receiptsOf(user)).toEqual([
      expect.objectContaining({ id, status: "needs_review" }),
    ]);
  });
});

describe("saving what looks like a receipt already saved", () => {
  let user: User;
  let first: Draft;

  beforeAll(async () => {
    user = await signUp(stack);
    first = await newDraft(user, hash("b"));
    const saved = await save(user, first.key);
    if (saved.status !== 200) throw new Error("the first save failed");
  });

  it("warns on the same photo, names the saved receipt, and saves nothing", async () => {
    const second = await newDraft(user, hash("b"));
    // Corrected to another total, so only the photo matches.
    const answer = await save(user, second.key, {
      receipt: { total_kurus: 100 },
    });
    expect(warning(answer)).toEqual({
      reason: "image",
      receipt_id: first.id,
      store_name: MOCK_STORE,
      purchased_on: expect.any(String),
      total_kurus: MOCK_TOTAL,
    });
    const rows = await receiptsOf(user);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === first.id)).toMatchObject({
      status: "saved",
    });
    // The draft keeps what was read: the correction was not applied.
    expect(rows.find((r) => r.id === second.id)).toMatchObject({
      status: "needs_review",
      total_kurus: MOCK_TOTAL,
    });
    expect(await itemCount(user, second.id)).toBe(7);
    expect(await homeTotal(user, first.month)).toEqual({
      totalKurus: MOCK_TOTAL,
      count: 1,
    });
  });

  it("warns on the same store, date and total from another photo", async () => {
    const third = await newDraft(user, hash("c"));
    expect(warning(await save(user, third.key))).toMatchObject({
      reason: "content",
      receipt_id: first.id,
    });
    expect(
      (await receiptsOf(user)).find((r) => r.id === third.id),
    ).toMatchObject({ status: "needs_review" });
    expect(await homeTotal(user, first.month)).toEqual({
      totalKurus: MOCK_TOTAL,
      count: 1,
    });
  });

  it("warns on a store name that differs only in case and spaces", async () => {
    const fourth = await newDraft(user, null);
    const answer = await save(user, fourth.key, {
      receipt: { store_name: "  Örnek MARKET " },
    });
    expect(warning(answer)).toMatchObject({ reason: "content" });
  });

  it("saves when the person says Yine de kaydet, keeping both", async () => {
    const fifth = await newDraft(user, hash("b"));
    const answer = await save(user, fifth.key, { allowDuplicate: true });
    expect(answer.status).toBe(200);
    const rows = await receiptsOf(user);
    expect(rows.filter((r) => r.status === "saved")).toHaveLength(2);
    expect(await homeTotal(user, first.month)).toEqual({
      totalKurus: 2 * MOCK_TOTAL,
      count: 2,
    });
  });

  it("saves a different receipt without a warning", async () => {
    const other = await newDraft(user, hash("d"));
    const answer = await save(user, other.key, {
      receipt: { total_kurus: 4990 },
    });
    expect(answer.status).toBe(200);
  });

  it("deleted nothing along the way", async () => {
    // first, second, third, fourth, fifth, other: every receipt is there.
    expect(await receiptsOf(user)).toHaveLength(6);
  });

  it("never compares with another user's receipts", async () => {
    const stranger = await signUp(stack);
    const theirs = await newDraft(stranger, hash("b"));
    const answer = await save(stranger, theirs.key);
    expect(answer.status).toBe(200);
  });
});
