/**
 * Bottom sheet — a glass panel that slides up over a dimmed canvas.
 *
 * Built on the platform `Modal` rather than a gesture library: the app only
 * needs tap-to-dismiss, and this keeps the dependency list where it is.
 *
 * KEYBOARD: a sheet docked to the bottom of the screen is exactly where the
 * keyboard lands, and every sheet in this app that asks for a password, a
 * rejection reason or an emergency message would be typed into blind. The fix
 * is to lift the sheet by however far the keyboard reaches over it and let its
 * body scroll: `insideModal` on the scroll container takes the keyboard into
 * account when it measures the focused field.
 *
 * That needs the keyboard events, which is why the sheet is not a `Modal` on
 * Android. A modal there is a separate dialog window; in an edge-to-edge app
 * `adjustResize` does not resize it and React Native's keyboard events — raised
 * from the activity's window — never arrive, so the sheet had no way to know
 * the keys were over it. On Android the sheet is drawn into the activity's
 * window through a `Portal` instead (see `components/Portal.tsx`) and the
 * hardware back button is wired up by hand. iOS keeps the `Modal`, whose
 * keyboard events do arrive.
 *
 * MOTION: `Modal`'s own `animationType="slide"` moves the backdrop with the
 * sheet, so the dimming arrives as a grey rectangle sliding up from the bottom
 * rather than as the room going dark. Both halves are animated here instead —
 * the backdrop fades in place, the panel travels — and the modal is told not to
 * animate at all. That also means the sheet has to stay mounted through its own
 * exit, which is what `mounted` below is for: `visible` is the caller's
 * intention, `mounted` is whether there is still something on screen.
 */
import React from 'react';
import {
  Animated,
  BackHandler,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassPanel } from '@/components/ui';
import { KeyboardAwareScroll, useKeyboardOverlap } from '@/components/KeyboardAware';
import { Portal } from '@/components/Portal';
import {
  duration,
  ease,
  prefersReducedMotion,
  usePressMotion,
} from '@/components/motion';
import { blur, colors, radius, shadow, spacing, type } from '@/theme';

const isAndroid = Platform.OS === 'android';

export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  scroll = true,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /**
   * Set false when the content brings its own scroll view — the date and time
   * pickers do, and nesting two vertical scrollers fights over the gesture.
   */
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const closePress = usePressMotion(0.88);

  /* 0 is fully closed, 1 fully open. One value drives both halves so the
     backdrop and the panel can never disagree about where in the transition
     they are. */
  const t = React.useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = React.useState(visible);

  /* The full-screen layer the sheet docks to; the keyboard's reach over its
     bottom edge is how far the sheet has to rise. */
  const layerRef = React.useRef<View>(null);
  const lift = useKeyboardOverlap(layerRef, mounted);

  /* How far the panel has to travel — its own height, measured. A fixed guess
     would either overshoot on a short sheet (which then spends the first half
     of its entrance off screen, reading as lag) or clip a tall one. The panel
     is faded by the same value, so the single frame before the first
     measurement lands is invisible rather than a flash of a sheet in place. */
  const [sheetHeight, setSheetHeight] = React.useState(0);
  const onSheetLayout = (event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.height;
    if (measured > 0) setSheetHeight((current) => (current === measured ? current : measured));
  };

  React.useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    if (prefersReducedMotion()) {
      t.setValue(0);
      setMounted(false);
      return;
    }
    const out = Animated.timing(t, {
      toValue: 0,
      duration: duration.base,
      easing: ease.in,
      useNativeDriver: true,
    });
    out.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => out.stop();
  }, [visible, t]);

  /* Held until the first layout: `sheetHeight` is what the entrance is measured
     against, and starting before it is known would animate towards the wrong
     place and then jump. */
  React.useEffect(() => {
    if (!visible || !mounted || sheetHeight === 0) return;
    if (prefersReducedMotion()) {
      t.setValue(1);
      return;
    }
    const enter = Animated.timing(t, {
      toValue: 1,
      duration: duration.slow,
      easing: ease.out,
      useNativeDriver: true,
    });
    enter.start();
    return () => enter.stop();
  }, [visible, mounted, sheetHeight, t]);

  /* A `Modal` routes the back button to `onRequestClose`; the portal does not,
     so on Android the sheet takes it itself while it is open. */
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  });
  React.useEffect(() => {
    if (!isAndroid || !visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onCloseRef.current();
      return true;
    });
    return () => sub.remove();
  }, [visible]);

  /* The sheet gets whatever is left above the keyboard, minus room for the
     status bar, so a tall sheet becomes scrollable instead of being clipped. */
  const maxHeight = windowHeight - lift - insets.top - spacing.xxl;

  /* Once the keyboard is up it supplies the bottom clearance; the home
     indicator inset underneath it would just be a gap. */
  const bottomPad = lift > 0 ? spacing.lg : insets.bottom + spacing.lg;

  const body = (
    <>
      <View style={styles.grabber} />

      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.h3, { color: colors.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[type.small, { color: colors.textMuted, marginTop: 2 }]}>{subtitle}</Text>
          ) : null}
        </View>
        <Animated.View style={closePress.style}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.close} {...closePress.pressProps}>
            <Ionicons name="close" size={18} color={colors.text} />
          </Pressable>
        </Animated.View>
      </View>

      {children}
    </>
  );

  /* `collapsable={false}` keeps the layer a real Android view — one the
     platform has optimised away cannot be measured. */
  const layer = (
    <View ref={layerRef} style={styles.layer} collapsable={false}>
      {/* Backdrop — tapping anywhere outside the sheet closes it. It darkens
          in place rather than sliding, so the room dims and the sheet arrives
          into it. */}
      <Animated.View style={[styles.backdrop, { opacity: t }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.dock,
          {
            opacity: t,
            transform: [
              {
                translateY: t.interpolate({
                  inputRange: [0, 1],
                  outputRange: [sheetHeight || 320, 0],
                }),
              },
            ],
          },
        ]}
        pointerEvents="box-none"
      >
        <GlassPanel
          intensity={blur.header}
          strong
          onLayout={onSheetLayout}
          style={[styles.sheet, { marginBottom: lift }]}
        >
          {/* `maxHeight` goes on the scroller itself, not on the panel around
              it: a bound the scroll view can see is what makes it scroll, and
              one two levels up only clips. */}
          {scroll ? (
            <KeyboardAwareScroll
              insideModal
              fill={false}
              style={{ maxHeight }}
              extraBottomSpace={bottomPad}
            >
              {body}
            </KeyboardAwareScroll>
          ) : (
            <View style={{ maxHeight, paddingBottom: bottomPad }}>{body}</View>
          )}
        </GlassPanel>
      </Animated.View>
    </View>
  );

  if (isAndroid) return mounted ? <Portal>{layer}</Portal> : null;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {layer}
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  dock: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderTopWidth: 1,
    borderColor: colors.glassBorder,
    overflow: 'hidden',
    ...shadow.hover,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginTop: spacing.md,
    backgroundColor: colors.borderStrong,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  close: {
    width: 32,
    height: 32,
    flexShrink: 0,
    borderRadius: 16,
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
