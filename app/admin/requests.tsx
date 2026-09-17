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
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  GlassPanel,
  LoadMore,
  PoweredBy,
} from '@/components/ui';
import { SkeletonList } from '@/components/Skeleton';
import { Stagger } from '@/components/motion';
import { OutpassCard, type OutpassVariant } from '@/components/OutpassCard';
import { useLivePermissions } from '@/components/AppContext';
import { blur, colors, radius, spacing, type } from '@/theme';
import { PAGE_SIZE } from '@/constants/config';
import { useAdmin } from '@/components/AdminContext';
import { admin as adminApi, permissions as permissionApi } from '@/lib/api/endpoints';
import { errorMessage, fromPage, usePagedQuery, useMutation, useQuery } from '@/lib/api/useQuery';
import { useRefetchOnFocus } from '@/lib/useFocusRefetch';
import { CHIPS, statusParam } from '@/lib/status';
import { ExportError, shareCsv } from '@/lib/export';
import type { StatusChip } from '@/types';

/** `?status=active` from the overview tiles. Anything else opens on `all`. */
function chipParam(value: string | string[] | undefined): StatusChip {
  const key = Array.isArray(value) ? value[0] : value;
  return CHIPS.some((c) => c.key === key) ? (key as StatusChip) : 'all';
}

export default function AdminRequests() {
  const { status: fromTile } = useLocalSearchParams<{ status?: string }>();
  const [chip, setChip] = useState<StatusChip>('all');
  const [query, setQuery] = useState('');
  const [needle, setNeedle] = useState('');
  /* Cards read better one pass at a time; a warden checking who is still out
     is reading twenty at once and wants them in rows. Neither is the right
     default for both jobs, so the choice is theirs. It is a tab screen and
     stays mounted, so the choice holds for the session. */
  const [view, setView] = useState<OutpassVariant>('card');

  /* This is a tab screen and stays mounted once visited, so a tile tap on the
     overview arrives at a screen that is already up with a chip of its own —
     initial state alone would silently ignore it. Applying the param and then
     clearing it keeps both honest: the tile wins on arrival, the chips are the
     user's from then on, and tapping the same tile twice works the second time
     because there is no stale param left to match against. */
  useEffect(() => {
    if (!fromTile) return;
    setChip(chipParam(fromTile));
    router.setParams({ status: '' });
  }, [fromTile]);

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
            <View style={styles.resultRow}>
              <Text
                style={[type.small, { color: colors.textMuted, flex: 1 }]}
                numberOfLines={1}
              >
                {rows.length}
                {list.hasMore ? '+' : ''} result{rows.length === 1 ? '' : 's'}
                {needle ? ` for “${needle}”` : ''}
              </Text>
              <ViewToggle value={view} onChange={setView} />
            </View>
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
            ) : view === 'list' ? (
              /* One card holding every row, not a card per row: the surface is
                 what makes a stack of rows read as a single list. */
              <Card padded={false}>
                <Stagger>
                  {rows.map((p, i) => (
                    <OutpassCard
                      key={p.id}
                      item={p}
                      role="admin"
                      showRequester
                      categories={categories.data}
                      variant="list"
                      divider={i > 0}
                    />
                  ))}
                </Stagger>
              </Card>
            ) : (
              <View style={{ gap: spacing.md }}>
                <Stagger>
                  {rows.map((p) => (
                    <OutpassCard
                      key={p.id}
                      item={p}
                      role="admin"
                      showRequester
                      categories={categories.data}
                    />
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
    </View>
  );
}

/**
 * Cards or rows, as a two-position segmented control.
 *
 * Icons only: the pair is the label. It sits on the results line rather than in
 * the filter bar above, because it changes how the results are drawn and not
 * which results there are — the chips and the search box decide that.
 */
function ViewToggle({
  value,
  onChange,
}: {
  value: OutpassVariant;
  onChange: (next: OutpassVariant) => void;
}) {
  const modes = [
    { key: 'list' as const, icon: 'list-outline' as const, label: 'Show as list' },
    { key: 'card' as const, icon: 'albums-outline' as const, label: 'Show as cards' },
  ];

  return (
    <View style={styles.toggle}>
      {modes.map((m) => {
        const on = value === m.key;
        return (
          <Pressable
            key={m.key}
            onPress={() => onChange(m.key)}
            accessibilityRole="button"
            accessibilityLabel={m.label}
            accessibilityState={{ selected: on }}
            hitSlop={6}
            style={[styles.toggleBtn, on && styles.toggleBtnOn]}
          >
            <Ionicons name={m.icon} size={16} color={on ? colors.primary : colors.textMuted} />
          </Pressable>
        );
      })}
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
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  toggle: {
    flexDirection: 'row',
    gap: 2,
    padding: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.neutralBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    /* Carried by both states so the selected half does not grow by two pixels
       and shove the other one sideways as you switch. */
    borderWidth: 1,
    borderColor: 'transparent',
  },
  toggleBtnOn: { backgroundColor: colors.surface, borderColor: colors.primarySoft },
});
