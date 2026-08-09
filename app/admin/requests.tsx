/**
 * Admin — every outpass request across campus.
 *
 * The search box and the chip are query parameters, not a client-side pass
 * over a downloaded list: campus-wide history is not something to pull into
 * memory to filter. Search covers roll number, pass id, student name, reason
 * and destination, so one box serves every way an admin might look for a pass.
 *
 * The download button pulls the same query as CSV (capped at 5000 rows) and
 * hands it to the OS share sheet.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, TopBar } from '@/components/Screen';
import {
  Chip,
  EmptyState,
  ErrorState,
  Field,
  GlassPanel,
  LoadMore,
  PoweredBy,
} from '@/components/ui';
import { SkeletonList } from '@/components/Skeleton';
import { OutpassCard } from '@/components/OutpassCard';
import { useLivePermissions } from '@/components/AppContext';
import { blur, colors, spacing, type } from '@/theme';
import { PAGE_SIZE } from '@/constants/config';
import { useAdmin } from '@/components/AdminContext';
import { admin as adminApi, permissions as permissionApi } from '@/lib/api/endpoints';
import { errorMessage, fromPage, usePagedQuery, useMutation, useQuery } from '@/lib/api/useQuery';
import { useRefetchOnFocus } from '@/lib/useFocusRefetch';
import { CHIPS, statusParam } from '@/lib/status';
import { ExportError, shareCsv } from '@/lib/export';
import type { StatusChip } from '@/types';

export default function AdminRequests() {
  const [chip, setChip] = useState<StatusChip>('all');
  const [query, setQuery] = useState('');
  const [needle, setNeedle] = useState('');

  /* Typing shouldn't fire a request per keystroke. */
  useEffect(() => {
    const timer = setTimeout(() => setNeedle(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { siteId, refresh: refreshCounts } = useAdmin();
  const status = statusParam(chip);
  const filters = { status, q: needle || undefined, siteId };

  const list = usePagedQuery(
    (cursor, signal) =>
      adminApi.permissions({ ...filters, cursor, limit: PAGE_SIZE }, signal).then(fromPage),
    [status, needle, siteId]
  );

  const categories = useQuery((signal) => permissionApi.categories(signal), []);

  /* A decision taken on the detail screen changes both this list and the
     counters the tab badge reads. */
  useRefetchOnFocus(list.refetch);
  useRefetchOnFocus(refreshCounts);
  useLivePermissions(list.refetch);

  const exportPasses = useMutation(
    async () => {
      const csv = await adminApi.exportPermissions(filters);
      return shareCsv(csv, 'passes');
    },
    {
      onError: (err) =>
        Alert.alert(
          "Couldn't export",
          err instanceof ExportError ? err.message : errorMessage(err)
        ),
    }
  );

  const rows = list.data ?? [];

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="All passes"
        back={false}
        rightIcon={exportPasses.pending ? 'hourglass-outline' : 'download-outline'}
        onRight={() => !exportPasses.pending && exportPasses.mutate()}
      />
      <GlassPanel intensity={blur.bar} style={styles.bar}>
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
          {/* Search filters live — and the clear button means a stray query
              never leaves the admin staring at an empty list. */}
          <Field
            placeholder="Roll no., name, pass ID, reason or destination"
            icon="search-outline"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            returnKeyType="search"
            right={
              query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.textFaint} />
                </Pressable>
              ) : null
            }
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          /* The search field right above is usually focused when these are
             tapped — without this the first tap only closes the keyboard. */
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
        >
          {CHIPS.map((c) => (
            <Chip
              key={c.key}
              label={c.label}
              selected={c.key === chip}
              onPress={() => setChip(c.key)}
            />
          ))}
        </ScrollView>
      </GlassPanel>

      <Screen>
        {list.loading ? (
          <SkeletonList count={5} />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : (
          <>
            <Text style={[type.small, { color: colors.textMuted }]}>
              {rows.length}
              {list.hasMore ? '+' : ''} result{rows.length === 1 ? '' : 's'}
              {needle ? ` for “${needle}”` : ''}
            </Text>
            {rows.length === 0 ? (
              <EmptyState
                icon="documents-outline"
                title="No requests"
                message={
                  needle
                    ? `Nothing matches “${needle}” in the ${chip} filter.`
                    : `Nothing matches the ${chip} filter.`
                }
              />
            ) : (
              <View style={{ gap: spacing.md }}>
                {rows.map((p) => (
                  <OutpassCard
                    key={p.id}
                    item={p}
                    role="admin"
                    showRequester
                    categories={categories.data}
                  />
                ))}
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
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
