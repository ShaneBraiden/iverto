/**
 * Profile update request — raised by a student or a guardian, applied by the
 * admin.
 *
 * Neither role can edit their own record directly, so this screen is a diff
 * builder: tick the fields to change, type the new value beside the current
 * one, say why, attach proof if there is any.
 *
 * Everything on it is server-driven. `GET /profile-requests/fields` decides
 * which fields may be changed *and* carries the current value of each, so the
 * screen never has to guess what is on record — and it resolves the subject
 * from the signed-in account, which is why this route takes no parameters.
 *
 * The same call returns `pendingRequest`, because only one may be open at a
 * time; when there is one, this screen shows it instead of a blank form.
 */
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '@/components/Screen';
import { KeyboardAwareScroll, useKeyboardVisible } from '@/components/KeyboardAware';
import {
  Button,
  Card,
  Checkbox,
  ErrorState,
  Field,
  Loader,
  Note,
  PoweredBy,
} from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import { DEFAULT_FIELD_ICON, FIELD_ICONS } from '@/constants/config';
import { profileRequests as profileRequestApi } from '@/lib/api/endpoints';
import { errorCode, errorMessage, useMutation, useQuery } from '@/lib/api/useQuery';
import { AttachmentError, pickAndUpload, type PickedFile } from '@/lib/attachments';
import { timeAgo } from '@/lib/datetime';
import type { EditableField } from '@/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** `tel` → phone pad, `email` → email keyboard. */
function keyboardFor(field: EditableField) {
  if (field.type === 'tel') return 'phone-pad' as const;
  if (field.type === 'email') return 'email-address' as const;
  return 'default' as const;
}

export default function ProfileRequestScreen() {
  const keyboardUp = useKeyboardVisible();
  const reasonRef = useRef<TextInput>(null);

  const fieldsQuery = useQuery((signal) => profileRequestApi.fields(signal), []);
  const fields = useMemo(() => fieldsQuery.data?.fields ?? [], [fieldsQuery.data]);
  const pending = fieldsQuery.data?.pendingRequest ?? null;

  /** Which fields the user has opened for editing, and what they typed. */
  const [selected, setSelected] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');

  const [attachmentKey, setAttachmentKey] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<PickedFile | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  /**
   * Only fields that are ticked, filled in, *and* actually different count.
   * The server rejects a no-op change outright, so filtering here means the
   * button is honest about what will be submitted.
   */
  const changed = selected.filter((key) => {
    const next = (values[key] ?? '').trim();
    if (!next) return false;
    const current = fields.find((f) => f.field === key)?.currentValue ?? '';
    return next !== current;
  });

  const submit = useMutation(
    () =>
      profileRequestApi.create({
        changes: Object.fromEntries(changed.map((key) => [key, values[key].trim()])),
        reason: reason.trim(),
        attachmentKey: attachmentKey ?? undefined,
      }),
    { onSuccess: () => router.back() }
  );

  const attach = async () => {
    if (attachment) {
      setAttachment(null);
      setAttachmentKey(null);
      setAttachError(null);
      return;
    }
    setAttaching(true);
    setAttachError(null);
    try {
      const picked = await pickAndUpload('profile-request');
      if (picked) {
        setAttachmentKey(picked.upload.key);
        setAttachment(picked.file);
      }
    } catch (err) {
      setAttachError(
        err instanceof AttachmentError
          ? err.message
          : errorMessage(err, "Couldn't upload that file.")
      );
    } finally {
      setAttaching(false);
    }
  };

  const subject = fieldsQuery.data?.subjectType === 'parent' ? 'Guardian record' : 'Student record';

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Request an update" subtitle={fieldsQuery.data ? subject : undefined} />
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        <KeyboardAwareScroll
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
          extraBottomSpace={96}
        >
          {fieldsQuery.loading ? (
            <Loader label="Loading what you can change…" />
          ) : fieldsQuery.error ? (
            <ErrorState
              message={errorMessage(fieldsQuery.error)}
              onRetry={fieldsQuery.refetch}
            />
          ) : pending ? (
            /* One open request at a time — showing the form here would only
               earn a 409 on submit. */
            <>
              <Note
                icon="time-outline"
                tone="warning"
                text="You already have a change request waiting for the admin. Only one can be open at a time."
              />
              <Card>
                <Text style={[type.caption, { color: colors.primary }]}>
                  SUBMITTED {timeAgo(pending.createdAt).toUpperCase()}
                </Text>
                <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                  {Object.entries(pending.changes ?? {}).map(([field, change]) => (
                    <View key={field} style={styles.summaryRow}>
                      <Text style={[type.small, { color: colors.textMuted, width: 110 }]}>
                        {fields.find((f) => f.field === field)?.label ?? field}
                      </Text>
                      <Text
                        style={[
                          type.small,
                          { color: colors.textFaint, textDecorationLine: 'line-through' },
                        ]}
                        numberOfLines={1}
                      >
                        {change.old ?? '—'}
                      </Text>
                      <Ionicons name="arrow-forward" size={12} color={colors.primary} />
                      <Text
                        style={[type.smallMed, { color: colors.text, flex: 1 }]}
                        numberOfLines={1}
                      >
                        {change.new ?? '—'}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={[type.small, { color: colors.textMuted, marginTop: spacing.md }]}>
                  “{pending.reason}”
                </Text>
              </Card>
              <Button label="Back" variant="secondary" onPress={() => router.back()} />
            </>
          ) : (
            <>
              <Note
                icon="shield-checkmark-outline"
                tone="brand"
                text="Your record is maintained by the campus office. Pick what needs changing and the admin will review it — usually within a working day."
              />

              <View>
                <Text style={[type.h3, { color: colors.text, marginBottom: spacing.md }]}>
                  What needs changing?
                </Text>

                <View style={{ gap: spacing.md }}>
                  {fields.map((f) => {
                    const on = selected.includes(f.field);
                    const icon = (FIELD_ICONS[f.field] ?? DEFAULT_FIELD_ICON) as IconName;
                    return (
                      <Card key={f.field} padded={false}>
                        <Pressable
                          onPress={() => toggle(f.field)}
                          style={({ pressed }) => [styles.pick, pressed && { opacity: 0.75 }]}
                        >
                          <Ionicons
                            name={icon}
                            size={18}
                            color={on ? colors.primary : colors.textMuted}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={[type.bodyMed, { color: colors.text }]}>{f.label}</Text>
                            <Text
                              style={[type.small, { color: colors.textMuted }]}
                              numberOfLines={1}
                            >
                              Now: {f.currentValue ?? 'not set'}
                            </Text>
                          </View>
                          <Checkbox checked={on} />
                        </Pressable>

                        {/* The input only exists once the field is ticked, so
                            the form stays short until the user asks for more. */}
                        {on ? (
                          <View style={styles.editZone}>
                            <View style={styles.diffRow}>
                              <Text style={[type.caption, { color: colors.textFaint }]}>
                                CURRENT
                              </Text>
                              <Text style={[type.small, { color: colors.textMuted, flex: 1 }]}>
                                {f.currentValue ?? 'not set'}
                              </Text>
                            </View>
                            <Field
                              label="New value"
                              placeholder={`Enter the correct ${f.label.toLowerCase()}`}
                              icon={icon}
                              value={values[f.field] ?? ''}
                              onChangeText={(t) =>
                                setValues((v) => ({ ...v, [f.field]: t }))
                              }
                              keyboardType={keyboardFor(f)}
                              autoCapitalize={f.type === 'email' ? 'none' : 'sentences'}
                              returnKeyType="done"
                            />
                          </View>
                        ) : null}
                      </Card>
                    );
                  })}
                </View>
              </View>

              <Field
                label="Why is this changing?"
                placeholder="A line is enough — e.g. new number, moved rooms"
                inputRef={reasonRef}
                multiline
                autoCapitalize="sentences"
                value={reason}
                onChangeText={setReason}
              />

              <Pressable onPress={attach} style={[styles.attach, attachment && styles.attachOn]}>
                <Ionicons
                  name={attachment ? 'document-attach' : 'cloud-upload-outline'}
                  size={20}
                  color={colors.primary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[type.smallMed, { color: colors.text }]} numberOfLines={1}>
                    {attaching
                      ? 'Uploading…'
                      : attachment
                        ? `${attachment.name} attached`
                        : 'Attach supporting proof'}
                  </Text>
                  <Text style={[type.small, { color: colors.textFaint }]}>
                    Optional · speeds up approval for phone and address changes
                  </Text>
                </View>
                {attachment ? (
                  <Ionicons name="close-circle" size={18} color={colors.textFaint} />
                ) : null}
              </Pressable>
              {attachError ? (
                <Note icon="alert-circle-outline" tone="danger" text={attachError} />
              ) : null}

              {/* Summary — what the admin will actually see. */}
              {changed.length ? (
                <Card>
                  <Text style={[type.caption, { color: colors.primary }]}>
                    {changed.length} CHANGE{changed.length === 1 ? '' : 'S'} TO SUBMIT
                  </Text>
                  <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                    {changed.map((key) => {
                      const f = fields.find((x) => x.field === key)!;
                      return (
                        <View key={key} style={styles.summaryRow}>
                          <Text style={[type.small, { color: colors.textMuted, width: 110 }]}>
                            {f.label}
                          </Text>
                          <Text
                            style={[
                              type.small,
                              { color: colors.textFaint, textDecorationLine: 'line-through' },
                            ]}
                            numberOfLines={1}
                          >
                            {f.currentValue ?? '—'}
                          </Text>
                          <Ionicons name="arrow-forward" size={12} color={colors.primary} />
                          <Text
                            style={[type.smallMed, { color: colors.text, flex: 1 }]}
                            numberOfLines={1}
                          >
                            {values[key]}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </Card>
              ) : (
                <Note
                  icon="information-circle-outline"
                  text="Tick a field above and type the new value to build your request."
                />
              )}

              {submit.error ? (
                <Note
                  icon="alert-circle-outline"
                  tone="danger"
                  text={
                    errorCode(submit.error) === 'PROFILE_REQUEST_PENDING'
                      ? 'You already have a request waiting for the admin. Only one can be open at a time.'
                      : errorMessage(submit.error)
                  }
                />
              ) : null}

              <Button
                label={
                  changed.length
                    ? `Submit ${changed.length} change${changed.length === 1 ? '' : 's'}`
                    : 'Submit request'
                }
                icon="paper-plane-outline"
                loading={submit.pending}
                disabled={changed.length === 0 || reason.trim().length === 0 || submit.pending}
                onPress={() => submit.mutate()}
              />
            </>
          )}

          {!keyboardUp ? <PoweredBy /> : null}
        </KeyboardAwareScroll>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  editZone: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.glassSoft,
  },
  diffRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  attach: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.glass,
  },
  attachOn: {
    borderStyle: 'solid',
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
