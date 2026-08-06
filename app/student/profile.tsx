/** Student — profile & settings. Details are read-only; changes go via the admin. */
import React from 'react';
import { View } from 'react-native';
import { ProfileBody } from '@/components/ProfileBody';
import { student } from '@/constants/sample';

export default function StudentProfile() {
  return (
    <View style={{ flex: 1 }}>
      <ProfileBody
        role={student.name}
        subtitle={student.department}
        tag="Student"
        icon="school-outline"
        requestRole="student"
        requestRollNo={student.rollNo}
        details={[
          { icon: 'id-card-outline', label: 'Roll number', value: student.rollNo },
          { icon: 'bed-outline', label: 'Hostel', value: student.hostel },
          { icon: 'people-circle-outline', label: 'Group', value: student.group },
          { icon: 'call-outline', label: 'Phone', value: student.phone },
          { icon: 'mail-outline', label: 'Email', value: student.email },
          { icon: 'person-outline', label: 'Guardian', value: student.guardian },
        ]}
      />
    </View>
  );
}
