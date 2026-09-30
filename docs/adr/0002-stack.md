# ADR-0002: Stack

Status: accepted · Date: 2026-09-30

## Context

kefe ships a consumer app on iOS and the web, a read-only admin web app
and a backend that stores receipts privately, runs an AI extraction step
and enforces per-user access. It is built and maintained by one owner
with Claude threads that run in cloud containers without Docker or macOS,
so every surface except the iOS binary has to build and test on plain
Linux. The owner chose the stack from recommendations at instantiation
(docs/NOTES.md, 2026-09-30); this record keeps the reasons.

## Decision

- **TypeScript, strict, on Node 22** everywhere, so the money and receipt
  rules in `packages/core` are one implementation shared by the app, the
  admin and the Edge Functions.
- **Expo (React Native) with Expo Router** for `apps/mobile`: one
  codebase for iOS and the web. Continuous native generation, so no
  `ios/` project is checked in and nothing but the release build needs a
  Mac. React, React DOM and React Native are pinned once, through root
  `overrides`, to the versions the Expo SDK bundles; npm workspaces
  otherwise hoist a second React Native and Metro fails to bundle.
- **Vite + React** for `apps/admin`: a static SPA with no server of its
  own; it reads through Supabase with an admin role, never a service key.
- **Supabase** (hosted, EU region) for Postgres with row-level security,
  Auth, private Storage and Edge Functions. RLS keeps data access rules
  in the database, where the `@kefe/supabase` suite tests them against a
  real local stack; the AI provider key lives only in Edge Function
  secrets. The CLI is a pinned devDependency of `@kefe/supabase`, in step
  with the version CI installs.
- **npm workspaces** monorepo (`@kefe/core`, `@kefe/mobile`,
  `@kefe/admin`, `@kefe/supabase`): the package manager Node already
  ships, one lockfile, one `npm ci`.
- **Vitest** for tests, **ESLint** (typescript-eslint strict) and
  **Prettier** for lint and format, one root config each.
- **Cloudflare** hosts both web surfaces; iOS goes through TestFlight
  (release path still open, see CLAUDE.md "Deploy").

## Consequences

- One language and one test runner across every layer; core rules are
  tested once and imported everywhere.
- The `@kefe/supabase` suite needs Docker, so a cloud thread reports it
  NOT RUN and CI's `verify` job is its run.
- An Expo SDK upgrade must move the root `overrides` in the same commit.
- Android stays out until the PRD's open question 1 is answered; Expo
  keeps that door open without a rewrite.
