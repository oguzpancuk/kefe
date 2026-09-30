import type { Kurus } from "./money.ts";

// Red on purpose: a naive first cut that sums every receipt it is given.

export type ReceiptForTotal = {
  status: string;
  total_kurus: Kurus | null;
  purchased_on: string | null;
  saved_at: string | null;
};

export type MonthTotal = { totalKurus: Kurus; count: number };

export function monthTotal(
  receipts: readonly ReceiptForTotal[],
  month: string,
): MonthTotal {
  void month;
  return {
    totalKurus: receipts.reduce((sum, r) => sum + (r.total_kurus ?? 0), 0),
    count: receipts.length,
  };
}

export const istanbulMonth = (now: Date): string =>
  now.toISOString().slice(0, 7);
export const sumKurus = (amounts: readonly Kurus[]): Kurus =>
  amounts.reduce((a, b) => a + b, 0);
export const formatTl = (kurus: Kurus): string => `${kurus / 100} TL`;
export const formatTlAmount = (kurus: Kurus): string => `${kurus / 100}`;
export const formatDate = (iso: string): string => iso;
export const formatMonth = (month: string): string => month;
