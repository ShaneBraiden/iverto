/** Admin overview — campus stats, quick tools, recent activity. */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AppHeader, Screen } from '@/components/Screen';
import { Card, IconTile, PoweredBy, SectionHeader, StatCard } from '@/components/ui';
import { colors, radius, shadow, spacing, type } from '@/theme';
import { activity, admin, adminStats } from '@/constants/sample';

const TOOLS: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  href?: string;
}[] = [
  { icon: 'color-palette-outline', label: 'Branding', href: '/admin/groups' },
  { icon: 'people-circle-outline', label: 'Groups', href: '/admin/groups' },
  { icon: 'documents-outline', label: 'Passes', href: '/admin/requests' },
  { icon: 'create-outline', label: 'Profile edits', href: '/admin/profile-requests' },
  { icon: 'qr-code-outline', label: 'Scan pass' },
  { icon: 'megaphone-outline', label: 'Announce' },
  { icon: 'bar-chart-outline', label: 'Reports' },
];

export default function AdminHome() {
  return (
    <View style={{ flex: 1 }}>
      <AppHeader
        greeting="Signed in as"
        title={admin.name}
        meta={`${admin.role} · ${admin.campus}`}
        icon="shield-checkmark-outline"
        badgeCount={5}
      />
      <Screen>
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            {adminStats.slice(0, 2).map((s) => (
              <StatCard key={s.label} {...s} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            {adminStats.slice(2).map((s) => (
              <StatCard key={s.label} {...s} />
            ))}
          </View>
        </View>

        <View>
          <SectionHeader title="Quick tools" />
          <View style={styles.grid}>
            {TOOLS.map((t) => (
              <Pressable
                key={t.label}
                onPress={() => t.href && router.push(t.href as never)}
                style={({ pressed }) => [styles.tool, pressed && { opacity: 0.7 }]}
              >
                <IconTile icon={t.icon} size={40} />
                <Text style={[type.small, { color: colors.text, textAlign: 'center' }]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View>
          <SectionHeader title="Recent activity" actionLabel="See all" />
          <Card padded={false}>
            {activity.map((a, i) => (
              <View key={a.id}>
                <View style={styles.activityRow}>
                  <IconTile icon={a.icon as never} size={32} />
                  <Text style={[type.small, { color: colors.text, flex: 1 }]}>{a.text}</Text>
                  <Text style={[type.small, { color: colors.textFaint }]}>{a.time}</Text>
                </View>
                {i < activity.length - 1 ? (
                  <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 60 }} />
                ) : null}
              </View>
            ))}
          </Card>
        </View>

        <PoweredBy />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tool: {
    width: '30.5%',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadow.card,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
});
