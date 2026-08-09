/**
 * "Where is my ward" — the guardian half of the geofencing feature.
 *
 * There are four states here and each one is a different answer, so none of
 * them is allowed to look like an error:
 *
 *   live        the ward's device is sharing; radar, distance and fix age.
 *   not sharing the ward has location switched off. Their choice, said plainly,
 *               and the guardian falls back to the gate.
 *   no fix yet  sharing is on but nothing has come through — a new phone, or
 *               the app has not been opened since.
 *   unavailable the campus has no boundary configured, or this server does not
 *               have the location routes yet. `GET .../location` 404s and the
 *               card quietly becomes the gate-scan view instead.
 *
 * In every one of them the card still answers the underlying question from the
 * gate scan the app already had, because "on campus, seen at the gate at 19:40"
 * is worth more than an empty box.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card, Note } from '@/components/ui';
import { Bone } from '@/components/Skeleton';
import { CampusRadar } from '@/components/CampusRadar';
import { colors, radius, spacing, type } from '@/theme';
import { location as locationApi } from '@/lib/api/endpoints';
import { errorStatus, useQuery } from '@/lib/api/useQuery';
import { fixAge, formatDistance, resolveFix } from '@/lib/geo';
import { isoToDateTime } from '@/lib/datetime';
import type { WardDetail } from '@/types';

/** How often the card re-asks while a guardian is sitting on the screen. */
const POLL_MS = 60_000;

export function WardLocationCard({ ward }: { ward: WardDetail }) {
  const studentId = ward.id;

  const zones = useQuery((signal) => locationApi.zones(signal), []);
  const fix = useQuery((signal) => locationApi.ward(studentId, signal), [studentId]);

  /* A guardian who opens this screen and leaves it open is watching. Refresh
     on a timer so the answer does not quietly go stale in front of them. */
  React.useEffect(() => {
    const timer = setInterval(() => fix.refetch(), POLL_MS);
    return () => clearInterval(timer);
  }, [fix.refetch]);

  /* 404 on either call is "this campus has not enabled it", not a failure.
     Matched on the status rather than the envelope's `error` code: a route the
     server has not deployed is answered by the framework, which does not use
     the documented envelope. */
  const notEnabled = errorStatus(fix.error) === 404 || errorStatus(zones.error) === 404;

  if (fix.loading && !fix.data && !notEnabled) {
    return (
      <Card>
        <Header name={ward.name} onRefresh={fix.refetch} busy />
        {/* Shaped like the answer that is coming — verdict strip, radar, facts
            — so the card does not resize under the guardian's eyes. */}
        <Bone width="100%" height={42} round={radius.md} style={{ marginTop: spacing.md }} />
        <Bone width="100%" height={150} round={radius.lg} style={{ marginTop: spacing.lg }} />
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          <Bone width="65%" height={11} />
          <Bone width="50%" height={11} />
        </View>
      </Card>
    );
  }

  if (notEnabled || (!fix.data && fix.error)) {
    return (
      <Card>
        <Header name={ward.name} onRefresh={fix.refetch} busy={fix.refetching} />
        <GateFallback ward={ward} />
        <Note
          icon="information-circle-outline"
          text="Live location is not switched on for this campus. Your ward's whereabouts come from the gate scanner."
        />
      </Card>
    );
  }

  const data = fix.data;
  const zone = data?.zone ?? zones.data?.[0] ?? null;
  const resolved = resolveFix(
    {
      latitude: data?.latitude ?? null,
      longitude: data?.longitude ?? null,
      accuracyMeters: data?.accuracyMeters,
      inside: data?.inside,
      distanceMeters: data?.distanceMeters,
    },
    zone
  );
  const age = fixAge(data?.at);

  /* The ward chose not to share. Say so — a guardian left guessing assumes the
     app is broken and calls the warden. */
  if (data && !data.sharing) {
    return (
      <Card>
        <Header name={ward.name} onRefresh={fix.refetch} busy={fix.refetching} />
        <GateFallback ward={ward} />
        <Note
          icon="eye-off-outline"
          tone="warning"
          text={`${ward.name} has not turned on location sharing. They can switch it on from Profile → Location sharing in their app.`}
        />
      </Card>
    );
  }

  if (!resolved.point || !zone) {
    return (
      <Card>
        <Header name={ward.name} onRefresh={fix.refetch} busy={fix.refetching} />
        <GateFallback ward={ward} />
        <Note
          icon="hourglass-outline"
          text={
            zone
              ? 'Sharing is on, but no location has come through yet. It arrives the next time they open the app.'
              : 'No campus boundary has been set up yet, so there is nothing to measure against. Your warden can add one.'
          }
        />
      </Card>
    );
  }

  const inside = resolved.inside;
  const tint = inside ? colors.success : colors.info;

  return (
    <Card>
      <Header name={ward.name} onRefresh={fix.refetch} busy={fix.refetching} />

      <View style={[styles.verdict, { backgroundColor: inside ? colors.successBg : colors.infoBg }]}>
        <View style={[styles.dot, { backgroundColor: tint }]} />
        {/* Zone names are set per campus, so "Inside Main Campus (North Gate)"
            is as likely as "Inside Campus" — the distance beside it keeps its
            width and the verdict wraps. */}
        <Text style={[type.bodyMed, { color: tint, flex: 1 }]} numberOfLines={2}>
          {inside ? `Inside ${zone.name}` : `Outside ${zone.name}`}
        </Text>
        {resolved.distance != null && !inside ? (
          <Text style={[type.smallMed, { color: colors.textMuted, flexShrink: 0 }]}>
            {formatDistance(resolved.distance)} away
          </Text>
        ) : null}
      </View>

      <View style={{ marginTop: spacing.lg }}>
        <CampusRadar
          distance={resolved.distance}
          bearing={resolved.bearing}
          radiusMeters={zone.radiusMeters}
          inside={inside}
          stale={age.stale}
          zoneName={zone.name}
        />
      </View>

      <View style={styles.facts}>
        <Fact
          icon="time-outline"
          label="Last update"
          value={age.label}
          tone={age.stale ? colors.warning : undefined}
        />
        {data?.accuracyMeters ? (
          <Fact
            icon="locate-outline"
            label="Accurate to"
            value={`± ${formatDistance(data.accuracyMeters)}`}
          />
        ) : null}
        {ward.lastGateScan ? (
          <Fact
            icon={ward.lastGateScan.direction === 'in' ? 'log-in-outline' : 'log-out-outline'}
            label="Last gate scan"
            value={`${ward.lastGateScan.direction === 'in' ? 'In' : 'Out'} ${isoToDateTime(ward.lastGateScan.at)}`}
          />
        ) : null}
      </View>

      {/* An old fix is worse than no fix if it is presented as current. */}
      {age.stale ? (
        <Note
          icon="alert-circle-outline"
          tone="warning"
          text={`This position is ${age.label} — locations are only sent while ${ward.name} has the app open, so it may not be where they are now.`}
        />
      ) : null}
    </Card>
  );
}

function Header({
  name,
  onRefresh,
  busy,
}: {
  name: string;
  onRefresh: () => void;
  busy?: boolean;
}) {
  return (
    <View style={styles.head}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.h3, { color: colors.text }]} numberOfLines={2}>
          Where {name} is
        </Text>
        <Text style={[type.small, { color: colors.textMuted }]}>
          Against the campus boundary
        </Text>
      </View>
      <Pressable
        onPress={onRefresh}
        hitSlop={10}
        disabled={busy}
        style={({ pressed }) => [styles.refresh, pressed && { opacity: 0.6 }]}
      >
        <Ionicons
          name={busy ? 'hourglass-outline' : 'refresh-outline'}
          size={16}
          color={colors.primary}
        />
      </Pressable>
    </View>
  );
}

/** What the app can always answer, with or without GPS. */
function GateFallback({ ward }: { ward: WardDetail }) {
  const onCampus = ward.currentStatus === 'IN';
  const scan = ward.lastGateScan;

  return (
    <View
      style={[
        styles.verdict,
        { marginTop: spacing.lg, backgroundColor: onCampus ? colors.successBg : colors.infoBg },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: onCampus ? colors.success : colors.info }]} />
      <Text
        style={[type.smallMed, { color: onCampus ? colors.success : colors.info, flexShrink: 0 }]}
      >
        {onCampus ? 'On campus' : 'Currently out'}
      </Text>
      <Text
        style={[
          type.small,
          { color: colors.textMuted, flex: 1, textAlign: 'right' },
        ]}
        numberOfLines={2}
      >
        {scan
          ? `${scan.direction === 'in' ? 'In' : 'Out'} ${isoToDateTime(scan.at)}`
          : 'No gate scan yet'}
      </Text>
    </View>
  );
}

function Fact({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <View style={styles.factRow}>
      <Ionicons name={icon} size={14} color={colors.textFaint} style={{ flexShrink: 0 }} />
      <Text style={[type.small, { color: colors.textMuted, flexShrink: 1 }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[type.smallMed, { color: tone ?? colors.text, flex: 1, textAlign: 'right' }]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  refresh: {
    width: 32,
    height: 32,
    flexShrink: 0,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verdict: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  facts: {
    gap: 2,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
});
