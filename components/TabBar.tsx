import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { blur, colors, font, glassFill, spacing } from '@/theme';

/** Bar height above the system gesture / navigation inset. */
export const TAB_BAR_HEIGHT = 64;

/** Frosted backdrop so the tab bar reads as glass, not as a solid strip. */
function TabBackground() {
  if (Platform.OS === 'android') {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: glassFill.strong }]} />;
  }
  return (
    <BlurView intensity={blur.bar} tint="light" style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]} />
    </BlurView>
  );
}

/**
 * Shared bottom-tab styling for all three role shells.
 *
 * Setting an explicit `height` on `tabBarStyle` overrides the height
 * react-navigation would otherwise derive from the safe-area inset, so the
 * inset has to be added back by hand — otherwise labels sit under the gesture
 * bar on Android and under the home indicator on iOS.
 */
export function useTabScreenOptions(): BottomTabNavigationOptions {
  const insets = useSafeAreaInsets();
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textFaint,
    tabBarBackground: () => <TabBackground />,
    tabBarStyle: {
      position: 'absolute',
      backgroundColor: 'transparent',
      borderTopColor: colors.border,
      borderTopWidth: 1,
      elevation: 0,
      height: TAB_BAR_HEIGHT + insets.bottom,
      paddingBottom: insets.bottom + spacing.sm,
      paddingTop: spacing.sm,
    },
    tabBarLabelStyle: { fontSize: 11, fontFamily: font.semibold },
    tabBarBadgeStyle: {
      backgroundColor: colors.primary,
      fontSize: 10,
      fontFamily: font.bold,
    },
  };
}

export function tabIcon(name: React.ComponentProps<typeof Ionicons>['name']) {
  const Icon = ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} size={size ?? 22} color={color} />
  );
  Icon.displayName = `TabIcon(${String(name)})`;
  return Icon;
}
