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
keeps it in the keychain through `expo-secure-store`
(`src/supabase/keychain.ts`), split into pieces under the store's
2048-byte limit, so the person stays signed in after closing the app. On
iOS the token is refreshed only while the app is in front (`AppState`).

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

## Running it in the iOS simulator

Needs a Mac with Xcode's iOS simulator and the local backend
(`npx supabase start`, Docker). From the repository root:

```sh
npm ci
npx supabase start   # also serves extract-receipt (mock mode)
# put API_URL and ANON_KEY from `npx supabase status -o env` into
# apps/mobile/.env.local as EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY
npm run ios -w @kefe/mobile
```

`npm run ios` opens the app in Expo Go in the simulator (no native build).
`http://127.0.0.1:54321` reaches the Mac's local stack from the simulator.
Amounts are typed with a comma ("12,50"): the number pad shows the
decimal key of the phone's region, so set the simulator's region to
Türkiye (Settings › General › Language & Region) or the pad shows "."
only.
