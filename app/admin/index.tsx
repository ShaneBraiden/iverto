/**
 * Admin overview — campus stats, quick tools, recent activity.
 *
 * The tiles are served, not derived: `GET /admin/stats` is one call that
 * already counts across the whole tenant (or the warden's assigned sites), so
 * the numbers stay right past the first page of any list.
 *
 * Open emergencies are the one thing on this screen that is not a tile — an
 * alert that a guardian raised needs a name and a message, not a number, so it
 * gets its own strip above everything else.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { AppHeader, Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  IconTile,
  Loader,
  Note,
  PoweredBy,
  SectionHeader,
  StatCard,
} from '@/components/ui';
import { useApp, useLivePermissions } from '@/components/AppContext';
import { colors, glassFill, radius, shadow, spacing, type } from '@/theme';
import { activityIcon, ANNOUNCEMENT_AUDIENCES } from '@/constants/config';
import { useAdmin } from '@/components/AdminContext';
import { admin as adminApi } from '@/lib/api/endpoints';
import { errorMessage, useMutation, useQuery } from '@/lib/api/useQuery';
import { useRefetchOnFocus } from '@/lib/useFocusRefetch';
import { timeAgo } from '@/lib/datetime';
import { displayName, useAuth } from '@/lib/auth';
import type { AdminStats } from '@/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Tile colours belong to the app; only the numbers come from the server. */
function statTiles(stats: AdminStats) {
  return [
    {
      label: 'Pending',
      value: String(stats.pending),
      icon: 'time-outline' as IconName,
      fg: colors.warning,
      bg: colors.warningBg,
    },
    {
      label: 'Approved today',
      value: String(stats.approvedToday),
      icon: 'checkmark-circle-outline' as IconName,
      fg: colors.success,
      bg: colors.successBg,
    },
    {
      label: 'Currently out',
      value: String(stats.currentlyOut),
      icon: 'walk-outline' as IconName,
      fg: colors.info,
      bg: colors.infoBg,
    },
    {
      label: 'Overdue',
      value: String(stats.overdue),
      icon: 'alert-circle-outline' as IconName,
      fg: colors.danger,
      bg: colors.dangerBg,
    },
  ];
}

export default function AdminHome() {
  const { me, user } = useAuth();
  const { unread } = useApp();
  /* Shared with the tab badges — see components/AdminContext. */
  const { stats, loading, error, refresh, siteId } = useAdmin();
  const [announcing, setAnnouncing] = useState(false);

  const activity = useQuery(
    (signal) => adminApi.activity({ limit: 25, siteId }, signal),
    [siteId]
  );
  const emergencies = useQuery(
    (signal) => adminApi.emergencies('open', signal),
    [siteId]
  );

  const refreshAll = React.useCallback(() => {
    refresh();
    activity.refetch();
    emergencies.refetch();
  }, [refresh, activity.refetch, emergencies.refetch]);

  useRefetchOnFocus(refreshAll);
  useLivePermissions(refreshAll);

  const resolve = useMutation((id: string) => adminApi.resolveEmergency(id, 'resolved'), {
    onSuccess: refreshAll,
    onError: (err) => Alert.alert("Couldn't resolve that", errorMessage(err)),
  });

  const tiles = stats ? statTiles(stats) : [];
  const rows = activity.data ?? [];
  const alerts = emergencies.data ?? [];

  const TOOLS: { icon: IconName; label: string; onPress: () => void }[] = [
    { icon: 'documents-outline', label: 'Passes', onPress: () => router.push('/admin/requests') },
    {
      icon: 'create-outline',
      label: 'Profile edits',
      onPress: () => router.push('/admin/profile-requests'),
    },
    {
      icon: 'people-circle-outline',
      label: 'Groups',
      onPress: () => router.push('/admin/groups'),
    },
    {
      icon: 'color-palette-outline',
      label: 'Branding',
      onPress: () => router.push('/admin/groups'),
    },
    { icon: 'megaphone-outline', label: 'Announce', onPress: () => setAnnouncing(true) },
    {
      icon: 'notifications-outline',
      label: 'Inbox',
      onPress: () => router.push('/notifications'),
    },
  ];

  return (
    <View style={{ flex: 1 }}>
      <AppHeader
        greeting="Signed in as"
        title={displayName(user, me)}
        meta={[
          user?.role === 'warden' ? 'Warden' : 'Administrator',
          me?.assignedSites?.map((s) => s.name).join(', '),
        ]
          .filter(Boolean)
          .join(' · ')}
        icon="shield-checkmark-outline"
        badgeCount={unread || undefined}
        onBell={() => router.push('/notifications')}
      />
      <Screen>
        {/* An open emergency outranks every counter on this screen. */}
        {alerts.length ? (
          <View style={{ gap: spacing.sm }}>
            {alerts.map((a) => (
              <View key={a.id} style={styles.alert}>
                <Ionicons name="warning" size={18} color={colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.smallMed, { color: colors.danger }]}>
                    {a.category.toUpperCase()} · {a.student?.name ?? a.studentId}
                  </Text>
                  <Text style={[type.small, { color: colors.textMuted }]}>{a.message}</Text>
                  {a.contactPhone ? (
                    <Text style={[type.small, { color: colors.textFaint }]}>
                      Call back on {a.contactPhone} · raised {timeAgo(a.createdAt)}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  hitSlop={8}
                  disabled={resolve.pending}
                  onPress={() =>
                    Alert.alert('Resolve this alert?', a.message, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Resolve', onPress: () => resolve.mutate(a.id) },
                    ])
                  }
                >
                  <Text style={[type.smallMed, { color: colors.primary }]}>Resolve</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {loading ? (
          <Loader />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={refresh} />
        ) : (
          <View style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              {tiles.slice(0, 2).map((s) => (
                <StatCard key={s.label} {...s} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              {tiles.slice(2).map((s) => (
                <StatCard key={s.label} {...s} />
              ))}
            </View>
            {stats ? (
              <Text style={[type.small, { color: colors.textFaint, textAlign: 'right' }]}>
                Updated {timeAgo(stats.generatedAt)}
              </Text>
            ) : null}
          </View>
        )}

        <View>
          <SectionHeader title="Quick tools" />
          {/* Laid out as explicit rows of three rather than a wrapping grid:
              a percentage width can't account for the gaps between tiles, so
              the row never quite reached the edges and the last tile in each
              row sat narrower than its neighbours. `flex: 1` divides the space
              that is actually left over, exactly. */}
          <View style={{ gap: spacing.md }}>
            {chunk(TOOLS, 3).map((row, i) => (
              <View key={i} style={styles.toolRow}>
                {row.map((t) => (
                  <Pressable
                    key={t.label}
                    onPress={t.onPress}
                    style={({ pressed }) => [styles.tool, pressed && { opacity: 0.7 }]}
                  >
                    <IconTile icon={t.icon} size={40} />
                    <Text
                      style={[type.small, { color: colors.text, textAlign: 'center' }]}
                      numberOfLines={1}
                    >
                      {t.label}
                    </Text>
                  </Pressable>
                ))}
                {/* Keeps a short final row the same tile width as a full one. */}
                {row.length < 3
                  ? Array.from({ length: 3 - row.length }, (_, k) => (
                      <View key={`gap-${k}`} style={{ flex: 1 }} />
                    ))
                  : null}
              </View>
            ))}
          </View>
        </View>

        <View>
          <SectionHeader title="Recent activity" />
          <Card padded={false}>
            {activity.loading ? (
              <Loader />
            ) : activity.error ? (
              <View style={{ padding: spacing.lg }}>
                <ErrorState message={errorMessage(activity.error)} onRetry={activity.refetch} />
              </View>
            ) : rows.length === 0 ? (
              <EmptyState
                icon="pulse-outline"
                title="Nothing yet today"
                message="Scans, decisions and profile changes show up here as they happen."
              />
            ) : (
              rows.map((a, i) => (
                <View key={a.id}>
                  <View style={styles.activityRow}>
                    <IconTile icon={activityIcon(a.action) as IconName} size={32} />
                    <Text style={[type.small, { color: colors.text, flex: 1 }]}>{a.summary}</Text>
                    <Text style={[type.small, { color: colors.textFaint }]}>{timeAgo(a.at)}</Text>
                  </View>
                  {i < rows.length - 1 ? (
                    <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 60 }} />
                  ) : null}
                </View>
              ))
            )}
          </Card>
        </View>

        <PoweredBy />
      </Screen>

      <AnnounceSheet visible={announcing} onClose={() => setAnnouncing(false)} />
    </View>
  );
}

/**
 * `POST /admin/announcements` — every recipient also gets a push, which is why
 * the recently-sent list is right there: it is the cheapest way to not send the
 * same campus-wide notification twice.
 */
function AnnounceSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { siteId } = useAdmin();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'all' | 'student' | 'parent' | 'warden'>('all');

  const history = useQuery((signal) => adminApi.announcements(10, signal), [visible], {
    enabled: visible,
  });

  const send = useMutation(
    () =>
      adminApi.announce({
        title: title.trim(),
        body: body.trim(),
        audience,
        siteIds: siteId ? [siteId] : undefined,
      }),
    {
      onSuccess: (result) => {
        setTitle('');
        setBody('');
        history.refetch();
        onClose();
        Alert.alert(
          'Announcement sent',
          `It landed in ${result?.recipients ?? 0} inbox${result?.recipients === 1 ? '' : 'es'}, and everyone got a push.`
        );
      },
      onError: (err) => Alert.alert("Couldn't send that", errorMessage(err)),
    }
  );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Send an announcement"
      subtitle="It reaches every inbox in the audience, plus a push notification."
    >
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        <View style={styles.chips}>
          {ANNOUNCEMENT_AUDIENCES.map((a) => (
            <Chip
              key={a.id}
              label={a.label}
              selected={a.id === audience}
              onPress={() => setAudience(a.id)}
            />
          ))}
        </View>

        <Field
          label="Title"
          placeholder="Gate closes at 21:00"
          icon="megaphone-outline"
          value={title}
          onChangeText={setTitle}
          autoCapitalize="sentences"
        />
        <Field
          label="Message"
          placeholder="Plan your return"
          multiline
          value={body}
          onChangeText={setBody}
          autoCapitalize="sentences"
        />

        <Button
          label="Send announcement"
          icon="paper-plane-outline"
          loading={send.pending}
          disabled={title.trim().length === 0 || body.trim().length === 0 || send.pending}
          onPress={() => send.mutate()}
        />

        {history.data?.length ? (
          <View style={{ gap: spacing.sm, paddingBottom: spacing.lg }}>
            <Text style={[type.caption, { color: colors.textFaint }]}>RECENTLY SENT</Text>
            {history.data.slice(0, 5).map((a) => (
              <View key={a.id} style={styles.sentRow}>
                <Ionicons name="megaphone-outline" size={14} color={colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.smallMed, { color: colors.text }]} numberOfLines={1}>
                    {a.title}
                  </Text>
                  <Text style={[type.small, { color: colors.textFaint }]}>
                    {a.audience} · {timeAgo(a.createdAt)}
                    {a.recipients != null ? ` · ${a.recipients} reached` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

/** Splits a flat list into rows of `size` for a fixed-column grid. */
function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

const styles = StyleSheet.create({
  toolRow: { flexDirection: 'row', gap: spacing.md },
  tool: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    // Opaque on Android. `shadow.card` carries an `elevation`, and Android
    // draws an elevated *translucent* surface by painting its shadow caster as
    // a hard white rectangle inside the tile — which is exactly what these
    // tiles were doing. Same rule the theme states for every card.
    backgroundColor: glassFill.base,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadow.card,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.dangerBg,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
