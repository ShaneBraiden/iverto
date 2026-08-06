/** Student home — latest request, quick action, stats, recent history. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AppHeader, Screen } from '@/components/Screen';
import {
  Card,
  EmptyState,
  IconTile,
  PoweredBy,
  SectionHeader,
  StatCard,
  StatusPill,
} from '@/components/ui';
import { OutpassCard } from '@/components/OutpassCard';
import { colors, radius, spacing, type } from '@/theme';
import { outpasses, student } from '@/constants/sample';
import { timeGreeting } from '@/constants/greeting';

export default function StudentHome() {
  // The highlight card should follow whatever is actually live — the request
  // still waiting on a guardian, or the one the student is currently out on.
  const latest = outpasses.find((o) => o.status === 'pending' || o.status === 'active');

  // Counters are derived, never hardcoded, so the tiles and the list below
  // can never disagree once real data replaces the sample set.
  const counts = outpasses.reduce(
    (acc, o) => {
      if (o.status === 'approved' || o.status === 'active') acc.approved += 1;
      else if (o.status === 'pending') acc.pending += 1;
      else if (o.status === 'rejected') acc.rejected += 1;
      return acc;
    },
    { approved: 0, pending: 0, rejected: 0 }
  );

  const recent = outpasses.slice(0, 3);

  return (
    <View style={{ flex: 1 }}>
      <AppHeader
        greeting={timeGreeting()}
        title={student.name}
        meta={`${student.rollNo} · ${student.hostel}`}
        icon="school-outline"
        badgeCount={counts.pending || undefined}
      />
      <Screen>
        {/* Latest request — the one thing the student opened the app to check. */}
        {latest ? (
          <Card onPress={() => router.push(`/outpass/${latest.id}?role=student`)}>
            <View style={styles.highlightTop}>
              <Text style={[type.caption, { color: colors.primary }]}>LATEST REQUEST</Text>
              <StatusPill status={latest.status} small />
            </View>
            <Text
              style={[type.h3, { color: colors.text, marginTop: spacing.sm }]}
              numberOfLines={2}
            >
              {latest.reason}
            </Text>
            <Text style={[type.small, { color: colors.textMuted, marginTop: 2 }]}>
              {latest.fromDate}, {latest.fromTime} → {latest.toDate}, {latest.toTime}
            </Text>
            <View style={styles.waitRow}>
              <Ionicons name="hourglass-outline" size={14} color={colors.warning} />
              <Text style={[type.small, { color: colors.textMuted, flex: 1 }]}>
                Waiting for your {student.guardian.toLowerCase()} to respond
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

        {/* Stats */}
        <View style={styles.statRow}>
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
        </View>

        {/* Recent */}
        <View>
          <SectionHeader
            title="Recent requests"
            actionLabel={outpasses.length > recent.length ? 'View all' : undefined}
            onAction={() => router.push('/student/history')}
          />
          {recent.length ? (
            <View style={{ gap: spacing.md }}>
              {recent.map((o) => (
                <OutpassCard key={o.id} item={o} role="student" />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="document-text-outline"
              title="No requests yet"
              message="Your outpass history will show up here once you raise your first request."
            />
          )}
        </View>

        <PoweredBy />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
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
