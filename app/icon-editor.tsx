/**
 * Admin — per-group branding editor.
 *
 * The admin picks exactly which students belong to the group, then sets the
 * app icon AND the app name that those students alone will see. Everyone
 * outside the selection keeps the default Iverto.ai branding.
 *
 * Saving posts the whole thing to `POST /admin/groups/:id/branding`. Note that
 * `memberStudentIds` **replaces** the roster rather than adding to it, which
 * is why the picker seeds from the group's current members and why the button
 * says how many will be left in it.
 *
 * On the device side, `GET /me/branding` carries a `version`; when that changes
 * the member's app calls the native alternate-icon setter. Icon variants have
 * to be declared at build time, so a member device needs a build that contains
 * them — the payload here is the assignment, not the artwork.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import {
  Button,
  Card,
  Checkbox,
  Divider,
  ErrorState,
  Field,
  LoadMore,
  Loader,
  Note,
  PoweredBy,
  Row,
  SectionHeader,
} from '@/components/ui';
import { colors, font, radius, spacing, type } from '@/theme';
import { DEFAULT_APP_NAME, iconPresets, ROSTER_PAGE_SIZE, SHAPES } from '@/constants/config';
import { admin as adminApi } from '@/lib/api/endpoints';
import { errorMessage, fromPage, usePagedQuery, useMutation, useQuery } from '@/lib/api/useQuery';
import { AttachmentError, pickAndUpload, type PickedFile } from '@/lib/attachments';
import { timeAgo } from '@/lib/datetime';

/** The server caps these; enforcing them here keeps the preview honest. */
const MAX_APP_NAME = 14;
const MAX_LABEL = 2;

export default function BrandingEditor() {
  const { group: groupId } = useLocalSearchParams<{ group?: string }>();

  const groupQuery = useQuery((signal) => adminApi.group(groupId!, signal), [groupId], {
    enabled: !!groupId,
  });
  const group = groupQuery.data;

  const [query, setQuery] = useState('');
  const [needle, setNeedle] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setNeedle(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  /* The roster is campus-wide and paginated, so the picker searches it rather
     than trying to hold every student in memory. */
  const roster = usePagedQuery(
    (cursor, signal) =>
      adminApi
        .roster({ q: needle || undefined, cursor, limit: ROSTER_PAGE_SIZE }, signal)
        .then(fromPage),
    [needle]
  );

  const [preset, setPreset] = useState(iconPresets[0]);
  const [shape, setShape] = useState(SHAPES[0]);
  const [monogram, setMonogram] = useState('');
  const [appName, setAppName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [icon, setIcon] = useState<PickedFile | null>(null);
  const [iconKey, setIconKey] = useState<string | null>(null);
  const [iconError, setIconError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  /** Everything the form shows starts from what the group already has. */
  const seed = React.useCallback(() => {
    if (!group) return;
    setPreset(
      iconPresets.find((p) => p.colors[0] === group.iconColors?.[0]) ?? iconPresets[0]
    );
    setShape(SHAPES.find((s) => s.id === group.shape) ?? SHAPES[0]);
    setMonogram(group.iconLabel ?? '');
    setAppName(group.appName ?? '');
    setSelected((group.members ?? []).map((m) => m.studentId));
    setIcon(null);
    setIconKey(group.iconKey ?? null);
    setIconError(null);
  }, [group]);

  useEffect(() => seed(), [seed]);

  const shown = useMemo(() => roster.data ?? [], [roster.data]);
  const allShown = shown.length > 0 && shown.every((s) => selected.includes(s.id));

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((r) => r !== id) : [...cur, id]));

  const toggleAllShown = () =>
    setSelected((cur) =>
      allShown
        ? cur.filter((r) => !shown.some((s) => s.id === r))
        : Array.from(new Set([...cur, ...shown.map((s) => s.id)]))
    );

  const apply = useMutation(
    () =>
      adminApi.applyBranding(group!.id, {
        appName: (appName.trim() || DEFAULT_APP_NAME).slice(0, MAX_APP_NAME),
        iconColors: [...preset.colors],
        shape: shape.id,
        iconLabel: (monogram || 'IV').slice(0, MAX_LABEL).toUpperCase(),
        iconKey: iconKey ?? undefined,
        memberStudentIds: selected,
      }),
    {
      onSuccess: (updated) => {
        Alert.alert(
          'Branding applied',
          `${updated?.memberCount ?? selected.length} student${
            (updated?.memberCount ?? selected.length) === 1 ? '' : 's'
          } will see it on next launch.`,
          [{ text: 'Done', onPress: () => router.back() }]
        );
      },
      onError: (err) => Alert.alert("Couldn't apply that", errorMessage(err)),
    }
  );

  const uploadIcon = async () => {
    if (icon || iconKey) {
      setIcon(null);
      setIconKey(null);
      return;
    }
    setUploading(true);
    setIconError(null);
    try {
      const picked = await pickAndUpload('group-icon', ['image/png', 'image/jpeg']);
      if (picked) {
        setIconKey(picked.upload.key);
        setIcon(picked.file);
      }
    } catch (err) {
      setIconError(
        err instanceof AttachmentError
          ? err.message
          : errorMessage(err, "Couldn't upload that icon.")
      );
    } finally {
      setUploading(false);
    }
  };

  if (!group) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Branding" />
        <Screen clearTabBar={false}>
          {groupQuery.error ? (
            <ErrorState message={errorMessage(groupQuery.error)} onRetry={groupQuery.refetch} />
          ) : (
            <Loader label="Loading group…" />
          )}
        </Screen>
      </View>
    );
  }

  const removing = (group.members ?? []).filter((m) => !selected.includes(m.studentId)).length;

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
          <Text style={[type.caption, { color: 'rgba(255,255,255,0.5)' }]}>
            HOME SCREEN PREVIEW
          </Text>
          <View style={styles.homeRow}>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <LinearGradient
                colors={preset.colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.bigIcon, { borderRadius: shape.radius }]}
              >
                <Text style={styles.bigIconText}>
                  {(monogram || 'IV').slice(0, MAX_LABEL).toUpperCase()}
                </Text>
              </LinearGradient>
              <Text style={styles.homeLabel} numberOfLines={1}>
                {appName || DEFAULT_APP_NAME}
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
            {`Seen by ${selected.length} student${selected.length === 1 ? '' : 's'}`}
          </Text>
        </LinearGradient>

        {/* Target group */}
        <Card>
          <Row icon="people-circle-outline" label="Group" value={group.name} />
          <Row icon="person-outline" label="Students selected" value={`${selected.length}`} />
          <Row icon="time-outline" label="Last change" value={timeAgo(group.updatedAt)} />
        </Card>

        {/* App name */}
        <View style={{ gap: spacing.md }}>
          <Text style={[type.h3, { color: colors.text }]}>App name</Text>
          <Field
            placeholder={DEFAULT_APP_NAME}
            icon="phone-portrait-outline"
            value={appName}
            onChangeText={setAppName}
            maxLength={MAX_APP_NAME}
            hint={`Shown under the icon on member devices. ${MAX_APP_NAME} characters at most; keep it under 12 so it isn't truncated.`}
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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
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
          maxLength={MAX_LABEL}
          autoCapitalize="characters"
          hint="Used when no custom image is uploaded."
        />

        <Pressable style={[styles.upload, !!(icon || iconKey) && styles.uploadOn]} onPress={uploadIcon}>
          <Ionicons
            name={icon || iconKey ? 'image' : 'image-outline'}
            size={20}
            color={colors.primary}
          />
          <View style={{ flex: 1 }}>
            <Text style={[type.smallMed, { color: colors.text }]} numberOfLines={1}>
              {uploading
                ? 'Uploading…'
                : (icon?.name ?? (iconKey ? 'Custom icon on file' : 'Upload custom icon'))}
            </Text>
            <Text style={[type.small, { color: colors.textFaint }]}>
              PNG, 1024×1024, no transparency · max 5 MB
            </Text>
          </View>
          <Ionicons
            name={icon || iconKey ? 'close-circle' : 'chevron-forward'}
            size={icon || iconKey ? 18 : 16}
            color={colors.textFaint}
          />
        </Pressable>
        {iconError ? <Note icon="alert-circle-outline" tone="danger" text={iconError} /> : null}

        {/* Student picker */}
        <View>
          <SectionHeader
            title="Who gets this branding"
            actionLabel={allShown ? 'Clear shown' : 'Select shown'}
            onAction={toggleAllShown}
          />
          <Field
            placeholder="Search by roll number or name"
            icon="search-outline"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
          <View style={{ height: spacing.md }} />
          <Card padded={false}>
            {roster.loading ? (
              <Loader />
            ) : roster.error ? (
              <View style={{ padding: spacing.lg }}>
                <ErrorState message={errorMessage(roster.error)} onRetry={roster.refetch} />
              </View>
            ) : shown.length === 0 ? (
              <View style={{ padding: spacing.xl, alignItems: 'center' }}>
                <Text style={[type.small, { color: colors.textMuted }]}>
                  {needle ? `No students match “${needle}”.` : 'The roster is empty.'}
                </Text>
              </View>
            ) : (
              shown.map((s, i) => {
                const on = selected.includes(s.id);
                /* Branded elsewhere: selecting them here moves them, because
                   a student belongs to one group at a time. */
                const elsewhere = s.groupId && s.groupId !== group.id;
                return (
                  <View key={s.id}>
                    <Pressable
                      onPress={() => toggle(s.id)}
                      style={({ pressed }) => [styles.pickRow, pressed && { opacity: 0.6 }]}
                    >
                      <Checkbox checked={on} />
                      <View style={{ flex: 1 }}>
                        <Text style={[type.bodyMed, { color: colors.text }]}>{s.name}</Text>
                        <Text style={[type.small, { color: colors.textMuted }]}>
                          {[s.rollNumber, s.roomNumber].filter(Boolean).join(' · ')}
                        </Text>
                        {elsewhere ? (
                          <Text style={[type.small, { color: colors.warning }]}>
                            Currently in {s.groupName}
                          </Text>
                        ) : null}
                      </View>
                      {on ? (
                        <View style={styles.onTag}>
                          <Text style={[type.caption, { color: colors.primary }]}>BRANDED</Text>
                        </View>
                      ) : null}
                    </Pressable>
                    {i < shown.length - 1 ? <Divider inset={spacing.lg + 34} /> : null}
                  </View>
                );
              })
            )}
          </Card>
          <View style={{ height: spacing.md }} />
          <LoadMore
            hasMore={roster.hasMore}
            loading={roster.loadingMore}
            onPress={roster.loadMore}
          />
        </View>

        {/* Applying replaces the roster, so anyone dropped needs calling out. */}
        {removing > 0 ? (
          <Note
            icon="alert-circle-outline"
            tone="warning"
            text={`${removing} student${removing === 1 ? '' : 's'} currently in this group ${removing === 1 ? 'is' : 'are'} no longer selected and will be removed from it, returning to the default branding.`}
          />
        ) : null}

        <Note
          icon="information-circle-outline"
          text="iOS shows a system prompt when the icon changes. Android applies it silently on next launch. Students outside this selection keep the default Iverto.ai branding."
        />

        {apply.error ? (
          <Note icon="alert-circle-outline" tone="danger" text={errorMessage(apply.error)} />
        ) : null}

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button
            label="Reset"
            variant="secondary"
            icon="refresh-outline"
            full={false}
            style={{ flex: 1 }}
            onPress={seed}
          />
          <Button
            label={`Apply to ${selected.length}`}
            icon="checkmark"
            full={false}
            loading={apply.pending}
            disabled={selected.length === 0 || apply.pending}
            style={{ flex: 1.4 }}
            onPress={() => apply.mutate()}
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
  uploadOn: {
    borderStyle: 'solid',
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
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
