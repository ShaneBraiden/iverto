/** Admin / warden — profile & settings, with roles and site scope. */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { ProfileBody } from '@/components/ProfileBody';
import { Sheet } from '@/components/Sheet';
import { useAdmin } from '@/components/AdminContext';
import { Avatar, Chip, Divider, ErrorState, ListTile, Loader } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import { admin as adminApi } from '@/lib/api/endpoints';
import { errorMessage, useQuery } from '@/lib/api/useQuery';
import { displayName, useAuth } from '@/lib/auth';

export default function AdminProfile() {
  const { me, user } = useAuth();
  const { sites, siteId, setSiteId } = useAdmin();
  const [rolesOpen, setRolesOpen] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);

  const isAdmin = user?.role === 'admin';
  const activeSite = sites.find((s) => s.id === siteId);

  return (
    <View style={{ flex: 1 }}>
      <ProfileBody
        name={displayName(user, me)}
        subtitle={me?.profile?.email ?? user?.email ?? ''}
        tag={isAdmin ? 'Admin' : 'Warden'}
        icon="shield-checkmark-outline"
        details={[
          { icon: 'briefcase-outline', label: 'Role', value: isAdmin ? 'Administrator' : 'Warden' },
          {
            icon: 'business-outline',
            label: sites.length > 1 ? 'Assigned sites' : 'Site',
            value: sites.map((s) => s.name).join(', ') || 'Whole tenant',
          },
          { icon: 'mail-outline', label: 'Email', value: me?.profile?.email ?? user?.email ?? '—' },
          { icon: 'call-outline', label: 'Phone', value: me?.profile?.phone ?? user?.phone ?? '—' },
        ]}
        extraTiles={
          <>
            {/* Only worth offering when there is more than one to choose. */}
            {sites.length > 1 ? (
              <>
                <Divider inset={spacing.lg + 48} />
                <ListTile
                  icon="funnel-outline"
                  title="Site filter"
                  subtitle={activeSite?.name ?? 'All my sites'}
                  onPress={() => setSiteOpen(true)}
                />
              </>
            ) : null}
            <Divider inset={spacing.lg + 48} />
            <ListTile
              icon="color-palette-outline"
              title="App branding"
              subtitle="Per-group icon & app name"
              onPress={() => router.push('/admin/groups')}
            />
            <Divider inset={spacing.lg + 48} />
            <ListTile
              icon="key-outline"
              title="Roles & permissions"
              subtitle="Who can do what on this campus"
              onPress={() => setRolesOpen(true)}
            />
          </>
        }
      />

      <RolesSheet visible={rolesOpen} onClose={() => setRolesOpen(false)} canEdit={isAdmin} />

      <Sheet
        visible={siteOpen}
        onClose={() => setSiteOpen(false)}
        title="Site filter"
        subtitle="Narrows every count and list in the admin shell."
      >
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm, flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip
            label="All my sites"
            selected={!siteId}
            onPress={() => {
              setSiteId(undefined);
              setSiteOpen(false);
            }}
          />
          {sites.map((s) => (
            <Chip
              key={s.id}
              label={s.name}
              selected={s.id === siteId}
              onPress={() => {
                setSiteId(s.id);
                setSiteOpen(false);
              }}
            />
          ))}
        </View>
      </Sheet>
    </View>
  );
}

/**
 * `GET /admin/roles` — what each role may do, and who currently holds it.
 * Changing somebody's role is admin-only, so a warden sees this read-only.
 */
function RolesSheet({
  visible,
  onClose,
  canEdit,
}: {
  visible: boolean;
  onClose: () => void;
  canEdit: boolean;
}) {
  const roles = useQuery((signal) => adminApi.roles(signal), [visible], { enabled: visible });

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Roles & permissions"
      subtitle={
        canEdit
          ? 'Roles are defined by the campus; membership is managed here.'
          : 'Read-only — only an administrator can change a role.'
      }
    >
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.lg }}>
        {roles.loading ? <Loader /> : null}
        {roles.error ? (
          <ErrorState message={errorMessage(roles.error)} onRetry={roles.refetch} />
        ) : null}

        {roles.data?.roles.map((r) => (
          <View key={String(r.role)} style={styles.roleBox}>
            <View style={styles.roleTop}>
              <Text style={[type.bodyMed, { color: colors.text, flex: 1 }]}>{r.label}</Text>
              <View style={styles.countTag}>
                <Text style={[type.caption, { color: colors.primary }]}>
                  {r.members} MEMBER{r.members === 1 ? '' : 'S'}
                </Text>
              </View>
            </View>
            <Text style={[type.small, { color: colors.textMuted, marginTop: 4 }]}>
              {r.capabilities.join(' · ')}
            </Text>
          </View>
        ))}

        {roles.data?.staff.length ? (
          <>
            <Text style={[type.caption, { color: colors.textFaint, marginTop: spacing.sm }]}>
              STAFF ON THIS CAMPUS
            </Text>
            {roles.data.staff.map((s) => (
              <View key={s.userId} style={styles.staffRow}>
                <Avatar size={36} icon="person-outline" />
                <View style={{ flex: 1 }}>
                  <Text style={[type.smallMed, { color: colors.text }]} numberOfLines={1}>
                    {s.displayName ?? s.email ?? s.userId}
                  </Text>
                  <Text style={[type.small, { color: colors.textMuted }]} numberOfLines={1}>
                    {String(s.role)}
                  </Text>
                </View>
                {canEdit ? (
                  <Text
                    style={[type.smallMed, { color: colors.primary }]}
                    onPress={() =>
                      Alert.alert(
                        'Change role',
                        'Role changes are made from the campus web console — the app shows who holds what.'
                      )
                    }
                  >
                    Change
                  </Text>
                ) : null}
              </View>
            ))}
          </>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  roleBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.glassSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  countTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  staffRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
