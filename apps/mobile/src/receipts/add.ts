import type { SupabaseClient } from "@supabase/supabase-js";
import { CryptoDigestAlgorithm, digest, randomUUID } from "expo-crypto";
import {
  launchImageLibraryAsync,
  UIImagePickerPreferredAssetRepresentationMode,
} from "expo-image-picker";
import { trackSending, type SendResult } from "./pending";
import {
  imageTypeOf,
  prepareReceipt,
  sendReceipt,
  sha256OrNull,
  type Failure,
} from "./receipts";

export type Added =
  | { kind: "cancelled" }
  | { kind: "refused"; failure: Failure }
  | { kind: "sending"; receiptId: string };

const notRead: Failure = {
  title: "Fotoğraf açılamadı",
  detail: "Fotoğrafı yeniden seçip tekrar deneyin. Hiçbir şey kaydedilmedi.",
};

/**
 * "Fiş ekle" and "Tekrar fotoğraf çek": the person picks a photo, and the
 * receipt starts sending at once (Kontrol et shows "Fiş okunuyor" until it
 * ends). The photo's bytes and hash are read once and kept for "Tekrar
 * dene", which sends the same receipt with the same key again.
 */
export async function pickAndSend(
  client: SupabaseClient,
  userId: string,
): Promise<Added> {
  const picked = await launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.8,
    // iOS: hand over a JPEG rather than the library's HEIC original.
    preferredAssetRepresentationMode:
      UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  const asset = picked.canceled ? undefined : picked.assets[0];
  if (!asset) return { kind: "cancelled" };
  const prepared = prepareReceipt(userId, imageTypeOf(asset), randomUUID);
  if (!prepared.ok) return { kind: "refused", failure: prepared.failure };
  const { receipt } = prepared;

  let photo: Promise<{ image: ArrayBuffer; sha256: string | null }> | null =
    null;
  const readPhoto = async () => {
    const image = await (await fetch(asset.uri)).arrayBuffer();
    const sha256 = await sha256OrNull(
      (data) => digest(CryptoDigestAlgorithm.SHA256, data),
      image,
    );
    return { image, sha256 };
  };
  const send = async (): Promise<SendResult> => {
    try {
      photo ??= readPhoto();
      const { image, sha256 } = await photo;
      return await sendReceipt(client, receipt, image, sha256);
    } catch {
      // Read again on the next try rather than keep a failed read.
      photo = null;
      return { ok: false, failure: notRead };
    }
  };
  trackSending(receipt.id, send);
  return { kind: "sending", receiptId: receipt.id };
}
