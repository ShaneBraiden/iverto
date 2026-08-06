import React from 'react';
import { Tabs } from 'expo-router';
import { tabIcon, useTabScreenOptions } from '@/components/TabBar';
import { pendingProfileRequests } from '@/constants/sample';

export default function AdminLayout() {
  const screenOptions = useTabScreenOptions();
  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Overview', tabBarIcon: tabIcon('grid-outline') }}
      />
      <Tabs.Screen
        name="requests"
        options={{ title: 'Passes', tabBarIcon: tabIcon('documents-outline'), tabBarBadge: 18 }}
      />
      {/* Profile change requests land here — students and guardians cannot
          edit their own record, so the admin applies every correction. */}
      <Tabs.Screen
        name="profile-requests"
        options={{
          title: 'Profiles',
          tabBarIcon: tabIcon('create-outline'),
          tabBarBadge: pendingProfileRequests.length || undefined,
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
