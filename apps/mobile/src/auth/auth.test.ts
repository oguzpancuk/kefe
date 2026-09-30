import { describe, expect, it, vi } from "vitest";
import { createKefeClient, type SessionStorage } from "../supabase/client";
import { signIn, signUp } from "./auth";

const env = { url: "http://127.0.0.1:54321", anonKey: "anon-key" };

/** A localStorage stand-in that shows everything Auth wrote. */
function memoryStorage(): SessionStorage & { keys(): string[] } {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
    keys: () => [...items.keys()],
  };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// What Supabase Auth (GoTrue) answers for a password grant with a wrong
// password: 400 with the invalid_credentials error code.
const wrongPassword = () =>
  json(400, {
    code: 400,
    error_code: "invalid_credentials",
    msg: "Invalid login credentials",
  });

const session = () =>
  json(200, {
    access_token: "access-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "refresh-token",
    user: {
      id: "00000000-0000-4000-8000-000000000001",
      aud: "authenticated",
      role: "authenticated",
      email: "ayse@ornek.com",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-09-30T08:00:00Z",
    },
  });

function setup(answer: () => Response | Promise<Response>) {
  const storage = memoryStorage();
  const fetch = vi.fn(async () => answer());
  const client = createKefeClient(env, {
    storage,
    fetch: fetch as unknown as typeof globalThis.fetch,
    autoRefreshToken: false,
  });
  return { storage, fetch, auth: client.auth };
}

describe("signIn", () => {
  it("a wrong password gives a Turkish error and stores no session", async () => {
    const { auth, storage, fetch } = setup(wrongPassword);

    const result = await signIn(auth, "ayse@ornek.com", "yanlis-sifre");

    expect(fetch).toHaveBeenCalledOnce();
    expect(result).toEqual({
      ok: false,
      failure: {
        title: "Giriş yapılamadı.",
        detail: "E-posta ya da şifre yanlış. Tekrar deneyin.",
      },
    });
    expect(storage.keys()).toEqual([]);
    expect((await auth.getSession()).data.session).toBeNull();
  });

  it("the right password stores the session", async () => {
    const { auth, storage } = setup(session);

    const result = await signIn(auth, " ayse@ornek.com ", "dogru-sifre");

    expect(result).toEqual({ ok: true });
    expect(storage.keys()).toHaveLength(1);
    expect((await auth.getSession()).data.session?.user.email).toBe(
      "ayse@ornek.com",
    );
  });

  it("sends the email trimmed", async () => {
    const { auth, fetch } = setup(session);

    await signIn(auth, "  ayse@ornek.com ", "dogru-sifre");

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      email: "ayse@ornek.com",
      password: "dogru-sifre",
    });
  });

  it("an empty email or password asks for both and calls nothing", async () => {
    const { auth, storage, fetch } = setup(session);

    for (const [email, password] of [
      ["", "sifre"],
      ["ayse@ornek.com", ""],
      ["   ", "sifre"],
    ] as const) {
      expect(await signIn(auth, email, password)).toEqual({
        ok: false,
        failure: {
          title: "Bilgiler eksik.",
          detail: "E-posta adresinizi ve şifrenizi yazın.",
        },
      });
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(storage.keys()).toEqual([]);
  });

  it("no connection says so and stores no session", async () => {
    const { auth, storage } = setup(() => {
      throw new TypeError("Failed to fetch");
    });

    expect(await signIn(auth, "ayse@ornek.com", "sifre")).toEqual({
      ok: false,
      failure: {
        title: "Bağlantı kurulamadı.",
        detail: "İnternet bağlantınızı kontrol edip tekrar deneyin.",
      },
    });
    expect(storage.keys()).toEqual([]);
  });

  it("too many attempts asks to wait", async () => {
    const { auth, storage } = setup(() =>
      json(429, {
        code: 429,
        error_code: "over_request_rate_limit",
        msg: "Request rate limit reached",
      }),
    );

    expect(await signIn(auth, "ayse@ornek.com", "sifre")).toEqual({
      ok: false,
      failure: {
        title: "Çok fazla deneme yapıldı.",
        detail: "Birkaç dakika bekleyip tekrar deneyin.",
      },
    });
    expect(storage.keys()).toEqual([]);
  });

  it("an unconfirmed email says what to do", async () => {
    const { auth } = setup(() =>
      json(400, {
        code: 400,
        error_code: "email_not_confirmed",
        msg: "Email not confirmed",
      }),
    );

    expect(await signIn(auth, "ayse@ornek.com", "sifre")).toEqual({
      ok: false,
      failure: {
        title: "Giriş yapılamadı.",
        detail:
          "Önce e-postanıza gelen bağlantıya tıklayın, sonra tekrar deneyin.",
      },
    });
  });
});

describe("signUp", () => {
  it("a new account signs in at once when no confirmation is needed", async () => {
    const { auth, storage } = setup(session);

    expect(await signUp(auth, "ayse@ornek.com", "dogru-sifre")).toEqual({
      ok: true,
      signedIn: true,
    });
    expect(storage.keys()).toHaveLength(1);
  });

  it("an account that needs email confirmation is not signed in yet", async () => {
    // With confirmations on, Auth answers the user and no session.
    const { auth, storage } = setup(() =>
      json(200, {
        id: "00000000-0000-4000-8000-000000000002",
        aud: "authenticated",
        role: "authenticated",
        email: "ayse@ornek.com",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-09-30T08:00:00Z",
      }),
    );

    expect(await signUp(auth, "ayse@ornek.com", "dogru-sifre")).toEqual({
      ok: true,
      signedIn: false,
    });
    expect(storage.keys()).toEqual([]);
  });

  it("an email that already has an account says so", async () => {
    const { auth, storage } = setup(() =>
      json(422, {
        code: 422,
        error_code: "user_already_exists",
        msg: "User already registered",
      }),
    );

    expect(await signUp(auth, "ayse@ornek.com", "dogru-sifre")).toEqual({
      ok: false,
      failure: {
        title: "Hesap açılamadı.",
        detail: "Bu e-posta ile zaten bir hesap var. Giriş yapmayı deneyin.",
      },
    });
    expect(storage.keys()).toEqual([]);
  });

  it("a short password asks for a longer one", async () => {
    const { auth } = setup(() =>
      json(422, {
        code: 422,
        error_code: "weak_password",
        msg: "Password should be at least 6 characters.",
        weak_password: { reasons: ["length"] },
      }),
    );

    expect(await signUp(auth, "ayse@ornek.com", "123")).toEqual({
      ok: false,
      failure: {
        title: "Hesap açılamadı.",
        detail: "Şifre en az 6 karakter olmalı.",
      },
    });
  });

  it("an empty field asks for both and calls nothing", async () => {
    const { auth, fetch } = setup(session);

    expect(await signUp(auth, "", "")).toEqual({
      ok: false,
      failure: {
        title: "Bilgiler eksik.",
        detail: "E-posta adresinizi ve şifrenizi yazın.",
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
