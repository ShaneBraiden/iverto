/**
 * Sibling picker.
 *
 * The guardian dashboard header shows the ward currently in view; tapping it
 * opens this sheet, which lists every child on the account with enough context
 * — roll number, course, hostel, how many requests are waiting — to pick the
 * right one without opening each in turn.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '@/components/Sheet';
import { Avatar } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import { pendingFor, type Ward } from '@/constants/sample';

export function WardSwitcher({
  visible,
  onClose,
  wards,
  activeRollNo,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  wards: Ward[];
  activeRollNo: string;
  onSelect: (rollNo: string) => void;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Switch ward"
      subtitle={`${wards.length} students on your account`}
    >
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
        {wards.map((w) => {
          const on = w.rollNo === activeRollNo;
          const waiting = pendingFor(w.rollNo).length;
          return (
            <Pressable
              key={w.rollNo}
              onPress={() => {
                onSelect(w.rollNo);
                onClose();
              }}
              style={({ pressed }) => [
                styles.row,
                on && styles.rowActive,
                pressed && { opacity: 0.75 },
              ]}
            >
              <Avatar size={44} icon="school-outline" />

              <View style={{ flex: 1 }}>
                <Text style={[type.bodyMed, { color: colors.text }]} numberOfLines={1}>
                  {w.rollNo}
                </Text>
                <Text style={[type.small, { color: colors.textMuted }]} numberOfLines={1}>
                  {w.label} · {w.hostel}
                </Text>

                <View style={styles.tagRow}>
                  <View
                    style={[
                      styles.tag,
                      { backgroundColor: w.onCampus ? colors.successBg : colors.infoBg },
                    ]}
                  >
                    <Text
                      style={[
                        type.caption,
                        { color: w.onCampus ? colors.success : colors.info },
                      ]}
                    >
                      {w.onCampus ? 'ON CAMPUS' : 'OUT'}
                    </Text>
                  </View>
                  {waiting > 0 ? (
                    <View style={[styles.tag, { backgroundColor: colors.warningBg }]}>
                      <Text style={[type.caption, { color: colors.warning }]}>
                        {waiting} WAITING
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <Ionicons
                name={on ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={on ? colors.primary : colors.textFaint}
              />
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.glass,
  },
  rowActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tagRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
});
