/**
 * Screen scaffolding: scroll container, dashboard header, top bar.
 * All chrome is glass — no coloured header blocks anywhere in the app.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Avatar, GlassPanel } from '@/components/ui';
import { KeyboardAwareScroll } from '@/components/KeyboardAware';
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
 *
 * The scroll container is the keyboard-aware one rather than a plain
 * `ScrollView`, because a screen cannot know in advance whether it holds a
 * field: the profile, the change-password screen and every sheet trigger sit
 * on one. Making it the default means "the screen moves so you can see what
 * you are typing" is a property of the app, not something each screen opts in
 * to and one of them forgets.
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
        <KeyboardAwareScroll extraBottomSpace={bottomPad}>{body}</KeyboardAwareScroll>
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
  metaAction,
  onMetaPress,
  icon = 'person-outline',
  onBell,
  badgeCount,
}: {
  greeting: string;
  title: string;
  meta?: string;
  /**
   * A short value tacked onto the end of the meta line — a roll number, say.
   * With `onMetaPress` it becomes the only interactive thing in the header.
   */
  metaAction?: string;
  /**
   * Turns `metaAction` into a tap target with a small caret beside it.
   * Leave undefined and it renders as plain text, so the caret only ever
   * appears when there is genuinely something to choose between.
   */
  onMetaPress?: () => void;
  icon?: IconName;
  onBell?: () => void;
  badgeCount?: number;
}) {
  const insets = useSafeAreaInsets();

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
          <Avatar size={46} icon={icon} />
          <View style={{ flex: 1 }}>
            <Text style={[type.small, { color: colors.textMuted }]}>{greeting}</Text>
            <Text style={[type.h2, { color: colors.text }]} numberOfLines={1}>
              {title}
            </Text>
            {meta || metaAction ? (
              <View style={styles.metaRow}>
                {meta ? (
                  <Text style={[type.small, { color: colors.textFaint }]} numberOfLines={1}>
                    {meta}
                  </Text>
                ) : null}

                {metaAction ? (
                  onMetaPress ? (
                    /* The number is the switch. Underlined and carried in the
                       brand colour so it reads as a control, with a caret to
                       say a list drops out of it. */
                    <Pressable
                      onPress={onMetaPress}
                      hitSlop={10}
                      style={({ pressed }) => [styles.metaChip, pressed && { opacity: 0.6 }]}
                    >
                      <Text style={[type.smallMed, { color: colors.primary }]}>{metaAction}</Text>
                      <Ionicons name="chevron-down" size={12} color={colors.primary} />
                    </Pressable>
                  ) : (
                    <Text style={[type.small, { color: colors.textFaint }]} numberOfLines={1}>
                      {metaAction}
                    </Text>
                  )
                ) : null}
              </View>
            ) : null}
          </View>
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
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
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
