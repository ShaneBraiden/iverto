/**
 * Admin — per-group branding editor.
 *
 * The admin picks exactly which students belong to the group, then sets the
 * app icon AND the app name that those students alone will see. Everyone
 * outside the selection falls through to the next layer of branding — the
 * organisation's own mark where the dashboard has set one, and the stock
 * Iverto lockup only where it has not.
 *
 * Organisation admins only, like the groups list that reaches it — a warden
 * has no say in who is in a group or what it looks like.
 *
 * Saving posts the whole thing to `POST /admin/groups/:id/branding`. Note that
 * `memberStudentIds` **replaces** the roster rather than adding to it, which
 * is why the picker seeds from the group's current members and why the button
 * says how many will be left in it.
 *
 * What this actually changes today is the *in-app* mark: `GET /me/branding`
 * feeds `<AppIcon>` and the app name in every dashboard header, on the
 * member's device and their guardians'. It does **not** change the launcher
 * icon on the home screen — iOS alternate icons and Android activity-aliases
 * must be declared in the binary at build time, so no upload made here can
 * become one. Wiring that up needs a build-time roster of icons, not another
 * endpoint.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import {
  Button,
  Card,
  Checkbox,
  Divider,
  ErrorState,
  Field,
  LoadMore,
  Note,
  PoweredBy,
  Row,
  SectionHeader,
} from '@/components/ui';
import {
  Bone,
  SkeletonCard,
  SkeletonDetailRows,
  SkeletonForm,
  SkeletonRows,
} from '@/components/Skeleton';
import { colors, font, radius, spacing, type } from '@/theme';
import { DEFAULT_APP_NAME, iconPresets, ROSTER_PAGE_SIZE, SHAPES } from '@/constants/config';
import { admin as adminApi } from '@/lib/api/endpoints';
import { errorMessage, fromPage, usePagedQuery, useMutation, useQuery } from '@/lib/api/useQuery';
import {
  AttachmentError,
  canAttachUpload,
  pickAndUpload,
  uploadRejected,
  type PickedFile,
} from '@/lib/attachments';
import { timeAgo } from '@/lib/datetime';
import { useAuth } from '@/lib/auth';
import { useSignedUrl } from '@/lib/useSignedUrl';
import { AppIcon } from '@/components/AppIcon';
import type { UploadScanState } from '@/types';

/** The server caps these; enforcing them here keeps the preview honest. */
const MAX_APP_NAME = 14;
const MAX_LABEL = 2;

export default function BrandingEditor() {
  const { group: groupId } = useLocalSearchParams<{ group?: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const groupQuery = useQuery((signal) => adminApi.group(groupId!, signal), [groupId], {
    enabled: !!groupId && isAdmin,
  });
  const group = groupQuery.data;

  /* The artwork already on the group, for the preview. A freshly picked file
     wins over it — that one is local and needs no resolving. */
  const savedIconUri = useSignedUrl(group?.iconKey, group?.iconUrl);

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
    [needle],
    { enabled: isAdmin }
  );

  const [preset, setPreset] = useState(iconPresets[0]);
  const [shape, setShape] = useState(SHAPES[0]);
  const [monogram, setMonogram] = useState('');
  const [appName, setAppName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [icon, setIcon] = useState<PickedFile | null>(null);
  const [iconKey, setIconKey] = useState<string | null>(null);
  /** Only set for a freshly-picked icon — the group's own saved `iconKey` was scanned long ago. */
  const [iconScanState, setIconScanState] = useState<UploadScanState | null>(null);
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
          } and their guardians pick it up right away, or on next launch if the app is closed.`,
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
      setIconScanState(null);
      return;
    }
    setUploading(true);
    setIconError(null);
    try {
      /* The four types the branding bucket accepts. HEIC is in the list
         because that is what an iPhone hands over untouched. */
      const picked = await pickAndUpload('group-icon', [
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/heic',
      ]);
      if (picked) {
        setIconKey(picked.upload.fileId);
        setIconScanState(picked.upload.scanState);
        setIcon(picked.file);
        if (uploadRejected(picked.upload)) {
          setIconError(
            picked.upload.scanState === 'infected'
              ? "That image didn't pass the security scan. Pick a different one."
              : "That image couldn't be scanned. Pick a different one."
          );
        }
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

  /* After the hooks, before the group gate — a warden reaching this route by
     deep link or stale nav state goes back to the dashboard, not to an empty
     editor. */
  if (!isAdmin) return <Redirect href="/admin" />;

  if (!group) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Branding" />
        <Screen clearTabBar={false}>
          {groupQuery.error ? (
            <ErrorState error={groupQuery.error} onRetry={groupQuery.refetch} />
          ) : (
            <>
              <Bone width="100%" height={190} round={radius.xxl} />
              <SkeletonCard>
                <SkeletonDetailRows count={3} />
              </SkeletonCard>
              <SkeletonForm fields={2} />
            </>
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
        {/* Live preview. This is the in-app mark — the one members see in the
            dashboard header — drawn with the same `<AppIcon>` their device
            uses, so what the admin approves here is literally what ships.
            It is deliberately not framed as a home-screen preview: the
            launcher icon is fixed at build time and this screen cannot move
            it. */}
        <LinearGradient
          colors={['#2A2A33', '#16161C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.phone}
        >
          <Text style={[type.caption, { color: 'rgba(255,255,255,0.5)' }]}>IN-APP PREVIEW</Text>
          <View style={styles.homeRow}>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <AppIcon
                size={66}
                shape={shape.id}
                palette={[...preset.colors]}
                label={monogram}
                uri={icon ? icon.uri : iconKey ? savedIconUri : null}
              />
              <Text style={styles.homeLabel} numberOfLines={1}>
                {appName || DEFAULT_APP_NAME}
              </Text>
            </View>
          </View>
          <Text style={[type.small, { color: 'rgba(255,255,255,0.45)' }]}>
            {`Seen by ${selected.length} student${selected.length === 1 ? '' : 's'} and their guardians`}
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
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.smallMed, { color: colors.text }]} numberOfLines={1}>
              {uploading
                ? 'Uploading…'
                : (icon?.name ?? (iconKey ? 'Custom icon on file' : 'Upload custom icon'))}
            </Text>
            {/* 512px is the ask rather than the limit: this image is stored
                once and then fetched by every member of the group, so its size
                is paid for over and over. 5 MB is only what the server
                refuses. */}
            <Text style={[type.small, { color: colors.textFaint }]} numberOfLines={2}>
              Square PNG, JPEG or WebP · 512×512 is plenty · max 5 MB
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
              <SkeletonRows count={4} inset={spacing.lg + 34} />
            ) : roster.error ? (
              <View style={{ padding: spacing.lg }}>
                <ErrorState error={roster.error} onRetry={roster.refetch} />
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
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[type.bodyMed, { color: colors.text }]} numberOfLines={1}>
                          {s.name}
                        </Text>
                        <Text style={[type.small, { color: colors.textMuted }]} numberOfLines={1}>
                          {[s.rollNumber, s.roomNumber].filter(Boolean).join(' · ')}
                        </Text>
                        {elsewhere ? (
                          <Text style={[type.small, { color: colors.warning }]} numberOfLines={1}>
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

        {/* Applying replaces the roster, so anyone dropped needs calling out.
            What they drop *to* is the organisation's own branding where one is
            set, and only the stock Iverto mark otherwise — so the wording says
            "no longer see this one" rather than naming a destination. */}
        {removing > 0 ? (
          <Note
            icon="alert-circle-outline"
            tone="warning"
            text={`${removing} student${removing === 1 ? '' : 's'} currently in this group ${removing === 1 ? 'is' : 'are'} no longer selected and will be removed from it, so ${removing === 1 ? 'that device stops' : 'those devices stop'} showing this branding.`}
          />
        ) : null}

        <Note
          icon="information-circle-outline"
          text="Members see this straight away if the app is open, and on next launch otherwise — the mark and name in their dashboard header. Their guardians see it too. Students outside this selection fall back to your organisation's branding."
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
            disabled={
              selected.length === 0 ||
              apply.pending ||
              (iconScanState !== null && !canAttachUpload({ scanState: iconScanState }))
            }
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
    flexShrink: 0,
  },
});
