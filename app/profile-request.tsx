/**
 * Profile update request — raised by a student or a guardian, applied by the
 * admin.
 *
 * Neither role can edit their own record directly, so this screen is a diff
 * builder: pick the fields to change, type the new value beside the current
 * one, say why, attach proof if there is any. The admin sees exactly that diff
 * on their side and approves or declines it.
 *
 * Route: /profile-request?role=student|parent&rollNo=21CSE1042
 */
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '@/components/Screen';
import { KeyboardAwareScroll, useKeyboardVisible } from '@/components/KeyboardAware';
import { Button, Card, Checkbox, Field, Note, PoweredBy } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import { editableFields, parent, roleLabels, student, wards } from '@/constants/sample';

type Role = 'student' | 'parent';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Current value on record for each field a role is allowed to change. */
function currentValues(role: Role, rollNo?: string): Record<string, string> {
  if (role === 'student') {
    const w = wards.find((x) => x.rollNo === rollNo) ?? student;
    return {
      phone: w.phone,
      email: w.email,
      hostel: w.hostel,
      guardian: w.guardian,
      address: 'Coimbatore, TN',
    };
  }
  return {
    phone: parent.phone,
    email: parent.email,
    relation: parent.relation,
    altPhone: '—',
    address: 'Coimbatore, TN',
  };
}

export default function ProfileRequestScreen() {
  const params = useLocalSearchParams<{ role?: string; rollNo?: string }>();
  const role: Role = params.role === 'parent' ? 'parent' : 'student';
  const rollNo = params.rollNo ?? student.rollNo;

  const fields = editableFields[role];
  const current = useMemo(() => currentValues(role, rollNo), [role, rollNo]);

  /** Which fields the user has opened for editing, and what they typed. */
  const [selected, setSelected] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [attached, setAttached] = useState(false);

  const keyboardUp = useKeyboardVisible();
  const reasonRef = useRef<TextInput>(null);

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  /** Only fields that are ticked *and* actually changed count as a request. */
  const changed = selected.filter((k) => (values[k] ?? '').trim().length > 0);

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Request an update"
        subtitle={role === 'student' ? `${roleLabels.student} · ${rollNo}` : parent.relation}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        <KeyboardAwareScroll
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
          extraBottomSpace={96}
        >
          <Note
            icon="shield-checkmark-outline"
            tone="brand"
            text="Your record is maintained by the campus office. Pick what needs changing and the admin will review it — usually within a working day."
          />

          <View>
            <Text style={[type.h3, { color: colors.text, marginBottom: spacing.md }]}>
              What needs changing?
            </Text>

            <View style={{ gap: spacing.md }}>
              {fields.map((f) => {
                const on = selected.includes(f.key);
                return (
                  <Card key={f.key} padded={false}>
                    <Pressable
                      onPress={() => toggle(f.key)}
                      style={({ pressed }) => [styles.pick, pressed && { opacity: 0.75 }]}
                    >
                      <Ionicons
                        name={f.icon as IconName}
                        size={18}
                        color={on ? colors.primary : colors.textMuted}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[type.bodyMed, { color: colors.text }]}>{f.label}</Text>
                        <Text style={[type.small, { color: colors.textMuted }]} numberOfLines={1}>
                          Now: {current[f.key] ?? '—'}
                        </Text>
                      </View>
                      <Checkbox checked={on} />
                    </Pressable>

                    {/* The input only exists once the field is ticked, so the
                        form stays short until the user asks for more of it. */}
                    {on ? (
                      <View style={styles.editZone}>
                        <View style={styles.diffRow}>
                          <Text style={[type.caption, { color: colors.textFaint }]}>CURRENT</Text>
                          <Text style={[type.small, { color: colors.textMuted, flex: 1 }]}>
                            {current[f.key] ?? '—'}
                          </Text>
                        </View>
                        <Field
                          label="New value"
                          placeholder={`Enter the correct ${f.label.toLowerCase()}`}
                          icon={f.icon as IconName}
                          value={values[f.key] ?? ''}
                          onChangeText={(t) => setValues((v) => ({ ...v, [f.key]: t }))}
                          keyboardType={f.keyboard ?? 'default'}
                          autoCapitalize={f.keyboard === 'email-address' ? 'none' : 'sentences'}
                          returnKeyType="done"
                        />
                      </View>
                    ) : null}
                  </Card>
                );
              })}
            </View>
          </View>

          <Field
            label="Why is this changing?"
            placeholder="A line is enough — e.g. new number, moved rooms"
            inputRef={reasonRef}
            multiline
            autoCapitalize="sentences"
          />

          <Pressable
            onPress={() => setAttached((v) => !v)}
            style={[styles.attach, attached && styles.attachOn]}
          >
            <Ionicons
              name={attached ? 'document-attach' : 'cloud-upload-outline'}
              size={20}
              color={colors.primary}
            />
            <View style={{ flex: 1 }}>
              <Text style={[type.smallMed, { color: colors.text }]}>
                {attached ? 'proof-of-change.pdf attached' : 'Attach supporting proof'}
              </Text>
              <Text style={[type.small, { color: colors.textFaint }]}>
                Optional · speeds up approval for phone and address changes
              </Text>
            </View>
            {attached ? (
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            ) : null}
          </Pressable>

          {/* Summary — what the admin will actually see. */}
          {changed.length ? (
            <Card>
              <Text style={[type.caption, { color: colors.primary }]}>
                {changed.length} CHANGE{changed.length === 1 ? '' : 'S'} TO SUBMIT
              </Text>
              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                {changed.map((k) => {
                  const f = fields.find((x) => x.key === k)!;
                  return (
                    <View key={k} style={styles.summaryRow}>
                      <Text style={[type.small, { color: colors.textMuted, width: 110 }]}>
                        {f.label}
                      </Text>
                      <Text
                        style={[type.small, { color: colors.textFaint, textDecorationLine: 'line-through' }]}
                        numberOfLines={1}
                      >
                        {current[k] ?? '—'}
                      </Text>
                      <Ionicons name="arrow-forward" size={12} color={colors.primary} />
                      <Text style={[type.smallMed, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                        {values[k]}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </Card>
          ) : (
            <Note
              icon="information-circle-outline"
              text="Tick a field above and type the new value to build your request."
            />
          )}

          <Button
            label={changed.length ? `Submit ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'Submit request'}
            icon="paper-plane-outline"
            disabled={changed.length === 0}
            onPress={() => router.back()}
          />

          {!keyboardUp ? <PoweredBy /> : null}
        </KeyboardAwareScroll>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  editZone: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.glassSoft,
  },
  diffRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
  attachOn: { borderStyle: 'solid', borderColor: colors.primary, backgroundColor: colors.primarySoft },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
