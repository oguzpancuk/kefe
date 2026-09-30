/**
 * Money is integer kuruş (1 TL = 100 kuruş), never a float. Amounts come
 * in written the Turkish way: "," before the decimals, "." between
 * thousands.
 */
export type Kurus = number;

export class InvalidTlAmountError extends Error {
  constructor(input: string) {
    super(`Not a Turkish lira amount: ${JSON.stringify(input)}`);
    this.name = "InvalidTlAmountError";
  }
}

// Optional minus; whole lira either plain digits or dot-grouped in threes;
// optional comma with one or two kuruş digits.
const TL_AMOUNT = /^(-)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

/**
 * Parses a Turkish lira amount such as "12,50" or "1.234,56" into kuruş.
 * Anything else, including "", "12.5.0" and "12.50", throws
 * InvalidTlAmountError; it never falls back to 0.
 */
export function parseTlAmount(input: string): Kurus {
  const match = TL_AMOUNT.exec(input.trim());
  if (!match) throw new InvalidTlAmountError(input);
  const [, sign, lira = "", fraction = ""] = match;
  const kurus =
    BigInt(lira.replaceAll(".", "")) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (kurus > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new InvalidTlAmountError(input);
  }
  const value = Number(kurus);
  // why: -0 is not a distinct amount; "-0,00" is zero.
  return sign && value !== 0 ? -value : value;
}
