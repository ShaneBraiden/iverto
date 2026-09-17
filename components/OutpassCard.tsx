import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Card, StatusPill } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import { categoryLabel, isOverdue, overdueMinutes, shortId, statusInfo } from '@/lib/status';
import { formatMinutes, isoRange } from '@/lib/datetime';
import type { Category, Permission } from '@/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** How the same pass can be drawn: a card of its own, or one row of a list. */
export type OutpassVariant = 'card' | 'list';

/**
 * Compact permission summary used in every list across all three roles.
 * With `showRequester` the card leads with the student's name and roll number,
 * which is what an admin or a guardian scanning a queue needs first; a student
 * looking at their own history gets the reason instead.
 *
 * `categories` is optional: pass the tenant's category list and the tag shows
 * its label, otherwise the raw `type` is humanised.
 *
 * `variant="list"` draws the same pass as a single row instead — same data,
 * same destination on tap, a third of the height. A warden working a campus
 * queue wants to compare twenty passes at a glance; a student reading their
 * own three wants the card. A row carries no surface of its own: the screen
 * stacks rows inside one card and asks every row but the first for a divider.
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
  variant = 'card',
  divider,
}: {
  item: Permission;
  role: 'student' | 'parent' | 'admin';
  showRequester?: boolean;
  categories?: Category[];
  variant?: OutpassVariant;
  /** List rows only: a hairline above the row. Every row but the first. */
  divider?: boolean;
}) {
  /* The status pill says "Active", which stops being the useful half of the
     truth the moment the return time has passed. A warden scanning the queue
     for who to chase needs that on the card, not one tap in. */
  const late = isOverdue(item);
  const open = () => router.push(`/outpass/${item.id}?role=${role}`);
  const headline =
    showRequester && item.student
      ? `${item.student.name} · ${item.student.rollNumber}`
      : item.reason;

  if (variant === 'list') {
    const status = statusInfo(item.status);
    return (
      <Pressable
        onPress={open}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.row,
          divider && styles.rowDivider,
          /* No lift and no shadow here — a row is not a surface, and twenty of
             them rising off the card would undo the point of the dense view.
             A tint under the finger is the whole of the press feedback. */
          pressed && { backgroundColor: colors.neutralBg },
        ]}
      >
        <View style={[styles.rowIcon, { backgroundColor: status.bg }]}>
          <Ionicons name={status.icon as IconName} size={15} color={status.fg} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={[type.smallMed, { color: colors.text }]} numberOfLines={1}>
            {headline}
          </Text>
          <Text style={[type.small, { color: colors.textMuted }]} numberOfLines={1}>
            {isoRange(item.startTime ?? item.startDate, item.endTime)}
          </Text>
          {/* Overdue earns the one extra line a dense row can spare: it is the
              only thing on this screen that asks the warden to act. */}
          {late ? (
            <Text style={[type.caption, { color: colors.danger }]} numberOfLines={1}>
              OVERDUE BY {formatMinutes(overdueMinutes(item)).toUpperCase()}
            </Text>
          ) : null}
        </View>
        <View style={styles.rowRight}>
          <Text style={[type.caption, { color: status.fg }]} numberOfLines={1}>
            {status.label.toUpperCase()}
          </Text>
          <Text style={[type.caption, { color: colors.textFaint }]} numberOfLines={1}>
            {shortId(item.id)}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Card onPress={open}>
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
            {headline}
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

  /* ---- list variant ---- */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    /* Fixed-size decoration in a flex row still shrinks by default, and a long
       name beside it would squash the circle into an oval. */
    flexShrink: 0,
  },
  /* The status label runs from "Out" to "Rejected by guardian", so it is
     capped rather than left to bid against the name for the row. */
  rowRight: { alignItems: 'flex-end', gap: 2, flexShrink: 0, maxWidth: 96 },
});
