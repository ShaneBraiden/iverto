/**
 * Student — full request history.
 *
 * The status chip and the search box are both server-side query parameters, so
 * a long history is never pulled down in full to be filtered. The chip is sent
 * as-is (`pending`, `approved`, …) and the server expands it across the
 * concrete statuses behind it.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, TopBar } from '@/components/Screen';
import {
  Chip,
  EmptyState,
  ErrorState,
  Field,
  GlassPanel,
  LoadMore,
  Loader,
  PoweredBy,
} from '@/components/ui';
import { OutpassCard } from '@/components/OutpassCard';
import { blur, colors, spacing, type } from '@/theme';
import { PAGE_SIZE } from '@/constants/config';
import { permissions as permissionApi } from '@/lib/api/endpoints';
import { errorMessage, fromPage, usePagedQuery, useQuery } from '@/lib/api/useQuery';
import { useRefetchOnFocus } from '@/lib/useFocusRefetch';
import { CHIPS, statusParam } from '@/lib/status';
import type { StatusChip } from '@/types';

export default function History() {
  const [chip, setChip] = useState<StatusChip>('all');
  const [query, setQuery] = useState('');
  const [needle, setNeedle] = useState('');
  const [searching, setSearching] = useState(false);

  /* Typing shouldn't fire a request per keystroke. */
  useEffect(() => {
    const timer = setTimeout(() => setNeedle(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const status = statusParam(chip);

  const list = usePagedQuery(
    (cursor, signal) =>
      permissionApi
        .list({ cursor, limit: PAGE_SIZE, status, q: needle || undefined }, signal)
        .then(fromPage),
    [status, needle]
  );
  useRefetchOnFocus(list.refetch);

  /* Category labels are tenant-defined, so the tag on each card reads from
     the same list the request form offers. */
  const categories = useQuery((signal) => permissionApi.categories(signal), []);

  const rows = list.data ?? [];

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="My requests"
        back={false}
        rightIcon={searching ? 'close-outline' : 'search-outline'}
        onRight={() => {
          setSearching((s) => !s);
          setQuery('');
        }}
      />
      <GlassPanel intensity={blur.bar} style={styles.filterBar}>
        {searching ? (
          <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
            <Field
              placeholder="Search by reason, destination or type"
              icon="search-outline"
              value={query}
              onChangeText={setQuery}
              autoFocus
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
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
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
          <Loader />
        ) : list.error ? (
          <ErrorState message={errorMessage(list.error)} onRetry={list.refetch} />
        ) : (
          <>
            <Text style={[type.small, { color: colors.textMuted }]}>
              {rows.length}
              {list.hasMore ? '+' : ''} request{rows.length === 1 ? '' : 's'}
              {needle ? ` for “${needle}”` : ''}
            </Text>
            {rows.length === 0 ? (
              <EmptyState
                icon="file-tray-outline"
                title="Nothing here yet"
                message={
                  needle
                    ? `Nothing matches “${needle}”.`
                    : chip === 'all'
                      ? 'You have no requests on record.'
                      : `You have no ${chip} requests.`
                }
              />
            ) : (
              <View style={{ gap: spacing.md }}>
                {rows.map((o) => (
                  <OutpassCard
                    key={o.id}
                    item={o}
                    role="student"
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
  filterBar: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
