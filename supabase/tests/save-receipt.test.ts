import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  monthTotal,
  type MonthTotal,
  type ReceiptForTotal,
} from "../../packages/core/src/index.ts";
import { invoke, rest, signUp, type User } from "./api";
import { localStack, type LocalStack } from "./local-stack";

// ROADMAP walking skeleton 5: calling `save_receipt` twice with the same
// key yields one saved receipt and the total counts it once; a draft never
// counts; an edited amount is what is saved. Failure looks like the total
// doubling on re-save, or a draft moving the total.

let stack: LocalStack;
let a: User;
let b: User;

type Row = Record<string, unknown>;

// The mock's receipt is dated 2026-09-29 (extract-receipt/adapter.ts).
const MONTH = "2026-09";
const MOCK_TOTAL = 8640;

type Draft = { id: string; key: string; items: Row[] };

/** Uploads nothing: a receipt row plus the mock extraction, as the app does. */
async function newDraft(owner: User): Promise<Draft> {
  const id = randomUUID();
  const key = randomUUID();
  const created = await rest(stack, owner, "POST", "receipts", {
    id,
    idempotency_key: key,
    image_path: `${owner.id}/${id}.jpg`,
  });
  if (created.rows.length !== 1) {
    throw new Error(`could not create a receipt: HTTP ${created.status}`);
  }
  const extracted = await invoke(stack, owner, "extract-receipt", {
    receipt_id: id,
  });
  if (extracted.status !== 200) {
    throw new Error(`extraction answered HTTP ${extracted.status}`);
  }
  return { id, key, items: await itemsOf(owner, id) };
}

async function itemsOf(owner: User, id: string): Promise<Row[]> {
  const { status, rows } = await rest(
    stack,
    owner,
    "GET",
    `receipt_items?receipt_id=eq.${id}&order=line_no`,
  );
  if (status !== 200) throw new Error(`reading items: HTTP ${status}`);
  return rows as Row[];
}

async function receiptsOf(owner: User): Promise<Row[]> {
  const { status, rows } = await rest(
    stack,
    owner,
    "GET",
    "receipts?select=id,status,total_kurus,purchased_on,saved_at",
  );
  // A refused read would give no rows and a total of 0; fail instead.
  if (status !== 200) throw new Error(`reading receipts: HTTP ${status}`);
  return rows as Row[];
}

/** The home screen's number: the owner's rows, summed by @kefe/core. */
async function homeTotal(owner: User): Promise<MonthTotal> {
  return monthTotal((await receiptsOf(owner)) as ReceiptForTotal[], MONTH);
}

const save = (caller: User, key: string, items: unknown[] = []) =>
  rest(stack, caller, "POST", "rpc/save_receipt", {
    p_idempotency_key: key,
    p_items: items,
  });

beforeAll(async () => {
  stack = localStack();
  [a, b] = await Promise.all([signUp(stack), signUp(stack)]);
});

describe("a draft", () => {
  it("never counts in the month total", async () => {
    const draft = await newDraft(a);
    const rows = await receiptsOf(a);
    expect(rows.find((row) => row.id === draft.id)).toMatchObject({
      status: "needs_review",
      total_kurus: MOCK_TOTAL,
    });
    expect(await homeTotal(a)).toEqual({ totalKurus: 0, count: 0 });
  });
});

describe("saving a draft with one amount corrected", () => {
  let draft: Draft;
  let first: { status: number; rows: unknown[] };
  // 12,50 → 15,00 on the first line: +250 kuruş.
  const EDITED_TOTAL = MOCK_TOTAL + 250;

  beforeAll(async () => {
    draft = await newDraft(a);
    first = await save(a, draft.key, [
      { id: draft.items[0]?.id, amount_kurus: 1500 },
    ]);
  });

  it("answers with the saved receipt and its edited total", () => {
    expect(first.status).toBe(200);
    expect(first.rows).toEqual([
      expect.objectContaining({
        id: draft.id,
        status: "saved",
        total_kurus: EDITED_TOTAL,
      }),
    ]);
  });

  it("stores the edited amount and keeps the line as printed", async () => {
    const items = await itemsOf(a, draft.id);
    expect(items.map((item) => item.amount_kurus)).toEqual([1500, 3490, 3900]);
    expect(items[0]).toMatchObject({ raw_text: "EKMEK 1 AD 12,50" });
  });

  it("moves the month total by exactly the saved total", async () => {
    expect(await homeTotal(a)).toEqual({ totalKurus: EDITED_TOTAL, count: 1 });
  });

  it("counts it once when the same key is saved again, even with other edits", async () => {
    const again = await save(a, draft.key, [
      { id: draft.items[1]?.id, amount_kurus: 1 },
    ]);
    expect(again.status).toBe(200);
    expect(again.rows).toEqual([
      expect.objectContaining({ id: draft.id, total_kurus: EDITED_TOTAL }),
    ]);
    const items = await itemsOf(a, draft.id);
    expect(items.map((item) => item.amount_kurus)).toEqual([1500, 3490, 3900]);
    const saved = (await receiptsOf(a)).filter((r) => r.status === "saved");
    expect(saved).toHaveLength(1);
    expect(await homeTotal(a)).toEqual({ totalKurus: EDITED_TOTAL, count: 1 });
  });
});

describe("two saves of one draft at the same moment", () => {
  it("make one saved receipt, counted once", async () => {
    const user = await signUp(stack);
    const draft = await newDraft(user);
    const answers = await Promise.all([
      save(user, draft.key),
      save(user, draft.key),
    ]);
    expect(answers.map((answer) => answer.status)).toEqual([200, 200]);
    const rows = await receiptsOf(user);
    expect(rows.filter((r) => r.status === "saved")).toHaveLength(1);
    expect(await homeTotal(user)).toEqual({
      totalKurus: MOCK_TOTAL,
      count: 1,
    });
  });
});

describe("a save that cannot apply", () => {
  it("refuses an item from another receipt and changes nothing", async () => {
    const user = await signUp(stack);
    const [draft, other] = [await newDraft(user), await newDraft(user)];
    const answer = await save(user, draft.key, [
      { id: other.items[0]?.id, amount_kurus: 1 },
    ]);
    expect(answer.status).toBeGreaterThanOrEqual(400);
    const rows = await receiptsOf(user);
    expect(rows.every((r) => r.status === "needs_review")).toBe(true);
    expect((await itemsOf(user, other.id))[0]).toMatchObject({
      amount_kurus: 1250,
    });
    expect(await homeTotal(user)).toEqual({ totalKurus: 0, count: 0 });
  });

  it("refuses an amount that is not whole kuruş", async () => {
    const user = await signUp(stack);
    const draft = await newDraft(user);
    const answer = await save(user, draft.key, [
      { id: draft.items[0]?.id, amount_kurus: 12.5 },
    ]);
    expect(answer.status).toBeGreaterThanOrEqual(400);
    expect(await homeTotal(user)).toEqual({ totalKurus: 0, count: 0 });
  });

  it("refuses a receipt whose reading failed", async () => {
    const user = await signUp(stack);
    const id = randomUUID();
    const key = randomUUID();
    await rest(stack, user, "POST", "receipts", {
      id,
      idempotency_key: key,
      image_path: `${user.id}/${id}.jpg`,
    });
    await invoke(stack, user, "extract-receipt", {
      receipt_id: id,
      mock: "invalid",
    });
    const answer = await save(user, key);
    expect(answer.status).toBeGreaterThanOrEqual(400);
    expect(await homeTotal(user)).toEqual({ totalKurus: 0, count: 0 });
  });

  it("refuses B saving A's draft, and A's draft stays a draft", async () => {
    const draft = await newDraft(a);
    const before = await homeTotal(a);
    const answer = await save(b, draft.key);
    expect(answer.status).toBeGreaterThanOrEqual(400);
    const rows = await receiptsOf(a);
    expect(rows.find((row) => row.id === draft.id)).toMatchObject({
      status: "needs_review",
    });
    expect(await homeTotal(a)).toEqual(before);
    expect(await homeTotal(b)).toEqual({ totalKurus: 0, count: 0 });
  });
});
