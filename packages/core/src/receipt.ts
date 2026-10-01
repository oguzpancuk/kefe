import { z } from "zod";
import { MAX_PACKAGE_COUNT, measureSchema } from "./measure.ts";

/**
 * What an extraction adapter (the mock now, a real AI provider later)
 * must hand back before anything is stored. Amounts are integer kuruş;
 * a float, a text amount or a missing raw line fails the whole receipt,
 * so malformed output never becomes items. Unknown values are `null`,
 * never a guess. Receipt text is plain data here: nothing in it is
 * interpreted.
 */
/** The six starting categories (PRD open question 8), stored by code. */
export const categories = [
  "food",
  "cleaning",
  "personal_care",
  "clothing",
  "home",
  "other",
] as const;
export type Category = (typeof categories)[number];

export const categoryLabels: Record<Category, string> = {
  food: "Gıda",
  cleaning: "Temizlik",
  personal_care: "Kişisel Bakım",
  clothing: "Giyim",
  home: "Ev",
  other: "Diğer",
};

/** An item's seven fields, as named in unsure marks. */
export const itemFields = [
  "name",
  "brand",
  "quantity",
  "package_size",
  "package_count",
  "category",
  "amount",
] as const;
export type ItemField = (typeof itemFields)[number];

/** The fields under the closed "Diğer bilgiler" on the item edit view. */
export const otherInfoFields = [
  "brand",
  "quantity",
  "package_size",
  "package_count",
  "category",
] as const satisfies readonly ItemField[];

export const receiptFields = ["store", "date", "total"] as const;
export type ReceiptField = (typeof receiptFields)[number];

// Fields a reader leaves out are unknown (`null`), never a guess.
const unknown = <T extends z.ZodType>(schema: T) =>
  schema.nullable().default(null);

// The reader's "Kontrol et" marks: each field at most once.
const unsureOf = <T extends readonly [string, ...string[]]>(fields: T) =>
  z
    .array(z.enum(fields))
    .max(fields.length)
    .default([])
    .transform((marks) => [...new Set(marks)]);

export const extractedItemSchema = z.object({
  // The line as printed; kept next to the values read from it.
  raw_text: z.string().trim().min(1).max(500),
  name: z.string().trim().min(1).max(200).nullable(),
  // A blank brand is an unread one: null, not an empty name.
  brand: unknown(z.string().trim().max(200)).transform((brand) =>
    brand === "" ? null : brand,
  ),
  // What was weighed or counted at the till ("1,24 kg" of tomatoes).
  quantity: unknown(measureSchema),
  // The size of one package ("500 g"), apart from how many were bought.
  package_size: unknown(measureSchema),
  package_count: unknown(z.int().min(1).max(MAX_PACKAGE_COUNT)),
  category: unknown(z.enum(categories)),
  // Negative for a discount or return line.
  amount_kurus: z.int(),
  unsure: unsureOf(itemFields),
});

export const extractedReceiptSchema = z.object({
  store: z.string().trim().min(1).max(200).nullable(),
  // ISO calendar date (YYYY-MM-DD), checked for a real day.
  date: z.iso.date().nullable(),
  total_kurus: z.int().nonnegative().nullable(),
  items: z.array(extractedItemSchema).min(1).max(500),
  unsure: unsureOf(receiptFields),
});

export type ExtractedItem = z.infer<typeof extractedItemSchema>;
export type ExtractedReceipt = z.infer<typeof extractedReceiptSchema>;
/** What an adapter may send: defaulted fields may be left out. */
export type ExtractionInput = z.input<typeof extractedReceiptSchema>;

/** Why a receipt ended `failed`; stored on the receipt, never shown raw. */
export const extractionErrorCodes = [
  // The adapter answered, but its output failed the schema.
  "extraction_invalid",
  // The adapter did not answer (threw, timed out, provider error).
  "extraction_failed",
] as const;
export type ExtractionErrorCode = (typeof extractionErrorCodes)[number];

export type ExtractionResult =
  | { ok: true; receipt: ExtractedReceipt }
  | { ok: false; errorCode: "extraction_invalid" };

/**
 * Validates an adapter's raw output. The schema's issues are not
 * returned: they quote receipt content, which must not reach logs.
 */
export function parseExtraction(raw: unknown): ExtractionResult {
  const parsed = extractedReceiptSchema.safeParse(raw);
  return parsed.success
    ? { ok: true, receipt: parsed.data }
    : { ok: false, errorCode: "extraction_invalid" };
}
