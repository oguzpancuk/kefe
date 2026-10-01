import { z } from "zod";

/**
 * Quantities and package sizes are decimals kept as strings ("1.24"),
 * never floats: canonical form is digits, optionally "." and one to three
 * decimals, no trailing zeros, always above zero. People write them the
 * Turkish way ("1,24 kg"). Package size and number of packages are
 * separate fields (CLAUDE.md, Standards).
 */
export type Decimal = string;

/** A Turkish entry that cannot be read; the screen says how to write it. */
export class InvalidInputError extends Error {
  constructor(what: string, input: string) {
    super(`Not ${what}: ${JSON.stringify(input)}`);
    this.name = "InvalidInputError";
  }
}

export const measureUnits = ["g", "kg", "ml", "l", "adet"] as const;
export type MeasureUnit = (typeof measureUnits)[number];

/** A weighed quantity ("1,24 kg") or a package size ("500 g", "15 adet"). */
export type Measure = { value: Decimal; unit: MeasureUnit };

// At most 9 whole digits and 3 decimals: the database's numeric(12,3).
const CANONICAL = /^(\d{1,9})(?:\.(\d{1,3}))?$/;
// Turkish: "," before the decimals. A "." is refused: "1.240" could mean
// 1240 (thousands) or 1,24, and a quantity is never guessed.
const TURKISH = /^(\d{1,9})(?:,(\d{1,3}))?$/;

function canonical(whole: string, fraction = ""): Decimal | null {
  const digits = whole.replace(/^0+(?=\d)/, "");
  const decimals = fraction.replace(/0+$/, "");
  if (/^0*$/.test(digits) && decimals === "") return null; // zero
  return decimals ? `${digits}.${decimals}` : digits;
}

/** "1,24" → "1.24". Throws InvalidInputError on "", "1.24", "0", "-1". */
export function parseTrDecimal(input: string): Decimal {
  const match = TURKISH.exec(input.trim());
  const value = match ? canonical(match[1] ?? "", match[2]) : null;
  if (value === null) throw new InvalidInputError("a decimal", input);
  return value;
}

/** "1.24" → "1,24". */
export function formatDecimal(value: Decimal): string {
  return value.replace(".", ",");
}

/**
 * The fixed-precision text a database or reader sends ("500.000") as a
 * canonical decimal ("500"); a number, a comma or zero is refused.
 */
export const decimalSchema = z
  .string()
  .regex(CANONICAL)
  .transform((text, context) => {
    const [whole = "", fraction] = text.split(".");
    const value = canonical(whole, fraction);
    if (value === null) {
      context.addIssue({ code: "custom", message: "must be above zero" });
      return z.NEVER;
    }
    return value;
  });

export const measureSchema = z.object({
  value: decimalSchema,
  unit: z.enum(measureUnits),
});

const UNIT_ALIASES: Record<string, MeasureUnit> = {
  g: "g",
  gr: "g",
  gram: "g",
  kg: "kg",
  kilo: "kg",
  ml: "ml",
  l: "l",
  lt: "l",
  litre: "l",
  adet: "adet",
  ad: "adet",
};

const UNIT_NAMES: Record<MeasureUnit, string> = {
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "L",
  adet: "adet",
};

/**
 * "500 g", "1,24 kg", "1 L", "15 adet" → a Measure. An empty field is
 * unknown (`null`), never 0. A number without a unit is refused: "500"
 * alone could be grams or millilitres.
 */
export function parseMeasure(input: string): Measure | null {
  const text = input.trim();
  if (text === "") return null;
  const match = /^([\d,]+)\s*([^\d\s,]+)$/u.exec(text);
  const unit = match
    ? UNIT_ALIASES[(match[2] ?? "").toLocaleLowerCase("tr")]
    : undefined;
  if (!match || !unit) throw new InvalidInputError("a measure", input);
  try {
    return { value: parseTrDecimal(match[1] ?? ""), unit };
  } catch {
    throw new InvalidInputError("a measure", input);
  }
}

/** "1,24 kg", "1 L": what `parseMeasure` reads back. */
export function formatMeasure(measure: Measure): string {
  return `${formatDecimal(measure.value)} ${UNIT_NAMES[measure.unit]}`;
}

export const MAX_PACKAGE_COUNT = 999;

/** "2" → 2 packages; empty → unknown (`null`); "0", "1,5" are refused. */
export function parsePackageCount(input: string): number | null {
  const text = input.trim();
  if (text === "") return null;
  const count = /^\d{1,3}$/.test(text) ? Number(text) : 0;
  if (count < 1 || count > MAX_PACKAGE_COUNT) {
    throw new InvalidInputError("a package count", input);
  }
  return count;
}
