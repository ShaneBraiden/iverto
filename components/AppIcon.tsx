/**
 * The branded app mark — whatever icon a university's admin set for a group,
 * drawn the way the branding editor previews it.
 *
 * Two renderings, in that order of preference:
 *   uploaded artwork (`uri`) — what the admin actually chose
 *   gradient + monogram      — the built-in scheme, and the fallback when the
 *                              artwork will not load
 *
 * The artwork is served from a signed URL that expires after five minutes, so
 * `onError` is not optional here: an expired link has to fall back to the
 * monogram rather than leave a hole in the header. The gradient needs no
 * network at all, which is also why it is what an offline launch shows.
 *
 * This is the in-app mark, not the launcher icon — see `app/icon-editor.tsx`
 * for why the home-screen icon is a build-time concern.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { shapeRadius } from '@/constants/config';
import { colors, font } from '@/theme';

/** A group with one colour still needs two ends for the gradient. */
function gradient(palette: string[] | undefined): [string, string] {
  if (!palette || palette.length === 0) return [colors.primary, colors.accent];
  if (palette.length === 1) return [palette[0], palette[0]];
  return [palette[0], palette[1]];
}

export function AppIcon({
  size = 40,
  shape,
  palette,
  label,
  uri,
  style,
}: {
  size?: number;
  /** `squircle` | `rounded` | `circle` | `square`; anything else reads as a squircle. */
  shape?: string;
  /** `iconColors` from the branding payload. */
  palette?: string[];
  /** `iconLabel` — up to two characters. */
  label?: string;
  /** Resolved read URL for uploaded artwork, when there is any. */
  uri?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = useState(false);

  /* A new link deserves a new attempt. Without this, one expired URL would
     latch the fallback on for the rest of the session — including after the
     admin rebrands and the context resolves a fresh URL. */
  useEffect(() => setFailed(false), [uri]);

  const radius = shapeRadius(shape, size);
  const box = { width: size, height: size, borderRadius: radius };

  if (uri && !failed) {
    return (
      <View style={[styles.clip, box, style]}>
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      </View>
    );
  }

  return (
    <LinearGradient
      colors={gradient(palette)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.tile, box, style]}
    >
      {/* Scaled off the tile so the same component reads correctly at 20px in
          the header and at 72px in the editor preview. */}
      <Text style={[styles.label, { fontSize: size * 0.34 }]} numberOfLines={1}>
        {(label || 'IV').slice(0, 2).toUpperCase()}
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden', flexShrink: 0, backgroundColor: colors.surface },
  tile: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label: { color: '#fff', fontFamily: font.bold, letterSpacing: 0.5 },
});
