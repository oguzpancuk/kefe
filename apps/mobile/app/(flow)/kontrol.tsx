import {
  formatDate,
  formatMeasure,
  formatTl,
  receiptTotal,
  totalMismatch,
  type TotalMismatch,
} from "@kefe/core";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { EditFacts } from "../../src/receipts/EditFacts";
import { EditItem } from "../../src/receipts/EditItem";
import { pickAndSend } from "../../src/receipts/add";
import {
  noteSaved,
  sendAgain,
  sendingOf,
  trackSending,
} from "../../src/receipts/pending";
import {
  loadDraft,
  retryReading,
  saveReceipt,
  type Draft,
  type DraftItem,
  type Duplicate,
  type Failure,
  type ReceiptFacts,
} from "../../src/receipts/receipts";
import { useAuth } from "../../src/auth/AuthProvider";
import { supabase } from "../../src/supabase";
import {
  Alert,
  BackButton,
  Button,
  Card,
  Footer,
  ListRow,
  SampleBanner,
  Screen,
  TextButton,
  Title,
  UnsurePill,
} from "../../src/ui/components";
import {
  AlertIcon,
  CameraIcon,
  CopyIcon,
  Mark,
  PencilIcon,
  RetryIcon,
} from "../../src/ui/icons";
import { color, radius, screenPadding, space, type } from "../../src/ui/theme";

type State =
  | { kind: "reading" }
  | { kind: "failed"; failure: Failure }
  | { kind: "draft"; draft: Draft };

const notReadable: Failure = {
  title: "Bu fiş okunamadı",
  detail:
    "Fotoğraf bulanık olabilir ya da fişin bir kısmı görünmüyor olabilir. Hiçbir şey kaydedilmedi.",
};

const goHome = () => router.replace("/");

/**
 * "Beyaz peynir 500 g", "Beyaz peynir 2 × 250 g", "Domates 1,24 kg": the
 * name with its size. An unread name shows the printed line as it is.
 */
function itemTitle(item: DraftItem): string {
  if (item.name === null) return item.rawText;
  const size = item.packageSize ?? item.quantity;
  if (!size) return item.name;
  const count =
    item.packageSize && item.packageCount && item.packageCount > 1
      ? `${item.packageCount} × `
      : "";
  // No-break spaces keep "2 × 250 g" together when the line wraps.
  return `${item.name} ${count}${formatMeasure(size)}`.replace(
    / (?=×|[^ ]+$)|(?<=×) /g,
    "\u00a0",
  );
}

function mismatchText(mismatch: TotalMismatch): Failure {
  const difference = formatTl(mismatch.differenceKurus);
  return mismatch.direction === "items_less"
    ? {
        title: `Kalemler toplamdan ${difference} az.`,
        detail: "Bir kalem eksik ya da bir tutar yanlış okunmuş olabilir.",
      }
    : {
        title: `Kalemler toplamdan ${difference} fazla.`,
        detail: "Bir tutar yanlış okunmuş ya da toplam yanlış olabilir.",
      };
}

const sameJson = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

// Kontrol et (docs/design/screens/07-FisOkunuyor.png, 08-KontrolEt.png):
// "Fiş okunuyor" while the receipt is sent and read, then the draft: the
// store, date and printed total ("Düzelt" opens them), a warning when the
// items do not add up to the total, and the items, each marked "Kontrol
// et" when the reader was unsure of any of its fields. An item opens
// "Kalemi düzelt". "Kaydet" saves once, however often it is pressed;
// nothing has to be confirmed one by one. "Vazgeç" leaves the draft
// unsaved: it never counts.
//
// ROADMAP v1 2 (10-Okunamadi.png, 11-AyniFis.png): when sending or
// reading fails, a plain message with "Tekrar dene", which sends the same
// receipt again (same key: still one receipt), and "Tekrar fotoğraf çek".
// When the draft looks like a receipt saved before, Kaydet asks first:
// "Kaydetme" (the safe choice) or "Yine de kaydet". Nothing is deleted.
export default function Check() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const auth = useAuth();
  const [state, setState] = useState<State>({ kind: "reading" });
  // Bumped by "Tekrar dene": waits for the new attempt, then reads again.
  const [round, setRound] = useState(0);
  const [retakeFailure, setRetakeFailure] = useState<Failure | null>(null);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  // The person's corrections; the draft keeps what was read.
  const [items, setItems] = useState<readonly DraftItem[]>([]);
  const [facts, setFacts] = useState<ReceiptFacts | null>(null);
  const [editing, setEditing] = useState<
    { kind: "item"; index: number } | { kind: "facts" } | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [saveFailure, setSaveFailure] = useState<Failure | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client || !id) {
      setState({ kind: "failed", failure: notReadable });
      return;
    }
    let current = true;
    setState({ kind: "reading" });
    void (async () => {
      const sent = await sendingOf(id);
      if (!current) return;
      if (sent && !sent.ok) {
        setState({ kind: "failed", failure: sent.failure });
        return;
      }
      const loaded = await loadDraft(client, id);
      if (!current) return;
      if (!loaded.ok) {
        setState({ kind: "failed", failure: loaded.failure });
      } else if (loaded.draft.status === "saved") {
        goHome();
      } else if (loaded.draft.status !== "needs_review") {
        setState({ kind: "failed", failure: notReadable });
      } else {
        const { draft } = loaded;
        setItems(draft.items);
        setFacts({
          storeName: draft.storeName,
          purchasedOn: draft.purchasedOn,
          totalKurus: draft.totalKurus,
          unsure: draft.unsure,
        });
        setState({ kind: "draft", draft });
      }
    })();
    return () => {
      current = false;
    };
  }, [id, round]);

  function retry() {
    const client = supabase;
    if (!client || !id) return;
    setRetakeFailure(null);
    // The same photo and key again; after a reload only the reading.
    if (!sendAgain(id)) trackSending(id, () => retryReading(client, id));
    setRound((n) => n + 1);
  }

  async function retake() {
    const client = supabase;
    if (!client || auth.status !== "signedIn") return;
    setRetakeFailure(null);
    const added = await pickAndSend(client, auth.session.user.id);
    if (added.kind === "refused") setRetakeFailure(added.failure);
    if (added.kind !== "sending") return;
    router.replace({ pathname: "/kontrol", params: { id: added.receiptId } });
  }

  if (state.kind === "reading") return <Reading />;

  if (state.kind === "failed" || !facts) {
    const failure = state.kind === "failed" ? state.failure : notReadable;
    return (
      <NotRead
        failure={failure}
        retakeFailure={retakeFailure}
        onRetry={retry}
        onRetake={() => void retake()}
      />
    );
  }

  const { draft } = state;

  if (editing?.kind === "facts") {
    return (
      <EditFacts
        facts={facts}
        onBack={() => setEditing(null)}
        onDone={(next) => {
          setFacts(next);
          setEditing(null);
        }}
      />
    );
  }

  const editedItem = editing?.kind === "item" ? items[editing.index] : null;
  if (editing?.kind === "item" && editedItem) {
    return (
      <EditItem
        key={editedItem.id}
        item={editedItem}
        onBack={() => setEditing(null)}
        onDone={(next) => {
          setItems((previous) =>
            previous.map((item, index) =>
              index === editing.index ? next : item,
            ),
          );
          setEditing(null);
        }}
      />
    );
  }

  const amounts = items.map((item) => item.amountKurus);
  const total = receiptTotal(facts.totalKurus, amounts);
  const mismatch = totalMismatch(facts.totalKurus, amounts);
  const flagged = (field: "store" | "date" | "total") =>
    facts.unsure.includes(field);

  async function save(allowDuplicate = false) {
    const client = supabase;
    if (!client || saving || !facts) return;
    setSaving(true);
    setSaveFailure(null);
    const original = new Map(draft.items.map((item) => [item.id, item]));
    const changedItems = items.filter(
      (item) => !sameJson(item, original.get(item.id)),
    );
    const originalFacts: ReceiptFacts = {
      storeName: draft.storeName,
      purchasedOn: draft.purchasedOn,
      totalKurus: draft.totalKurus,
      unsure: draft.unsure,
    };
    const result = await saveReceipt(
      client,
      draft.idempotencyKey,
      {
        items: changedItems,
        receipt: sameJson(facts, originalFacts) ? undefined : facts,
      },
      { allowDuplicate },
    );
    if (result.ok) {
      noteSaved();
      router.replace("/");
      return;
    }
    setSaving(false);
    if ("duplicate" in result) {
      setDuplicate(result.duplicate);
      return;
    }
    setDuplicate(null);
    setSaveFailure(result.failure);
  }

  const warning = mismatch ? mismatchText(mismatch) : null;

  return (
    <View style={styles.page}>
      <Screen>
        <BackButton to="Vazgeç" onPress={goHome} />
        <View style={styles.heading}>
          <Title>Kontrol et</Title>
          <Text style={type.caption}>
            Yanlış bir şey varsa üstüne dokunup düzeltin.
          </Text>
        </View>
        {draft.isSample ? <SampleBanner /> : null}
        <Card>
          <View style={styles.facts}>
            <View style={styles.storeRow}>
              <View style={styles.store}>
                <Text style={type.caption}>Mağaza</Text>
                <Text style={type.bodyStrong}>
                  {facts.storeName ?? "Okunamadı"}
                </Text>
                {flagged("store") ? <UnsurePill /> : null}
              </View>
              <TextButton
                label="Düzelt"
                accessibilityLabel="Mağaza, tarih ve toplamı düzelt"
                icon={PencilIcon}
                onPress={() => setEditing({ kind: "facts" })}
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.dateTotal}>
              <View style={styles.date}>
                <Text style={type.caption}>Tarih</Text>
                <Text style={type.bodyStrong}>
                  {facts.purchasedOn
                    ? formatDate(facts.purchasedOn)
                    : "Okunamadı"}
                </Text>
                {flagged("date") ? <UnsurePill /> : null}
              </View>
              <View style={styles.totalBox}>
                <Text style={[type.caption, styles.right]}>
                  {total.fromItems ? "Toplam (kalemlerden)" : "Toplam"}
                </Text>
                <Text style={[type.figure, styles.right]}>
                  {formatTl(total.totalKurus)}
                </Text>
                {flagged("total") || total.fromItems ? (
                  <View style={styles.pillRight}>
                    <UnsurePill />
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </Card>
        {warning ? (
          <Alert
            tone="attention"
            title={warning.title}
            detail={warning.detail}
          />
        ) : null}
        <View style={styles.list}>
          {items.map((item, index) => (
            <ListRow
              key={item.id}
              title={itemTitle(item)}
              amount={formatTl(item.amountKurus)}
              flagged={item.unsure.length > 0}
              last={index === items.length - 1}
              onPress={() => setEditing({ kind: "item", index })}
            />
          ))}
        </View>
        {saveFailure ? (
          <Alert
            tone="danger"
            title={saveFailure.title}
            detail={saveFailure.detail}
          />
        ) : null}
      </Screen>
      <Footer>
        <Button label="Kaydet" onPress={() => void save()} busy={saving} />
      </Footer>
      {duplicate ? (
        <DuplicateDialog
          duplicate={duplicate}
          saving={saving}
          // "Kaydetme": the draft stays unsaved and never counts.
          onKeep={goHome}
          onSaveAnyway={() => void save(true)}
        />
      ) : null}
    </View>
  );
}

/**
 * "Bu fiş okunamadı" (10-Okunamadi.png): what went wrong in plain words,
 * that nothing was saved, "Tekrar dene" and "Tekrar fotoğraf çek".
 */
function NotRead({
  failure,
  retakeFailure,
  onRetry,
  onRetake,
}: {
  failure: Failure;
  retakeFailure: Failure | null;
  onRetry: () => void;
  onRetake: () => void;
}) {
  return (
    <View style={styles.page}>
      <Screen>
        <BackButton to="Ana Sayfa" onPress={goHome} />
        <View style={styles.notRead}>
          <View style={[styles.iconCircle, styles.dangerCircle]}>
            <AlertIcon color={color.danger.fg} size={48} />
          </View>
          <Text
            style={[type.title, styles.center]}
            accessibilityRole="header"
            accessibilityLiveRegion="assertive"
          >
            {failure.title}
          </Text>
          <Text style={[type.body, styles.muted, styles.center]}>
            {failure.detail}
          </Text>
        </View>
        {retakeFailure ? (
          <Alert
            tone="danger"
            title={retakeFailure.title}
            detail={retakeFailure.detail}
          />
        ) : null}
      </Screen>
      <Footer>
        <View style={styles.actions}>
          <Button label="Tekrar dene" icon={RetryIcon} onPress={onRetry} />
          <Button
            label="Tekrar fotoğraf çek"
            variant="secondary"
            icon={CameraIcon}
            onPress={onRetake}
          />
        </View>
      </Footer>
    </View>
  );
}

/**
 * "Bu fiş daha önce kaydedilmiş olabilir" (11-AyniFis.png): the saved
 * receipt it looks like, why that matters, and the safe choice first.
 */
function DuplicateDialog({
  duplicate,
  saving,
  onKeep,
  onSaveAnyway,
}: {
  duplicate: Duplicate;
  saving: boolean;
  onKeep: () => void;
  onSaveAnyway: () => void;
}) {
  const named = [
    duplicate.storeName,
    duplicate.purchasedOn ? formatDate(duplicate.purchasedOn) : null,
  ].filter((part) => part !== null);
  return (
    <View style={styles.scrim}>
      <View
        style={styles.dialog}
        role="dialog"
        aria-modal
        aria-labelledby="duplicate-title"
        accessibilityViewIsModal
      >
        <View style={[styles.iconCircle, styles.attentionCircle]}>
          <CopyIcon color={color.attention.fg} size={32} />
        </View>
        <Text
          nativeID="duplicate-title"
          style={type.section}
          accessibilityRole="header"
          accessibilityLiveRegion="assertive"
        >
          Bu fiş daha önce kaydedilmiş olabilir
        </Text>
        <View style={styles.match}>
          <Text style={type.bodyStrong}>
            {named.length > 0 ? named.join(" · ") : "Kayıtlı bir fiş"}
          </Text>
          <Text style={type.body}>{formatTl(duplicate.totalKurus)}</Text>
        </View>
        <Text style={[type.body, styles.muted]}>
          Aynı fişi iki kez kaydederseniz toplam harcamanız iki kat görünür.
        </Text>
        <View style={styles.actions}>
          <Button label="Kaydetme" onPress={onKeep} />
          <Button
            label="Yine de kaydet"
            variant="secondary"
            busy={saving}
            onPress={onSaveAnyway}
          />
        </View>
      </View>
    </View>
  );
}

/** Only the mark and "Fiş okunuyor": no state name, no steps (PRD #4). */
function Reading() {
  const [lit, setLit] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setLit((n) => (n + 1) % 3), 450);
    return () => clearInterval(timer);
  }, []);
  return (
    <Screen center>
      <View style={styles.reading}>
        <View style={styles.markCircle}>
          <Mark size={104} />
        </View>
        <Text
          style={[type.title, styles.center]}
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
        >
          Fiş okunuyor
        </Text>
        <View style={styles.dots} aria-hidden>
          {[0, 1, 2].map((n) => (
            <View key={n} style={[styles.dot, n === lit && styles.dotLit]} />
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.background },
  heading: { gap: space.xs },
  facts: { gap: space.md },
  storeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.sm,
  },
  store: { flexShrink: 1, gap: space.xxs, alignItems: "flex-start" },
  pillRight: { alignSelf: "flex-end", marginTop: space.xxs },
  divider: { height: 1, backgroundColor: color.border },
  dateTotal: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: space.sm,
  },
  date: { flexShrink: 1, gap: space.xxs, alignItems: "flex-start" },
  totalBox: { marginLeft: "auto" },
  right: { textAlign: "right" },
  list: {
    backgroundColor: color.surface,
    borderColor: color.border,
    borderWidth: 1,
    borderRadius: radius.card,
    overflow: "hidden",
  },
  reading: { alignItems: "center", gap: space.xl },
  markCircle: {
    width: 176,
    height: 176,
    borderRadius: radius.pill,
    backgroundColor: color.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { textAlign: "center" },
  muted: { color: color.textMuted },
  actions: { gap: space.sm },
  notRead: {
    alignItems: "center",
    gap: space.lg,
    paddingTop: space.xxxl,
  },
  iconCircle: {
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerCircle: {
    width: 120,
    height: 120,
    backgroundColor: color.danger.bg,
  },
  attentionCircle: {
    width: 64,
    height: 64,
    backgroundColor: color.attention.bg,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(37,33,31,.55)",
    justifyContent: "center",
    padding: screenPadding,
  },
  dialog: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    backgroundColor: color.surface,
    borderRadius: 20,
    padding: space.xl,
    gap: space.lg,
  },
  match: {
    backgroundColor: color.background,
    borderColor: color.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: space.md,
    gap: space.xxs,
  },
  dots: { flexDirection: "row", gap: space.sm },
  dot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: color.primaryTintStrong,
  },
  dotLit: { backgroundColor: color.primary },
});
