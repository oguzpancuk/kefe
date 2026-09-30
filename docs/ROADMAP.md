# kefe — Roadmap

<!-- Written via /mvp-scope from the PRD. Every item has a done-when clause
     naming its verification. Status moves only with evidence. -->

Items reference `docs/PRD.md` core interactions as `PRD #n`. Each
done-when clause names its verification (`test`, `screenshot`,
`manual check`) and what failure looks like, so the test has a red state
to show.

## Walking skeleton

<!-- The thinnest end-to-end path through every layer, completable in days. -->

One person signs in on the web, picks a receipt image, gets a clearly
labelled mock extraction, corrects one amount, saves it, and sees it in
the month's total. Every layer is touched once: Expo web UI → Supabase
Auth → private Storage → Edge Function (mock AI, Zod) → Postgres with RLS
→ `packages/core` → back to the UI.

1. [ ] **Monorepo boots and the battery is green.** npm workspaces
       `@kefe/mobile`, `@kefe/admin` (empty shell page), `@kefe/core`,
       `@kefe/supabase`; `docs/adr/0002-stack.md`; the template docs that
       fail `prettier --check` formatted. One real test in `@kefe/core`:
       `parseTlAmount("12,50")` returns `1250` kuruş. — done when: `test`
       — that test passes, `parseTlAmount("12.5.0")` and `""` are rejected
       (not `0`), it was seen red before the implementation, and
       `bash .claude/hooks/verify.sh` exits 0 on a clean HEAD (the
       `@kefe/supabase` suite may be NOT RUN locally; CI runs it). Failure
       looks like: any battery line FAIL, or the parser returning `1250.0`
       or a float.

2. [ ] **Schema, RLS and private storage.** Migrations for `receipts`
       (status, draft/saved, total kuruş, idempotency key, image path) and
       `receipt_items` (raw text, name, amount kuruş), RLS on both, a
       private `receipts` bucket scoped by user folder. — done when:
       `test` (`@kefe/supabase`) — user B selecting user A's receipt gets
       0 rows, B's insert of an item into A's receipt is refused, B's
       download of A's image errors, and anon gets nothing; the same
       queries as A succeed. Failure looks like: any row or object
       returned to B.

3. [ ] **Mock extraction Edge Function.** `extract-receipt` takes a receipt
       id, runs the adapter in mock mode (no key needed), validates the
       output with the Zod receipt schema from `@kefe/core`, writes a draft
       with `source = 'mock'`. — done when: `test` — a valid mock result
       yields a draft in state `kontrol bekliyor` marked mock; an output
       that fails the schema leaves the receipt `başarısız` with an error
       code and no items; a call for another user's receipt is refused.
       Failure looks like: invalid output stored as items, or a draft
       without the mock marker.

4. [ ] **Sign in and the three-section shell (web).** Email + password
       sign-up/sign-in through Supabase Auth (placeholder until PRD open
       question 2 is answered; swappable), bottom navigation Ana Sayfa /
       Geçmiş / Hesabım with visible Turkish labels, sign out on Hesabım.
       — done when: `screenshot` (web target) — a signed-out visit to any
       section lands on sign-in; a wrong password shows a Turkish error
       and no session is stored; after sign-in the three labelled
       sections render.

5. [ ] **Fiş ekle → Kontrol et → Kaydet on the web, into the month
       total.** "Fiş ekle" on Ana Sayfa opens a gallery/file picker,
       uploads to private storage, calls `extract-receipt`, shows the
       draft (store, date, total, items) with a visible "Örnek veri —
       fişiniz okunmadı" label; one item amount is editable; "Kaydet"
       calls an idempotent `save_receipt` (idempotency key per draft);
       Ana Sayfa shows the month's total of saved receipts, formatted by
       `@kefe/core`. — done when: `test` — calling `save_receipt` twice
       with the same key yields one saved receipt and the total counts it
       once; a draft never counts; an edited amount is what is saved —
       and `screenshot` — the full flow on the web ends with the home
       total equal to the saved receipt's (edited) total. Failure looks
       like: the total doubling on re-save, or a draft moving the total.

6. [ ] **Same flow in the iOS simulator.** — done when: `manual check`
       (owner, simulator, before merge) — steps 4–5 completed on iOS with
       the gallery; the home total matches the saved receipt. Failure
       looks like: the flow breaking only on iOS (picker, upload, auth
       storage).

## v1

Ordered. Each promotion from the deferred default carries its reason.

1. [ ] **Receipt model complete in `@kefe/core` and the check screen**
       (PRD #5) — why v1: correcting AI output is the product's trust
       point. All item fields (name, brand, quantity, package size,
       package count, category, amount), "Kontrol et" on uncertain fields,
       raw line kept, empty brand/size stays empty, total-vs-items
       difference. — done when: `test` (core: mismatch computed in kuruş,
       missing brand stays `null`, Turkish decimals) + `screenshot` (a
       mismatching sample shows the difference; an unsure field shows the
       text label). Failure: a guessed brand, or a mismatch hidden.

2. [ ] **Processing states and retry** (PRD #4) — why v1: without it a
       failed read strands the person. — done when: `test` — a forced
       failure ends `başarısız` with retry; retrying and re-sending an
       interrupted upload (same idempotency key) end in one receipt +
       `screenshot` of the Turkish failure message with "Tekrar dene".
       Failure: two receipts after a retry.

3. [ ] **Home complete** (PRD #2) — why v1: it is the first screen. Month
       selector, last three purchases, plain category summary (six
       starting categories), empty state text. — done when: `test`
       (core: per-month and per-category sums over saved receipts only) +
       `screenshot` (empty state; two months show different totals).
       Failure: a draft or another month's receipt in the sum.

4. [ ] **History and receipt detail** (PRD #7, without search) — why v1:
       finding an old purchase is a core job. Newest first per month,
       detail with items, original image via expiring signed URL, edit.
       — done when: `test` (signed URL for another user's image refused;
       expired URL fails) + `screenshot` (order, detail, edit reflected
       in the home total). Failure: another user's image reachable.

5. [ ] **Delete a receipt** (PRD #9) — why v1: privacy promise; must exist
       before any real user. — done when: `test` — after delete, the
       receipt, its items, its price observations and its storage object
       are gone and the month total drops by its amount. Failure: an
       orphan item, observation or image.

6. [ ] **Unit price and change math in `@kefe/core`** (PRD #8, logic) —
       why v1: the price-history promise is wrong without it. — done
       when: `test` — 1 kg 50,00 → 1 kg 60,00 = +20 %; 500 g vs 1 kg
       compared per kg only; 2 × 500 g = 1 kg; unknown size, single
       record or old price 0 → no comparison; discount paid vs list kept
       apart; unsplittable basket discount and returns excluded. Failure:
       any of those producing a number where none is allowed.

7. [ ] **Product catalog and price observations** (PRD #13) — why v1: the
       product history screen and the admin both read it. Exact-match
       merge only; personal fields never enter observations;
       non-consenting users' observations flagged out. — done when:
       `test` — same product from two receipts → one product; different
       size → two products; an observation has no address/phone/card
       field; RLS ownership test on the new tables. Failure: an ambiguous
       match merged.

8. [ ] **Product price history screen** (PRD #8, UI) — why v1: the
       product's headline feature. — done when: `screenshot` — two
       equivalent purchases show both rows and the core-computed change;
       a single purchase shows no comparison. Failure: a percentage on a
       single record or across unknown sizes.

9. [ ] **Hesabım complete and delete account** (PRD #10) — why v1:
       required before any real user. Account info, privacy text in-app
       (AI provider transfer named), commercial-analysis consent (off by
       default), delete account. — done when: `test` — after account
       deletion no receipt, item, observation or storage object of that
       user remains and sign-in fails + `screenshot` (privacy text,
       consent off by default). Failure: any leftover row or object.

10. [ ] **Camera path on iOS** (PRD #3) — why v1: most receipts are
        photographed. Camera or gallery choice, "Fişin tamamı görünsün.",
        preview/retake, gallery offered when camera is denied, bad image
        rejected before upload. — done when: `test` (image validation
        rejects wrong type/oversize) + `manual check` (owner, device:
        camera capture saves; denying camera still offers gallery; no
        permission asked at first launch). Failure: a dead end after
        denial.

11. [ ] **Real AI adapter** (PRD #11) — why v1: the mock only proves the
        pipe. Blocked on PRD open question 7 (provider, cost ceiling). —
        done when: `test` — with a key, adapter output passes the same
        schema and the mock label is absent; with no key, mock label
        present; receipt text containing instructions is stored as data;
        logs contain no receipt content. Failure: the mock label shown
        on a real read or missing on a mock one.

12. [ ] **Large text and accessibility pass** (PRD #12) — why v1: the
        target user. — done when: `screenshot` (web, 200 % text: the full
        flow with no clipped controls; every icon labelled) +
        `manual check` (owner, iOS largest Dynamic Type: same flow).
        Failure: a clipped or icon-only control.

13. [ ] **Admin monitoring, read-only** (PRD #14) — why v1: the team must
        see the collected data from the first real users. Scope pending
        PRD open question 4. — done when: `test` (non-admin refused by
        RLS; no write path; no service key in the bundle) + `screenshot`
        (counts, job states, catalog, observations). Failure: a
        non-admin seeing any row.

14. [ ] **Usability check with target users** (success signal) — why v1:
        the PRD's own acceptance bar. — done when: `manual check` (owner)
        — at least 4 of 5 target users save a first receipt in under 2
        minutes without help; result recorded in `docs/NOTES.md`.
        Failure: fewer than 4 of 5.

## Deferred

- **Product search in history** (PRD #7) — why it can wait: the source
  marks it optional; the month picker plus product history covers
  finding a purchase for the first users.
- **Duplicate-content warning** (PRD #6) — why it can wait: retries are
  already covered by idempotency (skeleton 5, v1 2); a person saving the
  same paper twice is rare and fixable with delete.
- **Android** — why it can wait: out of the chosen stack; PRD open
  question 1.
- **Everything in the source P1** (repurchase prediction and
  notifications, community price comparison, PDF / e-invoice, multi-
  document upload, family accounts) — why it can wait: PRD Non-goals;
  prediction needs ≥ 4 purchases per product that nobody has yet.
- **Notification preference on Hesabım** — why it can wait: no MVP
  feature sends notifications (PRD open question 6).
- **Anonymization for external reports** — why it can wait: no data
  leaves the team in the MVP; required before any external sharing.
