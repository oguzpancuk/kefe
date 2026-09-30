# @kefe/mobile

The consumer app: iOS and web from one Expo codebase (CLAUDE.md).

## Supabase settings

The app reads two public values at build time. Without them it opens on
"Uygulama açılamadı."

| Variable                        | Local value                                  |
| ------------------------------- | -------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`      | `API_URL` from `npx supabase status -o env`  |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `ANON_KEY` from `npx supabase status -o env` |

Put them in `apps/mobile/.env.local` (git-ignored), then
`npm run web -w @kefe/mobile`. Only the anon key belongs here: no
service-role key ever ships in the app.

## Sign-in

Email and password through Supabase Auth, the placeholder until PRD open
question 2 picks the method. Screens call only `src/auth/auth.ts`, so the
method can change there. The web keeps the session in `localStorage`; iOS
keeps it in memory until skeleton step 6 gives it a persistent store.

## Fonts

Atkinson Hyperlegible Next (weights 400, 600, 700, 800) under the SIL Open
Font License, `assets/fonts/OFL.txt`.

## Adding a receipt

"Fiş ekle" on Ana Sayfa opens the photo picker (`expo-image-picker`; the
camera path is ROADMAP v1 10). The image goes to the private `receipts`
bucket under the person's folder, the receipt row is created with a fresh
idempotency key (`expo-crypto`), and `extract-receipt` reads it in mock
mode. Kontrol et shows "Fiş okunuyor" meanwhile, then the draft with the
"Örnek veri — fişiniz okunmadı" banner. "Kaydet" calls `save_receipt`
with that key, so a double tap or a retry saves once. The month total on
Ana Sayfa is summed and formatted by `@kefe/core` from saved receipts
only. The calls live in `src/receipts/receipts.ts`.
