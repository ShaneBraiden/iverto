/**
 * Date and time pickers, built from the app's own sheet.
 *
 * The native picker would mean another dependency and a different look on each
 * platform; a scrolling list of real options matches the rest of the app and
 * gives the form an actual value to submit.
 */
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Sheet } from '@/components/Sheet';
import { colors, radius, spacing, type } from '@/theme';
import { formatDate, formatTime, relativeDay, timeSlots, upcomingDates } from '@/lib/datetime';

export function DateSheet({
  visible,
  onClose,
  value,
  onSelect,
  title = 'Pick a date',
  /** Nothing before this is selectable — the return date can't precede the leave date. */
  minDate,
}: {
  visible: boolean;
  onClose: () => void;
  value: Date;
  onSelect: (date: Date) => void;
  title?: string;
  minDate?: Date;
}) {
  const options = useMemo(() => {
    const all = upcomingDates(60);
    if (!minDate) return all;
    const floor = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()).getTime();
    return all.filter((d) => d.getTime() >= floor);
  }, [minDate]);

  const selected = formatDate(value);

  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle="Next 60 days" scroll={false}>
      <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={styles.list}>
        {options.map((d) => {
          const label = formatDate(d);
          const on = label === selected;
          return (
            <Option
              key={label}
              title={label}
              subtitle={relativeDay(d)}
              selected={on}
              onPress={() => {
                onSelect(d);
                onClose();
              }}
            />
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

export function TimeSheet({
  visible,
  onClose,
  value,
  onSelect,
  title = 'Pick a time',
}: {
  visible: boolean;
  onClose: () => void;
  value: Date;
  onSelect: (time: Date) => void;
  title?: string;
}) {
  const options = useMemo(() => timeSlots(15), []);
  const selected = formatTime(value);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle="15-minute slots"
      scroll={false}
    >
      <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={styles.list}>
        {options.map((t) => {
          const label = formatTime(t);
          const on = label === selected;
          return (
            <Option
              key={label}
              title={label}
              selected={on}
              onPress={() => {
                onSelect(t);
                onClose();
              }}
            />
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

function Option({
  title,
  subtitle,
  selected,
  onPress,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, selected && styles.rowActive, pressed && { opacity: 0.7 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyMed, { color: selected ? colors.primary : colors.text }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.small, { color: colors.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      {selected ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.glass,
  },
  rowActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
});
