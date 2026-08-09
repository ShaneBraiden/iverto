import React from 'react';
import { Tabs } from 'expo-router';
import { tabIcon, useTabScreenOptions } from '@/components/TabBar';
import { AdminProvider, useAdmin } from '@/components/AdminContext';

export default function AdminLayout() {
  return (
    /* The counters live above the tabs, so the badges and the overview tiles
       are the same numbers from the same call. */
    <AdminProvider>
      <AdminTabs />
    </AdminProvider>
  );
}

function AdminTabs() {
  const screenOptions = useTabScreenOptions();
  const { stats, pendingProfiles } = useAdmin();

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Overview', tabBarIcon: tabIcon('grid-outline') }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: 'Passes',
          tabBarIcon: tabIcon('documents-outline'),
          tabBarBadge: stats?.pending || undefined,
        }}
      />
      {/* Profile change requests land here — students and guardians cannot
          edit their own record, so the admin applies every correction. */}
      <Tabs.Screen
        name="profile-requests"
        options={{
          title: 'Profiles',
          tabBarIcon: tabIcon('create-outline'),
          tabBarBadge: pendingProfiles || undefined,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{ title: 'Groups', tabBarIcon: tabIcon('people-circle-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: tabIcon('person-outline') }}
      />
    </Tabs>
  );
}
