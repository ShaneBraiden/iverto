/** Guardian — record of past decisions, for the ward currently in view. */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Screen, TopBar } from '@/components/Screen';
import { useWard } from '@/components/WardContext';
import { WardSwitcher } from '@/components/WardSwitcher';
import { Chip, EmptyState, GlassPanel, PoweredBy } from '@/components/ui';
import { OutpassCard } from '@/components/OutpassCard';
import { blur, colors, spacing, type } from '@/theme';
import { outpassesFor } from '@/constants/sample';

const FILTERS = ['All', 'Approved', 'Rejected', 'Expired'] as const;

export default function ParentHistory() {
  const { ward, wards, selectWard, hasSiblings } = useWard();
  const [filter, setFilter] = useState<string>('All');
  const [switching, setSwitching] = useState(false);

  const decided = outpassesFor(ward.rollNo).filter((o) => o.status !== 'pending');
  const list = filter === 'All' ? decided : decided.filter((o) => o.status === filter.toLowerCase());

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Decision history"
        subtitle={`${ward.rollNo} · ${ward.label}`}
        back={false}
        rightIcon={hasSiblings ? 'swap-horizontal-outline' : 'filter-outline'}
        onRight={hasSiblings ? () => setSwitching(true) : undefined}
      />
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
          {list.length} record{list.length === 1 ? '' : 's'} for {ward.rollNo}
        </Text>
        {list.length === 0 ? (
          <EmptyState
            icon="albums-outline"
            title="No records"
            message={`No ${filter.toLowerCase()} requests to show for ${ward.rollNo}.`}
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {list.map((o) => (
              <OutpassCard key={o.id} item={o} role="parent" showRequester />
            ))}
          </View>
        )}
        <PoweredBy />
      </Screen>

      <WardSwitcher
        visible={switching}
        onClose={() => setSwitching(false)}
        wards={wards}
        activeRollNo={ward.rollNo}
        onSelect={selectWard}
      />
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
