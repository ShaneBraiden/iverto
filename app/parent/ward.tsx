/**
 * Guardian — ward overview: whereabouts, hostel contact, guardians on record.
 *
 * The top bar names the ward in view and doubles as the sibling switch, so a
 * guardian can compare two children without going back to the dashboard.
 * "Late returns" is a link, not a number — the detail is on `late-entries`.
 *
 * Whereabouts are refetched per ward rather than read from the account-level
 * list, because "on campus right now" is the one thing on this screen that
 * goes stale while the app is open. The last gate scan behind it is what
 * `currentStatus` is actually derived from, so both are shown together.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Linking } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { useWard } from '@/components/WardContext';
import { WardSwitcher } from '@/components/WardSwitcher';
import { WardLocationCard } from '@/components/WardLocationCard';
import { Sheet } from '@/components/Sheet';
import {
  Avatar,
  Button,
  Card,
  Chip,
  Divider,
  ErrorState,
  Field,
  ListTile,
  Loader,
  Note,
  PoweredBy,
  Row,
  SectionHeader,
  StatCard,
} from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import { EMERGENCY_CATEGORIES } from '@/constants/config';
import { parent as parentApi } from '@/lib/api/endpoints';
import { errorCode, errorMessage, useMutation, useQuery } from '@/lib/api/useQuery';
import { useRefetchOnFocus } from '@/lib/useFocusRefetch';
import { isoToDateTime } from '@/lib/datetime';
import type { EmergencyCategory } from '@/types';

export default function Ward() {
  const { ward, wards, selectWard, hasSiblings, pendingFor } = useWard();
  const [switching, setSwitching] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);

  const studentId = ward?.id;
  const enabled = !!studentId;

  const detail = useQuery((signal) => parentApi.child(studentId!, signal), [studentId], { enabled });
  const guardians = useQuery(
    (signal) => parentApi.guardians(studentId!, signal),
    [studentId],
    { enabled }
  );
  const late = useQuery(
    (signal) => parentApi.lateEntries(studentId!, { limit: 5 }, signal),
    [studentId],
    { enabled }
  );

  useRefetchOnFocus(detail.refetch);

  const current = detail.data;
  const lateCount = late.data?.data.length ?? 0;
  const unacknowledged = late.data?.unacknowledged ?? 0;

  const dial = (number?: string | null) => {
    if (!number) return;
    Linking.openURL(`tel:${number.replace(/\s+/g, '')}`).catch(() =>
      Alert.alert('Cannot place the call from this device.')
    );
  };

  const message = (number?: string | null) => {
    if (!number) return;
    Linking.openURL(`sms:${number.replace(/\s+/g, '')}`).catch(() =>
      Alert.alert('Cannot open messages on this device.')
    );
  };

  if (!current) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="My ward" back={false} />
        <Screen>
          {detail.error ? (
            <ErrorState message={errorMessage(detail.error)} onRetry={detail.refetch} />
          ) : (
            <Loader label="Loading ward details…" />
          )}
        </Screen>
      </View>
    );
  }

  const onCampus = current.currentStatus === 'IN';
  const warden = current.hostel?.wardens?.[0];
  const scan = current.lastGateScan;

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="My ward"
        subtitle={[current.department, current.year && `Year ${current.year}`]
          .filter(Boolean)
          .join(' · ')}
        back={false}
        rightIcon={hasSiblings ? 'swap-horizontal-outline' : undefined}
        onRight={hasSiblings ? () => setSwitching(true) : undefined}
      />
      <Screen>
        {detail.error ? (
          <Note icon="cloud-offline-outline" tone="warning" text={errorMessage(detail.error)} />
        ) : null}

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Avatar size={54} icon="school-outline" />
            <View style={{ flex: 1 }}>
              {/* Same caret as the dashboard: the name is the switch, and only
                  carries one when there is a sibling behind it. */}
              {hasSiblings ? (
                <Pressable
                  onPress={() => setSwitching(true)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.rollSwitch, pressed && { opacity: 0.6 }]}
                >
                  <Text style={[type.h3, { color: colors.primary }]}>{current.name}</Text>
                  <Ionicons name="chevron-down" size={14} color={colors.primary} />
                </Pressable>
              ) : (
                <Text style={[type.h3, { color: colors.text }]}>{current.name}</Text>
              )}
              <Text style={[type.small, { color: colors.textMuted }]}>{current.rollNumber}</Text>
              <Text style={[type.small, { color: colors.textFaint }]}>
                {current.enrollmentStatus ?? '—'}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.statusStrip,
              { backgroundColor: onCampus ? colors.successBg : colors.infoBg },
            ]}
          >
            <View
              style={[styles.dot, { backgroundColor: onCampus ? colors.success : colors.info }]}
            />
            <Text style={[type.smallMed, { color: onCampus ? colors.success : colors.info }]}>
              {onCampus ? 'On campus' : 'Currently out'}
            </Text>
            <Text style={[type.small, { color: colors.textMuted, marginLeft: 'auto' }]}>
              {scan ? `${scan.direction === 'in' ? 'In' : 'Out'} ${isoToDateTime(scan.at)}` : 'No gate scan yet'}
            </Text>
          </View>

          {/* The pass they are actually out on, when there is one. */}
          {current.activePermission ? (
            <Pressable
              onPress={() => router.push(`/outpass/${current.activePermission!.id}?role=parent`)}
              style={({ pressed }) => [styles.activePass, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="ticket-outline" size={16} color={colors.primary} />
              <Text style={[type.small, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                Out on: {current.activePermission.reason}
              </Text>
              <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </Card>

        {/* Whereabouts, from the ward's own device where they have allowed it
            and from the gate scanner where they have not. Directly under the
            identity card because it is what a guardian opens this screen for. */}
        <WardLocationCard ward={current} />

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <StatCard
            label="Passes this term"
            value={String(current.passesThisTerm)}
            icon="ticket-outline"
            fg={colors.primary}
            bg={colors.primarySoft}
          />
          {/* The number alone tells a guardian nothing useful — tapping opens
              the incident log with times, delay and what the hostel did. */}
          <StatCard
            label={current.openViolations ? 'Open violations' : 'Late returns'}
            value={late.loading ? '—' : String(current.openViolations || lateCount)}
            icon="alert-circle-outline"
            fg={current.openViolations || lateCount ? colors.danger : colors.success}
            bg={current.openViolations || lateCount ? colors.dangerBg : colors.successBg}
            onPress={() => router.push('/parent/late-entries')}
          />
        </View>

        <View>
          <SectionHeader title="Guardians on record" />
          <Card padded={false}>
            {guardians.loading ? (
              <Loader />
            ) : guardians.error ? (
              <View style={{ padding: spacing.lg }}>
                <Note
                  icon="cloud-offline-outline"
                  tone="warning"
                  text={errorMessage(guardians.error)}
                />
              </View>
            ) : (
              (guardians.data ?? current.guardians ?? []).map((g, i, all) => (
                <View key={g.id}>
                  <ListTile
                    icon={g.isYou ? 'person-circle-outline' : 'people-outline'}
                    title={`${g.name}${g.isYou ? ' (you)' : ''}`}
                    subtitle={[g.relationship, g.phone].filter(Boolean).join(' · ')}
                    onPress={() => dial(g.phone)}
                    right={
                      g.isApprover ? (
                        <View style={styles.primaryTag}>
                          <Text style={[type.caption, { color: colors.primary }]}>APPROVER</Text>
                        </View>
                      ) : (
                        <View />
                      )
                    }
                  />
                  {i < all.length - 1 ? <Divider inset={spacing.lg + 48} /> : null}
                </View>
              ))
            )}
          </Card>
        </View>

        <View>
          <SectionHeader title="Hostel details" />
          <Card>
            <Row icon="bed-outline" label="Room" value={current.hostel?.room ?? '—'} />
            <Row icon="people-circle-outline" label="Block" value={current.hostel?.group?.name ?? '—'} />
            <Row icon="business-outline" label="Site" value={current.site?.name ?? '—'} />
            <Row icon="shield-checkmark-outline" label="Warden" value={warden?.name ?? '—'} />
            <Row icon="call-outline" label="Warden contact" value={warden?.phone ?? '—'} />
          </Card>
        </View>

        <Card padded={false}>
          <ListTile
            icon="time-outline"
            title="Late entry log"
            subtitle={
              lateCount
                ? `${lateCount} record${lateCount === 1 ? '' : 's'}${unacknowledged ? ` · ${unacknowledged} new` : ''}`
                : 'No late returns on record'
            }
            onPress={() => router.push('/parent/late-entries')}
          />
          <Divider inset={spacing.lg + 48} />
          <ListTile
            icon="call-outline"
            title="Call warden"
            subtitle={warden?.phone ?? 'No number on record'}
            onPress={() => dial(warden?.phone)}
          />
          <Divider inset={spacing.lg + 48} />
          <ListTile
            icon="chatbubble-outline"
            title="Message student"
            subtitle={current.rollNumber}
            onPress={() => message(current.guardians?.find((g) => g.isYou)?.phone)}
          />
          <Divider inset={spacing.lg + 48} />
          <ListTile
            icon="warning-outline"
            title="Report an emergency"
            subtitle="Alerts every warden on this site straight away"
            danger
            onPress={() => setEmergencyOpen(true)}
          />
        </Card>

        <PoweredBy />
      </Screen>

      <WardSwitcher
        visible={switching}
        onClose={() => setSwitching(false)}
        wards={wards}
        activeId={current.id}
        onSelect={selectWard}
        pendingFor={pendingFor}
      />

      <EmergencySheet
        visible={emergencyOpen}
        onClose={() => setEmergencyOpen(false)}
        studentId={current.id}
        studentName={current.name}
        defaultPhone={current.guardians?.find((g) => g.isYou)?.phone ?? ''}
      />
    </View>
  );
}

/**
 * `POST /parent/emergencies`. The category and the message are what the warden
 * actually reads, so neither is optional here even though the shape allows a
 * bare message — a "medical" alert and a "family" one get handled differently.
 */
function EmergencySheet({
  visible,
  onClose,
  studentId,
  studentName,
  defaultPhone,
}: {
  visible: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  defaultPhone: string;
}) {
  const [category, setCategory] = useState<EmergencyCategory>('medical');
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState(defaultPhone);

  const raise = useMutation(
    () =>
      parentApi.raiseEmergency({
        studentId,
        category,
        message: message.trim(),
        contactPhone: phone.trim() || undefined,
      }),
    {
      onSuccess: () => {
        setMessage('');
        onClose();
        Alert.alert(
          'Warden alerted',
          `Every warden on ${studentName}'s site has been notified and will call you back.`
        );
      },
      onError: (err) =>
        Alert.alert(
          "Couldn't send that",
          errorCode(err) === 'TOO_MANY_REQUESTS'
            ? 'An alert was just sent. Give it half a minute before sending another.'
            : errorMessage(err)
        ),
    }
  );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Report an emergency"
      subtitle={`Every warden on ${studentName}'s site is alerted immediately.`}
    >
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        <View style={styles.chips}>
          {EMERGENCY_CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              label={c.label}
              selected={c.id === category}
              onPress={() => setCategory(c.id)}
            />
          ))}
        </View>

        <Field
          label="What has happened?"
          placeholder="A line is enough — the warden will call you"
          multiline
          autoCapitalize="sentences"
          value={message}
          onChangeText={setMessage}
        />

        <Field
          label="Number to call you back on"
          placeholder="+91 00000 00000"
          icon="call-outline"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button
            label="Cancel"
            variant="secondary"
            full={false}
            style={{ flex: 1 }}
            onPress={onClose}
          />
          <Button
            label="Alert the warden"
            variant="danger"
            icon="warning-outline"
            full={false}
            style={{ flex: 1.3 }}
            loading={raise.pending}
            disabled={message.trim().length === 0 || raise.pending}
            onPress={() => raise.mutate()}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  statusStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  activePass: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  primaryTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  rollSwitch: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
