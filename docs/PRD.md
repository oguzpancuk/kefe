# kefe — PRD

<!-- Written via /spec. Every core interaction carries a verifiable
     "works when…" clause; nothing ships without one. -->

Source: the owner's Turkish MVP spec "Alışveriş Asistanı — MVP Ürün ve
Geliştirme Spesifikasyonu" v0.1 (2026-09-30), kept outside the repo. This
PRD is its English build contract. The source's P1 list (repurchase
prediction, community price comparison, multi-page PDF / e-invoice,
multi-document upload, family account) is out of this PRD; see Non-goals.

## Problem

Prices in Turkey change fast. People cannot remember what they paid for a
product last time, do not track what they spend, and cannot compare the
price of the same product across dates. Paper receipts hold that record
but nobody keeps or reads them.

kefe makes a person's own purchase records visible: photograph a receipt,
check what the AI read, save it, and see monthly spending and each
product's personal price history. It shows past purchases only. It never
claims a price rise is profiteering, that official inflation is wrong, or
that a recorded price is today's shelf price.

A second, background layer standardizes products and price observations
across receipts so the team can later analyze prices, stores and purchase
frequency. In the MVP that data is only monitored internally; nothing is
sold or shared outside.

## User

An adult shopping in Turkey, 40–50 or older, not used to apps — someone
who has never installed a finance or scanning app and will not read help
text. Age is not treated as the measure of skill: the design target is a
first-time user of any age.

The single job: "Show me what I spent this month and what I paid for this
product before — without making me learn an app."

## Core interactions

<!-- Numbered. These are the product. "Works when…" must be checkable by a
     person clicking through the app. -->

Navigation has exactly three sections with visible Turkish labels:
Ana Sayfa, Geçmiş, Hesabım. The receipt flow is three steps: choose or
take the photo → check → save.

1. **Sign up, sign in, sign out.** — works when: a new person creates an
   account, adds a receipt, signs out, signs back in and sees the same
   receipt; a second account signed in on the same device sees none of the
   first account's receipts, images or totals.

2. **Home screen.** Selected month's total spending, one dominant
   "Fiş ekle" button, the last three purchases, and a plain category
   summary (list or bars with labels and amounts — no complex chart, no
   filters, no chat, no analytics panel). — works when: with no saved
   receipts it shows "İlk fişini ekle, harcamalarını takip etmeye başla."
   and the button; after saving receipts in two different months, switching
   the month shows each month's own total and categories.

3. **Add a receipt from camera or gallery.** Tapping "Fiş ekle" then offers
   camera or gallery, with the hint "Fişin tamamı görünsün."; the chosen
   image is previewed with retake and send. — works when: a receipt can be
   added both from the camera and from the gallery; denying camera
   permission leaves the gallery path offered on the same screen; an
   unsupported file type, oversized or unreadable image is rejected with a
   plain message and "Tekrar fotoğraf çek", before anything is saved.

4. **Processing status and retry.** Processing is not a page of its own:
   after sending, the person lands on the check screen, which shows a
   waiting state with the single phrase "Fiş okunuyor" until the draft
   is ready. The system states (yükleniyor, sırada, işleniyor, kontrol
   bekliyor, kaydedildi, başarısız) are internal and never shown by
   name. — works when: between sending and the draft, the only text the
   person sees is "Fiş okunuyor" (no "sırada", "işleniyor" or other
   state name anywhere in the UI); the flow stays three steps (photo →
   check → save) with no extra page; a forced processing failure shows a
   plain Turkish message and a "Tekrar dene" action; retrying, or
   re-sending after the network drops mid-upload, ends in exactly one
   receipt, never two.

5. **Check and correct the draft.** The check screen shows store, date,
   total and the item list. Fields the AI was unsure of carry a visible
   "Kontrol et" label (text, not colour alone). Tapping an item opens its
   edit view showing only name and amount first; brand, package size,
   number of packages and category sit under a closed "Diğer bilgiler"
   section that opens on tap (the data model keeps all fields). If one of
   those hidden fields carries "Kontrol et", the section shows that label
   while closed. Unreadable brand or package size stays empty, never
   guessed. The raw receipt line is kept next to the edited values. —
   works when: the edit view opens with only name and amount visible;
   every listed field can be changed and the change survives save and
   reopen; an unsure hidden field is flagged on the closed "Diğer
   bilgiler"; a receipt whose items do not add up to its total shows the
   difference in kuruş on the check screen; an item with no readable
   brand shows an empty brand field, not an invented one; the person can
   save without confirming each field one by one.

6. **Save.** Saving turns the draft into a purchase that counts. — works
   when: after save, the home month total and category summary increase
   by exactly the receipt's total; an unsaved draft changes neither;
   tapping save twice or re-sending the save request counts it once;
   saving a receipt with the same image or the same store, date and total
   as an existing one shows a duplicate warning, and nothing is deleted
   automatically.

7. **History and receipt detail.** Purchases sorted by date showing store
   and total, a simple month picker, and a product search. The detail shows
   items, the original image, edit and delete. — works when: receipts
   appear newest first within the chosen month; searching a product name
   finds the receipts containing it; the original image opens from the
   detail through a link that stops working after it expires; an edit made
   from the detail is reflected in the home totals.

8. **Product price history.** From an item, the person sees every time
   they bought that product: date, store, quantity and price, and the
   change between equivalent purchases, computed in `packages/core` as
   (new unit price − old unit price) / old unit price × 100. — works when:
   with two equivalent purchases (e.g. 1 kg at 50,00 TL, then 1 kg at
   60,00 TL) it shows both rows and +20 %; a 500 g and a 1 kg pack are
   compared only per kilogram, never by pack price; with only one
   purchase, or with size/quantity unknown, or an old price of zero, no
   comparison is shown; two 500 g packs count as 1 kg; a discounted price
   is shown as paid with the pre-discount price separate; a basket
   discount that cannot be reliably split across items and a returned
   item are excluded from the change calculation.

9. **Delete a receipt.** — works when: after deleting a receipt it is gone
   from history, the home total and category summary drop by its amount,
   its items no longer appear in any product price history, and its image
   is no longer retrievable from storage.

10. **Account screen and delete account.** Hesabım shows account info, a
    plain privacy/data-use explanation (including that receipt images are
    sent to an AI provider, and what the team does with the data), the
    commercial-analysis consent choice, sign out and delete account. The
    consent is labelled in plain words, never "ticari analiz izni";
    placeholder wording until the owner fixes it (open question 12):
    "Verilerim isimsiz fiyat araştırmalarında kullanılabilir". — works
    when: the privacy text is readable in the app without leaving it; no
    screen shows the words "ticari analiz"; commercial-analysis consent
    is off unless the person turns it on,
    and the app works fully with it off; after deleting the account the
    person cannot sign in, and none of their receipts, items, price
    observations or stored images remain.

11. **Mock and real AI are distinguishable.** — works when: with no AI
    provider key configured the app still completes the whole flow on
    sample extraction, and every screen that shows extracted data says
    plainly that it is sample data, not a read of the photographed
    receipt; with a key configured that label is absent.

12. **Large text and plain accessibility.** — works when: with the device's
    largest text setting, the whole flow (sign in → Fiş ekle → check →
    save → home → history → product history) can be completed with no
    clipped or overlapping controls; every icon has a visible Turkish
    label; touch targets are at least 48×48; body text is at least 16 and
    key figures 18–24 (one exception, owner
    decision 2026-09-30: the home screen's month total is 40); no state is shown by colour alone; the first launch
    asks for no permission (camera is asked only when the camera is
    chosen).

13. **Background catalog and price observations.** Every saved item is
    linked to a standard product (name, brand, variant, package
    size/unit) and produces a price observation (product, store/branch,
    date, quantity, paid price, unit price, data-quality state). Only
    exact matches on brand, product, variant and package size merge;
    ambiguous matches stay separate. Address, phone and card fragments
    never enter observations. — works when: saving the same product from
    two receipts links both to one product; a similar but not identical
    product (different size) stays a separate product; observations of
    people without commercial-analysis consent are flagged out of the
    analysis set.

14. **Admin monitoring (read-only).** A separate admin web app lets the
    team see the collected data. — works when: an admin account sees
    receipt counts, processing-job states and failures, the product
    catalog and price observations; a non-admin account is refused; the
    admin app offers no edit or delete and holds no service-role key.

## Non-goals

- Everything in the source spec's P1: repurchase prediction and
  notifications, community price comparison between stores, multi-page
  PDF / e-invoice, multi-document upload, family accounts. Nothing in the
  UI hints these exist.
- Live store stock, "cheapest store" recommendations, delivery, bank
  integration, automatic home inventory, ads, a commercial data portal,
  selling or transferring data to outside companies.
- Complex charts, filters, chat or analytics on the consumer app.
- Judging prices: no "profiteering" or "real inflation" claims.
- Anonymization for external reports — required before any external
  sharing, designed separately, not built now.
- Android as a release target (see Open questions).

## Constraints

- **Language:** UI Turkish, short plain sentences, no technical terms;
  code and docs English. Dates shown in Türkiye local date.
- **Platforms:** iOS and web from one Expo codebase; admin as a separate
  web SPA. Stack per `CLAUDE.md` (Supabase EU, Cloudflare, TestFlight).
- **Money and quantities:** integer kuruş; quantities and weights as
  fixed-precision decimals; package size and package count separate
  fields; Turkish decimal input (`12,50`) parsed correctly. All price math
  in `packages/core`.
- **AI:** provider behind an adapter in an Edge Function, key only in
  Edge Function secrets, structured output validated as untrusted input
  with Zod; receipt content is data, never instructions; mock mode works
  without a key. Raw AI output and user corrections are both kept and
  traceable.
- **Privacy:** each person reaches only their own records (RLS, ownership
  test per table); private storage with expiring links; no sensitive
  receipt content in logs or analytics; personal fields (address, phone,
  card fragments) kept out of product/price data. Original images kept
  90 days (proposed, see Open questions); text records until the person
  deletes them. These are product requirements, not legal (KVKK)
  clearance.
- **Idempotency:** upload and save endpoints are idempotent; lists are
  paginated; summaries count saved receipts only.
- **Budget / deadline:** not stated (see Open questions).

## Success signals

- **Usability (validation target, not yet measured):** at least 4 of 5
  target users with mixed digital experience save their first receipt
  within 2 minutes, without training or help.
- **Correctness (automated, gates every change):** tests pass for
  ownership violation, repeated save, Turkish decimal amounts, weighed
  item, package/count split, discount, return, missing brand/size, total
  mismatch, AI schema error and network interruption.
- **Integrity (observable in admin):** zero duplicate purchases from
  retries; zero saved receipts counted in totals while still drafts.
- **Honesty:** the build report states what was tested and which external
  integrations (real AI provider, hosted backend, TestFlight) are missing.

## Open questions

<!-- Unresolved — owner answers these, agents don't guess them. -->

1. **Android:** the source spec says iOS/Android; the chosen stack ships
   iOS + web. Is Android out of the MVP?
2. **Sign-in method** for a 40+ first-time user: email + password, email
   magic link / code, phone SMS code (cost), Sign in with Apple?
3. **Commercial-analysis consent in the MVP:** only a stored toggle
   (default off) that flags observations out of the analysis set — or
   also a consent screen at sign-up?
4. **Admin app scope:** what exactly must the team see in the MVP beyond
   counts, job states, catalog and observations? Who are admins?
5. **Original image retention:** confirm 90 days, and what the app shows
   for a receipt whose image has expired.
6. **Notification preference** is listed on Hesabım, but notifications
   are P1. Leave it out of the MVP?
7. **AI provider** for the real adapter, and a cost ceiling per receipt.
8. **Categories:** AI suggests one of the six starting categories (Gıda,
   Temizlik, Kişisel Bakım, Giyim, Ev, Diğer) and the person can change
   it — is that enough, or should people add their own?
9. **Currency:** TRY only in the MVP?
10. **Deadline and budget** for the MVP, and for hosted costs (Supabase,
    AI calls).
11. **Legal:** who reviews KVKK / privacy text before production?
12. **Consent wording:** the final plain-Turkish label for the
    commercial-analysis consent. Placeholder in PRD #10: "Verilerim
    isimsiz fiyat araştırmalarında kullanılabilir". Decide together with
    question 11 (the wording must stay true to what the data is used for).
