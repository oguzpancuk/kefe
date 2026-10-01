import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { istanbulDate } from "../../packages/core/src/index.ts";
import { invoke, rest, signUp, type User } from "./api";
import { localStack, type LocalStack } from "./local-stack";

// ROADMAP walking skeleton 3: a valid mock result yields a draft in state
// `kontrol bekliyor` (needs_review) marked mock; an output that fails the
// schema leaves the receipt `başarısız` (failed) with an error code and no
// items; a call for another user's receipt is refused. Failure looks like
// invalid output stored as items, or a draft without the mock marker.

let stack: LocalStack;
let a: User;
let b: User;

type Row = Record<string, unknown>;

/** A fresh receipt of A's, as the app creates it right after upload. */
async function newReceipt(owner: User): Promise<string> {
  const id = randomUUID();
  const created = await rest(stack, owner, "POST", "receipts", {
    id,
    idempotency_key: randomUUID(),
    image_path: `${owner.id}/${id}.jpg`,
  });
  if (created.rows.length !== 1) {
    throw new Error(`could not create a receipt: HTTP ${created.status}`);
  }
  return id;
}

async function receiptOf(owner: User, id: string): Promise<Row | undefined> {
  const { rows } = await rest(stack, owner, "GET", `receipts?id=eq.${id}`);
  return rows[0] as Row | undefined;
}

async function itemsOf(owner: User, id: string, select = "*"): Promise<Row[]> {
  // A refused read would also give no rows; make it fail instead, so "no
  // items" below cannot pass on a broken query.
  const { status, rows } = await rest(
    stack,
    owner,
    "GET",
    `receipt_items?select=${select}&receipt_id=eq.${id}&order=line_no`,
  );
  if (status !== 200) throw new Error(`reading items: HTTP ${status}`);
  return rows as Row[];
}

beforeAll(async () => {
  stack = localStack();
  [a, b] = await Promise.all([signUp(stack), signUp(stack)]);
});

describe("a valid mock result", () => {
  let id: string;
  let answer: { status: number; body: unknown };
  // The mock dates its sample today, Turkey time, by its own clock: the
  // days before and after the call bound it, even across midnight.
  let daysAround: string[];

  beforeAll(async () => {
    id = await newReceipt(a);
    const before = istanbulDate(new Date());
    answer = await invoke(stack, a, "extract-receipt", { receipt_id: id });
    daysAround = [before, istanbulDate(new Date())];
  });

  it("answers with a draft marked mock", () => {
    expect(answer).toEqual({
      status: 200,
      body: { receipt_id: id, status: "needs_review", source: "mock" },
    });
  });

  it("stores a needs_review draft with source 'mock' and no error", async () => {
    const receipt = await receiptOf(a, id);
    expect(receipt).toMatchObject({
      status: "needs_review",
      source: "mock",
      error_code: null,
      store_name: "Örnek Market",
      total_kurus: 61235,
      unsure: [],
    });
    expect(daysAround).toContain(receipt?.purchased_on);
  });

  it("stores the mock's items in integer kuruş, in printed order", async () => {
    const items = await itemsOf(a, id);
    expect(items.map((item) => [item.line_no, item.amount_kurus])).toEqual([
      [1, 3450],
      [2, 8990],
      [3, 18900],
      [4, 4948],
      [5, 1500],
      [6, 13200],
      [7, 9997],
    ]);
    for (const item of items) {
      expect(typeof item.raw_text).toBe("string");
      expect(item.raw_text).not.toBe("");
    }
  });

  // ROADMAP v1 1: every item field is stored; an unreadable brand stays
  // null and keeps its unsure mark; sizes stay exact decimals.
  it("stores every item field, an unread brand as null with its mark", async () => {
    const items = await itemsOf(
      a,
      id,
      "brand,quantity::text,quantity_unit,package_size::text,package_size_unit,package_count,category,unsure",
    );
    expect(items[2]).toEqual({
      brand: null,
      quantity: null,
      quantity_unit: null,
      package_size: "500.000",
      package_size_unit: "g",
      package_count: 1,
      category: "food",
      unsure: ["brand"],
    });
    expect(items[3]).toMatchObject({
      quantity: "1.240",
      quantity_unit: "kg",
      package_size: null,
      package_count: null,
      unsure: [],
    });
  });

  it("keeps the reader's output as it came, next to the columns", async () => {
    const receipt = await receiptOf(a, id);
    expect(receipt?.extraction).toMatchObject({
      store: "Örnek Market",
      total_kurus: 61235,
      items: expect.arrayContaining([
        expect.objectContaining({
          raw_text: "B.PEYNIR TAM YAG 500G 189,00",
          brand: null,
          unsure: ["brand"],
        }),
      ]),
    });
  });
});

describe("a mock result that fails the schema", () => {
  let id: string;
  let answer: { status: number; body: unknown };

  beforeAll(async () => {
    id = await newReceipt(a);
    answer = await invoke(stack, a, "extract-receipt", {
      receipt_id: id,
      mock: "invalid",
    });
  });

  it("answers failed with an error code", () => {
    expect(answer).toEqual({
      status: 200,
      body: {
        receipt_id: id,
        status: "failed",
        source: "mock",
        error_code: "extraction_invalid",
      },
    });
  });

  it("leaves the receipt failed with the error code", async () => {
    expect(await receiptOf(a, id)).toMatchObject({
      status: "failed",
      error_code: "extraction_invalid",
      total_kurus: null,
    });
  });

  it("stores no items", async () => {
    expect(await itemsOf(a, id)).toEqual([]);
  });

  it("clears the items of an earlier draft when a re-read fails", async () => {
    const again = await newReceipt(a);
    await invoke(stack, a, "extract-receipt", { receipt_id: again });
    expect(await itemsOf(a, again)).toHaveLength(7);
    const failed = await invoke(stack, a, "extract-receipt", {
      receipt_id: again,
      mock: "invalid",
    });
    expect(failed.status).toBe(200);
    expect(await receiptOf(a, again)).toMatchObject({ status: "failed" });
    expect(await itemsOf(a, again)).toEqual([]);
  });
});

describe("a call for another user's receipt", () => {
  let id: string;

  beforeAll(async () => {
    id = await newReceipt(a);
  });

  it("is refused for B, and A's receipt is untouched", async () => {
    const answer = await invoke(stack, b, "extract-receipt", {
      receipt_id: id,
    });
    expect(answer.status).toBe(404);
    expect(await receiptOf(a, id)).toMatchObject({
      status: "uploading",
      source: null,
    });
    expect(await itemsOf(a, id)).toEqual([]);
  });

  it("is refused for B calling the write functions directly", async () => {
    const draft = await rest(stack, b, "POST", "rpc/record_extraction", {
      p_receipt_id: id,
      p_source: "mock",
      p_extraction: {
        store: "Sahte",
        date: null,
        total_kurus: 1,
        unsure: [],
        items: [{ raw_text: "SAHTE", name: null, amount_kurus: 1 }],
      },
    });
    expect(draft.status).toBeGreaterThanOrEqual(400);
    const failure = await rest(
      stack,
      b,
      "POST",
      "rpc/record_extraction_failure",
      {
        p_receipt_id: id,
        p_source: "mock",
        p_error_code: "extraction_invalid",
      },
    );
    expect(failure.status).toBeGreaterThanOrEqual(400);
    expect(await receiptOf(a, id)).toMatchObject({ status: "uploading" });
    expect(await itemsOf(a, id)).toEqual([]);
  });

  it("is refused without a signed-in user", async () => {
    const answer = await invoke(stack, null, "extract-receipt", {
      receipt_id: id,
    });
    expect(answer.status).toBe(401);
    expect(await receiptOf(a, id)).toMatchObject({ status: "uploading" });
  });
});
