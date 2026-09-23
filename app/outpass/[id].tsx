/**
 * Permission detail — shared by all three roles.
 *
 * `role` decides two things: which endpoint the record is read from (each role
 * is scoped to what it may see) and which action bar is shown.
 *
 *   student → cancel, while the state machine still allows it
 *   parent  → approve / reject / pull in the warden
 *   admin   → warden decision when it is theirs to make, closing a live pass
 *             once the student is back, otherwise override
 *
 * The timeline is not assembled here: `timeline` comes back rendered by the
 * server, one step per stage with its own state, so the app never has to
 * reason about which of fifteen statuses means "the guardian has seen it".
 *
 * There is no QR gate pass. That endpoint is deliberately not implemented —
 * a verifiable pass token needs its own signing and expiry design — so the app
 * does not draw a scannable code it cannot back up.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Share, Alert, Linking } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import {
  Avatar,
  Button,
  Card,
  Chip,
  ErrorState,
  Field,
  Note,
  PoweredBy,
  Row,
  StatusPill,
} from '@/components/ui';
import { SkeletonDetail } from '@/components/Skeleton';
import { colors, radius, spacing, type } from '@/theme';
import { CONTACT_WARDEN_NOTE } from '@/constants/config';
import {
  admin as adminApi,
  parent as parentApi,
  permissions as permissionApi,
  warden as wardenApi,
} from '@/lib/api/endpoints';
import { errorCode, errorMessage, errorStatus, useMutation, useQuery } from '@/lib/api/useQuery';
import { attachmentUrl } from '@/lib/attachments';
import {
  isCancellable,
  isEndable,
  isOverdue,
  needsGuardian,
  needsWarden,
  overdueMinutes,
  OVERRIDE_STATUSES,
  shortId,
  statusInfo,
} from '@/lib/status';
import { formatMinutes, isoToDateTime, isoToTime, timeAgo } from '@/lib/datetime';
import type { PermissionStatus, TimelineStep } from '@/types';

type Role = 'student' | 'parent' | 'admin';

export default function OutpassDetail() {
  const { id, role: roleParam } = useLocalSearchParams<{ id: string; role?: string }>();
  const role: Role =
    roleParam === 'parent' ? 'parent' : roleParam === 'admin' ? 'admin' : 'student';

  const [noteOpen, setNoteOpen] = useState<'reject' | 'override' | 'end' | null>(null);
  const [note, setNote] = useState('');
  const [overrideTo, setOverrideTo] = useState<PermissionStatus>('rejected_warden');

  const read = React.useCallback(
    (signal: AbortSignal) => {
      if (role === 'parent') return parentApi.permission(id!, signal);
      if (role === 'admin') return adminApi.permission(id!, signal);
      return permissionApi.get(id!, signal);
    },
    [id, role]
  );

  const { data: item, loading, error, refetch } = useQuery(read, [id, role], { enabled: !!id });

  const done = (message?: string) => {
    refetch();
    setNoteOpen(null);
    setNote('');
    if (message) Alert.alert('Recorded', message);
  };

  const onError = (err: Error) => {
    if (errorCode(err) === 'PERMISSION_ALREADY_DECIDED') {
      done();
      Alert.alert('Already decided', 'Someone has already responded to this request.');
      return;
    }
    if (errorCode(err) === 'TOO_MANY_REQUESTS') {
      Alert.alert('Slow down a moment', 'Give it five seconds and try again.');
      return;
    }
    Alert.alert("Couldn't do that", errorMessage(err));
  };

  /* Guardian */
  const approve = useMutation(() => parentApi.decide(id!, 'approve', undefined, item?.version), {
    onSuccess: () => done('The student and the warden have been told.'),
    onError,
  });
  const reject = useMutation(
    (reason: string) => parentApi.decide(id!, 'reject', reason, item?.version),
    {
      onSuccess: () => done('The student has been told, along with your reason.'),
      onError,
    }
  );
  /* The note is what the warden's alert is written from, so it is always sent —
     see CONTACT_WARDEN_NOTE. */
  const contactWarden = useMutation(
    () => parentApi.decide(id!, 'contact_warden', CONTACT_WARDEN_NOTE, item?.version),
    {
      onSuccess: () => done('The warden has been alerted and will call you.'),
      onError,
    }
  );

  /* Student */
  const cancel = useMutation(() => permissionApi.cancel(id!), {
    onSuccess: () => router.back(),
    onError,
  });

  /* Warden / admin */
  const wardenApprove = useMutation(
    () => wardenApi.decide(id!, 'approve', undefined, item?.version),
    {
      onSuccess: () => done('Cleared. The guardian has been asked to approve.'),
      onError,
    }
  );
  const activate = useMutation(() => wardenApi.activate(id!, item?.version), {
    onSuccess: () => done('The pass is now active.'),
    onError,
  });
  /* Closing a live pass. The note is optional and only worth asking for when
     the student is already late, because that is the case where it becomes the
     reason on the guardian's late-entry log rather than a comment nobody
     reads. The server decides whether a late entry is written — the app never
     asserts "this was late", it just reports what came back. */
  const endPass = useMutation((reason?: string) => wardenApi.endPass(id!, reason), {
    onSuccess: (closed) =>
      done(
        closed.lateEntry
          ? 'Pass closed. The late return is on the record and the guardians have been told.'
          : 'Pass closed. They are marked back on campus.'
      ),
    onError: (err) => {
      /* Feature detection, the same way `auth.refresh` and the geofence routes
         do it: a 404 here is "this deployment has not shipped the route yet",
         not "no such pass", and the generic copy for 404 — "that record isn't
         there any more" — would send a warden looking for a pass that is
         plainly on the screen in front of them. Override is the way through
         until it lands. */
      if (errorStatus(err) === 404) {
        setNoteOpen(null);
        Alert.alert(
          'Not available on this campus yet',
          'This server has not enabled closing a pass from the app. Use “Override status” → “Mark completed” until it does.'
        );
        return;
      }
      /* Somebody else — the gate scanner, another warden — already closed it. */
      if (errorCode(err) === 'PERMISSION_NOT_ACTIVE') {
        done();
        Alert.alert('Already closed', errorMessage(err));
        return;
      }
      onError(err);
    },
  });
  /* An escalated request is one the guardian never answered in-app. The warden
     rings them, and this is where that answer gets recorded against the pass. */
  const resolveEscalated = useMutation(
    (response: 'approve' | 'reject') =>
      wardenApi.resolveEscalated(
        id!,
        response,
        'Guardian responded out of band.',
        item?.version
      ),
    { onSuccess: () => done("The guardian's answer is on the record."), onError }
  );
  const override = useMutation(
    (status: PermissionStatus, reason: string) =>
      adminApi.override(id!, status, reason, item?.version),
    { onSuccess: () => done('The override is on the audit log.'), onError }
  );

  const busy =
    approve.pending ||
    reject.pending ||
    contactWarden.pending ||
    cancel.pending ||
    wardenApprove.pending ||
    activate.pending ||
    endPass.pending ||
    resolveEscalated.pending ||
    override.pending;

  if (loading || !item) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Request" />
        <Screen clearTabBar={false}>
          {error ? (
            <ErrorState error={error} onRetry={refetch} />
          ) : (
            <SkeletonDetail />
          )}
        </Screen>
      </View>
    );
  }

  const meta = statusInfo(item.status);

  /* Worked out on render rather than held in a ticking timer: the screen
     re-renders on focus and after every action, and "2h 15m late" does not
     need to be right to the second. */
  const late = isOverdue(item);
  const lateBy = overdueMinutes(item);

  /* Same fact, three readers, three different next steps — and "the warden has
     been alerted" is a strange thing to tell the warden. */
  const overdueText = `Overdue by ${formatMinutes(lateBy)}. The pass ended at ${isoToTime(item.endTime)} and there is no record of them back on campus. ${
    role === 'admin'
      ? 'The guardians have been alerted. Close the pass once they are in.'
      : role === 'parent'
        ? 'The warden has been alerted.'
        : 'Your warden and your guardians have been told — check in at the hostel office.'
  }`;

  const share = () =>
    Share.share({
      message: [
        `${shortId(item.id)} · ${item.type}`,
        item.reason,
        `${isoToDateTime(item.startTime ?? item.startDate)} → ${isoToDateTime(item.endTime)}`,
        item.destination,
        `Status: ${meta.label}`,
      ]
        .filter(Boolean)
        .join('\n'),
    }).catch(() => {});

  const openDoc = async (key: string) => {
    try {
      await Linking.openURL(await attachmentUrl(key));
    } catch (err) {
      Alert.alert("Couldn't open the document", errorMessage(err));
    }
  };

  const confirmNote = () => {
    const value = note.trim();
    /* The only one of the three that goes through without a note. */
    if (noteOpen === 'end') return endPass.mutate(value || undefined);
    if (!value) return;
    if (noteOpen === 'override') override.mutate(overrideTo, value);
    else reject.mutate(value);
  };

  /* One sheet, three jobs — so the copy for each lives in one place instead of
     as a run of ternaries down the markup. */
  const sheetCopy =
    noteOpen === 'override'
      ? {
          title: 'Override this request?',
          subtitle:
            'Pick the state to force it into. This is recorded against your account.',
          fieldLabel: 'Why?',
          placeholder: 'Overridden after gate check',
          confirm: 'Confirm override',
          variant: 'danger' as const,
          noteRequired: true,
        }
      : noteOpen === 'end'
        ? {
            title: late ? 'Close this pass as a late return?' : 'Close this pass?',
            subtitle: late
              ? `${item.student?.name ?? 'The student'} is ${formatMinutes(lateBy)} past the ${isoToTime(item.endTime)} return time. Closing it now logs a late return that their guardians can see.`
              : `Marks ${item.student?.name ?? 'the student'} back on campus and closes the pass. The student and their guardians are told.`,
            fieldLabel: late ? 'Reason for the delay (optional)' : 'Note (optional)',
            placeholder: late ? 'Train was delayed' : 'Seen back at the gate',
            confirm: 'Mark returned',
            variant: 'success' as const,
            noteRequired: false,
          }
        : {
            title: 'Reject request?',
            subtitle: `${item.student?.name ?? 'The student'} is notified along with your reason.`,
            fieldLabel: 'Reason',
            placeholder: 'Let them know why',
            confirm: 'Confirm reject',
            variant: 'danger' as const,
            noteRequired: true,
          };

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title={shortId(item.id)}
        subtitle={item.type}
        rightIcon="share-outline"
        onRight={share}
      />
      <Screen clearTabBar={false}>
        {/* Status banner — the label and the one-line explanation of it. */}
        <View style={[styles.banner, { backgroundColor: meta.bg }]}>
          <Ionicons
            name={meta.icon as never}
            size={22}
            color={meta.fg}
            style={{ flexShrink: 0, marginTop: 1 }}
          />
          {/* The explainer is a full sentence and is allowed to run to as many
              lines as it needs — it is the one thing on the screen that says
              what happens next. */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.bodyMed, { color: meta.fg }]}>{meta.label}</Text>
            <Text style={[type.small, { color: colors.textMuted }]}>{meta.explainer}</Text>
          </View>
        </View>

        {/* Overdue outranks the status banner's own explainer: "The pass is
            live right now" is true and beside the point once the return time
            has gone by. Shown to every role — the student and the guardian are
            told the same thing the warden is. */}
        {late ? (
          <Note
            icon="alert-circle-outline"
            tone="danger"
            text={overdueText}
          />
        ) : null}

        {/* Requester block */}
        {item.student ? (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Avatar size={46} icon="school-outline" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.bodyMed, { color: colors.text }]} numberOfLines={2}>
                  {item.student.name}
                </Text>
                <Text style={[type.small, { color: colors.textMuted }]} numberOfLines={1}>
                  {[item.student.rollNumber, item.student.roomNumber].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <StatusPill status={item.status} small />
            </View>
          </Card>
        ) : null}

        {/* Trip block */}
        <Card>
          <Text style={[type.caption, { color: colors.textFaint, marginBottom: spacing.sm }]}>
            TRIP DETAILS
          </Text>
          <Row icon="pricetag-outline" label="Category" value={item.type} />
          <Row icon="location-outline" label="Destination" value={item.destination ?? '—'} />
          <Row
            icon="log-out-outline"
            label="Leaving"
            value={isoToDateTime(item.startTime ?? item.startDate)}
          />
          <Row icon="log-in-outline" label="Returning" value={isoToDateTime(item.endTime)} />
          {item.emergencyContact ? (
            <Row icon="call-outline" label="Contact" value={item.emergencyContact} />
          ) : null}
          <Row icon="time-outline" label="Requested" value={timeAgo(item.createdAt)} />
          {item.exitTime ? (
            <Row icon="exit-outline" label="Scanned out" value={isoToDateTime(item.exitTime)} />
          ) : null}
          {/* A gate scan and a warden closing the pass by hand both write
              `returnTime`; only `closedBy` says which, and "scanned in" on a
              pass nobody scanned is the kind of small lie that costs an
              argument later. */}
          {item.returnTime ? (
            <Row
              icon="enter-outline"
              label={item.closedBy ? 'Marked returned' : 'Scanned in'}
              value={isoToDateTime(item.returnTime)}
            />
          ) : null}
        </Card>

        {/* Reason, plus whatever note closed it */}
        <Card>
          <Text style={[type.caption, { color: colors.textFaint, marginBottom: 6 }]}>REASON</Text>
          <Text style={[type.body, { color: colors.text }]}>{item.reason}</Text>

          {item.parentNote ? (
            <View style={{ marginTop: spacing.md }}>
              <Note
                icon="people-outline"
                tone={item.status === 'rejected_parent' ? 'danger' : 'info'}
                text={`Guardian: “${item.parentNote}”`}
              />
            </View>
          ) : null}
          {item.wardenNote ? (
            <View style={{ marginTop: spacing.sm }}>
              <Note
                icon="shield-checkmark-outline"
                tone={item.status === 'rejected_warden' ? 'danger' : 'info'}
                text={`Warden: “${item.wardenNote}”`}
              />
            </View>
          ) : null}
          {item.closedNote ? (
            <View style={{ marginTop: spacing.sm }}>
              <Note
                icon="log-in-outline"
                tone="success"
                text={`On return: “${item.closedNote}”`}
              />
            </View>
          ) : null}

          {/* Supporting documents open through a freshly signed read URL. */}
          {item.supportingDocKeys?.length ? (
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {item.supportingDocKeys.map((key, i) => (
                <Text
                  key={key}
                  style={[type.smallMed, { color: colors.primary }]}
                  onPress={() => openDoc(key)}
                >
                  View supporting document {item.supportingDocKeys!.length > 1 ? i + 1 : ''}
                </Text>
              ))}
            </View>
          ) : null}
        </Card>

        {/* Timeline — rendered by the server, drawn here. */}
        <Card>
          <Text style={[type.caption, { color: colors.textFaint, marginBottom: spacing.md }]}>
            APPROVAL TIMELINE
          </Text>
          {(item.timeline ?? []).map((step, i, all) => (
            <Step key={step.key} step={step} last={i === all.length - 1} />
          ))}
          {item.decidedBy ? (
            <Text style={[type.small, { color: colors.textMuted, marginTop: spacing.sm }]}>
              Closed by the {item.decidedBy.role} {timeAgo(item.decidedBy.at)}
              {item.decidedBy.note ? ` — “${item.decidedBy.note}”` : ''}
            </Text>
          ) : null}
        </Card>

        {/* ---------------------------------------------------- Actions */}

        {role === 'parent' && needsGuardian(item.status) ? (
          <View style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Button
                label="Reject"
                variant="danger"
                icon="close"
                full={false}
                disabled={busy}
                style={{ flex: 1 }}
                onPress={() => setNoteOpen('reject')}
              />
              <Button
                label="Approve"
                variant="success"
                icon="checkmark"
                full={false}
                loading={approve.pending}
                disabled={busy}
                style={{ flex: 1 }}
                onPress={() => approve.mutate()}
              />
            </View>
            <Button
              label="Talk to the warden first"
              variant="secondary"
              icon="call-outline"
              loading={contactWarden.pending}
              disabled={busy}
              onPress={() => contactWarden.mutate()}
            />
          </View>
        ) : null}

        {role === 'student' ? (
          isCancellable(item.status) ? (
            <Button
              label="Cancel request"
              variant="danger"
              icon="trash-outline"
              loading={cancel.pending}
              disabled={busy}
              onPress={() =>
                Alert.alert('Cancel this request?', 'It cannot be un-cancelled.', [
                  { text: 'Keep it', style: 'cancel' },
                  { text: 'Cancel request', style: 'destructive', onPress: () => cancel.mutate() },
                ])
              }
            />
          ) : null
        ) : null}

        {role === 'admin' ? (
          <View style={{ gap: spacing.md }}>
            {/* The warden's own decision, offered only when it is actually
                this request's next step. */}
            {needsWarden(item.status) ? (
              <Button
                label="Clear for guardian approval"
                icon="checkmark-done-outline"
                loading={wardenApprove.pending}
                disabled={busy}
                onPress={() => wardenApprove.mutate()}
              />
            ) : null}
            {item.status === 'parent_approved' ? (
              <Button
                label="Activate pass"
                icon="walk-outline"
                loading={activate.pending}
                disabled={busy}
                onPress={() => activate.mutate()}
              />
            ) : null}

            {/* Closing the pass is the warden's half of the late-return rule:
                a pass still open past its return time is what the server's
                sweep alerts on, so this is the action that stops the alert
                going out — and, once it has, the one that ends it. */}
            {isEndable(item.status) ? (
              <Button
                label={late ? 'Close pass — they are back' : 'End pass — student returned'}
                variant="success"
                icon="log-in-outline"
                loading={endPass.pending}
                disabled={busy}
                onPress={() => setNoteOpen('end')}
              />
            ) : null}

            {/* Escalated: the guardian never answered in the app, so the only
                way forward is for somebody to ring them and log the answer. */}
            {item.status === 'escalated' || item.status === 'contact_parent' ? (
              <>
                <Note
                  icon="call-outline"
                  tone="warning"
                  text="The guardian has not responded in the app. Call them, then record what they said — it is logged against this pass as their decision."
                />
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  <Button
                    label="They refused"
                    variant="danger"
                    icon="close"
                    full={false}
                    disabled={busy}
                    style={{ flex: 1 }}
                    onPress={() => resolveEscalated.mutate('reject')}
                  />
                  <Button
                    label="They agreed"
                    variant="success"
                    icon="checkmark"
                    full={false}
                    loading={resolveEscalated.pending}
                    disabled={busy}
                    style={{ flex: 1 }}
                    onPress={() => resolveEscalated.mutate('approve')}
                  />
                </View>
              </>
            ) : null}
            <Button
              label="Override status"
              variant="danger"
              icon="hand-left-outline"
              disabled={busy}
              onPress={() => setNoteOpen('override')}
            />
            <Text style={[type.small, { color: colors.textFaint, textAlign: 'center' }]}>
              An override bypasses the approval chain and is written to the audit log.
            </Text>
          </View>
        ) : null}

        <PoweredBy />
      </Screen>

      {/* Rejecting, overriding and closing a pass all carry a note, so they
          share one sheet — see `sheetCopy` for what each says. */}
      <Sheet
        visible={noteOpen !== null}
        onClose={() => setNoteOpen(null)}
        title={sheetCopy.title}
        subtitle={sheetCopy.subtitle}
      >
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
          {noteOpen === 'override' ? (
            <View style={styles.chips}>
              {OVERRIDE_STATUSES.map((s) => (
                <Chip
                  key={s.value}
                  label={s.label}
                  selected={s.value === overrideTo}
                  onPress={() => setOverrideTo(s.value)}
                />
              ))}
            </View>
          ) : null}

          <Field
            label={sheetCopy.fieldLabel}
            placeholder={sheetCopy.placeholder}
            multiline
            value={note}
            onChangeText={setNote}
          />

          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Button
              label="Cancel"
              variant="secondary"
              full={false}
              style={{ flex: 1 }}
              onPress={() => setNoteOpen(null)}
            />
            <Button
              label={sheetCopy.confirm}
              variant={sheetCopy.variant}
              full={false}
              style={{ flex: 1.2 }}
              loading={reject.pending || override.pending || endPass.pending}
              disabled={(sheetCopy.noteRequired && note.trim().length === 0) || busy}
              onPress={confirmNote}
            />
          </View>
        </View>
      </Sheet>
    </View>
  );
}

/** One row of the server-rendered timeline. */
function Step({ step, last }: { step: TimelineStep; last: boolean }) {
  const tone = {
    done: { fg: colors.success, bg: colors.successBg, icon: 'checkmark' },
    current: { fg: colors.warning, bg: colors.warningBg, icon: 'ellipse' },
    pending: { fg: colors.textFaint, bg: colors.neutralBg, icon: 'ellipse-outline' },
    rejected: { fg: colors.danger, bg: colors.dangerBg, icon: 'close' },
    skipped: { fg: colors.textFaint, bg: colors.neutralBg, icon: 'remove' },
  }[step.state] ?? { fg: colors.textFaint, bg: colors.neutralBg, icon: 'ellipse-outline' };

  const detail =
    [step.by, step.at ? timeAgo(step.at) : null].filter(Boolean).join(' · ') ||
    (step.state === 'current' ? 'In progress' : step.state === 'pending' ? 'Not started' : '—');

  return (
    <View style={{ flexDirection: 'row', gap: spacing.md }}>
      <View style={{ alignItems: 'center' }}>
        <View style={[styles.stepIcon, { backgroundColor: tone.bg }]}>
          <Ionicons name={tone.icon as never} size={15} color={tone.fg} />
        </View>
        {!last ? <View style={styles.stepLine} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : spacing.lg }}>
        <Text style={[type.smallMed, { color: colors.text }]}>{step.label}</Text>
        <Text style={[type.small, { color: colors.textMuted }]}>{detail}</Text>
        {step.note ? (
          <Text style={[type.small, { color: colors.textFaint, marginTop: 2 }]}>
            “{step.note}”
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
  },
  stepIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
