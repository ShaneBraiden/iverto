/**
 * Guardian home — requests awaiting a decision, with inline approve/reject.
 *
 * SIBLINGS: a guardian with more than one child on campus sees one ward at a
 * time. The only sign of that is a caret on the name in the header — tap it,
 * pick a sibling, and the queue below re-filters. A guardian with a single ward
 * gets no caret and no switcher at all.
 *
 * All three decisions go to the same endpoint, `POST /parent/permissions/:id/
 * decision`, with `approve`, `reject` or `contact_warden`. That endpoint is
 * deliberately forgiving in one direction and strict in the other: repeating
 * the *same* decision is a 200 (the guardian may also have tapped the WhatsApp
 * button), while the *opposite* decision after one is recorded is a 409. Both
 * are handled here rather than surfaced as raw errors.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { AppHeader, Screen } from '@/components/Screen';
import { useWard } from '@/components/WardContext';
import { WardSwitcher } from '@/components/WardSwitcher';
import { useApp, useLivePermissions } from '@/components/AppContext';
import { Sheet } from '@/components/Sheet';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Loader,
  Note,
  PoweredBy,
  SectionHeader,
  StatusPill,
} from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import { parent as parentApi } from '@/lib/api/endpoints';
import { errorCode, errorMessage, useMutation } from '@/lib/api/useQuery';
import { useRefetchOnFocus } from '@/lib/useFocusRefetch';
import { shortId } from '@/lib/status';
import { isoToDateTime, timeAgo } from '@/lib/datetime';
import { useAuth } from '@/lib/auth';
import type { Permission } from '@/types';

export default function ParentHome() {
  const { me, user } = useAuth();
  const { ward, wards, loading, error, refresh, selectWard, hasSiblings, pendingFor, pendingElsewhere } =
    useWard();
  const { unread } = useApp();
  const [switching, setSwitching] = useState(false);
  const [rejecting, setRejecting] = useState<Permission | null>(null);

  /* A decision taken on the detail screen — or by the other guardian, or over
     WhatsApp — has to land here too. */
  useRefetchOnFocus(refresh);
  useLivePermissions(refresh);

  const mine = ward ? pendingFor(ward.id) : [];
  const elsewhere = ward ? pendingElsewhere(ward.id) : 0;

  /* The guardian's own name comes off their ParentContact row. */
  const relation =
    me?.parentContacts?.find((c) => c.isYou)?.relationship ?? user?.displayName ?? 'Guardian';

  const decided = (message: string) => {
    refresh();
    setRejecting(null);
    Alert.alert('Recorded', message);
  };

  const onDecisionError = (err: Error) => {
    if (errorCode(err) === 'PERMISSION_ALREADY_DECIDED') {
      refresh();
      setRejecting(null);
      Alert.alert(
        'Already decided',
        'Someone has already responded to this request — it may have been the other guardian, or your WhatsApp reply.'
      );
      return;
    }
    if (errorCode(err) === 'TOO_MANY_REQUESTS') {
      Alert.alert('Slow down a moment', 'Give it five seconds and try again.');
      return;
    }
    Alert.alert("Couldn't record that", errorMessage(err));
  };

  const approve = useMutation((id: string) => parentApi.decide(id, 'approve'), {
    onSuccess: () => decided('The student and the warden have been told.'),
    onError: onDecisionError,
  });

  const reject = useMutation((id: string, note: string) => parentApi.decide(id, 'reject', note), {
    onSuccess: () => decided('The student has been told, along with your reason.'),
    onError: onDecisionError,
  });

  /* Not a decision — it pulls the warden in when a guardian would rather talk
     to somebody than approve or refuse on the spot. */
  const contactWarden = useMutation((id: string) => parentApi.decide(id, 'contact_warden'), {
    onSuccess: () => decided('The warden has been alerted and will call you.'),
    onError: onDecisionError,
  });

  const busy = approve.pending || reject.pending || contactWarden.pending;

  return (
    <View style={{ flex: 1 }}>
      <AppHeader
        greeting="Signed in as"
        title={relation}
        meta={ward ? 'Guardian of' : 'Guardian'}
        metaAction={ward?.name}
        onMetaPress={hasSiblings ? () => setSwitching(true) : undefined}
        icon="people-outline"
        badgeCount={unread || undefined}
        onBell={() => router.push('/notifications')}
      />

      <Screen>
        {loading ? (
          <Loader label="Loading your wards…" />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={refresh} />
        ) : !ward ? (
          <EmptyState
            icon="people-outline"
            title="No wards on record"
            message="This account has no students linked to it yet. The campus office can add them."
          />
        ) : (
          <>
            {mine.length ? (
              <Note
                icon="alert-circle-outline"
                tone="warning"
                text={`${mine.length} request${mine.length === 1 ? '' : 's'} need your approval. ${ward.name} can't leave campus until you respond.`}
              />
            ) : null}

            {/* A sibling's request would otherwise sit unseen behind the switch,
                so it gets called out — with a pointer at where the switch is. */}
            {hasSiblings && elsewhere > 0 ? (
              <Note
                icon="people-outline"
                tone="brand"
                text={`${elsewhere} more request${elsewhere === 1 ? '' : 's'} waiting under your other ward${elsewhere === 1 ? '' : 's'} — tap the name above to switch.`}
              />
            ) : null}

            <View>
              <SectionHeader title="Awaiting your decision" />
              {mine.length === 0 ? (
                <EmptyState
                  icon="checkmark-done-outline"
                  title="All caught up"
                  message={`Nothing is waiting on you for ${ward.name} right now.`}
                />
              ) : (
                <View style={{ gap: spacing.md }}>
                  {mine.map((p) => (
                    <ApprovalCard
                      key={p.id}
                      item={p}
                      busy={busy}
                      onApprove={() => approve.mutate(p.id)}
                      onReject={() => setRejecting(p)}
                      onContactWarden={() =>
                        Alert.alert(
                          'Talk to the warden?',
                          'The warden is alerted that you want to discuss this request before deciding.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Alert warden', onPress: () => contactWarden.mutate(p.id) },
                          ]
                        )
                      }
                    />
                  ))}
                </View>
              )}
            </View>
          </>
        )}

        <PoweredBy />
      </Screen>

      <WardSwitcher
        visible={switching}
        onClose={() => setSwitching(false)}
        wards={wards}
        activeId={ward?.id ?? ''}
        onSelect={selectWard}
        pendingFor={pendingFor}
      />

      <RejectSheet
        request={rejecting}
        onClose={() => setRejecting(null)}
        pending={reject.pending}
        error={reject.error}
        onConfirm={(note) => rejecting && reject.mutate(rejecting.id, note)}
      />
    </View>
  );
}

function ApprovalCard({
  item,
  busy,
  onApprove,
  onReject,
  onContactWarden,
}: {
  item: Permission;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onContactWarden: () => void;
}) {
  return (
    <Card>
      <View style={styles.top}>
        <Avatar size={42} icon="school-outline" />
        <View style={{ flex: 1 }}>
          <Text style={[type.bodyMed, { color: colors.text }]}>{item.student?.name ?? '—'}</Text>
          <Text style={[type.small, { color: colors.textMuted }]}>
            {item.student?.rollNumber} · asked {timeAgo(item.createdAt)}
          </Text>
        </View>
        <StatusPill status={item.status} small />
      </View>

      <View style={styles.reasonBox}>
        <Text style={[type.caption, { color: colors.primary }]}>
          {shortId(item.id)} · {item.type.toUpperCase()}
        </Text>
        <Text style={[type.bodyMed, { color: colors.text, marginTop: 2 }]}>{item.reason}</Text>
      </View>

      <View style={{ gap: 4, marginTop: spacing.md }}>
        <Line
          icon="log-out-outline"
          text={`Leaves ${isoToDateTime(item.startTime ?? item.startDate)}`}
        />
        <Line icon="log-in-outline" text={`Returns ${isoToDateTime(item.endTime)}`} />
        {item.destination ? <Line icon="location-outline" text={item.destination} /> : null}
        {item.emergencyContact ? (
          <Line icon="call-outline" text={`Reachable on ${item.emergencyContact}`} />
        ) : null}
        {item.supportingDocKeys?.length ? (
          <Line
            icon="document-attach-outline"
            text={`${item.supportingDocKeys.length} supporting document${item.supportingDocKeys.length === 1 ? '' : 's'} attached`}
          />
        ) : null}
      </View>

      <View style={styles.actions}>
        <Button
          label="Reject"
          variant="danger"
          icon="close"
          full={false}
          disabled={busy}
          style={{ flex: 1 }}
          onPress={onReject}
        />
        <Button
          label="Approve"
          variant="success"
          icon="checkmark"
          full={false}
          disabled={busy}
          style={{ flex: 1 }}
          onPress={onApprove}
        />
      </View>

      <View style={styles.linkRow}>
        <Text
          style={[type.small, { color: colors.primary }]}
          onPress={() => router.push(`/outpass/${item.id}?role=parent`)}
        >
          View full details
        </Text>
        <Text style={[type.small, { color: colors.textFaint }]}>·</Text>
        <Text style={[type.small, { color: colors.primary }]} onPress={onContactWarden}>
          Talk to the warden first
        </Text>
      </View>
    </Card>
  );
}

/** Rejecting always carries a reason — the student is shown it verbatim. */
function RejectSheet({
  request,
  onClose,
  onConfirm,
  pending,
  error,
}: {
  request: Permission | null;
  onClose: () => void;
  onConfirm: (note: string) => void;
  pending: boolean;
  error: Error | null;
}) {
  const [note, setNote] = useState('');

  return (
    <Sheet
      visible={!!request}
      onClose={onClose}
      title="Reject request?"
      subtitle={
        request
          ? `${request.student?.name ?? 'The student'} is notified along with your reason.`
          : ''
      }
    >
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        <Field
          label="Reason"
          placeholder="Let them know why"
          multiline
          value={note}
          onChangeText={setNote}
        />
        {error ? (
          <Note icon="alert-circle-outline" tone="danger" text={errorMessage(error)} />
        ) : null}
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button
            label="Cancel"
            variant="secondary"
            full={false}
            style={{ flex: 1 }}
            onPress={onClose}
          />
          <Button
            label="Confirm reject"
            variant="danger"
            full={false}
            style={{ flex: 1 }}
            loading={pending}
            disabled={note.trim().length === 0 || pending}
            onPress={() => onConfirm(note.trim())}
          />
        </View>
      </View>
    </Sheet>
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
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
