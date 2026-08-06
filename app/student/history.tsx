/** Student — full request history with status filter. */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Screen, TopBar } from '@/components/Screen';
import { Chip, EmptyState, GlassPanel, PoweredBy } from '@/components/ui';
import { OutpassCard } from '@/components/OutpassCard';
import { blur, colors, spacing, type } from '@/theme';
import { outpasses } from '@/constants/sample';

const FILTERS = ['All', 'Pending', 'Approved', 'Rejected', 'Expired'] as const;

export default function History() {
  const [filter, setFilter] = useState<string>('All');
  const list =
    filter === 'All' ? outpasses : outpasses.filter((o) => o.status === filter.toLowerCase());

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="My requests" back={false} rightIcon="search-outline" />
      <GlassPanel intensity={blur.bar} style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
        >
          {FILTERS.map((f) => (
            <Chip key={f} label={f} selected={f === filter} onPress={() => setFilter(f)} />
          ))}
        </ScrollView>
      </GlassPanel>

      <Screen>
        <Text style={[type.small, { color: colors.textMuted }]}>
          {list.length} request{list.length === 1 ? '' : 's'}
        </Text>
        {list.length === 0 ? (
          <EmptyState
            icon="file-tray-outline"
            title="Nothing here yet"
            message={`You have no ${filter.toLowerCase()} requests.`}
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {list.map((o) => (
              <OutpassCard key={o.id} item={o} role="student" />
            ))}
          </View>
        )}
        <PoweredBy />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  filterBar: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
