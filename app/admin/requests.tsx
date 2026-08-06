/** Admin — all outpass requests across campus. */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, TopBar } from '@/components/Screen';
import { Chip, EmptyState, Field, GlassPanel, PoweredBy } from '@/components/ui';
import { OutpassCard } from '@/components/OutpassCard';
import { blur, colors, spacing, type } from '@/theme';
import { outpasses } from '@/constants/sample';

const FILTERS = ['All', 'Pending', 'Approved', 'Active', 'Rejected'] as const;

export default function AdminRequests() {
  const [filter, setFilter] = useState<string>('All');
  const [query, setQuery] = useState('');

  const needle = query.trim().toLowerCase();
  const list = outpasses
    .filter((o) => (filter === 'All' ? true : o.status === filter.toLowerCase()))
    .filter((o) =>
      needle
        ? o.rollNo.toLowerCase().includes(needle) ||
          o.id.toLowerCase().includes(needle) ||
          o.reason.toLowerCase().includes(needle)
        : true
    );

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="All passes" back={false} rightIcon="download-outline" />
      <GlassPanel intensity={blur.bar} style={styles.bar}>
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
          {/* Search filters live — and the clear button means a stray query
              never leaves the admin staring at an empty list. */}
          <Field
            placeholder="Search by roll no. or pass ID"
            icon="search-outline"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="characters"
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
          contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
        >
          {FILTERS.map((f) => (
            <Chip key={f} label={f} selected={f === filter} onPress={() => setFilter(f)} />
          ))}
        </ScrollView>
      </GlassPanel>

      <Screen>
        <Text style={[type.small, { color: colors.textMuted }]}>
          {list.length} result{list.length === 1 ? '' : 's'}
          {needle ? ` for “${query.trim()}”` : ''}
        </Text>
        {list.length === 0 ? (
          <EmptyState
            icon="documents-outline"
            title="No requests"
            message={
              needle
                ? `Nothing matches “${query.trim()}” in the ${filter.toLowerCase()} filter.`
                : `Nothing matches the ${filter.toLowerCase()} filter.`
            }
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {list.map((o) => (
              <OutpassCard key={o.id} item={o} role="admin" showRequester />
            ))}
          </View>
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
