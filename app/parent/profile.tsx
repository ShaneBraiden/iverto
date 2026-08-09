/**
 * Guardian — profile & settings.
 * Details are read-only; corrections are raised as a request for the admin.
 */
import React from 'react';
import { View } from 'react-native';
import { ProfileBody } from '@/components/ProfileBody';
import { useWard } from '@/components/WardContext';
import { useAuth } from '@/lib/auth';

export default function ParentProfile() {
  const { me, user } = useAuth();
  const { ward, wards } = useWard();

  /* `GET /me` returns every ParentContact this account is linked to; the one
     flagged `isYou` is the guardian actually signed in. */
  const contacts = me?.parentContacts ?? [];
  const self = contacts.find((c) => c.isYou) ?? contacts[0];

  return (
    <View style={{ flex: 1 }}>
      <ProfileBody
        name={self?.name ?? user?.displayName ?? '—'}
        subtitle={`${self?.relationship ?? 'Guardian'} · ${wards.length} ward${wards.length === 1 ? '' : 's'}`}
        tag="Guardian"
        icon="people-outline"
        canRequestChanges
        details={[
          { icon: 'people-outline', label: 'Relationship', value: self?.relationship ?? '—' },
          {
            icon: 'school-outline',
            label: wards.length > 1 ? 'Wards' : 'Ward',
            value: wards.map((w) => w.name).join(', ') || '—',
          },
          { icon: 'eye-outline', label: 'Currently viewing', value: ward?.name ?? '—' },
          { icon: 'call-outline', label: 'Phone', value: self?.phone ?? '—' },
          { icon: 'call-outline', label: 'Alternate phone', value: self?.alternatePhone ?? '—' },
          { icon: 'mail-outline', label: 'Email', value: self?.email ?? '—' },
        ]}
      />
    </View>
  );
}
