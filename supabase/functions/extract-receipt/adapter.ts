/**
 * The seam between `extract-receipt` and whatever reads the receipt. Only
 * the mock exists until the AI provider is chosen (ROADMAP v1 11); a real
 * adapter reads its key from Edge Function secrets and nowhere else.
 * Output is `unknown` on purpose: nothing an adapter returns is trusted
 * until `parseExtraction` from @kefe/core accepts it.
 */
import {
  istanbulDate,
  type ReaderOutput,
} from "../../../packages/core/src/index.ts";

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

// A plausible market receipt (docs/design/screens/08-KontrolEt.png). The
// draft is stored with source 'mock', so the app can say "Örnek veri —
// fişiniz okunmadı" instead of passing this off as the person's receipt.
// Dated today (Turkey time) when read, so a saved sample lands in the
// month Ana Sayfa shows. On purpose, it shows what the check screen is
// for: the items add up to 2,50 TL less than the printed total, and the
// cheese's brand was unreadable and is marked unsure, not guessed.
const SAMPLE = {
  store: "Örnek Market",
  total_kurus: 61235,
  unsure: [],
  items: [
    {
      raw_text: "SUT TAM YAGLI 1 LT 34,50",
      name: "Süt",
      package_size: { value: "1", unit: "l" },
      package_count: 1,
      category: "food",
      amount_kurus: 3450,
    },
    {
      raw_text: "YUMURTA 15LI 89,90",
      name: "Yumurta",
      package_size: { value: "15", unit: "adet" },
      package_count: 1,
      category: "food",
      amount_kurus: 8990,
    },
    {
      raw_text: "B.PEYNIR TAM YAG 500G 189,00",
      name: "Beyaz peynir",
      brand: null,
      package_size: { value: "500", unit: "g" },
      package_count: 1,
      category: "food",
      amount_kurus: 18900,
      unsure: ["brand"],
    },
    {
      raw_text: "DOMATES 1,24 KG X 39,90 49,48",
      name: "Domates",
      quantity: { value: "1.24", unit: "kg" },
      category: "food",
      amount_kurus: 4948,
    },
    {
      raw_text: "EKMEK 15,00",
      name: "Ekmek",
      package_count: 1,
      category: "food",
      amount_kurus: 1500,
    },
    {
      raw_text: "BULASIK DET. 750 ML 132,00",
      name: "Bulaşık deterjanı",
      package_size: { value: "750", unit: "ml" },
      package_count: 1,
      category: "cleaning",
      amount_kurus: 13200,
    },
    {
      raw_text: "CAY 1 KG 99,97",
      name: "Çay",
      package_size: { value: "1", unit: "kg" },
      package_count: 1,
      category: "food",
      amount_kurus: 9997,
    },
  ],
} satisfies Omit<ReaderOutput, "date">;

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
