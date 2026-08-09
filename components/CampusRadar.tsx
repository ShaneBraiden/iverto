/**
 * Where a ward is, relative to campus.
 *
 * Drawn rather than mapped. A tile map would need a key, a native module and a
 * rebuild, and it would answer a question nobody is asking: a guardian opening
 * this does not want to know which street their child is on, they want to know
 * *are they on campus, and if not, how far*. A radar answers exactly that, in
 * one glance, with no dependency beyond the SVG renderer already in the app.
 *
 * North is up. The shaded disc is the campus fence at true scale against the
 * range rings; the marker is the ward at their real bearing and distance. Once
 * the ward is further out than the radar's range the marker pins to the rim
 * and turns into an arrow, because past that point the direction is the only
 * honest thing left to draw.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { colors, font, spacing, type } from '@/theme';
import { compassLabel, formatDistance } from '@/lib/geo';

const SIZE = 232;
const CENTRE = SIZE / 2;
/** Leaves room for the range label to sit inside the outer ring. */
const MAX_RADIUS = CENTRE - 18;

export function CampusRadar({
  /** Metres from the centre of the fence. Null when there is no fix. */
  distance,
  /** Degrees clockwise from north, centre → ward. */
  bearing,
  /** The fence radius, in metres. */
  radiusMeters,
  inside,
  /** Dims everything when the fix is too old to stand behind. */
  stale,
  zoneName,
}: {
  distance: number | null;
  bearing: number | null;
  radiusMeters: number;
  inside: boolean | null;
  stale?: boolean;
  zoneName?: string | null;
}) {
  /* The radar scales to whichever is bigger: a campus that fills the view, or
     a ward far enough out to need the room. Clamped at the bottom so a student
     standing in the quad does not get a radar zoomed to twenty metres. */
  const range = Math.max(radiusMeters * 1.7, (distance ?? 0) * 1.25, 250);
  const scale = MAX_RADIUS / range;

  const fenceRadius = Math.min(radiusMeters * scale, MAX_RADIUS);
  const tint = inside === false ? colors.info : colors.success;
  const markerTint = stale ? colors.textFaint : tint;

  /* Screen coordinates for the ward: bearing is clockwise from north, and SVG
     y grows downward, so north is -y. */
  const hasFix = distance != null && bearing != null;
  const plotted = hasFix ? Math.min(distance * scale, MAX_RADIUS) : 0;
  const clamped = hasFix && distance * scale > MAX_RADIUS;
  const radians = hasFix ? (bearing * Math.PI) / 180 : 0;
  const wardX = CENTRE + Math.sin(radians) * plotted;
  const wardY = CENTRE - Math.cos(radians) * plotted;

  return (
    <View style={styles.wrap}>
      <Svg width={SIZE} height={SIZE}>
        {/* Range rings — quarter, half, full. */}
        {[0.25, 0.5, 1].map((step) => (
          <Circle
            key={step}
            cx={CENTRE}
            cy={CENTRE}
            r={MAX_RADIUS * step}
            fill="none"
            stroke={colors.border}
            strokeWidth={1}
          />
        ))}

        {/* Cross-hairs, so the compass reading has something to sit against. */}
        <Line
          x1={CENTRE}
          y1={CENTRE - MAX_RADIUS}
          x2={CENTRE}
          y2={CENTRE + MAX_RADIUS}
          stroke={colors.border}
          strokeWidth={1}
        />
        <Line
          x1={CENTRE - MAX_RADIUS}
          y1={CENTRE}
          x2={CENTRE + MAX_RADIUS}
          y2={CENTRE}
          stroke={colors.border}
          strokeWidth={1}
        />

        {/* The campus fence itself, to scale. */}
        <Circle
          cx={CENTRE}
          cy={CENTRE}
          r={fenceRadius}
          fill={colors.successBg}
          stroke={colors.success}
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />

        {/* Campus centre. */}
        <Circle cx={CENTRE} cy={CENTRE} r={5} fill={colors.primary} />

        <SvgText
          x={CENTRE}
          y={16}
          fontSize={10}
          fontFamily={font.semibold}
          fill={colors.textFaint}
          textAnchor="middle"
        >
          N
        </SvgText>
        <SvgText
          x={CENTRE + MAX_RADIUS - 2}
          y={CENTRE - 6}
          fontSize={9}
          fontFamily={font.medium}
          fill={colors.textFaint}
          textAnchor="end"
        >
          {formatDistance(range)}
        </SvgText>

        {hasFix ? (
          <G>
            {/* Line of sight from campus to the ward. */}
            <Line
              x1={CENTRE}
              y1={CENTRE}
              x2={wardX}
              y2={wardY}
              stroke={markerTint}
              strokeWidth={1.5}
              strokeDasharray={stale ? '3 3' : undefined}
              opacity={0.5}
            />
            {clamped ? (
              /* Beyond the radar's range: an arrow on the rim pointing out. */
              <Path
                d={arrowPath(wardX, wardY, bearing)}
                fill={markerTint}
                stroke={colors.surface}
                strokeWidth={1.5}
              />
            ) : (
              <>
                <Circle cx={wardX} cy={wardY} r={11} fill={markerTint} opacity={0.18} />
                <Circle
                  cx={wardX}
                  cy={wardY}
                  r={6}
                  fill={markerTint}
                  stroke={colors.surface}
                  strokeWidth={2}
                />
              </>
            )}
          </G>
        ) : null}
      </Svg>

      <View style={styles.legend}>
        <LegendDot color={colors.primary} label={zoneName || 'Campus'} />
        <LegendDot color={markerTint} label={hasFix ? 'Ward' : 'No fix yet'} />
        {hasFix ? (
          <Text style={[type.small, { color: colors.textMuted }]}>
            {inside
              ? 'inside the boundary'
              : `${formatDistance(distance)} ${compassLabel(bearing)}`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** A small triangle on the rim, pointing the way the ward lies. */
function arrowPath(x: number, y: number, bearing: number) {
  const rad = (bearing * Math.PI) / 180;
  const tip = 9;
  const half = 6;

  const point = (distanceOut: number, sideways: number) => {
    const fx = Math.sin(rad);
    const fy = -Math.cos(rad);
    /* Perpendicular to the heading, for the two base corners. */
    return [x + fx * distanceOut - fy * sideways, y + fy * distanceOut + fx * sideways];
  };

  const [tx, ty] = point(tip, 0);
  const [lx, ly] = point(-4, -half);
  const [rx, ry] = point(-4, half);
  return `M ${tx} ${ty} L ${lx} ${ly} L ${rx} ${ry} Z`;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[type.small, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.md },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
});
