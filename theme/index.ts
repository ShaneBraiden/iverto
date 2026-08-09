/**
 * Iverto.ai — design tokens
 * Single source of truth for colour, spacing, radius, type and shadow.
 *
 * Design direction: glass-first. Every surface in the app is semi-transparent
 * white (rgba(255,255,255,0.8) → 0.9) floating on a soft neutral canvas.
 * The crimson brand colour is an *accent* only — icons, the primary button,
 * status dots, selected chips. No large red blocks anywhere.
 *
 * The palette is lifted straight off the brand mark (`assets/logo.svg`):
 * crimson #B9000E on a light neutral #F3F3F3 canvas. Sampling the artwork is
 * why the canvas is neutral grey rather than the blue-leaning grey it used to
 * be — the mark's own backdrop carries no hue, so neither does the app's.
 *
 * Android note: `elevation` requires an *opaque* background. A translucent or
 * transparent surface with elevation makes Android fall back to drawing the
 * shadow-caster itself, which shows up as hard white rectangles inside cards.
 * So Android gets pre-flattened opaque equivalents of the glass fills.
 */
import { Platform } from 'react-native';

export const colors = {
  // Brand — sampled from the logo mark, used sparingly as an accent
  primary: '#B9000E',
  primaryDark: '#8E000B',
  primaryLight: '#FCECED',
  primarySoft: 'rgba(185, 0, 14, 0.08)',
  accent: '#D81324',
  /** Reserved for the primary button and small swatches only. */
  gradient: ['#B9000E', '#D81324'] as const,

  // Canvas — the logo's own neutral backdrop, #F3F3F3
  bg: '#F3F3F3',
  bgGradient: ['#F6F6F6', '#EFEFEF'] as const,
  /** Faint colour blooms painted behind the canvas for depth. */
  bloomA: 'rgba(185, 0, 14, 0.07)',
  bloomB: 'rgba(24, 24, 27, 0.05)',

  // Glass surfaces — the spec value, applied to almost every card
  glass: 'rgba(255, 255, 255, 0.80)',
  glassStrong: 'rgba(255, 255, 255, 0.90)',
  glassSoft: 'rgba(255, 255, 255, 0.62)',
  glassBorder: 'rgba(255, 255, 255, 0.72)',
  hairline: 'rgba(24, 24, 27, 0.06)',

  /**
   * Opaque stand-ins for the glass fills, pre-composited over the canvas
   * gradient (#F6F6F6 → #EFEFEF). Used on Android, where any elevated surface
   * must be opaque. Visually within ~1% of the translucent originals.
   */
  glassOpaque: '#FDFDFD',
  glassStrongOpaque: '#FEFEFE',
  glassSoftOpaque: '#FAFAFA',

  surface: '#FFFFFF',
  surfaceAlt: 'rgba(243, 243, 243, 0.9)',
  overlay: 'rgba(15, 23, 42, 0.38)',

  // Text
  text: '#18181B',
  textMuted: '#6B6B76',
  textFaint: '#9E9EA9',
  onPrimary: '#FFFFFF',

  // Lines
  border: 'rgba(24, 24, 27, 0.07)',
  borderStrong: 'rgba(24, 24, 27, 0.14)',

  // Status — tints stay pale so they read as glass, not as blocks
  success: '#059669',
  successBg: 'rgba(16, 185, 129, 0.10)',
  warning: '#B45309',
  warningBg: 'rgba(245, 158, 11, 0.12)',
  danger: '#DC2626',
  dangerBg: 'rgba(239, 68, 68, 0.10)',
  info: '#0284C7',
  infoBg: 'rgba(14, 165, 233, 0.10)',
  neutralBg: 'rgba(24, 24, 27, 0.05)',
};

/**
 * Platform-correct glass fills. On iOS these stay translucent so the BlurView
 * underneath shows through; on Android they resolve to the opaque equivalents
 * so `elevation` has a real surface to cast from.
 */
const isAndroid = Platform.OS === 'android';
export const glassFill = {
  base: isAndroid ? colors.glassOpaque : colors.glass,
  strong: isAndroid ? colors.glassStrongOpaque : colors.glassStrong,
  soft: isAndroid ? colors.glassSoftOpaque : colors.glassSoft,
};

/** Background a card must carry itself. Transparent on iOS, opaque on Android. */
export const cardBackground = isAndroid ? colors.glassOpaque : 'transparent';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

/** Curved design — cards sit at 20–24px, sheets at 28px. */
export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  xxl: 28,
  pill: 999,
};

export const font = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
};

export const type = {
  display: { fontFamily: font.bold, fontSize: 30, letterSpacing: -0.6 },
  h1: { fontFamily: font.bold, fontSize: 24, letterSpacing: -0.4 },
  h2: { fontFamily: font.semibold, fontSize: 19, letterSpacing: -0.2 },
  h3: { fontFamily: font.semibold, fontSize: 16 },
  body: { fontFamily: font.regular, fontSize: 15 },
  bodyMed: { fontFamily: font.semibold, fontSize: 15 },
  small: { fontFamily: font.regular, fontSize: 13 },
  smallMed: { fontFamily: font.medium, fontSize: 13 },
  caption: { fontFamily: font.semibold, fontSize: 11, letterSpacing: 0.6 },
};

export const shadow = {
  /** Default float under every glass card — neutral, never coloured. */
  card: {
    shadowColor: '#0B0B12',
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  /** Press/hover lift. */
  hover: {
    shadowColor: '#0B0B12',
    shadowOpacity: 0.1,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 5,
  },
  /** Only the primary button carries a tinted shadow. */
  lifted: {
    shadowColor: '#B9000E',
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
};

/** Vertical offset applied to cards on press, mirroring the web hover lift. */
export const LIFT = -4;

export const blur = {
  card: 24,
  bar: 32,
  header: 40,
};

/**
 * Status colours are *not* here. The backend runs a fifteen-state machine and
 * mapping one of those states onto a colour, an icon and a label is domain
 * logic, not a design token — it lives in `lib/status.ts`, which reads the
 * palette above.
 */
