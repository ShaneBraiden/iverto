import React from 'react';
import { Tabs } from 'expo-router';
import { tabIcon, useTabScreenOptions } from '@/components/TabBar';
import { WardProvider } from '@/components/WardContext';
import { parentQueue } from '@/constants/sample';

export default function ParentLayout() {
  const screenOptions = useTabScreenOptions();
  const waiting = parentQueue.length;

  return (
    /* Everything under the guardian tabs reads the selected ward from here,
       so switching in the header re-points all four tabs at once. */
    <WardProvider>
      <Tabs screenOptions={screenOptions}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Approvals',
            tabBarIcon: tabIcon('checkmark-done-outline'),
            tabBarBadge: waiting || undefined,
          }}
        />
        <Tabs.Screen
          name="history"
          options={{ title: 'History', tabBarIcon: tabIcon('albums-outline') }}
        />
        <Tabs.Screen
          name="ward"
          options={{ title: 'Ward', tabBarIcon: tabIcon('school-outline') }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: 'Profile', tabBarIcon: tabIcon('person-outline') }}
        />
        {/* Pushed from the ward screen — reachable, but not its own tab. */}
        <Tabs.Screen name="late-entries" options={{ href: null }} />
      </Tabs>
    </WardProvider>
  );
}
