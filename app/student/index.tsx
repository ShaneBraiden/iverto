/**
 * Student home — live request, curfew, counters, recent history.
 *
 * `GET /permissions/summary` is one call that returns all four blocks: the
 * counters, the request currently in flight and the last few rows. It is used
 * instead of counting a downloaded page, so the numbers stay right past the
 * first twenty records.
 *
 * `GET /curfew` is the second call, and it is the one thing on this screen
 * that answers "can I be out right now" — the site's curfew window, whether
 * the gate last saw them go in or out, and any recent late returns.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { AppHeader, Screen } from '@/components/Screen';
import {
  Card,
  EmptyState,
  ErrorState,
  IconTile,
  Note,
  PoweredBy,
  SectionHeader,
  StatCard,
  StatusPill,
} from '@/components/ui';
import { SkeletonStudentHome } from '@/components/Skeleton';
import { Stagger } from '@/components/motion';
import { OutpassCard } from '@/components/OutpassCard';
import { useApp, useLivePermissions } from '@/components/AppContext';
import { colors, radius, spacing, type } from '@/theme';
import { timeGreeting } from '@/constants/greeting';
import { permissions as permissionApi } from '@/lib/api/endpoints';
import { useQuery } from '@/lib/api/useQuery';
import { useRefetchOnFocus } from '@/lib/useFocusRefetch';
import { statusInfo } from '@/lib/status';
import { isoRange } from '@/lib/datetime';
import { useAuth } from '@/lib/auth';

export default function StudentHome() {
  const { me } = useAuth();
  const { unread } = useApp();

  const summary = useQuery((signal) => permissionApi.summary(signal), []);
  const curfew = useQuery((signal) => permissionApi.curfew(signal), []);

  const refresh = React.useCallback(() => {
    summary.refetch();
    curfew.refetch();
  }, [summary.refetch, curfew.refetch]);

  /* Coming back from the request form should show the request that was just
     raised, and a guardian deciding while this screen is open should land
     without waiting for a navigation. */
  useRefetchOnFocus(refresh);
  useLivePermissions(refresh);

  const counts = summary.data?.counts;
  const live = summary.data?.liveRequest ?? curfew.data?.activePermission ?? null;
  const recent = summary.data?.recent ?? [];
  const window = curfew.data?.activeCurfew;
  const outside = curfew.data?.currentStatus === 'outside';

  return (
    <View style={{ flex: 1 }}>
      <AppHeader
        greeting={timeGreeting()}
        title={me?.name ?? '—'}
        meta={[me?.rollNumber, me?.roomNumber].filter(Boolean).join(' · ')}
        icon="school-outline"
        badgeCount={unread || undefined}
        onBell={() => router.push('/notifications')}
      />
      <Screen>
        {summary.loading ? (
          <SkeletonStudentHome />
        ) : summary.error ? (
          <ErrorState error={summary.error} onRetry={refresh} />
        ) : (
          <>
            {/* Where the gate last saw them, and the window they have to be
                back inside. This is the only place either fact appears. */}
            {curfew.data ? (
              <View
                style={[
                  styles.curfew,
                  { backgroundColor: outside ? colors.infoBg : colors.successBg },
                ]}
              >
                <View
                  style={[styles.dot, { backgroundColor: outside ? colors.info : colors.success }]}
                />
                <Text
                  style={[
                    type.smallMed,
                    { color: outside ? colors.info : colors.success, flexShrink: 0 },
                  ]}
                >
                  {outside ? 'Currently out' : 'On campus'}
                </Text>
                {window ? (
                  <Text
                    style={[
                      type.small,
                      { color: colors.textMuted, marginLeft: 'auto', flexShrink: 1 },
                    ]}
                    numberOfLines={1}
                  >
                    Curfew {window.start}–{window.end}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* The request the student opened the app to check. */}
            {live ? (
              <Card onPress={() => router.push(`/outpass/${live.id}?role=student`)}>
                <View style={styles.highlightTop}>
                  <Text style={[type.caption, { color: colors.primary }]}>LATEST REQUEST</Text>
                  <StatusPill status={live.status} small />
                </View>
                <Text
                  style={[type.h3, { color: colors.text, marginTop: spacing.sm }]}
                  numberOfLines={2}
                >
                  {live.reason}
                </Text>
                <Text style={[type.small, { color: colors.textMuted, marginTop: 2 }]}>
                  {isoRange(live.startTime ?? live.startDate, live.endTime)}
                </Text>
                <View style={styles.waitRow}>
                  <Ionicons name="hourglass-outline" size={14} color={colors.warning} />
                  <Text style={[type.small, { color: colors.textMuted, flex: 1 }]}>
                    {statusInfo(live.status).explainer}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                </View>
              </Card>
            ) : null}

            {/* Quick action */}
            <Card onPress={() => router.push('/student/request')} style={styles.cta}>
              <View style={styles.ctaRow}>
                <IconTile icon="add" size={42} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.bodyMed, { color: colors.text }]}>New outpass request</Text>
                  <Text style={[type.small, { color: colors.textMuted }]}>
                    Takes about a minute to fill
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
              </View>
            </Card>

            {/* Counters, straight from the summary call. */}
            {counts ? (
              /* `flex: 1` has to go on the animated wrapper, not on the tile
                 inside it — the wrapper is what the row divides between. */
              <View style={styles.statRow}>
                <Stagger style={{ flex: 1 }}>
                  <StatCard
                    label="Approved"
                    value={String(counts.approved)}
                    icon="checkmark-circle-outline"
                    fg={colors.success}
                    bg={colors.successBg}
                  />
                  <StatCard
                    label="Pending"
                    value={String(counts.pending)}
                    icon="time-outline"
                    fg={colors.warning}
                    bg={colors.warningBg}
                  />
                  <StatCard
                    label="Rejected"
                    value={String(counts.rejected)}
                    icon="close-circle-outline"
                    fg={colors.danger}
                    bg={colors.dangerBg}
                  />
                </Stagger>
              </View>
            ) : null}

            {/* A late return is worth surfacing on the home screen — it is the
                thing most likely to affect the next request. */}
            {curfew.data?.recentViolations?.length ? (
              <Note
                icon="alert-circle-outline"
                tone="warning"
                text={`${curfew.data.recentViolations.length} late return${
                  curfew.data.recentViolations.length === 1 ? '' : 's'
                } on record. The warden reviews these when clearing your next pass.`}
              />
            ) : null}

            {/* Recent */}
            <View>
              <SectionHeader
                title="Recent requests"
                actionLabel={counts && counts.total > recent.length ? 'View all' : undefined}
                onAction={() => router.push('/student/history')}
              />
              {recent.length ? (
                /* The section already arrives as one block from `Screen`; this
                   is the second beat inside it, so the cards deal themselves
                   out under their own heading rather than with it. */
                <View style={{ gap: spacing.md }}>
                  <Stagger>
                    {recent.map((o) => (
                      <OutpassCard key={o.id} item={o} role="student" />
                    ))}
                  </Stagger>
                </View>
              ) : (
                <EmptyState
                  icon="document-text-outline"
                  title="No requests yet"
                  message="Your outpass history will show up here once you raise your first request."
                />
              )}
            </View>
          </>
        )}

        <PoweredBy />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  curfew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  highlightTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  waitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  // `alignItems: stretch` keeps all three tiles the same height even when one
  // label wraps differently from its neighbours.
  statRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md },
  cta: { borderRadius: radius.xl },
});
