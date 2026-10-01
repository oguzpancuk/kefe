import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  istanbulMonth,
  monthRange,
  monthTotal,
  type Month,
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

// The mock's printed total; its items add up to 2,50 TL less (60985).
const MOCK_TOTAL = 61235;
const MOCK_AMOUNTS = [3450, 8990, 18900, 4948, 1500, 13200, 9997];

// `month` is the month of the draft's printed date, read back: the mock
// dates its sample by its own clock, so a run across midnight still
// compares like with like.
type Draft = { id: string; key: string; items: Row[]; month: Month };

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
  const receipt = (await receiptsOf(owner)).find((row) => row.id === id);
  const purchasedOn = receipt?.purchased_on;
  if (typeof purchasedOn !== "string") {
    throw new Error("the mock draft has no printed date");
  }
  return {
    id,
    key,
    items: await itemsOf(owner, id),
    month: purchasedOn.slice(0, 7),
  };
}

async function itemsOf(owner: User, id: string, select = "*"): Promise<Row[]> {
  const { status, rows } = await rest(
    stack,
    owner,
    "GET",
    `receipt_items?select=${select}&receipt_id=eq.${id}&order=line_no`,
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

/**
 * The home screen's number, read the way the app reads it
 * (apps/mobile/src/receipts/receipts.ts, loadMonthTotal): saved receipts
 * of the month by printed date, or by `saved_at` when the date is
 * unknown, summed by @kefe/core.
 */
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

const save = (
  caller: User,
  key: string,
  items: unknown[] = [],
  receipt: Record<string, unknown> = {},
) =>
  rest(stack, caller, "POST", "rpc/save_receipt", {
    p_idempotency_key: key,
    p_items: items,
    p_receipt: receipt,
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
    expect(await homeTotal(a, draft.month)).toEqual({
      totalKurus: 0,
      count: 0,
    });
  });
});

describe("saving a draft with one amount corrected", () => {
  let draft: Draft;
  let first: { status: number; rows: unknown[] };
  // 34,50 → 37,00 on the first line: the items now add up to the total.
  const EDITED = [3700, ...MOCK_AMOUNTS.slice(1)];

  beforeAll(async () => {
    draft = await newDraft(a);
    first = await save(a, draft.key, [
      { id: draft.items[0]?.id, amount_kurus: 3700 },
    ]);
  });

  // ROADMAP v1 1: the printed total is the receipt's total; the items no
  // longer overwrite it (step 5 saved their sum).
  it("answers with the saved receipt and its printed total", () => {
    expect(first.status).toBe(200);
    expect(first.rows).toEqual([
      expect.objectContaining({
        id: draft.id,
        status: "saved",
        total_kurus: MOCK_TOTAL,
      }),
    ]);
  });

  it("stores the edited amount and keeps the line as printed", async () => {
    const items = await itemsOf(a, draft.id);
    expect(items.map((item) => item.amount_kurus)).toEqual(EDITED);
    expect(items[0]).toMatchObject({ raw_text: "SUT TAM YAGLI 1 LT 34,50" });
  });

  it("moves the month total by exactly the saved total", async () => {
    expect(await homeTotal(a, draft.month)).toEqual({
      totalKurus: MOCK_TOTAL,
      count: 1,
    });
  });

  it("counts it once when the same key is saved again, even with other edits", async () => {
    const again = await save(
      a,
      draft.key,
      [{ id: draft.items[1]?.id, amount_kurus: 1 }],
      { total_kurus: 1 },
    );
    expect(again.status).toBe(200);
    expect(again.rows).toEqual([
      expect.objectContaining({ id: draft.id, total_kurus: MOCK_TOTAL }),
    ]);
    const items = await itemsOf(a, draft.id);
    expect(items.map((item) => item.amount_kurus)).toEqual(EDITED);
    const saved = (await receiptsOf(a)).filter((r) => r.status === "saved");
    expect(saved).toHaveLength(1);
    expect(await homeTotal(a, draft.month)).toEqual({
      totalKurus: MOCK_TOTAL,
      count: 1,
    });
  });
});

// ROADMAP v1 1 / PRD #5: every listed field can be changed and the change
// survives save and reopen; the reader's output stays as it came.
describe("saving a draft with every field corrected", () => {
  let reader: User;
  let draft: Draft;
  let answer: { status: number; rows: unknown[] };

  beforeAll(async () => {
    const user = await signUp(stack);
    draft = await newDraft(user);
    answer = await save(
      user,
      draft.key,
      [
        {
          id: draft.items[2]?.id,
          name: "Tam yağlı beyaz peynir",
          brand: "Köy",
          quantity: { value: "0.5", unit: "kg" },
          package_size: { value: "250", unit: "g" },
          package_count: 2,
          category: "other",
          amount_kurus: 19150,
          unsure: [],
        },
      ],
      {
        store_name: "Mahalle Bakkalı",
        purchased_on: "2026-09-28",
        total_kurus: 61485,
        unsure: [],
      },
    );
    reader = user;
  });

  it("saves with the corrected total", () => {
    expect(answer.status).toBe(200);
    expect(answer.rows).toEqual([
      expect.objectContaining({
        status: "saved",
        store_name: "Mahalle Bakkalı",
        purchased_on: "2026-09-28",
        total_kurus: 61485,
      }),
    ]);
  });

  it("reads every corrected item field back", async () => {
    const items = await itemsOf(
      reader,
      draft.id,
      "raw_text,name,brand,quantity::text,quantity_unit,package_size::text,package_size_unit,package_count,category,amount_kurus,unsure",
    );
    expect(items[2]).toEqual({
      raw_text: "B.PEYNIR TAM YAG 500G 189,00",
      name: "Tam yağlı beyaz peynir",
      brand: "Köy",
      quantity: "0.500",
      quantity_unit: "kg",
      package_size: "250.000",
      package_size_unit: "g",
      package_count: 2,
      category: "other",
      amount_kurus: 19150,
      unsure: [],
    });
    // The other items keep what was read.
    expect(items[0]).toMatchObject({ name: "Süt", amount_kurus: 3450 });
  });

  it("keeps the reader's output unchanged next to the corrections", async () => {
    const { rows } = await rest(
      stack,
      reader,
      "GET",
      `receipts?select=extraction&id=eq.${draft.id}`,
    );
    expect(rows[0]).toMatchObject({
      extraction: { store: "Örnek Market", total_kurus: MOCK_TOTAL },
    });
  });

  it("counts the corrected total in the corrected date's month", async () => {
    expect(await homeTotal(reader, "2026-09")).toEqual({
      totalKurus: 61485,
      count: 1,
    });
  });
});

describe("a draft whose total was not read", () => {
  it("is saved with the items' sum", async () => {
    const user = await signUp(stack);
    const draft = await newDraft(user);
    const reread = await rest(stack, user, "POST", "rpc/record_extraction", {
      p_receipt_id: draft.id,
      p_source: "mock",
      p_extraction: {
        store: null,
        date: null,
        total_kurus: null,
        unsure: ["total"],
        items: [
          { raw_text: "EKMEK 15,00", name: "Ekmek", amount_kurus: 1500 },
          { raw_text: "SU 7,00", name: "Su", amount_kurus: 700 },
        ],
      },
    });
    expect(reread.status).toBeLessThan(300);
    const answer = await save(user, draft.key);
    expect(answer.rows).toEqual([
      expect.objectContaining({ status: "saved", total_kurus: 2200 }),
    ]);
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
    expect(await homeTotal(user, draft.month)).toEqual({
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
      amount_kurus: 3450,
    });
    expect(await homeTotal(user, draft.month)).toEqual({
      totalKurus: 0,
      count: 0,
    });
  });

  it("refuses an amount that is not whole kuruş", async () => {
    const user = await signUp(stack);
    const draft = await newDraft(user);
    const answer = await save(user, draft.key, [
      { id: draft.items[0]?.id, amount_kurus: 12.5 },
    ]);
    expect(answer.status).toBeGreaterThanOrEqual(400);
    expect(await homeTotal(user, draft.month)).toEqual({
      totalKurus: 0,
      count: 0,
    });
  });

  it.each([
    [
      "a size with four decimals",
      { package_size: { value: "1.2345", unit: "kg" } },
    ],
    ["a size given as a number", { package_size: { value: 1.5, unit: "kg" } }],
    ["an unknown unit", { quantity: { value: "1", unit: "kutu" } }],
    ["an unknown category", { category: "Gıda" }],
    ["zero packages", { package_count: 0 }],
    ["an unknown unsure mark", { unsure: ["renk"] }],
  ])("refuses %s and saves nothing", async (_case, fields) => {
    const user = await signUp(stack);
    const draft = await newDraft(user);
    const answer = await save(user, draft.key, [
      { id: draft.items[0]?.id, amount_kurus: 3450, ...fields },
    ]);
    expect(answer.status).toBeGreaterThanOrEqual(400);
    expect(await homeTotal(user, draft.month)).toEqual({
      totalKurus: 0,
      count: 0,
    });
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
    // Nothing of this user is saved, so no month has a total.
    const all = await receiptsOf(user);
    expect(all.every((r) => r.status !== "saved")).toBe(true);
    expect(await homeTotal(user, istanbulMonth(new Date()))).toEqual({
      totalKurus: 0,
      count: 0,
    });
  });

  it("refuses B saving A's draft, and A's draft stays a draft", async () => {
    const draft = await newDraft(a);
    const before = await homeTotal(a, draft.month);
    const answer = await save(b, draft.key);
    expect(answer.status).toBeGreaterThanOrEqual(400);
    const rows = await receiptsOf(a);
    expect(rows.find((row) => row.id === draft.id)).toMatchObject({
      status: "needs_review",
    });
    expect(await homeTotal(a, draft.month)).toEqual(before);
    expect(await homeTotal(b, draft.month)).toEqual({
      totalKurus: 0,
      count: 0,
    });
  });
});
