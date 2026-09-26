/**
 * Change password.
 *
 * This is the *forced* one: the account is still on the default password the
 * hostel office issued (`user.mustChangePassword`), so routing sends it here
 * ahead of onboarding and ahead of any role screen. There is no back button —
 * the only way past is a new password, the only way out is signing out.
 *
 * Changing a password by choice is the sheet on the profile screen instead
 * (`PasswordSheet` in `components/ProfileBody.tsx`), which is where a
 * signed-in user already looks for it. The back arrow here is only a
 * courtesy for a deep link that arrives without the flag set.
 *
 * `POST /v2/auth/password/change` needs the current password as well as the
 * new one. It is what clears the flag server-side; `passwordChanged`
 * clears the local copy and answers with wherever the account goes next, so a
 * new user lands on onboarding or their dashboard without a second round trip.
 */
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, TopBar } from '@/components/Screen';
import { Button, Field, Note, PoweredBy } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { colors, spacing, type } from '@/theme';
import { auth } from '@/lib/api/endpoints';
import { errorMessage, useMutation } from '@/lib/api/useQuery';
import { useAuth } from '@/lib/auth';

/** The server's rule, checked here so the user sees it before the round trip. */
const MIN_LENGTH = 8;

export default function ChangePasswordScreen() {
  const { user, passwordChanged, signOut } = useAuth();
  const forced = !!user?.mustChangePassword;

  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const longEnough = password.length >= MIN_LENGTH;
  const matches = confirm.length > 0 && confirm === password;
  const canSubmit = current.length > 0 && longEnough && matches;

  const save = useMutation(
    async () => {
      await auth.changePassword(current, password);
      return passwordChanged();
    },
    { onSuccess: (destination) => router.replace(destination as never) }
  );

  const submit = () => {
    if (canSubmit && !save.pending) save.mutate();
  };

  const eye = (visible: boolean, toggle: () => void) => (
    <Pressable onPress={toggle} hitSlop={8}>
      <Ionicons
        name={visible ? 'eye-off-outline' : 'eye-outline'}
        size={18}
        color={colors.textFaint}
      />
    </Pressable>
  );

  return (
    <View style={{ flex: 1 }}>
      {/* No way back while the default password is still live — going back
          would land on a login screen the session has already passed. */}
      <TopBar title={forced ? 'Set your password' : 'Change password'} back={!forced} />
      <Screen clearTabBar={false}>
        {forced ? (
          <View style={{ alignItems: 'center', gap: spacing.sm, marginTop: spacing.md }}>
            <View style={styles.badge}>
              <Logo size={40} />
              <View style={styles.badgeGlyph}>
                <Ionicons name="lock-closed" size={13} color={colors.onPrimary} />
              </View>
            </View>
            <Text style={[type.h2, { color: colors.text }]}>Choose your own password</Text>
            <Text style={[type.small, { color: colors.textMuted, textAlign: 'center' }]}>
              Your account is still on the password the hostel office gave you. Pick one only you
              know to carry on.
            </Text>
          </View>
        ) : null}

        <View style={{ gap: spacing.lg, marginTop: forced ? spacing.lg : 0 }}>
          <Field
            label="Current password"
            placeholder="••••••••"
            icon="key-outline"
            secureTextEntry={!show}
            autoCapitalize="none"
            autoComplete="current-password"
            returnKeyType="next"
            autoFocus
            value={current}
            onChangeText={setCurrent}
            onSubmitEditing={() => passwordRef.current?.focus()}
            blurOnSubmit={false}
            right={eye(show, () => setShow((v) => !v))}
          />

          <Field
            label="New password"
            placeholder="••••••••"
            icon="lock-closed-outline"
            inputRef={passwordRef}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoComplete="new-password"
            returnKeyType="next"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => confirmRef.current?.focus()}
            blurOnSubmit={false}
            hint={`At least ${MIN_LENGTH} characters.`}
            right={eye(show, () => setShow((v) => !v))}
          />

          <Field
            label="Confirm new password"
            placeholder="••••••••"
            icon="lock-closed-outline"
            inputRef={confirmRef}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoComplete="new-password"
            returnKeyType="go"
            value={confirm}
            onChangeText={setConfirm}
            onSubmitEditing={submit}
            /* Only once there is something to compare — nagging about a match
               while the field is still being typed into is just noise. */
            hint={confirm.length > 0 && !matches ? 'Both passwords must match.' : undefined}
            right={eye(show, () => setShow((v) => !v))}
          />

          {save.error ? (
            <Note icon="alert-circle-outline" tone="danger" text={errorMessage(save.error)} />
          ) : null}

          <Button
            label={forced ? 'Save & continue' : 'Update password'}
            icon="checkmark"
            loading={save.pending}
            disabled={!canSubmit || save.pending}
            onPress={submit}
          />

          {/* The forced screen has no back arrow, so signing out is the only
              other exit — worth offering rather than trapping the user. */}
          {forced ? (
            <Pressable
              style={{ alignSelf: 'center' }}
              hitSlop={8}
              disabled={save.pending}
              onPress={() => {
                void signOut();
                router.replace('/');
              }}
            >
              <Text style={[type.smallMed, { color: colors.textMuted }]}>Sign out instead</Text>
            </Pressable>
          ) : null}
        </View>
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
});
