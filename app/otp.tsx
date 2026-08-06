/** OTP verification screen (UI only). */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, TopBar } from '@/components/Screen';
import { Button, Card, PoweredBy } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { colors, radius, spacing, type } from '@/theme';

export default function OtpScreen() {
  const [code, setCode] = useState('42');

  const press = (d: string) => {
    if (d === 'del') setCode((c) => c.slice(0, -1));
    else if (code.length < 6) setCode((c) => c + d);
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Verify your number" />
      <Screen clearTabBar={false}>
        <View style={{ alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg }}>
          {/* Brand mark, with the SMS glyph pinned to its corner — the screen
              still reads as "a code was texted to you", but it's Iverto's. */}
          <View style={styles.badge}>
            <Logo size={40} />
            <View style={styles.badgeGlyph}>
              <Ionicons name="chatbubble-ellipses" size={13} color={colors.onPrimary} />
            </View>
          </View>
          <Text style={[type.h2, { color: colors.text }]}>Enter the 6-digit code</Text>
          <Text style={[type.small, { color: colors.textMuted, textAlign: 'center' }]}>
            Sent to +91 98765 43210
          </Text>
        </View>

        <View style={styles.boxes}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={[styles.box, code.length === i && styles.boxActive]}>
              <Text style={[type.h1, { color: colors.text }]}>{code[i] ?? ''}</Text>
            </View>
          ))}
        </View>

        <Card padded={false}>
          <View style={styles.pad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) => (
              <Pressable
                key={i}
                onPress={() => k && press(k)}
                style={({ pressed }) => [styles.key, pressed && k ? { opacity: 0.45 } : null]}
              >
                {k === 'del' ? (
                  <Ionicons name="backspace-outline" size={22} color={colors.text} />
                ) : (
                  <Text style={[type.h1, { color: colors.text }]}>{k}</Text>
                )}
              </Pressable>
            ))}
          </View>
        </Card>

        <Button label="Verify & continue" onPress={() => router.replace('/student')} />
        <Pressable style={{ alignSelf: 'center' }} hitSlop={8}>
          <Text style={[type.smallMed, { color: colors.primary }]}>Resend code in 0:24</Text>
        </Pressable>
        <PoweredBy />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeGlyph: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxes: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  box: {
    width: 48,
    height: 58,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.glassStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingVertical: 4 },
  key: {
    width: '33.33%',
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
