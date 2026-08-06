/**
 * Admin — profile change requests raised by students and guardians.
 *
 * Nobody edits their own record, so every correction lands here as a diff.
 * The admin's job is to read the old value against the new one, check the
 * reason (and the attachment if there is one), and apply or decline it.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, TopBar } from '@/components/Screen';
import {
  Avatar,
  Button,
  Card,
  Chip,
  EmptyState,
  GlassPanel,
  Note,
  PoweredBy,
} from '@/components/ui';
import { blur, colors, radius, spacing, type } from '@/theme';
import { profileRequests, type ProfileRequest } from '@/constants/sample';

const FILTERS = ['Pending', 'Approved', 'Rejected', 'All'] as const;

export default function AdminProfileRequests() {
  const [filter, setFilter] = useState<string>('Pending');

  const list =
    filter === 'All'
      ? profileRequests
      : profileRequests.filter((r) => r.status === filter.toLowerCase());

  const waiting = profileRequests.filter((r) => r.status === 'pending').length;

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Profile requests" back={false} rightIcon="download-outline" />
      <GlassPanel intensity={blur.bar} style={styles.bar}>
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
        {waiting > 0 ? (
          <Note
            icon="create-outline"
            tone="warning"
            text={`${waiting} change request${waiting === 1 ? '' : 's'} waiting on you. Approving one writes the new values straight to the record.`}
          />
        ) : null}

        <Text style={[type.small, { color: colors.textMuted }]}>
          {list.length} request{list.length === 1 ? '' : 's'}
        </Text>

        {list.length === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title="Nothing here"
            message={`No ${filter.toLowerCase()} profile requests to show.`}
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {list.map((r) => (
              <RequestCard key={r.id} request={r} />
            ))}
          </View>
        )}

        <PoweredBy />
      </Screen>
    </View>
  );
}

function RequestCard({ request }: { request: ProfileRequest }) {
  const pending = request.status === 'pending';
  const meta = {
    pending: { fg: colors.warning, bg: colors.warningBg, label: 'PENDING' },
    approved: { fg: colors.success, bg: colors.successBg, label: 'APPLIED' },
    rejected: { fg: colors.danger, bg: colors.dangerBg, label: 'DECLINED' },
  }[request.status];

  return (
    <Card>
      <View style={styles.head}>
        <Avatar
          size={42}
          icon={request.role === 'student' ? 'school-outline' : 'people-outline'}
        />
        <View style={{ flex: 1 }}>
          <Text style={[type.bodyMed, { color: colors.text }]}>
            {request.requester} · {request.rollNo}
          </Text>
          <Text style={[type.small, { color: colors.textMuted }]}>
            {request.id} · {request.submitted}
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: meta.bg }]}>
          <Text style={[type.caption, { color: meta.fg }]}>{meta.label}</Text>
        </View>
      </View>

      {/* The diff — old value struck through, new value in full weight. */}
      <View style={styles.diffBox}>
        {request.fields.map((f, i) => (
          <View key={f.field} style={[styles.diff, i > 0 && styles.diffGap]}>
            <Text style={[type.caption, { color: colors.textFaint }]}>
              {f.field.toUpperCase()}
            </Text>
            <View style={styles.diffRow}>
              <Text
                style={[
                  type.small,
                  { color: colors.textFaint, textDecorationLine: 'line-through', flexShrink: 1 },
                ]}
                numberOfLines={1}
              >
                {f.current}
              </Text>
              <Ionicons name="arrow-forward" size={13} color={colors.primary} />
              <Text style={[type.bodyMed, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                {f.requested}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.reasonRow}>
        <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.textMuted} />
        <Text style={[type.small, { color: colors.textMuted, flex: 1 }]}>{request.reason}</Text>
      </View>

      {request.hasAttachment ? (
        <View style={styles.attachRow}>
          <Ionicons name="document-attach-outline" size={14} color={colors.primary} />
          <Text style={[type.small, { color: colors.primary, flex: 1 }]}>
            Supporting document attached
          </Text>
          <Text style={[type.smallMed, { color: colors.primary }]}>View</Text>
        </View>
      ) : null}

      {pending ? (
        <View style={styles.actions}>
          <Button label="Decline" variant="danger" icon="close" full={false} style={{ flex: 1 }} />
          <Button
            label="Apply changes"
            variant="success"
            icon="checkmark"
            full={false}
            style={{ flex: 1 }}
          />
        </View>
      ) : (
        <View style={styles.decided}>
          <Ionicons
            name={request.status === 'approved' ? 'checkmark-circle' : 'close-circle'}
            size={14}
            color={meta.fg}
          />
          <Text style={[type.small, { color: colors.textMuted, flex: 1 }]}>
            {request.status === 'approved' ? 'Applied' : 'Declined'} by {request.decidedBy}
            {request.decidedAt ? ` · ${request.decidedAt}` : ''}
            {request.note ? ` — “${request.note}”` : ''}
          </Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  diffBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.glassSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  diff: { gap: 3 },
  diffGap: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  diffRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  attachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
  },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  decided: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
