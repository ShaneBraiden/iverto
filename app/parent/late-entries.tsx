/**
 * Guardian — late entry log for the ward in view.
 *
 * Reached by tapping "Late returns" on the ward screen. A count on its own
 * invites the wrong conclusion, so each record spells out what actually
 * happened: the time the pass expected them back, the time the gate scanned
 * them in, how far apart those were, the reason given, and what the hostel
 * office did about it.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, TopBar } from '@/components/Screen';
import { useWard } from '@/components/WardContext';
import { Card, EmptyState, Note, PoweredBy, Row } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import { lateEntriesFor, type LateEntry } from '@/constants/sample';

/** "2h 15m late" reads better than "135 minutes late". */
function formatDelay(mins: number) {
  if (mins < 60) return `${mins} min late`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m late` : `${h}h late`;
}

export default function LateEntries() {
  const { ward } = useWard();
  const entries = lateEntriesFor(ward.rollNo);
  const worst = entries.reduce((a, b) => (b.delayMins > a ? b.delayMins : a), 0);

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Late entry log" subtitle={`${ward.rollNo} · ${ward.label}`} />
      {/* Still a tab screen (just hidden from the bar), so the floating tab
          bar is on screen and the content has to clear it. */}
      <Screen>
        {entries.length === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title="Always back on time"
            message={`${ward.rollNo} has returned within the pass window every time this term.`}
          />
        ) : (
          <>
            <Note
              icon="information-circle-outline"
              tone={worst >= 60 ? 'warning' : 'info'}
              text={`${entries.length} late return${entries.length === 1 ? '' : 's'} on record this term. The longest was ${formatDelay(worst)}. Records are logged by the gate scanner and reviewed by the warden.`}
            />

            <View style={{ gap: spacing.md }}>
              {entries.map((e) => (
                <EntryCard key={e.id} entry={e} />
              ))}
            </View>
          </>
        )}

        <PoweredBy />
      </Screen>
    </View>
  );
}

function EntryCard({ entry }: { entry: LateEntry }) {
  const major = entry.severity === 'major';
  const fg = major ? colors.danger : colors.warning;
  const bg = major ? colors.dangerBg : colors.warningBg;

  return (
    <Card>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={[type.caption, { color: colors.primary }]}>
            {entry.id} · PASS {entry.passId}
          </Text>
          <Text style={[type.bodyMed, { color: colors.text, marginTop: 2 }]}>{entry.date}</Text>
        </View>
        <View style={[styles.sev, { backgroundColor: bg }]}>
          <Ionicons name={major ? 'alert-circle' : 'time'} size={12} color={fg} />
          <Text style={[type.caption, { color: fg }]}>{formatDelay(entry.delayMins).toUpperCase()}</Text>
        </View>
      </View>

      {/* Expected vs actual, side by side — the whole point of the screen. */}
      <View style={styles.timeRow}>
        <View style={styles.timeBox}>
          <Text style={[type.caption, { color: colors.textFaint }]}>DUE BACK</Text>
          <Text style={[type.h3, { color: colors.text }]}>{entry.expected}</Text>
        </View>
        <View style={styles.arrow}>
          <Ionicons name="arrow-forward" size={16} color={fg} />
        </View>
        <View style={[styles.timeBox, { backgroundColor: bg, borderColor: 'transparent' }]}>
          <Text style={[type.caption, { color: fg }]}>SCANNED IN</Text>
          <Text style={[type.h3, { color: fg }]}>{entry.actual}</Text>
        </View>
      </View>

      <View style={styles.reasonBox}>
        <Text style={[type.caption, { color: colors.textFaint }]}>REASON GIVEN AT THE GATE</Text>
        <Text style={[type.small, { color: colors.text, marginTop: 4 }]}>{entry.reason}</Text>
      </View>

      <View style={{ marginTop: spacing.sm }}>
        <Row icon="shield-checkmark-outline" label="Action taken" value={entry.action} />
        <Row icon="enter-outline" label="Gate" value={entry.gate} />
        <Row icon="person-outline" label="Recorded by" value={entry.recordedBy} />
      </View>

      {!entry.acknowledged ? (
        <View style={styles.newTag}>
          <Ionicons name="ellipse" size={7} color={colors.primary} />
          <Text style={[type.caption, { color: colors.primary }]}>NEW SINCE YOU LAST CHECKED</Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  sev: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  timeBox: {
    flex: 1,
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.glassSoft,
  },
  arrow: { alignItems: 'center', justifyContent: 'center' },
  reasonBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.glassSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  newTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
