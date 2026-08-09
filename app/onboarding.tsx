/**
 * Onboarding — connecting a fresh account to its campus record.
 *
 * `linkage.linked === false` on sign-in means the account exists but has no
 * Student or ParentContact behind it, so every role endpoint would 403. This
 * screen is the only thing between that state and the dashboard.
 *
 * A student links by roll number; a guardian links by mobile number, and that
 * one call links *every* ward that number appears against — a parent with two
 * children on campus gets both in one step.
 *
 * Route: `/onboarding?role=student|parent`
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '@/components/Screen';
import { KeyboardAwareScroll } from '@/components/KeyboardAware';
import { Button, Card, Field, Note, PoweredBy } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import { onboarding } from '@/lib/api/endpoints';
import { errorCode, errorMessage, useMutation } from '@/lib/api/useQuery';
import { shellFor, useAuth } from '@/lib/auth';

export default function Onboarding() {
  const params = useLocalSearchParams<{ role?: string }>();
  const { user, markLinked, refreshMe, signOut } = useAuth();

  /* The route param is a hint; the session's own role is what decides. */
  const role = user?.role ?? (params.role === 'parent' ? 'parent' : 'student');
  const isParent = role === 'parent';

  const [value, setValue] = useState('');

  const done = async () => {
    await refreshMe();
    router.replace(`/${shellFor(role)}` as never);
  };

  const link = useMutation(
    async (input: string) => {
      if (isParent) {
        const result = await onboarding.parentLink(input);
        markLinked({ childStudentIds: result.studentIds });
        return result.linkedContactsCount;
      }
      const student = await onboarding.studentLink(input);
      markLinked({ studentId: student.id, rollNumber: student.rollNumber });
      return 1;
    },
    { onSuccess: () => void done() }
  );

  const notFound = errorCode(link.error) === 'NOT_FOUND';
  const taken = errorCode(link.error) === 'CONFLICT';

  const leave = async () => {
    await signOut();
    router.replace('/');
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="One more step" back={false} />
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        <KeyboardAwareScroll contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons name={isParent ? 'people' : 'school'} size={26} color={colors.primary} />
            </View>
            <Text style={[type.h2, { color: colors.text, textAlign: 'center' }]}>
              {isParent ? 'Find your wards' : 'Find your record'}
            </Text>
            <Text style={[type.small, { color: colors.textMuted, textAlign: 'center' }]}>
              {isParent
                ? 'Your number is already on file against the students you look after. Confirm it and we’ll connect every one of them.'
                : 'Your roll number is already on the hostel roster. Confirm it and your account is connected to it.'}
            </Text>
          </View>

          <Card>
            <Field
              label={isParent ? 'Mobile number on file' : 'Roll number'}
              placeholder={isParent ? '9000000001' : 'CS101'}
              icon={isParent ? 'call-outline' : 'id-card-outline'}
              keyboardType={isParent ? 'phone-pad' : 'default'}
              autoCapitalize="characters"
              returnKeyType="done"
              value={value}
              onChangeText={setValue}
              onSubmitEditing={() => value.trim() && link.mutate(value.trim())}
              hint={
                isParent
                  ? 'The number the campus office has against your children.'
                  : 'Exactly as it appears on your ID card.'
              }
            />
          </Card>

          {link.error ? (
            <Note
              icon="alert-circle-outline"
              tone="danger"
              text={
                notFound
                  ? isParent
                    ? 'No student is on file against that number. Check it with the campus office.'
                    : 'That roll number is not on the roster. Check it with your warden.'
                  : taken
                    ? 'That roll number is already connected to another account. Your warden can sort this out.'
                    : errorMessage(link.error)
              }
            />
          ) : null}

          <Button
            label={isParent ? 'Connect my wards' : 'Connect my record'}
            icon="link-outline"
            loading={link.pending}
            disabled={value.trim().length === 0 || link.pending}
            onPress={() => link.mutate(value.trim())}
          />

          <Note
            icon="information-circle-outline"
            text="Nothing is shared until this matches a record the campus office already holds."
          />

          <Button label="Sign out" variant="secondary" icon="log-out-outline" onPress={leave} />
          <PoweredBy />
        </KeyboardAwareScroll>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xl },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
});
