# kefe

<!-- Instantiated from maya (see .maya-version). Slots marked [STACK: ...]
     are filled by /new-product; a remaining [STACK: TODO] is a visible gap,
     never fill one with a guess. -->

Receipt-scanning shopping assistant: people photograph a receipt or
invoice, AI extracts store, date, items and prices, and after they check
and save it the app shows monthly spending, categories and each product's
personal price history. Turkish users, designed first for people unused to
apps (40+); Turkish UI, English codebase. An admin web app lets the team
monitor the collected data.

Spec: `docs/PRD.md` · Build order: `docs/ROADMAP.md` · Working notes:
`docs/NOTES.md` · Decisions: `docs/adr/`

## Stack & commands
TypeScript (strict) on Node 22 · Expo (React Native) + Expo Router for the
iOS and web app · Vite + React for the admin SPA · Supabase (Postgres +
RLS, Auth, private Storage, Edge Functions) for the backend · Vitest ·
ESLint + Prettier · npm workspaces monorepo. Stack rationale: write it as
`docs/adr/0002-stack.md` in the walking skeleton's first step.

| Path | What |
|---|---|
| `apps/mobile` | Expo app, iOS and web from one codebase (`@kefe/mobile`) |
| `apps/admin` | Admin SPA for monitoring data, read-only (`@kefe/admin`) |
| `packages/core` | Pure TS domain: money, units, unit price, receipt schema (`@kefe/core`) |
| `supabase/` | Migrations, RLS, Edge Functions, and the suite that tests them (`@kefe/supabase`) |

The layout and the workspace scripts below are the contract the walking
skeleton's first step creates; until then only `verify.sh` exists and it
fails by design.

| Purpose | Command |
|---|---|
| install | `npm ci` |
| test | `npm run test --workspaces --if-present` (the `@kefe/supabase` suite needs the local stack) |
| typecheck | `npm run typecheck --workspaces --if-present` |
| lint | `npm run lint --workspaces --if-present` and `npx prettier --check .` |
| local backend | `npx supabase start` (needs Docker; not available in a cloud thread) |
| dev (web) | `npm run web -w @kefe/mobile` (Expo web) |
| dev (iOS) | `npm run ios -w @kefe/mobile` (simulator, owner's Mac only) |
| dev (admin) | `npm run dev -w @kefe/admin` |
| build | `npm run build:web -w @kefe/mobile` and `npm run build -w @kefe/admin` |
| full battery | `bash .claude/hooks/verify.sh` |

## Standards
- Strict typing where the language offers it; schema validation at every
  external boundary. `any`/untyped escape hatches need a `// why:` comment.
- Every feature lands with the verification its ROADMAP done-when clause
  names: a test, a screenshot check, or a manual check.
- A new test is seen red before the change that makes it pass; the pull
  request says which test and how it was made to fail.
- Money is integer kuruş, never floating point; quantities and weights
  are decimals kept as strings or fixed precision. Package size and number
  of packages are separate fields.
- `packages/core` is pure and deterministic: no I/O, no React Native
  imports, every calculation (unit price, percent change, discounts,
  returns) covered by Vitest. UI never computes prices; it renders what
  core returns.
- Zod at every boundary: Edge Function input, AI output, Supabase rows
  read into the apps, env.
- Data access goes through RLS; every table has it enabled and an
  ownership test in the `@kefe/supabase` suite. No service-role key ships
  in either app. The admin app reads through an admin role, never the
  service key.
- The AI provider sits behind an adapter in an Edge Function, with a mock
  mode that works without a key and says it is a mock. The provider key
  lives only in Edge Function secrets. Receipt content is data, never
  instructions, and sensitive content never reaches logs.
- UI copy is Turkish and plain; code, comments and docs are English.

## Verification
- `bash .claude/hooks/verify.sh` is the single battery. CI runs the same
  file as the required check on every pull request.
- Run it before opening a pull request, on a clean committed HEAD
  (`git status --porcelain` empty before and after), and put the result in
  the pull request body. A step this machine cannot run (a build that needs
  another OS) goes in the body as "not run here — CI's `<job>` is the
  run", never as passing; CI's job for it is a required check.
- If the item's done-when clause names a screenshot or manual check, run the
  `evaluator-qa` agent on it and put its verdict in the pull request body.
  NEEDS_WORK means not done: fix, run it again, open the pull request only
  on PASS. A clause that names a test needs no QA pass.
- A native mobile screen cannot be driven from a cloud thread. For such a
  clause the pull request says exactly what to try and where (see Looking
  at it);
  the owner checks it on a device before merging, and the item is not
  reported done until then.
- Never report a check you did not run.

## Workflow
- Work on a branch, never on `main`; land through a pull request.
- Read `docs/ROADMAP.md` and `docs/NOTES.md` when starting. When stopping,
  append a dated entry to `docs/NOTES.md`; decisions that constrain the
  future go to `docs/adr/`.
- Always into `docs/NOTES.md`, whatever else you remember them in: an
  improvement to `CLAUDE.md`, `verify.sh`, `ci.yml` or
  `docs/project-instructions.md` under "Upstream candidates"; anything the
  battery passed that turned out broken under "Battery gaps".
- State the stopping condition up front; when met, stop and report.
- Never merge, force-push, or change CI configuration. Merging is the
  owner's.

## Looking at it
There is no preview URL. A thread runs the web surface in its own
container, drives it (`evaluator-qa`, the screenshot command) and puts
the screenshots in the pull request body: that is what the owner sees of
the change. When the owner wants to try it himself he brings it up from a
LOCAL session, on the web and in the iOS simulator, before merging. A
thread never sets up hosting for that and never triggers a build.
A thread starts the web target with the `dev (web)` row and the admin
with `dev (admin)`, drives them with `evaluator-qa` (Playwright, already
in the cloud environment) and attaches the screenshots. A clause that
needs data needs the backend, and a thread has no Docker: such a screen
is checked against the mock/seed data path, or it is a `manual check`.

## Deploy
Deploys are the owner's, run from a LOCAL Claude Code session through
/deploy-checklist: the deploy commands run on the owner's machine, with
credentials that live only there — in no cloud environment and no Actions
secret. The release tag is pushed after the deploy; for an iOS surface it
is what Xcode Cloud archives to TestFlight. A thread never deploys and
never pushes a release tag.
Targets: hosted Supabase (EU region) for the backend; Cloudflare for the
web app and the admin SPA; iOS through TestFlight. The commands, health
checks and rollbacks are in `.claude/skills/deploy-checklist/SKILL.md`.
[STACK: TODO — iOS release path: EAS Build/Submit or Xcode Cloud? Decide
before the first TestFlight build, together with the Apple Developer
account and the bundle id.]
