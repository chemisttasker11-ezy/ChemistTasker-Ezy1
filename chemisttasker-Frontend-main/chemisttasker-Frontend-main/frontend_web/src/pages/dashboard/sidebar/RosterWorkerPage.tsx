import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Container,
  Typography,
  Skeleton,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  CircularProgress,
  SelectChangeEvent,
  ListItemText,
  List,
  ListItem,
  Tabs,
  Tab,
  Checkbox,
  OutlinedInput,
  Snackbar,
  Alert
} from '@mui/material';
// Calendar Imports
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { calendarViews, calendarMessages, getDateRangeForView, CalendarViewKey } from './calendarViews';
import { useAuth } from '../../../contexts/AuthContext'; // Using the corrected path
import { ROSTER_COLORS } from '../../../constants/rosterColors';
import {
  PharmacySummary,
  RosterAssignment,
  WorkerShiftRequest as WorkerShiftRequestDto,
  Shift as SharedShift,
  fetchRosterWorkerPharmaciesService,
  fetchRosterWorkerAssignments,
  fetchCommunityShifts,
  fetchWorkerShiftRequestsService,
  claimShiftService,
  createLeaveRequestService,
  updateLeaveRequestService,
  deleteLeaveRequestService,
  createWorkerShiftRequestService,
  updateWorkerShiftRequestService,
  deleteWorkerShiftRequestService,
} from '@chemisttasker/shared-core';
const localizer = momentLocalizer(moment);

const mapPharmacySummaryToView = (summary: PharmacySummary): Pharmacy => ({
  id: summary.id,
  name: summary.name ?? 'Unnamed Pharmacy',
});

const mapAssignmentToView = (
  assignment: RosterAssignment & {
    origin?: { type?: string; label?: string; organizationName?: string | null };
  }
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

const mapOpenShiftToView = (shift: SharedShift): OpenShift => {
  const slots = shift.slots ?? [];
  return {
    id: shift.id,
    pharmacy: (shift as any).pharmacy ?? null,
    role_needed: shift.roleNeeded,
    slots: slots.map(slot => ({
      id: slot.id,
      date: slot.date,
      start_time: slot.startTime,
      end_time: slot.endTime,
    })),
    description: shift.description ?? '',
  };
};

const mapWorkerRequestToView = (request: WorkerShiftRequestDto): WorkerSwapRequest => ({
  id: request.id,
  pharmacy: request.pharmacy ?? 0,
  role: request.role,
  slot_date: request.slotDate,
  start_time: request.startTime,
  end_time: request.endTime,
  note: request.note ?? '',
  status: request.status,
});
// --- Interfaces ---
interface Pharmacy {
  id: number;
  name: string;
}
interface UserDetail { id: number; first_name: string; last_name: string; email: string; }
interface SlotDetail { id: number; date: string; start_time: string; end_time: string; }
interface ShiftDetail { id: number; pharmacy_name: string; role_needed: string; visibility: string; }
interface UiLeaveRequest {
  id: number;
  leave_type: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  note: string;
}
interface WorkerSwapRequest {
  id: number;
  pharmacy: number;
  role: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  note: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_PUBLISHED';
}
interface Assignment {
  id: number | string;
  slot_date: string;
  user: number | null;
  slot?: number;
  shift?: number;
  user_detail: UserDetail;
  slot_detail: SlotDetail;
  shift_detail: ShiftDetail;
  leave_request: UiLeaveRequest | null;
  isSwapRequest?: boolean;  // added for frontend-only marking
  status?: "PENDING" | "APPROVED" | "REJECTED" | "AUTO_PUBLISHED"; // added for cover/swaps
  isOpenShift?: boolean; // NEW: added for owner-created open shifts
  originalShiftId?: number; // NEW: To store the original ID of an open shift
  swap_request?: WorkerSwapRequest;
  origin?: {
    type?: string;
    label?: string;
    organizationName?: string | null;
  };
}
// NEW: Interface for an open shift (unassigned, community-visible)
interface OpenShift {
  id: number;
  pharmacy?: number | null;
  role_needed: string;
  slots: SlotDetail[];
  description: string;
}
// --- Constants ---
const ROLES = ['PHARMACIST', 'ASSISTANT', 'INTERN', 'TECHNICIAN'];
const ALL_STAFF = 'ALL';
const LEAVE_TYPES = [
    { value: 'SICK', label: 'Sick Leave' },
    { value: 'ANNUAL', label: 'Annual Leave' },
    { value: 'COMPASSIONATE', label: 'Compassionate Leave' },
    { value: 'STUDY', label: 'Study Leave' },
    { value: 'CARER', label: 'Carer\'s Leave' },
    { value: 'UNPAID', label: 'Unpaid Leave' },
    { value: 'OTHER', label: 'Other' },
];
// --- Skeleton Component for Unified Loading ---
const RosterPageSkeleton = () => (
    <Container maxWidth={false} disableGutters sx={{ width: '100%', py: { xs: 1, md: 2 } }}>
        <Typography variant="h4" gutterBottom><Skeleton width="30%" /></Typography>
        <Skeleton variant="rectangular" height={48} sx={{ mb: 3 }} />
        <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2}}>
            <Typography variant="h5"><Skeleton width="200px" /></Typography>
            <Skeleton variant="rectangular" width={300} height={56} />
        </Box>
        <Typography variant="body2"><Skeleton width="80%" /></Typography>
        <Skeleton variant="rectangular" height={600} sx={{ mt: 2 }} />
    </Container>
);
// --- Main Component ---
export default function RosterWorkerPage() {
  const { user } = useAuth();
  const currentUserId = user?.id;
  const calendarDragScrollFrameRef = useRef<number | null>(null);
  const calendarDragPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const isCalendarDragScrollingRef = useRef(false);
  const initialPharmacyFromUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const candidate = params.get('pharmacy') ?? params.get('admin_pharmacy_id');
    const num = candidate ? Number(candidate) : null;
    return Number.isFinite(num) ? num : null;
  }, []);
  // --- Component State ---
  const [allAssignments, setAllAssignments] = useState<Assignment[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [selectedPharmacyId, setSelectedPharmacyId] = useState<number | null>(null);
  
  // --- Loading States ---
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isAssignmentsLoading, setIsAssignmentsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // --- Calendar State ---
  const [calendarView, setCalendarView] = useState<CalendarViewKey>('week'); // Align with shared calendar configuration
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  
  // --- Dialogs and Forms State ---
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [leaveType, setLeaveType] = useState('');
  const [leaveNote, setLeaveNote] = useState('');
  
  // Action & Swap/Cover dialog state
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false);
  const [isSwapDialogOpen, setIsSwapDialogOpen] = useState(false);
  const [isClaimShiftDialogOpen, setIsClaimShiftDialogOpen] = useState(false); // NEW: Dialog for claiming open shifts
  const [isEditingLeaveRequest, setIsEditingLeaveRequest] = useState(false);
  const [isEditingSwapRequest, setIsEditingSwapRequest] = useState(false);
  // Empty-slot (or generic) selection payload
  const [selectedSlotDate, setSelectedSlotDate] = useState<Date | null>(null);
  const [selectedStart, setSelectedStart] = useState<Date | null>(null);
  const [selectedEnd, setSelectedEnd] = useState<Date | null>(null);
  // Swap/Cover form fields
  const [swapNote, setSwapNote] = useState('');
  // --- Filter State ---
  const [roleFilters, setRoleFilters] = useState<string[]>([ALL_STAFF]);
  // Snackbar Notifications
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });
  const stopCalendarDragScroll = useCallback(() => {
    isCalendarDragScrollingRef.current = false;
    calendarDragPointerRef.current = null;
    if (calendarDragScrollFrameRef.current != null) {
      window.cancelAnimationFrame(calendarDragScrollFrameRef.current);
      calendarDragScrollFrameRef.current = null;
    }
  }, []);
  const runCalendarDragScroll = useCallback(() => {
    if (!isCalendarDragScrollingRef.current) {
      calendarDragScrollFrameRef.current = null;
      return;
    }

    const pointer = calendarDragPointerRef.current;
    if (pointer) {
      const edgeSize = 120;
      const maxStep = 28;
      const viewportHeight = window.innerHeight;
      let deltaY = 0;

      if (pointer.clientY < edgeSize) {
        deltaY = -Math.ceil(((edgeSize - pointer.clientY) / edgeSize) * maxStep);
      } else if (pointer.clientY > viewportHeight - edgeSize) {
        deltaY = Math.ceil(((pointer.clientY - (viewportHeight - edgeSize)) / edgeSize) * maxStep);
      }

      if (deltaY !== 0) {
        window.scrollBy({ top: deltaY, behavior: 'auto' });
        document.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          clientX: pointer.clientX,
          clientY: pointer.clientY,
          buttons: 1,
        }));
      }
    }

    calendarDragScrollFrameRef.current = window.requestAnimationFrame(runCalendarDragScroll);
  }, []);
  const startCalendarDragScroll = useCallback((target: EventTarget | null, clientX: number, clientY: number) => {
    if (!(target instanceof Element) || !target.closest('.rbc-time-content')) {
      return;
    }
    calendarDragPointerRef.current = { clientX, clientY };
    isCalendarDragScrollingRef.current = true;
    if (calendarDragScrollFrameRef.current == null) {
      calendarDragScrollFrameRef.current = window.requestAnimationFrame(runCalendarDragScroll);
    }
  }, [runCalendarDragScroll]);
  const updateCalendarDragPointer = useCallback((event: MouseEvent) => {
    if (!isCalendarDragScrollingRef.current) {
      return;
    }
    calendarDragPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', updateCalendarDragPointer);
    window.addEventListener('mouseup', stopCalendarDragScroll);
    return () => {
      window.removeEventListener('mousemove', updateCalendarDragPointer);
      window.removeEventListener('mouseup', stopCalendarDragScroll);
      stopCalendarDragScroll();
    };
  }, [stopCalendarDragScroll, updateCalendarDragPointer]);
  // --- DATA LOADING ---
  useEffect(() => {
    const loadInitialData = async () => {
      if (!currentUserId) return;
      setIsPageLoading(true);
      try {
        const loadedPharmacies = await fetchRosterWorkerPharmaciesService();
        const mapped = loadedPharmacies.map(mapPharmacySummaryToView);
        setPharmacies(mapped);
        if (mapped.length > 0) {
          const initialId = initialPharmacyFromUrl ?? mapped[0].id;
          setSelectedPharmacyId(initialId);
        }
      } catch (err: any) { 
        console.error("Failed to load initial page data", err); 
      } finally {
        setIsPageLoading(false);
      }
    };
    
    loadInitialData();
  }, [currentUserId, calendarDate, calendarView, initialPharmacyFromUrl]);
  useEffect(() => {
    if (!isPageLoading && selectedPharmacyId) {
      reloadAssignments();
    }
  }, [selectedPharmacyId, calendarDate, calendarView]);
const reloadAssignments = async () => {
  if (!selectedPharmacyId) return;
  const shouldShowSkeleton = isPageLoading;
  if (!shouldShowSkeleton) {
    setIsAssignmentsLoading(true);
  }
  const { start, end } = getDateRangeForView(calendarDate, calendarView);
  const startDate = start.format("YYYY-MM-DD");
  const endDate = end.format("YYYY-MM-DD");
  try {
    const [assignmentsRes, openShiftsRes, swapRes] = await Promise.all([
      fetchRosterWorkerAssignments({ pharmacyId: selectedPharmacyId, startDate, endDate }),
      fetchCommunityShifts({ pharmacyId: selectedPharmacyId, startDate, endDate, unassigned: true }),
      fetchWorkerShiftRequestsService({ pharmacyId: selectedPharmacyId, startDate, endDate }),
    ]);
    const assignments = assignmentsRes.map(mapAssignmentToView);
    const openShiftResults = Array.isArray(openShiftsRes) ? openShiftsRes : openShiftsRes?.results ?? [];
    const openShifts = openShiftResults.map(mapOpenShiftToView);
    const swapRequests = swapRes.map(mapWorkerRequestToView);
    // -------------------------------
    // 3️⃣ Map owner-created open shifts into calendar events
    // -------------------------------
    const mappedOpenShifts = openShifts.flatMap((shift: OpenShift) => 
      (shift.slots ?? []).map(slot => ({
        id: `open-${shift.id}-${slot.id}`,
        pharmacy: shift.pharmacy ?? null,
        slot_date: slot.date,
        user: null, // No assigned user
        slot: slot.id,
        shift: shift.id,
        user_detail: { id: 0, first_name: 'Open', last_name: 'Shift', email: '' },
        slot_detail: {
          id: slot.id,
          date: slot.date,
          start_time: slot.start_time,
          end_time: slot.end_time,
        },
        shift_detail: {
          id: shift.id,
          pharmacy_name: pharmacies.find((p) => p.id === Number(shift.pharmacy ?? selectedPharmacyId))?.name || 'Unknown Pharmacy',
          role_needed: shift.role_needed,
          visibility: 'LOCUM_CASUAL',
        },
        leave_request: null,
        isSwapRequest: false,
        isOpenShift: true, // Custom marker
        originalShiftId: shift.id, // Store original ID for claiming
        swap_request: undefined,
        status: undefined,
      }))
    );
    // -------------------------------
    // 3️⃣ Merge both into one list
    // -------------------------------
    const mappedSwapRequests: Assignment[] = swapRequests.map((req: WorkerSwapRequest) => {
      const requesterName = (req as any)?.requester_name || `${(user as any)?.first_name || ''} ${(user as any)?.last_name || ''}`.trim();
      const [firstName, ...restName] = requesterName.split(' ');
      const derivedFirstName = firstName || (user as any)?.first_name || '';
      const derivedLastName = restName.join(' ') || (user as any)?.last_name || '';
      const pharmacyName =
        pharmacies.find((p) => p.id === req.pharmacy)?.name ||
        pharmacies.find((p) => p.id === selectedPharmacyId)?.name ||
        'Unknown Pharmacy';
      return {
        id: `swap-${req.id}`,
        slot_date: req.slot_date,
        user: currentUserId ?? null,
        slot: undefined,
        shift: undefined,
        user_detail: {
          id: currentUserId ?? 0,
          first_name: derivedFirstName,
          last_name: derivedLastName,
          email: user?.email || '',
        },
        slot_detail: {
          id: req.id,
          date: req.slot_date,
          start_time: req.start_time,
          end_time: req.end_time,
        },
        shift_detail: {
          id: req.id,
          pharmacy_name: pharmacyName,
          role_needed: req.role,
          visibility: 'PRIVATE',
        },
        leave_request: null,
        status: req.status,
        isSwapRequest: true, // custom marker for style
        isOpenShift: false,
        originalShiftId: undefined,
        swap_request: req,
      };
    });
    const normalizedAssignments: Assignment[] = assignments.map((a: Assignment) => ({
      ...a,
      isSwapRequest: false,
      isOpenShift: false,
      swap_request: undefined,
    }));
    // -------------------------------
    // 4️⃣ Update state
    // -------------------------------
    const activePharmacyName =
      pharmacies.find((p) => p.id === selectedPharmacyId)?.name || null;
    const filteredAssignments = [
      ...normalizedAssignments,
      ...mappedSwapRequests,
      ...mappedOpenShifts,
    ].filter(item => {
      // Prefer explicit pharmacy id when present (swap requests)
      if ((item as any).pharmacy) {
        return Number((item as any).pharmacy) === Number(selectedPharmacyId);
      }
      // Fallback to pharmacy name on shift_detail (assignments/open shifts)
      if (activePharmacyName) {
        return (item as any).shift_detail?.pharmacy_name === activePharmacyName;
      }
      return true;
    });

    setAllAssignments(filteredAssignments);
  } catch (err: any) {
    console.error("Failed to load roster assignments or cover requests", err);
  } finally {
    if (!shouldShowSkeleton) {
      setIsAssignmentsLoading(false);
    }
    if (shouldShowSkeleton) {
      setIsPageLoading(false);
    }
  }
};
  // NEW: Handle claiming an open shift
  const handleClaimShift = async () => {
    if (!selectedAssignment || !selectedAssignment.isOpenShift || !selectedAssignment.originalShiftId) return;
    setIsSubmitting(true);
    try {
    setIsPageLoading(true);
      await claimShiftService({
        shiftId: selectedAssignment.originalShiftId,
        slotId: selectedAssignment.slot_detail.id,
      });
      setSnackbar({ open: true, message: "Shift claimed successfully!", severity: "success" });
      setIsClaimShiftDialogOpen(false);
      reloadAssignments();
    } catch (err: any) {
      setSnackbar({ open: true, message: `Failed to claim shift: ${err.response?.data?.detail || err.message}`, severity: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };
  // --- UI HANDLERS ---
  const handleSelectEvent = (event: { resource: Assignment }) => {
    const assignment = event.resource;
    const isMyShift = assignment.user === currentUserId;
    // Store the clicked assignment
    setSelectedAssignment(assignment);
    // Capture date/time for either Leave or Swap/Cover flows
    const start = moment(`${assignment.slot_date} ${assignment.slot_detail.start_time}`).toDate();
    const end   = moment(`${assignment.slot_date} ${assignment.slot_detail.end_time}`).toDate();
    setSelectedSlotDate(moment(assignment.slot_date).toDate());
    setSelectedStart(start);
    setSelectedEnd(end);
    if (assignment.isOpenShift) {
      setIsClaimShiftDialogOpen(true); // Open dialog to claim open shift
      setIsEditingLeaveRequest(false);
      setIsEditingSwapRequest(false);
      return;
    }
    setIsActionDialogOpen(false);
    if (assignment.isSwapRequest && assignment.swap_request) {
      setIsEditingSwapRequest(true);
      setSwapNote(assignment.swap_request.note || '');
      setIsSwapDialogOpen(true);
      return;
    }
    if (assignment.leave_request) {
      setIsEditingLeaveRequest(true);
      setLeaveType(assignment.leave_request.leave_type || '');
      setLeaveNote(assignment.leave_request.note || '');
      setIsLeaveDialogOpen(true);
      return;
    }
    if (!isMyShift) {
      setSnackbar({ open: true, message: 'You can only manage your own assigned shifts.', severity: 'info' });
      return;
    }
    setIsEditingLeaveRequest(false);
    setIsEditingSwapRequest(false);
    setLeaveType('');
    setLeaveNote('');
    setSwapNote('');
    setIsActionDialogOpen(true);
  };
const handleSubmitLeaveRequest = async () => {
  if (!selectedAssignment) {
    setSnackbar({ open: true, message: "Please select a shift.", severity: "warning" });
    return;
  }
  if (!leaveType) {
    setSnackbar({ open: true, message: "Please select a leave type.", severity: "warning" });
    return;
  }
  if (selectedAssignment.user !== currentUserId) {
    setSnackbar({ open: true, message: "You can only manage leave for your own assigned shifts.", severity: "warning" });
    return;
  }
  const existingLeave = selectedAssignment.leave_request;
  const isUpdate = isEditingLeaveRequest && !!existingLeave;
  if (isUpdate && existingLeave?.status !== 'PENDING') {
    setSnackbar({ open: true, message: "Only pending leave requests can be updated.", severity: "warning" });
    return;
  }
  setIsSubmitting(true);
  try {
    setIsPageLoading(true);
    if (isUpdate && existingLeave?.id) {
      await updateLeaveRequestService(existingLeave.id, {
        leave_type: leaveType,
        note: leaveNote,
      });
      setSnackbar({ open: true, message: "Leave request updated successfully.", severity: "success" });
    } else {
      await createLeaveRequestService({
        slot_assignment: selectedAssignment.id,
        leave_type: leaveType,
        note: leaveNote,
      });
      setSnackbar({ open: true, message: "Leave request submitted successfully.", severity: "success" });
    }
    setIsLeaveDialogOpen(false);
    setIsEditingLeaveRequest(false);
    setSelectedAssignment(null);
    reloadAssignments();
  } catch (err: any) {
    const message = (err as any)?.response?.data?.detail || (err as Error).message;
    setSnackbar({ open: true, message: `Failed to save leave request: ${message}`, severity: "error" });
  } finally {
    setIsSubmitting(false);
  }
};
  const handleCancelLeaveRequest = async () => {
    const existingLeave = selectedAssignment?.leave_request;
    if (!existingLeave?.id) {
      return;
    }
    if (existingLeave.status !== 'PENDING') {
      setSnackbar({ open: true, message: "Only pending leave requests can be cancelled.", severity: "warning" });
      return;
    }
    setIsSubmitting(true);
    try {
    setIsPageLoading(true);
      await deleteLeaveRequestService(existingLeave.id);
      setSnackbar({ open: true, message: "Leave request cancelled.", severity: "success" });
      setIsLeaveDialogOpen(false);
      setIsEditingLeaveRequest(false);
      setSelectedAssignment(null);
      reloadAssignments();
    } catch (err: any) {
      const message = (err as any)?.response?.data?.detail || (err as Error).message;
      setSnackbar({ open: true, message: `Failed to cancel leave request: ${message}`, severity: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleSubmitSwapRequest = async () => {
    if (!selectedPharmacyId || !selectedSlotDate || !selectedStart || !selectedEnd) {
      setSnackbar({ open: true, message: "Missing date or time information for this request.", severity: "warning" });
      return;
    }
    if (
      selectedAssignment?.user &&
      selectedAssignment.user !== currentUserId &&
      !selectedAssignment.isSwapRequest
    ) {
      setSnackbar({ open: true, message: "You can only request cover for your own assigned shifts.", severity: "warning" });
      return;
    }
    const existingSwap = selectedAssignment?.swap_request;
    const isUpdate = isEditingSwapRequest && !!existingSwap;
    if (isUpdate && existingSwap?.status !== 'PENDING') {
      setSnackbar({ open: true, message: "Only pending cover requests can be updated.", severity: "warning" });
      return;
    }
    const slotDate = moment(selectedSlotDate).format('YYYY-MM-DD');
    const startTime = moment(selectedStart).format('HH:mm:ss');
    const endTime = moment(selectedEnd).format('HH:mm:ss');
    const roleNeeded =
      selectedAssignment?.shift_detail?.role_needed ||
      existingSwap?.role ||
      (user as any)?.role ||
      'PHARMACIST';
    if (!roleNeeded) {
      setSnackbar({ open: true, message: "Unable to determine role for this cover request.", severity: "warning" });
      return;
    }
    const targetPharmacy = existingSwap?.pharmacy || selectedPharmacyId;
    setIsSubmitting(true);
    try {
    setIsPageLoading(true);
      const payload = {
        pharmacy: targetPharmacy,
        role: roleNeeded,
        slot_date: slotDate,
        start_time: startTime,
        end_time: endTime,
        note: swapNote,
      };
      if (isUpdate && existingSwap?.id) {
        await updateWorkerShiftRequestService(existingSwap.id, payload);
        setSnackbar({ open: true, message: "Cover request updated successfully.", severity: "success" });
      } else {
        await createWorkerShiftRequestService(payload);
        setSnackbar({ open: true, message: "Cover request submitted successfully.", severity: "success" });
      }
      setIsSwapDialogOpen(false);
      setIsEditingSwapRequest(false);
      setSwapNote('');
      setSelectedAssignment(null);
      reloadAssignments();
    } catch (err: any) {
      const message = (err as any)?.response?.data?.detail || (err as Error).message;
      setSnackbar({ open: true, message: `Failed to save cover request: ${message}`, severity: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleCancelSwapRequest = async () => {
    const existingSwap = selectedAssignment?.swap_request;
    if (!existingSwap?.id) {
      return;
    }
    if (existingSwap.status !== 'PENDING') {
      setSnackbar({ open: true, message: "Only pending cover requests can be cancelled.", severity: "warning" });
      return;
    }
    setIsSubmitting(true);
    try {
    setIsPageLoading(true);
      await deleteWorkerShiftRequestService(existingSwap.id);
      setSnackbar({ open: true, message: "Cover request cancelled.", severity: "success" });
      setIsSwapDialogOpen(false);
      setIsEditingSwapRequest(false);
      setSwapNote('');
      setSelectedAssignment(null);
      reloadAssignments();
    } catch (err: any) {
      const message = (err as any)?.response?.data?.detail || (err as Error).message;
      setSnackbar({ open: true, message: `Failed to cancel cover request: ${message}`, severity: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleRoleFilterChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value as string[];
    // FIX: Logic now exactly matches RosterOwnerPage
    if (value[value.length - 1] === ALL_STAFF || value.length === 0) {
        setRoleFilters([ALL_STAFF]);
    } else {
        setRoleFilters(value.filter(v => v !== ALL_STAFF));
    }
  };

  const handleSelectedDateChange = (dateValue: string) => {
    const nextDate = moment(dateValue, 'YYYY-MM-DD', true);
    if (!nextDate.isValid()) {
      return;
    }

    setSelectedSlotDate(nextDate.toDate());
    setSelectedStart(prev => (
      prev ? moment(`${dateValue} ${moment(prev).format('HH:mm')}`, 'YYYY-MM-DD HH:mm').toDate() : prev
    ));
    setSelectedEnd(prev => (
      prev ? moment(`${dateValue} ${moment(prev).format('HH:mm')}`, 'YYYY-MM-DD HH:mm').toDate() : prev
    ));
  };

  const handleSelectedTimeChange = (field: 'start' | 'end', timeValue: string) => {
    if (!selectedSlotDate || !timeValue) {
      return;
    }

    const dateValue = moment(selectedSlotDate).format('YYYY-MM-DD');
    const nextTime = moment(`${dateValue} ${timeValue}`, 'YYYY-MM-DD HH:mm', true);
    if (!nextTime.isValid()) {
      return;
    }

    if (field === 'start') {
      setSelectedStart(nextTime.toDate());
    } else {
      setSelectedEnd(nextTime.toDate());
    }
  };
  
  // --- MEMOIZED CALENDAR EVENTS ---
  const calendarEvents = useMemo(() => {
    const activePharmacyName = pharmacies.find(p => p.id === selectedPharmacyId)?.name ?? '';
    // Filter to active pharmacy first, then role filters
    return allAssignments
      .filter((a: Assignment) => {
        const hasPharmacyId = (a as any).pharmacy !== undefined && (a as any).pharmacy !== null;
        if (hasPharmacyId) {
          return Number((a as any).pharmacy) === Number(selectedPharmacyId);
        }
        if (activePharmacyName) {
          return a.shift_detail?.pharmacy_name === activePharmacyName;
        }
        return true;
      })
      .filter((a: Assignment) => {
        if (roleFilters.includes(ALL_STAFF)) {
            return true;
        }
        return roleFilters.includes(a.shift_detail.role_needed);
      })
      .map((a: Assignment) => {
        let title: string;
        if (a.isOpenShift) {
          title = `Open Shift: ${a.shift_detail.role_needed}`;
        } else if (a.isSwapRequest) {
          const statusLabel = a.status ? ` (${a.status})` : '';
          title = `Cover Request${statusLabel}`;
        } else {
          title = `${a.user_detail.first_name} ${a.user_detail.last_name}`;
          if (a.leave_request) {
            title = `${title} (Leave: ${a.leave_request.status})`;
          }
          if (a.origin?.label) {
            title = `${title} • ${a.origin.label}`;
          }
        }
        return {
            id: a.id,
            title,
            start: moment(`${a.slot_date} ${a.slot_detail.start_time}`).toDate(),
            end: moment(`${a.slot_date} ${a.slot_detail.end_time}`).toDate(),
            allDay: false,
            resource: a
        };
    });
  }, [allAssignments, roleFilters]);
  // --- DYNAMIC EVENT STYLING ---
  const eventStyleGetter = (event: { resource: Assignment }) => {
    const assignment = event.resource;
    const isMyShift = assignment.user === currentUserId;
    let backgroundColor = ROSTER_COLORS[assignment.shift_detail.role_needed as keyof typeof ROSTER_COLORS] || ROSTER_COLORS.DEFAULT;
    let borderStyle = '0px';
    if (assignment.isOpenShift) {
      backgroundColor = ROSTER_COLORS.OPEN_SHIFT;
      borderStyle = '1px dashed #fff';
    } else if (assignment.isSwapRequest) {
      if (assignment.status === 'PENDING') {
        backgroundColor = ROSTER_COLORS.SWAP_PENDING;
      } else if (assignment.status === 'APPROVED' || assignment.status === 'AUTO_PUBLISHED') {
        backgroundColor = ROSTER_COLORS.SWAP_APPROVED;
        borderStyle = '1px dashed #fff';
      }
    }
    if (assignment.leave_request) {
        if(assignment.leave_request.status === 'PENDING') {
            backgroundColor = ROSTER_COLORS.LEAVE_PENDING;
        } else if (assignment.leave_request.status === 'APPROVED') {
            backgroundColor = ROSTER_COLORS.LEAVE_APPROVED;
        }
    }
    
    const style = {
        backgroundColor,
        borderRadius: '5px',
        opacity: assignment.isOpenShift ? 0.9 : (isMyShift ? 0.8 : 0.5),
        color: 'white', // Ensure text is white for better contrast on colored backgrounds
        border: borderStyle,
        display: 'block',
        cursor: (isMyShift || assignment.isOpenShift) ? 'pointer' : 'not-allowed', // Allow clicking open shifts
    };
    return { style };
  };
  const leaveRequestStatus = selectedAssignment?.leave_request?.status;
  const canModifyLeaveRequest = leaveRequestStatus === 'PENDING';
  const swapRequestStatus = selectedAssignment?.swap_request?.status;
  const canModifySwapRequest = swapRequestStatus === 'PENDING';
  // --- RENDER LOGIC ---
  if (isPageLoading) {
    return <RosterPageSkeleton />;
  }
  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <Typography variant="h4" gutterBottom sx={{ fontSize: { xs: 26, md: 34 }, fontWeight: 800 }}>
        My Roster
      </Typography>
      <Tabs
        value={selectedPharmacyId}
        onChange={(_, val) => {
          setAllAssignments([]);
          setSelectedPharmacyId(val as number);
        }}
        sx={{
          mb: { xs: 2, md: 3 },
          maxWidth: '100%',
          '& .MuiTabs-scroller': { overflowX: 'auto !important' },
          '& .MuiTab-root': {
            minWidth: { xs: 170, md: 220 },
            maxWidth: { xs: 220, md: 320 },
            px: { xs: 1.5, md: 2 },
          },
        }}
        textColor="primary"
        indicatorColor="primary"
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
      >
        {pharmacies.map(p => <Tab key={p.id} label={p.name} value={p.id} />)}
      </Tabs>
      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: { xs: 'stretch', md: 'center' },
        flexDirection: { xs: 'column', md: 'row' },
        gap: { xs: 1.5, md: 2 },
        mb: 2,
      }}>
          <Typography variant="h5">Roster Calendar</Typography>
          <FormControl sx={{ width: { xs: '100%', sm: 300 }, alignSelf: { xs: 'stretch', md: 'center' } }}>
              <InputLabel>Filter by Role</InputLabel>
              <Select
                  multiple
                  value={roleFilters}
                  onChange={handleRoleFilterChange}
                  input={<OutlinedInput label="Filter by Role" />}
                  renderValue={(selected) => (selected.includes(ALL_STAFF) ? 'All Staff' : selected.map(s => s.charAt(0) + s.slice(1).toLowerCase()).join(', '))}
              >
                  <MenuItem value={ALL_STAFF}>
                      <Checkbox checked={roleFilters.includes(ALL_STAFF)} />
                      <ListItemText primary="All Staff" />
                  </MenuItem>
                  {ROLES.map((role) => (
                      <MenuItem key={role} value={role}>
                          <Checkbox checked={roleFilters.includes(role)} />
                          <ListItemText primary={role.charAt(0) + role.slice(1).toLowerCase()} />
                      </MenuItem>
                  ))}
              </Select>
          </FormControl>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{mb: 2}}>This calendar shows all shifts at the selected pharmacy. You can interact with your own shifts to request leave or cover, and claim open shifts.</Typography>
      <Box sx={{
        position: 'relative',
        width: '100%',
        minWidth: 0,
        overflowX: { xs: 'auto', md: 'visible' },
        overflowY: 'visible',
        pb: 1,
        '.rbc-calendar': {
          minWidth: { xs: 900, md: 0 },
          height: { xs: 1500, md: 1600 },
          minHeight: { xs: 1500, md: 1600 },
        },
        '.rbc-toolbar': {
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
          marginBottom: 1.5,
        },
        '.rbc-toolbar-label': {
          flex: { xs: '1 0 100%', sm: '1 1 auto' },
          order: { xs: -1, sm: 0 },
          textAlign: { xs: 'left', sm: 'center' },
          fontWeight: 700,
          py: { xs: 0.5, sm: 0 },
        },
        '.rbc-btn-group': {
          display: 'inline-flex',
          whiteSpace: 'nowrap',
        },
        '.rbc-time-view': {
          minHeight: 0,
          overflow: 'visible',
        },
        '.rbc-time-content': {
          minHeight: 0,
          overflowY: 'visible !important',
          overflowX: 'visible',
        },
        '.rbc-month-view': {
          minHeight: 0,
          overflow: 'visible',
        },
        '.rbc-event': { minWidth: 0 },
        '.rbc-event-content': {
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },
      }}
        onMouseDownCapture={(event) => startCalendarDragScroll(event.target, event.clientX, event.clientY)}
      >
        {isAssignmentsLoading && (
            <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10 }}>
                <CircularProgress />
            </Box>
        )}
        <Calendar
          localizer={localizer}
          events={calendarEvents}
          defaultView={calendarView as any}
          view={calendarView as any}
          date={calendarDate}
          onNavigate={setCalendarDate}
          onView={(nextView: string) => setCalendarView(nextView as CalendarViewKey)}
          selectable
          onSelectEvent={handleSelectEvent}
          onSelectSlot={({ start, end }: { start: Date; end: Date }) => {
            setSelectedAssignment(null);
            setSelectedSlotDate(start);
            setSelectedStart(start);
            setSelectedEnd(end);
            setIsEditingLeaveRequest(false);
            setIsEditingSwapRequest(false);
            setLeaveType('');
            setLeaveNote('');
            setSwapNote('');
            setIsActionDialogOpen(true);
          }}
          eventPropGetter={eventStyleGetter}
          views={calendarViews}
          messages={calendarMessages}
          components={{
            event: ({ event }: any) => {
              const assignment = event.resource as Assignment;
              let statusLabel = "";
              if (assignment.isOpenShift) statusLabel = "Click to Claim";
              else if (assignment.isSwapRequest && assignment.status === "PENDING") statusLabel = "Pending Cover Request";
              else if (assignment.isSwapRequest && (assignment.status === "APPROVED" || assignment.status === "AUTO_PUBLISHED")) statusLabel = "Cover Approved";
              else if (assignment.isSwapRequest && assignment.status === "REJECTED") statusLabel = "Cover Rejected";
              const originLabel = assignment.origin?.label;
              return (
                <Box sx={{ px: 0.5, py: 0.3 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 600, color: "white", lineHeight: 1 }}
                  >
                    {event.title}
                  </Typography>
                  {statusLabel && (
                    <Typography
                      variant="caption"
                      sx={{
                        display: "block",
                        color: "#fff",
                        fontWeight: 500,
                        fontSize: "0.7rem",
                        mt: 0.3,
                      }}
                    >
                      {statusLabel}
                    </Typography>
                  )}
                  {originLabel && !assignment.isOpenShift && !assignment.isSwapRequest && (
                    <Typography
                      variant="caption"
                      sx={{
                        display: "block",
                        color: "#fff",
                        fontWeight: 500,
                        fontSize: "0.7rem",
                        mt: 0.3,
                      }}
                    >
                      {originLabel}
                    </Typography>
                  )}
                </Box>
              );
            },
          }}
        />
      </Box>
      {/* NEW: Action Choice Dialog */}
      <Dialog open={isActionDialogOpen} onClose={() => setIsActionDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Select Action</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Pharmacy"
              value={pharmacies.find(p => p.id === selectedPharmacyId)?.name || ''}
              fullWidth
              disabled
            />
            <TextField
              label="Date"
              type="date"
              value={selectedSlotDate ? moment(selectedSlotDate).format('YYYY-MM-DD') : ''}
              onChange={(event) => handleSelectedDateChange(event.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Start Time"
                type="time"
                value={selectedStart ? moment(selectedStart).format('HH:mm') : ''}
                onChange={(event) => handleSelectedTimeChange('start', event.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                label="End Time"
                type="time"
                value={selectedEnd ? moment(selectedEnd).format('HH:mm') : ''}
                onChange={(event) => handleSelectedTimeChange('end', event.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              if (!selectedAssignment || selectedAssignment.user !== currentUserId) {
                setSnackbar({ open: true, message: "You can only request leave for your own assigned slots.", severity: "warning" });
                return;
              }
              setIsActionDialogOpen(false);
              setIsEditingLeaveRequest(false);
              setLeaveType('');
              setLeaveNote('');
              setIsLeaveDialogOpen(true);
            }}
            variant="outlined"
          >
            Request Leave
          </Button>
          <Button
            onClick={() => {
              setIsActionDialogOpen(false);
              setIsEditingSwapRequest(false);
              setSwapNote('');
              setIsSwapDialogOpen(true);
            }}
            variant="contained"
          >
            Request Swap / Cover
          </Button>
        </DialogActions>
      </Dialog>
      {/* NEW: Claim Shift Dialog */}
      <Dialog open={isClaimShiftDialogOpen} onClose={() => setIsClaimShiftDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Claim Open Shift</DialogTitle>
        <DialogContent dividers>
          <List dense>
            <ListItem><ListItemText primary="Pharmacy" secondary={pharmacies.find(p => p.id === selectedPharmacyId)?.name || '—'} /></ListItem>
            {selectedSlotDate && (
              <ListItem><ListItemText primary="Date" secondary={moment(selectedSlotDate).format('dddd, MMMM Do YYYY')} /></ListItem>
            )}
            {selectedStart && selectedEnd && (
              <ListItem><ListItemText primary="Time" secondary={`${moment(selectedStart).format("h:mm A")} - ${moment(selectedEnd).format("h:mm A")}`} /></ListItem>
            )}
            <ListItem><ListItemText primary="Role" secondary={selectedAssignment?.shift_detail.role_needed || '—'} /></ListItem>
          </List>
          <Typography variant="body2" color="text.secondary" sx={{mt: 2}}>By claiming this shift, you will be assigned to it directly.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsClaimShiftDialogOpen(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleClaimShift} variant="contained" color="primary" disabled={isSubmitting}>
            {isSubmitting ? <CircularProgress size={24} color="inherit" /> : 'Claim Shift'}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Leave Request Dialog */}
      <Dialog
        open={isLeaveDialogOpen}
        onClose={() => {
          if (isSubmitting) return;
          setIsLeaveDialogOpen(false);
          setIsEditingLeaveRequest(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{isEditingLeaveRequest ? "Manage Leave Request" : "Request Leave"}</DialogTitle>
        <DialogContent dividers>
          {selectedAssignment ? (
            <>
                <List dense>
                    <ListItem><ListItemText primary="Pharmacy" secondary={selectedAssignment.shift_detail.pharmacy_name} /></ListItem>
                    {selectedAssignment.origin?.label && (
                      <ListItem><ListItemText primary="Source" secondary={selectedAssignment.origin.label} /></ListItem>
                    )}
                    <ListItem><ListItemText primary="Date" secondary={moment(selectedAssignment.slot_date).format('dddd, MMMM Do YYYY')} /></ListItem>
                    <ListItem><ListItemText primary="Time" secondary={`${moment(selectedAssignment.slot_detail.start_time, "HH:mm:ss").format("h:mm A")} - ${moment(selectedAssignment.slot_detail.end_time, "HH:mm:ss").format("h:mm A")}`} /></ListItem>
                </List>
                {selectedAssignment.leave_request && (
                    <Typography variant="h6" color="primary" sx={{ my: 2, p: 1, borderRadius: 1, bgcolor: 'primary.lighter' }}>
                        Existing Request Status: {selectedAssignment.leave_request.status}
                    </Typography>
                )}
                <Box component="form" sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                    <FormControl fullWidth required disabled={isEditingLeaveRequest && !canModifyLeaveRequest}>
                        <InputLabel>Leave Type</InputLabel>
                        <Select value={leaveType} onChange={(e: SelectChangeEvent) => setLeaveType(e.target.value)} label="Leave Type">
                            {LEAVE_TYPES.map(lt => (
                                <MenuItem key={lt.value} value={lt.value}>{lt.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <TextField
                        label="Note (Optional)"
                        multiline
                        rows={3}
                        value={leaveNote}
                        onChange={(e) => setLeaveNote(e.target.value)}
                        fullWidth
                        disabled={isEditingLeaveRequest && !canModifyLeaveRequest}
                    />
                </Box>
            </>
          ) : <Skeleton variant="rectangular" height={200}/>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setIsLeaveDialogOpen(false); setIsEditingLeaveRequest(false); }} disabled={isSubmitting}>Close</Button>
          {isEditingLeaveRequest && (
            <Button color="error" onClick={handleCancelLeaveRequest} disabled={isSubmitting || !canModifyLeaveRequest}>
              Cancel Request
            </Button>
          )}
          <Button
            onClick={handleSubmitLeaveRequest}
            variant="contained"
            color="primary"
            disabled={isSubmitting || (isEditingLeaveRequest && !canModifyLeaveRequest)}
          >
            {isSubmitting ? <CircularProgress size={24} color="inherit" /> : (isEditingLeaveRequest ? 'Save Changes' : 'Submit Request')}
          </Button>
        </DialogActions>
      </Dialog>
{/* NEW: Swap / Cover Request Dialog */}
<Dialog
  open={isSwapDialogOpen}
  onClose={() => {
    if (isSubmitting) return;
    setIsSwapDialogOpen(false);
    setIsEditingSwapRequest(false);
  }}
  fullWidth
  maxWidth="sm"
>
  <DialogTitle>{isEditingSwapRequest ? "Manage Swap / Cover Request" : "Request Swap / Cover"}</DialogTitle>
  <DialogContent dividers>
    <List dense>
      <ListItem><ListItemText primary="Pharmacy" secondary={pharmacies.find(p => p.id === selectedPharmacyId)?.name || 'Unknown'} /></ListItem>
      {selectedSlotDate && (
        <ListItem><ListItemText primary="Date" secondary={moment(selectedSlotDate).format('dddd, MMMM Do YYYY')} /></ListItem>
      )}
      {selectedStart && selectedEnd && (
        <ListItem><ListItemText primary="Time" secondary={`${moment(selectedStart).format("h:mm A")} - ${moment(selectedEnd).format("h:mm A")}`} /></ListItem>
      )}
    </List>
    {isEditingSwapRequest && selectedAssignment?.swap_request && (
      <Typography variant="h6" color="primary" sx={{ my: 2, p: 1, borderRadius: 1, bgcolor: 'primary.lighter' }}>
        Existing Request Status: {selectedAssignment.swap_request.status}
      </Typography>
    )}
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
      <TextField
        label="Note (optional)"
        multiline
        rows={3}
        value={swapNote}
        onChange={(e) => setSwapNote(e.target.value)}
        fullWidth
        disabled={isEditingSwapRequest && !canModifySwapRequest}
      />
    </Box>
  </DialogContent>
  <DialogActions>
    <Button onClick={() => { setIsSwapDialogOpen(false); setIsEditingSwapRequest(false); }} disabled={isSubmitting}>Close</Button>
    {isEditingSwapRequest && (
      <Button
        color="error"
        onClick={handleCancelSwapRequest}
        disabled={isSubmitting || !canModifySwapRequest}
      >
        Cancel Request
      </Button>
    )}
    <Button
      variant="contained"
      onClick={handleSubmitSwapRequest}
      disabled={isSubmitting || (isEditingSwapRequest && !canModifySwapRequest)}
    >
      {isSubmitting ? <CircularProgress size={24} /> : (isEditingSwapRequest ? 'Save Changes' : 'Submit Request')}
    </Button>
  </DialogActions>
</Dialog>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity as "success" | "error" | "info" | "warning"}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
