/**
 * Screen scaffolding: scroll container, dashboard header, top bar.
 * All chrome is glass — no coloured header blocks anywhere in the app.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Avatar, GlassPanel } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { TAB_BAR_HEIGHT } from '@/components/TabBar';
import { blur, colors, font, radius, shadow, spacing, type } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Plain scrolling screen on the app background.
 *
 * The tab bar is absolutely positioned, so it floats over the scroll view and
 * the content has to reserve room for it. `SafeAreaView` already contributes
 * the bottom inset, so only the bar's own height plus a little breathing room
 * is added here — otherwise the last card ends up half-hidden behind the bar.
 */
export function Screen({
  children,
  scroll = true,
  padded = true,
  clearTabBar = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  /** Set false on screens without a bottom tab bar (modals, detail pages). */
  clearTabBar?: boolean;
}) {
  const body = padded ? (
    <View style={{ padding: spacing.lg, gap: spacing.lg }}>{children}</View>
  ) : (
    <>{children}</>
  );
  const bottomPad = (clearTabBar ? TAB_BAR_HEIGHT : 0) + spacing.xl;
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {scroll ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: bottomPad }}
        >
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingBottom: bottomPad }}>{body}</View>
      )}
    </SafeAreaView>
  );
}

/**
 * Dashboard header. Frosted glass, dark text, role icon on the left.
 * `title` is a role label ("Student", "Father", "Administrator") — never a name.
 */
export function AppHeader({
  greeting,
  title,
  meta,
  icon = 'person-outline',
  onBell,
  badgeCount,
  onTitlePress,
  switchHint,
}: {
  greeting: string;
  title: string;
  meta?: string;
  icon?: IconName;
  onBell?: () => void;
  badgeCount?: number;
  /**
   * Makes the identity block tappable. Used by the guardian dashboard, where
   * the title is the ward in view and tapping it swaps to a sibling.
   */
  onTitlePress?: () => void;
  /** Small pill shown beside the title when it is a switcher, e.g. "1 of 3". */
  switchHint?: string;
}) {
  const insets = useSafeAreaInsets();
  const switchable = Boolean(onTitlePress);

  const identity = (
    <View style={{ flex: 1 }}>
      <Text style={[type.small, { color: colors.textMuted }]}>{greeting}</Text>
      <View style={styles.titleRow}>
        <Text style={[type.h2, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>
          {title}
        </Text>
        {switchable ? (
          <>
            <View style={styles.caret}>
              <Ionicons name="chevron-down" size={13} color={colors.primary} />
            </View>
            {switchHint ? (
              <Text style={[type.caption, { color: colors.primary }]}>{switchHint}</Text>
            ) : null}
          </>
        ) : null}
      </View>
      {meta ? (
        <Text style={[type.small, { color: colors.textFaint }]} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
    </View>
  );

  return (
    <GlassPanel intensity={blur.header} strong style={styles.header}>
      <StatusBar barStyle="dark-content" />
      <View style={[styles.headerPad, { paddingTop: insets.top + spacing.md }]}>
        {/* Brand strip — the mark sits above the role row so every dashboard
            is unmistakably Iverto without crowding the greeting. */}
        <View style={styles.brandStrip}>
          <Logo size={18} />
          <Text style={styles.brandText}>
            Iverto<Text style={{ color: colors.primary }}>.ai</Text>
          </Text>
        </View>
        <View style={styles.headerRow}>
          {switchable ? (
            /* The avatar travels with the name — the whole block is one target,
               so there is no ambiguity about what the tap will change. */
            <Pressable
              onPress={onTitlePress}
              style={({ pressed }) => [styles.switcher, pressed && { opacity: 0.7 }]}
              hitSlop={6}
            >
              <Avatar size={46} icon={icon} />
              {identity}
            </Pressable>
          ) : (
            <>
              <Avatar size={46} icon={icon} />
              {identity}
            </>
          )}
          <Pressable onPress={onBell} style={styles.bell} hitSlop={8}>
            <Ionicons name="notifications-outline" size={20} color={colors.text} />
            {badgeCount ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badgeCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>
    </GlassPanel>
  );
}

/** Simple titled top bar with an optional back button and right action. */
export function TopBar({
  title,
  subtitle,
  back = true,
  rightIcon,
  onRight,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  rightIcon?: IconName;
  onRight?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <GlassPanel intensity={blur.bar} strong style={styles.topBarWrap}>
      <StatusBar barStyle="dark-content" />
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        {back ? (
          <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
        ) : (
          <View style={{ width: 38 }} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={[type.h3, { color: colors.text, textAlign: 'center' }]}>{title}</Text>
          {subtitle ? (
            <Text style={[type.small, { color: colors.textMuted, textAlign: 'center' }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {rightIcon ? (
          <Pressable onPress={onRight} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name={rightIcon} size={20} color={colors.text} />
          </Pressable>
        ) : (
          /* No action on this bar — the slot that balances the back button
             carries the brand mark instead of sitting empty. */
          <View style={styles.barMark}>
            <Logo size={20} />
          </View>
        )}
      </View>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: {
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
    overflow: 'hidden',
    ...shadow.card,
  },
  headerPad: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  brandStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.md,
  },
  brandText: {
    fontFamily: font.semibold,
    fontSize: 13,
    letterSpacing: 0.2,
    color: colors.text,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switcher: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginLeft: -spacing.sm,
    marginRight: -spacing.xs,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  caret: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(185,0,14,0.12)',
  },
  barMark: { width: 38, alignItems: 'center', justifyContent: 'center' },
  bell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontFamily: font.bold },
  topBarWrap: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
