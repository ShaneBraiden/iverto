/**
 * Outpass detail — shared by all three roles.
 * `role` query param decides which action bar is shown:
 *   student → QR gate pass / cancel
 *   parent  → approve / reject (with reject-reason sheet)
 *   admin   → override / print
 *
 * The gate pass is a glass ticket, not a pink block.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { Avatar, Button, Card, Field, GlassPanel, Note, PoweredBy, Row, StatusPill } from '@/components/ui';
import { blur, colors, radius, shadow, spacing, statusMeta, type } from '@/theme';
import { outpasses, roleLabels } from '@/constants/sample';

export default function OutpassDetail() {
  const { id, role } = useLocalSearchParams<{ id: string; role?: string }>();
  const item = outpasses.find((o) => o.id === id) ?? outpasses[0];
  const [rejectOpen, setRejectOpen] = useState(false);

  const meta = statusMeta[item.status];

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={item.id} subtitle={item.category} rightIcon="share-outline" />
      <Screen clearTabBar={false}>
        {/* Status banner */}
        <View style={[styles.banner, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon as never} size={22} color={meta.fg} />
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyMed, { color: meta.fg }]}>{meta.label}</Text>
            <Text style={[type.small, { color: colors.textMuted }]}>
              {item.status === 'pending'
                ? 'Waiting for guardian approval'
                : item.approvedBy
                  ? `Decided by ${item.approvedBy}`
                  : 'No action recorded'}
            </Text>
          </View>
        </View>

        {/* Gate pass — only meaningful once approved */}
        {item.status === 'approved' ? (
          <GlassPanel intensity={blur.header} strong style={styles.pass}>
            <View style={styles.passInner}>
              <Text style={[type.caption, { color: colors.primary }]}>GATE PASS</Text>
              <View style={styles.qr}>
                <Ionicons name="qr-code" size={92} color={colors.text} />
              </View>
              <Text style={[type.bodyMed, { color: colors.text }]}>{item.id}</Text>
              <Text style={[type.small, { color: colors.textMuted, textAlign: 'center' }]}>
                Show this at the gate · valid till {item.toDate}
              </Text>
            </View>
          </GlassPanel>
        ) : null}

        {/* Requester block — role label + roll number */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Avatar size={46} icon="school-outline" />
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyMed, { color: colors.text }]}>{item.student}</Text>
              <Text style={[type.small, { color: colors.textMuted }]}>
                {item.rollNo} · {item.hostel}
              </Text>
            </View>
            <StatusPill status={item.status} small />
          </View>
        </Card>

        {/* Trip block */}
        <Card>
          <Text style={[type.caption, { color: colors.textFaint, marginBottom: spacing.sm }]}>
            TRIP DETAILS
          </Text>
          <Row icon="pricetag-outline" label="Category" value={item.category} />
          <Row icon="location-outline" label="Destination" value={item.destination} />
          <Row icon="log-out-outline" label="Leaving" value={`${item.fromDate}, ${item.fromTime}`} />
          <Row icon="log-in-outline" label="Returning" value={`${item.toDate}, ${item.toTime}`} />
          <Row icon="time-outline" label="Requested" value={item.requestedAt} />
        </Card>

        {/* Reason */}
        <Card>
          <Text style={[type.caption, { color: colors.textFaint, marginBottom: 6 }]}>REASON</Text>
          <Text style={[type.body, { color: colors.text }]}>{item.reason}</Text>
          {item.note ? (
            <View style={{ marginTop: spacing.md }}>
              <Note icon="chatbubble-ellipses-outline" tone="danger" text={item.note} />
            </View>
          ) : null}
        </Card>

        {/* Timeline */}
        <Card>
          <Text style={[type.caption, { color: colors.textFaint, marginBottom: spacing.md }]}>
            APPROVAL TIMELINE
          </Text>
          <Step
            icon="create-outline"
            title={`Submitted by ${item.student}`}
            time={item.requestedAt}
            done
          />
          <Step
            icon="people-outline"
            title="Guardian approval"
            time={item.status === 'pending' ? 'Awaiting response' : (item.approvedBy ?? '—')}
            done={item.status !== 'pending'}
            failed={item.status === 'rejected'}
          />
          <Step
            icon="shield-checkmark-outline"
            title={`${roleLabels.warden} clearance`}
            time={item.status === 'approved' ? 'Cleared' : 'Not started'}
            done={item.status === 'approved'}
            last
          />
        </Card>

        {/* Role-specific actions */}
        {role === 'parent' && item.status === 'pending' ? (
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Button
              label="Reject"
              variant="danger"
              icon="close"
              full={false}
              style={{ flex: 1 }}
              onPress={() => setRejectOpen(true)}
            />
            <Button
              label="Approve"
              variant="success"
              icon="checkmark"
              full={false}
              style={{ flex: 1 }}
            />
          </View>
        ) : null}

        {role === 'student' && item.status === 'pending' ? (
          <Button label="Cancel request" variant="danger" icon="trash-outline" />
        ) : null}

        {role === 'admin' ? (
          <View style={{ gap: spacing.md }}>
            <Button label="Issue gate pass" icon="qr-code-outline" />
            <Button label="Override & reject" variant="danger" icon="hand-left-outline" />
          </View>
        ) : null}

        <PoweredBy />
      </Screen>

      {/* Reject reason sheet */}
      <Modal visible={rejectOpen} transparent animationType="slide">
        <Pressable style={styles.backdrop} onPress={() => setRejectOpen(false)} />
        <GlassPanel intensity={blur.header} strong style={styles.sheet}>
          <View style={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}>
            <View style={styles.grabber} />
            <Text style={[type.h2, { color: colors.text }]}>Reject request?</Text>
            <Text style={[type.small, { color: colors.textMuted }]}>
              {item.student} ({item.rollNo}) is notified along with your reason.
            </Text>
            <View style={{ marginTop: spacing.lg, gap: spacing.lg }}>
              <Field label="Reason" placeholder="Let them know why" multiline />
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  full={false}
                  style={{ flex: 1 }}
                  onPress={() => setRejectOpen(false)}
                />
                <Button
                  label="Confirm reject"
                  variant="danger"
                  full={false}
                  style={{ flex: 1 }}
                  onPress={() => setRejectOpen(false)}
                />
              </View>
            </View>
          </View>
        </GlassPanel>
      </Modal>
    </View>
  );
}

function Step({
  icon,
  title,
  time,
  done,
  failed,
  last,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  time: string;
  done?: boolean;
  failed?: boolean;
  last?: boolean;
}) {
  const tint = failed ? colors.danger : done ? colors.success : colors.textFaint;
  const bg = failed ? colors.dangerBg : done ? colors.successBg : colors.neutralBg;
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md }}>
      <View style={{ alignItems: 'center' }}>
        <View style={[styles.stepIcon, { backgroundColor: bg }]}>
          <Ionicons name={failed ? 'close' : done ? 'checkmark' : icon} size={15} color={tint} />
        </View>
        {!last ? <View style={styles.stepLine} /> : null}
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 0 : spacing.lg }}>
        <Text style={[type.smallMed, { color: colors.text }]}>{title}</Text>
        <Text style={[type.small, { color: colors.textMuted }]}>{time}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
  },
  pass: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    overflow: 'hidden',
    ...shadow.card,
  },
  passInner: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
  qr: {
    backgroundColor: '#fff',
    padding: spacing.lg,
    borderRadius: radius.lg,
    marginVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    overflow: 'hidden',
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
});
