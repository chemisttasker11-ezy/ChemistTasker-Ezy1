import type {
  PharmacySummary,
  RosterAssignment,
  WorkerShiftRequest as WorkerShiftRequestDto,
  Shift as SharedShift,
} from '@chemisttasker/shared-core';

export interface Pharmacy {
  id: number;
  name: string;
}

export interface UserDetail {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
}

export interface SlotDetail {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
}

export interface ShiftDetail {
  id: number;
  pharmacy_name: string;
  role_needed: string;
  visibility: string;
}

export interface UiLeaveRequest {
  id: number;
  leave_type: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  note: string;
}

export interface WorkerSwapRequest {
  id: number;
  pharmacy: number;
  role: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  note: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_PUBLISHED';
}

export interface Assignment {
  id: number | string;
  slot_date: string;
  user: number | null;
  slot?: number;
  shift?: number;
  user_detail: UserDetail;
  slot_detail: SlotDetail;
  shift_detail: ShiftDetail;
  leave_request: UiLeaveRequest | null;
  isSwapRequest?: boolean;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_PUBLISHED';
  isOpenShift?: boolean;
  originalShiftId?: number;
  swap_request?: WorkerSwapRequest;
  origin?: {
    type?: string;
    label?: string;
    organizationName?: string | null;
  };
}

export interface OpenShift {
  id: number;
  pharmacy?: number | null;
  role_needed: string;
  slots: SlotDetail[];
  description: string;
}

export const mapPharmacySummaryToView = (summary: PharmacySummary): Pharmacy => ({
  id: summary.id,
  name: summary.name ?? 'Unnamed Pharmacy',
});

export const mapAssignmentToView = (
  assignment: RosterAssignment & {
    origin?: { type?: string; label?: string; organizationName?: string | null };
  },
): Assignment => ({
  id: assignment.id,
  slot_date: assignment.slotDate,
  user: assignment.user ?? null,
  slot: assignment.slot ?? undefined,
  shift: assignment.shift ?? undefined,
  user_detail: {
    id: assignment.userDetail.id,
    first_name: assignment.userDetail.firstName ?? '',
    last_name: assignment.userDetail.lastName ?? '',
    email: assignment.userDetail.email ?? '',
  },
  slot_detail: {
    id: assignment.slotDetail.id,
    date: assignment.slotDetail.date,
    start_time: assignment.slotDetail.startTime,
    end_time: assignment.slotDetail.endTime,
  },
  shift_detail: {
    id: assignment.shiftDetail.id,
    pharmacy_name: assignment.shiftDetail.pharmacyName ?? 'Unknown Pharmacy',
    role_needed: assignment.shiftDetail.roleNeeded ?? 'PHARMACIST',
    visibility: assignment.shiftDetail.visibility ?? 'PRIVATE',
  },
  leave_request: assignment.leaveRequest
    ? {
        id: assignment.leaveRequest.id,
        leave_type: assignment.leaveRequest.leaveType,
        status: assignment.leaveRequest.status,
        note: assignment.leaveRequest.note ?? '',
      }
    : null,
  isSwapRequest: false,
  status: undefined,
  isOpenShift: false,
  originalShiftId: undefined,
  swap_request: undefined,
  origin: assignment.origin,
});

export const mapOpenShiftToView = (shift: SharedShift): OpenShift => {
  const slots = shift.slots ?? [];
  return {
    id: shift.id,
    pharmacy: (shift as any).pharmacy ?? null,
    role_needed: shift.roleNeeded,
    slots: slots.map((slot) => ({
      id: slot.id,
      date: slot.date,
      start_time: slot.startTime,
      end_time: slot.endTime,
    })),
    description: shift.description ?? '',
  };
};

export const mapWorkerRequestToView = (request: WorkerShiftRequestDto): WorkerSwapRequest => ({
  id: request.id,
  pharmacy: request.pharmacy ?? 0,
  role: request.role,
  slot_date: request.slotDate,
  start_time: request.startTime,
  end_time: request.endTime,
  note: request.note ?? '',
  status: request.status,
});

export const ROLES = ['PHARMACIST', 'ASSISTANT', 'INTERN', 'TECHNICIAN', 'STUDENT'];
export const ALL_STAFF = 'ALL';
export const LEAVE_TYPES = [
  { value: 'SICK', label: 'Sick Leave' },
  { value: 'ANNUAL', label: 'Annual Leave' },
  { value: 'COMPASSIONATE', label: 'Compassionate Leave' },
  { value: 'STUDY', label: 'Study Leave' },
  { value: 'CARER', label: "Carer's Leave" },
  { value: 'UNPAID', label: 'Unpaid Leave' },
  { value: 'OTHER', label: 'Other' },
];
