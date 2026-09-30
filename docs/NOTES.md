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

- 2026-09-30 · skeleton 4 (sign-in screen) · the battery cannot see
  layout: `evaluator-qa` found "Göster" pushed out of the password box at
  320 px and at 200 % text (a web `<input>` keeps an intrinsic width inside
  a flex row; fixed with `minWidth: 0`). No test added: layout needs a
  browser, and the battery has no browser step. Screens with an input
  beside a button should be driven at 320 px until it has one.

## 2026-09-30 — walking skeleton step 5: Fiş ekle → Kontrol et → Kaydet on web

- Migration `20260930100000_save_receipt.sql`: `saved_at` on receipts, a
  check that a saved receipt has `saved_at` and a total, and
  `save_receipt(p_idempotency_key, p_items)` (security invoker, row lock,
  idempotent: a saved receipt is returned unchanged, later edits ignored).
  It applies the corrected item amounts and sets the saved total to the
  sum of the items.
- `@kefe/core`: `monthTotal` (saved receipts only; month of the printed
  date, else of `saved_at` in Turkey time), `sumKurus`, `formatTl`,
  `formatTlAmount`, `formatDate`, `formatMonth`, `istanbulMonth`.
- Web flow: Ana Sayfa (month total 40 pt, "Fiş ekle" 72 high) → photo
  picker → Kontrol et ("Fiş okunuyor", then the draft with the sample
  banner) → "Kalemi düzelt" for one amount → "Kaydet" → Ana Sayfa with
  "Fiş kaydedildi.". New dependencies `expo-image-picker` and
  `expo-crypto` (Expo's own modules, needed for iOS in step 6 too).
- Red runs: core 16 of 22 new tests failing against a stub that summed
  every receipt; app receipts calls 9 of 11 failing against a stub;
  `save-receipt.test.ts` failing in CI on the first commit of PR #7
  (no `save_receipt` yet).
- Verified: migration applied to a scratch Postgres 16 with stubbed
  `auth`/`storage` and exercised as `authenticated` (refusals for B's key,
  a foreign item, 12.5, a duplicated item; double save returns the same
  row; direct `status = 'saved'` without `saved_at` refused). Web flow
  driven with Playwright against an in-memory fake of the Supabase HTTP
  APIs; screenshots in `docs/screenshots/skeleton-step-5/`.
- `evaluator-qa` NEEDS_WORK on the first pass: the mock dated its sample
  2026-09-29, so from 1 October a saved sample landed in September and Ana
  Sayfa showed "Fiş kaydedildi." over 0,00 TL. The mock now dates it today
  (Turkey time, `istanbulDate` in core) and the tests use the current
  month; checked with the browser and fake clocked to 1 October.
- Decision to revisit in v1 1: the saved total is the sum of the checked
  items, not the printed total. With the mock they agree; when the total
  becomes its own editable field (mismatch warning), `save_receipt` must
  keep the printed total and the raw extraction next to the corrections.
- Open: owners can still PATCH `status`/`total_kurus`/`saved_at` directly
  through PostgREST (their own rows only); a column-level grant or a
  trigger should make `save_receipt` the only way to `saved`.
- Review findings fixed: the month total query now asks for the month
  only (printed date in the month, or no date and `saved_at` in it, Turkey
  time, `monthRange` in core) and reads page by page past PostgREST's
  1000-row cap; "Fiş kaydedildi." shows once (kept in memory, not in the
  address, so a reload or a tab switch does not repeat it); the Supabase
  tests take the date and month from the stored draft, so a run across
  midnight in Turkey compares like with like. New app and core tests seen
  red first.
- Open: a web reload on Kontrol et while the receipt is still being sent
  loses the in-memory send; the page then shows "Fiş okunamadı." (retry
  is v1 2).
- Next ROADMAP item: skeleton step 6.

## 2026-09-30 — walking skeleton step 4: sign in and the three sections (web)

- `apps/mobile`: email + password sign-in and sign-up through Supabase
  Auth (`src/auth/auth.ts`, the swappable placeholder for PRD open
  question 2), Turkish messages for every Auth failure, and the three
  sections Ana Sayfa / Geçmiş / Hesabım behind a guard: `app/(app)` sends
  a signed-out visit to `/giris`, `app/(auth)` sends a signed-in one to
  `/`. Hesabım shows the email and "Çıkış yap". First screens built from
  `docs/design`: theme in `src/ui/theme.ts`, Atkinson Hyperlegible Next
  through `expo-font`, icons through `react-native-svg`.
- New dependencies in `@kefe/mobile`: `@supabase/supabase-js`,
  `expo-font`, `react-native-svg`, and `zod` pinned to core's 4.6.5 (bump
  all four together now).
- Tests: `src/auth/auth.test.ts` drives the real supabase-js client over
  a fake fetch and in-memory storage; seen red first against a stub that
  always succeeded (12 of 12 failing). `src/ui/theme.test.ts` fails when
  the theme drifts from `docs/design/tokens.json` (seen red with one
  colour changed).
- Verified: Expo web driven with Playwright, Auth faked at the network
  edge (GoTrue's 400 `invalid_credentials` for a wrong password):
  signed-out `/`, `/gecmis`, `/hesabim` land on `/giris`; a wrong password
  shows the Turkish alert and leaves no `sb-*-auth-token` in
  localStorage, also after a reload; the right one stores it and the
  three tabs render; sign-out clears it.
- `evaluator-qa`: NEEDS_WORK on the first pass ("Göster" clipped at
  320 px and 200 % text; tabs without `aria-selected` on the web), PASS
  after the fix. Screenshots in `docs/screenshots/skeleton-step-4/`.
- Review findings fixed (tests seen red first, 9 of 18): with email
  confirmation on, Auth answers a repeat sign-up with a user without
  identities and no session, which read as a new account; failures now
  name their field so only that input turns red; a failed sign-out shows
  a message instead of a stuck button. Pitfall: the local stack has
  confirmations off, so the repeat-sign-up case exists only in hosted
  Supabase.
- Pitfall: `CI=1 npx expo start --web` does not watch files; restart it
  (with `--clear`) after edits or the old bundle is served.
- Open: iOS keeps the session in memory only (no localStorage); step 6
  must add a persistent store. "Şifremi unuttum" (design 02) is not built:
  forgot-password is undrawn and has no ROADMAP item yet.
- Next ROADMAP item: skeleton step 5.

## 2026-09-30 — walking skeleton step 3: mock extraction Edge Function

- `@kefe/core` gains `parseExtraction` and the Zod `extractedReceiptSchema`
  (store, ISO date, total and item amounts as integer kuruş, raw line per
  item, unknowns `null`). Its test was seen red first against a stub that
  accepted everything (13 of 17 new cases failing).
- Migration `20260930090000_extraction.sql`: `store_name`, `purchased_on`,
  `source` ('mock' | 'ai') and `error_code` on `receipts`, checks that a
  draft has a source and a failure a code, and two `security invoker`
  functions, `record_extraction` and `record_extraction_failure`, that
  write the receipt and replace its items in one transaction under RLS.
- `supabase/functions/extract-receipt`: Deno entry `index.ts`, the logic in
  `handler.ts` (no Deno APIs, so the workspace's `tsc` checks it), the
  adapter seam and the mock in `adapter.ts`. Every call runs as the caller
  (anon key + the user's token); no service key. The anon key is refused
  by role (it is also a valid token). `{ mock: "invalid" }` makes the mock
  answer malformed output, only while the mock is the adapter.
- Verified: migrations and functions on a scratch Postgres 16 with stubbed
  `auth`/`storage`; the handler against a fake fetch; `verify.sh` locally
  with the Supabase suite NOT RUN. CI's `verify` runs
  `tests/extract-receipt.test.ts`; seen red in CI against a stub handler
  that stored output unvalidated and marked it `ai` (5 of 12 failing: the
  mock marker and every invalid-output case; the refusals held).
- Pitfalls: the function imports core by relative path with `.ts`
  extensions (Deno needs them; `allowImportingTsExtensions` is on in the
  base tsconfig). `zod` is pinned to the same exact version in
  `packages/core`, `supabase/package.json` and
  `functions/extract-receipt/deno.json`: bump all three together. The
  root `zod` is Expo's 3.x, which is why `@kefe/supabase` needs its own.
- Review finding fixed: items inserted in one statement share `created_at`
  (`now()` is the transaction's start), so reading them back fell to
  random ids and shuffled the paper's order. `receipt_items.line_no` now
  holds the printed position; readers order by it. Test seen red in CI
  before the column existed. Pitfall: numbering
  `jsonb_to_recordset` rows needs
  `rows from (jsonb_to_recordset(...) as (cols)) with ordinality`; a
  column list directly after `with ordinality` is an error.
- Open: owners can call the two write functions directly, as they can
  already update receipts (step 2's open point); step 5's `save_receipt`
  and the real adapter (v1 11) should decide what only the server writes.
- Next ROADMAP item: skeleton step 4.

## 2026-09-30 — walking skeleton step 2: schema, RLS, private storage

- Migration `20260930080000_receipts.sql`: `receipts` (status, total
  kuruş, idempotency key unique per user, image path forced under the
  owner's folder), `receipt_items` (raw text, name, amount kuruş), RLS on
  both with owner-only policies `to authenticated`, a private `receipts`
  bucket (10 MiB, jpeg/png/heic/webp) with policies on the first folder
  segment being the caller's user id.
- `supabase/tests/ownership.test.ts` signs up two users through Auth and
  drives REST and Storage with the anon key only. Seen red in CI's run of
  the first commit (tables and bucket, no policies): 7 of 13 failing, B and
  anon reading A's rows, A refused in their own folder. The cases the
  review asked for (items update/delete/move, image overwrite/delete) were
  seen red against deliberately loosened policies before restoring them.
- Verified: migration and policies applied to a scratch Postgres 16 with
  stubbed `auth`/`storage` schemas and exercised as `authenticated`/`anon`;
  `verify.sh` locally with the Supabase suite NOT RUN; CI's `verify` is the
  real run.
- Open: owners can still update `status` and totals directly; step 5's
  `save_receipt` should decide which columns only the server writes. No
  `updated_at` yet.
- Open: deleting a receipt (or an account, through the `auth.users`
  cascade) removes rows but leaves the image in the bucket. The
  delete-receipt and delete-account items (v1 5 and 9) must remove the
  storage objects themselves.
- Learned from the review: through PostgREST every write carries
  RETURNING, so the SELECT policy also guards updates and deletes; and
  Storage's upsert/replace also need the INSERT policy. A test only goes
  red for a loose write policy when those are loose too.
- Next ROADMAP item: skeleton step 3.

## 2026-09-30 — visual design from the logo

- Owner asked to design the screens from the new logo before building.
  Delivered a design canvas on claude.ai (16 screens + design system
  sheet) and, in the repo, `docs/design/` (DESIGN.md, tokens.json, logo
  assets, PNG renders) and ADR-0003 (palette, Atkinson Hyperlegible Next).
- Verified: contrast of every text/background pair computed (all AA);
  screens rendered with Playwright and looked at; prettier on the docs.
  No code changed, so no screenshot of the app itself.
- Open: sign-up, forgot-password, privacy text page, delete-account
  confirmation and admin tables are not drawn yet (listed in DESIGN.md).
  Next ROADMAP item unchanged: skeleton step 2.

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
