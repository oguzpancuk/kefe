import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlertIcon, CheckIcon, ChevronLeftIcon } from "./icons";
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
  variant?: "primary" | "secondary";
  busy?: boolean;
  icon?: (props: { color: string; size: number }) => ReactNode;
};

/** Primary: filled blue, one per screen. Secondary: white, 2 px blue border. */
export function Button({
  label,
  onPress,
  variant = "primary",
  busy = false,
  icon: Icon,
}: ButtonProps) {
  const primary = variant === "primary";
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
        pressed &&
          (primary ? styles.buttonPrimaryPressed : styles.buttonPressed),
      ]}
    >
      {busy ? (
        <ActivityIndicator color={foreground} />
      ) : (
        Icon?.({ color: foreground, size: icon.default })
      )}
      <Text style={[type.button, styles.buttonText, { color: foreground }]}>
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
} & Pick<
  TextInputProps,
  | "placeholder"
  | "autoComplete"
  | "keyboardType"
  | "textContentType"
  | "onSubmitEditing"
  | "returnKeyType"
>;

/** Label above in 16/700; 19 text; error = 2 px red border (DESIGN.md: input). */
export function TextField({
  label,
  value,
  onChangeText,
  invalid = false,
  hint,
  secret = false,
  ...inputProps
}: TextFieldProps) {
  const [shown, setShown] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={type.label}>{label}</Text>
      {hint ? <Text style={type.caption}>{hint}</Text> : null}
      <View style={[styles.inputBox, invalid && styles.inputBoxInvalid]}>
        <TextInput
          {...inputProps}
          value={value}
          onChangeText={onChangeText}
          accessibilityLabel={label}
          accessibilityHint={hint}
          aria-invalid={invalid}
          secureTextEntry={secret && !shown}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={color.textMuted}
          style={[type.input, styles.input]}
        />
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
  tone: "danger" | "success";
  title: string;
  detail: string;
}) {
  const palette = tone === "danger" ? color.danger : color.success;
  const Icon = tone === "danger" ? AlertIcon : CheckIcon;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={[
        styles.alert,
        { backgroundColor: palette.bg, borderColor: palette.fg },
      ]}
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
});
