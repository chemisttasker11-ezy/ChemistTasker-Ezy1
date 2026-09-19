import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { SyntheticEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Container,
  Typography,
  Tabs,
  Tab,
  Stack,
  Skeleton,
  Button,
  ButtonGroup,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  ListItem,
  ListItemText,
  CircularProgress,
  Checkbox,
  OutlinedInput,
  Snackbar,
  IconButton,
} from '@mui/material';

import { Close as CloseIcon } from '@mui/icons-material';
import RosterOwnerDialogs from './RosterOwnerDialogs';

// Calendar Imports
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { calendarViews, calendarMessages, getDateRangeForView, CalendarViewKey } from './calendarViews';

import { useAuth } from '../../../contexts/AuthContext';
import { ROSTER_COLORS } from '../../../constants/rosterColors';
import { BRAND_COLORS, BRAND_FONTS } from '../../../constants/brandTheme';
import RosterPlanningToolbar from '../../../components/roster/RosterPlanningToolbar';
import RosterCoveragePanel from '../../../features/workforce/RosterCoveragePanel';
import HorizontalCalendarGrid from '../../../components/roster/HorizontalCalendarGrid';
import {
  PharmacySummary,
  RosterAssignment,
  WorkerShiftRequest,
  OpenShift,
  RosterPharmacyMember,
  RosterSlotDetail,
  RosterShiftDetail,
  fetchPharmaciesService,
  fetchRosterOwnerAssignments,
  fetchWorkerShiftRequestsService,
  fetchOwnerOpenShifts,
  fetchRosterOwnerMembersService,
  createShiftAndAssignService,
  deleteRosterAssignmentService,
  deleteRosterShiftService,
  updateRosterShiftService,
  escalateRosterShiftService,
  approveLeaveRequestService,
  rejectLeaveRequestService,
  approveWorkerShiftRequestService,
  rejectWorkerShiftRequestService,
} from '@chemisttasker/shared-core';
import {
  DEFAULT_ESCALATION_LEVELS,
  getVisibilityLabel,
  type OpenShiftViewModel,
  type AssignmentViewModel,
  type ShiftForEdit,
  ROLES,
  ALL_STAFF,
  LEAVE_TYPES_MAP,
} from './RosterOwnerPage.model';

const localizer = momentLocalizer(moment);

// --- Skeleton Component for Unified Loading ---
const RosterPageSkeleton = () => (
    <Container maxWidth={false} disableGutters sx={{ width: '100%', py: { xs: 1, md: 2 } }}>
        <Typography variant="h4" gutterBottom><Skeleton width="40%" /></Typography>
        <Skeleton variant="rectangular" height={48} sx={{ mb: 3 }} />
        <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2}}>
            <Typography variant="h5"><Skeleton width="200px" /></Typography>
            <Skeleton variant="rectangular" width={300} height={56} />
        </Box>
        <Typography variant="body2"><Skeleton width="80%" /></Typography>
        <Skeleton variant="rectangular" height={600} sx={{ mt: 2 }} />
    </Container>
);


export default function RosterOwnerPage() {
  const { activePersona, activeAdminPharmacyId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const calendarDragScrollFrameRef = useRef<number | null>(null);
  const calendarDragPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const isCalendarDragScrollingRef = useRef(false);
  const scopedPharmacyId =
    activePersona === 'admin' && typeof activeAdminPharmacyId === 'number'
      ? activeAdminPharmacyId
      : null;
  const initialPharmacyFromUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const candidate = params.get('pharmacy') ?? params.get('admin_pharmacy_id');
    const num = candidate ? Number(candidate) : null;
    return Number.isFinite(num) ? num : null;
  }, []);

  // --- Component State ---
  const [pharmacies, setPharmacies] = useState<PharmacySummary[]>([]);
  const [selectedPharmacyId, setSelectedPharmacyId] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<AssignmentViewModel[]>([]);
  const [openShifts, setOpenShifts] = useState<OpenShiftViewModel[]>([]); // NEW: State for open shifts
  const [workerRequests, setWorkerRequests] = useState<WorkerShiftRequest[]>([]); // NEW: State for cover requests
  const [pharmacyMembers, setPharmacyMembers] = useState<RosterPharmacyMember[]>([]);
  
  // --- Loading States ---
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isAssignmentsLoading, setIsAssignmentsLoading] = useState(false);
  const [isDialogDataLoading, setIsDialogDataLoading] = useState(false);
  const [isCreatingShift, setIsCreatingShift] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false); // General purpose for dialog actions

  // --- Calendar State ---
  const [calendarView, setCalendarView] = useState<CalendarViewKey>('week');
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [calendarSubView, setCalendarSubView] = useState<'TIMELINE' | 'CLASSIC'>('TIMELINE');
  const [rosterViewMode, setRosterViewMode] = useState<'CALENDAR' | 'STAFF' | 'STACKED'>('STAFF');
  
  // --- Dialogs and Forms State (Updated) ---
  const [isAddAssignmentDialogOpen, setIsAddAssignmentDialogOpen] = useState(false);
  const [dialogShiftStartTime, setDialogShiftStartTime] = useState<string | null>(null);
  const [dialogShiftEndTime, setDialogShiftEndTime] = useState<string | null>(null);
  const [dialogShiftDate, setDialogShiftDate] = useState<string | null>(null);
  const [newShiftRoleNeeded, setNewShiftRoleNeeded] = useState<string>('');
  const [editIsOpenShift, setEditIsOpenShift] = useState(false);
  const [editOpenShiftVisibility, setEditOpenShiftVisibility] = useState<string>('LOCUM_CASUAL');
  const [pendingDeletionShiftId, setPendingDeletionShiftId] = useState<number | null>(null);
  
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentViewModel | null>(null);
  const [selectedUserForAssignment, setSelectedUserForAssignment] = useState<number | null>(null);
  const [isOptionsDialogOpen, setIsOptionsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isEscalateDialogOpen, setIsEscalateDialogOpen] = useState(false);
  const [isPostShiftModalOpen, setIsPostShiftModalOpen] = useState(false);
  const [previousSearch, setPreviousSearch] = useState<string>(location.search);
  const [shiftToEdit, setShiftToEdit] = useState<ShiftForEdit | null>(null);
  
  // --- Duplicate Shift State ---
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [duplicateTargetDates, setDuplicateTargetDates] = useState<string[]>([]);
  const [duplicateCustomDate, setDuplicateCustomDate] = useState<string>('');
  const [duplicateKeepUser, setDuplicateKeepUser] = useState<boolean>(true);
  const [duplicateShiftData, setDuplicateShiftData] = useState<{
    id?: string | number;
    roleNeeded: string;
    startTime: string;
    endTime: string;
    userId: number | null;
    userName: string;
    isOpenShift: boolean;
  } | null>(null);
  const [filteredMembers, setFilteredMembers] = useState<RosterPharmacyMember[]>([]);
  const [escalationLevel, setEscalationLevel] = useState<string>('');
  const handleTabChange = useCallback((_: SyntheticEvent, val: number | boolean) => {
    if (scopedPharmacyId != null) {
      return;
    }
    if (typeof val === 'number') {
      setSelectedPharmacyId(val);
    }
  }, [scopedPharmacyId]);
  const [isLeaveManageDialogOpen, setIsLeaveManageDialogOpen] = useState(false); // New dialog state
  const currentShiftDetail: RosterShiftDetail | undefined = selectedAssignment?.shiftDetail;
  const selectableEscalationLevels = useMemo(() => {
    if (!currentShiftDetail) return [];
    const allowed = currentShiftDetail.allowedEscalationLevels || [];
    if (!allowed.length) return [];

    const canonicalOrder = ['FULL_PART_TIME', 'LOCUM_CASUAL', 'OWNER_CHAIN', 'ORG_CHAIN', 'PLATFORM'];
    const allowedSet = new Set(allowed);
    const ordered = canonicalOrder.filter(level => allowedSet.has(level));
    const extras = allowed.filter(level => !canonicalOrder.includes(level));
    const sequence = [...ordered, ...extras];

    const currentIndex = sequence.indexOf(currentShiftDetail.visibility ?? '');
    if (currentIndex === -1) {
      return sequence;
    }
    return sequence.slice(currentIndex + 1);
  }, [currentShiftDetail]);
  useEffect(() => {
    if (!isEscalateDialogOpen) {
      return;
    }
    if (!selectableEscalationLevels.length) {
      setEscalationLevel('');
      return;
    }
    setEscalationLevel(prev =>
      prev && selectableEscalationLevels.includes(prev) ? prev : selectableEscalationLevels[0]
    );
  }, [isEscalateDialogOpen, selectableEscalationLevels]);
  
  const [isCoverRequestDialogOpen, setIsCoverRequestDialogOpen] = useState(false); // NEW: Dialog for cover requests
  const [postAsOpenShift, setPostAsOpenShift] = useState(false);
  const [openShiftVisibility, setOpenShiftVisibility] = useState<string>('LOCUM_CASUAL');
  const [selectedCoverRequest, setSelectedCoverRequest] = useState<WorkerShiftRequest | null>(null); // NEW
  const [roleFilters, setRoleFilters] = useState<string[]>([ALL_STAFF]);
  // --- Snackbar ---
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');
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
  const showSnackbar = (msg: string) => {
    setSnackbarMsg(msg);
    setSnackbarOpen(true);
  };
  const closeSnackbar = () => setSnackbarOpen(false);

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
      setIsPageLoading(true);
      try {
        const loadedPharmacies = await fetchPharmaciesService({});
        // Normalize ids to numbers to mirror old behavior and keep tab selection stable
        const normalizedPharmacies = loadedPharmacies.map((ph: PharmacySummary) => ({
          ...ph,
          id: Number(ph.id),
        }));
        const filteredByScope =
          scopedPharmacyId != null
            ? normalizedPharmacies.filter((ph: PharmacySummary) => Number(ph.id) === scopedPharmacyId)
            : [];
        const availablePharmacies =
          filteredByScope.length > 0 ? filteredByScope : normalizedPharmacies;

        setPharmacies(availablePharmacies);

        const defaultPharmacyId: number | null =
          scopedPharmacyId != null
            ? scopedPharmacyId
            : initialPharmacyFromUrl != null
            ? initialPharmacyFromUrl
            : availablePharmacies.length > 0
            ? Number(availablePharmacies[0].id)
            : null;

        if (defaultPharmacyId != null) {
          setSelectedPharmacyId(defaultPharmacyId);
          const { start, end } = getDateRangeForView(calendarDate, calendarView);
          const startDate = start.format('YYYY-MM-DD');
          const endDate = end.format('YYYY-MM-DD');
          const assignmentsData = await fetchRosterOwnerAssignments({ pharmacyId: defaultPharmacyId, startDate, endDate });
          const requestsData = await fetchWorkerShiftRequestsService({ pharmacyId: defaultPharmacyId, startDate, endDate });
          const openShiftData = await fetchOwnerOpenShifts({ pharmacyId: defaultPharmacyId, startDate, endDate });
          setAssignments(assignmentsData);
          setWorkerRequests(requestsData);
          setOpenShifts(openShiftData);
        }
      } catch (err) { 
        console.error("Failed to load initial page data", err); 
      } finally {
        setIsPageLoading(false);
      }
    };
    loadInitialData();
  }, [scopedPharmacyId, initialPharmacyFromUrl]);

  useEffect(() => {
    if (!isPageLoading && selectedPharmacyId) { 
      reloadAssignments(); 
    }
  }, [selectedPharmacyId, calendarDate, calendarView]);

  useEffect(() => {
    if ((isAddAssignmentDialogOpen || isEditDialogOpen) && selectedPharmacyId) {
      loadMembersForRoster(selectedPharmacyId);
    }
  }, [isAddAssignmentDialogOpen, isEditDialogOpen, selectedPharmacyId]);

  useEffect(() => {
    const role = isEditDialogOpen ? shiftToEdit?.roleNeeded : newShiftRoleNeeded;
    if (role) {
      setFilteredMembers(pharmacyMembers.filter(member => member.role === role));
    } else {
      setFilteredMembers(pharmacyMembers);
    }
    setSelectedUserForAssignment(null);
  }, [newShiftRoleNeeded, shiftToEdit, pharmacyMembers, isEditDialogOpen]);

  // --- API CALLS (Updated) ---
  const reloadAssignments = () => {
      if (!selectedPharmacyId) return;
      const { start, end } = getDateRangeForView(calendarDate, calendarView);
      loadAssignments(selectedPharmacyId, start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD'));
  }

  // Reset open-shift visibility when switching out of open-shift mode
  useEffect(() => {
    if (!postAsOpenShift) {
      setOpenShiftVisibility('LOCUM_CASUAL');
    }
  }, [postAsOpenShift]);

  const loadAssignments = async (pharmacyId: number, startDate?: string, endDate?: string) => {
    setIsAssignmentsLoading(true);
    try {
      // Fetch both assignments and staff requests in parallel
      const [assignmentsData, requestsData, openShiftData] = await Promise.all([
        fetchRosterOwnerAssignments({ pharmacyId, startDate, endDate }),
        fetchWorkerShiftRequestsService({ pharmacyId, startDate, endDate }),
        fetchOwnerOpenShifts({ pharmacyId, startDate, endDate }),
      ]);
      // Extra safety: filter by active pharmacy in case backend returns broader set
      const activePharmacyName = pharmacies.find(p => Number(p.id) === Number(pharmacyId))?.name;
      const filteredAssignments = activePharmacyName
        ? assignmentsData.filter((a: AssignmentViewModel) => (a.shiftDetail?.pharmacyName ?? '') === activePharmacyName)
        : assignmentsData;
      const filteredRequests = requestsData.filter((req: WorkerShiftRequest) =>
        req.pharmacy == null ? true : Number(req.pharmacy) === Number(pharmacyId)
      );
      const filteredOpen = openShiftData.filter((shift: OpenShift) =>
        shift.pharmacy == null ? true : Number(shift.pharmacy) === Number(pharmacyId)
      );

      setAssignments(filteredAssignments);
      setWorkerRequests(filteredRequests);
      setOpenShifts(filteredOpen);
    } catch (err) { console.error("Failed to load roster assignments", err); }
    finally { setIsAssignmentsLoading(false); }
  };

  const loadMembersForRoster = async (pharmacyId: number) => {
    setIsDialogDataLoading(true);
    try {
      const res = await fetchRosterOwnerMembersService(pharmacyId);
      setPharmacyMembers(res);
    } catch (err) { console.error("Failed to load pharmacy members", err); }
    finally { setIsDialogDataLoading(false); }
  };

  const handleCreateShiftAndAssign = async () => {
    if (!selectedPharmacyId || !newShiftRoleNeeded || !dialogShiftDate || !dialogShiftStartTime || !dialogShiftEndTime || !selectedUserForAssignment) {
      showSnackbar("Please ensure all fields are selected."); return;
    }
    setIsCreatingShift(true);
    try {
      await createShiftAndAssignService({
        pharmacy_id: selectedPharmacyId,
        role_needed: newShiftRoleNeeded,
        slot_date: dialogShiftDate,
        start_time: dialogShiftStartTime,
        end_time: dialogShiftEndTime,
        user_id: selectedUserForAssignment,
      });
      showSnackbar("Shift created and assigned successfully!");
      setIsAddAssignmentDialogOpen(false);
      reloadAssignments();
    } catch (err: any) { 
        showSnackbar(`Failed to create shift: ${err.response?.data?.detail || err.message}`); 
    } finally {
        setIsCreatingShift(false);
    }
  };
  
  const handleDeleteAssignment = async () => {
    if (!selectedAssignment) return;
    if (!window.confirm("Are you sure you want to remove this assignment?")) return;
    setIsActionLoading(true);
    try {
      if (selectedAssignment.isOpenShift) {
        const shiftId = selectedAssignment.shift ?? selectedAssignment.originalShift?.id;
        if (!shiftId) {
          throw new Error("Open shift id is missing.");
        }
        await deleteRosterShiftService(shiftId);
        showSnackbar("Open shift deleted successfully.");
        setIsOptionsDialogOpen(false);
        reloadAssignments();
      } else {
        await deleteRosterAssignmentService(selectedAssignment.id);
        setAssignments(prev => prev.filter(a => a.id !== selectedAssignment.id));
        showSnackbar("Assignment removed successfully.");
        setIsOptionsDialogOpen(false);
      }
    } catch (err: any) { showSnackbar(`Error: ${err.response?.data?.detail || err.message}`); }
    finally { setIsActionLoading(false); }
  };

  const handleSaveChanges = async () => {
    if (!shiftToEdit) return;
    // If user chose to convert to an open shift, launch the Post Shift wizard overlay
    if (editIsOpenShift) {
      const slot = shiftToEdit.slots[0];
      const params = new URLSearchParams();
      params.set('pharmacy', String(selectedPharmacyId ?? ''));
      params.set('role', shiftToEdit.roleNeeded ?? '');
      if (slot?.date) params.set('date', slot.date);
      if (slot?.startTime) params.set('start_time', slot.startTime);
      if (slot?.endTime) params.set('end_time', slot.endTime);
      if (editOpenShiftVisibility) params.set('visibility', editOpenShiftVisibility);
      params.set('from_roster', '1');

      // mark existing shift for deletion once the new post is completed
      setPendingDeletionShiftId(shiftToEdit.id);

      setPreviousSearch(location.search);
      setIsEditDialogOpen(false);
      navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
      setIsPostShiftModalOpen(true);
      return;
    }

    setIsActionLoading(true);
    const payload: Record<string, unknown> = {
      role_needed: shiftToEdit.roleNeeded,
      slots: shiftToEdit.slots.map(({ id, date, startTime, endTime }) => ({
        id,
        date,
        start_time: startTime,
        end_time: endTime,
      })),
    };
    if (selectedUserForAssignment) {
      payload.user_id = selectedUserForAssignment;
    }
    try {
      await updateRosterShiftService(shiftToEdit.id, payload);
      showSnackbar("Shift updated successfully!");
      setIsEditDialogOpen(false);
      reloadAssignments();
    } catch (err: any) { showSnackbar(`Error updating shift: ${err.response?.data?.detail || err.message}`); }
    finally { setIsActionLoading(false); }
  };

  const handleConfirmEscalation = async () => {
    if (!selectedAssignment || !escalationLevel) {
      showSnackbar("Please select an escalation level.");
      return;
    }
    if (!selectedAssignment.shift) {
      showSnackbar("Shift identifier missing.");
      return;
    }
    setIsActionLoading(true);
    try {
      await escalateRosterShiftService(selectedAssignment.shift, { target_visibility: escalationLevel });
      showSnackbar(`Shift escalated to ${escalationLevel.replace(/_/g, ' ')}.`);
      setIsEscalateDialogOpen(false);
      setEscalationLevel('');
      reloadAssignments();
    } catch (err: any) {
      showSnackbar(`Error escalating shift: ${err?.response?.data?.detail || err?.message || 'Unknown error'}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  // --- NEW: Leave Request Handlers ---
  const handleApproveLeave = async () => {
    if (!selectedAssignment?.leaveRequest) return;
    setIsActionLoading(true);
    try {
        await approveLeaveRequestService(selectedAssignment.leaveRequest.id);
        showSnackbar("Leave request has been approved.");
        setIsLeaveManageDialogOpen(false);
        reloadAssignments();
    } catch (err: any) {
        showSnackbar(`Failed to approve leave: ${err.response?.data?.detail || err.message}`);
    } finally {
        setIsActionLoading(false);
    }
  };

  const handleRejectLeave = async () => {
      if (!selectedAssignment?.leaveRequest) return;
      setIsActionLoading(true);
      try {
          await rejectLeaveRequestService(selectedAssignment.leaveRequest.id);
          showSnackbar("Leave request has been rejected.");
          setIsLeaveManageDialogOpen(false);
          reloadAssignments();
      } catch (err: any) {
          showSnackbar(`Failed to reject leave: ${err.response?.data?.detail || err.message}`);
      } finally {
          setIsActionLoading(false);
      }
  };
  
  // NEW: Handle posting an open shift
  const handleCreateOpenShift = () => {
    if (!selectedPharmacyId || !newShiftRoleNeeded || !dialogShiftDate || !dialogShiftStartTime || !dialogShiftEndTime) {
      showSnackbar("Please ensure role, date, and times are selected."); return;
    }

    setPreviousSearch(location.search);

    const params = new URLSearchParams();
    params.set('pharmacy', String(selectedPharmacyId));
    params.set('role', newShiftRoleNeeded);
    params.set('date', dialogShiftDate);
    params.set('start_time', dialogShiftStartTime);
    params.set('end_time', dialogShiftEndTime);
    if (openShiftVisibility) {
      params.set('visibility', openShiftVisibility);
    }
    params.set('from_roster', '1');

    setIsAddAssignmentDialogOpen(false);
    // Stay on the same route; update search to feed PostShiftPage prefill while showing it in a modal
    navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
    setIsPostShiftModalOpen(true);
  };

  const handleClosePostShiftModal = useCallback(() => {
    navigate({ pathname: location.pathname, search: previousSearch || '' }, { replace: true });
    setIsPostShiftModalOpen(false);
  }, [navigate, location.pathname, previousSearch]);

  const handlePostShiftCompleted = useCallback(() => {
    handleClosePostShiftModal();
    // delete old shift if we were replacing it via open-shift flow
    if (pendingDeletionShiftId) {
      deleteRosterShiftService(pendingDeletionShiftId)
        .catch((err: any) => showSnackbar(`Failed to remove old shift: ${err?.response?.data?.detail || err?.message || 'Unknown error'}`))
        .finally(() => {
          setPendingDeletionShiftId(null);
          reloadAssignments();
        });
      return;
    }
    reloadAssignments();
  }, [handleClosePostShiftModal, pendingDeletionShiftId, reloadAssignments]);

  // NEW: Cover Request Handlers
  const handleApproveCoverRequest = async () => {
    if (!selectedCoverRequest) return;
    setIsActionLoading(true);
    try {
      await approveWorkerShiftRequestService(selectedCoverRequest.id);
      showSnackbar("Cover request approved successfully.");
      setIsCoverRequestDialogOpen(false);
      reloadAssignments();
    } catch (err: any) {
      showSnackbar(`Failed to approve request: ${err.response?.data?.detail || err.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRejectCoverRequest = async () => {
    if (!selectedCoverRequest) return;
    setIsActionLoading(true);
    try {
      await rejectWorkerShiftRequestService(selectedCoverRequest.id);
      showSnackbar("Cover request has been rejected.");
      setIsCoverRequestDialogOpen(false);
      reloadAssignments();
    } catch (err: any) {
      showSnackbar(`Failed to reject request: ${err.response?.data?.detail || err.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  // --- DUPLICATION HANDLERS ---
  const handleOpenDuplicateDialog = (eventOrAssignment: any) => {
    const res = eventOrAssignment?.resource || eventOrAssignment;
    if (!res) return;
    const role = res.shiftDetail?.roleNeeded || res.roleNeeded || res.role || '';
    const startTime = res.slotDetail?.startTime || (eventOrAssignment?.start ? moment(eventOrAssignment.start).format('HH:mm') : '09:00');
    const endTime = res.slotDetail?.endTime || (eventOrAssignment?.end ? moment(eventOrAssignment.end).format('HH:mm') : '17:00');
    const userId = res.user ?? res.userDetail?.id ?? null;
    const userName = res.userDetail?.firstName
      ? `${res.userDetail.firstName} ${res.userDetail.lastName || ''}`.trim()
      : res.isOpenShift ? 'Open Shift' : 'Team Member';

    setDuplicateShiftData({
      id: res.id,
      roleNeeded: role,
      startTime: String(startTime).substring(0, 5),
      endTime: String(endTime).substring(0, 5),
      userId: userId,
      userName: userName,
      isOpenShift: Boolean(res.isOpenShift),
    });
    setDuplicateTargetDates([]);
    setDuplicateCustomDate('');
    setDuplicateKeepUser(true);
    setIsDuplicateDialogOpen(true);
  };

  const handleExecuteDuplicateShift = async () => {
    if (!duplicateShiftData || !selectedPharmacyId) return;

    const datesToDuplicate = [...duplicateTargetDates];
    if (duplicateCustomDate && !datesToDuplicate.includes(duplicateCustomDate)) {
      datesToDuplicate.push(duplicateCustomDate);
    }

    if (datesToDuplicate.length === 0) {
      showSnackbar("Please select at least one target date to duplicate this shift.");
      return;
    }

    setIsActionLoading(true);
    try {
      let count = 0;
      for (const targetDate of datesToDuplicate) {
        await createShiftAndAssignService({
          pharmacy_id: selectedPharmacyId,
          role_needed: duplicateShiftData.roleNeeded,
          slot_date: targetDate,
          start_time: duplicateShiftData.startTime,
          end_time: duplicateShiftData.endTime,
          user_id: duplicateKeepUser ? duplicateShiftData.userId : null,
        });
        count += 1;
      }

      showSnackbar(`Successfully duplicated shift to ${count} date${count > 1 ? 's' : ''}!`);
      setIsDuplicateDialogOpen(false);
      setIsOptionsDialogOpen(false);
      reloadAssignments();
    } catch (err: any) {
      showSnackbar(`Error duplicating shift: ${err?.response?.data?.detail || err?.message || 'Failed'}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  // --- UI HANDLERS (Updated) ---
  const handleSelectSlot = (slotInfo: { start: Date, end: Date }) => {
    setIsAddAssignmentDialogOpen(true);
    setDialogShiftDate(moment(slotInfo.start).format('YYYY-MM-DD'));
    setDialogShiftStartTime(moment(slotInfo.start).format('HH:mm'));
    setDialogShiftEndTime(moment(slotInfo.end).format('HH:mm'));
    setNewShiftRoleNeeded('');
    setPostAsOpenShift(false); // Reset checkbox
    setSelectedUserForAssignment(null);
  };

  const handleSelectEvent = (event: { resource: any }) => {
    const item = event.resource;

    // NEW: Check if it's an open shift
    if (item.isOpenShift) {
      // For now, just show options dialog for open shifts (e.g., to delete it)
      // We create a temporary "Assignment-like" object for the dialog
      const firstSlot = item.originalShift.slots[0];
      const visibility =
        item.shiftDetail?.visibility ??
        item.originalShift?.visibility ??
        DEFAULT_ESCALATION_LEVELS[0];
      const allowedEscalationLevels =
        item.shiftDetail?.allowedEscalationLevels ??
        item.originalShift?.allowedEscalationLevels ??
        DEFAULT_ESCALATION_LEVELS;
      const tempAssignment: AssignmentViewModel = {
        id: item.originalShift.id,
        shift: item.originalShift.id,
        slot: firstSlot?.id ?? null,
        slotDate: firstSlot?.date ?? '',
        user: null,
        isOpenShift: true,
        origin: item.origin ?? { label: getVisibilityLabel(visibility) },
        originalShift: item.originalShift,
        userDetail: {
          id: 0,
          firstName: 'Open',
          lastName: 'Shift',
          email: '',
        },
        slotDetail: firstSlot
          ? {
              id: firstSlot.id,
              date: firstSlot.date,
              startTime: firstSlot.startTime,
              endTime: firstSlot.endTime,
            }
          : { id: 0, date: '', startTime: '', endTime: '' },
        shiftDetail: {
          id: item.originalShift.id,
          pharmacyName: item.shiftDetail?.pharmacyName ?? item.originalShift?.pharmacyName ?? '',
          roleNeeded: item.shiftDetail?.roleNeeded || item.originalShift.roleNeeded || '',
          visibility,
          allowedEscalationLevels,
        },
        leaveRequest: null,
      };
      setSelectedAssignment(tempAssignment);
      setIsOptionsDialogOpen(true);
      setIsLeaveManageDialogOpen(false);
      setIsCoverRequestDialogOpen(false);
      return;
    }

    // NEW: Check if it's a cover request
    if (item.isCoverRequest) {
      setSelectedCoverRequest(item.originalRequest);
      setIsCoverRequestDialogOpen(true);
      setIsOptionsDialogOpen(false);
      setIsLeaveManageDialogOpen(false);
      return;
    }

    // Existing logic for assignments and leave requests
    setSelectedAssignment(item);
    if (item.leaveRequest && item.leaveRequest.status === 'PENDING') {
        setIsLeaveManageDialogOpen(true);
        setIsOptionsDialogOpen(false); // Ensure other dialog is closed
        setIsCoverRequestDialogOpen(false);
    } else {
        setIsOptionsDialogOpen(true);
        setIsLeaveManageDialogOpen(false); // Ensure other dialog is closed
        setIsCoverRequestDialogOpen(false);
    }
  };
  
  const handleNewShiftRoleChange = (event: SelectChangeEvent<string>) => {
    setNewShiftRoleNeeded(event.target.value);
  };

  const handleRoleFilterChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value as string[];
    if (value[value.length - 1] === ALL_STAFF || value.length === 0) {
        setRoleFilters([ALL_STAFF]);
    } else {
        setRoleFilters(value.filter(v => v !== ALL_STAFF));
    }
  };

  // --- Memos and Styles (Updated) ---
  const calendarEvents = useMemo(() => {
    const activePharmacyName = pharmacies.find(p => Number(p.id) === Number(selectedPharmacyId))?.name;

    // Map regular assignments
    const assignmentEvents = assignments
      .filter(a => {
        if (!activePharmacyName) return true;
        return (a.shiftDetail?.pharmacyName ?? '') === activePharmacyName;
      })
      .filter(a => {
        if (roleFilters.includes(ALL_STAFF)) {
            return true;
        }
        return roleFilters.includes(a.shiftDetail?.roleNeeded ?? '');
      })
      .map(a => {
        const roleName = a.shiftDetail?.roleNeeded ?? '';
        const userFirstName = a.userDetail.firstName || '';
        const originLabel = a.origin?.label;
        let title = `${userFirstName} (${roleName.substring(0,3)})`;
        if (originLabel) {
            title = `${title} • ${originLabel}`;
        }
        // Add leave status to title
        if (a.leaveRequest) {
            title = `${title} (Leave: ${a.leaveRequest.status})`;
        }
        return ({
            id: a.id,
            title: title,
            start: moment(`${a.slotDate} ${a.slotDetail?.startTime ?? '00:00'}`).toDate(),
            end: moment(`${a.slotDate} ${a.slotDetail?.endTime ?? '00:00'}`).toDate(),
            allDay: false,
            resource: a
        });
    });

    // NEW: Map staff cover requests
    const requestEvents = workerRequests
      .filter(req => Number(req.pharmacy) === Number(selectedPharmacyId))
      .filter(req => req.status === 'PENDING') // Only show pending requests
      .map(req => ({
        id: `cover-${req.id}`,
        title: `${req.requesterName ?? 'Unknown'} (Cover Request)`,
        start: moment(`${req.slotDate} ${req.startTime}`).toDate(),
        end: moment(`${req.slotDate} ${req.endTime}`).toDate(),
        allDay: false,
        resource: {
          isCoverRequest: true,
          originalRequest: req,
          shiftDetail: { roleNeeded: req.role } // For filtering
        }
      }));

    // NEW: Map owner-created open shifts
    const openShiftEvents = openShifts
      .filter(shift => Number(shift.pharmacy) === Number(selectedPharmacyId))
      .filter(shift => {
        if (roleFilters.includes(ALL_STAFF)) return true;
        return roleFilters.includes(shift.roleNeeded);
      })
      .flatMap(shift => {
        const visibility = shift.visibility ?? DEFAULT_ESCALATION_LEVELS[0];
        const allowedEscalationLevels =
          shift.allowedEscalationLevels && shift.allowedEscalationLevels.length
            ? shift.allowedEscalationLevels
            : DEFAULT_ESCALATION_LEVELS;
        return shift.slots.map(slot => ({
            id: `open-${shift.id}-${slot.id}`,
            title: `OPEN: ${shift.roleNeeded}`,
            start: moment(`${slot.date} ${slot.startTime}`).toDate(),
            end: moment(`${slot.date} ${slot.endTime}`).toDate(),
            allDay: false,
            resource: {
              isOpenShift: true,
              shift: shift.id,
              originalShift: shift, // Keep original data for context
              shiftDetail: {
                roleNeeded: shift.roleNeeded,
                visibility,
                allowedEscalationLevels,
              },
              origin: { label: getVisibilityLabel(visibility) },
            }
          }));
      });

    return [...assignmentEvents, ...requestEvents, ...openShiftEvents];
  }, [assignments, workerRequests, openShifts, roleFilters]);

  const eventStyleGetter = (event: any) => {
    const assignment = event.resource;
    const role = assignment?.shiftDetail?.roleNeeded;

    // NEW: Style for open shifts
    if (assignment.isOpenShift) {
      return { // Ensure this style is applied
        style: { backgroundColor: ROSTER_COLORS.OPEN_SHIFT, borderRadius: '5px', opacity: 0.9, color: 'white', border: '1px dashed #fff', display: 'block' }
      };
    }
    // NEW: Style for cover requests
    if (assignment.isCoverRequest) {
      return {
        style: { backgroundColor: ROSTER_COLORS.SWAP_PENDING, borderRadius: '5px', opacity: 0.9, color: 'white', border: '0px', display: 'block' }
      };
    }

    let backgroundColor = ROSTER_COLORS[role as keyof typeof ROSTER_COLORS] || ROSTER_COLORS.DEFAULT;

    // Override color for leave requests
    if (assignment?.leaveRequest) {
        if (assignment.leaveRequest.status === 'PENDING') {
            backgroundColor = ROSTER_COLORS.LEAVE_PENDING;
        } else if (assignment.leaveRequest.status === 'APPROVED') {
            backgroundColor = ROSTER_COLORS.LEAVE_APPROVED;
        }
    }

    const style = {
        backgroundColor,
        borderRadius: '5px',
        opacity: 0.8,
        color: 'white',
        border: '0px',
        display: 'block'
    };
    return { style };
  };

  if (isPageLoading) {
    return <RosterPageSkeleton />;
  }

  // --- Render Method ---
  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <Typography
        variant="h4"
        gutterBottom
        sx={{
          fontSize: { xs: 26, md: 32 },
          fontWeight: 700,
          fontFamily: BRAND_FONTS.heading,
          color: BRAND_COLORS.navy,
          letterSpacing: '-0.02em',
        }}
      >
        Internal Roster
      </Typography>

      <Tabs
        value={selectedPharmacyId ?? false}
        onChange={handleTabChange}
        sx={{
          mb: { xs: 2, md: 3 },
          maxWidth: '100%',
          '& .MuiTabs-scroller': { overflowX: 'auto !important' },
          '& .MuiTab-root': {
            minWidth: { xs: 170, md: 220 },
            maxWidth: { xs: 220, md: 320 },
            px: { xs: 1.5, md: 2 },
            fontFamily: BRAND_FONTS.body,
            fontWeight: 600,
            color: BRAND_COLORS.body,
            '&.Mui-selected': {
              color: BRAND_COLORS.purple,
            },
          },
          '& .MuiTabs-indicator': {
            backgroundColor: BRAND_COLORS.purple,
            height: 3,
            borderRadius: '3px 3px 0 0',
          },
        }}
        textColor="primary"
        indicatorColor="primary"
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
      >
        {pharmacies.map(p => (
          <Tab key={p.id} label={p.name} value={Number(p.id)} />
        ))}
      </Tabs>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
        <Button
          variant="outlined"
          disabled={!selectedPharmacyId}
          onClick={() => navigate(`/dashboard/workforce/timesheets?pharmacy_id=${selectedPharmacyId ?? ''}`)}
        >
          Timesheets
        </Button>
        <Button
          variant="outlined"
          disabled={!selectedPharmacyId}
          onClick={() => navigate(`/dashboard/workforce/settings?pharmacy_id=${selectedPharmacyId ?? ''}`)}
        >
          Workforce settings
        </Button>
        <Button
          variant="text"
          disabled={!selectedPharmacyId}
          onClick={() => navigate(`/dashboard/attendance/reviews?pharmacy_id=${selectedPharmacyId ?? ''}`)}
        >
          Attendance review
        </Button>
      </Stack>

      {/* Roster V2 Weekly Planning, Draft/Publish, Validation & Templates Toolbar */}
      <RosterPlanningToolbar
        pharmacyId={selectedPharmacyId}
        calendarDate={calendarDate}
        onRosterUpdated={reloadAssignments}
        onNavigateWeek={(targetDate) => setCalendarDate(targetDate)}
        activeViewMode={rosterViewMode}
        onViewModeChange={setRosterViewMode}
      />

      <RosterCoveragePanel
        pharmacyId={selectedPharmacyId}
        calendarDate={calendarDate}
      />
      
      {rosterViewMode === 'CALENDAR' && (
        <>
          <Box sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: { xs: 'stretch', md: 'center' },
            flexDirection: { xs: 'column', md: 'row' },
            gap: { xs: 1.5, md: 2 },
            mb: 2,
          }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                <Typography variant="h5" sx={{ fontFamily: BRAND_FONTS.heading, fontWeight: 700, color: BRAND_COLORS.navy }}>
                  Roster Calendar
                </Typography>
                <ButtonGroup size="small" variant="outlined" sx={{ bgcolor: 'white', borderRadius: '8px' }}>
                  <Button
                    variant={calendarSubView === 'TIMELINE' ? 'contained' : 'outlined'}
                    onClick={() => setCalendarSubView('TIMELINE')}
                    sx={{
                      bgcolor: calendarSubView === 'TIMELINE' ? BRAND_COLORS.purple : 'white',
                      color: calendarSubView === 'TIMELINE' ? 'white' : BRAND_COLORS.navy,
                      textTransform: 'none',
                      fontWeight: 600,
                      fontSize: 12,
                      px: 1.75,
                      '&:hover': {
                        bgcolor: calendarSubView === 'TIMELINE' ? BRAND_COLORS.purpleHover : 'rgba(0,0,0,0.04)',
                      },
                    }}
                  >
                    Horizontal Grid
                  </Button>
                  <Button
                    variant={calendarSubView === 'CLASSIC' ? 'contained' : 'outlined'}
                    onClick={() => setCalendarSubView('CLASSIC')}
                    sx={{
                      bgcolor: calendarSubView === 'CLASSIC' ? BRAND_COLORS.purple : 'white',
                      color: calendarSubView === 'CLASSIC' ? 'white' : BRAND_COLORS.navy,
                      textTransform: 'none',
                      fontWeight: 600,
                      fontSize: 12,
                      px: 1.75,
                      '&:hover': {
                        bgcolor: calendarSubView === 'CLASSIC' ? BRAND_COLORS.purpleHover : 'rgba(0,0,0,0.04)',
                      },
                    }}
                  >
                    Classic View
                  </Button>
                </ButtonGroup>
              </Stack>
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
          
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontFamily: BRAND_FONTS.body }}>
            Click an empty time slot to create a new shift, or click an existing assignment to manage it. Assignments with pending leave requests are highlighted in grey.
          </Typography>

          {calendarSubView === 'TIMELINE' ? (
            <HorizontalCalendarGrid
              events={calendarEvents}
              currentDate={calendarDate}
              onNavigate={setCalendarDate}
              onSelectSlot={handleSelectSlot}
              onSelectEvent={handleSelectEvent}
              onDuplicateShift={handleOpenDuplicateDialog}
              eventStyleGetter={eventStyleGetter}
              roleFilters={roleFilters}
              isLoading={isAssignmentsLoading}
              pharmacy={pharmacies.find((p) => Number(p.id) === Number(selectedPharmacyId))}
            />
          ) : (
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
                  <Box sx={{
                      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                      backgroundColor: 'rgba(255, 255, 255, 0.7)',
                      display: 'flex', justifyContent: 'center', alignItems: 'center',
                      zIndex: 10
                  }}>
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
                onView={(nextView: CalendarViewKey | string) => setCalendarView(nextView as CalendarViewKey)}
                selectable
                onSelectSlot={handleSelectSlot}
                onSelectEvent={handleSelectEvent}
                eventPropGetter={eventStyleGetter}
                components={{
                  event: ({ event }: any) => {
                    const workforce = event.resource?.workforceStatus;
                    const settlement =
                      workforce?.settlementChannel === 'PAYROLL'
                        ? 'Payroll'
                        : workforce?.settlementChannel === 'TIMESHEET_ONLY'
                          ? 'Timesheet only'
                          : workforce?.settlementChannel === 'INVOICE'
                            ? 'Invoice'
                            : '';
                    return (
                      <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
                        <Typography component="div" variant="caption" noWrap sx={{ color: 'inherit', fontWeight: 800, lineHeight: 1.15 }}>
                          {event.title}
                        </Typography>
                        {settlement && (
                          <Typography component="div" variant="caption" noWrap sx={{ color: 'inherit', opacity: .95, fontSize: 9, lineHeight: 1.15 }}>
                            {settlement}{workforce?.agreedRate ? ` · ${workforce.agreedRate}/hr` : ''}
                          </Typography>
                        )}
                        {workforce?.timesheet && (
                          <Typography component="div" variant="caption" noWrap sx={{ color: 'inherit', opacity: .9, fontSize: 9, lineHeight: 1.15 }}>
                            {workforce.timesheet.status.replaceAll('_', ' ')} · reviewed {(workforce.timesheet.reviewedMinutes / 60).toFixed(2)}h
                          </Typography>
                        )}
                      </Box>
                    );
                  },
                }}
                views={calendarViews}
                messages={calendarMessages}
              />
            </Box>
          )}
        </>
      )}

      <RosterOwnerDialogs
        addAssignment={{
          open: isAddAssignmentDialogOpen,
          setOpen: setIsAddAssignmentDialogOpen,
          isDialogDataLoading,
          dialogShiftDate,
          setDialogShiftDate,
          dialogShiftStartTime,
          setDialogShiftStartTime,
          dialogShiftEndTime,
          setDialogShiftEndTime,
          newShiftRoleNeeded,
          handleNewShiftRoleChange,
          postAsOpenShift,
          setPostAsOpenShift,
          openShiftVisibility,
          setOpenShiftVisibility,
          selectedUserForAssignment,
          setSelectedUserForAssignment,
          filteredMembers,
          isCreatingShift,
          handleCreateOpenShift,
          handleCreateShiftAndAssign,
        }}
        assignmentOptions={{
          open: isOptionsDialogOpen,
          setOpen: setIsOptionsDialogOpen,
          selectedAssignment,
          isActionLoading,
          setIsEditDialogOpen,
          setShiftToEdit,
          setEditIsOpenShift,
          setEditOpenShiftVisibility,
          openShiftVisibility,
          setSelectedUserForAssignment,
          handleOpenDuplicateDialog,
          selectableEscalationLevels,
          showSnackbar,
          setEscalationLevel,
          setIsEscalateDialogOpen,
          handleDeleteAssignment,
          onOpenTimesheets: () => navigate(`/dashboard/workforce/timesheets?pharmacy_id=${selectedPharmacyId ?? ''}`),
          onOpenWorkforce: () => navigate(`/dashboard/workforce/settings?pharmacy_id=${selectedPharmacyId ?? ''}`),
        }}
        duplicate={{
          open: isDuplicateDialogOpen,
          setOpen: setIsDuplicateDialogOpen,
          isActionLoading,
          duplicateShiftData,
          calendarDate,
          duplicateTargetDates,
          setDuplicateTargetDates,
          duplicateCustomDate,
          setDuplicateCustomDate,
          duplicateKeepUser,
          setDuplicateKeepUser,
          handleExecuteDuplicateShift,
        }}
        leave={{
          open: isLeaveManageDialogOpen,
          setOpen: setIsLeaveManageDialogOpen,
          selectedAssignment,
          isActionLoading,
          handleRejectLeave,
          handleApproveLeave,
        }}
        cover={{
          open: isCoverRequestDialogOpen,
          setOpen: setIsCoverRequestDialogOpen,
          selectedCoverRequest,
          isActionLoading,
          handleRejectCoverRequest,
          handleApproveCoverRequest,
        }}
        edit={{
          open: isEditDialogOpen,
          setOpen: setIsEditDialogOpen,
          shiftToEdit,
          setShiftToEdit,
          editIsOpenShift,
          setEditIsOpenShift,
          editOpenShiftVisibility,
          setEditOpenShiftVisibility,
          selectedUserForAssignment,
          setSelectedUserForAssignment,
          filteredMembers,
          isActionLoading,
          handleSaveChanges,
        }}
        escalation={{
          open: isEscalateDialogOpen,
          setOpen: setIsEscalateDialogOpen,
          escalationLevel,
          setEscalationLevel,
          selectableEscalationLevels,
          isActionLoading,
          handleConfirmEscalation,
        }}
        postShift={{
          open: isPostShiftModalOpen,
          handleClosePostShiftModal,
          handlePostShiftCompleted,
        }}
      />

            <Snackbar
              open={snackbarOpen}
              onClose={closeSnackbar}
              message={snackbarMsg}
              autoHideDuration={4000}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              action={
                <IconButton size="small" color="inherit" onClick={closeSnackbar}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              }
            />
      
    </Box>
  );
}







