/**
 * Admin — groups list. Each group opens the branding editor, where the admin
 * picks which students are in the group and sets the app icon *and* app name
 * that only those students and their parents will see.
 *
 * Organisation admins only. A tenant is a university, and its groups and
 * branding are the organisation's to define; a warden works one site's pass
 * queue and cannot create a group or rebrand one. The tab is hidden for them
 * (app/admin/_layout.tsx) and this screen turns them away, because hiding a
 * tab does not unregister the route.
 *
 * The `branded` filter is a server-side query, not a client-side comparison
 * against the default name — `hasCustomBranding` is the server's own answer to
 * "has anyone actually configured this one".
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
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
import { Stagger } from '@/components/motion';
import { AppIcon } from '@/components/AppIcon';
import { colors, radius, spacing, type } from '@/theme';
import { admin as adminApi } from '@/lib/api/endpoints';
import { errorMessage, useMutation, useQuery } from '@/lib/api/useQuery';
import { useRefetchOnFocus } from '@/lib/useFocusRefetch';
import { useSignedUrl } from '@/lib/useSignedUrl';
import { timeAgo } from '@/lib/datetime';
import { useAuth } from '@/lib/auth';
import type { Group } from '@/types';

const FILTERS: { key: 'all' | 'branded' | 'default'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'branded', label: 'Custom branding' },
  { key: 'default', label: 'Default' },
];

/**
 * One row's mark. A component rather than a call inside the map because the
 * uploaded artwork has to be resolved per group and that is a hook — and
 * because this is the same `<AppIcon>` the members' own header draws, so the
 * list shows exactly what the branding does rather than an approximation.
 */
function GroupIcon({ group }: { group: Group }) {
  const uri = useSignedUrl(group.iconKey, group.iconUrl);
  return (
    <AppIcon
      size={54}
      shape={group.shape}
      palette={group.iconColors}
      label={group.iconLabel}
      uri={uri}
    />
  );
}

export default function Groups() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [filter, setFilter] = useState<'all' | 'branded' | 'default'>('all');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const branded = filter === 'all' ? undefined : filter === 'branded';
  /* Disabled rather than guarded by an early return: the redirect below has to
     come after every hook, and a warden who lands here should not spend a
     request on a list they are about to be sent away from. */
  const groups = useQuery((signal) => adminApi.groups(branded, signal), [branded], {
    enabled: isAdmin,
  });
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

  if (!isAdmin) return <Redirect href="/admin" />;

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
                <Stagger>
                  {list.map((g) => (
                    <Card key={g.id} onPress={() => router.push(`/icon-editor?group=${g.id}`)}>
                      <View style={styles.row}>
                        <GroupIcon group={g} />
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
                </Stagger>
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
});
