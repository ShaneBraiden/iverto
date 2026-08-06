/**
 * Bottom sheet — a glass panel that slides up over a dimmed canvas.
 *
 * Built on the platform `Modal` rather than a gesture library: the app only
 * needs tap-to-dismiss, and this keeps the dependency list where it is.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassPanel } from '@/components/ui';
import { blur, colors, radius, shadow, spacing, type } from '@/theme';

export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();

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
        <GlassPanel intensity={blur.header} strong style={styles.sheet}>
          <View style={{ paddingBottom: insets.bottom + spacing.lg }}>
            <View style={styles.grabber} />

            <View style={styles.head}>
              <View style={{ flex: 1 }}>
                <Text style={[type.h3, { color: colors.text }]}>{title}</Text>
                {subtitle ? (
                  <Text style={[type.small, { color: colors.textMuted, marginTop: 2 }]}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
                <Ionicons name="close" size={18} color={colors.text} />
              </Pressable>
            </View>

            {children}
          </View>
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
