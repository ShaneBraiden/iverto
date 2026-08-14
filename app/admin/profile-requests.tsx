/**
 * Admin — profile change requests raised by students and guardians.
 *
 * Nobody edits their own record, so every correction lands here as a diff.
 * The admin's job is to read the old value against the new one, check the
 * reason (and the attachment if there is one), and apply or decline it.
 *
 * `changes` arrives keyed by field name with `{ old, new }` under each, which
 * is exactly the shape the diff below renders — approving writes the `new`
 * side to the record and notifies the requester.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Linking } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, TopBar } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import {
  Avatar,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  GlassPanel,
  LoadMore,
  Note,
  PoweredBy,
} from '@/components/ui';
import { SkeletonList } from '@/components/Skeleton';
import { Stagger } from '@/components/motion';
import { blur, colors, radius, spacing, type } from '@/theme';
import { PAGE_SIZE } from '@/constants/config';
import { useAdmin } from '@/components/AdminContext';
import { admin as adminApi } from '@/lib/api/endpoints';
import { errorCode, errorMessage, fromPage, usePagedQuery, useMutation } from '@/lib/api/useQuery';
import { useRefetchOnFocus } from '@/lib/useFocusRefetch';
import { attachmentUrl } from '@/lib/attachments';
import { ExportError, shareCsv } from '@/lib/export';
import { timeAgo } from '@/lib/datetime';
import type { ProfileRequest, ProfileRequestStatus } from '@/types';

const FILTERS: { key: ProfileRequestStatus | 'all'; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

export default function AdminProfileRequests() {
  const [status, setStatus] = useState<ProfileRequestStatus | 'all'>('pending');
  const [query, setQuery] = useState('');
  const [needle, setNeedle] = useState('');
  const [declining, setDeclining] = useState<ProfileRequest | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setNeedle(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const list = usePagedQuery(
    (cursor, signal) =>
      adminApi
        .profileRequests({ status, q: needle || undefined, cursor, limit: PAGE_SIZE }, signal)
        .then(fromPage),
    [status, needle]
  );
  useRefetchOnFocus(list.refetch);

  /* The "waiting on you" count comes from the shell, so it stays right while
     the admin is looking at, say, the approved filter — and it is the same
     number the tab badge shows. */
  const { pendingProfiles: waiting, refresh: refreshCounts } = useAdmin();

  const afterDecision = () => {
    setDeclining(null);
    list.refetch();
    refreshCounts();
  };

  const onDecisionError = (err: Error) => {
    if (errorCode(err) === 'PROFILE_REQUEST_ALREADY_REVIEWED') {
      afterDecision();
      Alert.alert('Already reviewed', 'Someone else got to this one first.');
      return;
    }
    Alert.alert("Couldn't apply", errorMessage(err));
  };

  const approve = useMutation((id: string) => adminApi.approveProfileRequest(id), {
    onSuccess: afterDecision,
    onError: onDecisionError,
  });
  const decline = useMutation(
    (id: string, note: string) => adminApi.rejectProfileRequest(id, note),
    { onSuccess: afterDecision, onError: onDecisionError }
  );
  const exportAll = useMutation(
    async () => {
      const csv = await adminApi.exportProfileRequests(status);
      return shareCsv(csv, 'profile-requests');
    },
    {
      onError: (err) =>
        Alert.alert(
          "Couldn't export",
          err instanceof ExportError ? err.message : errorMessage(err)
        ),
    }
  );

  const openAttachment = async (key: string) => {
    try {
      await Linking.openURL(await attachmentUrl(key));
    } catch (err) {
      Alert.alert("Couldn't open the attachment", errorMessage(err));
    }
  };

  const rows = list.data ?? [];
  const busy = approve.pending || decline.pending;

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Profile requests"
        back={false}
        rightIcon={exportAll.pending ? 'hourglass-outline' : 'download-outline'}
        onRight={() => !exportAll.pending && exportAll.mutate()}
      />
      <GlassPanel intensity={blur.bar} style={styles.bar}>
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
          <Field
            placeholder="Search by name or roll number"
            icon="search-outline"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            returnKeyType="search"
            right={
              query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.textFaint} />
                </Pressable>
              ) : null
            }
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
        >
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              selected={f.key === status}
              onPress={() => setStatus(f.key)}
            />
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

        {list.loading ? (
          <SkeletonList count={4} />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : (
          <>
            <Text style={[type.small, { color: colors.textMuted }]}>
              {rows.length}
              {list.hasMore ? '+' : ''} request{rows.length === 1 ? '' : 's'}
            </Text>

            {rows.length === 0 ? (
              <EmptyState
                icon="checkmark-done-outline"
                title="Nothing here"
                message={`No ${status === 'all' ? '' : `${status} `}profile requests to show.`}
              />
            ) : (
              <View style={{ gap: spacing.md }}>
                <Stagger>
                  {rows.map((r) => (
                    <RequestCard
                      key={r.id}
                      request={r}
                      busy={busy}
                      onApprove={() => approve.mutate(r.id)}
                      onDecline={() => setDeclining(r)}
                      onViewAttachment={
                        r.attachmentKey ? () => openAttachment(r.attachmentKey!) : undefined
                      }
                    />
                  ))}
                </Stagger>
              </View>
            )}

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

      <DeclineSheet
        request={declining}
        onClose={() => setDeclining(null)}
        pending={decline.pending}
        error={decline.error}
        onConfirm={(note) => declining && decline.mutate(declining.id, note)}
      />
    </View>
  );
}

function RequestCard({
  request,
  busy,
  onApprove,
  onDecline,
  onViewAttachment,
}: {
  request: ProfileRequest;
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
  onViewAttachment?: () => void;
}) {
  const pending = request.status === 'pending';
  const meta = {
    pending: { fg: colors.warning, bg: colors.warningBg, label: 'PENDING' },
    approved: { fg: colors.success, bg: colors.successBg, label: 'APPLIED' },
    rejected: { fg: colors.danger, bg: colors.dangerBg, label: 'DECLINED' },
  }[request.status];

  const fields = Object.entries(request.changes ?? {});
  const who = request.subject;
  const isStudent = request.subjectType === 'student';

  return (
    <Card>
      <View style={styles.head}>
        <Avatar size={42} icon={isStudent ? 'school-outline' : 'people-outline'} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.bodyMed, { color: colors.text }]} numberOfLines={1}>
            {who?.name ?? request.subjectId}
          </Text>
          <Text style={[type.small, { color: colors.textMuted }]} numberOfLines={1}>
            {[who?.rollNumber ?? who?.phone, timeAgo(request.createdAt)]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: meta.bg }]}>
          <Text style={[type.caption, { color: meta.fg }]} numberOfLines={1}>
            {meta.label}
          </Text>
        </View>
      </View>

      {/* The diff — old value struck through, new value in full weight. */}
      <View style={styles.diffBox}>
        {fields.map(([field, change], i) => (
          <View key={field} style={[styles.diff, i > 0 && styles.diffGap]}>
            <Text style={[type.caption, { color: colors.textFaint }]}>
              {field.replace(/([A-Z])/g, ' $1').toUpperCase()}
            </Text>
            {/* Both halves get `flex: 1` so they split the row evenly. With the
                old value sized to its content and the new one on `flex: 1`, a
                long previous address squeezed the replacement — the one thing
                the admin is here to read — down to nothing. */}
            <View style={styles.diffRow}>
              <Text
                style={[
                  type.small,
                  { color: colors.textFaint, textDecorationLine: 'line-through', flex: 1 },
                ]}
                numberOfLines={2}
              >
                {change.old ?? '—'}
              </Text>
              <Ionicons
                name="arrow-forward"
                size={13}
                color={colors.primary}
                style={{ flexShrink: 0 }}
              />
              <Text style={[type.bodyMed, { color: colors.text, flex: 1 }]} numberOfLines={2}>
                {change.new ?? '—'}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.reasonRow}>
        <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.textMuted} />
        <Text style={[type.small, { color: colors.textMuted, flex: 1 }]}>{request.reason}</Text>
      </View>

      {request.attachmentKey ? (
        <View style={styles.attachRow}>
          <Ionicons name="document-attach-outline" size={14} color={colors.primary} />
          <Text style={[type.small, { color: colors.primary, flex: 1 }]} numberOfLines={2}>
            Supporting document attached
          </Text>
          {onViewAttachment ? (
            <Text
              style={[type.smallMed, { color: colors.primary, flexShrink: 0 }]}
              onPress={onViewAttachment}
            >
              View
            </Text>
          ) : null}
        </View>
      ) : null}

      {pending ? (
        <View style={styles.actions}>
          <Button
            label="Decline"
            variant="danger"
            icon="close"
            full={false}
            disabled={busy}
            style={{ flex: 1 }}
            onPress={onDecline}
          />
          <Button
            label="Apply changes"
            variant="success"
            icon="checkmark"
            full={false}
            disabled={busy}
            style={{ flex: 1 }}
            onPress={onApprove}
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
            {request.status === 'approved' ? 'Applied' : 'Declined'}
            {request.reviewedAt ? ` ${timeAgo(request.reviewedAt)}` : ''}
            {request.reviewNote ? ` — “${request.reviewNote}”` : ''}
          </Text>
        </View>
      )}
    </Card>
  );
}

function DeclineSheet({
  request,
  onClose,
  onConfirm,
  pending,
  error,
}: {
  request: ProfileRequest | null;
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
      title="Decline this change?"
      subtitle={
        request ? `${request.subject?.name ?? 'The requester'} is shown your note.` : undefined
      }
    >
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        <Field
          label="Note"
          placeholder="Why can this not be applied?"
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
            label="Confirm decline"
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

const styles = StyleSheet.create({
  bar: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
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
