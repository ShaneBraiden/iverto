/**
 * Guardian — late entry log for the ward in view.
 *
 * Reached by tapping "Late returns" on the ward screen. A count on its own
 * invites the wrong conclusion, so each record spells out what actually
 * happened: the time the pass expected them back, the time the gate scanned
 * them in, how far apart those were, the reason given, and what the hostel
 * office did about it.
 *
 * Opening the screen is what clears the "new" flag — records are acknowledged
 * server-side once they have actually been shown, which is what the
 * `unacknowledged` counter on the response is for.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, TopBar } from '@/components/Screen';
import { useWard } from '@/components/WardContext';
import {
  Card,
  EmptyState,
  ErrorState,
  LoadMore,
  Loader,
  Note,
  PoweredBy,
  Row,
} from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import { PAGE_SIZE } from '@/constants/config';
import { parent as parentApi } from '@/lib/api/endpoints';
import { errorMessage, usePagedQuery } from '@/lib/api/useQuery';
import { formatMinutes, isoToDate, isoToTime } from '@/lib/datetime';
import type { LateEntry } from '@/types';

/** The server usually sends `delayLabel`; this covers the case where it doesn't. */
function delayText(entry: LateEntry) {
  return entry.delayLabel ?? `${formatMinutes(entry.delayMinutes)} late`;
}

export default function LateEntries() {
  const { ward } = useWard();
  const studentId = ward?.id;

  const list = usePagedQuery(
    (cursor, signal) =>
      parentApi
        .lateEntries(studentId!, { cursor, limit: PAGE_SIZE }, signal)
        .then((page) => ({
          items: page.data ?? [],
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
        })),
    [studentId],
    { enabled: !!studentId }
  );

  const entries = useMemo(() => list.data ?? [], [list.data]);
  const worst = entries.reduce((a, b) => (b.delayMinutes > a ? b.delayMinutes : a), 0);

  /* Acknowledging is fire-and-forget: the flag is a courtesy, and a failed
     call should not put an error in front of the guardian. Each id is only
     ever sent once per session. */
  const acknowledged = useRef(new Set<string>());
  useEffect(() => {
    entries
      .filter((e) => !e.acknowledged && !acknowledged.current.has(e.id))
      .forEach((e) => {
        acknowledged.current.add(e.id);
        parentApi.acknowledgeLateEntry(e.id).catch(() => acknowledged.current.delete(e.id));
      });
  }, [entries]);

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Late entry log"
        subtitle={ward ? `${ward.name} · ${ward.rollNumber}` : ''}
      />
      {/* Still a tab screen (just hidden from the bar), so the floating tab
          bar is on screen and the content has to clear it. */}
      <Screen>
        {list.loading || !ward ? (
          <Loader />
        ) : list.error ? (
          <ErrorState message={errorMessage(list.error)} onRetry={list.refetch} />
        ) : entries.length === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title="Always back on time"
            message={`${ward.name} has returned within the pass window every time this term.`}
          />
        ) : (
          <>
            <Note
              icon="information-circle-outline"
              tone={worst >= 60 ? 'warning' : 'info'}
              text={`${entries.length} late return${entries.length === 1 ? '' : 's'} on record. The longest was ${formatMinutes(worst)}. Records are logged by the gate scanner and reviewed by the warden.`}
            />

            <View style={{ gap: spacing.md }}>
              {entries.map((e) => (
                <EntryCard key={e.id} entry={e} />
              ))}
            </View>

            <LoadMore
              hasMore={list.hasMore}
              loading={list.loadingMore}
              onPress={list.loadMore}
              total={entries.length}
            />
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
            {entry.severity.toUpperCase()}
            {entry.resolution ? ` · ${entry.resolution.toUpperCase()}` : ''}
          </Text>
          <Text style={[type.bodyMed, { color: colors.text, marginTop: 2 }]}>
            {isoToDate(entry.date)}
          </Text>
        </View>
        <View style={[styles.sev, { backgroundColor: bg }]}>
          <Ionicons name={major ? 'alert-circle' : 'time'} size={12} color={fg} />
          <Text style={[type.caption, { color: fg }]}>{delayText(entry).toUpperCase()}</Text>
        </View>
      </View>

      {/* Expected vs actual, side by side — the whole point of the screen. */}
      <View style={styles.timeRow}>
        <View style={styles.timeBox}>
          <Text style={[type.caption, { color: colors.textFaint }]}>DUE BACK</Text>
          <Text style={[type.h3, { color: colors.text }]}>{entry.dueBackAt ?? '—'}</Text>
        </View>
        <View style={styles.arrow}>
          <Ionicons name="arrow-forward" size={16} color={fg} />
        </View>
        <View style={[styles.timeBox, { backgroundColor: bg, borderColor: 'transparent' }]}>
          <Text style={[type.caption, { color: fg }]}>SCANNED IN</Text>
          <Text style={[type.h3, { color: fg }]}>{isoToTime(entry.scannedInAt)}</Text>
        </View>
      </View>

      {entry.reason ? (
        <View style={styles.reasonBox}>
          <Text style={[type.caption, { color: colors.textFaint }]}>REASON GIVEN AT THE GATE</Text>
          <Text style={[type.small, { color: colors.text, marginTop: 4 }]}>{entry.reason}</Text>
        </View>
      ) : null}

      <View style={{ marginTop: spacing.sm }}>
        <Row
          icon="shield-checkmark-outline"
          label="Action taken"
          value={entry.resolutionNote ?? entry.resolution ?? 'Pending review'}
        />
        <Row icon="enter-outline" label="Gate" value={entry.gate ?? '—'} />
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
