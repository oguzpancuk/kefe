import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import { createKefeClient, parseSupabaseEnv } from "./client";
import { keychainStorage } from "./keychain";

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

const native = Platform.OS !== "web";

// Web keeps the session in localStorage (supabase-js's default). iOS has
// no localStorage: it keeps the session in the keychain, so the person is
// still signed in after closing the app.
export const supabase = env
  ? createKefeClient(
      env,
      native ? { storage: keychainStorage(SecureStore) } : {},
    )
  : null;

// On the web Auth refreshes the token only while the tab is visible. On
// iOS it cannot tell, so it is told: refresh while the app is in front,
// stop in the background (registered once, as this module loads once).
if (supabase && native) {
  const auth = supabase.auth;
  AppState.addEventListener("change", (state) => {
    if (state === "active") void auth.startAutoRefresh();
    else void auth.stopAutoRefresh();
  });
}
