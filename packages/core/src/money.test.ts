import { describe, expect, it } from "vitest";
import { InvalidTlAmountError, parseTlAmount } from "./money";

describe("parseTlAmount", () => {
  it('reads "12,50" as 1250 kuruş', () => {
    const kurus = parseTlAmount("12,50");
    expect(kurus).toBe(1250);
    expect(Number.isInteger(kurus)).toBe(true);
  });

  it.each([
    ["12,5", 1250],
    ["12", 1200],
    ["0,99", 99],
    ["1.234,56", 123456],
    ["1.000.000", 100000000],
    [" 7,05 ", 705],
    ["-3,00", -300],
  ])('reads "%s" as %i kuruş', (input, expected) => {
    expect(parseTlAmount(input)).toBe(expected);
  });

  it.each([
    "12.5.0",
    "",
    "   ",
    "abc",
    "12,505",
    "12.50",
    "1234.567",
    ",50",
    "12,",
    "1,2,3",
    "--1",
    "1e3",
    "99.999.999.999.999,99",
  ])('rejects "%s" instead of returning a number', (input) => {
    expect(() => parseTlAmount(input)).toThrow(InvalidTlAmountError);
  });
});
