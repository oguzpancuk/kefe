import type { Failure } from "./receipts";

// A receipt being sent while Kontrol et already shows "Fiş okunuyor":
// Ana Sayfa starts the send and moves on at once, Kontrol et waits for it.
// Each entry also knows how to send the same receipt again ("Tekrar
// dene", ROADMAP v1 2): with the same photo and idempotency key, so a
// retry never makes a second receipt. Lives in memory only; after a
// reload Kontrol et reads the receipt as the database has it.

export type SendResult = { ok: true } | { ok: false; failure: Failure };

type Sending = {
  attempt: Promise<SendResult>;
  again: () => Promise<SendResult>;
};

const sending = new Map<string, Sending>();

/**
 * Starts `send` for the receipt now; `sendAgain` runs `again`, which is
 * `send` itself unless given (waiting on a reading is retried by reading).
 */
export function trackSending(
  receiptId: string,
  send: () => Promise<SendResult>,
  again: () => Promise<SendResult> = send,
): void {
  // Kept after it settles: Kontrol et may open after a quick send ends,
  // and still needs to know how it ended. A few entries per session.
  sending.set(receiptId, { attempt: send(), again });
}

/** The latest attempt to send the receipt, if this session made one. */
export function sendingOf(receiptId: string): Promise<SendResult> | undefined {
  return sending.get(receiptId)?.attempt;
}

/** Sends the receipt once more; false when this session never sent it. */
export function sendAgain(receiptId: string): boolean {
  const entry = sending.get(receiptId);
  if (!entry) return false;
  sending.set(receiptId, { ...entry, attempt: entry.again() });
  return true;
}

// "Fiş kaydedildi." for Ana Sayfa, shown once after Kaydet. Kept here,
// not in the address, so a reload or a tab switch does not repeat it.
let savedNotice = false;

export function noteSaved(): void {
  savedNotice = true;
}

/** True once after `noteSaved`, then false until the next save. */
export function takeSavedNotice(): boolean {
  const taken = savedNotice;
  savedNotice = false;
  return taken;
}
