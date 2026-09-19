import type {
  OpenShift,
  RosterAssignment,
  RosterSlotDetail,
} from '@chemisttasker/shared-core';

export const DEFAULT_ESCALATION_LEVELS = [
  'FULL_PART_TIME',
  'LOCUM_CASUAL',
  'OWNER_CHAIN',
  'ORG_CHAIN',
  'PLATFORM',
];

export const getVisibilityLabel = (visibility?: string | null) => {
  switch (visibility) {
    case 'FULL_PART_TIME': return 'Full/Part Time';
    case 'LOCUM_CASUAL': return 'Locum/Casual';
    case 'OWNER_CHAIN': return 'Owner Chain';
    case 'ORG_CHAIN': return 'Organization Chain';
    case 'PLATFORM': return 'ChemistTasker';
    default: return 'ChemistTasker';
  }
};

export type OpenShiftViewModel = OpenShift & {
  visibility?: string | null;
  allowedEscalationLevels?: string[];
  pharmacyName?: string | null;
};

export type AssignmentViewModel = RosterAssignment & {
  isOpenShift?: boolean;
  isCoverRequest?: boolean;
  origin?: {
    label?: string;
  };
  originalShift?: OpenShiftViewModel;
};

export interface ShiftForEdit {
  id: number;
  roleNeeded?: string | null;
  slots: RosterSlotDetail[];
}

export const ROLES = ['PHARMACIST', 'ASSISTANT', 'INTERN', 'TECHNICIAN', 'STUDENT'];
export const ALL_STAFF = 'ALL';

export const LEAVE_TYPES_MAP: { [key: string]: string } = {
  SICK: 'Sick Leave',
  ANNUAL: 'Annual Leave',
  COMPASSIONATE: 'Compassionate Leave',
  STUDY: 'Study Leave',
  CARER: "Carer's Leave",
  UNPAID: 'Unpaid Leave',
  OTHER: 'Other',
};
