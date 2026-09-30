import { formatTl, istanbulMonth, type MonthTotal } from "@kefe/core";
import { randomUUID } from "expo-crypto";
import {
  launchImageLibraryAsync,
  UIImagePickerPreferredAssetRepresentationMode,
} from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { takeSavedNotice, trackSending } from "../../src/receipts/pending";
import {
  imageTypeOf,
  loadMonthTotal,
  prepareReceipt,
  sendReceipt,
  type Failure,
} from "../../src/receipts/receipts";
import { supabase } from "../../src/supabase";
import { Alert, Button, Card, Screen, Title } from "../../src/ui/components";
import { Mark, PlusIcon } from "../../src/ui/icons";
import { color, space, type } from "../../src/ui/theme";

type TotalState =
  | { status: "loading" }
  | { status: "ready"; total: MonthTotal }
  | { status: "failed"; failure: Failure };

// Ana Sayfa (docs/design/screens/04-AnaSayfa.png): this month's total of
// saved receipts and "Fiş ekle". The month picker, last purchases and
// categories arrive in ROADMAP v1 item 3.
export default function Home() {
  const auth = useAuth();
  const [justSaved, setJustSaved] = useState(false);
  const [total, setTotal] = useState<TotalState>({ status: "loading" });
  const [pickFailure, setPickFailure] = useState<Failure | null>(null);

  // Read again every time Ana Sayfa comes back into view (after Kaydet).
  useFocusEffect(
    useCallback(() => {
      if (takeSavedNotice()) setJustSaved(true);
      if (!supabase) return;
      let current = true;
      void loadMonthTotal(supabase, istanbulMonth(new Date())).then(
        (result) => {
          if (!current) return;
          setTotal(
            result.ok
              ? { status: "ready", total: result.total }
              : { status: "failed", failure: result.failure },
          );
        },
      );
      return () => {
        current = false;
      };
    }, []),
  );

  async function addReceipt() {
    const client = supabase;
    if (!client || auth.status !== "signedIn") return;
    setPickFailure(null);
    setJustSaved(false);
    const picked = await launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      // iOS: hand over a JPEG rather than the library's HEIC original.
      preferredAssetRepresentationMode:
        UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    const asset = picked.canceled ? undefined : picked.assets[0];
    if (!asset) return;
    const prepared = prepareReceipt(
      auth.session.user.id,
      imageTypeOf(asset),
      randomUUID,
    );
    if (!prepared.ok) {
      setPickFailure(prepared.failure);
      return;
    }
    const { receipt } = prepared;
    // Kontrol et opens at once and shows "Fiş okunuyor" until this ends.
    trackSending(
      receipt.id,
      fetch(asset.uri)
        .then((response) => response.arrayBuffer())
        .then((image) => sendReceipt(client, receipt, image))
        .catch(() => ({
          ok: false as const,
          failure: {
            title: "Fiş gönderilemedi.",
            detail: "Fotoğrafı yeniden seçip tekrar deneyin.",
          },
        })),
    );
    router.push({ pathname: "/kontrol", params: { id: receipt.id } });
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Title>Ana Sayfa</Title>
        <Mark size={56} />
      </View>
      {justSaved ? (
        <Alert
          tone="success"
          title="Fiş kaydedildi."
          detail="Tutarı bu ayın toplamına eklendi."
        />
      ) : null}
      {pickFailure ? (
        <Alert
          tone="danger"
          title={pickFailure.title}
          detail={pickFailure.detail}
        />
      ) : null}
      <Card>
        <View style={styles.total}>
          <Text style={[type.label, styles.muted]}>Bu ay harcadığınız</Text>
          {total.status === "failed" ? (
            <Alert
              tone="danger"
              title={total.failure.title}
              detail={total.failure.detail}
            />
          ) : (
            <>
              <Text style={type.hero} accessibilityLiveRegion="polite">
                {total.status === "ready"
                  ? formatTl(total.total.totalKurus)
                  : " "}
              </Text>
              <Text style={type.caption}>
                {total.status !== "ready"
                  ? " "
                  : total.total.count === 0
                    ? "Henüz fiş kaydetmediniz."
                    : `${total.total.count} fiş kaydedildi`}
              </Text>
            </>
          )}
          <View style={styles.action}>
            <Button
              label="Fiş ekle"
              variant="hero"
              icon={PlusIcon}
              onPress={addReceipt}
            />
          </View>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  total: { gap: space.xs, padding: space.xs },
  muted: { color: color.textMuted },
  action: { marginTop: space.md },
});
