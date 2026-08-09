import React from 'react';
import { Tabs } from 'expo-router';
import { tabIcon, useTabScreenOptions } from '@/components/TabBar';
import { LocationProvider } from '@/lib/location';

export default function StudentLayout() {
  return (
    /* Location sharing is a property of the student shell, not of one screen:
       it has to keep reporting while the student moves between tabs, and stop
       the moment they leave the shell. Opt-in — see `lib/location.tsx`. */
    <LocationProvider>
      <StudentTabs />
    </LocationProvider>
  );
}

function StudentTabs() {
  const screenOptions = useTabScreenOptions();
  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: tabIcon('home-outline') }}
      />
      <Tabs.Screen
        name="request"
        options={{ title: 'Request', tabBarIcon: tabIcon('add-circle-outline') }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: 'History', tabBarIcon: tabIcon('albums-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: tabIcon('person-outline') }}
      />
    </Tabs>
  );
}
