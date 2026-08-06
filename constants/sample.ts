/**
 * Static display data for the UI pass.
 * Replace each export with a call to the real API once endpoints are available.
 * Shapes here are intentionally close to what the backend is expected to return.
 *
 * NOTE ON IDENTITY: no personal names appear anywhere in this app. People are
 * shown by their *role* — Student, Father, Mother, Guardian, Warden,
 * Administrator — and identified by roll number / ID where a distinction is
 * needed. Swap `label` for a real name field when the backend is wired up.
 *
 * SIBLINGS: a guardian can have more than one ward on record, so everything on
 * the guardian side is keyed by roll number and filtered through the ward the
 * guardian is currently viewing (see `components/WardContext.tsx`).
 */
import { StatusKey } from '@/theme';

export type Outpass = {
  id: string;
  reason: string;
  category: string;
  destination: string;
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  status: StatusKey;
  /** Role label of the requester — never a personal name. */
  student: string;
  rollNo: string;
  hostel: string;
  requestedAt: string;
  /** Role label of whoever decided, e.g. "Father". */
  approvedBy?: string;
  note?: string;
};

/** Canonical role labels used across the whole app. */
export const roleLabels = {
  student: 'Student',
  father: 'Father',
  mother: 'Mother',
  guardian: 'Guardian',
  warden: 'Warden',
  admin: 'Administrator',
} as const;

/* --------------------------------------------------------------- The wards */

/**
 * A student a guardian is responsible for.
 * Siblings share a guardian, so a guardian's account may carry several of
 * these — the app switches between them from the dashboard header.
 */
export type Ward = {
  /** The identity that actually distinguishes one sibling from another. */
  rollNo: string;
  /** Role label, never a personal name. */
  name: string;
  /** Short display form used in the switcher, e.g. "CSE · Year 3". */
  label: string;
  department: string;
  year: string;
  hostel: string;
  group: string;
  phone: string;
  email: string;
  /** Which guardian approves this ward's requests. */
  guardian: string;
  wardenContact: string;
  /** Whereabouts shown on the ward screen. */
  onCampus: boolean;
  lastScan: string;
  passesThisTerm: number;
};

export const wards: Ward[] = [
  {
    rollNo: '21CSE1042',
    name: roleLabels.student,
    label: 'CSE · Year 3',
    department: 'B.Tech CSE — Year 3',
    year: 'Year 3',
    hostel: 'Block C · Room 214',
    group: 'CSE 2021',
    phone: '+91 98765 43210',
    email: 'student1@college.edu',
    guardian: roleLabels.father,
    wardenContact: '+91 90000 11111',
    onCampus: true,
    lastScan: 'Today, 08:12 AM',
    passesThisTerm: 15,
  },
  {
    rollNo: '22MEC2091',
    name: roleLabels.student,
    label: 'Mechanical · Year 2',
    department: 'B.Tech Mechanical — Year 2',
    year: 'Year 2',
    hostel: 'Block A · Room 014',
    group: 'Mechanical 2022',
    phone: '+91 98765 55120',
    email: 'student2@college.edu',
    guardian: roleLabels.father,
    wardenContact: '+91 90000 22222',
    onCampus: false,
    lastScan: 'Yesterday, 05:40 PM',
    passesThisTerm: 9,
  },
  {
    rollNo: '23ECE3018',
    name: roleLabels.student,
    label: 'ECE · Year 1',
    department: 'B.Tech ECE — Year 1',
    year: 'Year 1',
    hostel: 'Block B · Room 307',
    group: 'ECE 2023',
    phone: '+91 98765 77031',
    email: 'student3@college.edu',
    guardian: roleLabels.mother,
    wardenContact: '+91 90000 33333',
    onCampus: true,
    lastScan: 'Today, 07:55 AM',
    passesThisTerm: 4,
  },
];

/** The signed-in student on the student side of the app. */
export const student = wards[0];

export const parent = {
  name: roleLabels.father,
  relation: roleLabels.father,
  phone: '+91 99887 66554',
  email: 'guardian@college.edu',
  /** Wards are referenced by roll number, not by name. */
  wards,
};

/** Both guardians on record for the students — shown on the ward screen. */
export const guardians = [
  { relation: roleLabels.father, phone: '+91 99887 66554', primary: true },
  { relation: roleLabels.mother, phone: '+91 99887 66443', primary: false },
];

export const admin = {
  name: roleLabels.admin,
  role: 'Hostel Administrator',
  campus: 'Main Campus',
  email: 'admin@college.edu',
};

/* ------------------------------------------------------------- Outpasses */

export const outpasses: Outpass[] = [
  {
    id: 'OP-2418',
    reason: 'Family function at home',
    category: 'Home Visit',
    destination: 'Coimbatore, TN',
    fromDate: '08 Aug 2026',
    fromTime: '06:00 PM',
    toDate: '10 Aug 2026',
    toTime: '08:00 PM',
    status: 'pending',
    student: roleLabels.student,
    rollNo: '21CSE1042',
    hostel: 'Block C · 214',
    requestedAt: '2 hours ago',
  },
  {
    id: 'OP-2402',
    reason: 'Dental appointment at city clinic',
    category: 'Medical',
    destination: 'Apollo Clinic, Gandhipuram',
    fromDate: '02 Aug 2026',
    fromTime: '09:30 AM',
    toDate: '02 Aug 2026',
    toTime: '02:00 PM',
    status: 'approved',
    student: roleLabels.student,
    rollNo: '21CSE1042',
    hostel: 'Block C · 214',
    requestedAt: '2 days ago',
    approvedBy: roleLabels.father,
  },
  {
    id: 'OP-2377',
    reason: 'Weekend trip with friends',
    category: 'Personal',
    destination: 'Ooty',
    fromDate: '26 Jul 2026',
    fromTime: '05:00 AM',
    toDate: '27 Jul 2026',
    toTime: '09:00 PM',
    status: 'rejected',
    student: roleLabels.student,
    rollNo: '21CSE1042',
    hostel: 'Block C · 214',
    requestedAt: '1 week ago',
    approvedBy: roleLabels.mother,
    note: 'Exams are close — stay on campus this weekend.',
  },
  {
    id: 'OP-2350',
    reason: 'Internship interview',
    category: 'Academic',
    destination: 'Tidel Park, Chennai',
    fromDate: '18 Jul 2026',
    fromTime: '07:00 AM',
    toDate: '19 Jul 2026',
    toTime: '10:00 PM',
    status: 'expired',
    student: roleLabels.student,
    rollNo: '21CSE1042',
    hostel: 'Block C · 214',
    requestedAt: '3 weeks ago',
    approvedBy: roleLabels.father,
  },
  /* --- Sibling: 22MEC2091 --- */
  {
    id: 'OP-2420',
    reason: 'Workshop at partner institute',
    category: 'Academic',
    destination: 'PSG Tech, Peelamedu',
    fromDate: '09 Aug 2026',
    fromTime: '07:30 AM',
    toDate: '09 Aug 2026',
    toTime: '06:00 PM',
    status: 'pending',
    student: roleLabels.student,
    rollNo: '22MEC2091',
    hostel: 'Block A · 014',
    requestedAt: '45 minutes ago',
  },
  {
    id: 'OP-2391',
    reason: 'Currently out — hostel supplies',
    category: 'Personal',
    destination: 'Gandhipuram Market',
    fromDate: '05 Aug 2026',
    fromTime: '04:00 PM',
    toDate: '05 Aug 2026',
    toTime: '08:00 PM',
    status: 'active',
    student: roleLabels.student,
    rollNo: '22MEC2091',
    hostel: 'Block A · 014',
    requestedAt: '1 day ago',
    approvedBy: roleLabels.father,
  },
  {
    id: 'OP-2364',
    reason: 'Cricket tournament, inter-college',
    category: 'Academic',
    destination: 'Karunya University',
    fromDate: '22 Jul 2026',
    fromTime: '06:00 AM',
    toDate: '22 Jul 2026',
    toTime: '09:00 PM',
    status: 'approved',
    student: roleLabels.student,
    rollNo: '22MEC2091',
    hostel: 'Block A · 014',
    requestedAt: '2 weeks ago',
    approvedBy: roleLabels.father,
  },
  /* --- Sibling: 23ECE3018 --- */
  {
    id: 'OP-2421',
    reason: 'Cousin’s wedding reception',
    category: 'Home Visit',
    destination: 'Salem, TN',
    fromDate: '14 Aug 2026',
    fromTime: '04:00 PM',
    toDate: '16 Aug 2026',
    toTime: '07:00 PM',
    status: 'pending',
    student: roleLabels.student,
    rollNo: '23ECE3018',
    hostel: 'Block B · 307',
    requestedAt: '20 minutes ago',
  },
  {
    id: 'OP-2388',
    reason: 'Passport biometrics appointment',
    category: 'Personal',
    destination: 'PSK Coimbatore',
    fromDate: '30 Jul 2026',
    fromTime: '08:00 AM',
    toDate: '30 Jul 2026',
    toTime: '02:00 PM',
    status: 'approved',
    student: roleLabels.student,
    rollNo: '23ECE3018',
    hostel: 'Block B · 307',
    requestedAt: '1 week ago',
    approvedBy: roleLabels.mother,
  },
  {
    id: 'OP-2359',
    reason: 'Late-night concert in town',
    category: 'Personal',
    destination: 'Codissia Grounds',
    fromDate: '20 Jul 2026',
    fromTime: '06:00 PM',
    toDate: '20 Jul 2026',
    toTime: '11:30 PM',
    status: 'rejected',
    student: roleLabels.student,
    rollNo: '23ECE3018',
    hostel: 'Block B · 307',
    requestedAt: '3 weeks ago',
    approvedBy: roleLabels.mother,
    note: 'Too late for a first-year. Not this time.',
  },
];

/** Every request a guardian could ever see, across all wards. */
export const parentQueue: Outpass[] = outpasses.filter((o) => o.status === 'pending');

/** Requests from one ward only — what the guardian screens actually render. */
export function outpassesFor(rollNo: string) {
  return outpasses.filter((o) => o.rollNo === rollNo);
}

/** Pending requests for one ward. */
export function pendingFor(rollNo: string) {
  return parentQueue.filter((o) => o.rollNo === rollNo);
}

export const categories = ['Home Visit', 'Medical', 'Academic', 'Personal', 'Emergency'];

/* ----------------------------------------------------------- Late entries */

/**
 * A return that came in after the time printed on the gate pass.
 * Guardians tap the "Late returns" tile on the ward screen to read these.
 */
export type LateEntry = {
  id: string;
  rollNo: string;
  /** The pass the student was out on. */
  passId: string;
  date: string;
  /** Return time printed on the pass. */
  expected: string;
  /** Time the gate actually scanned them back in. */
  actual: string;
  /** Minutes past the expected return. */
  delayMins: number;
  severity: 'minor' | 'major';
  /** Reason the student gave at the gate. */
  reason: string;
  /** What the hostel office did about it. */
  action: string;
  gate: string;
  recordedBy: string;
  /** Set once a guardian has opened the record. */
  acknowledged: boolean;
};

export const lateEntries: LateEntry[] = [
  {
    id: 'LE-118',
    rollNo: '21CSE1042',
    passId: 'OP-2402',
    date: '02 Aug 2026',
    expected: '02:00 PM',
    actual: '02:38 PM',
    delayMins: 38,
    severity: 'minor',
    reason: 'Clinic ran over schedule; bus from Gandhipuram was delayed.',
    action: 'Warning noted. No disciplinary action.',
    gate: 'Main Gate · Turnstile 2',
    recordedBy: roleLabels.warden,
    acknowledged: false,
  },
  {
    id: 'LE-104',
    rollNo: '22MEC2091',
    passId: 'OP-2364',
    date: '22 Jul 2026',
    expected: '09:00 PM',
    actual: '11:15 PM',
    delayMins: 135,
    severity: 'major',
    reason: 'Tournament final went into extra overs; team bus left late.',
    action: 'Explanation accepted after warden call with guardian.',
    gate: 'Main Gate · Turnstile 1',
    recordedBy: roleLabels.warden,
    acknowledged: true,
  },
  {
    id: 'LE-092',
    rollNo: '22MEC2091',
    passId: 'OP-2331',
    date: '11 Jul 2026',
    expected: '07:00 PM',
    actual: '07:22 PM',
    delayMins: 22,
    severity: 'minor',
    reason: 'Heavy rain, auto took the long route.',
    action: 'Logged only.',
    gate: 'Side Gate',
    recordedBy: roleLabels.warden,
    acknowledged: true,
  },
];

export function lateEntriesFor(rollNo: string) {
  return lateEntries.filter((l) => l.rollNo === rollNo);
}

/* -------------------------------------------------- Profile edit requests */

/**
 * Students and guardians cannot edit their own record — they raise a change
 * request and the admin applies it. One request can carry several fields.
 */
export type ProfileFieldChange = {
  field: string;
  current: string;
  requested: string;
};

export type ProfileRequestStatus = 'pending' | 'approved' | 'rejected';

export type ProfileRequest = {
  id: string;
  /** Who raised it. */
  role: 'student' | 'parent';
  /** Role label of the requester — never a personal name. */
  requester: string;
  /** Roll number the request relates to. */
  rollNo: string;
  fields: ProfileFieldChange[];
  reason: string;
  submitted: string;
  status: ProfileRequestStatus;
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
  /** Whether the requester attached proof (ID card, bill, etc.). */
  hasAttachment?: boolean;
};

/**
 * Which fields each role may ask the admin to change.
 * Anything not listed here is fixed by the institution.
 */
export const editableFields: Record<'student' | 'parent', { key: string; label: string; icon: string; keyboard?: 'default' | 'phone-pad' | 'email-address' }[]> = {
  student: [
    { key: 'phone', label: 'Phone number', icon: 'call-outline', keyboard: 'phone-pad' },
    { key: 'email', label: 'Email address', icon: 'mail-outline', keyboard: 'email-address' },
    { key: 'hostel', label: 'Hostel & room', icon: 'bed-outline' },
    { key: 'guardian', label: 'Approving guardian', icon: 'people-outline' },
    { key: 'address', label: 'Home address', icon: 'home-outline' },
  ],
  parent: [
    { key: 'phone', label: 'Phone number', icon: 'call-outline', keyboard: 'phone-pad' },
    { key: 'email', label: 'Email address', icon: 'mail-outline', keyboard: 'email-address' },
    { key: 'relation', label: 'Relation to ward', icon: 'people-outline' },
    { key: 'altPhone', label: 'Alternate contact', icon: 'call-outline', keyboard: 'phone-pad' },
    { key: 'address', label: 'Home address', icon: 'home-outline' },
  ],
};

export const profileRequests: ProfileRequest[] = [
  {
    id: 'PR-0071',
    role: 'student',
    requester: roleLabels.student,
    rollNo: '21CSE1042',
    fields: [
      { field: 'Phone number', current: '+91 98765 43210', requested: '+91 91234 55678' },
      { field: 'Hostel & room', current: 'Block C · Room 214', requested: 'Block C · Room 219' },
    ],
    reason: 'Changed my number and moved rooms after the hostel reshuffle.',
    submitted: '35 minutes ago',
    status: 'pending',
    hasAttachment: true,
  },
  {
    id: 'PR-0070',
    role: 'parent',
    requester: roleLabels.mother,
    rollNo: '23ECE3018',
    fields: [
      { field: 'Phone number', current: '+91 99887 66443', requested: '+91 99887 60012' },
    ],
    reason: 'Old SIM deactivated — approvals are not reaching me.',
    submitted: '3 hours ago',
    status: 'pending',
  },
  {
    id: 'PR-0068',
    role: 'parent',
    requester: roleLabels.father,
    rollNo: '22MEC2091',
    fields: [
      { field: 'Alternate contact', current: '—', requested: '+91 90045 77120' },
      { field: 'Home address', current: 'Salem, TN', requested: 'Erode, TN' },
    ],
    reason: 'We have relocated. Please update both wards’ records.',
    submitted: 'Yesterday',
    status: 'pending',
  },
  {
    id: 'PR-0064',
    role: 'student',
    requester: roleLabels.student,
    rollNo: '22MEC2091',
    fields: [{ field: 'Email address', current: 'old@college.edu', requested: 'student2@college.edu' }],
    reason: 'College reissued my mail ID.',
    submitted: '4 days ago',
    status: 'approved',
    decidedBy: roleLabels.admin,
    decidedAt: '3 days ago',
  },
  {
    id: 'PR-0059',
    role: 'student',
    requester: roleLabels.student,
    rollNo: '23ECE3018',
    fields: [{ field: 'Approving guardian', current: roleLabels.mother, requested: roleLabels.father }],
    reason: 'Would prefer my father to approve requests.',
    submitted: '1 week ago',
    status: 'rejected',
    decidedBy: roleLabels.admin,
    decidedAt: '6 days ago',
    note: 'Guardian changes need a signed form from both parents.',
  },
];

/** Requests raised by a given role — what that role sees on their profile. */
export function profileRequestsFor(role: 'student' | 'parent', rollNo?: string) {
  return profileRequests.filter(
    (r) => r.role === role && (rollNo ? r.rollNo === rollNo : true)
  );
}

export const pendingProfileRequests = profileRequests.filter((r) => r.status === 'pending');

/* ------------------------------------------------------ Groups & branding */

/** A student on the roster — identified by roll number only. */
export type Student = {
  rollNo: string;
  label: string;
  hostel: string;
  year: string;
};

export const roster: Student[] = [
  { rollNo: '21CSE1042', label: roleLabels.student, hostel: 'Block C · 214', year: 'Year 3' },
  { rollNo: '21CSE1043', label: roleLabels.student, hostel: 'Block C · 215', year: 'Year 3' },
  { rollNo: '21CSE1051', label: roleLabels.student, hostel: 'Block C · 220', year: 'Year 3' },
  { rollNo: '21CSE1077', label: roleLabels.student, hostel: 'Block D · 108', year: 'Year 3' },
  { rollNo: '22MEC2087', label: roleLabels.student, hostel: 'Block A · 011', year: 'Year 2' },
  { rollNo: '22MEC2091', label: roleLabels.student, hostel: 'Block A · 014', year: 'Year 2' },
  { rollNo: '22MEC2104', label: roleLabels.student, hostel: 'Block A · 019', year: 'Year 2' },
  { rollNo: '23ECE3011', label: roleLabels.student, hostel: 'Block B · 302', year: 'Year 1' },
  { rollNo: '23ECE3018', label: roleLabels.student, hostel: 'Block B · 307', year: 'Year 1' },
  { rollNo: '23ECE3044', label: roleLabels.student, hostel: 'Block B · 311', year: 'Year 1' },
];

/**
 * A group the admin can brand independently.
 * `appName` + `iconColors` + `iconLabel` are pushed only to `memberRollNos`.
 */
export type Group = {
  id: string;
  name: string;
  /** Home-screen app name shown to this group alone. */
  appName: string;
  memberRollNos: string[];
  members: number;
  iconLabel: string;
  iconColors: [string, string];
  shape: string;
  updated: string;
};

export const groups: Group[] = [
  {
    id: 'grp_cse',
    name: 'CSE 2021',
    appName: 'CSE Pass',
    memberRollNos: ['21CSE1042', '21CSE1043', '21CSE1051', '21CSE1077'],
    members: 184,
    iconLabel: 'CS',
    iconColors: ['#B9000E', '#D81324'],
    shape: 'squircle',
    updated: 'Updated 3 days ago',
  },
  {
    id: 'grp_mech',
    name: 'Mechanical 2022',
    appName: 'Mech Pass',
    memberRollNos: ['22MEC2087', '22MEC2091'],
    members: 142,
    iconLabel: 'ME',
    iconColors: ['#0EA5E9', '#22D3EE'],
    shape: 'rounded',
    updated: 'Updated 1 week ago',
  },
  {
    id: 'grp_hostel_a',
    name: 'Hostel Block A',
    appName: 'Iverto.ai',
    memberRollNos: ['22MEC2087', '22MEC2091', '22MEC2104'],
    members: 320,
    iconLabel: 'HA',
    iconColors: ['#F59E0B', '#EF4444'],
    shape: 'squircle',
    updated: 'Default branding',
  },
  {
    id: 'grp_ece',
    name: 'ECE 2023',
    appName: 'ECE Gate',
    memberRollNos: ['23ECE3011', '23ECE3018', '23ECE3044'],
    members: 96,
    iconLabel: 'EC',
    iconColors: ['#10B981', '#059669'],
    shape: 'circle',
    updated: 'Updated 2 weeks ago',
  },
];

/** Icon presets offered in the admin branding editor. */
export const iconPresets: { id: string; name: string; colors: [string, string] }[] = [
  { id: 'iverto', name: 'Iverto Crimson', colors: ['#B9000E', '#D81324'] },
  { id: 'ember', name: 'Ember', colors: ['#8E000B', '#B9000E'] },
  { id: 'ocean', name: 'Ocean', colors: ['#0EA5E9', '#22D3EE'] },
  { id: 'sunset', name: 'Sunset', colors: ['#F59E0B', '#EF4444'] },
  { id: 'forest', name: 'Forest', colors: ['#10B981', '#059669'] },
  { id: 'graphite', name: 'Graphite', colors: ['#3F3F46', '#18181B'] },
  { id: 'violet', name: 'Violet', colors: ['#7C3AED', '#A78BFA'] },
  { id: 'slate', name: 'Slate', colors: ['#64748B', '#94A3B8'] },
  { id: 'amber', name: 'Amber', colors: ['#D97706', '#FBBF24'] },
];

export const adminStats = [
  { label: 'Pending', value: '18', icon: 'time-outline', fg: '#B45309', bg: 'rgba(245,158,11,0.12)' },
  {
    label: 'Approved today',
    value: '46',
    icon: 'checkmark-circle-outline',
    fg: '#059669',
    bg: 'rgba(16,185,129,0.10)',
  },
  {
    label: 'Currently out',
    value: '31',
    icon: 'walk-outline',
    fg: '#0284C7',
    bg: 'rgba(14,165,233,0.10)',
  },
  {
    label: 'Overdue',
    value: '2',
    icon: 'alert-circle-outline',
    fg: '#DC2626',
    bg: 'rgba(239,68,68,0.10)',
  },
] as const;

export const activity = [
  { id: 1, text: 'Student 22MEC2087 returned to campus', time: '10 min ago', icon: 'log-in-outline' },
  { id: 2, text: 'Father approved OP-2410', time: '32 min ago', icon: 'checkmark-done-outline' },
  { id: 3, text: 'Profile change PR-0071 awaiting review', time: '35 min ago', icon: 'create-outline' },
  { id: 4, text: 'Branding updated for CSE 2021', time: '3 days ago', icon: 'color-palette-outline' },
  { id: 5, text: 'Warden rejected OP-2399', time: '4 days ago', icon: 'close-circle-outline' },
] as const;
