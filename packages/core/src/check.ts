import { InvalidInputError } from "./measure.ts";
import type { Kurus } from "./money.ts";
import { otherInfoFields, type ItemField } from "./receipt.ts";
import { sumKurus } from "./spending.ts";

/**
 * What the check screen (Kontrol et, PRD #5) needs worked out: whether
 * the items add up to the printed total, which unsure marks to show, and
 * the date written the Turkish way. The screen only renders these.
 */

export type TotalMismatch = {
  /** Whether the items add up to less or more than the printed total. */
  direction: "items_less" | "items_more";
  /** Always positive, in kuruş. */
  differenceKurus: Kurus;
};

/**
 * The gap between the printed total and the items, in whole kuruş; null
 * when they agree or no total was read. Discount lines count negative.
 */
export function totalMismatch(
  totalKurus: Kurus | null,
  itemAmounts: readonly Kurus[],
): TotalMismatch | null {
  const items = sumKurus(itemAmounts);
  if (totalKurus === null || items === totalKurus) return null;
  return items < totalKurus
    ? { direction: "items_less", differenceKurus: totalKurus - items }
    : { direction: "items_more", differenceKurus: items - totalKurus };
}

/**
 * The total a receipt is saved with: the printed one, or, when none was
 * read, the items' sum (`fromItems`, so the screen asks for a check).
 * `save_receipt` applies the same rule.
 */
export function receiptTotal(
  totalKurus: Kurus | null,
  itemAmounts: readonly Kurus[],
): { totalKurus: Kurus; fromItems: boolean } {
  return totalKurus === null
    ? { totalKurus: sumKurus(itemAmounts), fromItems: true }
    : { totalKurus, fromItems: false };
}

/** True when a field under the closed "Diğer bilgiler" is unsure. */
export function otherInfoUnsure(unsure: readonly ItemField[]): boolean {
  return unsure.some((field) =>
    (otherInfoFields as readonly ItemField[]).includes(field),
  );
}

/**
 * The unsure marks left after the person pressed "Tamam" on an item: the
 * name and amount were in front of them, so those are checked; the
 * hidden fields only if they opened "Diğer bilgiler".
 */
export function unsureAfterCheck(
  unsure: readonly ItemField[],
  { otherInfoOpened }: { otherInfoOpened: boolean },
): ItemField[] {
  if (otherInfoOpened) return [];
  return unsure.filter((field) => field !== "name" && field !== "amount");
}

const TR_DATE = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/;

/** "28.09.2026" (or "28/09/2026") → "2026-09-28"; a day that does not exist is refused. */
export function parseTrDate(input: string): string {
  const match = TR_DATE.exec(input.trim());
  if (match) {
    const [day, month, year] = [match[1], match[2], match[3]].map(Number) as [
      number,
      number,
      number,
    ];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return date.toISOString().slice(0, 10);
    }
  }
  throw new InvalidInputError("a date", input);
}

/** "2026-10-01" → "01.10.2026", what `parseTrDate` reads back. */
export function formatDateNumeric(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Not a date: ${JSON.stringify(date)}`);
  return `${match[3]}.${match[2]}.${match[1]}`;
}
