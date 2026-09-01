import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Card, StatusPill } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import { categoryLabel, isOverdue, overdueMinutes, shortId } from '@/lib/status';
import { formatMinutes, isoRange } from '@/lib/datetime';
import type { Category, Permission } from '@/types';

/**
 * Compact permission summary used in every list across all three roles.
 * With `showRequester` the card leads with the student's name and roll number,
 * which is what an admin or a guardian scanning a queue needs first; a student
 * looking at their own history gets the reason instead.
 *
 * `categories` is optional: pass the tenant's category list and the tag shows
 * its label, otherwise the raw `type` is humanised.
 *
 * Memoised, because this is the row every list is made of and most of what
 * re-renders those lists does not touch the rows: a keystroke in the search
 * box, a status chip toggling, a socket bumping the unread badge. All of them
 * re-render the screen while `item` keeps its identity, and without the memo
 * every card on screen — sixty of them, after three taps of "Load more" —
 * re-renders for each character typed. A genuinely new `item` still comes
 * through, because a refetch builds new objects and the shallow compare sees
 * that; there is no staleness to reason about.
 */
export const OutpassCard = React.memo(function OutpassCard({
  item,
  role,
  showRequester,
  categories,
}: {
  item: Permission;
  role: 'student' | 'parent' | 'admin';
  showRequester?: boolean;
  categories?: Category[];
}) {
  /* The status pill says "Active", which stops being the useful half of the
     truth the moment the return time has passed. A warden scanning the queue
     for who to chase needs that on the card, not one tap in. */
  const late = isOverdue(item);

  return (
    <Card onPress={() => router.push(`/outpass/${item.id}?role=${role}`)}>
      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={styles.idRow}>
            <Text style={[type.caption, { color: colors.primary }]} numberOfLines={1}>
              {shortId(item.id)}
            </Text>
            {/* Category labels are tenant-defined — "Medical emergency leave"
                is as valid as "Day". The tag shrinks before the pass id does. */}
            <View style={styles.catTag}>
              <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
                {categoryLabel(item, categories).toUpperCase()}
              </Text>
            </View>
          </View>
          {/* When the reason is the headline it gets two lines, because it is
              the whole content of the card; a name and roll number is one. */}
          <Text
            style={[type.bodyMed, { color: colors.text }]}
            numberOfLines={showRequester ? 1 : 2}
          >
            {showRequester && item.student
              ? `${item.student.name} · ${item.student.rollNumber}`
              : item.reason}
          </Text>
          {showRequester ? (
            <Text style={[type.small, { color: colors.textMuted }]} numberOfLines={2}>
              {item.reason}
            </Text>
          ) : null}
        </View>
        <StatusPill status={item.status} small />
      </View>

      <View style={styles.divider} />

      <View style={styles.metaRow}>
        <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
        <Text style={[type.small, { color: colors.textMuted, flex: 1 }]} numberOfLines={1}>
          {isoRange(item.startTime ?? item.startDate, item.endTime)}
        </Text>
      </View>
      {/* Added to the window rather than replacing it — how long they have
          been late and when they were due back are both worth reading. */}
      {late ? (
        <View style={styles.metaRow}>
          <Ionicons name="alert-circle" size={14} color={colors.danger} />
          <Text style={[type.smallMed, { color: colors.danger, flex: 1 }]} numberOfLines={1}>
            Overdue by {formatMinutes(overdueMinutes(item))}
          </Text>
        </View>
      ) : null}
      {item.destination ? (
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={14} color={colors.textMuted} />
          <Text style={[type.small, { color: colors.textMuted, flex: 1 }]} numberOfLines={1}>
            {item.destination}
          </Text>
        </View>
      ) : null}
    </Card>
  );
});

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  catTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.neutralBg,
    flexShrink: 1,
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
});
