/**
 * Login screen — email + password, nothing else.
 *
 * Everything that can go wrong here is *said*, on this screen, next to the
 * field it concerns. That is a deliberate correction: bad credentials come back
 * as a 401, the API client used to treat every 401 as an expired session, and
 * the session teardown ended in `router.replace('/')` — this route. So a
 * mistyped password remounted the login screen, taking the error state with it,
 * and the user got a blank form back with no idea why. The client now leaves a
 * 401 on a public route to the caller (see `lib/api/client.ts`), and a session
 * that really does end arrives here carrying its reason.
 *
 * Password is the only credential the API offers: there is no OTP sign-in and
 * no self-service sign-up, because accounts are provisioned by the hostel
 * office. That is why a 404 here is a "contact the office" message rather than
 * a second way in.
 *
 * Nobody picks a role here. The account's role comes back from the server on
 * the session and decides which dashboard opens, so the form has no say in it
 * and no way to get the wrong shell.
 *
 * A returning user never sees this screen: the root layout restores the
 * session from the keystore and this screen redirects on arrival.
 *
 * The mark is the first thing on the screen and is deliberately large — this
 * is the only place the app introduces itself. It stands down to a compact
 * row the moment the keyboard opens, so the fields never get pushed out of
 * reach on a short screen.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, GlassPanel, Note, PoweredBy } from '@/components/ui';
import { BrandLockup } from '@/components/Logo';
import { KeyboardAwareScroll, useKeyboardVisible } from '@/components/KeyboardAware';
import { Appear } from '@/components/motion';
import { blur, colors, font, radius, shadow, spacing, type } from '@/theme';
import { auth } from '@/lib/api/endpoints';
import { errorCode, errorCopy, errorMessage, useMutation } from '@/lib/api/useQuery';
import { lastIdentifier, rememberIdentifier } from '@/lib/session';
import { routeFor, useAuth } from '@/lib/auth';

/** What to say when a session ended without the user asking it to. */
const END_MESSAGE: Record<string, string> = {
  expired: 'Your session timed out, so you have been signed out. Sign in again to carry on.',
  revoked:
    'This device was signed out by the server. That usually means the account signed in somewhere else, or an administrator ended the session.',
};

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [showPass, setShowPass] = useState(false);
  const keyboardUp = useKeyboardVisible();
  const passwordRef = useRef<TextInput>(null);

  const { signIn, user, linkage, restoring, sessionEnd, clearSessionEnd } = useAuth();

  /* A restored session skips the form entirely. */
  useEffect(() => {
    if (!restoring && user) router.replace(routeFor(user, linkage) as never);
  }, [restoring, user, linkage]);

  /* Landing here after a session ended means the email is already known — no
     reason to make the user type it again to get back to where they were. */
  const ended = sessionEnd && sessionEnd.reason !== 'signed-out' ? sessionEnd.reason : null;
  useEffect(() => {
    let alive = true;
    void lastIdentifier().then((saved) => {
      if (alive && saved) setEmail((current) => current || saved);
    });
    return () => {
      alive = false;
    };
  }, []);

  /* No `role` goes up — the server reads the email and answers with whichever
     role the account actually has, and that is what routes. */
  const login = useMutation(
    async () => {
      const identifier = email.trim();
      const session = await auth.login({
        identifier,
        password,
        tenantId: tenantId.trim() || undefined,
      });
      void rememberIdentifier(identifier);
      return signIn(session);
    },
    {
      onSuccess: (destination) => router.replace(destination as never),
      /* Whatever went wrong, the user stays on this screen and reads it. */
      onError: () => clearSessionEnd(),
    }
  );

  /* 409 means the same email exists in more than one tenant, and the server
     needs to be told which. That is the only time the field appears — asking
     for it up front would be noise for everyone else. */
  const ambiguous = errorCode(login.error) === 'CONFLICT';
  useEffect(() => {
    if (ambiguous) setTenantId((t) => t);
  }, [ambiguous]);

  /* The roll number / email is on the hostel's records but has no login behind
     it. Accounts are created by the office, so this is a different message from
     "wrong password" — see §2 of the API doc. */
  const unprovisioned = errorCode(login.error) === 'NOT_FOUND';

  /* 401 is the server saying the password does not match, and it is the one
     failure worth wording ourselves — the raw message is usually just
     "Unauthorized", which tells the user nothing they can act on. */
  const wrongCredentials = errorCode(login.error) === 'UNAUTHORIZED';

  /* The server throttles repeated sign-in attempts. Saying "check your
     details" to somebody whose details are fine, and who is only being asked
     to wait, sends them off resetting a password that was never wrong. */
  const tooManyAttempts = errorCode(login.error) === 'TOO_MANY_REQUESTS';

  const loginCopy = errorCopy(login.error, "That didn't work. Check your details.");

  const [forgotTo, setForgotTo] = useState<string | null>(null);
  const forgot = useMutation(
    () => auth.forgotPassword({ identifier: email.trim(), tenantId: tenantId.trim() || undefined }),
    { onSuccess: (result) => setForgotTo(result?.email ?? '') }
  );

  const canSubmit = email.trim().length > 0 && password.length > 0 && !login.pending;
  const submit = () => {
    if (canSubmit) login.mutate();
  };

  /**
   * The gap between the splash image disappearing and a dashboard appearing.
   *
   * It is short — a keystore read plus, at worst, one token refresh — but it is
   * not nothing on a cold start over a bad connection, and an empty screen for
   * a second reads as a crash. So this picks up exactly where the splash left
   * off: the same mark on the same canvas, with a line saying what is happening.
   */
  if (restoring) {
    return (
      <View style={styles.gate}>
        {/* The mark grows very slightly into place, picking up where the splash
            image left off rather than cutting to a still frame of it. */}
        <Appear scale={0.94} distance={0}>
          <BrandLockup size={96} layout="stacked" />
        </Appear>
        <Appear index={1} style={{ alignItems: 'center', gap: spacing.md }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[type.small, { color: colors.textMuted }]}>Restoring your session…</Text>
        </Appear>
        <View style={styles.gateFooter}>
          <PoweredBy />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAwareScroll
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        >
          {/* Brand — the real mark, drawn as vector so it stays sharp at any
              size. Big and stacked at rest; small and inline while typing. */}
          <Appear scale={0.94} distance={0}>
            <BrandLockup
              size={keyboardUp ? 48 : 112}
              layout={keyboardUp ? 'row' : 'stacked'}
              style={keyboardUp ? styles.brandRowCompact : styles.brandRow}
            />
          </Appear>

          {/* Sign-in sheet — arrives just behind the mark, so the screen reads
              top to bottom the way it is meant to be filled in. */}
          <Appear index={1}>
            <GlassPanel intensity={blur.header} strong style={styles.sheet}>
              <View style={{ padding: spacing.xl }}>
                <Text style={[type.h2, { color: colors.text }]}>Welcome back</Text>
                <Text style={[type.small, { color: colors.textMuted, marginTop: 2 }]}>
                  Sign in to continue
                </Text>

                {/* Why the user is looking at this screen again, when they did
                    not ask to be. Cleared as soon as they try to sign in. */}
                {ended && !login.error ? (
                  <View style={{ marginTop: spacing.lg }}>
                    <Note
                      icon="time-outline"
                      tone="warning"
                      text={END_MESSAGE[ended] ?? 'You have been signed out. Sign in again to carry on.'}
                    />
                  </View>
                ) : null}

                <View style={{ gap: spacing.lg, marginTop: spacing.xl }}>
                  <Field
                    label="Email address"
                    placeholder="you@college.edu"
                    icon="mail-outline"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    returnKeyType="next"
                    value={email}
                    onChangeText={setEmail}
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
                    value={password}
                    onChangeText={setPassword}
                    onSubmitEditing={submit}
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

                  {/* Only shown once the server says the identifier is ambiguous
                      across tenants — everyone else never sees the field. */}
                  {ambiguous || tenantId ? (
                    <Field
                      label="Institution ID"
                      placeholder="Given to you by the campus office"
                      icon="business-outline"
                      autoCapitalize="none"
                      value={tenantId}
                      onChangeText={setTenantId}
                      hint="Your email exists at more than one institution, so we need to know which."
                    />
                  ) : null}

                  <Pressable
                    style={{ alignSelf: 'flex-end' }}
                    hitSlop={8}
                    disabled={!email.trim() || forgot.pending}
                    onPress={() => forgot.mutate()}
                  >
                    <Text
                      style={[
                        type.smallMed,
                        { color: email.trim() ? colors.primary : colors.textFaint },
                      ]}
                    >
                      {forgot.pending ? 'Sending…' : 'Forgot password?'}
                    </Text>
                  </Pressable>

                  {/* A 404 is not a typo to try again — it means the record
                      exists but nobody has provisioned a login for it, and there
                      is no self-service sign-up to offer. Say who to ask. */}
                  {/* Ordered most specific first. The three credential cases are
                      worded here because only this screen knows what they mean;
                      everything else — offline, rate-limited, a 500 — is worded
                      once in `errorCopy` and shown with its own icon, so the same
                      failure reads the same way wherever it happens. */}
                  {/* Each of these mounts into a form that is already sitting
                      still, so it gets its own entrance — a strip that fades in
                      under the fields is read; one that is simply there on the
                      next frame is easy to miss, and this screen's whole job is
                      saying what went wrong. */}
                  {unprovisioned ? (
                    <Appear>
                      <Note
                        icon="information-circle-outline"
                        tone="warning"
                        text="No app account has been set up for these details yet. Contact the hostel office to have one created."
                      />
                    </Appear>
                  ) : wrongCredentials ? (
                    <Appear>
                      <Note
                        icon="alert-circle-outline"
                        tone="danger"
                        text="That email and password don't match an account. Check the password, or use “Forgot password?” below."
                      />
                    </Appear>
                  ) : tooManyAttempts ? (
                    <Appear>
                      <Note
                        icon="hourglass-outline"
                        tone="warning"
                        text="Too many sign-in attempts from this device. Wait a minute, then try again."
                      />
                    </Appear>
                  ) : login.error ? (
                    <Appear>
                      <Note icon={loginCopy.icon as never} tone="danger" text={loginCopy.message} />
                    </Appear>
                  ) : null}
                  {forgot.error ? (
                    <Appear>
                      <Note
                        icon={errorCopy(forgot.error).icon as never}
                        tone="danger"
                        text={errorMessage(forgot.error)}
                      />
                    </Appear>
                  ) : null}
                  {forgotTo !== null && !forgot.error && !forgot.pending ? (
                    <Appear>
                      <Note
                        icon="mail-outline"
                        tone="success"
                        text={
                          forgotTo
                            ? `Reset instructions are on their way to ${forgotTo}.`
                            : 'Reset instructions are on their way.'
                        }
                      />
                    </Appear>
                  ) : null}

                  <Button
                    label="Continue"
                    icon="arrow-forward"
                    loading={login.pending}
                    disabled={!canSubmit}
                    onPress={submit}
                  />
                </View>
              </View>
            </GlassPanel>
          </Appear>

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
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  gateFooter: { position: 'absolute', bottom: spacing.xl },
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
  footer: { alignItems: 'center', paddingTop: spacing.xl },
});
