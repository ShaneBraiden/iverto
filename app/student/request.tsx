/**
 * Student — new outpass request.
 *
 * The categories are not a constant: `GET /categories` is tenant-overridable
 * and each one carries its own rules — whether a supporting document is
 * required, and how long the trip may run. Both are enforced here before the
 * submit button unlocks, so the server's 400 is a backstop rather than the
 * first time the student hears about it.
 *
 * Dates and times are picked from real sheets, combined into one instant, and
 * sent as ISO 8601 (`2026-08-08T10:00:00.000Z`); the display format stays
 * local to the screen.
 */
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Chip, Field, Loader, Note, PoweredBy, Row } from '@/components/ui';
import { TopBar } from '@/components/Screen';
import { DateSheet, TimeSheet } from '@/components/DateTimeSheet';
import { KeyboardAwareScroll, useKeyboardVisible } from '@/components/KeyboardAware';
import { colors, radius, spacing, type } from '@/theme';
import { permissions as permissionApi } from '@/lib/api/endpoints';
import { errorMessage, useMutation, useQuery } from '@/lib/api/useQuery';
import { useAuth } from '@/lib/auth';
import { AttachmentError, pickAndUpload, type PickedFile } from '@/lib/attachments';
import { combine, formatDate, formatMinutes, formatTime, toISO } from '@/lib/datetime';

/** Which picker sheet is open, if any. */
type Picker = 'fromDate' | 'fromTime' | 'toDate' | 'toTime' | null;

export default function NewRequest() {
  const { me } = useAuth();
  const keyboardUp = useKeyboardVisible();

  const categoriesQuery = useQuery((signal) => permissionApi.categories(signal), []);
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const category = categories.find((c) => c.id === categoryId) ?? categories[0];

  /* Defaults are "now" and "four hours from now" — a real starting point the
     student can adjust, not a fixed date baked into the screen. */
  const now = useRef(new Date()).current;
  const later = useRef(new Date(now.getTime() + 4 * 60 * 60 * 1000)).current;

  const [fromDate, setFromDate] = useState(now);
  const [fromTime, setFromTime] = useState(now);
  const [toDate, setToDate] = useState(later);
  const [toTime, setToTime] = useState(later);
  const [picker, setPicker] = useState<Picker>(null);

  const [destination, setDestination] = useState('');
  const [reason, setReason] = useState('');
  const [contact, setContact] = useState(me?.phone ?? '');

  const [docKey, setDocKey] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<PickedFile | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);

  const reasonRef = useRef<TextInput>(null);
  const contactRef = useRef<TextInput>(null);

  const leaving = combine(fromDate, fromTime);
  const returning = combine(toDate, toTime);
  const durationMins = Math.round((returning.getTime() - leaving.getTime()) / 60000);

  const rangeInvalid = durationMins <= 0;
  const tooLong =
    !!category?.maxDurationHours && durationMins > category.maxDurationHours * 60;
  const docMissing = !!category?.requiresSupportingDoc && !docKey;

  const submit = useMutation(
    () =>
      permissionApi.submit({
        type: category!.id,
        reason: reason.trim(),
        destination: destination.trim(),
        startDate: toISO(leaving),
        endDate: toISO(returning),
        emergencyContact: contact.trim(),
        supportingDocKeys: docKey ? [docKey] : undefined,
      }),
    { onSuccess: () => router.replace('/student') }
  );

  const attach = async () => {
    if (attachment) {
      setAttachment(null);
      setDocKey(null);
      setAttachError(null);
      return;
    }
    setAttaching(true);
    setAttachError(null);
    try {
      const picked = await pickAndUpload('permission');
      if (picked) {
        setDocKey(picked.upload.key);
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

  const complete =
    !!category &&
    destination.trim().length > 0 &&
    reason.trim().length > 0 &&
    contact.trim().length > 0 &&
    !rangeInvalid &&
    !tooLong &&
    !docMissing;

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="New outpass" subtitle="Fill in your trip details" back={false} />
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        <KeyboardAwareScroll
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl }}
          extraBottomSpace={96}
        >
          {/* Requester summary, straight off `GET /me`. */}
          <Card>
            <Row icon="person-outline" label="Requested by" value={me?.name ?? '—'} />
            <Row icon="id-card-outline" label="Roll no." value={me?.rollNumber ?? '—'} />
            <Row icon="bed-outline" label="Room" value={me?.roomNumber ?? '—'} />
            <Row icon="business-outline" label="Site" value={me?.site?.name ?? '—'} />
          </Card>

          {/* Category — rendered from the server, never hardcoded. */}
          <View style={{ gap: spacing.md }}>
            <Text style={[type.smallMed, { color: colors.textMuted }]}>Category</Text>
            {categoriesQuery.loading ? (
              <Loader />
            ) : categoriesQuery.error ? (
              <Note
                icon="cloud-offline-outline"
                tone="danger"
                text={errorMessage(categoriesQuery.error, "Couldn't load the pass categories.")}
              />
            ) : categories.length === 0 ? (
              <Note
                icon="information-circle-outline"
                tone="warning"
                text="No pass categories are configured for your campus yet. Your warden can add them."
              />
            ) : (
              <>
                <View style={styles.chips}>
                  {categories.map((c) => (
                    <Chip
                      key={c.id}
                      label={c.label}
                      selected={c.id === category?.id}
                      onPress={() => setCategoryId(c.id)}
                    />
                  ))}
                </View>
                {category?.description ? (
                  <Text style={[type.small, { color: colors.textFaint }]}>
                    {category.description}
                  </Text>
                ) : null}
                {category?.maxDurationHours ? (
                  <Text style={[type.small, { color: colors.textFaint }]}>
                    Maximum {category.maxDurationHours}h for this category.
                  </Text>
                ) : null}
              </>
            )}
          </View>

          {/* Dates */}
          <View style={{ gap: spacing.lg }}>
            <Text style={[type.smallMed, { color: colors.textMuted }]}>Leaving</Text>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <PickerBox
                icon="calendar-outline"
                label="Date"
                value={formatDate(fromDate)}
                onPress={() => setPicker('fromDate')}
              />
              <PickerBox
                icon="time-outline"
                label="Time"
                value={formatTime(fromTime)}
                onPress={() => setPicker('fromTime')}
              />
            </View>
            <Text style={[type.smallMed, { color: colors.textMuted }]}>Returning</Text>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <PickerBox
                icon="calendar-outline"
                label="Date"
                value={formatDate(toDate)}
                onPress={() => setPicker('toDate')}
              />
              <PickerBox
                icon="time-outline"
                label="Time"
                value={formatTime(toTime)}
                onPress={() => setPicker('toTime')}
              />
            </View>

            {rangeInvalid ? (
              <Note
                icon="alert-circle-outline"
                tone="danger"
                text="The return has to be after the departure."
              />
            ) : tooLong ? (
              <Note
                icon="alert-circle-outline"
                tone="danger"
                text={`That's ${formatMinutes(durationMins)}. ${category?.label} passes run to ${category?.maxDurationHours}h at most.`}
              />
            ) : (
              <Text style={[type.small, { color: colors.textFaint }]}>
                {formatMinutes(durationMins)} away from campus.
              </Text>
            )}
          </View>

          <Field
            label="Destination"
            placeholder="Where are you going?"
            icon="location-outline"
            autoCapitalize="words"
            returnKeyType="next"
            blurOnSubmit={false}
            value={destination}
            onChangeText={setDestination}
            onSubmitEditing={() => reasonRef.current?.focus()}
          />
          <Field
            label="Reason"
            placeholder="Briefly explain the reason for this outpass"
            inputRef={reasonRef}
            multiline
            autoCapitalize="sentences"
            value={reason}
            onChangeText={setReason}
          />
          <Field
            label="Emergency contact"
            placeholder="+91 00000 00000"
            icon="call-outline"
            inputRef={contactRef}
            keyboardType="phone-pad"
            autoComplete="tel"
            returnKeyType="done"
            value={contact}
            onChangeText={setContact}
            hint="Reachable while you're away. Your guardian is notified about this request immediately."
          />

          {/* Attachment — required outright for some categories. */}
          <Pressable style={[styles.attach, attachment && styles.attachOn]} onPress={attach}>
            <Ionicons
              name={attachment ? 'document-attach' : 'cloud-upload-outline'}
              size={20}
              color={colors.primary}
            />
            <View style={{ flex: 1 }}>
              <Text style={[type.smallMed, { color: colors.text }]} numberOfLines={1}>
                {attaching ? 'Uploading…' : (attachment?.name ?? 'Attach supporting document')}
              </Text>
              <Text style={[type.small, { color: colors.textFaint }]}>
                {category?.requiresSupportingDoc ? 'Required' : 'Optional'} · PDF or image, max 5 MB
              </Text>
            </View>
            {attachment ? (
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            ) : null}
          </Pressable>
          {attachError ? (
            <Note icon="alert-circle-outline" tone="danger" text={attachError} />
          ) : null}
          {docMissing && !attaching ? (
            <Note
              icon="alert-circle-outline"
              tone="warning"
              text={`A ${category?.label.toLowerCase()} pass needs a supporting document before it can be submitted.`}
            />
          ) : null}

          <Note
            icon="information-circle-outline"
            text="Once submitted, your guardian is asked to approve — by push if they have the app, by WhatsApp otherwise."
          />

          {submit.error ? (
            <Note icon="alert-circle-outline" tone="danger" text={errorMessage(submit.error)} />
          ) : null}

          <Button
            label="Submit request"
            icon="paper-plane-outline"
            loading={submit.pending}
            disabled={!complete || submit.pending}
            onPress={() => submit.mutate()}
          />
          {!keyboardUp ? <PoweredBy /> : null}
        </KeyboardAwareScroll>
      </SafeAreaView>

      <DateSheet
        visible={picker === 'fromDate'}
        onClose={() => setPicker(null)}
        value={fromDate}
        onSelect={(d) => {
          setFromDate(d);
          /* Keep the return on or after the departure. */
          if (toDate.getTime() < d.getTime()) setToDate(d);
        }}
        title="Leaving on"
      />
      <TimeSheet
        visible={picker === 'fromTime'}
        onClose={() => setPicker(null)}
        value={fromTime}
        onSelect={setFromTime}
        title="Leaving at"
      />
      <DateSheet
        visible={picker === 'toDate'}
        onClose={() => setPicker(null)}
        value={toDate}
        onSelect={setToDate}
        minDate={fromDate}
        title="Returning on"
      />
      <TimeSheet
        visible={picker === 'toTime'}
        onClose={() => setPicker(null)}
        value={toTime}
        onSelect={setToTime}
        title="Returning at"
      />
    </View>
  );
}

function PickerBox({
  icon,
  label,
  value,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.picker} onPress={onPress}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <View>
        <Text style={[type.caption, { color: colors.textFaint }]}>{label.toUpperCase()}</Text>
        <Text style={[type.smallMed, { color: colors.text }]}>{value}</Text>
      </View>
      <Ionicons
        name="chevron-down"
        size={16}
        color={colors.textFaint}
        style={{ marginLeft: 'auto' }}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  picker: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 58,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.glassStrong,
  },
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
});
