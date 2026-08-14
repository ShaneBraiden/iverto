/**
 * Guardian — record of past decisions, for the ward currently in view.
 *
 * `decided=true` is what makes this a *record* rather than a second copy of
 * the approvals tab: it asks the server for requests that already carry a
 * decision, so nothing still waiting can appear here.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Screen, TopBar } from '@/components/Screen';
import { useWard } from '@/components/WardContext';
import { WardSwitcher } from '@/components/WardSwitcher';
import {
  Chip,
  EmptyState,
  ErrorState,
  GlassPanel,
  LoadMore,
  PoweredBy,
} from '@/components/ui';
import { SkeletonList } from '@/components/Skeleton';
import { Stagger } from '@/components/motion';
import { OutpassCard } from '@/components/OutpassCard';
import { blur, colors, spacing, type } from '@/theme';
import { PAGE_SIZE } from '@/constants/config';
import { parent as parentApi } from '@/lib/api/endpoints';
import { fromParentPage, usePagedQuery } from '@/lib/api/useQuery';
import { useRefetchOnFocus } from '@/lib/useFocusRefetch';
import { statusParam } from '@/lib/status';
import type { StatusChip } from '@/types';

/** A guardian's record only ever holds outcomes, so `active` is not offered. */
const FILTERS: { key: StatusChip; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'expired', label: 'Expired' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function ParentHistory() {
  const { ward, wards, selectWard, hasSiblings, pendingFor } = useWard();
  const [chip, setChip] = useState<StatusChip>('all');
  const [switching, setSwitching] = useState(false);

  const childId = ward?.id;
  const status = statusParam(chip);

  const list = usePagedQuery(
    (cursor, signal) =>
      parentApi
        .permissions({ cursor, limit: PAGE_SIZE, childId, decided: true, status }, signal)
        .then(fromParentPage),
    [childId, status],
    { enabled: !!childId }
  );
  useRefetchOnFocus(list.refetch);

  const rows = list.data ?? [];

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Decision history"
        subtitle={ward ? `${ward.name} · ${ward.rollNumber}` : ''}
        back={false}
        rightIcon={hasSiblings ? 'swap-horizontal-outline' : undefined}
        onRight={hasSiblings ? () => setSwitching(true) : undefined}
      />
      <GlassPanel intensity={blur.bar} style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
        >
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              selected={f.key === chip}
              onPress={() => setChip(f.key)}
            />
          ))}
        </ScrollView>
      </GlassPanel>
      <Screen>
        {list.loading || !ward ? (
          <SkeletonList count={5} />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : (
          <>
            <Text style={[type.small, { color: colors.textMuted }]}>
              {rows.length}
              {list.hasMore ? '+' : ''} record{rows.length === 1 ? '' : 's'} for {ward.name}
            </Text>
            {rows.length === 0 ? (
              <EmptyState
                icon="albums-outline"
                title="No records"
                message={
                  chip === 'all'
                    ? `Nothing has been decided for ${ward.name} yet.`
                    : `No ${chip} requests to show for ${ward.name}.`
                }
              />
            ) : (
              <View style={{ gap: spacing.md }}>
                <Stagger>
                  {rows.map((p) => (
                    <OutpassCard key={p.id} item={p} role="parent" showRequester />
                  ))}
                </Stagger>
              </View>
            )}
            <LoadMore
              hasMore={list.hasMore}
              loading={list.loadingMore}
              onPress={list.loadMore}
              total={rows.length}
            />
          </>
        )}
        <PoweredBy />
      </Screen>

      <WardSwitcher
        visible={switching}
        onClose={() => setSwitching(false)}
        wards={wards}
        activeId={ward?.id ?? ''}
        onSelect={selectWard}
        pendingFor={pendingFor}
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
