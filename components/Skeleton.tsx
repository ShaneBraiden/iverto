/**
 * Loading skeletons.
 *
 * A spinner says "something is happening"; a skeleton says "this is what is
 * about to be here". Every screen that loads a shape it already knows — a list
 * of passes, a row of counters, a detail page — draws that shape in grey rather
 * than a centred spinner, so the layout does not jump when the data lands.
 *
 * All bones share ONE animation. Each bone driving its own loop would put them
 * out of phase, which reads as flicker rather than as a pulse, and would cost
 * one native animation per bone on a list of twenty. The value below is
 * ref-counted: the loop starts with the first bone on screen and stops with the
 * last, so nothing is running while there is nothing to animate.
 *
 * The pulse runs on the native driver (`opacity` only), so it keeps going at 60
 * fps while JS is busy parsing the response that is about to replace it.
 */
import React from 'react';
import {
  Animated,
  DimensionValue,
  Easing,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { cardBackground, colors, glassFill, radius, shadow, spacing } from '@/theme';

/* --------------------------------------------------------------- The pulse */

const pulse = new Animated.Value(0);
let onScreen = 0;
let loop: Animated.CompositeAnimation | null = null;

/** Opacity swing. Subtle on purpose — a hard blink is worse than no animation. */
const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.95] });

function usePulse() {
  React.useEffect(() => {
    onScreen += 1;
    if (onScreen === 1) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 650,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 650,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
    }
    return () => {
      onScreen -= 1;
      if (onScreen === 0) {
        loop?.stop();
        loop = null;
        pulse.setValue(0);
      }
    };
  }, []);
}

/* ----------------------------------------------------------------- Primitive */

/**
 * One grey bar standing in for a line of text, an icon or a swatch.
 * `width` takes a percentage so a bone reflows with its container rather than
 * being pinned to a size that only looks right on the phone it was written on.
 */
export function Bone({
  width = '100%',
  height = 12,
  round = 6,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  round?: number;
  style?: StyleProp<ViewStyle>;
}) {
  usePulse();
  return (
    <Animated.View
      style={[{ width, height, borderRadius: round, backgroundColor: colors.neutralBg, opacity }, style]}
    />
  );
}

/** Circular bone — avatars and icon tiles. */
export function BoneCircle({ size = 44 }: { size?: number }) {
  return <Bone width={size} height={size} round={size / 2} />;
}

/**
 * Card-shaped container matching `ui.tsx`'s `Card`, so a skeleton sits at the
 * same elevation and radius as the real thing and nothing shifts on swap.
 */
export function SkeletonCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.cardInner}>
        <View style={{ padding: spacing.lg }}>{children}</View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------ Compositions */

/** A pass / notification / request row: leading square, two lines, a pill. */
export function SkeletonListItem({ avatar = true }: { avatar?: boolean }) {
  return (
    <SkeletonCard>
      <View style={styles.row}>
        {avatar ? <Bone width={38} height={38} round={12} /> : null}
        <View style={{ flex: 1, gap: 8 }}>
          <Bone width="55%" height={13} />
          <Bone width="80%" height={11} />
        </View>
        <Bone width={64} height={22} round={radius.pill} />
      </View>
      <View style={styles.hair} />
      <View style={{ gap: 8 }}>
        <Bone width="70%" height={11} />
        <Bone width="45%" height={11} />
      </View>
    </SkeletonCard>
  );
}

/** `count` list items, spaced the way a real list is. */
export function SkeletonList({ count = 4, avatar = true }: { count?: number; avatar?: boolean }) {
  return (
    <View style={{ gap: spacing.md }}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonListItem key={i} avatar={avatar} />
      ))}
    </View>
  );
}

/**
 * Counter tiles. `columns` is how many sit side by side; `count` how many there
 * are in total, so a 4-up admin grid and a 3-up student row share one component.
 */
export function SkeletonStats({ count = 3, columns = 3 }: { count?: number; columns?: number }) {
  const rows: number[][] = [];
  for (let i = 0; i < count; i += columns) {
    rows.push(Array.from({ length: Math.min(columns, count - i) }, (_, k) => i + k));
  }
  return (
    <View style={{ gap: spacing.md }}>
      {rows.map((row, i) => (
        <View key={i} style={styles.statRow}>
          {row.map((k) => (
            <View key={k} style={[styles.card, { flex: 1 }]}>
              <View style={[styles.cardInner, styles.stat]}>
                <Bone width={32} height={32} round={11} />
                <Bone width={44} height={22} />
                <Bone width="72%" height={11} />
              </View>
            </View>
          ))}
          {/* Keeps a short final row the same tile width as a full one. */}
          {row.length < columns
            ? Array.from({ length: columns - row.length }, (_, k) => (
                <View key={`gap-${k}`} style={{ flex: 1 }} />
              ))
            : null}
        </View>
      ))}
    </View>
  );
}

/** Rows inside an existing card — activity feeds, guardian lists, rosters. */
export function SkeletonRows({ count = 5, inset = 60 }: { count?: number; inset?: number }) {
  return (
    <View>
      {Array.from({ length: count }, (_, i) => (
        <View key={i}>
          <View style={styles.tile}>
            <Bone width={32} height={32} round={11} />
            <View style={{ flex: 1, gap: 7 }}>
              <Bone width={`${60 + ((i * 13) % 30)}%`} height={12} />
              <Bone width="40%" height={10} />
            </View>
            <Bone width={38} height={10} />
          </View>
          {i < count - 1 ? (
            <View style={{ height: 1, backgroundColor: colors.border, marginLeft: inset }} />
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** Label / value pairs — the "trip details" and "hostel details" blocks. */
export function SkeletonDetailRows({ count = 5 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.detailRow}>
          <Bone width={28} height={28} round={10} />
          <Bone width="30%" height={11} />
          <View style={{ flex: 1 }} />
          <Bone width={`${22 + ((i * 9) % 20)}%`} height={11} />
        </View>
      ))}
    </View>
  );
}

/** The permission detail screen: banner, requester, trip block, timeline. */
export function SkeletonDetail() {
  return (
    <>
      <View style={styles.banner}>
        <Bone width={26} height={26} round={13} />
        <View style={{ flex: 1, gap: 8 }}>
          <Bone width="40%" height={14} />
          <Bone width="75%" height={11} />
        </View>
      </View>

      <SkeletonCard>
        <View style={styles.row}>
          <BoneCircle size={46} />
          <View style={{ flex: 1, gap: 8 }}>
            <Bone width="50%" height={14} />
            <Bone width="35%" height={11} />
          </View>
          <Bone width={70} height={22} round={radius.pill} />
        </View>
      </SkeletonCard>

      <SkeletonCard>
        <Bone width={90} height={10} style={{ marginBottom: spacing.md }} />
        <SkeletonDetailRows count={6} />
      </SkeletonCard>

      <SkeletonCard>
        <Bone width={60} height={10} style={{ marginBottom: spacing.md }} />
        <View style={{ gap: 8 }}>
          <Bone width="100%" height={12} />
          <Bone width="85%" height={12} />
        </View>
      </SkeletonCard>

      <SkeletonCard>
        <Bone width={130} height={10} style={{ marginBottom: spacing.lg }} />
        {Array.from({ length: 4 }, (_, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ alignItems: 'center' }}>
              <Bone width={30} height={30} round={15} />
              {i < 3 ? <View style={styles.stepLine} /> : null}
            </View>
            <View style={{ flex: 1, gap: 7, paddingBottom: i < 3 ? spacing.lg : 0 }}>
              <Bone width="45%" height={12} />
              <Bone width="30%" height={10} />
            </View>
          </View>
        ))}
      </SkeletonCard>
    </>
  );
}

/** Fields waiting on the server to say which ones exist. */
export function SkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <View style={{ gap: spacing.lg }}>
      {Array.from({ length: fields }, (_, i) => (
        <View key={i} style={{ gap: spacing.sm }}>
          <Bone width={`${22 + ((i * 11) % 22)}%`} height={11} />
          <Bone width="100%" height={52} round={radius.lg} />
        </View>
      ))}
    </View>
  );
}

/** A wrapping row of chips — pass categories, filters. */
export function SkeletonChips({ count = 4 }: { count?: number }) {
  const widths = [78, 96, 68, 110, 84, 92];
  return (
    <View style={styles.chipRow}>
      {Array.from({ length: count }, (_, i) => (
        <Bone key={i} width={widths[i % widths.length]} height={34} round={radius.pill} />
      ))}
    </View>
  );
}

/** The student dashboard, in the order the real one renders. */
export function SkeletonStudentHome() {
  return (
    <>
      <Bone width="100%" height={42} round={radius.md} />
      <SkeletonCard>
        <View style={styles.row}>
          <Bone width={100} height={10} />
          <View style={{ flex: 1 }} />
          <Bone width={72} height={22} round={radius.pill} />
        </View>
        <View style={{ gap: 8, marginTop: spacing.md }}>
          <Bone width="80%" height={15} />
          <Bone width="55%" height={11} />
        </View>
        <View style={styles.hair} />
        <Bone width="65%" height={11} />
      </SkeletonCard>
      <SkeletonStats count={3} columns={3} />
      <View style={{ gap: spacing.md }}>
        <Bone width={150} height={15} />
        <SkeletonListItem avatar={false} />
        <SkeletonListItem avatar={false} />
      </View>
    </>
  );
}

/** The guardian dashboard: a nudge strip, then approval cards. */
export function SkeletonApprovals({ count = 2 }: { count?: number }) {
  return (
    <>
      <Bone width="100%" height={54} round={radius.md} />
      <View style={{ gap: spacing.md }}>
        {Array.from({ length: count }, (_, i) => (
          <SkeletonCard key={i}>
            <View style={styles.row}>
              <BoneCircle size={42} />
              <View style={{ flex: 1, gap: 8 }}>
                <Bone width="50%" height={13} />
                <Bone width="70%" height={11} />
              </View>
            </View>
            <View style={styles.reasonBox}>
              <Bone width="35%" height={10} />
              <Bone width="85%" height={13} style={{ marginTop: 8 }} />
            </View>
            <View style={{ gap: 8, marginTop: spacing.md }}>
              <Bone width="60%" height={11} />
              <Bone width="55%" height={11} />
            </View>
            <View style={styles.actions}>
              <Bone width="48%" height={52} round={radius.lg} />
              <Bone width="48%" height={52} round={radius.lg} />
            </View>
          </SkeletonCard>
        ))}
      </View>
    </>
  );
}

/** The admin quick-tools grid. */
export function SkeletonTools({ count = 6, columns = 3 }: { count?: number; columns?: number }) {
  const rows: number[][] = [];
  for (let i = 0; i < count; i += columns) {
    rows.push(Array.from({ length: Math.min(columns, count - i) }, (_, k) => i + k));
  }
  return (
    <View style={{ gap: spacing.md }}>
      {rows.map((row, i) => (
        <View key={i} style={styles.statRow}>
          {row.map((k) => (
            <View key={k} style={styles.tool}>
              <Bone width={40} height={40} round={14} />
              <Bone width="70%" height={10} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** The ward overview: identity card, whereabouts, two counters, contact rows. */
export function SkeletonWard() {
  return (
    <>
      <SkeletonCard>
        <View style={styles.row}>
          <BoneCircle size={54} />
          <View style={{ flex: 1, gap: 8 }}>
            <Bone width="55%" height={16} />
            <Bone width="35%" height={11} />
            <Bone width="45%" height={11} />
          </View>
        </View>
        <Bone width="100%" height={42} round={radius.md} style={{ marginTop: spacing.lg }} />
      </SkeletonCard>

      <SkeletonCard>
        <View style={styles.row}>
          <View style={{ flex: 1, gap: 8 }}>
            <Bone width="60%" height={15} />
            <Bone width="45%" height={11} />
          </View>
          <BoneCircle size={32} />
        </View>
        <Bone width="100%" height={42} round={radius.md} style={{ marginTop: spacing.md }} />
        <Bone width="100%" height={150} round={radius.lg} style={{ marginTop: spacing.lg }} />
      </SkeletonCard>

      <SkeletonStats count={2} columns={2} />

      <SkeletonCard>
        <SkeletonDetailRows count={5} />
      </SkeletonCard>
    </>
  );
}

const styles = StyleSheet.create({
  /* Mirrors `styles.card` in components/ui.tsx — same radius, border and float,
     so a skeleton and the card that replaces it occupy identical space. */
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: cardBackground,
    overflow: 'hidden',
    ...shadow.card,
  },
  cardInner: { borderRadius: radius.xl, overflow: 'hidden', backgroundColor: glassFill.base },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  hair: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  statRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md },
  stat: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.neutralBg,
  },
  stepLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reasonBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.glassSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  tool: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: glassFill.base,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadow.card,
  },
});
