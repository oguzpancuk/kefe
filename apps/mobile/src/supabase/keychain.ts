import type { SessionStorage } from "./client";

/** The part of `expo-secure-store` the session store uses. */
export type Keychain = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

// expo-secure-store holds at most 2048 bytes a value, and a Supabase
// session (JWT plus user) is often more. So a value is kept in pieces:
// `<key>.0`, `<key>.1`, ... each under the limit, and `<key>` itself holds
// how many there are. The count is written after the pieces, and a
// missing piece reads as nothing stored (signed out).
const PIECE_BYTES = 2000;

const pieceKey = (key: string, index: number) => `${key}.${index}`;

/** Bytes a character takes in UTF-8 (no TextEncoder needed on the phone). */
function utf8Bytes(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
}

/** Splits text into pieces of at most PIECE_BYTES UTF-8 bytes, never inside a character. */
function split(value: string): string[] {
  const pieces: string[] = [];
  let piece = "";
  let size = 0;
  for (const char of value) {
    const charBytes = utf8Bytes(char);
    if (size + charBytes > PIECE_BYTES) {
      pieces.push(piece);
      piece = "";
      size = 0;
    }
    piece += char;
    size += charBytes;
  }
  if (piece !== "" || pieces.length === 0) pieces.push(piece);
  return pieces;
}

async function countOf(keychain: Keychain, key: string): Promise<number> {
  const stored = await keychain.getItemAsync(key);
  const count = stored === null ? 0 : Number(stored);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

/**
 * The Auth session store for iOS: the keychain, through expo-secure-store,
 * so the person stays signed in after closing the app. The web keeps
 * supabase-js's default, localStorage.
 */
export function keychainStorage(keychain: Keychain): SessionStorage {
  return {
    async getItem(key) {
      const count = await countOf(keychain, key);
      if (count === 0) return null;
      const pieces: string[] = [];
      for (let index = 0; index < count; index++) {
        const piece = await keychain.getItemAsync(pieceKey(key, index));
        // A missing piece: treat as nothing stored (signed out), not as a
        // broken session.
        if (piece === null) return null;
        pieces.push(piece);
      }
      return pieces.join("");
    },

    async setItem(key, value) {
      const before = await countOf(keychain, key);
      const pieces = split(value);
      for (const [index, piece] of pieces.entries())
        await keychain.setItemAsync(pieceKey(key, index), piece);
      await keychain.setItemAsync(key, String(pieces.length));
      for (let index = pieces.length; index < before; index++)
        await keychain.deleteItemAsync(pieceKey(key, index));
    },

    async removeItem(key) {
      const count = await countOf(keychain, key);
      await keychain.deleteItemAsync(key);
      for (let index = 0; index < count; index++)
        await keychain.deleteItemAsync(pieceKey(key, index));
    },
  };
}
