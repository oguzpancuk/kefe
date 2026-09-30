import {
  isAuthApiError,
  isAuthRetryableFetchError,
  type AuthError,
  type SupabaseClient,
} from "@supabase/supabase-js";

// Email + password through Supabase Auth: the placeholder sign-in until PRD
// open question 2 picks the method. Screens call only these two functions,
// so swapping the method changes this file, not the screens.

type Auth = SupabaseClient["auth"];

/**
 * A Turkish message for the alert box: a bold first sentence, a plain
 * second. `field` names the input the failure is about, so only that one is
 * marked; connection and rate-limit failures concern neither.
 */
export type AuthFailure = {
  title: string;
  detail: string;
  field?: "email" | "password";
};

export type SignInResult = { ok: true } | { ok: false; failure: AuthFailure };

export type SignUpResult =
  { ok: true; signedIn: boolean } | { ok: false; failure: AuthFailure };

/** The first empty field, or `null` when both are filled. */
function missingField(email: string, password: string): AuthFailure | null {
  if (email && password) return null;
  return {
    title: "Bilgiler eksik.",
    detail: "E-posta adresinizi ve şifrenizi yazın.",
    field: email ? "password" : "email",
  };
}

const existingAccount: AuthFailure = {
  title: "Hesap açılamadı.",
  detail: "Bu e-posta ile zaten bir hesap var. Giriş yapmayı deneyin.",
  field: "email",
};

const noConnection: AuthFailure = {
  title: "Bağlantı kurulamadı.",
  detail: "İnternet bağlantınızı kontrol edip tekrar deneyin.",
};

const tooManyAttempts: AuthFailure = {
  title: "Çok fazla deneme yapıldı.",
  detail: "Birkaç dakika bekleyip tekrar deneyin.",
};

const unknownProblem = (title: string): AuthFailure => ({
  title,
  detail: "Bir sorun oluştu. Biraz sonra tekrar deneyin.",
});

/** Failures every Auth call shares; `null` when the error is call-specific. */
function commonFailure(error: AuthError): AuthFailure | null {
  if (isAuthRetryableFetchError(error)) return noConnection;
  if (
    error.status === 429 ||
    error.code === "over_request_rate_limit" ||
    error.code === "over_email_send_rate_limit"
  ) {
    return tooManyAttempts;
  }
  return null;
}

function signInFailure(error: AuthError): AuthFailure {
  const common = commonFailure(error);
  if (common) return common;
  const title = "Giriş yapılamadı.";
  if (error.code === "email_not_confirmed") {
    return {
      title,
      detail:
        "Önce e-postanıza gelen bağlantıya tıklayın, sonra tekrar deneyin.",
      field: "email",
    };
  }
  // Auth answers a wrong password and an unknown email alike (400,
  // invalid_credentials), and so does this message: it never says which.
  if (
    error.code === "invalid_credentials" ||
    (isAuthApiError(error) && error.status === 400)
  ) {
    return {
      title,
      detail: "E-posta ya da şifre yanlış. Tekrar deneyin.",
      field: "password",
    };
  }
  return unknownProblem(title);
}

function signUpFailure(error: AuthError): AuthFailure {
  const common = commonFailure(error);
  if (common) return common;
  const title = "Hesap açılamadı.";
  switch (error.code) {
    case "user_already_exists":
    case "email_exists":
      return existingAccount;
    case "weak_password":
      return {
        title,
        detail: "Şifre en az 6 karakter olmalı.",
        field: "password",
      };
    case "email_address_invalid":
    case "validation_failed":
      return {
        title,
        detail: "E-posta adresini kontrol edin.",
        field: "email",
      };
    default:
      return unknownProblem(title);
  }
}

/**
 * Signs in. On any failure Auth stores nothing, so no session exists
 * afterwards; on success Auth stores the session and notifies listeners.
 */
export async function signIn(
  auth: Auth,
  email: string,
  password: string,
): Promise<SignInResult> {
  const trimmed = email.trim();
  const missing = missingField(trimmed, password);
  if (missing) return { ok: false, failure: missing };
  try {
    const { error } = await auth.signInWithPassword({
      email: trimmed,
      password,
    });
    return error ? { ok: false, failure: signInFailure(error) } : { ok: true };
  } catch {
    return { ok: false, failure: noConnection };
  }
}

/**
 * Creates an account. `signedIn` is false when the project asks for email
 * confirmation first: then Auth answers without a session.
 */
export async function signUp(
  auth: Auth,
  email: string,
  password: string,
): Promise<SignUpResult> {
  const trimmed = email.trim();
  const missing = missingField(trimmed, password);
  if (missing) return { ok: false, failure: missing };
  try {
    const { data, error } = await auth.signUp({ email: trimmed, password });
    if (error) return { ok: false, failure: signUpFailure(error) };
    // With confirmations on, Auth hides an existing email: it answers a
    // user without identities and no session, and sends no email.
    if (data.user && data.user.identities?.length === 0) {
      return { ok: false, failure: existingAccount };
    }
    return { ok: true, signedIn: data.session !== null };
  } catch {
    return { ok: false, failure: noConnection };
  }
}

export type SignOutResult = { ok: true } | { ok: false; failure: AuthFailure };

/**
 * Signs out on this device. Auth removes the stored session even when the
 * server cannot be reached; it keeps it only when it cannot read it, and
 * then this says so.
 */
export async function signOut(auth: Auth): Promise<SignOutResult> {
  const failure: AuthFailure = {
    title: "Çıkış yapılamadı.",
    detail: "Biraz sonra tekrar deneyin.",
  };
  try {
    const { error } = await auth.signOut({ scope: "local" });
    return error ? { ok: false, failure } : { ok: true };
  } catch {
    return { ok: false, failure };
  }
}
