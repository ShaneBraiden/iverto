import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import {
  Avatar,
  Button,
  Card,
  Divider,
  GlassPanel,
  ListTile,
  PoweredBy,
  Row,
} from '@/components/ui';
import { LogoWatermark } from '@/components/Logo';
import { blur, colors, radius, shadow, spacing, type } from '@/theme';
import { profileRequestsFor, type ProfileRequest } from '@/constants/sample';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Shared profile layout used by all three roles.
 * `role` is a label — "Student", "Father", "Administrator" — never a name.
 *
 * Students and guardians cannot edit their own record: the details card is
 * read-only and `requestRole` turns on the "Request an update" block, which
 * raises a change request for the admin to apply. The state of the last
 * request is shown right there so nobody files the same one twice.
 */
export function ProfileBody({
  role,
  subtitle,
  tag,
  icon = 'person-outline',
  details,
  extraTiles,
  requestRole,
  requestRollNo,
}: {
  role: string;
  subtitle: string;
  tag: string;
  icon?: IconName;
  details: { icon: IconName; label: string; value: string }[];
  extraTiles?: React.ReactNode;
  /** Set on the student and guardian profiles to enable change requests. */
  requestRole?: 'student' | 'parent';
  /** Which roll number the request relates to. */
  requestRollNo?: string;
}) {
  const insets = useSafeAreaInsets();

  const history = requestRole ? profileRequestsFor(requestRole, requestRollNo) : [];
  const open = history.find((r) => r.status === 'pending');
  const lastDecided = history.find((r) => r.status !== 'pending');

  return (
    <>
      <GlassPanel intensity={blur.header} strong style={styles.header}>
        {/* The mark, oversized and barely there, gives the profile header a
            branded backdrop without putting anything in front of the content. */}
        <LogoWatermark size={230} opacity={0.045} />
        <View style={[styles.headerPad, { paddingTop: insets.top + spacing.xl }]}>
          <Avatar size={76} icon={icon} />
          <Text style={[type.h2, { color: colors.text, marginTop: spacing.md }]}>{role}</Text>
          <Text style={[type.small, { color: colors.textMuted }]}>{subtitle}</Text>
          <View style={styles.tag}>
            <Text style={[type.caption, { color: colors.primary }]}>{tag.toUpperCase()}</Text>
          </View>
        </View>
      </GlassPanel>

      <Screen>
        <Card>
          {details.map((d, i) => (
            <Row key={i} icon={d.icon} label={d.label} value={d.value} />
          ))}

          {requestRole ? (
            <View style={styles.lockRow}>
              <Ionicons name="lock-closed-outline" size={13} color={colors.textFaint} />
              <Text style={[type.small, { color: colors.textFaint, flex: 1 }]}>
                These details are maintained by the campus office.
              </Text>
            </View>
          ) : null}
        </Card>

        {requestRole ? (
          <Card>
            <View style={styles.reqHead}>
              <View style={{ flex: 1 }}>
                <Text style={[type.h3, { color: colors.text }]}>Something out of date?</Text>
                <Text style={[type.small, { color: colors.textMuted, marginTop: 2 }]}>
                  Send the change to the admin — they apply it to your record.
                </Text>
              </View>
              <Ionicons name="create-outline" size={22} color={colors.primary} />
            </View>

            {open ? <RequestStatus request={open} /> : null}
            {!open && lastDecided ? <RequestStatus request={lastDecided} /> : null}

            <Button
              label={open ? 'Raise another request' : 'Request profile update'}
              variant={open ? 'secondary' : 'primary'}
              icon="paper-plane-outline"
              style={{ marginTop: spacing.lg }}
              onPress={() =>
                router.push(
                  `/profile-request?role=${requestRole}${
                    requestRollNo ? `&rollNo=${requestRollNo}` : ''
                  }`
                )
              }
            />
          </Card>
        ) : null}

        <Card padded={false}>
          <ListTile icon="notifications-outline" title="Notifications" subtitle="Push, email, SMS" />
          <Divider inset={spacing.lg + 48} />
          <ListTile icon="lock-closed-outline" title="Change password" />
          <Divider inset={spacing.lg + 48} />
          <ListTile icon="language-outline" title="Language" subtitle="English" />
          {extraTiles}
        </Card>

        <Card padded={false}>
          <ListTile icon="help-circle-outline" title="Help & support" />
          <Divider inset={spacing.lg + 48} />
          <ListTile icon="document-text-outline" title="Terms & privacy" />
          <Divider inset={spacing.lg + 48} />
          <ListTile
            icon="log-out-outline"
            title="Sign out"
            danger
            right={<View />}
            onPress={() => router.replace('/')}
          />
        </Card>

        <PoweredBy />
      </Screen>
    </>
  );
}

/** Where the most recent change request got to. */
function RequestStatus({ request }: { request: ProfileRequest }) {
  const map = {
    pending: { fg: colors.warning, bg: colors.warningBg, icon: 'time-outline', label: 'Awaiting admin review' },
    approved: {
      fg: colors.success,
      bg: colors.successBg,
      icon: 'checkmark-circle-outline',
      label: 'Applied by the admin',
    },
    rejected: {
      fg: colors.danger,
      bg: colors.dangerBg,
      icon: 'close-circle-outline',
      label: 'Declined by the admin',
    },
  }[request.status];

  return (
    <View style={[styles.statusBox, { backgroundColor: map.bg }]}>
      <View style={styles.statusTop}>
        <Ionicons name={map.icon as IconName} size={15} color={map.fg} />
        <Text style={[type.smallMed, { color: map.fg, flex: 1 }]}>{map.label}</Text>
        <Text style={[type.caption, { color: colors.textFaint }]}>{request.id}</Text>
      </View>

      <Text style={[type.small, { color: colors.textMuted, marginTop: 6 }]}>
        {request.fields.map((f) => f.field).join(', ')} · submitted {request.submitted.toLowerCase()}
      </Text>

      {request.note ? (
        <Text style={[type.small, { color: colors.text, marginTop: 6 }]}>“{request.note}”</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
    overflow: 'hidden',
    ...shadow.card,
  },
  headerPad: {
    alignItems: 'center',
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  tag: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(185,0,14,0.16)',
  },
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  reqHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  statusBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  statusTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
