/**
 * Login screen — role selection + credentials.
 * UI only: "Continue" navigates straight to the chosen role's dashboard.
 *
 * No coloured header block: the brand sits on the glass canvas and the
 * sign-in sheet is a frosted panel.
 *
 * The mark is the first thing on the screen and is deliberately large — this
 * is the only place the app introduces itself. It stands down to a compact
 * row the moment the keyboard opens, so the fields never get pushed out of
 * reach on a short screen.
 */
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, GlassPanel, PoweredBy } from '@/components/ui';
import { BrandLockup } from '@/components/Logo';
import { KeyboardAwareScroll, useKeyboardVisible } from '@/components/KeyboardAware';
import { blur, colors, font, radius, shadow, spacing, type } from '@/theme';

type Role = 'student' | 'parent' | 'admin';

const ROLES: {
  key: Role;
  label: string;
  hint: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { key: 'student', label: 'Student', hint: 'Request passes', icon: 'school-outline' },
  { key: 'parent', label: 'Guardian', hint: 'Approve passes', icon: 'people-outline' },
  { key: 'admin', label: 'Admin', hint: 'Manage campus', icon: 'shield-checkmark-outline' },
];

export default function LoginScreen() {
  const [role, setRole] = useState<Role>('student');
  const [showPass, setShowPass] = useState(false);
  const keyboardUp = useKeyboardVisible();
  const passwordRef = useRef<TextInput>(null);

  const active = ROLES.find((r) => r.key === role)!;

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAwareScroll
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        >
          {/* Brand — the real mark, drawn as vector so it stays sharp at any
              size. Big and stacked at rest; small and inline while typing. */}
          <BrandLockup
            size={keyboardUp ? 48 : 112}
            layout={keyboardUp ? 'row' : 'stacked'}
            style={keyboardUp ? styles.brandRowCompact : styles.brandRow}
          />

          {/* Sign-in sheet */}
          <GlassPanel intensity={blur.header} strong style={styles.sheet}>
            <View style={{ padding: spacing.xl }}>
              <Text style={[type.h2, { color: colors.text }]}>Welcome back</Text>
              <Text style={[type.small, { color: colors.textMuted, marginTop: 2 }]}>
                Choose how you're signing in
              </Text>

              {/* Role selector */}
              <View style={styles.roleRow}>
                {ROLES.map((r) => {
                  const on = r.key === role;
                  return (
                    <Pressable
                      key={r.key}
                      onPress={() => setRole(r.key)}
                      style={[styles.role, on && styles.roleActive]}
                    >
                      <View style={[styles.roleIcon, on && styles.roleIconActive]}>
                        <Ionicons
                          name={r.icon}
                          size={18}
                          color={on ? colors.primary : colors.textMuted}
                        />
                      </View>
                      <Text
                        style={[
                          type.smallMed,
                          { color: on ? colors.primary : colors.textMuted },
                        ]}
                      >
                        {r.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[type.small, { color: colors.textFaint, marginTop: spacing.sm }]}>
                {active.hint}
              </Text>

              <View style={{ gap: spacing.lg, marginTop: spacing.xl }}>
                {/* The keyboard follows the role: a guardian signs in with a
                    phone number, so they get the number pad, not QWERTY. */}
                <Field
                  label={role === 'parent' ? 'Mobile number' : 'Email or ID'}
                  placeholder={
                    role === 'student'
                      ? '21CSE1042'
                      : role === 'parent'
                        ? '+91 00000 00000'
                        : 'admin@college.edu'
                  }
                  icon={role === 'parent' ? 'call-outline' : 'person-outline'}
                  keyboardType={
                    role === 'parent'
                      ? 'phone-pad'
                      : role === 'admin'
                        ? 'email-address'
                        : 'default'
                  }
                  autoCapitalize="none"
                  autoComplete={role === 'parent' ? 'tel' : 'username'}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  blurOnSubmit={false}
                />
                <Field
                  label="Password"
                  placeholder="••••••••"
                  icon="lock-closed-outline"
                  inputRef={passwordRef}
                  secureTextEntry={!showPass}
                  autoCapitalize="none"
                  autoComplete="password"
                  returnKeyType="go"
                  onSubmitEditing={() => router.push(`/${role}` as never)}
                  right={
                    <Pressable onPress={() => setShowPass((v) => !v)} hitSlop={8}>
                      <Ionicons
                        name={showPass ? 'eye-off-outline' : 'eye-outline'}
                        size={18}
                        color={colors.textFaint}
                      />
                    </Pressable>
                  }
                />

                <Pressable style={{ alignSelf: 'flex-end' }} hitSlop={8}>
                  <Text style={[type.smallMed, { color: colors.primary }]}>Forgot password?</Text>
                </Pressable>

                <Button
                  label="Continue"
                  icon="arrow-forward"
                  onPress={() => router.push(`/${role}` as never)}
                />

                <View style={styles.orRow}>
                  <View style={styles.line} />
                  <Text style={[type.small, { color: colors.textFaint }]}>or</Text>
                  <View style={styles.line} />
                </View>

                <Button
                  label="Sign in with OTP"
                  variant="secondary"
                  icon="keypad-outline"
                  onPress={() => router.push('/otp')}
                />
              </View>
            </View>
          </GlassPanel>

          {/* Footer stands down with the logo — while the keyboard is up the
              only thing that matters is the field under the cursor. */}
          {!keyboardUp ? (
            <>
              <View style={styles.footer}>
                <Text style={[type.small, { color: colors.textMuted }]}>
                  New here?{' '}
                  <Text style={{ color: colors.primary, fontFamily: font.semibold }}>
                    Contact your warden
                  </Text>
                </Text>
              </View>
              <PoweredBy />
            </>
          ) : null}
        </KeyboardAwareScroll>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  brandRow: {
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  brandRowCompact: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  sheet: {
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    overflow: 'hidden',
    ...shadow.card,
  },
  roleRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  role: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.glass,
  },
  roleActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  roleIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.glassStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleIconActive: { backgroundColor: '#fff' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  footer: { alignItems: 'center', paddingTop: spacing.xl },
});
