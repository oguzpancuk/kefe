import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { download, rest, signUp, upload, type User } from "./api";
import { localStack, type LocalStack } from "./local-stack";

// ROADMAP walking skeleton 2: user B gets nothing of user A's receipts,
// items or images, anon gets nothing, and the same calls as A succeed.
// Failure looks like any row or object reaching B or anon.

const BUCKET = "receipts";
// A JPEG's first bytes; storage checks the declared type, not the pixels.
const IMAGE = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

let stack: LocalStack;
let a: User;
let b: User;
let receiptId: string;
let imagePath: string;
let aUploadStatus: number;

type Row = Record<string, unknown>;
const ids = (rows: unknown[]) => rows.map((row) => (row as Row).id);

beforeAll(async () => {
  stack = localStack();
  [a, b] = await Promise.all([signUp(stack), signUp(stack)]);

  receiptId = randomUUID();
  imagePath = `${a.id}/${receiptId}.jpg`;
  const receipt = await rest(stack, a, "POST", "receipts", {
    id: receiptId,
    idempotency_key: randomUUID(),
    image_path: imagePath,
  });
  if (receipt.rows.length !== 1) {
    throw new Error(`A could not create a receipt: HTTP ${receipt.status}`);
  }
  const item = await rest(stack, a, "POST", "receipt_items", {
    receipt_id: receiptId,
    raw_text: "EKMEK 1 AD 12,50",
    name: "Ekmek",
    amount_kurus: 1250,
  });
  if (item.rows.length !== 1) {
    throw new Error(`A could not add an item: HTTP ${item.status}`);
  }
  // Recorded, not thrown: A's own upload is one of the assertions below.
  aUploadStatus = await upload(stack, a, BUCKET, imagePath, IMAGE);
});

describe("user A, the owner", () => {
  it("reads the receipt and its item", async () => {
    const receipts = await rest(stack, a, "GET", `receipts?id=eq.${receiptId}`);
    expect(ids(receipts.rows)).toEqual([receiptId]);
    expect(receipts.rows[0]).toMatchObject({
      user_id: a.id,
      image_path: imagePath,
    });

    const items = await rest(
      stack,
      a,
      "GET",
      `receipt_items?receipt_id=eq.${receiptId}`,
    );
    expect(items.rows).toHaveLength(1);
    expect(items.rows[0]).toMatchObject({ amount_kurus: 1250 });
  });

  it("uploads and downloads the image in their own folder", async () => {
    expect(aUploadStatus).toBe(200);
    const image = await download(stack, a, BUCKET, imagePath);
    expect(image.status).toBe(200);
    expect(image.bytes).toEqual(IMAGE);
  });
});

describe("user B, another signed-in user", () => {
  it("selects none of A's receipts", async () => {
    const byId = await rest(stack, b, "GET", `receipts?id=eq.${receiptId}`);
    expect(byId.status).toBe(200);
    expect(byId.rows).toEqual([]);

    const all = await rest(stack, b, "GET", "receipts");
    expect(all.rows).toEqual([]);
  });

  it("selects none of A's items", async () => {
    const byReceipt = await rest(
      stack,
      b,
      "GET",
      `receipt_items?receipt_id=eq.${receiptId}`,
    );
    expect(byReceipt.status).toBe(200);
    expect(byReceipt.rows).toEqual([]);

    const all = await rest(stack, b, "GET", "receipt_items");
    expect(all.rows).toEqual([]);
  });

  it("is refused inserting an item into A's receipt", async () => {
    const insert = await rest(stack, b, "POST", "receipt_items", {
      receipt_id: receiptId,
      raw_text: "SAHTE",
      amount_kurus: 1,
    });
    expect(insert.status).toBeGreaterThanOrEqual(400);
    expect(insert.rows).toEqual([]);

    const aItems = await rest(
      stack,
      a,
      "GET",
      `receipt_items?receipt_id=eq.${receiptId}`,
    );
    expect(aItems.rows).toHaveLength(1);
  });

  it("changes and deletes nothing of A's receipt", async () => {
    const update = await rest(
      stack,
      b,
      "PATCH",
      `receipts?id=eq.${receiptId}`,
      { total_kurus: 1 },
    );
    expect(update.rows).toEqual([]);

    const remove = await rest(
      stack,
      b,
      "DELETE",
      `receipts?id=eq.${receiptId}`,
    );
    expect(remove.rows).toEqual([]);

    const aView = await rest(stack, a, "GET", `receipts?id=eq.${receiptId}`);
    expect(ids(aView.rows)).toEqual([receiptId]);
    expect(aView.rows[0]).toMatchObject({ total_kurus: null });
  });

  it("is refused creating a receipt in A's name or A's folder", async () => {
    const asA = await rest(stack, b, "POST", "receipts", {
      user_id: a.id,
      idempotency_key: randomUUID(),
    });
    expect(asA.status).toBeGreaterThanOrEqual(400);
    expect(asA.rows).toEqual([]);

    const inAFolder = await rest(stack, b, "POST", "receipts", {
      idempotency_key: randomUUID(),
      image_path: `${a.id}/${randomUUID()}.jpg`,
    });
    expect(inAFolder.status).toBeGreaterThanOrEqual(400);
    expect(inAFolder.rows).toEqual([]);
  });

  it("gets an error, not the bytes, downloading A's image", async () => {
    const image = await download(stack, b, BUCKET, imagePath);
    expect(image.status).toBeGreaterThanOrEqual(400);
    expect(image.bytes).toBeNull();
  });

  it("is refused uploading into A's folder", async () => {
    const status = await upload(
      stack,
      b,
      BUCKET,
      `${a.id}/${randomUUID()}.jpg`,
      IMAGE,
    );
    expect(status).toBeGreaterThanOrEqual(400);
  });
});

describe("anon, not signed in", () => {
  it("selects no receipts and no items", async () => {
    const receipts = await rest(stack, null, "GET", "receipts");
    expect(receipts.rows).toEqual([]);
    const items = await rest(stack, null, "GET", "receipt_items");
    expect(items.rows).toEqual([]);
  });

  it("is refused creating a receipt", async () => {
    const insert = await rest(stack, null, "POST", "receipts", {
      idempotency_key: randomUUID(),
    });
    expect(insert.status).toBeGreaterThanOrEqual(400);
    expect(insert.rows).toEqual([]);
  });

  it("gets an error downloading A's image, public URL included", async () => {
    const authenticated = await download(stack, null, BUCKET, imagePath);
    expect(authenticated.bytes).toBeNull();
    const viaPublicUrl = await download(stack, null, BUCKET, imagePath, {
      publicUrl: true,
    });
    expect(viaPublicUrl.bytes).toBeNull();
  });
});
