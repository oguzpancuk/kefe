import { describe, expect, it } from "vitest";
import {
  InvalidInputError,
  formatDecimal,
  formatMeasure,
  measureSchema,
  parseMeasure,
  parsePackageCount,
  parseTrDecimal,
} from "./measure.ts";

// ROADMAP v1 1: quantities and package sizes are written the Turkish way
// ("1,24 kg") and kept as decimal strings, never floats. Package size and
// number of packages are separate fields. Failure looks like "1.24" read
// as 124, a float, or an unreadable size turned into a guess.

describe("parseTrDecimal", () => {
  it.each([
    ["1,24", "1.24"],
    ["500", "500"],
    ["0,5", "0.5"],
    ["1,250", "1.25"],
    ["2,000", "2"],
    [" 12,5 ", "12.5"],
  ])("reads %j as %j", (input, expected) => {
    expect(parseTrDecimal(input)).toBe(expected);
  });

  it.each([
    ["empty", ""],
    ["a dot (thousands or decimals: ambiguous)", "1.24"],
    ["more than three decimals", "1,2345"],
    ["negative", "-1"],
    ["zero", "0"],
    ["zero with decimals", "0,000"],
    ["text", "bir"],
    ["two commas", "1,2,3"],
  ])("rejects %s", (_case, input) => {
    expect(() => parseTrDecimal(input)).toThrow(InvalidInputError);
  });
});

describe("parseMeasure", () => {
  it.each([
    ["500 g", { value: "500", unit: "g" }],
    ["500g", { value: "500", unit: "g" }],
    ["500 GR", { value: "500", unit: "g" }],
    ["1,24 kg", { value: "1.24", unit: "kg" }],
    ["1 L", { value: "1", unit: "l" }],
    ["1 lt", { value: "1", unit: "l" }],
    ["750 ml", { value: "750", unit: "ml" }],
    ["15 adet", { value: "15", unit: "adet" }],
    // Capitals, as with Caps Lock on: Turkish lower-casing makes "I" "ı".
    ["1 KILO", { value: "1", unit: "kg" }],
    ["1 LITRE", { value: "1", unit: "l" }],
    ["2 ADET", { value: "2", unit: "adet" }],
  ])("reads %j", (input, expected) => {
    expect(parseMeasure(input)).toEqual(expected);
  });

  it("reads an empty field as unknown (null), never as 0", () => {
    expect(parseMeasure("")).toBeNull();
    expect(parseMeasure("   ")).toBeNull();
  });

  it.each([
    ["no unit", "500"],
    ["an unknown unit", "500 kutu"],
    ["no number", "kg"],
    ["a dot decimal", "1.24 kg"],
    ["zero", "0 g"],
  ])("rejects %s", (_case, input) => {
    expect(() => parseMeasure(input)).toThrow(InvalidInputError);
  });
});

describe("formatMeasure and formatDecimal", () => {
  it("writes decimals with a comma and litres as L", () => {
    expect(formatMeasure({ value: "1.24", unit: "kg" })).toBe("1,24 kg");
    expect(formatMeasure({ value: "1", unit: "l" })).toBe("1 L");
    expect(formatDecimal("0.5")).toBe("0,5");
  });

  it("round-trips through parseMeasure", () => {
    for (const text of ["1,24 kg", "500 g", "1 L", "750 ml", "15 adet"]) {
      const measure = parseMeasure(text);
      expect(measure && formatMeasure(measure)).toBe(text);
    }
  });
});

describe("measureSchema", () => {
  it("accepts the database's fixed-precision text and keeps it a string", () => {
    expect(measureSchema.parse({ value: "500.000", unit: "g" })).toEqual({
      value: "500",
      unit: "g",
    });
    expect(measureSchema.parse({ value: "1.240", unit: "kg" })).toEqual({
      value: "1.24",
      unit: "kg",
    });
  });

  it.each([
    ["a float", { value: 1.24, unit: "kg" }],
    ["a comma", { value: "1,24", unit: "kg" }],
    ["zero", { value: "0", unit: "g" }],
    ["an unknown unit", { value: "1", unit: "kilo" }],
  ])("rejects %s", (_case, raw) => {
    expect(measureSchema.safeParse(raw).success).toBe(false);
  });
});

describe("parsePackageCount", () => {
  it("reads a whole number of packages, empty as unknown", () => {
    expect(parsePackageCount("2")).toBe(2);
    expect(parsePackageCount(" 12 ")).toBe(12);
    expect(parsePackageCount("")).toBeNull();
  });

  it.each(["0", "1,5", "-1", "iki", "1000"])("rejects %j", (input) => {
    expect(() => parsePackageCount(input)).toThrow(InvalidInputError);
  });
});
