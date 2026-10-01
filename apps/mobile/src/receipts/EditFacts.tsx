import {
  formatDateNumeric,
  formatTlAmount,
  InvalidInputError,
  InvalidTlAmountError,
  parseTlAmount,
  parseTrDate,
} from "@kefe/core";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import {
  Alert,
  BackButton,
  Button,
  Footer,
  Screen,
  TextField,
  Title,
} from "../ui/components";
import { color } from "../ui/theme";
import type { ReceiptFacts } from "./receipts";

type Field = "date" | "total";

const PROBLEMS: Record<Field, { title: string; detail: string }> = {
  date: {
    title: "Tarih anlaşılamadı.",
    detail: "28.09.2026 gibi gün, ay, yıl olarak yazın.",
  },
  total: {
    title: "Toplam anlaşılamadı.",
    detail: "Toplamı 612,35 gibi, virgülle yazın.",
  },
};

/** An empty field is unknown (null); anything else must parse. */
function optional<T>(text: string, parse: (text: string) => T) {
  if (text.trim() === "") return null;
  try {
    return parse(text);
  } catch (error) {
    if (
      error instanceof InvalidInputError ||
      error instanceof InvalidTlAmountError
    ) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Fiş bilgilerini düzelt: the store, the date and the printed total, from
 * "Düzelt" on Kontrol et. An emptied total is saved as the items' sum.
 * Everything here was in front of the person, so "Tamam" clears its
 * "Kontrol et" marks.
 */
export function EditFacts({
  facts,
  onBack,
  onDone,
}: {
  facts: ReceiptFacts;
  onBack: () => void;
  onDone: (facts: ReceiptFacts) => void;
}) {
  const [store, setStore] = useState(facts.storeName ?? "");
  const [date, setDate] = useState(
    facts.purchasedOn ? formatDateNumeric(facts.purchasedOn) : "",
  );
  const [total, setTotal] = useState(
    facts.totalKurus === null ? "" : formatTlAmount(facts.totalKurus),
  );
  const [invalid, setInvalid] = useState<readonly Field[]>([]);
  const flagged = (field: "store" | "date" | "total") =>
    facts.unsure.includes(field);

  function done() {
    const purchasedOn = optional(date, parseTrDate);
    const totalKurus = optional(total, parseTlAmount);
    const problems: Field[] = [];
    if (purchasedOn === undefined) problems.push("date");
    if (totalKurus === undefined || (totalKurus ?? 0) < 0)
      problems.push("total");
    if (
      problems.length > 0 ||
      purchasedOn === undefined ||
      totalKurus === undefined
    ) {
      setInvalid(problems);
      return;
    }
    onDone({
      storeName: store.trim() || null,
      purchasedOn,
      totalKurus,
      unsure: [],
    });
  }

  const first = invalid[0];
  const clear = (setter: (value: string) => void, field: Field) =>
    function change(value: string) {
      setter(value);
      setInvalid((fields) => fields.filter((f) => f !== field));
    };

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen>
        <BackButton to="Kontrol et" onPress={onBack} />
        <Title>Fiş bilgilerini düzelt</Title>
        {first ? (
          <Alert
            tone="danger"
            title={PROBLEMS[first].title}
            detail={PROBLEMS[first].detail}
          />
        ) : null}
        <TextField
          label="Mağaza"
          value={store}
          onChangeText={setStore}
          flagged={flagged("store")}
          placeholder="Fişte okunamadı"
          autoCapitalize="words"
        />
        <TextField
          label="Tarih"
          hint="Gün, ay, yıl: örneğin 28.09.2026"
          value={date}
          onChangeText={clear(setDate, "date")}
          flagged={flagged("date")}
          invalid={invalid.includes("date")}
          placeholder="Fişte okunamadı"
          inputMode="decimal"
          keyboardType="numbers-and-punctuation"
        />
        <TextField
          label="Toplam"
          hint="Fişin altında yazan toplam"
          value={total}
          onChangeText={clear(setTotal, "total")}
          flagged={flagged("total")}
          invalid={invalid.includes("total")}
          suffix="TL"
          placeholder="Fişte okunamadı"
          inputMode="decimal"
          keyboardType="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={done}
        />
      </Screen>
      <Footer>
        <Button label="Tamam" onPress={done} />
      </Footer>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.background },
});
