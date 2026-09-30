# Project instructions — kefe

<!-- SOURCE of the project's instructions field (Project settings > Memory).
     Edit here, commit, paste again. Rules about the repository itself live
     in CLAUDE.md, which every thread reads from its clone. -->

## About

<!-- Written by /mvp-scope from docs/PRD.md and docs/ROADMAP.md; re-run it
     and paste again whenever the ROADMAP changes. The coordinator has no
     clone: this block is what it knows about the product. -->

- Product: kefe — receipt-scanning shopping assistant for Turkish adults
  not used to apps (40+): photograph a receipt, check what the AI read,
  save it, see monthly spending and each product's personal price
  history. Turkish UI, English code. Spec: docs/PRD.md.
- Areas: `apps/mobile` (Expo, iOS + web, consumer app); `apps/admin`
  (read-only admin SPA); `packages/core` (pure TS: money in kuruş, units,
  unit price, receipt schema); `supabase/` (migrations, RLS, private
  storage, Edge Functions incl. the AI adapter with mock mode).
- Walking skeleton, in order:
  1. Monorepo boots — done when one real core test (`"12,50"` → 1250
     kuruş, bad input rejected) passes and verify.sh exits 0.
  2. Schema, RLS, private storage — done when user B gets nothing of
     user A's receipts, items or images (test).
  3. Mock extraction Edge Function — done when valid mock output makes a
     mock-marked draft and schema-invalid output makes `başarısız` with
     no items (test).
  4. Sign in + three labelled sections on web — done when signed-out
     visits land on sign-in and a wrong password stores no session
     (screenshot).
  5. Fiş ekle → Kontrol et → Kaydet on web into the month total — done
     when double save counts once, drafts never count (test) and the
     home total equals the saved receipt (screenshot).
  6. Same flow in the iOS simulator — done when the owner completes it
     (manual check).
- v1 = the MVP, the full PRD scope (owner decision): complete check
  screen; processing states, retry and duplicate warning; home complete
  (month picker, last three, categories, empty state); history, search and
  receipt detail; delete a receipt; unit price and change math in core;
  product catalog and price observations; product price history screen;
  Hesabım + privacy text + consent + delete account; camera path on iOS;
  real AI adapter (blocked on provider choice); large text pass; read-only
  admin monitoring; usability check with 5 target users.
- Deferred (only what the PRD leaves out): Android (not in the stack); source P1 — prediction, community prices,
  PDF/e-invoice, multi-upload, family accounts (PRD non-goals);
  notification preference (nothing sends notifications); anonymization
  for external reports (no data leaves the team).

## Work

- The plan is `docs/ROADMAP.md`, written by me. Threads execute it in
  order; nobody re-plans it here. Whatever I paste is the task; if a
  ROADMAP item already covers it, say so instead of starting a second
  thread.
- One feature per thread. A second problem found on the way goes into
  `docs/NOTES.md`, not into the fix.
- When a thread reports back, it names the ROADMAP item it completed and
  the next unstarted one. The coordinator has no clone; this is how it
  knows where the build order stands.
- Propose threads before starting them; at most two at a time until I say
  otherwise.

## Pull requests

- Start from `main`, work on your own branch, open one pull request per
  thread. The body names the done-when clause it satisfies and carries
  screenshots of what changed on the web surface (CLAUDE.md, Looking at
  it); what else it carries, CLAUDE.md says.
- A `manual check` clause is listed in the body as "awaiting the owner's
  check on a device", with what to try. I check before merging, from a
  local session on the web or in the simulator; the thread does not
  report that item done and never triggers a build.
- `main` is protected: CI green and up to date with `main`, or no merge.
  When `main` moves under your open pull request, merge it into your branch
  yourself.

## Review

- When a thread opens a pull request, start a review thread for it. Its
  task: `/code-review --comment` on the pull request — never `--fix`. If
  `--comment` cannot post from the thread, post each finding as a pull
  request comment yourself, file and line included.
- In a summary comment it also checks that every new test covers the clause
  it claims and that the body shows its red run, then ends with APPROVE or
  NEEDS_WORK and one sentence why.
- The review thread keeps watching the pull request. After each push it
  reviews the delta the same way, until its summary says APPROVE. The
  authoring thread fixes what the review posts.

## Ask me first

- Deploys and release tags are not done from this project at all: I run
  them from a local session. Anything else outward-facing — DNS,
  third-party dashboards, production data — ask me first.
- A schema or API change that is not reversible in one commit.
- A dependency that is not clearly better than the standard library.

## Memory

- Project memory stays in this project. What is about the repository — a
  pitfall, a template improvement, a battery miss — also goes into
  `docs/NOTES.md`, under the section CLAUDE.md names. Only the repo reaches
  the other products.
