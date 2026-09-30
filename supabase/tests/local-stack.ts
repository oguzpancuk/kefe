import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export type LocalStack = { apiUrl: string; anonKey: string };

/**
 * Reads the running local stack's URL and anon key from the Supabase CLI.
 * Throws when no stack is running: the suite needs one (`npx supabase
 * start`), and a missing stack must fail, not skip.
 */
export function localStack(): LocalStack {
  const stdout = execFileSync(
    "npx",
    ["supabase", "status", "--output", "json", "--workdir", repoRoot],
    { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const status: unknown = JSON.parse(stdout);
  if (typeof status !== "object" || status === null) {
    throw new Error("supabase status did not print a JSON object");
  }
  const { API_URL: apiUrl, ANON_KEY: anonKey } = status as Record<
    string,
    unknown
  >;
  if (typeof apiUrl !== "string" || typeof anonKey !== "string") {
    throw new Error("supabase status is missing API_URL or ANON_KEY");
  }
  return { apiUrl, anonKey };
}
