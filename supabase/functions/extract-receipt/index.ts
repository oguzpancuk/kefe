// Deno entry point of the `extract-receipt` Edge Function; the logic is
// in handler.ts. Mock mode only until the AI provider is chosen.
import { createHandler } from "./handler.ts";

Deno.serve(createHandler({ env: Deno.env.toObject() }));
