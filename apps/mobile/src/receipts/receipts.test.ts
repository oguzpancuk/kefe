import { describe, expect, it, vi } from "vitest";
import { createKefeClient } from "../supabase/client";
import {
  imageTypeOf,
  loadDraft,
  loadMonthTotal,
  prepareReceipt,
  saveReceipt,
  sendReceipt,
} from "./receipts";

// The app's side of ROADMAP walking skeleton 5 against a stubbed backend:
// what it sends to Storage, PostgREST and extract-receipt, and what it
// makes of the answers. The backend's own behaviour (idempotent save,
// drafts never counted) is tested in supabase/tests/save-receipt.test.ts.

const env = { url: "http://127.0.0.1:54321", anonKey: "anon-key" };
const USER = "00000000-0000-4000-8000-00000000000a";
const RECEIPT = "10000000-0000-4000-8000-000000000001";
const KEY = "20000000-0000-4000-8000-000000000001";
const ITEM_1 = "30000000-0000-4000-8000-000000000001";
const ITEM_2 = "30000000-0000-4000-8000-000000000002";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Call = { method: string; url: URL; body: unknown };

/** A client whose every request goes to `answer`; `calls` records them. */
function setup(answer: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = init?.body;
    const call: Call = {
      method: init?.method ?? "GET",
      url: new URL(String(input)),
      body: typeof raw === "string" ? JSON.parse(raw) : raw,
    };
    calls.push(call);
    return answer(call);
  });
  const client = createKefeClient(env, {
    fetch: fetch as unknown as typeof globalThis.fetch,
    autoRefreshToken: false,
    storage: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    },
  });
  return { client, calls };
}

const draftRow = {
  id: RECEIPT,
  idempotency_key: KEY,
  status: "needs_review",
  source: "mock",
  store_name: "Örnek Market",
  purchased_on: "2026-09-29",
  total_kurus: 4990,
  unsure: ["date"],
};

const itemRows = [
  {
    id: ITEM_1,
    line_no: 1,
    raw_text: "EKMEK 1 AD 12,50",
    name: "Ekmek",
    brand: null,
    quantity: null,
    quantity_unit: null,
    package_size: null,
    package_size_unit: null,
    package_count: 1,
    category: "food",
    amount_kurus: 1250,
    unsure: [],
  },
  {
    id: ITEM_2,
    line_no: 2,
    raw_text: "B.PEYNIR 500G 34,90",
    name: "Beyaz peynir",
    brand: null,
    // numeric(12,3) read as text: exact, never a float.
    quantity: "0.500",
    quantity_unit: "kg",
    package_size: "500.000",
    package_size_unit: "g",
    package_count: null,
    category: null,
    amount_kurus: 3490,
    unsure: ["brand", "amount"],
  },
];

describe("prepareReceipt", () => {
  it("puts the image under the person's folder and makes one key per draft", () => {
    const ids = [RECEIPT, KEY];
    const prepared = prepareReceipt(
      USER,
      "image/jpeg",
      () => ids.shift() ?? "",
    );
    expect(prepared).toEqual({
      ok: true,
      receipt: {
        id: RECEIPT,
        idempotencyKey: KEY,
        imagePath: `${USER}/${RECEIPT}.jpg`,
        contentType: "image/jpeg",
      },
    });
  });

  it("refuses a file that is not a photo before anything is sent", () => {
    const prepared = prepareReceipt(USER, "application/pdf", () => RECEIPT);
    expect(prepared).toEqual({
      ok: false,
      failure: {
        title: "Bu dosya eklenemedi.",
        detail: "Fişin fotoğrafını seçin (JPEG, PNG, HEIC ya da WebP).",
      },
    });
  });
});

describe("imageTypeOf", () => {
  it("takes the picker's type when it names a photo", () => {
    expect(
      imageTypeOf({ uri: "file:///tmp/a.png", mimeType: "image/png" }),
    ).toBe("image/png");
  });

  it("reads the file name when iOS gives no type", () => {
    expect(
      imageTypeOf({
        uri: "file:///var/mobile/ImagePicker/5F1C.JPG",
        fileName: "IMG_0001.JPG",
      }),
    ).toBe("image/jpeg");
  });

  it("reads the uploaded file, not the library's original name", () => {
    expect(
      imageTypeOf({
        uri: "file:///var/mobile/ImagePicker/5F1C.jpg",
        fileName: "IMG_0001.HEIC",
      }),
    ).toBe("image/jpeg");
  });

  it("trusts the uploaded file over a type it no longer has", () => {
    expect(
      imageTypeOf({
        uri: "file:///var/mobile/ImagePicker/5F1C.jpg",
        mimeType: "image/heic",
        fileName: "IMG_0001.HEIC",
      }),
    ).toBe("image/jpeg");
  });

  it("reads the name when the address has no extension", () => {
    expect(
      imageTypeOf({
        uri: "blob:http://localhost:8081/5f1c",
        fileName: "a.png",
      }),
    ).toBe("image/png");
  });

  it("reads the address when there is neither type nor name", () => {
    expect(
      imageTypeOf({ uri: "file:///var/mobile/ImagePicker/5F1C.heic" }),
    ).toBe("image/heic");
  });

  it("names a JPEG image/jpeg whatever the picker called it", () => {
    expect(
      imageTypeOf({ uri: "file:///tmp/a.jpeg", mimeType: "image/jpg" }),
    ).toBe("image/jpeg");
  });

  it("keeps a type that is not a photo, so the receipt is refused", () => {
    const type = imageTypeOf({
      uri: "file:///tmp/fatura.pdf",
      mimeType: "application/pdf",
      fileName: "fatura.pdf",
    });
    expect(type).toBe("application/pdf");
    expect(prepareReceipt(USER, type, () => RECEIPT).ok).toBe(false);
  });

  it("gives null when nothing tells the type", () => {
    expect(imageTypeOf({ uri: "file:///tmp/receipt" })).toBeNull();
  });
});

describe("sendReceipt", () => {
  const receipt = {
    id: RECEIPT,
    idempotencyKey: KEY,
    imagePath: `${USER}/${RECEIPT}.jpg`,
    contentType: "image/jpeg",
  };
  const image = new Uint8Array([0xff, 0xd8, 0xff]).buffer;

  it("uploads, creates the receipt with its key, then asks for the reading", async () => {
    const { client, calls } = setup((call) => {
      if (call.url.pathname.startsWith("/storage/"))
        return json(200, { Key: `receipts/${receipt.imagePath}` });
      if (call.url.pathname === "/rest/v1/receipts") return json(201, []);
      return json(200, {
        receipt_id: RECEIPT,
        status: "needs_review",
        source: "mock",
      });
    });

    expect(await sendReceipt(client, receipt, image)).toEqual({ ok: true });
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      `POST /storage/v1/object/receipts/${USER}/${RECEIPT}.jpg`,
      "POST /rest/v1/receipts",
      "POST /functions/v1/extract-receipt",
    ]);
    expect(calls[1]?.body).toEqual({
      id: RECEIPT,
      idempotency_key: KEY,
      image_path: `${USER}/${RECEIPT}.jpg`,
    });
    expect(calls[2]?.body).toEqual({ receipt_id: RECEIPT });
  });

  it("stops after a refused upload, with a plain message", async () => {
    const { client, calls } = setup(() =>
      json(400, { statusCode: "413", error: "Payload too large" }),
    );
    expect(await sendReceipt(client, receipt, image)).toEqual({
      ok: false,
      failure: {
        title: "Fiş gönderilemedi.",
        detail: "İnternet bağlantınızı kontrol edip tekrar deneyin.",
      },
    });
    expect(calls).toHaveLength(1);
  });

  it("says the receipt could not be read when the reading fails", async () => {
    const { client } = setup((call) => {
      if (call.url.pathname.startsWith("/functions/"))
        return json(200, {
          receipt_id: RECEIPT,
          status: "failed",
          source: "mock",
          error_code: "extraction_invalid",
        });
      return json(201, []);
    });
    expect(await sendReceipt(client, receipt, image)).toEqual({
      ok: false,
      failure: {
        title: "Fiş okunamadı.",
        detail: "Ana Sayfa'ya dönüp fişi yeniden ekleyin.",
      },
    });
  });
});

describe("loadDraft", () => {
  it("reads the draft and its items in printed order, marked as a mock", async () => {
    const { client, calls } = setup((call) =>
      json(
        200,
        call.url.pathname === "/rest/v1/receipts" ? [draftRow] : itemRows,
      ),
    );
    expect(await loadDraft(client, RECEIPT)).toEqual({
      ok: true,
      draft: {
        id: RECEIPT,
        idempotencyKey: KEY,
        status: "needs_review",
        isSample: true,
        storeName: "Örnek Market",
        purchasedOn: "2026-09-29",
        totalKurus: 4990,
        unsure: ["date"],
        items: [
          {
            id: ITEM_1,
            rawText: "EKMEK 1 AD 12,50",
            name: "Ekmek",
            brand: null,
            quantity: null,
            packageSize: null,
            packageCount: 1,
            category: "food",
            amountKurus: 1250,
            unsure: [],
          },
          {
            id: ITEM_2,
            rawText: "B.PEYNIR 500G 34,90",
            name: "Beyaz peynir",
            brand: null,
            quantity: { value: "0.5", unit: "kg" },
            packageSize: { value: "500", unit: "g" },
            packageCount: null,
            category: null,
            amountKurus: 3490,
            unsure: ["brand", "amount"],
          },
        ],
      },
    });
    expect(calls[1]?.url.searchParams.get("order")).toBe("line_no.asc");
    // Decimals are asked for as text, so they never pass through a float.
    expect(calls[1]?.url.searchParams.get("select")).toContain(
      "quantity::text",
    );
    expect(calls[1]?.url.searchParams.get("select")).toContain(
      "package_size::text",
    );
  });

  it.each([
    ["a size without its unit", { package_size_unit: null }],
    ["an unknown category", { category: "Gıda" }],
    ["a size as a float", { package_size: 0.5 }],
  ])("refuses an item row with %s", async (_case, change) => {
    const { client } = setup((call) =>
      json(
        200,
        call.url.pathname === "/rest/v1/receipts"
          ? [draftRow]
          : [{ ...itemRows[1], ...change }],
      ),
    );
    expect(await loadDraft(client, RECEIPT)).toMatchObject({ ok: false });
  });

  it("refuses rows that fail the schema instead of showing them", async () => {
    const { client } = setup((call) =>
      json(
        200,
        call.url.pathname === "/rest/v1/receipts"
          ? [draftRow]
          : [{ ...itemRows[0], amount_kurus: 12.5 }],
      ),
    );
    expect(await loadDraft(client, RECEIPT)).toMatchObject({ ok: false });
  });
});

describe("saveReceipt", () => {
  it("sends the draft's key, every field of each changed item and the receipt's facts", async () => {
    const { client, calls } = setup(() =>
      json(200, [{ ...draftRow, status: "saved", total_kurus: 5240 }]),
    );
    const result = await saveReceipt(client, KEY, {
      items: [
        {
          id: ITEM_2,
          rawText: "B.PEYNIR 500G 34,90",
          name: "Beyaz peynir",
          brand: "Köy",
          quantity: null,
          packageSize: { value: "250", unit: "g" },
          packageCount: 2,
          category: "food",
          amountKurus: 3740,
          unsure: [],
        },
      ],
      receipt: {
        storeName: "Bakkal",
        purchasedOn: "2026-09-28",
        totalKurus: 5240,
        unsure: [],
      },
    });
    expect(result).toEqual({ ok: true, totalKurus: 5240 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.pathname).toBe("/rest/v1/rpc/save_receipt");
    expect(calls[0]?.body).toEqual({
      p_idempotency_key: KEY,
      p_items: [
        {
          id: ITEM_2,
          name: "Beyaz peynir",
          brand: "Köy",
          quantity: null,
          package_size: { value: "250", unit: "g" },
          package_count: 2,
          category: "food",
          amount_kurus: 3740,
          unsure: [],
        },
      ],
      p_receipt: {
        store_name: "Bakkal",
        purchased_on: "2026-09-28",
        total_kurus: 5240,
        unsure: [],
      },
    });
  });

  it("leaves the receipt's facts out when nothing on them changed", async () => {
    const { client, calls } = setup(() =>
      json(200, [{ ...draftRow, status: "saved", total_kurus: 4990 }]),
    );
    await saveReceipt(client, KEY, { items: [] });
    expect(calls[0]?.body).toEqual({
      p_idempotency_key: KEY,
      p_items: [],
      p_receipt: {},
    });
  });

  it("reports a refused save in Turkish", async () => {
    const { client } = setup(() =>
      json(400, { code: "22023", message: "an item is not on this receipt" }),
    );
    expect(await saveReceipt(client, KEY, { items: [] })).toEqual({
      ok: false,
      failure: {
        title: "Fiş kaydedilemedi.",
        detail: "Biraz sonra tekrar deneyin.",
      },
    });
  });
});

describe("loadMonthTotal", () => {
  it("asks for saved receipts only and sums the month with @kefe/core", async () => {
    const { client, calls } = setup(() =>
      json(200, [
        {
          status: "saved",
          total_kurus: 8890,
          purchased_on: "2026-09-29",
          saved_at: "2026-09-30T09:00:00+00:00",
        },
        {
          status: "saved",
          total_kurus: 700,
          purchased_on: "2026-08-31",
          saved_at: "2026-09-30T09:00:00+00:00",
        },
      ]),
    );
    expect(await loadMonthTotal(client, "2026-09")).toEqual({
      ok: true,
      total: { totalKurus: 8890, count: 1 },
    });
    expect(calls[0]?.url.searchParams.get("status")).toBe("eq.saved");
  });

  it("asks only for the month, by printed date or else by when it was saved", async () => {
    const { client, calls } = setup(() => json(200, []));
    await loadMonthTotal(client, "2026-09");
    expect(calls[0]?.url.searchParams.get("or")).toBe(
      "(and(purchased_on.gte.2026-09-01,purchased_on.lt.2026-10-01)," +
        "and(purchased_on.is.null,saved_at.gte.2026-08-31T21:00:00.000Z,saved_at.lt.2026-09-30T21:00:00.000Z))",
    );
  });

  it("reads every page, so a month past the row cap is not cut short", async () => {
    const row = {
      status: "saved",
      total_kurus: 100,
      purchased_on: "2026-09-29",
      saved_at: "2026-09-30T09:00:00+00:00",
    };
    const { client, calls } = setup((call) => {
      const offset = Number(call.url.searchParams.get("offset") ?? 0);
      return json(
        200,
        Array.from({ length: offset === 0 ? 1000 : 1 }, () => row),
      );
    });
    expect(await loadMonthTotal(client, "2026-09")).toEqual({
      ok: true,
      total: { totalKurus: 100100, count: 1001 },
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url.searchParams.get("order")).toBe("id.asc");
  });

  it("shows no number when a row fails the schema", async () => {
    const { client } = setup(() =>
      json(200, [{ status: "saved", total_kurus: "88,90" }]),
    );
    expect(await loadMonthTotal(client, "2026-09")).toMatchObject({
      ok: false,
    });
  });
});
