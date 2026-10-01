import {
  categories,
  decimalSchema,
  itemFields,
  measureUnits,
  monthRange,
  monthTotal,
  receiptFields,
  type Category,
  type ItemField,
  type Kurus,
  type Measure,
  type Month,
  type MonthTotal,
  type ReceiptField,
} from "@kefe/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// The receipt flow's calls: Fiş ekle → Kontrol et → Kaydet (ROADMAP
// walking skeleton 5). Screens call only these; every row read from
// Supabase passes a Zod schema first, and the UI never adds up money
// itself: totals come from @kefe/core.

/** A Turkish message for the alert box: a bold first sentence, a plain second. */
export type Failure = { title: string; detail: string };

type Result<T> = ({ ok: true } & T) | { ok: false; failure: Failure };

const BUCKET = "receipts";

// The types the private bucket accepts (supabase/migrations, receipts).
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/webp": "webp",
};

/** The picked photo as the image picker describes it. */
export type PickedImage = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
};

const TYPE_ALIASES: Record<string, string> = { "image/jpg": "image/jpeg" };

const TYPE_OF_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  webp: "image/webp",
};

function typeOfName(name: string | null | undefined): string | undefined {
  const extension = name?.split(/[?#]/)[0]?.split(".").pop()?.toLowerCase();
  return extension ? TYPE_OF_EXTENSION[extension] : undefined;
}

/**
 * The photo's type for Storage. The extension of the file that is
 * uploaded (`uri`) first: on iOS the picker converts to JPEG, while
 * `fileName` (and possibly `mimeType`) may still name the library's HEIC
 * original. Then the picker's type when it names a photo, then the file
 * name; else whatever the picker said, which `prepareReceipt` refuses.
 */
export function imageTypeOf(image: PickedImage): string | null {
  const given = image.mimeType
    ? (TYPE_ALIASES[image.mimeType] ?? image.mimeType)
    : undefined;
  return (
    typeOfName(image.uri) ??
    (given && EXTENSIONS[given] ? given : undefined) ??
    typeOfName(image.fileName) ??
    given ??
    null
  );
}

/** What a new receipt will be called before anything is sent. */
export type PreparedReceipt = {
  id: string;
  /** One per draft: a repeated create or save finds the same receipt. */
  idempotencyKey: string;
  imagePath: string;
  contentType: string;
};

/** Names the receipt and its image; refuses a file that is not a photo. */
export function prepareReceipt(
  userId: string,
  mimeType: string | null | undefined,
  newId: () => string,
): Result<{ receipt: PreparedReceipt }> {
  const extension = mimeType ? EXTENSIONS[mimeType] : undefined;
  if (!mimeType || !extension) {
    return {
      ok: false,
      failure: {
        title: "Bu dosya eklenemedi.",
        detail: "Fişin fotoğrafını seçin (JPEG, PNG, HEIC ya da WebP).",
      },
    };
  }
  const id = newId();
  return {
    ok: true,
    receipt: {
      id,
      idempotencyKey: newId(),
      imagePath: `${userId}/${id}.${extension}`,
      contentType: mimeType,
    },
  };
}

const sendFailed: Failure = {
  title: "Fiş gönderilemedi.",
  detail: "İnternet bağlantınızı kontrol edip tekrar deneyin.",
};

const readFailed: Failure = {
  title: "Fiş okunamadı.",
  detail: "Ana Sayfa'ya dönüp fişi yeniden ekleyin.",
};

const extractAnswerSchema = z.object({
  receipt_id: z.uuid(),
  status: z.enum(["needs_review", "failed"]),
});

/**
 * Uploads the image into the person's folder, creates the receipt with
 * its idempotency key, then asks `extract-receipt` (mock mode) to read it.
 * Ends when the draft is ready or the reading failed.
 */
export async function sendReceipt(
  client: SupabaseClient,
  receipt: PreparedReceipt,
  image: ArrayBuffer,
  _imageSha256?: string | null,
): Promise<Result<object>> {
  try {
    const upload = await client.storage
      .from(BUCKET)
      .upload(receipt.imagePath, image, { contentType: receipt.contentType });
    if (upload.error) return { ok: false, failure: sendFailed };

    const created = await client.from("receipts").insert({
      id: receipt.id,
      idempotency_key: receipt.idempotencyKey,
      image_path: receipt.imagePath,
    });
    if (created.error) return { ok: false, failure: sendFailed };

    const read = await client.functions.invoke("extract-receipt", {
      body: { receipt_id: receipt.id },
    });
    const answer = extractAnswerSchema.safeParse(read.data);
    if (read.error || !answer.success || answer.data.status !== "needs_review")
      return { ok: false, failure: readFailed };
    return { ok: true };
  } catch {
    return { ok: false, failure: sendFailed };
  }
}

const receiptRowSchema = z.object({
  id: z.uuid(),
  idempotency_key: z.uuid(),
  status: z.enum([
    "uploading",
    "queued",
    "processing",
    "needs_review",
    "saved",
    "failed",
  ]),
  source: z.enum(["mock", "ai"]).nullable(),
  store_name: z.string().nullable(),
  purchased_on: z.iso.date().nullable(),
  total_kurus: z.int().nullable(),
  unsure: z.array(z.enum(receiptFields)),
});

const unitSchema = z.enum(measureUnits).nullable();

/** A value and its unit columns: both set, or both null. */
function measureOf(
  value: string | null,
  unit: z.infer<typeof unitSchema>,
): Measure | null | undefined {
  if (value === null && unit === null) return null;
  if (value === null || unit === null) return undefined;
  return { value, unit };
}

const itemRowSchema = z
  .object({
    id: z.uuid(),
    raw_text: z.string(),
    name: z.string().nullable(),
    brand: z.string().nullable(),
    // numeric(12,3) asked for as text ("500.000"), never as a float.
    quantity: decimalSchema.nullable(),
    quantity_unit: unitSchema,
    package_size: decimalSchema.nullable(),
    package_size_unit: unitSchema,
    package_count: z.int().positive().nullable(),
    category: z.enum(categories).nullable(),
    amount_kurus: z.int(),
    unsure: z.array(z.enum(itemFields)),
  })
  .transform((row, context): DraftItem => {
    const quantity = measureOf(row.quantity, row.quantity_unit);
    const packageSize = measureOf(row.package_size, row.package_size_unit);
    if (quantity === undefined || packageSize === undefined) {
      context.addIssue({ code: "custom", message: "a measure lacks its unit" });
      return z.NEVER;
    }
    return {
      id: row.id,
      rawText: row.raw_text,
      name: row.name,
      brand: row.brand,
      quantity,
      packageSize,
      packageCount: row.package_count,
      category: row.category,
      amountKurus: row.amount_kurus,
      unsure: row.unsure,
    };
  });

const ITEM_COLUMNS =
  "id,line_no,raw_text,name,brand,quantity::text,quantity_unit," +
  "package_size::text,package_size_unit,package_count,category," +
  "amount_kurus,unsure";

/** One line of the receipt with all seven fields (PRD #5). */
export type DraftItem = {
  id: string;
  /** The line as printed on the receipt. */
  rawText: string;
  name: string | null;
  /** Null when unreadable: never guessed. */
  brand: string | null;
  /** Weighed or counted at the till ("1,24 kg"). */
  quantity: Measure | null;
  /** One package's size ("500 g"), apart from the number of packages. */
  packageSize: Measure | null;
  packageCount: number | null;
  category: Category | null;
  amountKurus: Kurus;
  /** Fields the reader was unsure of: shown as "Kontrol et". */
  unsure: ItemField[];
};

/** The receipt's own facts, as read or as the person corrected them. */
export type ReceiptFacts = {
  storeName: string | null;
  purchasedOn: string | null;
  /** The printed total; null when it could not be read. */
  totalKurus: Kurus | null;
  unsure: ReceiptField[];
};

export type Draft = ReceiptFacts & {
  id: string;
  idempotencyKey: string;
  status: z.infer<typeof receiptRowSchema>["status"];
  /** Read by the mock, not from the person's receipt: say so on screen. */
  isSample: boolean;
  items: DraftItem[];
};

const loadFailed: Failure = {
  title: "Fiş açılamadı.",
  detail: "İnternet bağlantınızı kontrol edip tekrar deneyin.",
};

/** Reads one receipt of the signed-in person with its items, in printed order. */
export async function loadDraft(
  client: SupabaseClient,
  id: string,
): Promise<Result<{ draft: Draft }>> {
  try {
    const receiptAnswer = await client
      .from("receipts")
      .select(
        "id,idempotency_key,status,source,store_name,purchased_on,total_kurus,unsure",
      )
      .eq("id", id);
    const receipts = z.array(receiptRowSchema).safeParse(receiptAnswer.data);
    if (receiptAnswer.error || !receipts.success)
      return { ok: false, failure: loadFailed };
    const receipt = receipts.data[0];
    if (!receipt) return { ok: false, failure: readFailed };

    const itemAnswer = await client
      .from("receipt_items")
      .select(ITEM_COLUMNS)
      .eq("receipt_id", id)
      .order("line_no", { ascending: true });
    const items = z.array(itemRowSchema).safeParse(itemAnswer.data);
    if (itemAnswer.error || !items.success)
      return { ok: false, failure: loadFailed };

    return {
      ok: true,
      draft: {
        id: receipt.id,
        idempotencyKey: receipt.idempotency_key,
        status: receipt.status,
        isSample: receipt.source === "mock",
        storeName: receipt.store_name,
        purchasedOn: receipt.purchased_on,
        totalKurus: receipt.total_kurus,
        unsure: receipt.unsure,
        items: items.data,
      },
    };
  } catch {
    return { ok: false, failure: loadFailed };
  }
}

// save_receipt returns the saved receipt as its only row.
const savedRowsSchema = z.tuple([
  z.object({ status: z.literal("saved"), total_kurus: z.int() }),
]);

/**
 * Saves the draft with what the person corrected: each changed item with
 * all its fields, and the receipt's facts when one of them changed.
 * Idempotent on the draft's key: a double tap or a retried request saves
 * it once. The saved total is the printed (or corrected) total, or the
 * items' sum when none was read.
 */
export async function saveReceipt(
  client: SupabaseClient,
  idempotencyKey: string,
  changes: { items: readonly DraftItem[]; receipt?: ReceiptFacts },
  _options: { allowDuplicate?: boolean } = {},
): Promise<Result<{ totalKurus: Kurus }>> {
  const failure: Failure = {
    title: "Fiş kaydedilemedi.",
    detail: "Biraz sonra tekrar deneyin.",
  };
  const facts = changes.receipt;
  try {
    const answer = await client.rpc("save_receipt", {
      p_idempotency_key: idempotencyKey,
      p_items: changes.items.map((item) => ({
        id: item.id,
        name: item.name,
        brand: item.brand,
        quantity: item.quantity,
        package_size: item.packageSize,
        package_count: item.packageCount,
        category: item.category,
        amount_kurus: item.amountKurus,
        unsure: item.unsure,
      })),
      p_receipt: facts
        ? {
            store_name: facts.storeName,
            purchased_on: facts.purchasedOn,
            total_kurus: facts.totalKurus,
            unsure: facts.unsure,
          }
        : {},
    });
    const rows = savedRowsSchema.safeParse(answer.data);
    if (answer.error || !rows.success) return { ok: false, failure };
    return { ok: true, totalKurus: rows.data[0].total_kurus };
  } catch {
    return { ok: false, failure };
  }
}

const PAGE = 1000;

const totalRowsSchema = z.array(
  z.object({
    status: z.string(),
    total_kurus: z.int().nullable(),
    purchased_on: z.iso.date().nullable(),
    saved_at: z.string().nullable(),
  }),
);

/**
 * The home screen's number: the signed-in person's saved receipts in
 * `month`, summed by @kefe/core (which also leaves out anything unsaved).
 */
export async function loadMonthTotal(
  client: SupabaseClient,
  month: Month,
): Promise<Result<{ total: MonthTotal }>> {
  try {
    // The month only: by the printed date, or, for a receipt whose date
    // was unreadable, by when it was saved (Turkey time), as core counts it.
    const range = monthRange(month);
    const inMonth =
      `and(purchased_on.gte.${range.firstDay},purchased_on.lt.${range.nextFirstDay}),` +
      `and(purchased_on.is.null,saved_at.gte.${range.startsAt},saved_at.lt.${range.endsAt})`;
    // PostgREST answers at most `max_rows` (1000) rows a call: read page
    // by page in a fixed order, so no receipt of the month is left out.
    const rows: z.infer<typeof totalRowsSchema> = [];
    for (let from = 0; ; from += PAGE) {
      const answer = await client
        .from("receipts")
        .select("status,total_kurus,purchased_on,saved_at")
        .eq("status", "saved")
        .or(inMonth)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      const page = totalRowsSchema.safeParse(answer.data);
      if (answer.error || !page.success)
        return { ok: false, failure: loadFailed };
      rows.push(...page.data);
      if (page.data.length < PAGE) break;
    }
    return { ok: true, total: monthTotal(rows, month) };
  } catch {
    return { ok: false, failure: loadFailed };
  }
}

// STUB (red run only): replaced by the real implementation.
export function retryReading(
  _client: SupabaseClient,
  _id: string,
): Promise<Result<object>> {
  return Promise.resolve({ ok: false, failure: readFailed });
}

export function hexOf(_digest: ArrayBuffer): string {
  return "";
}
