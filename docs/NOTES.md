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

## Battery gaps

<!-- Every time evaluator-qa or production finds something the battery
     passed: date · done-when clause · what the battery missed · the test
     added. This is how the battery learns. /update-stack harvests the
     classes of miss so other products' batteries can close them too. -->

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
