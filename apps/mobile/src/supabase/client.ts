import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// The public Supabase settings the app is built with. Only the URL and the
// anon key: no service-role key ever ships in the app (CLAUDE.md).
const supabaseEnvSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
  anonKey: z.string().min(1),
});

export type SupabaseEnv = z.infer<typeof supabaseEnvSchema>;

/** Validates the build's public env; `null` when it is missing or malformed. */
export function parseSupabaseEnv(env: {
  url: string | undefined;
  anonKey: string | undefined;
}): SupabaseEnv | null {
  const parsed = supabaseEnvSchema.safeParse(env);
  return parsed.success ? parsed.data : null;
}

/** Where Auth keeps the session; localStorage's shape, sync or async. */
export type SessionStorage = {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
};

export function createKefeClient(
  env: SupabaseEnv,
  options: {
    storage?: SessionStorage;
    fetch?: typeof fetch;
    autoRefreshToken?: boolean;
  } = {},
): SupabaseClient {
  return createClient(env.url, env.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: options.autoRefreshToken ?? true,
      // Email + password only: no redirect ever carries a session.
      detectSessionInUrl: false,
      ...(options.storage ? { storage: options.storage } : {}),
    },
    ...(options.fetch ? { global: { fetch: options.fetch } } : {}),
  });
}
