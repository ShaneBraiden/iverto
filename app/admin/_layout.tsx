import React from 'react';
import { Tabs } from 'expo-router';
import { tabIcon, useTabScreenOptions } from '@/components/TabBar';
import { AdminProvider, useAdmin } from '@/components/AdminContext';
import { useAuth } from '@/lib/auth';

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
  const { user } = useAuth();

  /* Groups and their branding belong to the organisation, not to a campus:
     one tenant is one university, and only its admin decides who is in a
     group or what icon that group's students and parents see. Wardens share
     this shell but work a single site's queue, so the tab is not theirs. */
  const isAdmin = user?.role === 'admin';

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
        options={{
          title: 'Groups',
          tabBarIcon: tabIcon('people-circle-outline'),
          /* `null` removes the tab from the bar entirely rather than
             disabling it — a warden never sees that the screen exists. */
          href: isAdmin ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: tabIcon('person-outline') }}
      />
    </Tabs>
  );
}
