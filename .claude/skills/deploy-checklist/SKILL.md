---
name: deploy-checklist
description: Pre-deploy verification checklist — run before any production deploy, when asked to "deploy", "ship", "release", "canlıya al", or "yayınla". Walks the generic gates, then the product's own deploy steps.
---

# /deploy-checklist

Walk every item IN ORDER; report each as pass / fail / not-applicable-because.
A fail stops the deploy — no "deploy anyway" without my explicit say-so.

## Generic gates (every product)

1. Working tree clean, on the release branch, synced with remote.
2. CI green on this exact commit: the `verify` check on the commit `main`
   points at — the required check that let it merge. Do not run the
   battery locally instead: a local tree can carry deps or state CI does
   not, and CI's run is the one the merge gate trusted.
3. No secrets in the diff since last deploy (`git diff <last-tag>..HEAD`
   scanned for keys/tokens/passwords).
4. Migrations/data changes: reversible, or the irreversibility is stated
   and acknowledged.
5. Release notes exist for the range (offer /release-notes if not).
6. `evaluator-qa` on every ROADMAP item marked done since the last deploy:
   it grades each done-when clause against the running app, not the
   tests. One NEEDS_WORK stops the deploy. This is the only pass that
   checks every clause, not just the ones the battery could not see.

## Release

This runs in a LOCAL session on the owner's machine — never in a project
thread. Every step that changes production waits for my explicit
go-ahead, each time. 7. Run the product's deploy steps (below) from this machine, in order,
stopping at the first failure. 8. Verify — the health check answering, the smoke-test flow — and only
then push the release tag (`vX.Y.Z` on the deployed commit). The tag
marks what is live; for an iOS surface it is also what Xcode Cloud
archives to TestFlight: confirm the build appears, then open it on a
device. Rollback is the product's rollback command below.

## Product steps

All three targets are ask-tier: each command below runs only on the
owner's explicit per-instance yes. Project refs (Supabase project, the
Cloudflare projects and their domains) are recorded in `docs/NOTES.md` by
the session that creates them; if they are missing, stop and report "no
deploy target provisioned". Credentials live on this machine only
(`npx supabase login`, `npx wrangler login`).

### Backend (Supabase)

B1. `npx supabase db push --dry-run` — review the migration list, then
`npx supabase db push`. Migrations are forward-only: an irreversible
one needs a written down-migration or an explicit acknowledgement
(gate 4).
B2. `npx supabase functions deploy` — then call each function's health
route (`/functions/v1/<name>/health`) and expect 200.
B3. Rollback: apply the down-migration; redeploy the previous functions
with `git checkout <prev> -- supabase/functions && npx supabase functions deploy`.

### Web and admin (Cloudflare)

W1. `npm run deploy -w @kefe/mobile` and `npm run deploy -w @kefe/admin`
(each wraps a production build and `wrangler`). Refuse a bundle that
points at a local or non-https Supabase URL: it is inlined at build
time.
W2. Fetch `/` on both hostnames and expect 200 with a certificate that
verifies; sign in to the admin and see the data screens load.
W3. Rollback: `npx wrangler rollback` or redeploy the previous commit's
build.

### App (iOS)

[STACK: TODO — the iOS release path (EAS Build/Submit or Xcode Cloud) is
undecided; decide before the first TestFlight build. Until then this
section stops the release and reports "no iOS release path defined".]

Smoke test after any deploy: sign in, add a receipt in mock or real AI
mode, check and save it, see it in the monthly total and in History, open
a product's price history, delete the receipt and see the total drop.
