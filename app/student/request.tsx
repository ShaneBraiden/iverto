/**
 * Student — new outpass request form (UI only).
 *
 * The form is keyboard-first: each field hands focus to the next one, the
 * keyboard layout matches the field (phone pad for the contact number), and
 * the scroll view keeps whatever is focused above the keyboard. The decorative
 * footer stands down while typing so the submit button stays reachable.
 */
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Chip, Field, Note, PoweredBy, Row } from '@/components/ui';
import { TopBar } from '@/components/Screen';
import { KeyboardAwareScroll, useKeyboardVisible } from '@/components/KeyboardAware';
import { colors, radius, spacing, type } from '@/theme';
import { categories, student } from '@/constants/sample';

export default function NewRequest() {
  const [category, setCategory] = useState(categories[0]);
  const keyboardUp = useKeyboardVisible();

  const reasonRef = useRef<TextInput>(null);
  const contactRef = useRef<TextInput>(null);

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="New outpass" subtitle="Fill in your trip details" back={false} />
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        <KeyboardAwareScroll
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl }}
          extraBottomSpace={96}
        >
          {/* Requester summary — role label + roll number, no names */}
          <Card>
            <Row icon="person-outline" label="Requested by" value={student.name} />
            <Row icon="id-card-outline" label="Roll no." value={student.rollNo} />
            <Row icon="bed-outline" label="Hostel" value={student.hostel} />
            <Row icon="people-outline" label="Approver" value={student.guardian} />
          </Card>

          {/* Category */}
          <View style={{ gap: spacing.md }}>
            <Text style={[type.smallMed, { color: colors.textMuted }]}>Category</Text>
            <View style={styles.chips}>
              {categories.map((c) => (
                <Chip key={c} label={c} selected={c === category} onPress={() => setCategory(c)} />
              ))}
            </View>
          </View>

          {/* Dates */}
          <View style={{ gap: spacing.lg }}>
            <Text style={[type.smallMed, { color: colors.textMuted }]}>Leaving</Text>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <PickerBox icon="calendar-outline" label="Date" value="08 Aug 2026" />
              <PickerBox icon="time-outline" label="Time" value="06:00 PM" />
            </View>
            <Text style={[type.smallMed, { color: colors.textMuted }]}>Returning</Text>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <PickerBox icon="calendar-outline" label="Date" value="10 Aug 2026" />
              <PickerBox icon="time-outline" label="Time" value="08:00 PM" />
            </View>
          </View>

          <Field
            label="Destination"
            placeholder="Where are you going?"
            icon="location-outline"
            autoCapitalize="words"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => reasonRef.current?.focus()}
          />
          <Field
            label="Reason"
            placeholder="Briefly explain the reason for this outpass"
            inputRef={reasonRef}
            multiline
            autoCapitalize="sentences"
          />
          <Field
            label="Contact number during leave"
            placeholder="+91 00000 00000"
            icon="call-outline"
            inputRef={contactRef}
            keyboardType="phone-pad"
            autoComplete="tel"
            returnKeyType="done"
            hint="Your guardian is notified about this request immediately."
          />

          {/* Attachment */}
          <Pressable style={styles.attach}>
            <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[type.smallMed, { color: colors.text }]}>Attach supporting document</Text>
              <Text style={[type.small, { color: colors.textFaint }]}>
                Optional · PDF or image, max 5 MB
              </Text>
            </View>
          </Pressable>

          <Note
            icon="information-circle-outline"
            text="Once submitted, your guardian must approve before the warden can issue the gate pass."
          />

          <Button label="Submit request" icon="paper-plane-outline" />
          {!keyboardUp ? <PoweredBy /> : null}
        </KeyboardAwareScroll>
      </SafeAreaView>
    </View>
  );
}

function PickerBox({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
}) {
  return (
    <Pressable style={styles.picker}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <View>
        <Text style={[type.caption, { color: colors.textFaint }]}>{label.toUpperCase()}</Text>
        <Text style={[type.smallMed, { color: colors.text }]}>{value}</Text>
      </View>
      <Ionicons
        name="chevron-down"
        size={16}
        color={colors.textFaint}
        style={{ marginLeft: 'auto' }}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  picker: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 58,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.glassStrong,
  },
  attach: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.glass,
  },
});
