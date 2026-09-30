export type Kurus = number;

export class InvalidTlAmountError extends Error {}

// Stub so the test can be seen red first; the parser comes next commit.
export function parseTlAmount(_input: string): Kurus {
  return 0;
}
