/**
 * Shared presentational components.
 * Purely visual — no data fetching, no global state.
 *
 * Iverto.ai design language: every surface is semi-transparent white glass
 * (rgba(255,255,255,0.8) → 0.9) with a hairline border, soft curves and a
 * neutral float shadow. The brand crimson (#B9000E, sampled from the logo)
 * appears only as an accent — icon tints, the primary button, selected chips,
 * status dots.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  TextInputProps,
  ViewStyle,
  StyleProp,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Logo } from '@/components/Logo';
import { useEnsureVisible } from '@/components/KeyboardAware';
import {
  blur,
  cardBackground,
  colors,
  glassFill,
  LIFT,
  radius,
  shadow,
  spacing,
  type,
} from '@/theme';
import { statusInfo } from '@/lib/status';
import type { PermissionStatus } from '@/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/* ------------------------------------------------------------ GlassPanel */

/**
 * Frosted surface behind cards, bars and badges.
 *
 * Android gets a flat opaque fill — real blur is too costly there, and an
 * elevated view with a translucent background makes Android render the
 * shadow caster as a hard white rectangle inside the card.
 */
export function GlassPanel({
  children,
  intensity = blur.card,
  style,
  strong,
}: {
  children: React.ReactNode;
  intensity?: number;
  style?: StyleProp<ViewStyle>;
  strong?: boolean;
}) {
  if (Platform.OS === 'android') {
    const fill = strong ? glassFill.strong : glassFill.base;
    return <View style={[{ backgroundColor: fill }, style]}>{children}</View>;
  }
  const fill = strong ? colors.glassStrong : colors.glass;
  return (
    <BlurView intensity={intensity} tint="light" style={style}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
      {children}
    </BlurView>
  );
}

/* ---------------------------------------------------------------- Button */

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  full = true,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isPrimary = variant === 'primary';
  const palette: Record<string, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.primary, fg: colors.onPrimary },
    secondary: { bg: colors.glassStrong, fg: colors.text, border: colors.borderStrong },
    ghost: { bg: 'transparent', fg: colors.primary },
    danger: { bg: colors.dangerBg, fg: colors.danger, border: 'rgba(220,38,38,0.22)' },
    success: { bg: colors.successBg, fg: colors.success, border: 'rgba(5,150,105,0.22)' },
  };
  const p = palette[variant];

  const inner = loading ? (
    <ActivityIndicator color={p.fg} size="small" />
  ) : (
    <>
      {icon ? <Ionicons name={icon} size={18} color={p.fg} /> : null}
      <Text style={[type.bodyMed, { color: p.fg }]}>{label}</Text>
    </>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        full && { alignSelf: 'stretch' },
        {
          backgroundColor: p.bg,
          borderColor: p.border ?? 'transparent',
          borderWidth: p.border ? 1 : 0,
          opacity: disabled ? 0.45 : pressed ? 0.9 : 1,
          transform: [{ translateY: pressed && !disabled ? 1 : 0 }],
        },
        isPrimary && shadow.lifted,
        style,
      ]}
    >
      {isPrimary ? (
        <LinearGradient
          colors={colors.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={styles.btnRow}>{inner}</View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ Card */

export function Card({
  children,
  style,
  onPress,
  padded = true,
  strong,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
  strong?: boolean;
}) {
  const content = (
    <GlassPanel strong={strong} style={styles.cardInner}>
      <View style={padded ? { padding: spacing.lg } : undefined}>{children}</View>
    </GlassPanel>
  );

  if (!onPress) return <View style={[styles.card, style]}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && [shadow.hover, { transform: [{ translateY: LIFT }] }],
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

/* ----------------------------------------------------------------- Input */

/**
 * Text field.
 *
 * The keyboard is part of the field, not an afterthought: `keyboardType` picks
 * the right key layout, `returnKeyType` + `onSubmitEditing` chain one field to
 * the next, and `inputRef` is what lets the previous field hand focus over.
 * Multiline fields get a "return means newline" keyboard automatically.
 *
 * On focus the field asks its scroll container to lift it above the keyboard.
 * The container also does this when the keyboard opens, but that event only
 * fires once — without the focus call, tabbing from one field to the next
 * while the keyboard is already up would leave the cursor behind the keys.
 */
export function Field({
  label,
  placeholder,
  icon,
  value,
  multiline,
  keyboardType,
  secureTextEntry,
  hint,
  editable = true,
  maxLength,
  autoCapitalize,
  autoComplete,
  autoFocus,
  returnKeyType,
  onSubmitEditing,
  blurOnSubmit,
  inputRef,
  onChangeText,
  right,
}: {
  label?: string;
  placeholder?: string;
  icon?: IconName;
  value?: string;
  multiline?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  secureTextEntry?: boolean;
  hint?: string;
  editable?: boolean;
  maxLength?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoComplete?: TextInputProps['autoComplete'];
  autoFocus?: boolean;
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
  /** Pass false when handing focus to the next field, so the keyboard stays up. */
  blurOnSubmit?: boolean;
  /** Lets a previous field call `.focus()` on this one. */
  inputRef?: React.RefObject<TextInput>;
  onChangeText?: (t: string) => void;
  right?: React.ReactNode;
}) {
  const ensureVisible = useEnsureVisible();

  return (
    <View style={{ gap: spacing.sm }}>
      {label ? <Text style={[type.smallMed, { color: colors.textMuted }]}>{label}</Text> : null}
      <View
        style={[
          styles.input,
          multiline && { height: 108, alignItems: 'flex-start', paddingTop: spacing.md },
          !editable && { backgroundColor: colors.glassSoft },
        ]}
      >
        {icon ? <Ionicons name={icon} size={18} color={colors.textFaint} /> : null}
        <TextInput
          ref={inputRef}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          multiline={multiline}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          onFocus={() => {
            /* A frame late on purpose: on the first focus the keyboard has not
               finished coming up, and measuring against the old layout would
               scroll to the wrong place. */
            if (ensureVisible) requestAnimationFrame(ensureVisible);
          }}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          returnKeyType={returnKeyType ?? (multiline ? 'default' : 'done')}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={blurOnSubmit ?? !multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          style={[type.body, { flex: 1, color: colors.text, paddingVertical: 0 }]}
        />
        {right}
      </View>
      {hint ? <Text style={[type.small, { color: colors.textFaint }]}>{hint}</Text> : null}
    </View>
  );
}

/* ------------------------------------------------------------ StatusPill */

/**
 * Takes a concrete backend status — all fifteen of them — and reads its
 * colour, icon and short label out of `lib/status`. Nothing in the app maps a
 * status to a colour by hand.
 */
export function StatusPill({
  status,
  small,
}: {
  status: PermissionStatus | string;
  small?: boolean;
}) {
  const m = statusInfo(status);
  const live = m.tone === 'active' || m.tone === 'pending';
  return (
    <View style={[styles.pill, { backgroundColor: m.bg }, small && { paddingVertical: 3 }]}>
      {live ? <View style={[styles.dot, { backgroundColor: m.fg }]} /> : null}
      <Ionicons name={m.icon as IconName} size={small ? 12 : 14} color={m.fg} />
      <Text style={[small ? type.caption : type.smallMed, { color: m.fg }]}>{m.label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------ RoleAvatar */

/**
 * People are shown by role, not by name — so the avatar is an icon on glass
 * rather than a coloured initials disc.
 */
export function Avatar({
  size = 44,
  icon = 'person-outline',
  tint = colors.primary,
}: {
  size?: number;
  icon?: IconName;
  tint?: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.glassStrong,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Ionicons name={icon} size={size * 0.44} color={tint} />
    </View>
  );
}

/** Small square icon tile used inside rows and tiles. */
export function IconTile({
  icon,
  size = 36,
  tint = colors.primary,
  bg = colors.primarySoft,
}: {
  icon: IconName;
  size?: number;
  tint?: string;
  bg?: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.36,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon} size={size * 0.5} color={tint} />
    </View>
  );
}

/* -------------------------------------------------------------- Sections */

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[type.h3, { color: colors.text }]}>{title}</Text>
      {actionLabel ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={[type.smallMed, { color: colors.primary }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Row({
  icon,
  label,
  value,
  color,
}: {
  icon: IconName;
  label: string;
  value?: string;
  color?: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <Text style={[type.small, { color: colors.textMuted, flex: 1 }]}>{label}</Text>
      {value ? (
        <Text style={[type.smallMed, { color: color ?? colors.text }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
    </View>
  );
}

export function ListTile({
  icon,
  title,
  subtitle,
  onPress,
  right,
  tint,
  danger,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  tint?: string;
  danger?: boolean;
}) {
  const fg = danger ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { opacity: pressed ? 0.7 : 1 }]}
    >
      <IconTile
        icon={icon}
        bg={tint ?? (danger ? colors.dangerBg : colors.primarySoft)}
        tint={danger ? colors.danger : colors.primary}
      />
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyMed, { color: fg }]}>{title}</Text>
        {subtitle ? (
          <Text style={[type.small, { color: colors.textMuted, marginTop: 2 }]}>{subtitle}</Text>
        ) : null}
      </View>
      {right ?? <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />}
    </Pressable>
  );
}

export function EmptyState({
  icon,
  title,
  message,
}: {
  icon: IconName;
  title: string;
  message: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.primary} />
      </View>
      <Text style={[type.h3, { color: colors.text }]}>{title}</Text>
      <Text style={[type.small, { color: colors.textMuted, textAlign: 'center' }]}>{message}</Text>
    </View>
  );
}

/** Shown while a screen's first request is in flight. */
export function Loader({ label }: { label?: string }) {
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={colors.primary} />
      {label ? (
        <Text style={[type.small, { color: colors.textMuted, textAlign: 'center' }]}>{label}</Text>
      ) : null}
    </View>
  );
}

/** Shown when a request fails — always with a way back to trying again. */
export function ErrorState({
  title = "Couldn't load this",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.dangerBg }]}>
        <Ionicons name="cloud-offline-outline" size={30} color={colors.danger} />
      </View>
      <Text style={[type.h3, { color: colors.text }]}>{title}</Text>
      <Text style={[type.small, { color: colors.textMuted, textAlign: 'center' }]}>{message}</Text>
      {onRetry ? (
        <Button
          label="Try again"
          variant="secondary"
          icon="refresh-outline"
          full={false}
          onPress={onRetry}
        />
      ) : null}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={{ height: 1, backgroundColor: colors.border, marginLeft: inset }} />;
}

/**
 * Footer for a cursor-paginated list. Renders nothing when there is no next
 * page, so a screen can drop it in unconditionally.
 */
export function LoadMore({
  hasMore,
  loading,
  onPress,
  total,
}: {
  hasMore: boolean;
  loading: boolean;
  onPress: () => void;
  /** How many rows are already on screen — shown once the list is exhausted. */
  total?: number;
}) {
  if (!hasMore) {
    return total && total > 8 ? (
      <Text style={[type.small, { color: colors.textFaint, textAlign: 'center' }]}>
        That's everything.
      </Text>
    ) : null;
  }
  return (
    <Button
      label={loading ? 'Loading…' : 'Load more'}
      variant="secondary"
      icon="chevron-down"
      loading={loading}
      disabled={loading}
      onPress={onPress}
    />
  );
}

/** Pale tinted note strip — info / warning / danger, always translucent. */
export function Note({
  icon,
  text,
  tone = 'info',
}: {
  icon: IconName;
  text: string;
  tone?: 'info' | 'warning' | 'danger' | 'success' | 'brand';
}) {
  const map = {
    info: { fg: colors.info, bg: colors.infoBg },
    warning: { fg: colors.warning, bg: colors.warningBg },
    danger: { fg: colors.danger, bg: colors.dangerBg },
    success: { fg: colors.success, bg: colors.successBg },
    brand: { fg: colors.primary, bg: colors.primarySoft },
  }[tone];
  return (
    <View style={[styles.note, { backgroundColor: map.bg }]}>
      <Ionicons name={icon} size={16} color={map.fg} />
      <Text style={[type.small, { color: colors.textMuted, flex: 1 }]}>{text}</Text>
    </View>
  );
}

/* ------------------------------------------------------------ PoweredBy */

export function PoweredBy() {
  return (
    <View style={styles.powered}>
      <Logo size={13} />
      <Text style={[type.caption, { color: colors.textFaint, letterSpacing: 0.8 }]}>
        POWERED BY IVERTO.AI
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------ Stat block */

export function StatCard({
  label,
  value,
  icon,
  fg,
  bg,
  onPress,
}: {
  label: string;
  value: string;
  icon: IconName;
  fg: string;
  bg: string;
  /** When set the tile becomes a link and grows a chevron next to its label. */
  onPress?: () => void;
}) {
  const body = (
    <GlassPanel style={[styles.cardInner, { flex: 1 }]}>
      <View style={styles.stat}>
        <IconTile icon={icon} size={32} tint={fg} bg={bg} />
        <Text style={[type.h1, { color: colors.text, marginTop: spacing.sm }]}>{value}</Text>
        <View style={styles.statLabelRow}>
          <Text
            style={[type.small, { color: colors.textMuted, flexShrink: 1 }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {label}
          </Text>
          {onPress ? <Ionicons name="chevron-forward" size={13} color={fg} /> : null}
        </View>
      </View>
    </GlassPanel>
  );

  if (!onPress) return <View style={[styles.card, { flex: 1 }]}>{body}</View>;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { flex: 1 },
        pressed && [shadow.hover, { transform: [{ translateY: LIFT }] }],
      ]}
    >
      {body}
    </Pressable>
  );
}

/* ----------------------------------------------------------------- Chips */

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: colors.primarySoft, borderColor: colors.primary }
          : { backgroundColor: colors.glass, borderColor: colors.border },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={14} color={selected ? colors.primary : colors.textMuted} />
      ) : null}
      <Text style={[type.smallMed, { color: selected ? colors.primary : colors.textMuted }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------- Checkbox */

export function Checkbox({ checked }: { checked?: boolean }) {
  return (
    <View
      style={[
        styles.check,
        checked
          ? { backgroundColor: colors.primary, borderColor: colors.primary }
          : { backgroundColor: colors.glassStrong, borderColor: colors.borderStrong },
      ]}
    >
      {checked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    // iOS: transparent, so the BlurView in GlassPanel is what you see.
    // Android: opaque, because `elevation` on a see-through view makes the
    // platform paint the shadow caster as a solid rectangle over the content.
    backgroundColor: cardBackground,
    overflow: 'hidden',
    ...shadow.card,
  },
  cardInner: { borderRadius: radius.xl, overflow: 'hidden' },
  input: {
    height: 52,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.glassStrong,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 7 },
  detailIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.border,
  },
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'flex-start',
  },
  powered: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.lg,
  },
  stat: { paddingVertical: spacing.lg, paddingHorizontal: spacing.md, gap: 2 },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
