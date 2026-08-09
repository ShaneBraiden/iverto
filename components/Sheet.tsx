/**
 * Bottom sheet — a glass panel that slides up over a dimmed canvas.
 *
 * Built on the platform `Modal` rather than a gesture library: the app only
 * needs tap-to-dismiss, and this keeps the dependency list where it is.
 *
 * KEYBOARD: a `Modal` is a separate window. Android's `adjustResize` applies to
 * the activity, not to a dialog — and `statusBarTranslucent` puts this one
 * outside the layout limits besides — while iOS never insets a modal at all.
 * So a sheet docked to the bottom of the screen is exactly where the keyboard
 * lands, and every sheet in this app that asks for a password, a rejection
 * reason or an emergency message would be typed into blind.
 *
 * The fix is to lift the sheet by the keyboard's own height and let its body
 * scroll: `insideModal` on the scroll container adds the matching bottom inset
 * and takes the keyboard into account when it measures the focused field.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassPanel } from '@/components/ui';
import { KeyboardAwareScroll, useKeyboardHeight } from '@/components/KeyboardAware';
import { blur, colors, radius, shadow, spacing, type } from '@/theme';

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
  const keyboardHeight = useKeyboardHeight();
  const { height: windowHeight } = useWindowDimensions();

  /* The sheet gets whatever is left above the keyboard, minus room for the
     status bar, so a tall sheet becomes scrollable instead of being clipped. */
  const maxHeight = windowHeight - keyboardHeight - insets.top - spacing.xxl;

  /* Once the keyboard is up it supplies the bottom clearance; the home
     indicator inset underneath it would just be a gap. */
  const bottomPad = keyboardHeight > 0 ? spacing.lg : insets.bottom + spacing.lg;

  const body = (
    <>
      <View style={styles.grabber} />

      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={[type.h3, { color: colors.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[type.small, { color: colors.textMuted, marginTop: 2 }]}>{subtitle}</Text>
          ) : null}
        </View>
        <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
          <Ionicons name="close" size={18} color={colors.text} />
        </Pressable>
      </View>

      {children}
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Backdrop — tapping anywhere outside the sheet closes it. */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.dock} pointerEvents="box-none">
        <GlassPanel
          intensity={blur.header}
          strong
          style={[styles.sheet, { marginBottom: keyboardHeight }]}
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    borderRadius: 16,
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
