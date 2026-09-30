import { describe, expect, it } from "vitest";
import { localStack } from "./local-stack";

// The suite's own precondition: every later RLS and Edge Function test
// talks to this stack, so it must be up and answering.
describe("local Supabase stack", () => {
  it("answers the Auth health check with the anon key", async () => {
    const { apiUrl, anonKey } = localStack();
    const response = await fetch(`${apiUrl}/auth/v1/health`, {
      headers: { apikey: anonKey },
    });
    expect(response.status).toBe(200);
  });
});
