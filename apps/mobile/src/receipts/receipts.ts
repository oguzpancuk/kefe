import {
  monthRange,
  monthTotal,
  type Kurus,
  type Month,
  type MonthTotal,
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
 * The photo's type for Storage. The picker's own type when it names a
 * photo; else the file name's or the address's extension (iOS may leave
 * the type out); else whatever the picker said, which `prepareReceipt`
 * then refuses.
 */
export function imageTypeOf(image: PickedImage): string | null {
  const given = image.mimeType
    ? (TYPE_ALIASES[image.mimeType] ?? image.mimeType)
    : undefined;
  if (given && EXTENSIONS[given]) return given;
  return typeOfName(image.fileName) ?? typeOfName(image.uri) ?? given ?? null;
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
});

const itemRowSchema = z.object({
  id: z.uuid(),
  raw_text: z.string(),
  name: z.string().nullable(),
  amount_kurus: z.int(),
});

export type DraftItem = {
  id: string;
  /** The line as printed on the receipt. */
  rawText: string;
  name: string | null;
  amountKurus: Kurus;
};

export type Draft = {
  id: string;
  idempotencyKey: string;
  status: z.infer<typeof receiptRowSchema>["status"];
  /** Read by the mock, not from the person's receipt: say so on screen. */
  isSample: boolean;
  storeName: string | null;
  purchasedOn: string | null;
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
        "id,idempotency_key,status,source,store_name,purchased_on,total_kurus",
      )
      .eq("id", id);
    const receipts = z.array(receiptRowSchema).safeParse(receiptAnswer.data);
    if (receiptAnswer.error || !receipts.success)
      return { ok: false, failure: loadFailed };
    const receipt = receipts.data[0];
    if (!receipt) return { ok: false, failure: readFailed };

    const itemAnswer = await client
      .from("receipt_items")
      .select("id,line_no,raw_text,name,amount_kurus")
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
        items: items.data.map((item) => ({
          id: item.id,
          rawText: item.raw_text,
          name: item.name,
          amountKurus: item.amount_kurus,
        })),
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
 * Saves the draft with the amounts the person corrected. Idempotent on
 * the draft's key: a double tap or a retried request saves it once.
 */
export async function saveReceipt(
  client: SupabaseClient,
  idempotencyKey: string,
  edits: readonly { id: string; amountKurus: Kurus }[],
): Promise<Result<{ totalKurus: Kurus }>> {
  const failure: Failure = {
    title: "Fiş kaydedilemedi.",
    detail: "Biraz sonra tekrar deneyin.",
  };
  try {
    const answer = await client.rpc("save_receipt", {
      p_idempotency_key: idempotencyKey,
      p_items: edits.map((edit) => ({
        id: edit.id,
        amount_kurus: edit.amountKurus,
      })),
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
