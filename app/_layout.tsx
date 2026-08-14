import React, { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
// Imported one weight at a time. The package's root barrel `require()`s all 18
// Poppins faces, and Metro bundles every asset it sees a require for — so the
// barrel would ship ~2.7 MB of weights and italics this app never renders.
import { useFonts } from 'expo-font';
import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular';
import { Poppins_500Medium } from '@expo-google-fonts/poppins/500Medium';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold';
import { Poppins_700Bold } from '@expo-google-fonts/poppins/700Bold';
import { colors } from '@/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { AppProvider } from '@/components/AppContext';
import { foregroundBehaviour, routeForUri, uriFromNotification } from '@/lib/push';

SplashScreen.preventAutoHideAsync().catch(() => {});

/* Module scope, so it is installed before any listener can fire. The decision itself lives
   in lib/push.ts, next to the channel it posts on — see `foregroundBehaviour`. */
Notifications.setNotificationHandler({ handleNotification: foregroundBehaviour });

/**
 * Soft colour blooms behind the glass. They give the translucent surfaces
 * something to refract, which is what makes glassmorphism read as glass
 * rather than as flat grey panels.
 */
function Canvas() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.bloom, styles.bloomTop, { backgroundColor: colors.bloomA }]} />
      <View style={[styles.bloom, styles.bloomBottom, { backgroundColor: colors.bloomB }]} />
    </View>
  );
}

/**
 * Sends a notification tap to the screen it is about.
 *
 * Rendered inside `<AuthProvider>` because it needs `useAuth()` — and because routing to
 * `/outpass/<id>` before the session restores would bounce off the auth guard anyway.
 */
function PushRouting() {
  const router = useRouter();
  const { shell, restoring, user } = useAuth();
  /* `getLastNotificationResponseAsync` keeps answering with the same launch response for
     the life of the process, so without this latch the cold-start route fires again every
     time `shell` settles. */
  const handled = useRef<string | null>(null);

  useEffect(() => {
    /* Hold every deep link until the keystore has been read. `shell` is 'student' by
       default while restoring, so routing now would send a guardian to the student
       endpoint — the same 403 the `?role=` param exists to avoid. */
    if (restoring || !user) return;

    let alive = true;

    const go = (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (handled.current === id) return;
      const route = routeForUri(uriFromNotification(response.notification), shell);
      if (!route) return;
      handled.current = id;
      router.push(route);
    };

    /* Cold start: the tap that launched the process is never delivered to the listener
       below, only to this. Without it, tapping a push on a killed app opens the home
       screen and drops the deep link. */
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (alive && response) go(response);
    });

    /* Warm start: app already running, foreground or background. */
    const sub = Notifications.addNotificationResponseReceivedListener(go);

    return () => {
      alive = false;
      sub.remove();
    };
  }, [router, shell, restoring, user]);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const onReady = useCallback(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onReady}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {/* App-wide neutral canvas — every glass surface sits on top of this. */}
        <LinearGradient colors={colors.bgGradient} style={{ flex: 1 }}>
          <Canvas />
          {/* The session lives above the navigator so every screen — and the
              401 handler in the API client — can reach it. The app config,
              branding and notification badge sit just inside it, because all
              three need a token before they can be fetched. */}
          <AuthProvider>
            <AppProvider>
              <PushRouting />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: 'transparent' },
                  animation: 'slide_from_right',
                }}
              >
                <Stack.Screen name="index" />
                <Stack.Screen name="change-password" />
                <Stack.Screen name="onboarding" />
                <Stack.Screen name="notifications" />
                <Stack.Screen name="profile-request" />
                <Stack.Screen name="student" />
                <Stack.Screen name="parent" />
                <Stack.Screen name="admin" />
              </Stack>
            </AppProvider>
          </AuthProvider>
        </LinearGradient>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  bloom: { position: 'absolute', width: 460, height: 460, borderRadius: 230 },
  bloomTop: { top: -190, right: -150 },
  bloomBottom: { bottom: -220, left: -170 },
});
