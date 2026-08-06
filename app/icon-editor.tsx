/**
 * Admin — per-group branding editor.
 *
 * The admin picks exactly which students belong to the group, then sets the
 * app icon AND the app name that those students alone will see on their home
 * screen. Everyone outside the selection keeps the default Iverto.ai branding.
 *
 * Wiring note: on save, POST the selected roll numbers + branding payload to
 * the branding endpoint, then call the native alternate-icon API
 * (expo-dynamic-app-icon / react-native-change-icon) on each member device.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import {
  Button,
  Card,
  Checkbox,
  Divider,
  Field,
  Note,
  PoweredBy,
  Row,
  SectionHeader,
} from '@/components/ui';
import { colors, font, radius, spacing, type } from '@/theme';
import { groups, iconPresets, roster } from '@/constants/sample';

const SHAPES: { id: string; label: string; radius: number }[] = [
  { id: 'squircle', label: 'Squircle', radius: 22 },
  { id: 'rounded', label: 'Rounded', radius: 14 },
  { id: 'circle', label: 'Circle', radius: 44 },
  { id: 'square', label: 'Square', radius: 4 },
];

export default function BrandingEditor() {
  const { group: groupId } = useLocalSearchParams<{ group?: string }>();
  const group = groups.find((g) => g.id === groupId) ?? groups[0];

  const [preset, setPreset] = useState(
    iconPresets.find((p) => p.colors[0] === group.iconColors[0]) ?? iconPresets[0],
  );
  const [shape, setShape] = useState(SHAPES.find((s) => s.id === group.shape) ?? SHAPES[0]);
  const [monogram, setMonogram] = useState(group.iconLabel);
  const [appName, setAppName] = useState(group.appName);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>(group.memberRollNos);

  const filtered = useMemo(
    () => roster.filter((s) => s.rollNo.toLowerCase().includes(query.trim().toLowerCase())),
    [query],
  );
  const allShown = filtered.length > 0 && filtered.every((s) => selected.includes(s.rollNo));

  const toggle = (rollNo: string) =>
    setSelected((cur) =>
      cur.includes(rollNo) ? cur.filter((r) => r !== rollNo) : [...cur, rollNo],
    );

  const toggleAllShown = () =>
    setSelected((cur) =>
      allShown
        ? cur.filter((r) => !filtered.some((s) => s.rollNo === r))
        : Array.from(new Set([...cur, ...filtered.map((s) => s.rollNo)])),
    );

  const reset = () => {
    setPreset(iconPresets.find((p) => p.colors[0] === group.iconColors[0]) ?? iconPresets[0]);
    setShape(SHAPES.find((s) => s.id === group.shape) ?? SHAPES[0]);
    setMonogram(group.iconLabel);
    setAppName(group.appName);
    setSelected(group.memberRollNos);
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Branding" subtitle={group.name} />
      <Screen clearTabBar={false}>
        {/* Live preview: a mock home screen */}
        <LinearGradient
          colors={['#2A2A33', '#16161C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.phone}
        >
          <Text style={[type.caption, { color: 'rgba(255,255,255,0.5)' }]}>HOME SCREEN PREVIEW</Text>
          <View style={styles.homeRow}>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <LinearGradient
                colors={preset.colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.bigIcon, { borderRadius: shape.radius }]}
              >
                <Text style={styles.bigIconText}>
                  {(monogram || 'IV').slice(0, 2).toUpperCase()}
                </Text>
              </LinearGradient>
              <Text style={styles.homeLabel} numberOfLines={1}>
                {appName || 'Iverto.ai'}
              </Text>
            </View>
            {['Mail', 'Notes'].map((n) => (
              <View key={n} style={{ alignItems: 'center', gap: 6, opacity: 0.3 }}>
                <View style={[styles.ghostIcon, { borderRadius: shape.radius }]} />
                <Text style={styles.homeLabel}>{n}</Text>
              </View>
            ))}
          </View>
          <Text style={[type.small, { color: 'rgba(255,255,255,0.45)' }]}>
            Seen by {selected.length} of {roster.length} students on the roster
          </Text>
        </LinearGradient>

        {/* Target group */}
        <Card>
          <Row icon="people-circle-outline" label="Group" value={group.name} />
          <Row icon="person-outline" label="Students selected" value={`${selected.length}`} />
          <Row icon="time-outline" label="Last change" value={group.updated} />
        </Card>

        {/* App name */}
        <View style={{ gap: spacing.md }}>
          <Text style={[type.h3, { color: colors.text }]}>App name</Text>
          <Field
            placeholder="Iverto.ai"
            icon="phone-portrait-outline"
            value={appName}
            onChangeText={setAppName}
            maxLength={14}
            hint="Shown under the icon on member devices. Keep it under 12 characters so it isn't truncated."
          />
        </View>

        {/* Icon theme */}
        <View style={{ gap: spacing.md }}>
          <Text style={[type.h3, { color: colors.text }]}>Icon theme</Text>
          <View style={styles.presetGrid}>
            {iconPresets.map((p) => {
              const active = p.id === preset.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setPreset(p)}
                  style={[styles.preset, active && styles.presetActive]}
                >
                  <LinearGradient
                    colors={p.colors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.presetSwatch}
                  >
                    {active ? <Ionicons name="checkmark" size={18} color="#fff" /> : null}
                  </LinearGradient>
                  <Text
                    style={[type.small, { color: active ? colors.primary : colors.textMuted }]}
                    numberOfLines={1}
                  >
                    {p.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Shape */}
        <View style={{ gap: spacing.md }}>
          <Text style={[type.h3, { color: colors.text }]}>Shape</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              {SHAPES.map((s) => {
                const active = s.id === shape.id;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => setShape(s)}
                    style={[styles.shape, active && styles.presetActive]}
                  >
                    <View
                      style={[
                        styles.shapePreview,
                        { borderRadius: s.radius * 0.7 },
                        active && { backgroundColor: colors.primary },
                      ]}
                    />
                    <Text
                      style={[type.small, { color: active ? colors.primary : colors.textMuted }]}
                    >
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* Monogram / upload */}
        <Field
          label="Monogram"
          placeholder="Up to 2 characters"
          icon="text-outline"
          value={monogram}
          onChangeText={setMonogram}
          maxLength={2}
          autoCapitalize="characters"
          hint="Used when no custom image is uploaded."
        />

        <Pressable style={styles.upload}>
          <Ionicons name="image-outline" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[type.smallMed, { color: colors.text }]}>Upload custom icon</Text>
            <Text style={[type.small, { color: colors.textFaint }]}>
              PNG, 1024×1024, no transparency
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>

        {/* Student picker */}
        <View>
          <SectionHeader
            title="Who gets this branding"
            actionLabel={allShown ? 'Clear shown' : 'Select shown'}
            onAction={toggleAllShown}
          />
          <Field
            placeholder="Search by roll number"
            icon="search-outline"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="characters"
          />
          <View style={{ height: spacing.md }} />
          <Card padded={false}>
            {filtered.length === 0 ? (
              <View style={{ padding: spacing.xl, alignItems: 'center' }}>
                <Text style={[type.small, { color: colors.textMuted }]}>
                  No students match “{query}”.
                </Text>
              </View>
            ) : (
              filtered.map((s, i) => {
                const on = selected.includes(s.rollNo);
                return (
                  <View key={s.rollNo}>
                    <Pressable
                      onPress={() => toggle(s.rollNo)}
                      style={({ pressed }) => [styles.pickRow, pressed && { opacity: 0.6 }]}
                    >
                      <Checkbox checked={on} />
                      <View style={{ flex: 1 }}>
                        <Text style={[type.bodyMed, { color: colors.text }]}>{s.rollNo}</Text>
                        <Text style={[type.small, { color: colors.textMuted }]}>
                          {s.label} · {s.year} · {s.hostel}
                        </Text>
                      </View>
                      {on ? (
                        <View style={styles.onTag}>
                          <Text style={[type.caption, { color: colors.primary }]}>BRANDED</Text>
                        </View>
                      ) : null}
                    </Pressable>
                    {i < filtered.length - 1 ? <Divider inset={spacing.lg + 34} /> : null}
                  </View>
                );
              })
            )}
          </Card>
        </View>

        <Note
          icon="information-circle-outline"
          tone="warning"
          text="iOS shows a system prompt when the icon changes. Android applies it silently on next launch. Students outside this selection keep the default Iverto.ai branding."
        />

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button
            label="Reset"
            variant="secondary"
            icon="refresh-outline"
            full={false}
            style={{ flex: 1 }}
            onPress={reset}
          />
          <Button
            label={`Apply to ${selected.length}`}
            icon="checkmark"
            full={false}
            disabled={selected.length === 0}
            style={{ flex: 1.4 }}
          />
        </View>

        <PoweredBy />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  phone: { borderRadius: radius.xxl, padding: spacing.xl, gap: spacing.lg },
  homeRow: { flexDirection: 'row', gap: spacing.xl },
  bigIcon: { width: 66, height: 66, alignItems: 'center', justifyContent: 'center' },
  bigIconText: { color: '#fff', fontFamily: font.bold, fontSize: 22, letterSpacing: 0.5 },
  ghostIcon: { width: 66, height: 66, backgroundColor: 'rgba(255,255,255,0.28)' },
  homeLabel: { color: '#fff', fontSize: 11, fontFamily: font.medium, maxWidth: 74 },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  preset: {
    width: '30.5%',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.glass,
  },
  presetActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  presetSwatch: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shape: {
    width: 84,
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.glass,
  },
  shapePreview: { width: 34, height: 34, backgroundColor: colors.borderStrong },
  upload: {
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
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  onTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
});
