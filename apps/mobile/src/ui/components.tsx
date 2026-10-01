import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AlertIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  FlaskIcon,
} from "./icons";
import {
  border,
  color,
  icon,
  minHeight,
  radius,
  screenPadding,
  space,
  type,
} from "./theme";

// The few components the first screens need, built to DESIGN.md's
// component table. Heights are minimums; nothing here fixes a height.

/** Scrolling page on the paper background, narrow and centred on wide screens. */
export function Screen({
  children,
  center = false,
}: {
  children: ReactNode;
  center?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.screenContent,
        center && styles.screenCenter,
        { paddingTop: insets.top + space.xl },
      ]}
      keyboardShouldPersistTaps="handled"
      // iOS: scroll a field and its button out from under the keyboard.
      automaticallyAdjustKeyboardInsets
    >
      <View style={styles.column}>{children}</View>
    </ScrollView>
  );
}

export function Title({ children }: { children: string }) {
  return (
    <Text style={type.title} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "hero";
  busy?: boolean;
  icon?: (props: { color: string; size: number }) => ReactNode;
};

/**
 * Primary: filled blue, one per screen. Secondary: white, 2 px blue border.
 * Hero: "Fiş ekle" only, the one 72-high button in the app (DESIGN.md).
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  busy = false,
  icon: Icon,
}: ButtonProps) {
  const hero = variant === "hero";
  const primary = variant === "primary" || hero;
  const foreground = primary ? color.onPrimary : color.primary;
  return (
    <Pressable
      onPress={busy ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled: busy }}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        hero && styles.buttonHero,
        pressed &&
          (primary ? styles.buttonPrimaryPressed : styles.buttonPressed),
      ]}
    >
      {busy ? (
        <ActivityIndicator color={foreground} />
      ) : (
        Icon?.({ color: foreground, size: hero ? icon.hero : icon.default })
      )}
      <Text
        style={[
          hero ? type.buttonHero : type.button,
          styles.buttonText,
          { color: foreground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Chevron plus the name of the screen it returns to (DESIGN.md: back button). */
export function BackButton({
  to,
  onPress,
}: {
  to: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      style={({ pressed }) => [styles.back, pressed && styles.pressedText]}
    >
      <ChevronLeftIcon color={color.primary} />
      <Text style={[type.bodyStrong, styles.link]}>{to}</Text>
    </Pressable>
  );
}

type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  invalid?: boolean;
  hint?: string;
  secret?: boolean;
  /** A unit written inside the box, after the text ("TL"). */
  suffix?: string;
  /** The reader was unsure: "Kontrol et" beside the label. */
  flagged?: boolean;
} & Pick<
  TextInputProps,
  | "placeholder"
  | "autoCapitalize"
  | "autoComplete"
  | "keyboardType"
  | "textContentType"
  | "onSubmitEditing"
  | "returnKeyType"
  | "inputMode"
  | "autoFocus"
>;

/** Label above in 16/700; 19 text; error = 2 px red border (DESIGN.md: input). */
export function TextField({
  label,
  value,
  onChangeText,
  invalid = false,
  hint,
  secret = false,
  suffix,
  flagged = false,
  autoCapitalize = "none",
  ...inputProps
}: TextFieldProps) {
  const [shown, setShown] = useState(false);
  return (
    <View style={styles.field}>
      <FieldLabel label={label} flagged={flagged} />
      {hint ? <Text style={type.caption}>{hint}</Text> : null}
      <View style={[styles.inputBox, invalid && styles.inputBoxInvalid]}>
        <TextInput
          {...inputProps}
          value={value}
          onChangeText={onChangeText}
          accessibilityLabel={
            (suffix ? `${label} (${suffix})` : label) +
            (flagged ? ", Kontrol et" : "")
          }
          accessibilityHint={hint}
          aria-invalid={invalid}
          secureTextEntry={secret && !shown}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          placeholderTextColor={color.textMuted}
          style={[type.input, styles.input]}
        />
        {suffix ? (
          <Text style={[type.bodyStrong, styles.suffix]} aria-hidden>
            {suffix}
          </Text>
        ) : null}
        {secret ? (
          <Pressable
            onPress={() => setShown((s) => !s)}
            accessibilityRole="button"
            accessibilityLabel={shown ? "Şifreyi gizle" : "Şifreyi göster"}
            style={({ pressed }) => [
              styles.reveal,
              pressed && styles.pressedText,
            ]}
          >
            <Text style={[type.bodyStrong, styles.link]}>
              {shown ? "Gizle" : "Göster"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Icon + bold first sentence + plain second sentence; never colour alone. */
export function Alert({
  tone,
  title,
  detail,
}: {
  tone: "danger" | "success" | "attention";
  title: string;
  detail: string;
}) {
  const palette = color[tone];
  const edge = tone === "attention" ? color.attention.border : palette.fg;
  const Icon = tone === "success" ? CheckIcon : AlertIcon;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={[styles.alert, { backgroundColor: palette.bg, borderColor: edge }]}
    >
      <Icon color={palette.fg} size={28} />
      <Text style={[type.body, styles.alertText, { color: palette.fg }]}>
        <Text style={[type.bodyStrong, { color: palette.fg }]}>{title}</Text>
        {"\n"}
        {detail}
      </Text>
    </View>
  );
}

/** A bar pinned under a scrolling screen, for its one main action. */
export function Footer({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.column}>{children}</View>
    </View>
  );
}

/** "Örnek veri — fişiniz okunmadı": top of every screen with mock data. */
export function SampleBanner() {
  return (
    <View style={styles.sample}>
      <FlaskIcon color={color.text} />
      <Text style={[type.bodyStrong, styles.sampleText]}>
        Örnek veri — fişiniz okunmadı
      </Text>
    </View>
  );
}

/** A tappable list row: title left, amount right, chevron (DESIGN.md). */
export function ListRow({
  title,
  amount,
  onPress,
  last = false,
  flagged = false,
}: {
  title: string;
  amount: string;
  onPress: () => void;
  last?: boolean;
  /** Something on this line needs a look: "Kontrol et" under the title. */
  flagged?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${amount}${flagged ? ", Kontrol et" : ""}`}
      accessibilityHint="Düzeltmek için dokunun"
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowDivider,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.rowBody}>
        <View style={styles.rowLine}>
          <Text style={[type.bodyStrong, styles.rowTitle]}>{title}</Text>
          <Text style={[type.bodyStrong, styles.rowAmount]}>{amount}</Text>
        </View>
        {/* Under the whole line, so it never squeezes into a narrow column. */}
        {flagged ? <UnsurePill /> : null}
      </View>
      <ChevronRightIcon color={color.textMuted} />
    </Pressable>
  );
}

/**
 * "Kontrol et": the reader was unsure of this value. Amber pill with a
 * triangle and the words, never colour alone (DESIGN.md).
 */
export function UnsurePill() {
  return (
    <View style={styles.pill}>
      <AlertIcon color={color.attention.fg} size={20} />
      <Text style={[type.label, { color: color.attention.fg }]}>
        Kontrol et
      </Text>
    </View>
  );
}

/** A field's label, with "Kontrol et" beside it when the value is unsure. */
export function FieldLabel({
  label,
  flagged = false,
}: {
  label: string;
  flagged?: boolean;
}) {
  return (
    <View style={styles.labelRow}>
      <Text style={type.label}>{label}</Text>
      {flagged ? <UnsurePill /> : null}
    </View>
  );
}

/** Blue words with an optional icon, 48 high (DESIGN.md: text button). */
export function TextButton({
  label,
  onPress,
  icon: Icon,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  icon?: (props: { color: string; size: number }) => ReactNode;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.textButton,
        pressed && styles.pressedText,
      ]}
    >
      {Icon?.({ color: color.primary, size: icon.default })}
      <Text style={[type.bodyStrong, styles.link]}>{label}</Text>
    </Pressable>
  );
}

/**
 * A card that opens on tap ("Diğer bilgiler"). Closed, it names what is
 * inside and shows "Kontrol et" when something inside is unsure.
 */
export function Disclosure({
  title,
  summary,
  open,
  onToggle,
  flagged = false,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  flagged?: boolean;
  children: ReactNode;
}) {
  const Chevron = open ? ChevronUpIcon : ChevronDownIcon;
  return (
    <View style={styles.card}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={
          `${title}: ${summary}` + (flagged && !open ? ", Kontrol et" : "")
        }
        style={({ pressed }) => [
          styles.disclosureHead,
          pressed && styles.pressedText,
        ]}
      >
        <View style={styles.disclosureText}>
          <Text style={type.section}>{title}</Text>
          {open ? null : <Text style={type.caption}>{summary}</Text>}
          {flagged && !open ? <UnsurePill /> : null}
        </View>
        <Chevron color={color.primary} />
      </Pressable>
      {open ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
}

/**
 * Pick one of a few options: a box showing the choice that opens into a
 * list of large rows, the chosen one marked with a tick and "seçili".
 */
export function ChoiceField<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
  flagged = false,
}: {
  label: string;
  value: T | null;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  placeholder: string;
  flagged?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const chosen = options.find((option) => option.value === value);
  const Chevron = open ? ChevronUpIcon : ChevronDownIcon;
  return (
    <View style={styles.field}>
      <FieldLabel label={label} flagged={flagged} />
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}: ${chosen?.label ?? placeholder}${flagged ? ", Kontrol et" : ""}`}
        style={({ pressed }) => [
          styles.inputBox,
          styles.choiceBox,
          pressed && styles.rowPressed,
        ]}
      >
        <Text
          style={[
            type.input,
            styles.choiceText,
            !chosen && { color: color.textMuted },
          ]}
        >
          {chosen?.label ?? placeholder}
        </Text>
        <Chevron color={color.primary} />
      </Pressable>
      {open ? (
        <View style={styles.choices} accessibilityRole="radiogroup">
          {options.map((option, index) => {
            const selected = option.value === value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={option.label}
                style={({ pressed }) => [
                  styles.choice,
                  index < options.length - 1 && styles.rowDivider,
                  pressed && styles.rowPressed,
                ]}
              >
                <Text style={[type.body, styles.choiceText]}>
                  {option.label}
                </Text>
                {selected ? (
                  <View style={styles.chosen}>
                    <CheckIcon color={color.primary} />
                    <Text style={[type.label, styles.link]}>seçili</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/** The receipt's line exactly as printed, in monospace (DESIGN.md: Type). */
export function RawLine({ children }: { children: string }) {
  return (
    <View style={styles.raw}>
      <Text style={type.caption}>Fişte yazan</Text>
      <Text style={[type.body, styles.rawText]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  screenContent: {
    flexGrow: 1,
    paddingHorizontal: screenPadding,
    paddingBottom: space.xxl,
  },
  screenCenter: { justifyContent: "center" },
  column: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    gap: space.lg,
  },
  card: {
    backgroundColor: color.surface,
    borderColor: color.border,
    borderWidth: border.hairline,
    borderRadius: radius.card,
    padding: space.md,
  },
  button: {
    minHeight: minHeight.button,
    borderRadius: radius.button,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  buttonPrimary: { backgroundColor: color.primary },
  buttonHero: {
    minHeight: minHeight.buttonHero,
    borderRadius: radius.buttonHero,
  },
  buttonPrimaryPressed: { backgroundColor: color.primaryPressed },
  buttonSecondary: {
    backgroundColor: color.surface,
    borderWidth: border.button,
    borderColor: color.primary,
  },
  buttonPressed: { backgroundColor: color.primaryTint },
  buttonText: { textAlign: "center", flexShrink: 1 },
  back: {
    minHeight: minHeight.touch,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: space.xxs,
  },
  link: { color: color.primary },
  pressedText: { opacity: 0.6 },
  field: { gap: space.xs },
  inputBox: {
    minHeight: minHeight.input,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: color.surface,
    borderColor: color.borderStrong,
    borderWidth: border.input,
    borderRadius: radius.input,
  },
  inputBoxInvalid: { borderColor: color.danger.fg, borderWidth: border.error },
  input: {
    flex: 1,
    // A web <input> keeps a built-in minimum width; without this it pushes
    // "Göster" out of the box on narrow screens and at large text.
    minWidth: 0,
    minHeight: minHeight.input - 2 * border.error,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  suffix: { color: color.textMuted, paddingHorizontal: space.md },
  reveal: {
    minHeight: minHeight.touch,
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  alert: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    borderWidth: border.hairline,
    borderRadius: radius.card,
    padding: space.md,
  },
  alertText: { flex: 1 },
  footer: {
    backgroundColor: color.background,
    borderTopWidth: border.hairline,
    borderTopColor: color.border,
    paddingHorizontal: screenPadding,
    paddingTop: space.md,
  },
  sample: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: color.surfaceMuted,
    borderColor: color.borderStrong,
    borderWidth: border.input,
    borderStyle: "dashed",
    borderRadius: radius.input,
    padding: space.md,
  },
  sampleText: { flex: 1 },
  row: {
    minHeight: minHeight.listRow,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  rowDivider: {
    borderBottomWidth: border.hairline,
    borderBottomColor: color.border,
  },
  rowPressed: { backgroundColor: color.primaryTint },
  rowBody: { flex: 1, gap: space.xs },
  rowLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  rowTitle: { flex: 1 },
  rowAmount: { fontVariant: ["tabular-nums"] },
  raw: {
    backgroundColor: color.surfaceMuted,
    borderRadius: radius.input,
    padding: space.md,
    gap: space.xxs,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: space.xxs,
    backgroundColor: color.attention.bg,
    borderColor: color.attention.border,
    borderWidth: border.input,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
  },
  labelRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.xs,
  },
  textButton: {
    minHeight: minHeight.touch,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.xxs,
  },
  disclosureHead: {
    minHeight: minHeight.touch,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  disclosureText: { flex: 1, gap: space.xs, alignItems: "flex-start" },
  disclosureBody: { gap: space.lg, marginTop: space.lg },
  choiceBox: { paddingHorizontal: space.md, gap: space.sm },
  choiceText: { flex: 1 },
  choices: {
    backgroundColor: color.surface,
    borderColor: color.borderStrong,
    borderWidth: border.input,
    borderRadius: radius.input,
    overflow: "hidden",
  },
  choice: {
    minHeight: minHeight.button,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  chosen: { flexDirection: "row", alignItems: "center", gap: space.xxs },
  rawText: {
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
  },
});
