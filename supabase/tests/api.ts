import { randomUUID } from "node:crypto";
import type { LocalStack } from "./local-stack";

// Thin fetch wrappers over the stack's HTTP APIs, exactly as an app with
// the anon key and a user's session would call them. No service key: the
// point of the suite is what RLS lets a signed-in user or anon reach.

export type Caller = { token: string };
export type User = Caller & { id: string };

function headers(stack: LocalStack, caller: Caller | null) {
  return {
    apikey: stack.anonKey,
    Authorization: `Bearer ${caller?.token ?? stack.anonKey}`,
  };
}

/** Signs up a fresh user (local Auth has email confirmation off). */
export async function signUp(stack: LocalStack): Promise<User> {
  const response = await fetch(`${stack.apiUrl}/auth/v1/signup`, {
    method: "POST",
    headers: { ...headers(stack, null), "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `rls-${randomUUID()}@example.test`,
      password: `pw-${randomUUID()}`,
    }),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      `sign-up failed: ${response.status} ${JSON.stringify(body)}`,
    );
  }
  const { access_token: token, user } = body as {
    access_token?: unknown;
    user?: { id?: unknown };
  };
  if (typeof token !== "string" || typeof user?.id !== "string") {
    throw new Error("sign-up answered without a session");
  }
  return { token, id: user.id };
}

export type RestResult = { status: number; rows: unknown[] };

/**
 * One PostgREST call. `rows` is the returned representation (empty when
 * the call was refused), so "nothing reached" reads the same for a filter
 * RLS emptied and a write RLS refused; `status` tells them apart.
 */
export async function rest(
  stack: LocalStack,
  caller: Caller | null,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  pathAndQuery: string,
  body?: unknown,
): Promise<RestResult> {
  const response = await fetch(`${stack.apiUrl}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      ...headers(stack, caller),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const parsed: unknown = await response.json().catch(() => null);
  return {
    status: response.status,
    rows: response.ok && Array.isArray(parsed) ? parsed : [],
  };
}

/**
 * Writes bytes to a storage path; returns the HTTP status. `mode` picks
 * the call: a plain upload, an upload that may overwrite (`x-upsert`),
 * or the replace endpoint (PUT).
 */
export async function upload(
  stack: LocalStack,
  caller: Caller | null,
  bucket: string,
  path: string,
  bytes: Uint8Array,
  mode: "create" | "upsert" | "replace" = "create",
): Promise<number> {
  const response = await fetch(
    `${stack.apiUrl}/storage/v1/object/${bucket}/${path}`,
    {
      method: mode === "replace" ? "PUT" : "POST",
      headers: {
        ...headers(stack, caller),
        "Content-Type": "image/jpeg",
        ...(mode === "upsert" ? { "x-upsert": "true" } : {}),
      },
      body: bytes,
    },
  );
  await response.body?.cancel();
  return response.status;
}

/** Deletes an object; returns the HTTP status. */
export async function removeObject(
  stack: LocalStack,
  caller: Caller | null,
  bucket: string,
  path: string,
): Promise<number> {
  const response = await fetch(
    `${stack.apiUrl}/storage/v1/object/${bucket}/${path}`,
    { method: "DELETE", headers: headers(stack, caller) },
  );
  await response.body?.cancel();
  return response.status;
}

/** Downloads an object; `bytes` is null unless the download succeeded. */
export async function download(
  stack: LocalStack,
  caller: Caller | null,
  bucket: string,
  path: string,
  options: { publicUrl?: boolean } = {},
): Promise<{ status: number; bytes: Uint8Array | null }> {
  const kind = options.publicUrl ? "object/public" : "object/authenticated";
  const response = await fetch(
    `${stack.apiUrl}/storage/v1/${kind}/${bucket}/${path}`,
    { headers: headers(stack, caller) },
  );
  if (!response.ok) {
    await response.body?.cancel();
    return { status: response.status, bytes: null };
  }
  return {
    status: response.status,
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
}
