/**
 * Guardian home — requests awaiting a decision, with inline approve/reject.
 *
 * The signed-in guardian is shown by relation ("Father" / "Mother"), and the
 * ward by roll number. No personal names anywhere.
 *
 * SIBLINGS: a guardian with more than one child on campus sees one ward at a
 * time. The only sign of that is a caret on the roll number in the header —
 * tap it, pick a sibling, and the queue below re-filters. A guardian with a
 * single ward gets no caret and no switcher at all, so the screen looks
 * exactly as it did before siblings existed.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AppHeader, Screen } from '@/components/Screen';
import { useWard } from '@/components/WardContext';
import { WardSwitcher } from '@/components/WardSwitcher';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Note,
  PoweredBy,
  SectionHeader,
  StatusPill,
} from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import { parent, parentQueue, pendingFor } from '@/constants/sample';
import type { Outpass } from '@/constants/sample';

export default function ParentHome() {
  const { ward, wards, selectWard, hasSiblings } = useWard();
  const [switching, setSwitching] = useState(false);

  const queue = pendingFor(ward.rollNo);
  const elsewhere = parentQueue.length - queue.length;

  return (
    <View style={{ flex: 1 }}>
      {/* Unchanged from the single-ward layout apart from the roll number,
          which grows a caret when there is a sibling to switch to. */}
      <AppHeader
        greeting="Signed in as"
        title={parent.relation}
        meta={`Guardian of ${ward.name} ·`}
        metaAction={ward.rollNo}
        onMetaPress={hasSiblings ? () => setSwitching(true) : undefined}
        icon="people-outline"
        badgeCount={queue.length}
      />

      <Screen>
        {queue.length ? (
          <Note
            icon="alert-circle-outline"
            tone="warning"
            text={`${queue.length} request${queue.length === 1 ? '' : 's'} need your approval. ${ward.rollNo} can't leave campus until you respond.`}
          />
        ) : null}

        {/* A sibling's request would otherwise sit unseen behind the switch,
            so it gets called out — with a pointer at where the switch is. */}
        {hasSiblings && elsewhere > 0 ? (
          <Note
            icon="people-outline"
            tone="brand"
            text={`${elsewhere} more request${elsewhere === 1 ? '' : 's'} waiting under your other ward${elsewhere === 1 ? '' : 's'} — tap the roll number above to switch.`}
          />
        ) : null}

        <View>
          <SectionHeader title="Awaiting your decision" />
          {queue.length === 0 ? (
            <EmptyState
              icon="checkmark-done-outline"
              title="All caught up"
              message={`Nothing is waiting on you for ${ward.rollNo} right now.`}
            />
          ) : (
            <View style={{ gap: spacing.md }}>
              {queue.map((o) => (
                <ApprovalCard key={o.id} item={o} />
              ))}
            </View>
          )}
        </View>

        <PoweredBy />
      </Screen>

      <WardSwitcher
        visible={switching}
        onClose={() => setSwitching(false)}
        wards={wards}
        activeRollNo={ward.rollNo}
        onSelect={selectWard}
      />
    </View>
  );
}

function ApprovalCard({ item }: { item: Outpass }) {
  return (
    <Card>
      <View style={styles.top}>
        <Avatar size={42} icon="school-outline" />
        <View style={{ flex: 1 }}>
          <Text style={[type.bodyMed, { color: colors.text }]}>{item.student}</Text>
          <Text style={[type.small, { color: colors.textMuted }]}>
            {item.rollNo} · {item.requestedAt}
          </Text>
        </View>
        <StatusPill status={item.status} small />
      </View>

      <View style={styles.reasonBox}>
        <Text style={[type.caption, { color: colors.primary }]}>
          {item.id} · {item.category.toUpperCase()}
        </Text>
        <Text style={[type.bodyMed, { color: colors.text, marginTop: 2 }]}>{item.reason}</Text>
      </View>

      <View style={{ gap: 4, marginTop: spacing.md }}>
        <Line icon="log-out-outline" text={`Leaves ${item.fromDate} at ${item.fromTime}`} />
        <Line icon="log-in-outline" text={`Returns ${item.toDate} at ${item.toTime}`} />
        <Line icon="location-outline" text={item.destination} />
      </View>

      <View style={styles.actions}>
        <Button
          label="Reject"
          variant="danger"
          icon="close"
          full={false}
          style={{ flex: 1 }}
          onPress={() => router.push(`/outpass/${item.id}?role=parent`)}
        />
        <Button
          label="Approve"
          variant="success"
          icon="checkmark"
          full={false}
          style={{ flex: 1 }}
          onPress={() => router.push(`/outpass/${item.id}?role=parent`)}
        />
      </View>

      <Text
        style={[type.small, { color: colors.primary, textAlign: 'center', marginTop: spacing.md }]}
        onPress={() => router.push(`/outpass/${item.id}?role=parent`)}
      >
        View full details
      </Text>
    </Card>
  );
}

function Line({
  icon,
  text,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Ionicons name={icon} size={14} color={colors.textMuted} />
      <Text style={[type.small, { color: colors.textMuted, flex: 1 }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  reasonBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.glassSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
