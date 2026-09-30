import type { TextStyle } from "react-native";

// The design tokens the app uses, mirrored from docs/design/tokens.json
// (theme.test.ts fails when the two drift). Every minHeight is a minimum:
// never a fixed height, so text can wrap and controls grow (DESIGN.md).

export const color = {
  primary: "#216B8F",
  primaryPressed: "#185472",
  primaryTint: "#E6F0F5",
  primaryTintStrong: "#CFE2EC",
  onPrimary: "#FFFFFF",
  background: "#F7F5F2",
  surface: "#FFFFFF",
  surfaceMuted: "#F0ECE7",
  text: "#25211F",
  textMuted: "#5C5550",
  border: "#DDD6CF",
  borderStrong: "#8C837C",
  danger: { fg: "#A3261B", bg: "#FCEBE8" },
  success: { fg: "#25693F", bg: "#E5F2EA" },
} as const;

export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const screenPadding = 20;

export const radius = {
  input: 12,
  button: 14,
  buttonHero: 18,
  card: 16,
  pill: 999,
} as const;

export const minHeight = {
  touch: 48,
  button: 56,
  buttonHero: 72,
  input: 56,
  listRow: 64,
  tabBar: 88,
} as const;

export const icon = { default: 24, tab: 28, hero: 30 } as const;

export const border = {
  hairline: 1,
  input: 1.5,
  button: 2,
  error: 2,
} as const;

// One loaded family per weight: custom fonts on iOS and the web do not
// synthesise weights reliably, so the weight is chosen by family name.
export const fontFamily = {
  regular: "AtkinsonHyperlegibleNext-400",
  semibold: "AtkinsonHyperlegibleNext-600",
  bold: "AtkinsonHyperlegibleNext-700",
  heavy: "AtkinsonHyperlegibleNext-800",
} as const;

const weightFamily = {
  400: fontFamily.regular,
  600: fontFamily.semibold,
  700: fontFamily.bold,
  800: fontFamily.heavy,
} as const;

type TextToken = { size: number; lineHeight: number; weight: 400 | 700 | 800 };

export const textToken = {
  hero: { size: 40, lineHeight: 46, weight: 800 },
  title: { size: 30, lineHeight: 36, weight: 700 },
  figure: { size: 24, lineHeight: 30, weight: 800 },
  section: { size: 22, lineHeight: 28, weight: 700 },
  button: { size: 19, lineHeight: 24, weight: 700 },
  buttonHero: { size: 22, lineHeight: 28, weight: 700 },
  input: { size: 19, lineHeight: 24, weight: 400 },
  body: { size: 18, lineHeight: 26, weight: 400 },
  bodyStrong: { size: 18, lineHeight: 24, weight: 700 },
  label: { size: 16, lineHeight: 22, weight: 700 },
  caption: { size: 16, lineHeight: 22, weight: 400 },
} as const satisfies Record<string, TextToken>;

const style = (token: TextToken): TextStyle => ({
  fontFamily: weightFamily[token.weight],
  fontSize: token.size,
  lineHeight: token.lineHeight,
  color: color.text,
});

export const type = {
  // The month total only (DESIGN.md, Type); tabular figures.
  hero: { ...style(textToken.hero), fontVariant: ["tabular-nums"] },
  title: style(textToken.title),
  figure: { ...style(textToken.figure), fontVariant: ["tabular-nums"] },
  section: style(textToken.section),
  button: style(textToken.button),
  buttonHero: style(textToken.buttonHero),
  input: style(textToken.input),
  body: style(textToken.body),
  bodyStrong: style(textToken.bodyStrong),
  label: style(textToken.label),
  caption: { ...style(textToken.caption), color: color.textMuted },
} satisfies Record<string, TextStyle>;
