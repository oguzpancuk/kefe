import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatMonth,
  formatTl,
  formatTlAmount,
  istanbulMonth,
  monthTotal,
  sumKurus,
  type ReceiptForTotal,
} from "./spending.ts";

// ROADMAP walking skeleton 5: the home total counts saved receipts only,
// each once; a draft never moves it. Failure looks like a draft or
// another month's receipt in the sum.

const saved = (
  total_kurus: number,
  purchased_on: string | null,
  saved_at = "2026-09-30T09:00:00Z",
): ReceiptForTotal => ({
  status: "saved",
  total_kurus,
  purchased_on,
  saved_at,
});

describe("monthTotal", () => {
  it("adds the saved receipts of the month, in kuruş", () => {
    const receipts = [saved(8640, "2026-09-29"), saved(1250, "2026-09-01")];
    expect(monthTotal(receipts, "2026-09")).toEqual({
      totalKurus: 9890,
      count: 2,
    });
  });

  it("never counts a draft, a failed or an unfinished receipt", () => {
    const receipts: ReceiptForTotal[] = [
      saved(8640, "2026-09-29"),
      ...(["needs_review", "failed", "uploading", "processing"] as const).map(
        (status) => ({
          status,
          total_kurus: 5000,
          purchased_on: "2026-09-29",
          saved_at: null,
        }),
      ),
    ];
    expect(monthTotal(receipts, "2026-09")).toEqual({
      totalKurus: 8640,
      count: 1,
    });
  });

  it("leaves out another month's receipt", () => {
    const receipts = [saved(8640, "2026-09-29"), saved(700, "2026-08-31")];
    expect(monthTotal(receipts, "2026-09")).toEqual({
      totalKurus: 8640,
      count: 1,
    });
    expect(monthTotal(receipts, "2026-08")).toEqual({
      totalKurus: 700,
      count: 1,
    });
  });

  it("places a receipt without a readable date in the month it was saved, Turkey time", () => {
    // 22:30 UTC on 30 September is already 1 October in Istanbul.
    const receipts = [saved(500, null, "2026-09-30T22:30:00Z")];
    expect(monthTotal(receipts, "2026-09")).toEqual({
      totalKurus: 0,
      count: 0,
    });
    expect(monthTotal(receipts, "2026-10")).toEqual({
      totalKurus: 500,
      count: 1,
    });
  });

  it("is zero with nothing saved", () => {
    expect(monthTotal([], "2026-09")).toEqual({ totalKurus: 0, count: 0 });
  });

  it("refuses a saved receipt without a total instead of counting it as 0", () => {
    const broken = { ...saved(0, "2026-09-29"), total_kurus: null };
    expect(() => monthTotal([broken], "2026-09")).toThrow();
  });
});

describe("istanbulMonth", () => {
  it("reads the month in Turkey time (UTC+3)", () => {
    expect(istanbulMonth(new Date("2026-09-30T20:59:00Z"))).toBe("2026-09");
    expect(istanbulMonth(new Date("2026-09-30T21:00:00Z"))).toBe("2026-10");
    expect(istanbulMonth(new Date("2026-12-31T21:00:00Z"))).toBe("2027-01");
  });
});

describe("sumKurus", () => {
  it("adds integer kuruş, discounts included", () => {
    expect(sumKurus([1250, 3490, 3900])).toBe(8640);
    expect(sumKurus([1250, -250])).toBe(1000);
    expect(sumKurus([])).toBe(0);
  });
});

describe("formatTl", () => {
  it.each([
    [8640, "86,40 TL"],
    [0, "0,00 TL"],
    [5, "0,05 TL"],
    [100, "1,00 TL"],
    [428640, "4.286,40 TL"],
    [100000000, "1.000.000,00 TL"],
    [-500, "-5,00 TL"],
  ])("writes %i kuruş as %s", (kurus, text) => {
    expect(formatTl(kurus)).toBe(text);
  });

  it("refuses a fraction of a kuruş", () => {
    expect(() => formatTl(12.5)).toThrow();
  });
});

describe("formatTlAmount", () => {
  it("writes the amount the way parseTlAmount reads it back", () => {
    expect(formatTlAmount(1250)).toBe("12,50");
    expect(formatTlAmount(123456)).toBe("1.234,56");
    expect(formatTlAmount(-300)).toBe("-3,00");
  });
});

describe("formatDate and formatMonth", () => {
  it("write Turkish month names", () => {
    expect(formatDate("2026-09-29")).toBe("29 Eylül 2026");
    expect(formatDate("2026-02-01")).toBe("1 Şubat 2026");
    expect(formatMonth("2026-09")).toBe("Eylül 2026");
    expect(formatMonth("2026-12")).toBe("Aralık 2026");
  });

  it("refuse text that is not a date or a month", () => {
    expect(() => formatDate("29.09.2026")).toThrow();
    expect(() => formatMonth("2026-13")).toThrow();
  });
});
