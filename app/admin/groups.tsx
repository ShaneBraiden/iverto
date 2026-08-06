/**
 * Admin — groups list. Each group opens the branding editor, where the admin
 * picks which students are in the group and sets the app icon *and* app name
 * that only those students will see.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { Button, Card, Chip, Note, PoweredBy, SectionHeader } from '@/components/ui';
import { colors, font, radius, spacing, type } from '@/theme';
import { groups } from '@/constants/sample';

const SHAPE_RADIUS: Record<string, number> = {
  squircle: 16,
  rounded: 12,
  circle: 27,
  square: 4,
};

const FILTERS = ['All', 'Custom branding', 'Default'] as const;

export default function Groups() {
  const [filter, setFilter] = useState<string>('All');
  const list =
    filter === 'All'
      ? groups
      : filter === 'Default'
        ? groups.filter((g) => g.appName === 'Iverto.ai')
        : groups.filter((g) => g.appName !== 'Iverto.ai');

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Groups" subtitle="Members & app branding" back={false} rightIcon="add" />
      <Screen>
        <Note
          icon="color-palette-outline"
          tone="brand"
          text="Each group gets its own app icon and app name. Members see the change on their home screen after the next launch — everyone else is untouched."
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm }}
        >
          {FILTERS.map((f) => (
            <Chip key={f} label={f} selected={f === filter} onPress={() => setFilter(f)} />
          ))}
        </ScrollView>

        <View>
          <SectionHeader title={`${list.length} groups`} actionLabel="New group" />
          <View style={{ gap: spacing.md }}>
            {list.map((g) => (
              <Card key={g.id} onPress={() => router.push(`/icon-editor?group=${g.id}`)}>
                <View style={styles.row}>
                  <LinearGradient
                    colors={g.iconColors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.appIcon, { borderRadius: SHAPE_RADIUS[g.shape] ?? 16 }]}
                  >
                    <Text style={styles.appIconText}>{g.iconLabel}</Text>
                  </LinearGradient>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.bodyMed, { color: colors.text }]}>{g.name}</Text>
                    <View style={styles.metaRow}>
                      <Ionicons name="phone-portrait-outline" size={12} color={colors.textMuted} />
                      <Text style={[type.small, { color: colors.textMuted }]}>{g.appName}</Text>
                    </View>
                    <Text style={[type.small, { color: colors.textFaint }]}>
                      {g.members} members · {g.updated}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                </View>
              </Card>
            ))}
          </View>
        </View>

        <Button label="Create group" variant="secondary" icon="add-circle-outline" />
        <PoweredBy />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  appIcon: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIconText: { color: '#fff', fontFamily: font.bold, fontSize: 18, letterSpacing: 0.5 },
});
