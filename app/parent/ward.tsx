/**
 * Guardian — ward overview: whereabouts, hostel contact, guardians on record.
 *
 * The top bar names the ward in view and doubles as the sibling switch, so a
 * guardian can compare two children without going back to the dashboard.
 * "Late returns" is a link, not a number — the detail is on `late-entries`.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { useWard } from '@/components/WardContext';
import { WardSwitcher } from '@/components/WardSwitcher';
import {
  Avatar,
  Card,
  Divider,
  ListTile,
  PoweredBy,
  Row,
  SectionHeader,
  StatCard,
} from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import { guardians, lateEntriesFor, roleLabels } from '@/constants/sample';

export default function Ward() {
  const { ward, wards, selectWard, hasSiblings } = useWard();
  const [switching, setSwitching] = useState(false);

  const late = lateEntriesFor(ward.rollNo);
  const onCampus = ward.onCampus;

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title={hasSiblings ? 'My wards' : 'My ward'}
        subtitle={`${ward.rollNo} · ${ward.label}`}
        back={false}
        rightIcon={hasSiblings ? 'swap-horizontal-outline' : undefined}
        onRight={() => setSwitching(true)}
      />
      <Screen>
        <Card onPress={hasSiblings ? () => setSwitching(true) : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Avatar size={54} icon="school-outline" />
            <View style={{ flex: 1 }}>
              <Text style={[type.h3, { color: colors.text }]}>{ward.rollNo}</Text>
              <Text style={[type.small, { color: colors.textMuted }]}>{ward.name}</Text>
              <Text style={[type.small, { color: colors.textFaint }]}>{ward.department}</Text>
            </View>
            {hasSiblings ? (
              <View style={styles.switchTag}>
                <Text style={[type.caption, { color: colors.primary }]}>SWITCH</Text>
              </View>
            ) : null}
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
              Last scan {ward.lastScan}
            </Text>
          </View>
        </Card>

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <StatCard
            label="Passes this term"
            value={String(ward.passesThisTerm)}
            icon="ticket-outline"
            fg={colors.primary}
            bg={colors.primarySoft}
          />
          {/* The number alone tells a guardian nothing useful — tapping opens
              the incident log with times, delay and what the hostel did. */}
          <StatCard
            label={late.length ? 'Late returns' : 'No late returns'}
            value={String(late.length)}
            icon="alert-circle-outline"
            fg={late.length ? colors.danger : colors.success}
            bg={late.length ? colors.dangerBg : colors.successBg}
            onPress={() => router.push('/parent/late-entries')}
          />
        </View>

        <View>
          <SectionHeader title="Guardians on record" />
          <Card padded={false}>
            {guardians.map((g, i) => (
              <View key={g.relation}>
                <ListTile
                  icon={g.relation === roleLabels.father ? 'man-outline' : 'woman-outline'}
                  title={g.relation}
                  subtitle={g.phone}
                  right={
                    g.relation === ward.guardian ? (
                      <View style={styles.primaryTag}>
                        <Text style={[type.caption, { color: colors.primary }]}>APPROVER</Text>
                      </View>
                    ) : (
                      <View />
                    )
                  }
                />
                {i < guardians.length - 1 ? <Divider inset={spacing.lg + 48} /> : null}
              </View>
            ))}
          </Card>
        </View>

        <View>
          <SectionHeader title="Hostel details" />
          <Card>
            <Row icon="bed-outline" label="Room" value={ward.hostel} />
            <Row icon="people-circle-outline" label="Group" value={ward.group} />
            <Row icon="shield-checkmark-outline" label="Warden" value={roleLabels.warden} />
            <Row icon="call-outline" label="Warden contact" value={ward.wardenContact} />
          </Card>
        </View>

        <Card padded={false}>
          <ListTile
            icon="time-outline"
            title="Late entry log"
            subtitle={
              late.length
                ? `${late.length} record${late.length === 1 ? '' : 's'} · latest ${late[0].date}`
                : 'No late returns on record'
            }
            onPress={() => router.push('/parent/late-entries')}
          />
          <Divider inset={spacing.lg + 48} />
          <ListTile icon="call-outline" title="Call warden" subtitle={ward.wardenContact} />
          <Divider inset={spacing.lg + 48} />
          <ListTile icon="chatbubble-outline" title="Message student" subtitle={ward.phone} />
          <Divider inset={spacing.lg + 48} />
          <ListTile icon="warning-outline" title="Report an emergency" danger />
        </Card>

        <PoweredBy />
      </Screen>

      <WardSwitcher
        visible={switching}
        onClose={() => setSwitching(false)}
        wards={wards}
        activeRollNo={ward.rollNo}
        onSelect={selectWard}
      />
    </View>
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
  primaryTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  switchTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
});
