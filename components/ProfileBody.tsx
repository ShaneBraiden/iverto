import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, Linking, Switch } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import {
  Avatar,
  Button,
  Card,
  Divider,
  Field,
  GlassPanel,
  ListTile,
  Loader,
  Note,
  PoweredBy,
  Row,
} from '@/components/ui';
import { LogoWatermark } from '@/components/Logo';
import { useApp } from '@/components/AppContext';
import { blur, colors, radius, shadow, spacing, type } from '@/theme';
import {
  auth as authApi,
  notifications as notificationApi,
  profileRequests as profileRequestApi,
} from '@/lib/api/endpoints';
import { errorMessage, useMutation, useQuery } from '@/lib/api/useQuery';
import { useRefetchOnFocus } from '@/lib/useFocusRefetch';
import { timeAgo } from '@/lib/datetime';
import { useAuth } from '@/lib/auth';
import type { ProfileRequest } from '@/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Shared profile layout used by all three roles.
 *
 * Students and guardians cannot edit their own record: the details card is
 * read-only and `canRequestChanges` turns on the "Request an update" block,
 * which raises a change request for the admin to apply. The state of the last
 * request is shown right there so nobody files the same one twice.
 *
 * The settings tiles below are served, not hardcoded — language, help and the
 * legal links all come from `GET /app-config`, and the notification toggles
 * write straight to `PUT /notification-preferences`.
 */
export function ProfileBody({
  name,
  subtitle,
  tag,
  icon = 'person-outline',
  details,
  extraTiles,
  canRequestChanges,
}: {
  name: string;
  subtitle: string;
  tag: string;
  icon?: IconName;
  details: { icon: IconName; label: string; value: string }[];
  extraTiles?: React.ReactNode;
  /** Set on the student and guardian profiles to enable change requests. */
  canRequestChanges?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { config } = useApp();

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);

  /* Where the last change request got to — folded into the profile so nobody
     files the same one twice. The endpoint is already scoped to this account. */
  const requests = useQuery(
    (signal) => profileRequestApi.list({ status: 'all', limit: 5 }, signal),
    [canRequestChanges],
    { enabled: !!canRequestChanges }
  );
  useRefetchOnFocus(requests.refetch);

  const history = requests.data?.data ?? [];
  const open = history.find((r) => r.status === 'pending');
  const lastDecided = history.find((r) => r.status !== 'pending');

  const handleSignOut = async () => {
    await signOut();
    router.replace('/');
  };

  const openUrl = (url?: string | null, missing?: string) => {
    if (!url) {
      Alert.alert(missing ?? 'Not available', 'Your campus has not published this yet.');
      return;
    }
    Linking.openURL(url).catch(() => Alert.alert("Couldn't open that link"));
  };

  return (
    <>
      <GlassPanel intensity={blur.header} strong style={styles.header}>
        {/* The mark, oversized and barely there, gives the profile header a
            branded backdrop without putting anything in front of the content. */}
        <LogoWatermark size={230} opacity={0.045} />
        <View style={[styles.headerPad, { paddingTop: insets.top + spacing.xl }]}>
          <Avatar size={76} icon={icon} />
          <Text style={[type.h2, { color: colors.text, marginTop: spacing.md }]}>{name}</Text>
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

          {canRequestChanges ? (
            <View style={styles.lockRow}>
              <Ionicons name="lock-closed-outline" size={13} color={colors.textFaint} />
              <Text style={[type.small, { color: colors.textFaint, flex: 1 }]}>
                These details are maintained by the campus office.
              </Text>
            </View>
          ) : null}
        </Card>

        {canRequestChanges ? (
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

            {requests.loading ? <Loader /> : null}
            {open ? <RequestStatus request={open} /> : null}
            {!open && lastDecided ? <RequestStatus request={lastDecided} /> : null}

            <Button
              label={open ? 'View my open request' : 'Request profile update'}
              variant={open ? 'secondary' : 'primary'}
              icon="paper-plane-outline"
              style={{ marginTop: spacing.lg }}
              onPress={() => router.push('/profile-request')}
            />
          </Card>
        ) : null}

        <Card padded={false}>
          <ListTile
            icon="notifications-outline"
            title="Notifications"
            subtitle="Push, email, SMS"
            onPress={() => setPrefsOpen(true)}
          />
          <Divider inset={spacing.lg + 48} />
          <ListTile
            icon="lock-closed-outline"
            title="Change password"
            onPress={() => setPasswordOpen(true)}
          />
          <Divider inset={spacing.lg + 48} />
          <ListTile
            icon="language-outline"
            title="Language"
            subtitle={
              config?.languages.find((l) => l.code === config.defaultLanguage)?.label ?? 'English'
            }
          />
          {extraTiles}
        </Card>

        <Card padded={false}>
          <ListTile
            icon="help-circle-outline"
            title="Help & support"
            subtitle={config?.support.email ?? config?.support.phone ?? undefined}
            onPress={() =>
              openUrl(
                config?.support.helpUrl ??
                  (config?.support.email ? `mailto:${config.support.email}` : null),
                'No support link'
              )
            }
          />
          <Divider inset={spacing.lg + 48} />
          <ListTile
            icon="document-text-outline"
            title="Terms & privacy"
            onPress={() => openUrl(config?.legal.termsUrl ?? config?.legal.privacyUrl, 'No terms published')}
          />
          <Divider inset={spacing.lg + 48} />
          <ListTile
            icon="log-out-outline"
            title="Sign out"
            danger
            right={<View />}
            onPress={handleSignOut}
          />
        </Card>

        <PoweredBy />
      </Screen>

      <PasswordSheet visible={passwordOpen} onClose={() => setPasswordOpen(false)} />
      <PreferencesSheet visible={prefsOpen} onClose={() => setPrefsOpen(false)} />
    </>
  );
}

/** Where the most recent change request got to. */
function RequestStatus({ request }: { request: ProfileRequest }) {
  const map = {
    pending: {
      fg: colors.warning,
      bg: colors.warningBg,
      icon: 'time-outline',
      label: 'Awaiting admin review',
    },
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

  const fields = Object.keys(request.changes ?? {});

  return (
    <View style={[styles.statusBox, { backgroundColor: map.bg }]}>
      <View style={styles.statusTop}>
        <Ionicons name={map.icon as IconName} size={15} color={map.fg} />
        <Text style={[type.smallMed, { color: map.fg, flex: 1 }]}>{map.label}</Text>
      </View>

      <Text style={[type.small, { color: colors.textMuted, marginTop: 6 }]}>
        {fields.join(', ') || 'No fields'} · submitted {timeAgo(request.createdAt)}
      </Text>

      {request.reviewNote ? (
        <Text style={[type.small, { color: colors.text, marginTop: 6 }]}>
          “{request.reviewNote}”
        </Text>
      ) : null}
    </View>
  );
}

/** `POST /auth/password` — the server only wants the new one. */
function PasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const { passwordChanged } = useAuth();

  const change = useMutation(
    async (value: string) => {
      await authApi.changePassword(value);
      /* Same call as the forced screen makes, so the "still on the default
         password" flag is cleared wherever the password is changed from. */
      await passwordChanged();
    },
    {
      onSuccess: () => {
        setNext('');
        setConfirm('');
        onClose();
        Alert.alert('Password changed', 'Use the new password next time you sign in.');
      },
    }
  );

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && next !== confirm;
  const ready = next.length >= 8 && next === confirm && !change.pending;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Change password"
      subtitle="At least 8 characters."
    >
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        <Field
          label="New password"
          placeholder="••••••••"
          icon="lock-closed-outline"
          secureTextEntry
          autoCapitalize="none"
          value={next}
          onChangeText={setNext}
          hint={tooShort ? 'That is under 8 characters.' : undefined}
        />
        <Field
          label="Confirm new password"
          placeholder="••••••••"
          icon="lock-closed-outline"
          secureTextEntry
          autoCapitalize="none"
          value={confirm}
          onChangeText={setConfirm}
          hint={mismatch ? "Those two don't match." : undefined}
        />
        {change.error ? (
          <Note icon="alert-circle-outline" tone="danger" text={errorMessage(change.error)} />
        ) : null}
        <Button
          label="Update password"
          loading={change.pending}
          disabled={!ready}
          onPress={() => change.mutate(next)}
        />
      </View>
    </Sheet>
  );
}

/** `GET`/`PUT /notification-preferences`. Push off still fills the inbox. */
function PreferencesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const prefs = useQuery((signal) => notificationApi.preferences(signal), [visible], {
    enabled: visible,
  });

  const save = useMutation(
    (patch: { push?: boolean; email?: boolean; sms?: boolean }) =>
      notificationApi.setPreferences(patch),
    { onSuccess: () => prefs.refetch() }
  );

  const current = prefs.data;

  const rows: { key: 'push' | 'email' | 'sms'; label: string; hint: string }[] = [
    { key: 'push', label: 'Push', hint: 'Alerts on this device' },
    { key: 'email', label: 'Email', hint: 'A copy to your inbox' },
    { key: 'sms', label: 'SMS', hint: 'Text messages' },
  ];

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Notifications"
      subtitle="Turning push off stops alerts — the in-app inbox still fills."
    >
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
        {prefs.loading ? <Loader /> : null}
        {prefs.error ? (
          <Note icon="cloud-offline-outline" tone="danger" text={errorMessage(prefs.error)} />
        ) : null}

        {current
          ? rows.map((r) => (
              <View key={r.key} style={styles.prefRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.bodyMed, { color: colors.text }]}>{r.label}</Text>
                  <Text style={[type.small, { color: colors.textMuted }]}>{r.hint}</Text>
                </View>
                <Switch
                  value={current[r.key]}
                  disabled={save.pending}
                  onValueChange={(value) => {
                    void save.mutate({ [r.key]: value });
                  }}
                  trackColor={{ true: colors.primary, false: colors.borderStrong }}
                  thumbColor="#fff"
                />
              </View>
            ))
          : null}

        {save.error ? (
          <Note icon="alert-circle-outline" tone="danger" text={errorMessage(save.error)} />
        ) : null}
      </View>
    </Sheet>
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
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
});
