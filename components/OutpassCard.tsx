import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Card, StatusPill } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import { categoryLabel, shortId } from '@/lib/status';
import { isoRange } from '@/lib/datetime';
import type { Category, Permission } from '@/types';

/**
 * Compact permission summary used in every list across all three roles.
 * With `showRequester` the card leads with the student's name and roll number,
 * which is what an admin or a guardian scanning a queue needs first; a student
 * looking at their own history gets the reason instead.
 *
 * `categories` is optional: pass the tenant's category list and the tag shows
 * its label, otherwise the raw `type` is humanised.
 */
export function OutpassCard({
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
}

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
