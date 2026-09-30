# ADR-0003: Visual design system

Status: proposed · Date: 2026-09-30

## Context

The owner supplied the kefe logo (a scale pan: two charcoal strokes over a
blue bowl, rounded geometric wordmark) and asked for the existing screens
to be designed from it before building them. The users are first-time app
users, often 40+ (PRD, User), and PRD #12 sets hard accessibility floors.

## Decision

- **Palette from the logo**: blue `#216B8F` is the only accent (primary
  actions, active tab); charcoal `#25211F` is the text colour; a warm
  paper background `#F7F5F2` with white cards. Amber, red and green are
  reserved for "Kontrol et", errors and confirmations, always paired with
  an icon and a word.
- **Font: Atkinson Hyperlegible Next** (SIL OFL), bundled as font files
  and loaded with `expo-font`, an Expo SDK package that is today only a
  transitive dependency of `expo`; the build item that adds the fonts
  adds it as a direct dependency with `npx expo install expo-font`
  (a new direct dependency, so it is part of this decision for the
  owner). Chosen over the system font for its letter
  distinctness for low-vision readers and identical rendering on iOS and
  the web.
- **Tokens live in `docs/design/tokens.json`** until the first build item
  that needs them; that item moves them into code both apps can import
  and keeps the JSON as the reference.
- Sizes: body 18, minimum 16; buttons at least 56 tall, "Fiş ekle" at
  least 72, touch targets ≥ 48. All heights are minimums so controls grow
  with large text instead of clipping.
- **Month total at 40** (owner decision, 2026-09-30): the home screen's
  month total is the one figure outside PRD #12's "key figures 18–24";
  PRD #12 names it as the exception. Every other figure stays 18–24.

## Consequences

- Four font files (~ 90 KB each) ship with the app; the web target loads
  them the same way.
- Prices never appear in red or green; a price change is ink text with an
  arrow, which keeps the PRD's "no judging prices" rule visible in the UI.
- Any new screen reuses the components in `docs/design/DESIGN.md`; a new
  colour or size goes into `tokens.json` first.
