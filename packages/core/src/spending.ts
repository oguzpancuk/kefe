import type { Kurus } from "./money.ts";

/**
 * What the home screen's month total is made of, and how amounts, dates
 * and months are written for the person. Only saved receipts count: a
 * draft, a failed read or an unfinished upload never moves a total.
 */

/** The receipt columns a total needs, as the app reads them. */
export type ReceiptForTotal = {
  status: string;
  total_kurus: Kurus | null;
  /** The date printed on the receipt (YYYY-MM-DD), when it was readable. */
  purchased_on: string | null;
  /** When the person saved it (ISO timestamp); set on every saved receipt. */
  saved_at: string | null;
};

export type MonthTotal = { totalKurus: Kurus; count: number };

/** A calendar month as "YYYY-MM". */
export type Month = string;

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// Turkey keeps UTC+3 all year (no daylight saving since 2016).
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

/** The calendar day `now` falls on, in Turkey time ("YYYY-MM-DD"). */
export function istanbulDate(now: Date): string {
  return new Date(now.getTime() + ISTANBUL_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/** The month `now` falls in, in Turkey time. */
export function istanbulMonth(now: Date): Month {
  return istanbulDate(now).slice(0, 7);
}

/**
 * The month a saved receipt belongs to: the printed date's, or, when the
 * date could not be read, the month it was saved in (Turkey time). The
 * date is never guessed; only the month used for grouping falls back.
 */
function monthOf(receipt: ReceiptForTotal): Month | null {
  if (receipt.purchased_on) return receipt.purchased_on.slice(0, 7);
  if (receipt.saved_at) return istanbulMonth(new Date(receipt.saved_at));
  return null;
}

/** Sum and count of the saved receipts in `month`; nothing else counts. */
export function monthTotal(
  receipts: readonly ReceiptForTotal[],
  month: Month,
): MonthTotal {
  let totalKurus = 0;
  let count = 0;
  for (const receipt of receipts) {
    if (receipt.status !== "saved" || monthOf(receipt) !== month) continue;
    if (
      receipt.total_kurus === null ||
      !Number.isInteger(receipt.total_kurus)
    ) {
      // A saved receipt always has a total (database constraint); counting
      // a missing one as 0 would hide the fault in the number people see.
      throw new Error("A saved receipt has no total");
    }
    totalKurus += receipt.total_kurus;
    count += 1;
  }
  return { totalKurus, count };
}

/** Adds integer kuruş amounts (discount lines are negative). */
export function sumKurus(amounts: readonly Kurus[]): Kurus {
  let sum = 0;
  for (const amount of amounts) {
    if (!Number.isInteger(amount)) throw new Error("Not whole kuruş");
    sum += amount;
  }
  return sum;
}

/** "1.234,56": the Turkish way, and what `parseTlAmount` reads back. */
export function formatTlAmount(kurus: Kurus): string {
  if (!Number.isSafeInteger(kurus)) throw new Error("Not whole kuruş");
  const sign = kurus < 0 ? "-" : "";
  const abs = Math.abs(kurus);
  const lira = String(Math.floor(abs / 100)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ".",
  );
  const fraction = String(abs % 100).padStart(2, "0");
  return `${sign}${lira},${fraction}`;
}

/** "4.286,40 TL". */
export function formatTl(kurus: Kurus): string {
  return `${formatTlAmount(kurus)} TL`;
}

const MONTH_NAMES = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const;

/** "Eylül 2026" for "2026-09". */
export function formatMonth(month: Month): string {
  const match = MONTH.exec(month);
  if (!match) throw new Error(`Not a month: ${JSON.stringify(month)}`);
  const [, year, number] = match;
  return `${MONTH_NAMES[Number(number) - 1]} ${year}`;
}

/** "29 Eylül 2026" for "2026-09-29". */
export function formatDate(date: string): string {
  const match = DATE.exec(date);
  if (!match) throw new Error(`Not a date: ${JSON.stringify(date)}`);
  const [, year, number, day] = match;
  return `${Number(day)} ${MONTH_NAMES[Number(number) - 1]} ${year}`;
}
