/**
 * Notification inbox — the bell in every dashboard header opens this.
 *
 * The inbox fills regardless of the delivery preferences: turning push off
 * stops the alert, not the record. That is why this screen exists rather than
 * relying on the OS notification tray.
 *
 * Each notification carries a `uri` in its `data` — `iverto://permissions/<id>`
 * and friends — which is the same deep link a push payload uses. Tapping a row
 * resolves that to an in-app route, so the tap does the same thing whether it
 * arrives here or on the lock screen.
 *
 * Title and body go through `notificationCopy` rather than being drawn as they
 * arrive: some events reach the inbox with the event code in the title
 * (`parent_decided`) and no body, and a row that reads like a database column
 * has told the reader nothing. Real copy is passed through untouched — see
 * `lib/notificationText.ts`.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { Card, EmptyState, ErrorState, LoadMore, PoweredBy } from '@/components/ui';
import { SkeletonList } from '@/components/Skeleton';
import { Stagger } from '@/components/motion';
import { useApp } from '@/components/AppContext';
import { colors, radius, spacing, type } from '@/theme';
import { PAGE_SIZE } from '@/constants/config';
import { notifications as notificationApi } from '@/lib/api/endpoints';
import { fromPage, usePagedQuery, useMutation } from '@/lib/api/useQuery';
import { timeAgo } from '@/lib/datetime';
import { notificationCopy, notificationIcon } from '@/lib/notificationText';
import { shellFor, useAuth } from '@/lib/auth';
import type { AppNotification } from '@/types';

/**
 * `iverto://permissions/<id>` → the in-app route for it.
 * The scheme is dropped rather than handed to `Linking`, because this app is
 * already open — routing straight through avoids a round trip out to the OS.
 */
function routeFor(note: AppNotification, role: string) {
  const uri = note.data?.uri ?? '';
  const permissionId =
    note.permissionId ?? (uri.startsWith('iverto://permissions/') ? uri.split('/').pop() : null);

  if (permissionId) return `/outpass/${permissionId}?role=${role}`;
  if (uri.includes('profile-requests')) return '/profile-request';
  return null;
}

export default function Notifications() {
  const { user } = useAuth();
  const { refreshUnread, clearUnread } = useApp();
  const role = shellFor(user?.role);

  const list = usePagedQuery(
    (cursor, signal) =>
      notificationApi.list({ cursor, limit: PAGE_SIZE }, signal).then(fromPage),
    []
  );

  const rows = list.data ?? [];
  const unreadRows = rows.filter((n) => !n.readAt).length;

  const markAll = useMutation(() => notificationApi.markAllRead(), {
    onSuccess: () => {
      clearUnread();
      list.refetch();
    },
  });

  /* Reading is fire-and-forget — the row is already open by the time the
     server hears about it, and a failure there is not worth a dialog. */
  const open = (note: AppNotification) => {
    if (!note.readAt) {
      notificationApi
        .markRead(note.id)
        .then(refreshUnread)
        .catch(() => {});
    }
    const target = routeFor(note, role);
    if (target) router.push(target as never);
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Notifications"
        subtitle={unreadRows ? `${unreadRows} unread` : undefined}
        rightIcon={unreadRows ? 'checkmark-done-outline' : undefined}
        onRight={() => markAll.mutate()}
      />
      <Screen clearTabBar={false}>
        {list.loading ? (
          <SkeletonList count={6} />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="notifications-off-outline"
            title="Nothing here yet"
            message="Approvals, decisions and campus announcements land here as they happen."
          />
        ) : (
          <>
            <View style={{ gap: spacing.md }}>
              <Stagger>
                {rows.map((n) => {
                  const unread = !n.readAt;
                  const copy = notificationCopy(n);
                  return (
                    <Card key={n.id} padded={false} onPress={() => open(n)}>
                      <View style={styles.row}>
                        <View style={[styles.icon, unread && styles.iconUnread]}>
                          <Ionicons
                            name={notificationIcon(n) as never}
                            size={18}
                            color={unread ? colors.primary : colors.textMuted}
                          />
                        </View>
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                          <Text
                            style={[unread ? type.bodyMed : type.body, { color: colors.text }]}
                            numberOfLines={2}
                          >
                            {copy.title}
                          </Text>
                          {copy.body ? (
                            <Text
                              style={[type.small, { color: colors.textMuted }]}
                              numberOfLines={4}
                            >
                              {copy.body}
                            </Text>
                          ) : null}
                          <Text style={[type.small, { color: colors.textFaint }]}>
                            {timeAgo(n.createdAt)}
                          </Text>
                        </View>
                        {unread ? <View style={styles.dot} /> : null}
                      </View>
                    </Card>
                  );
                })}
              </Stagger>
            </View>

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
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
  },
  icon: {
    width: 38,
    height: 38,
    flexShrink: 0,
    borderRadius: radius.md,
    backgroundColor: colors.neutralBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUnread: { backgroundColor: colors.primarySoft },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
});
