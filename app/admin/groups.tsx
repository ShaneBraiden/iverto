/**
 * Admin — groups list. Each group opens the branding editor, where the admin
 * picks which students are in the group and sets the app icon *and* app name
 * that only those students will see.
 *
 * The `branded` filter is a server-side query, not a client-side comparison
 * against the default name — `hasCustomBranding` is the server's own answer to
 * "has anyone actually configured this one".
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  Note,
  PoweredBy,
  SectionHeader,
} from '@/components/ui';
import { SkeletonList } from '@/components/Skeleton';
import { colors, font, radius, spacing, type } from '@/theme';
import { SHAPE_RADIUS } from '@/constants/config';
import { admin as adminApi } from '@/lib/api/endpoints';
import { errorMessage, useMutation, useQuery } from '@/lib/api/useQuery';
import { useRefetchOnFocus } from '@/lib/useFocusRefetch';
import { timeAgo } from '@/lib/datetime';

const FILTERS: { key: 'all' | 'branded' | 'default'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'branded', label: 'Custom branding' },
  { key: 'default', label: 'Default' },
];

/** A group with one colour still needs two ends for the gradient. */
function gradient(colours: string[]): [string, string] {
  if (colours.length >= 2) return [colours[0], colours[1]];
  if (colours.length === 1) return [colours[0], colours[0]];
  return [colors.primary, colors.accent];
}

export default function Groups() {
  const [filter, setFilter] = useState<'all' | 'branded' | 'default'>('all');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const branded = filter === 'all' ? undefined : filter === 'branded';
  const groups = useQuery((signal) => adminApi.groups(branded, signal), [branded]);
  useRefetchOnFocus(groups.refetch);

  const create = useMutation((groupName: string) => adminApi.createGroup({ name: groupName }), {
    onSuccess: (group) => {
      setCreating(false);
      setName('');
      groups.refetch();
      /* Straight into the editor — a group with no branding is the whole
         reason the admin created it. */
      if (group?.id) router.push(`/icon-editor?group=${group.id}`);
    },
  });

  const list = groups.data ?? [];

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Groups"
        subtitle="Members & app branding"
        back={false}
        rightIcon="add"
        onRight={() => setCreating(true)}
      />
      <Screen>
        <Note
          icon="color-palette-outline"
          tone="brand"
          text="Each group gets its own app icon and app name. Members see the change on their next launch — everyone else is untouched."
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: spacing.sm }}
        >
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              selected={f.key === filter}
              onPress={() => setFilter(f.key)}
            />
          ))}
        </ScrollView>

        {groups.loading ? (
          <SkeletonList count={4} />
        ) : groups.error ? (
          <ErrorState error={groups.error} onRetry={groups.refetch} />
        ) : (
          <View>
            <SectionHeader
              title={`${list.length} group${list.length === 1 ? '' : 's'}`}
              actionLabel="New group"
              onAction={() => setCreating(true)}
            />
            {list.length === 0 ? (
              <EmptyState
                icon="people-circle-outline"
                title="No groups yet"
                message="Create a group to give a set of students their own app icon and name."
              />
            ) : (
              <View style={{ gap: spacing.md }}>
                {list.map((g) => (
                  <Card key={g.id} onPress={() => router.push(`/icon-editor?group=${g.id}`)}>
                    <View style={styles.row}>
                      <LinearGradient
                        colors={gradient(g.iconColors)}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.appIcon, { borderRadius: SHAPE_RADIUS[g.shape] ?? 16 }]}
                      >
                        <Text style={styles.appIconText}>{g.iconLabel || 'IV'}</Text>
                      </LinearGradient>
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text style={[type.bodyMed, { color: colors.text }]} numberOfLines={2}>
                          {g.name}
                        </Text>
                        <View style={styles.metaRow}>
                          <Ionicons
                            name="phone-portrait-outline"
                            size={12}
                            color={colors.textMuted}
                            style={{ flexShrink: 0 }}
                          />
                          {/* The app name is admin-authored and capped at 14
                              characters server-side, but the BRANDED tag beside
                              it must survive one that is not. */}
                          <Text
                            style={[type.small, { color: colors.textMuted, flexShrink: 1 }]}
                            numberOfLines={1}
                          >
                            {g.appName}
                          </Text>
                          {g.hasCustomBranding ? (
                            <View style={styles.brandTag}>
                              <Text style={[type.caption, { color: colors.primary }]}>BRANDED</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={[type.small, { color: colors.textFaint }]} numberOfLines={1}>
                          {g.memberCount} member{g.memberCount === 1 ? '' : 's'} ·{' '}
                          {timeAgo(g.updatedAt)}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={colors.textFaint}
                        style={{ flexShrink: 0 }}
                      />
                    </View>
                  </Card>
                ))}
              </View>
            )}
          </View>
        )}

        <Button
          label="Create group"
          variant="secondary"
          icon="add-circle-outline"
          onPress={() => setCreating(true)}
        />
        <PoweredBy />
      </Screen>

      <Sheet
        visible={creating}
        onClose={() => setCreating(false)}
        title="New group"
        subtitle="Name it after the class, block or batch it covers."
      >
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
          <Field
            label="Group name"
            placeholder="e.g. Block A"
            icon="people-circle-outline"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            returnKeyType="done"
          />
          {create.error ? (
            <Note icon="alert-circle-outline" tone="danger" text={errorMessage(create.error)} />
          ) : null}
          <Button
            label="Create group"
            icon="add"
            loading={create.pending}
            disabled={name.trim().length === 0 || create.pending}
            onPress={() => create.mutate(name.trim())}
          />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  brandTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    flexShrink: 0,
  },
  appIcon: {
    width: 54,
    height: 54,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIconText: { color: '#fff', fontFamily: font.bold, fontSize: 18, letterSpacing: 0.5 },
});
