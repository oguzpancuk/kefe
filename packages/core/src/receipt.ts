import { z } from "zod";

/**
 * What an extraction adapter (the mock now, a real AI provider later)
 * must hand back before anything is stored. Amounts are integer kuruş;
 * a float, a text amount or a missing raw line fails the whole receipt,
 * so malformed output never becomes items. Unknown values are `null`,
 * never a guess. Receipt text is plain data here: nothing in it is
 * interpreted.
 */
export const extractedItemSchema = z.object({
  // The line as printed; kept next to the values read from it.
  raw_text: z.string().trim().min(1).max(500),
  name: z.string().trim().min(1).max(200).nullable(),
  // Negative for a discount or return line.
  amount_kurus: z.int(),
});

export const extractedReceiptSchema = z.object({
  store: z.string().trim().min(1).max(200).nullable(),
  // ISO calendar date (YYYY-MM-DD), checked for a real day.
  date: z.iso.date().nullable(),
  total_kurus: z.int().nonnegative().nullable(),
  items: z.array(extractedItemSchema).min(1).max(500),
});

export type ExtractedItem = z.infer<typeof extractedItemSchema>;
export type ExtractedReceipt = z.infer<typeof extractedReceiptSchema>;

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
