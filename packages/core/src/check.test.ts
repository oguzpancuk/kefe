import { describe, expect, it } from "vitest";
import {
  formatDateNumeric,
  otherInfoUnsure,
  parseTrDate,
  receiptTotal,
  totalMismatch,
  unsureAfterCheck,
} from "./check.ts";
import { InvalidInputError } from "./measure.ts";

// ROADMAP v1 1: the check screen shows when the items do not add up to the
// printed total, in kuruş, and flags unsure fields, also hidden ones.
// Failure looks like a mismatch hidden or rounded, or an unsure field
// under the closed "Diğer bilgiler" with no flag.

describe("totalMismatch", () => {
  // The design's sample: 612,35 printed, the items add up to 609,85.
  const items = [3450, 8990, 18900, 4948, 1500, 13200, 9997];

  it("gives the difference in kuruş when the items are less", () => {
    expect(totalMismatch(61235, items)).toEqual({
      direction: "items_less",
      differenceKurus: 250,
    });
  });

  it("gives the difference in kuruş when the items are more", () => {
    expect(totalMismatch(60985 - 1, items)).toEqual({
      direction: "items_more",
      differenceKurus: 1,
    });
  });

  it("is exact to one kuruş, with no float rounding", () => {
    // 0,10 + 0,20 is 0,30 in kuruş, not 0.30000000000000004.
    expect(totalMismatch(30, [10, 20])).toBeNull();
    expect(totalMismatch(31, [10, 20])).toEqual({
      direction: "items_less",
      differenceKurus: 1,
    });
  });

  it("counts discount lines as negative", () => {
    expect(totalMismatch(1000, [1500, -500])).toBeNull();
  });

  it("is null when they agree, or when no total was read", () => {
    expect(totalMismatch(60985, items)).toBeNull();
    expect(totalMismatch(null, items)).toBeNull();
  });

  it("refuses an amount that is not whole kuruş", () => {
    expect(() => totalMismatch(100, [12.5])).toThrow();
  });
});

describe("receiptTotal", () => {
  it("is the printed total when one was read", () => {
    expect(receiptTotal(61235, [100, 200])).toEqual({
      totalKurus: 61235,
      fromItems: false,
    });
  });

  it("falls back to the items' sum, and says so, when none was read", () => {
    expect(receiptTotal(null, [100, 200])).toEqual({
      totalKurus: 300,
      fromItems: true,
    });
  });
});

describe("otherInfoUnsure", () => {
  it("is true when a field under Diğer bilgiler is unsure", () => {
    for (const field of [
      "brand",
      "quantity",
      "package_size",
      "package_count",
      "category",
    ] as const) {
      expect(otherInfoUnsure([field])).toBe(true);
    }
  });

  it("is false when only the name or the amount is unsure", () => {
    expect(otherInfoUnsure(["name", "amount"])).toBe(false);
    expect(otherInfoUnsure([])).toBe(false);
  });
});

describe("unsureAfterCheck", () => {
  it("clears what the person saw: name and amount", () => {
    expect(
      unsureAfterCheck(["name", "amount", "brand"], { otherInfoOpened: false }),
    ).toEqual(["brand"]);
  });

  it("clears the hidden fields only when Diğer bilgiler was opened", () => {
    expect(
      unsureAfterCheck(["brand", "category"], { otherInfoOpened: true }),
    ).toEqual([]);
  });
});

describe("parseTrDate and formatDateNumeric", () => {
  it.each([
    ["28.09.2026", "2026-09-28"],
    ["1.10.2026", "2026-10-01"],
    ["01/10/2026", "2026-10-01"],
    [" 29.02.2028 ", "2028-02-29"],
  ])("reads %j as %j", (input, expected) => {
    expect(parseTrDate(input)).toBe(expected);
  });

  it.each([
    "",
    "2026-09-28",
    "31.09.2026",
    "29.02.2026",
    "28.13.2026",
    "28.09.26",
  ])("rejects %j", (input) => {
    expect(() => parseTrDate(input)).toThrow(InvalidInputError);
  });

  it("writes a date the way parseTrDate reads it", () => {
    expect(formatDateNumeric("2026-10-01")).toBe("01.10.2026");
    expect(parseTrDate(formatDateNumeric("2026-09-28"))).toBe("2026-09-28");
  });
});
