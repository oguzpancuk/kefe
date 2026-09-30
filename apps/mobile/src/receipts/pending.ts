import type { Failure } from "./receipts";

// A receipt being sent while Kontrol et already shows "Fiş okunuyor":
// Ana Sayfa starts the send and moves on at once, Kontrol et waits for it.
// Lives in memory only; after a reload Kontrol et reads the receipt as the
// database has it.

type Sending = Promise<{ ok: true } | { ok: false; failure: Failure }>;

const sending = new Map<string, Sending>();

export function trackSending(receiptId: string, send: Sending): void {
  // Kept after it settles: Kontrol et may open after a quick send ends,
  // and still needs to know how it ended. A few entries per session.
  sending.set(receiptId, send);
}

export function sendingOf(receiptId: string): Sending | undefined {
  return sending.get(receiptId);
}
