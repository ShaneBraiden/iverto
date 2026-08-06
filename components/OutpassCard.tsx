import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Card, StatusPill } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import type { Outpass } from '@/constants/sample';

/**
 * Compact outpass summary used in every list across all three roles.
 * When `showRequester` is set the card leads with the role label + roll number
 * (e.g. "Student · 21CSE1042") — never a personal name.
 */
export function OutpassCard({
  item,
  role,
  showRequester,
}: {
  item: Outpass;
  role: 'student' | 'parent' | 'admin';
  showRequester?: boolean;
}) {
  return (
    <Card onPress={() => router.push(`/outpass/${item.id}?role=${role}`)}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={styles.idRow}>
            <Text style={[type.caption, { color: colors.primary }]}>{item.id}</Text>
            <View style={styles.catTag}>
              <Text style={[type.caption, { color: colors.textMuted }]}>
                {item.category.toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={[type.bodyMed, { color: colors.text }]} numberOfLines={1}>
            {showRequester ? `${item.student} · ${item.rollNo}` : item.reason}
          </Text>
          {showRequester ? (
            <Text style={[type.small, { color: colors.textMuted }]} numberOfLines={1}>
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
          {item.fromDate}, {item.fromTime} → {item.toDate}
        </Text>
      </View>
      <View style={styles.metaRow}>
        <Ionicons name="location-outline" size={14} color={colors.textMuted} />
        <Text style={[type.small, { color: colors.textMuted, flex: 1 }]} numberOfLines={1}>
          {item.destination}
        </Text>
      </View>
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
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
});
