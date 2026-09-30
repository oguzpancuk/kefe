import { describe, expect, it, vi } from "vitest";
import { createKefeClient } from "./client";
import { keychainStorage, type Keychain } from "./keychain";

// iOS keeps the Auth session in the keychain (expo-secure-store), so a
// signed-in person is still signed in after the app is closed and opened
// again (ROADMAP walking skeleton 6). These tests drive the real
// supabase-js client over a fake fetch and a fake keychain.

const env = { url: "http://127.0.0.1:54321", anonKey: "anon-key" };

// expo-secure-store documents 2048 bytes as the most a value may hold and
// accepts keys of letters, digits, ".", "-" and "_" only. The fake refuses
// anything else, so a store that relies on more fails here, not on a phone.
const LIMIT = 2048;
const bytes = (text: string) => new TextEncoder().encode(text).length;

function fakeKeychain(): Keychain & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    getItemAsync: async (key) => {
      if (!/^[\w.-]+$/.test(key)) throw new Error(`invalid key ${key}`);
      return entries.get(key) ?? null;
    },
    setItemAsync: async (key, value) => {
      if (!/^[\w.-]+$/.test(key)) throw new Error(`invalid key ${key}`);
      if (bytes(value) > LIMIT) throw new Error(`value over ${LIMIT} bytes`);
      entries.set(key, value);
    },
    deleteItemAsync: async (key) => {
      if (!/^[\w.-]+$/.test(key)) throw new Error(`invalid key ${key}`);
      entries.delete(key);
    },
  };
}

// A session the size hosted Supabase answers with: a signed JWT and a user
// with an identity and a Turkish name, well over one keychain value.
function sessionAnswer() {
  return new Response(
    JSON.stringify({
      access_token: `eyJhbGciOiJIUzI1NiJ9.${"a".repeat(1800)}.signature`,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: "refresh-token",
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        aud: "authenticated",
        role: "authenticated",
        email: "ayse@ornek.com",
        app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: { ad: "Ayşe Çağlar Öztürk Ğüşiı" },
        identities: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            provider: "email",
            identity_data: { email: "ayse@ornek.com", sub: "1" },
          },
        ],
        created_at: "2026-09-30T08:00:00Z",
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/** The app as opened once: a client over the given keychain. */
function openApp(keychain: Keychain) {
  const fetch = vi.fn(async () => sessionAnswer());
  const client = createKefeClient(env, {
    storage: keychainStorage(keychain),
    fetch: fetch as unknown as typeof globalThis.fetch,
    autoRefreshToken: false,
  });
  return { auth: client.auth, fetch };
}

describe("keychainStorage (iOS session store)", () => {
  it("keeps the session when the app is closed and opened again", async () => {
    const keychain = fakeKeychain();
    const first = openApp(keychain);
    const signedIn = await first.auth.signInWithPassword({
      email: "ayse@ornek.com",
      password: "dogru-sifre",
    });
    expect(signedIn.error).toBeNull();

    const again = openApp(keychain);
    const { data } = await again.auth.getSession();

    expect(again.fetch).not.toHaveBeenCalled();
    expect(data.session?.user.email).toBe("ayse@ornek.com");
    expect(data.session?.access_token).toBe(
      signedIn.data.session?.access_token,
    );
  });

  it("stores no keychain value over the limit", async () => {
    const keychain = fakeKeychain();
    const app = openApp(keychain);
    const signedIn = await app.auth.signInWithPassword({
      email: "ayse@ornek.com",
      password: "dogru-sifre",
    });

    expect(bytes(JSON.stringify(signedIn.data.session))).toBeGreaterThan(LIMIT);
    for (const value of keychain.entries.values())
      expect(bytes(value)).toBeLessThanOrEqual(LIMIT);
  });

  it("leaves nothing in the keychain after sign-out", async () => {
    const keychain = fakeKeychain();
    const app = openApp(keychain);
    await app.auth.signInWithPassword({
      email: "ayse@ornek.com",
      password: "dogru-sifre",
    });
    expect(keychain.entries.size).toBeGreaterThan(0);

    await app.auth.signOut({ scope: "local" });

    expect([...keychain.entries.keys()]).toEqual([]);
    expect((await openApp(keychain).auth.getSession()).data.session).toBeNull();
  });

  it("round-trips long Turkish text without splitting a character", async () => {
    const storage = keychainStorage(fakeKeychain());
    const value = "ğüşıöçĞÜŞİÖÇ€😀".repeat(400);

    await storage.setItem("sb-127-auth-token", value);

    expect(await storage.getItem("sb-127-auth-token")).toBe(value);
  });

  it("a shorter value leaves no pieces of the longer one behind", async () => {
    const keychain = fakeKeychain();
    const storage = keychainStorage(keychain);
    await storage.setItem("sb-127-auth-token", "x".repeat(10_000));
    const afterLong = keychain.entries.size;

    await storage.setItem("sb-127-auth-token", "kisa");

    expect(await storage.getItem("sb-127-auth-token")).toBe("kisa");
    expect(keychain.entries.size).toBeLessThan(afterLong);
    await storage.removeItem("sb-127-auth-token");
    expect(keychain.entries.size).toBe(0);
  });

  it("reads a value with a missing piece as nothing stored", async () => {
    const keychain = fakeKeychain();
    const storage = keychainStorage(keychain);
    await storage.setItem("sb-127-auth-token", "x".repeat(5_000));
    const piece = [...keychain.entries.keys()].find((key) =>
      key.endsWith(".1"),
    );
    expect(piece).toBeDefined();
    keychain.entries.delete(piece as string);

    expect(await storage.getItem("sb-127-auth-token")).toBeNull();
  });

  it("reads nothing stored as null", async () => {
    const storage = keychainStorage(fakeKeychain());

    expect(await storage.getItem("sb-127-auth-token")).toBeNull();
  });
});
