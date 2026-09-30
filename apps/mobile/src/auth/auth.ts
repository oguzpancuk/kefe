import type { SupabaseClient } from "@supabase/supabase-js";

type Auth = SupabaseClient["auth"];

/** A Turkish message for the alert box: a bold first sentence, a plain second. */
export type AuthFailure = { title: string; detail: string };

export type SignInResult = { ok: true } | { ok: false; failure: AuthFailure };

// Stub: the tests below are written against this first and must fail.
export async function signIn(
  _auth: Auth,
  _email: string,
  _password: string,
): Promise<SignInResult> {
  return { ok: true };
}

export type SignUpResult =
  | { ok: true; signedIn: boolean }
  | { ok: false; failure: AuthFailure };

// Stub: the tests below are written against this first and must fail.
export async function signUp(
  _auth: Auth,
  _email: string,
  _password: string,
): Promise<SignUpResult> {
  return { ok: true, signedIn: true };
}
