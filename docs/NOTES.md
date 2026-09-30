# Working notes — append-only, dated

<!-- The session-to-session memory. Every work session appends: what was
     done, what was verified (and how), what is open. Newest at top.
     Never rewrite old entries — this file is the audit trail. -->

## Upstream candidates

<!-- Improvements made HERE to template-origin files (CLAUDE.md, verify.sh,
     ci.yml, project-instructions.md) that maya should inherit.
     /update-stack harvests this list.
     Format: date · file · one-line what/why. Remove entries once upstreamed. -->

- 2026-09-30 · ci.yml · setup steps that need the skeleton (`npm ci`,
  Supabase CLI and stack) are conditional on `package-lock.json` /
  `supabase/config.toml`, so the CI written at instantiation stays right
  after the skeleton lands (threads may not edit CI) and fails before it
  with verify.sh's own "FAIL skeleton" line instead of an `npm ci` error.
- 2026-09-30 · new-product step 8 · "CI green on `main`" cannot hold at
  instantiation: the battery fails by design until the walking skeleton's
  first step. The first run is red with "FAIL skeleton"; green arrives
  with the first skeleton pull request. The step should say so.
- 2026-09-30 · docs templates (NOTES, ROADMAP, adr/0001,
  project-instructions) · fail `prettier --check` as
  shipped (no blank line after the HTML comments under each heading), so
  the battery's format step would fail on an untouched product.
- 2026-09-30 · verify.sh · a workspace with no `test` script shows
  `ok tests (<name>)` through `--if-present`, which reads as tests passing
  when none ran. Print NOT PRESENT (or FAIL for workspaces that must have
  tests) instead of `ok`.
- 2026-09-30 · CLAUDE.md · Expo in an npm workspaces monorepo needs root
  `overrides` pinning react, react-dom and react-native to the SDK's
  versions, or npm hoists a second React Native and the web export fails
  with `ERR_PACKAGE_PATH_NOT_EXPORTED ... rn-get-polyfills`.

## Battery gaps

<!-- Every time evaluator-qa or production finds something the battery
     passed: date · done-when clause · what the battery missed · the test
     added. This is how the battery learns. /update-stack harvests the
     classes of miss so other products' batteries can close them too. -->

## 2026-09-30 — walking skeleton step 1: monorepo boots

- Workspaces `@kefe/core`, `@kefe/mobile` (Expo 57 + Expo Router, one
  placeholder screen), `@kefe/admin` (Vite + React empty shell),
  `@kefe/supabase` (`supabase init` config, CLI 2.117.0 pinned to match
  CI, one smoke test that the local stack answers Auth health).
  `docs/adr/0002-stack.md` written; template docs formatted by Prettier.
- `parseTlAmount` in `@kefe/core`: Turkish lira text to integer kuruş,
  throws `InvalidTlAmountError` on anything else (never 0). Its test was
  seen red first against a stub returning 0 (21 of 21 failing).
- Verified: `bash .claude/hooks/verify.sh` exits 0 on a clean HEAD in a
  cloud thread, with `tests (@kefe/supabase)` NOT RUN (no Docker); CI's
  `verify` job is the first run of that suite and of the smoke test.
- Pitfall: root `overrides` pin react / react-dom / react-native to the
  Expo SDK's versions (see ADR-0002). Expo's `expo install` cannot reach
  its API from a cloud thread; `EXPO_OFFLINE=1` makes it use the SDK's
  bundled version list.
- Open: workspaces without tests show `ok` in the battery (upstream
  candidate above). Next ROADMAP item: skeleton step 2.

## 2026-09-30 — simple-UI fixes to the PRD (owner approved)

- Reviewing the screen list against the source spec's simple-UI rule
  found four risks; the owner approved all four fixes, written into
  PRD #4, #5, #10 and ROADMAP skeleton 5, v1 1, 2, 9:
  processing is a "Fiş okunuyor" waiting state on Kontrol et, not a
  page; internal state names never reach the UI; the consent label is
  plain words (placeholder, PRD open question 12); the item edit view
  shows name and amount first, the rest under "Diğer bilgiler".

## 2026-09-30 — owner decision: the MVP is the full PRD

- The owner chose to build the whole current PRD in the MVP instead of
  the cut /mvp-scope proposed. Product search in history (into v1 4) and
  the duplicate-content warning (into v1 2) moved from Deferred to v1;
  v1 is now the MVP. The walking skeleton is unchanged and still first.
- Still out: Android, source P1, notification preference, anonymization
  for external reports — the PRD itself leaves them out.

## 2026-09-30 — ROADMAP written via /mvp-scope

- docs/ROADMAP.md: 6-step walking skeleton (web first, iOS simulator as
  the owner's manual check), 14 ordered v1 items, 6 deferred items with
  reasons. About block of docs/project-instructions.md filled from it.
- Assumption to confirm: the skeleton signs in with email + password as
  a swappable placeholder until PRD open question 2 is answered.
- Verified: prettier on the edited docs only; no code yet.

## 2026-09-30 — PRD written via /spec

- Turned the owner's Turkish source spec (v0.1, outside the repo) into
  docs/PRD.md: 14 core interactions, each with a "works when" clause;
  source P1 moved to Non-goals; admin monitoring added from CLAUDE.md.
- Verified: nothing to run; docs only. Prettier check on the PRD run
  before commit.
- Open: 11 owner questions in the PRD's Open questions (Android, sign-in
  method, consent, admin scope, retention, AI provider, deadline...).
  Scope is well beyond two weeks of solo work: next step is /mvp-scope.

## 2026-09-30 — instantiated from maya b7b2479

- Stack chosen by the owner from recommendations: Expo + Expo Router (iOS
  and web), Vite + React admin SPA, Supabase (EU), Cloudflare for both web
  surfaces, Vitest, npm workspaces monorepo. Same stack as juno, so one
  cloud environment can serve both.
- Filled: CLAUDE.md commands, standards, Looking at it, Deploy;
  verify.sh (exec bits, typecheck, lint, format, per-workspace tests with
  the Supabase suite NOT RUN where no Docker daemon answers, both web
  builds); ci.yml; deploy-checklist backend and web steps.
- Verified: `bash .claude/hooks/verify.sh` exits 1 with "FAIL skeleton",
  as designed before the skeleton exists.
- Open: iOS release path (EAS or Xcode Cloud) is a TODO in CLAUDE.md and
  the deploy checklist. The owner's source spec is outside the repo, in
  Turkish; /spec turns it into docs/PRD.md.
