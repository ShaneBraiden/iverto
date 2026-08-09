import React from 'react';
import { Tabs } from 'expo-router';
import { tabIcon, useTabScreenOptions } from '@/components/TabBar';
import { WardProvider, useWard } from '@/components/WardContext';

export default function ParentLayout() {
  return (
    /* Everything under the guardian tabs reads the selected ward — and the
       pending queue — from here, so switching in the header re-points all
       four tabs at once. */
    <WardProvider>
      <ParentTabs />
    </WardProvider>
  );
}

function ParentTabs() {
  const screenOptions = useTabScreenOptions();
  /* The badge counts every ward on the account, not just the one in view —
     a sibling's request must not go unseen behind the switcher. */
  const { queue } = useWard();

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Approvals',
          tabBarIcon: tabIcon('checkmark-done-outline'),
          tabBarBadge: queue.length || undefined,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: 'History', tabBarIcon: tabIcon('albums-outline') }}
      />
      <Tabs.Screen name="ward" options={{ title: 'Ward', tabBarIcon: tabIcon('school-outline') }} />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: tabIcon('person-outline') }}
      />
      {/* Pushed from the ward screen — reachable, but not its own tab. */}
      <Tabs.Screen name="late-entries" options={{ href: null }} />
    </Tabs>
  );
}
