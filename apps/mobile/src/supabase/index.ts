import { createKefeClient, parseSupabaseEnv } from "./client";

// The app's one Supabase client, from the public build env (EXPO_PUBLIC_*
// is inlined at build time, so each name must be written out in full).
// `null` when the env is missing: the app then shows it cannot start.
const env = parseSupabaseEnv({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
});

if (!env) {
  console.error(
    "kefe: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set (see apps/mobile/README.md)",
  );
}

// Web keeps the session in localStorage (the default). Native has no
// localStorage, so the session lives in memory until skeleton step 6 gives
// iOS a persistent store.
export const supabase = env ? createKefeClient(env) : null;
