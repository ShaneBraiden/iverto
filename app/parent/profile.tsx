/**
 * Guardian — profile & settings. Identified by relation, not by name.
 * Details are read-only; corrections are raised as a request for the admin.
 */
import React from 'react';
import { View } from 'react-native';
import { ProfileBody } from '@/components/ProfileBody';
import { useWard } from '@/components/WardContext';
import { parent } from '@/constants/sample';

export default function ParentProfile() {
  const { ward, wards } = useWard();

  return (
    <View style={{ flex: 1 }}>
      <ProfileBody
        role={parent.relation}
        subtitle={`Guardian · ${wards.length} ward${wards.length === 1 ? '' : 's'}`}
        tag="Guardian"
        icon="people-outline"
        requestRole="parent"
        details={[
          { icon: 'people-outline', label: 'Relation', value: parent.relation },
          {
            icon: 'school-outline',
            label: wards.length > 1 ? 'Wards' : 'Ward',
            value: wards.map((w) => w.rollNo).join(', '),
          },
          { icon: 'eye-outline', label: 'Currently viewing', value: ward.rollNo },
          { icon: 'call-outline', label: 'Phone', value: parent.phone },
          { icon: 'mail-outline', label: 'Email', value: parent.email },
        ]}
      />
    </View>
  );
}
