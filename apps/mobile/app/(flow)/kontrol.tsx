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
import { noteSaved, sendingOf } from "../../src/receipts/pending";
import {
  loadDraft,
  saveReceipt,
  type Draft,
  type DraftItem,
  type Failure,
  type ReceiptFacts,
} from "../../src/receipts/receipts";
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
import { Mark, PencilIcon } from "../../src/ui/icons";
import { color, radius, space, type } from "../../src/ui/theme";

type State =
  | { kind: "reading" }
  | { kind: "failed"; failure: Failure }
  | { kind: "draft"; draft: Draft };

const notReadable: Failure = {
  title: "Fiş okunamadı.",
  detail: "Ana Sayfa'ya dönüp fişi yeniden ekleyin.",
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
export default function Check() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [state, setState] = useState<State>({ kind: "reading" });
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
  }, [id]);

  if (state.kind === "reading") return <Reading />;

  if (state.kind === "failed" || !facts) {
    const failure = state.kind === "failed" ? state.failure : notReadable;
    return (
      <Screen center>
        <Alert tone="danger" title={failure.title} detail={failure.detail} />
        <Button label="Ana Sayfa'ya dön" onPress={goHome} />
      </Screen>
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

  async function save() {
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
    const result = await saveReceipt(client, draft.idempotencyKey, {
      items: changedItems,
      receipt: sameJson(facts, originalFacts) ? undefined : facts,
    });
    if (result.ok) {
      noteSaved();
      router.replace("/");
      return;
    }
    setSaving(false);
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
        <Button label="Kaydet" onPress={save} busy={saving} />
      </Footer>
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
  dots: { flexDirection: "row", gap: space.sm },
  dot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: color.primaryTintStrong,
  },
  dotLit: { backgroundColor: color.primary },
});
