/** Admin — profile & settings, with branding shortcut. */
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { ProfileBody } from '@/components/ProfileBody';
import { Divider, ListTile } from '@/components/ui';
import { spacing } from '@/theme';
import { admin } from '@/constants/sample';

export default function AdminProfile() {
  return (
    <View style={{ flex: 1 }}>
      <ProfileBody
        role={admin.name}
        subtitle={admin.role}
        tag="Admin"
        icon="shield-checkmark-outline"
        details={[
          { icon: 'briefcase-outline', label: 'Role', value: admin.role },
          { icon: 'business-outline', label: 'Campus', value: admin.campus },
          { icon: 'mail-outline', label: 'Email', value: admin.email },
        ]}
        extraTiles={
          <>
            <Divider inset={spacing.lg + 48} />
            <ListTile
              icon="color-palette-outline"
              title="App branding"
              subtitle="Per-group icon & app name"
              onPress={() => router.push('/admin/groups')}
            />
            <Divider inset={spacing.lg + 48} />
            <ListTile icon="key-outline" title="Roles & permissions" />
          </>
        }
      />
    </View>
  );
}
