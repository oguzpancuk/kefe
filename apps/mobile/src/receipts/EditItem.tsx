import {
  categories,
  categoryLabels,
  formatMeasure,
  formatTlAmount,
  InvalidInputError,
  InvalidTlAmountError,
  otherInfoUnsure,
  parseMeasure,
  parsePackageCount,
  parseTlAmount,
  unsureAfterCheck,
  type Category,
  type ItemField,
} from "@kefe/core";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import {
  Alert,
  BackButton,
  Button,
  ChoiceField,
  Disclosure,
  Footer,
  RawLine,
  Screen,
  TextField,
  Title,
} from "../ui/components";
import { color, space } from "../ui/theme";
import type { DraftItem } from "./receipts";

type Field = "amount" | "package_size" | "package_count" | "quantity";

// What to tell the person when a field cannot be read: a bold first
// sentence and how to write it instead.
const PROBLEMS: Record<Field, { title: string; detail: string }> = {
  amount: {
    title: "Tutar anlaşılamadı.",
    detail: "Tutarı 12,50 gibi, virgülle yazın.",
  },
  package_size: {
    title: "Paket boyu anlaşılamadı.",
    detail: "500 g, 1 L ya da 15 adet gibi, birimiyle yazın.",
  },
  package_count: {
    title: "Adet anlaşılamadı.",
    detail: "1 ya da 2 gibi bir tam sayı yazın.",
  },
  quantity: {
    title: "Miktar anlaşılamadı.",
    detail: "1,24 kg gibi, virgülle ve birimiyle yazın.",
  },
};

const CATEGORY_OPTIONS = categories.map((value) => ({
  value,
  label: categoryLabels[value],
}));

/** Runs a core parser; an unreadable entry becomes `undefined`. */
function attempt<T>(parse: () => T): T | undefined {
  try {
    return parse();
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
 * Kalemi düzelt (docs/design/screens/09-KalemDuzenle.png, 09b): the
 * printed line, then only the name and the amount. Brand, package size,
 * number of packages, quantity and category wait under a closed "Diğer
 * bilgiler", which shows "Kontrol et" while closed when one of them is
 * unsure. An unread brand or size is an empty field, never a guess.
 */
export function EditItem({
  item,
  onBack,
  onDone,
}: {
  item: DraftItem;
  onBack: () => void;
  onDone: (item: DraftItem) => void;
}) {
  const [name, setName] = useState(item.name ?? "");
  const [amount, setAmount] = useState(formatTlAmount(item.amountKurus));
  const [brand, setBrand] = useState(item.brand ?? "");
  const [packageSize, setPackageSize] = useState(
    item.packageSize ? formatMeasure(item.packageSize) : "",
  );
  const [packageCount, setPackageCount] = useState(
    item.packageCount === null ? "" : String(item.packageCount),
  );
  const [quantity, setQuantity] = useState(
    item.quantity ? formatMeasure(item.quantity) : "",
  );
  const [category, setCategory] = useState<Category | null>(item.category);
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState<readonly Field[]>([]);

  const unsure = (field: ItemField) => item.unsure.includes(field);
  const edited = (setter: (value: string) => void, field: Field) =>
    function change(value: string) {
      setter(value);
      setInvalid((fields) => fields.filter((f) => f !== field));
    };

  function done() {
    const amountKurus = attempt(() => parseTlAmount(amount));
    const size = attempt(() => parseMeasure(packageSize));
    const count = attempt(() => parsePackageCount(packageCount));
    const measured = attempt(() => parseMeasure(quantity));
    const problems: Field[] = [];
    if (amountKurus === undefined) problems.push("amount");
    if (size === undefined) problems.push("package_size");
    if (count === undefined) problems.push("package_count");
    if (measured === undefined) problems.push("quantity");
    if (
      amountKurus === undefined ||
      size === undefined ||
      count === undefined ||
      measured === undefined
    ) {
      setInvalid(problems);
      // A problem in a hidden field must be in sight to be fixed.
      if (problems.some((field) => field !== "amount")) setOpen(true);
      return;
    }
    onDone({
      ...item,
      name: name.trim() || null,
      brand: brand.trim() || null,
      amountKurus,
      packageSize: size,
      packageCount: count,
      quantity: measured,
      category,
      unsure: unsureAfterCheck(item.unsure, { otherInfoOpened: open }),
    });
  }

  const first = invalid[0];

  // iOS: the number pad has no return key and covers the bottom of the
  // screen, so "Tamam" rises above it.
  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen>
        <BackButton to="Kontrol et" onPress={onBack} />
        <Title>Kalemi düzelt</Title>
        <RawLine>{item.rawText}</RawLine>
        {first ? (
          <Alert
            tone="danger"
            title={PROBLEMS[first].title}
            detail={PROBLEMS[first].detail}
          />
        ) : null}
        <TextField
          label="Ürün adı"
          value={name}
          onChangeText={setName}
          flagged={unsure("name")}
          placeholder="Fişte okunamadı"
          autoCapitalize="sentences"
        />
        <TextField
          label="Tutar"
          value={amount}
          onChangeText={edited(setAmount, "amount")}
          flagged={unsure("amount")}
          suffix="TL"
          invalid={invalid.includes("amount")}
          inputMode="decimal"
          keyboardType="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={done}
        />
        <Disclosure
          title="Diğer bilgiler"
          summary="Marka, paket boyu, adet, miktar, kategori"
          open={open}
          onToggle={() => setOpen((o) => !o)}
          flagged={otherInfoUnsure(item.unsure)}
        >
          <TextField
            label="Marka"
            value={brand}
            onChangeText={setBrand}
            flagged={unsure("brand")}
            placeholder="Fişte okunamadı"
            autoCapitalize="words"
          />
          <View style={styles.pair}>
            <View style={styles.size}>
              <TextField
                label="Paket boyu"
                value={packageSize}
                onChangeText={edited(setPackageSize, "package_size")}
                flagged={unsure("package_size")}
                invalid={invalid.includes("package_size")}
                placeholder="Fişte okunamadı"
              />
            </View>
            <View style={styles.count}>
              <TextField
                label="Adet"
                value={packageCount}
                onChangeText={edited(setPackageCount, "package_count")}
                flagged={unsure("package_count")}
                invalid={invalid.includes("package_count")}
                inputMode="numeric"
                keyboardType="number-pad"
              />
            </View>
          </View>
          <TextField
            label="Miktar"
            hint="Tartılarak alınanlarda, örneğin 1,24 kg"
            value={quantity}
            onChangeText={edited(setQuantity, "quantity")}
            flagged={unsure("quantity")}
            invalid={invalid.includes("quantity")}
          />
          <ChoiceField
            label="Kategori"
            value={category}
            options={CATEGORY_OPTIONS}
            onChange={setCategory}
            placeholder="Seçilmedi"
            flagged={unsure("category")}
          />
        </Disclosure>
      </Screen>
      <Footer>
        <Button label="Tamam" onPress={done} />
      </Footer>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.background },
  // Side by side while they fit; at large text the count wraps below.
  pair: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  size: { flexGrow: 2, flexBasis: 160 },
  count: { flexGrow: 1, flexBasis: 96 },
});
