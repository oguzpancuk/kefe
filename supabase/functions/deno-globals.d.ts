// The two Deno APIs the Edge Function entry points use, so `tsc` in the
// @kefe/supabase workspace can typecheck them next to the Node tests.
// The Edge Runtime provides the real ones.
declare const Deno: {
  serve(handler: (request: Request) => Response | Promise<Response>): unknown;
  env: { toObject(): Record<string, string> };
};
