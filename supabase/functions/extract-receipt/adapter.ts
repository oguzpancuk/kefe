/**
 * The seam between `extract-receipt` and whatever reads the receipt. Only
 * the mock exists until the AI provider is chosen (ROADMAP v1 11); a real
 * adapter reads its key from Edge Function secrets and nowhere else.
 * Output is `unknown` on purpose: nothing an adapter returns is trusted
 * until `parseExtraction` from @kefe/core accepts it.
 */
import { istanbulDate } from "../../../packages/core/src/index.ts";

export type ExtractionSource = "mock" | "ai";

/** Which canned answer the mock gives; only honoured in mock mode. */
export type MockScenario = "valid" | "invalid";

export type ExtractionInput = {
  /** Object name in the private `receipts` bucket, if uploaded yet. */
  imagePath: string | null;
  mockScenario: MockScenario;
};

export type ExtractionAdapter = {
  source: ExtractionSource;
  extract(input: ExtractionInput): Promise<unknown>;
};

// A plausible market receipt. The draft is stored with source 'mock', so
// the app can say "Örnek veri — fişiniz okunmadı" instead of passing this
// off as the person's receipt. Dated today (Turkey time) when read, so a
// saved sample lands in the month Ana Sayfa shows.
const SAMPLE = {
  store: "Örnek Market",
  total_kurus: 8640,
  items: [
    { raw_text: "EKMEK 1 AD 12,50", name: "Ekmek", amount_kurus: 1250 },
    { raw_text: "SUT 1 LT 34,90", name: "Süt", amount_kurus: 3490 },
    { raw_text: "DOMATES 1,2 KG 39,00", name: "Domates", amount_kurus: 3900 },
  ],
};

// What a misbehaving reader might send: an amount as a float and a line
// with no raw text. The schema must turn this into a failure, not items.
const MALFORMED = {
  store: "Örnek Market",
  date: "2026-09-29",
  total_kurus: 1250,
  items: [
    { raw_text: "EKMEK 1 AD 12,50", name: "Ekmek", amount_kurus: 12.5 },
    { raw_text: "", name: "Süt", amount_kurus: 3490 },
  ],
};

/** Needs no key and no network; says it is a mock through `source`. */
export const mockAdapter: ExtractionAdapter = {
  source: "mock",
  extract({ mockScenario }) {
    const output =
      mockScenario === "invalid"
        ? MALFORMED
        : { ...SAMPLE, date: istanbulDate(new Date()) };
    return Promise.resolve(structuredClone(output));
  },
};
