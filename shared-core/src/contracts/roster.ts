export interface RosterMemberUserSummary {
  id?: number;
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
  displayName?: string;
  email?: string | null;
}

export interface RosterPharmacyMember {
  id?: number;
  user?: number | RosterMemberUserSummary | null;
  userId?: number | null;
  user_id?: number | null;
  userDetails?: RosterMemberUserSummary | null;
  userDetail?: RosterMemberUserSummary | null;
  user_detail?: RosterMemberUserSummary | null;
  role?: string | null;
  userRole?: string | null;
  user_role?: string | null;
  isActive?: boolean | null;
  is_active?: boolean | null;
  invitedName?: string | null;
  invited_name?: string | null;
  name?: string | null;
  email?: string | null;
}

export interface WorkerShiftRequestRecord {
  id: number | string;
  status?: string | null;
  requestType?: string | null;
  request_type?: string | null;
  requestedBy?: number | null;
  requestedById?: number | null;
  requested_by?: number | null;
  requesterName?: string | null;
  requester_name?: string | null;
  pharmacyId?: number | null;
  pharmacy_id?: number | null;
  pharmacyName?: string | null;
  pharmacy_name?: string | null;
  slotDate?: string | null;
  slot_date?: string | null;
  startTime?: string | null;
  start_time?: string | null;
  endTime?: string | null;
  end_time?: string | null;
  role?: string | null;
  note?: string | null;
  reason?: string | null;
  leaveType?: string | null;
  leave_type?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
}
