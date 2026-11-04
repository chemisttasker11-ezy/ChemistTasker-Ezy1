/** Shared phone-specific form validation for the existing public membership-invite contract. */
export type MagicMembershipInfo = {
  pharmacy: number;
  pharmacy_name: string;
  category: 'FULL_PART_TIME' | 'LOCUM_CASUAL';
  expires_at?: string;
  payroll_enabled?: boolean;
};

export type MagicWorkerIdentity = { role?: string | null; email?: string | null };
export type MagicMembershipForm = {
  role: string; firstName: string; lastName: string; username: string;
  email: string; mobile: string; dateOfBirth: string; jobTitle: string;
  pharmacistAwardLevel: string; otherstaffClassificationLevel: string;
  internHalf: string; studentYear: string;
};

export const membershipRoles = [
  {value:'PHARMACIST',label:'Pharmacist'},
  {value:'TECHNICIAN',label:'Dispensary technician'},
  {value:'ASSISTANT',label:'Pharmacy assistant'},
  {value:'INTERN',label:'Intern'},
  {value:'STUDENT',label:'Pharmacy student'},
];

export const roleClassificationOptions: Record<string, Array<{value:string;label:string}>> = {
  PHARMACIST: [
    {value:'PHARMACIST',label:'Pharmacist'},
    {value:'EXPERIENCED_PHARMACIST',label:'Experienced pharmacist'},
    {value:'PHARMACIST_IN_CHARGE',label:'Pharmacist in charge'},
    {value:'PHARMACIST_MANAGER',label:'Pharmacist manager'},
  ],
  TECHNICIAN: ['LEVEL_1','LEVEL_2','LEVEL_3','LEVEL_4'].map((value,index) => ({value,label:'Level '+(index+1)})),
  ASSISTANT: ['LEVEL_1','LEVEL_2','LEVEL_3','LEVEL_4'].map((value,index) => ({value,label:'Level '+(index+1)})),
  INTERN: [{value:'FIRST_HALF',label:'First half'},{value:'SECOND_HALF',label:'Second half'}],
  STUDENT: [1,2,3,4].map((year) => ({value:'YEAR_'+year,label:'Year '+year})),
};

export const newMagicMembershipForm = (): MagicMembershipForm => ({
  role:'PHARMACIST', firstName:'', lastName:'', username:'', email:'', mobile:'', dateOfBirth:'',
  jobTitle:'', pharmacistAwardLevel:'', otherstaffClassificationLevel:'', internHalf:'', studentYear:'',
});

const classificationFor = (form: MagicMembershipForm) => form.role === 'PHARMACIST' ? form.pharmacistAwardLevel
  : ['TECHNICIAN','ASSISTANT'].includes(form.role) ? form.otherstaffClassificationLevel
  : form.role === 'INTERN' ? form.internHalf : form.role === 'STUDENT' ? form.studentYear : '';

export function validateMagicMembership(
  form: MagicMembershipForm,
  info: MagicMembershipInfo,
  user: MagicWorkerIdentity | null,
  today = new Date().toISOString().slice(0, 10),
): string | null {
  if (user && !['PHARMACIST','OTHER_STAFF'].includes(String(user.role))) {
    return 'Only pharmacist and other staff accounts may apply while signed in.';
  }
  if (!membershipRoles.some((option) => option.value === form.role)) return 'Choose a valid worker role.';
  if (user?.role === 'PHARMACIST' && form.role !== 'PHARMACIST') return 'Your signed-in pharmacist role must match this application.';
  if (user?.role === 'OTHER_STAFF' && form.role === 'PHARMACIST') return 'Your signed-in other staff role must match this application.';
  if (!form.firstName.trim() || !form.lastName.trim()) return 'Enter your first name and last name.';
  if (!form.username.trim()) return 'Enter your username.';
  if (!form.mobile.trim()) return 'Enter your mobile number.';
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return 'Enter a valid email address.';
  if (user?.email && form.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    return 'Use the same email address as your signed-in account.';
  }
  const date = form.dateOfBirth;
  const dateValue = new Date(date + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(dateValue.getTime())
    || dateValue.toISOString().slice(0, 10) !== date || date > today) {
    return date > today ? 'Date of birth cannot be in the future.' : 'Enter a valid date of birth.';
  }
  if (info.category === 'FULL_PART_TIME' && !form.jobTitle.trim()) return 'Enter your job title.';
  if (info.category === 'FULL_PART_TIME' && info.payroll_enabled && !classificationFor(form)) {
    return 'Select the Award classification for your role.';
  }
  return null;
}

export function buildMagicMembershipPayload(
  form: MagicMembershipForm, info: MagicMembershipInfo, _user: MagicWorkerIdentity | null,
): Record<string, unknown> {
  const classificationRequired = info.category === 'FULL_PART_TIME' && Boolean(info.payroll_enabled);
  return {
    role: form.role,
    first_name: form.firstName.trim(),
    last_name: form.lastName.trim(),
    username: form.username.trim(),
    mobile_number: form.mobile.trim(),
    date_of_birth: form.dateOfBirth,
    email: form.email.trim().toLowerCase(),
    ...(info.category === 'FULL_PART_TIME' ? {job_title: form.jobTitle.trim()} : {}),
    pharmacist_award_level: classificationRequired && form.role === 'PHARMACIST' ? form.pharmacistAwardLevel : null,
    otherstaff_classification_level: classificationRequired && ['TECHNICIAN','ASSISTANT'].includes(form.role) ? form.otherstaffClassificationLevel : null,
    intern_half: classificationRequired && form.role === 'INTERN' ? form.internHalf : null,
    student_year: classificationRequired && form.role === 'STUDENT' ? form.studentYear : null,
  };
}
