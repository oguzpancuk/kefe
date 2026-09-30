import { z } from "zod";
import {
  parseExtraction,
  type ExtractedReceipt,
  type ExtractionErrorCode,
} from "../../../packages/core/src/index.ts";
import { mockAdapter, type ExtractionAdapter } from "./adapter.ts";

// Kept free of Deno APIs so it typechecks with the rest of the repo;
// index.ts is the Deno entry point.

const envSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(1),
});

const requestSchema = z.strictObject({
  receipt_id: z.uuid(),
  // Mock mode only: ask the mock for its malformed answer, so the failure
  // path can be exercised end to end. Refused when a real adapter runs.
  mock: z.enum(["valid", "invalid"]).optional(),
});

const receiptRowsSchema = z.array(
  z.object({
    id: z.uuid(),
    status: z.string(),
    image_path: z.string().nullable(),
  }),
);

export type ExtractResponse =
  | { receipt_id: string; status: "needs_review"; source: string }
  | {
      receipt_id: string;
      status: "failed";
      source: string;
      error_code: ExtractionErrorCode;
    };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const refuse = (status: number, error: string) => json(status, { error });

const claimsSchema = z.object({ role: z.string() });

/**
 * True for a signed-in user's token. The gateway (`verify_jwt`) already
 * checked the signature; this only reads the role, so the anon key,
 * which is also a valid token, is turned away instead of treated as a
 * caller with nothing to see.
 */
function isSignedInUser(authorization: string | null): authorization is string {
  const payload = /^Bearer [^.]+\.([^.]+)\.[^.]+$/.exec(
    authorization ?? "",
  )?.[1];
  if (!payload) return false;
  try {
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/");
    const claims = claimsSchema.safeParse(JSON.parse(atob(base64)));
    return claims.success && claims.data.role === "authenticated";
  } catch {
    return false;
  }
}

type Deps = {
  env: Record<string, string | undefined>;
  adapter?: ExtractionAdapter;
  fetch?: typeof fetch;
};

/**
 * POST { receipt_id } with the signed-in user's token. Reads the receipt
 * through RLS as that user (another user's receipt is simply not found),
 * runs the adapter, validates its output with the @kefe/core schema and
 * stores either a draft (`needs_review`, marked with the adapter's
 * source) or a failure (`failed`, an error code, no items).
 *
 * Nothing from the receipt is logged: only status codes and error codes.
 */
export function createHandler({
  env,
  adapter = mockAdapter,
  fetch: fetchImpl = fetch,
}: Deps): (request: Request) => Promise<Response> {
  const config = envSchema.safeParse(env);

  return async (request) => {
    if (request.method === "OPTIONS")
      return new Response(null, { headers: CORS });
    if (request.method !== "POST") return refuse(405, "method_not_allowed");
    if (!config.success) {
      console.error(
        "extract-receipt: missing SUPABASE_URL or SUPABASE_ANON_KEY",
      );
      return refuse(500, "misconfigured");
    }
    const authorization = request.headers.get("Authorization");
    if (!isSignedInUser(authorization)) return refuse(401, "unauthorized");

    const body = requestSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!body.success) return refuse(400, "invalid_request");
    const { receipt_id: receiptId, mock } = body.data;
    if (mock !== undefined && adapter.source !== "mock") {
      return refuse(400, "invalid_request");
    }

    const { SUPABASE_URL: url, SUPABASE_ANON_KEY: anonKey } = config.data;
    // Every call runs as the caller: no service key, RLS decides.
    const asCaller = {
      apikey: anonKey,
      Authorization: authorization,
      "Content-Type": "application/json",
    };
    const rpc = (name: string, args: Record<string, unknown>) =>
      fetchImpl(`${url}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: asCaller,
        body: JSON.stringify(args),
      });

    const lookup = await fetchImpl(
      `${url}/rest/v1/receipts?id=eq.${receiptId}&select=id,status,image_path`,
      { headers: asCaller },
    );
    if (lookup.status === 401) return refuse(401, "unauthorized");
    const rows = receiptRowsSchema.safeParse(
      lookup.ok ? await lookup.json() : undefined,
    );
    if (!rows.success) {
      console.error(
        `extract-receipt: receipt lookup answered ${lookup.status}`,
      );
      return refuse(502, "lookup_failed");
    }
    const receipt = rows.data[0];
    // Another user's receipt reads exactly like a missing one.
    if (!receipt) return refuse(404, "receipt_not_found");
    if (receipt.status === "saved") return refuse(409, "receipt_already_saved");

    let result:
      | { ok: true; receipt: ExtractedReceipt }
      | { ok: false; errorCode: ExtractionErrorCode };
    try {
      const output = await adapter.extract({
        imagePath: receipt.image_path,
        mockScenario: mock ?? "valid",
      });
      result = parseExtraction(output);
    } catch {
      result = { ok: false, errorCode: "extraction_failed" };
    }

    const write = result.ok
      ? await rpc("record_extraction", {
          p_receipt_id: receiptId,
          p_source: adapter.source,
          p_store_name: result.receipt.store,
          p_purchased_on: result.receipt.date,
          p_total_kurus: result.receipt.total_kurus,
          p_items: result.receipt.items,
        })
      : await rpc("record_extraction_failure", {
          p_receipt_id: receiptId,
          p_source: adapter.source,
          p_error_code: result.errorCode,
        });
    if (!write.ok) {
      await write.body?.cancel();
      console.error(
        `extract-receipt: storing the result answered ${write.status}`,
      );
      return refuse(502, "store_failed");
    }
    await write.body?.cancel();

    const response: ExtractResponse = result.ok
      ? {
          receipt_id: receiptId,
          status: "needs_review",
          source: adapter.source,
        }
      : {
          receipt_id: receiptId,
          status: "failed",
          source: adapter.source,
          error_code: result.errorCode,
        };
    if (!result.ok) {
      console.warn(`extract-receipt: ${result.errorCode} (${adapter.source})`);
    }
    return json(200, response);
  };
}
