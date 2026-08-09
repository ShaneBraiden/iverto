/** Student — profile & settings. Details are read-only; changes go via the admin. */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ProfileBody } from '@/components/ProfileBody';
import { Sheet } from '@/components/Sheet';
import { Button, Divider, ListTile, Note } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import { useLocationSharing, type LocationStatus } from '@/lib/location';
import { fixAge } from '@/lib/geo';
import { useAuth } from '@/lib/auth';

export default function StudentProfile() {
  const { me } = useAuth();
  const [locationOpen, setLocationOpen] = useState(false);
  const sharing = useLocationSharing();

  return (
    <View style={{ flex: 1 }}>
      <ProfileBody
        name={me?.name ?? '—'}
        subtitle={[me?.department, me?.year && `Year ${me.year}`].filter(Boolean).join(' · ')}
        tag="Student"
        icon="school-outline"
        canRequestChanges
        details={[
          { icon: 'id-card-outline', label: 'Roll number', value: me?.rollNumber ?? '—' },
          { icon: 'bed-outline', label: 'Room', value: me?.roomNumber ?? '—' },
          { icon: 'business-outline', label: 'Site', value: me?.site?.name ?? '—' },
          { icon: 'call-outline', label: 'Phone', value: me?.phone ?? '—' },
          { icon: 'mail-outline', label: 'Email', value: me?.email ?? '—' },
          { icon: 'home-outline', label: 'Home address', value: me?.address ?? '—' },
        ]}
        extraTiles={
          <>
            <Divider inset={spacing.lg + 48} />
            <ListTile
              icon="navigate-outline"
              title="Location sharing"
              subtitle={STATUS_SUMMARY[sharing?.status ?? 'off']}
              onPress={() => setLocationOpen(true)}
            />
          </>
        }
      />

      <LocationSheet visible={locationOpen} onClose={() => setLocationOpen(false)} />
    </View>
  );
}

const STATUS_SUMMARY: Record<LocationStatus, string> = {
  off: 'Off — your guardian cannot see where you are',
  denied: 'On, but this phone is blocking location',
  starting: 'On — waiting for a location',
  live: 'On — your guardian can see you on campus',
  unavailable: 'Not enabled for your campus',
};

/**
 * The whole of what sharing means, said in one place before it is switched on.
 *
 * Somebody being able to see where you are is not a settings toggle to bury in
 * a list — the student is told who sees it, how precise it is, when it is
 * taken and how to stop, and then decides.
 */
function LocationSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const sharing = useLocationSharing();
  if (!sharing) return null;

  const { status, zone, inside, lastPingAt, setSharing } = sharing;
  const age = fixAge(lastPingAt ? new Date(lastPingAt).toISOString() : null);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Location sharing"
      subtitle="Lets your guardian see whether you are on campus."
    >
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        <View style={[styles.state, { backgroundColor: TONE[status].bg }]}>
          <Ionicons name={TONE[status].icon} size={18} color={TONE[status].fg} />
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyMed, { color: TONE[status].fg }]}>{TONE[status].title}</Text>
            <Text style={[type.small, { color: colors.textMuted }]}>
              {STATUS_SUMMARY[status]}
            </Text>
          </View>
        </View>

        {status === 'live' ? (
          <View style={{ gap: spacing.sm }}>
            <Fact
              icon={inside ? 'shield-checkmark-outline' : 'walk-outline'}
              text={
                inside === null
                  ? 'Working out where you are.'
                  : inside
                    ? `Inside ${zone?.name ?? 'campus'} right now.`
                    : `Outside ${zone?.name ?? 'campus'} right now.`
              }
            />
            <Fact icon="time-outline" text={`Last sent ${age.label}.`} />
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <Fact icon="people-outline" text="Only the guardians on your record can see it — not other students, and not the whole hostel." />
          <Fact icon="radio-outline" text="Your position is sent at most once a minute, and only while this app is open." />
          <Fact icon="eye-off-outline" text="Turn it off here and nothing further is sent. What was already sent stays on your record." />
        </View>

        {status === 'denied' ? (
          <Note
            icon="alert-circle-outline"
            tone="warning"
            text="Location is switched on here, but this phone is refusing it. Allow location for Iverto.ai in your device settings."
          />
        ) : null}

        {status === 'unavailable' ? (
          <Note
            icon="information-circle-outline"
            tone="warning"
            text="Your campus has not set up a boundary yet, so there is nothing to share against. Your warden can enable it."
          />
        ) : null}

        {status === 'denied' ? (
          <Button
            label="Open device settings"
            variant="secondary"
            icon="settings-outline"
            onPress={() => void Linking.openSettings()}
          />
        ) : null}

        <Button
          label={sharing.sharing ? 'Turn sharing off' : 'Turn sharing on'}
          variant={sharing.sharing ? 'danger' : 'primary'}
          icon={sharing.sharing ? 'eye-off-outline' : 'navigate-outline'}
          onPress={() => void setSharing(!sharing.sharing)}
        />
      </View>
    </Sheet>
  );
}

function Fact({
  icon,
  text,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
}) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={15} color={colors.textFaint} />
      <Text style={[type.small, { color: colors.textMuted, flex: 1 }]}>{text}</Text>
    </View>
  );
}

const TONE: Record<
  LocationStatus,
  { fg: string; bg: string; icon: React.ComponentProps<typeof Ionicons>['name']; title: string }
> = {
  off: { fg: colors.textMuted, bg: colors.neutralBg, icon: 'eye-off-outline', title: 'Not sharing' },
  denied: { fg: colors.warning, bg: colors.warningBg, icon: 'warning-outline', title: 'Blocked by this phone' },
  starting: { fg: colors.info, bg: colors.infoBg, icon: 'hourglass-outline', title: 'Starting up' },
  live: { fg: colors.success, bg: colors.successBg, icon: 'navigate', title: 'Sharing' },
  unavailable: { fg: colors.warning, bg: colors.warningBg, icon: 'help-circle-outline', title: 'Not available here' },
};

const styles = StyleSheet.create({
  state: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
});
