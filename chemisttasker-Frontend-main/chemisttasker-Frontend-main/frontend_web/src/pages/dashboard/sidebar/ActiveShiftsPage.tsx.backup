import React, { useCallback, useEffect, useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Button,
  CircularProgress,
  Snackbar,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
  Chip,
  Tooltip,
  Divider,
  Skeleton,
  Rating,
  Pagination,
  Card,
  CardContent,
  CardHeader,
  Stepper,
  Step,
  StepLabel,
  StepConnector,
  stepConnectorClasses,
  styled,
  createTheme,
  ThemeProvider,
  Stack,
  Avatar,
  ButtonBase,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  CheckCircle as Check,
  ExpandMore as ChevronDown,
  ChevronLeft,
  ChevronRight,
  Close as X,
  Edit,
  Delete as Trash2,
  Share as Share2,
  Business as Building,
  Info,
  CalendarToday as CalendarDays,
  PersonAdd as UserCheck,
  PersonRemove as UserX,
  HourglassEmpty as Clock,
  Star,
  Favorite,
  People,
  Store,
  CorporateFare,
  Public,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import {
  Shift,
  ShiftInterest,
  ShiftMemberStatus,
  ShiftRatingSummary,
  ShiftRatingComment,
  ShiftUser,
  EscalationLevelKey,
  fetchActiveShifts,
  fetchShiftCounterOffersService,
  fetchShiftInterests,
  fetchShiftRejections,
  fetchShiftMemberStatus,
  generateShiftShareLinkService,
  escalateShiftService,
  deleteActiveShiftService,
  acceptShiftCandidateService,
  acceptShiftCounterOfferService,
  rejectShiftCounterOfferService,
  revealShiftInterestService,
  fetchRatingsSummaryService,
  fetchRatingsPageService,
} from '@chemisttasker/shared-core';
import { useAuth } from '../../../contexts/AuthContext';

// Injecting Inter font from Google Fonts
const fontStyle = document.createElement('style');
fontStyle.innerHTML = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
`;
document.head.appendChild(fontStyle);

const customTheme = createTheme({
  palette: {
    primary: { main: '#6D28D9', light: '#8B5CF6', dark: '#5B21B6' },
    secondary: { main: '#10B981', light: '#6EE7B7', dark: '#047857' },
    success: { main: '#10B981', light: '#E0F2F1', dark: '#047857' },
    error: { main: '#EF4444', light: '#FEE2E2', dark: '#B91C1C' },
    warning: { main: '#F59E0B', light: '#FFFBEB', dark: '#B45309' },
    info: { main: '#0EA5E9', light: '#E0F2FE', dark: '#0284C7' },
    background: { default: '#F9FAFB', paper: '#FFFFFF' },
  },
  typography: { fontFamily: "'Inter', sans-serif" },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: '8px', textTransform: 'none', fontWeight: 600, boxShadow: 'none' },
        containedPrimary: {
          color: 'white',
          background: 'linear-gradient(to right, #8B5CF6, #6D28D9)',
          '&:hover': { background: 'linear-gradient(to right, #A78BFA, #8B5CF6)' },
        },
        containedSecondary: { color: 'white' },
      },
    },
    MuiCard: {
      styleOverrides: { root: { borderRadius: '16px', border: '1px solid #E5E7EB' } },
    },
  },
});

interface TabDataState {
  loading: boolean;
  membersBySlot?: Record<number, ShiftMemberStatus[]>;
  interestsBySlot?: Record<number, ShiftInterest[]>;
  interestsAll?: ShiftInterest[];
  rejectionsBySlot?: Record<number, ShiftInterest[]>;
  isPastLevel?: boolean;
}

const PUBLIC_LEVEL_KEY: EscalationLevelKey = 'PLATFORM';
const FAVOURITE_LEVEL_KEY: EscalationLevelKey = 'LOCUM_CASUAL';

const ESCALATION_LEVELS: Array<{
  key: EscalationLevelKey;
  label: string;
  icon: React.ElementType;
  requiresOrganization?: boolean;
}> = [
  { key: 'FULL_PART_TIME', label: 'My Pharmacy', icon: People },
  { key: FAVOURITE_LEVEL_KEY, label: 'Favourites', icon: Favorite },
  { key: 'OWNER_CHAIN', label: 'Chain', icon: Store },
  { key: 'ORG_CHAIN', label: 'Organization', icon: CorporateFare, requiresOrganization: true },
  { key: PUBLIC_LEVEL_KEY, label: 'Platform', icon: Public },
];

const STATUS_PRIORITY: Record<ShiftMemberStatus['status'], number> = {
  rejected: 0,
  no_response: 1,
  interested: 2,
  accepted: 3,
};

const dedupeMembers = (members: ShiftMemberStatus[]): ShiftMemberStatus[] => {
  const map = new Map<number, ShiftMemberStatus>();
  members.forEach(member => {
    const userKey = member.userId ?? null;
    if (userKey == null) {
      return;
    }
    const normalizedRating = member.averageRating ?? member.rating ?? null;
    const normalized: ShiftMemberStatus = {
      ...member,
      averageRating: normalizedRating,
      rating: normalizedRating ?? member.rating ?? null,
    };
    const existing = map.get(userKey);
    if (!existing) {
      map.set(userKey, normalized);
      return;
    }
    if (STATUS_PRIORITY[normalized.status] > STATUS_PRIORITY[existing.status]) {
      map.set(userKey, normalized);
      return;
    }
    if (STATUS_PRIORITY[normalized.status] === STATUS_PRIORITY[existing.status]) {
      const existingRating = existing.averageRating ?? existing.rating ?? -1;
      if ((normalized.averageRating ?? normalized.rating ?? -1) > existingRating) {
        map.set(userKey, normalized);
      }
    }
  });
  return Array.from(map.values());
};

const ColorStepConnector = styled(StepConnector)(({ theme }) => ({
  [`&.${stepConnectorClasses.alternativeLabel}`]: {
    top: 24,
    left: 'calc(-50% + 30px)',
    right: 'calc(50% + 30px)',
  },
  [`& .${stepConnectorClasses.line}`]: {
    borderColor: '#E5E7EB',
    borderTopWidth: 2,
    borderRadius: 1,
  },
  [`&.${stepConnectorClasses.active} .${stepConnectorClasses.line}`]: {
    borderColor: theme.palette.primary.main,
  },
  [`&.${stepConnectorClasses.completed} .${stepConnectorClasses.line}`]: {
    borderColor: theme.palette.primary.main,
  },
}));

const ColorStepIconRoot = styled('div')<{ ownerState: { completed?: boolean; active?: boolean } }>(
  ({ theme, ownerState }) => ({
    backgroundColor: '#E5E7EB',
    zIndex: 1,
    color: '#6B7280',
    width: 50,
    height: 50,
    display: 'flex',
    borderRadius: '50%',
    justifyContent: 'center',
    alignItems: 'center',
    transition: 'all 0.3s ease-in-out',
    ...(ownerState.active && {
      backgroundColor: theme.palette.primary.main,
      color: '#fff',
      boxShadow: '0 6px 15px 0 rgba(109, 40, 217, 0.4)',
    }),
    ...(ownerState.completed && {
      backgroundColor: theme.palette.primary.dark,
      color: '#fff',
    }),
  })
);

function ColorStepIcon(props: { active?: boolean; completed?: boolean; icon: React.ElementType }) {
  const { icon: Icon } = props;
  return (
    <ColorStepIconRoot ownerState={props}>
      <Icon sx={{ fontSize: 24 }} />
    </ColorStepIconRoot>
  );
}

const ActiveShiftsPage: React.FC = () => {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(true);
  const [expandedShift, setExpandedShift] = useState<number | false>(false);
  const [tabData, setTabData] = useState<Record<string, TabDataState>>({});
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string }>({ open: false, message: '' });
  const [escalating, setEscalating] = useState<Record<number, boolean>>({});
  const [deleting, setDeleting] = useState<Record<number, boolean>>({});
  const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
  const [shiftToDelete, setShiftToDelete] = useState<number | null>(null);
  const navigate = useNavigate();
  const theme = useTheme();
  const { user, activePersona, activeAdminPharmacyId } = useAuth();
  const scopedPharmacyId =
    activePersona === "admin" && typeof activeAdminPharmacyId === "number"
      ? activeAdminPharmacyId
      : null;
  const [sharingShiftId, setSharingShiftId] = useState<number | null>(null);
  const [selectedLevelByShift, setSelectedLevelByShift] = useState<Record<number, EscalationLevelKey>>({});
  const [selectedSlotByShift, setSelectedSlotByShift] = useState<Record<number, number | null>>({});
  const [reviewCandidateDialog, setReviewCandidateDialog] = useState<{
    open: boolean;
    candidate: ShiftMemberStatus | null;
    shiftId: number | null;
    counterOffer: any | null;
    slotId: number | null;
  }>({ open: false, candidate: null, shiftId: null, counterOffer: null, slotId: null });
  const [platformInterestDialog, setPlatformInterestDialog] = useState<{
    open: boolean;
    user: ShiftUser | null;
    shiftId: number | null;
    interest: ShiftInterest | null;
    counterOffer: any | null;
  }>({ open: false, user: null, shiftId: null, interest: null, counterOffer: null });
  const [workerRatingSummary, setWorkerRatingSummary] = useState<ShiftRatingSummary | null>(null);
  const [workerRatingComments, setWorkerRatingComments] = useState<ShiftRatingComment[]>([]);
  const [workerCommentsPage, setWorkerCommentsPage] = useState(1);
  const [workerCommentsPageCount, setWorkerCommentsPageCount] = useState(1);
  const [loadingWorkerRatings, setLoadingWorkerRatings] = useState(false);
  const [revealingInterestId, setRevealingInterestId] = useState<number | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [reviewLoadingId, setReviewLoadingId] = useState<number | null>(null);
  const [reviewOfferDialog, setReviewOfferDialog] = useState<{ open: boolean; offer: any | null; candidate: any | null; slotId: number | null }>({ open: false, offer: null, candidate: null, slotId: null });
  const [counterOffersByShift, setCounterOffersByShift] = useState<Record<number, any[]>>({});
  const [counterOffersLoading, setCounterOffersLoading] = useState<Set<number>>(new Set());
  const [counterActionLoading, setCounterActionLoading] = useState<number | null>(null);

  const showSnackbar = useCallback((message: string) => {
    setSnackbar({ open: true, message });
  }, []);

  const closeSnackbar = useCallback(() => {
    setSnackbar({ open: false, message: '' });
  }, []);

  const loadCounterOffers = useCallback(async (shiftId: number) => {
    if (counterOffersLoading.has(shiftId)) return;
    setCounterOffersLoading(prev => {
      const next = new Set(prev);
      next.add(shiftId);
      return next;
    });
    try {
      const offers = await fetchShiftCounterOffersService(shiftId);
      setCounterOffersByShift(prev => ({ ...prev, [shiftId]: Array.isArray(offers) ? offers : [] }));
    } catch (error) {
      console.warn('Failed to load counter offers for shift', shiftId, error);
    } finally {
      setCounterOffersLoading(prev => {
        const next = new Set(prev);
        next.delete(shiftId);
        return next;
      });
    }
  }, [counterOffersLoading]);

  const resetWorkerRatings = () => {
    setWorkerRatingSummary(null);
    setWorkerRatingComments([]);
    setWorkerCommentsPage(1);
    setWorkerCommentsPageCount(1);
  };

  const getTabKey = useCallback((shiftId: number, levelKey: EscalationLevelKey) => `${shiftId}_${levelKey}`, []);

  const deriveLevelSequence = useCallback((shift: Shift) => {
    const allowed = new Set(shift.allowedEscalationLevels ?? []);
    if (!allowed.size) {
      return ESCALATION_LEVELS;
    }
    return ESCALATION_LEVELS.filter(level => allowed.has(level.key));
  }, []);

  const loadShifts = useCallback(async () => {
    setLoadingShifts(true);
    try {
      const data = await fetchActiveShifts();
      console.log('[ActiveShiftsPage] fetched shifts', { count: (data || []).length, data });
      const filtered =
        scopedPharmacyId != null
          ? data.filter((shift: Shift) => {
              const target = shift.pharmacyId ?? shift.pharmacyDetail?.id ?? null;
              return Number(target) === scopedPharmacyId;
            })
          : data;
      console.log('[ActiveShiftsPage] filtered shifts', { count: (filtered || []).length, scopedPharmacyId, filtered });
      setShifts(filtered);
    } catch (error) {
      console.error('Failed to load active shifts', error);
      showSnackbar('Failed to load active shifts.');
    } finally {
      setLoadingShifts(false);
    }
  }, [showSnackbar, scopedPharmacyId]);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  const loadWorkerRatings = useCallback(async (workerId: number, page: number = 1) => {
    setLoadingWorkerRatings(true);
    try {
      const summary = await fetchRatingsSummaryService({ targetType: 'worker', targetId: workerId });
      setWorkerRatingSummary(summary);

      const commentsRes = await fetchRatingsPageService({
        targetType: 'worker',
        targetId: workerId,
        page,
      });
      const items = commentsRes.results ?? [];
      setWorkerRatingComments(items);
      const perPage = items.length || 1;
      const totalCount = commentsRes.count ?? items.length;
      setWorkerCommentsPageCount(Math.max(1, Math.ceil(totalCount / perPage)));
      setWorkerCommentsPage(page);
    } catch (error) {
      console.error('Failed to load worker ratings', error);
      setWorkerRatingSummary(null);
      setWorkerRatingComments([]);
    } finally {
      setLoadingWorkerRatings(false);
    }
  }, []);

  const loadTabData = useCallback(
    async (shift: Shift, levelKey: EscalationLevelKey) => {
      const tabKey = getTabKey(shift.id, levelKey);
      setTabData(prev => ({
        ...prev,
        [tabKey]: { ...prev[tabKey], loading: true },
      }));

      const level = ESCALATION_LEVELS.find(item => item.key === levelKey);
      if (!level) {
        setTabData(prev => ({
          ...prev,
          [tabKey]: { loading: false },
        }));
        return;
      }

      try {
        if (level.key === PUBLIC_LEVEL_KEY) {
          const interestsRaw = await fetchShiftInterests({ shiftId: shift.id });
          const rejectionsRaw = await fetchShiftRejections({ shiftId: shift.id });

          const interestsBySlot: Record<number, ShiftInterest[]> = {};
          const interestsAll: ShiftInterest[] = [];
          const rejectionsBySlot: Record<number, ShiftInterest[]> = {};

          interestsRaw.forEach((interest: ShiftInterest) => {
            if (interest.slotId === null || interest.slotId === undefined) {
              interestsAll.push(interest);
            } else {
              if (!interestsBySlot[interest.slotId]) {
                interestsBySlot[interest.slotId] = [];
              }
              interestsBySlot[interest.slotId].push(interest);
            }
          });

          rejectionsRaw.forEach((rej: ShiftInterest) => {
            if (rej.slotId == null) return;
            if (!rejectionsBySlot[rej.slotId]) {
              rejectionsBySlot[rej.slotId] = [];
            }
            rejectionsBySlot[rej.slotId].push(rej);
          });

          setTabData(prev => ({
            ...prev,
            [tabKey]: { loading: false, interestsBySlot, interestsAll, rejectionsBySlot },
          }));
          return;
        }

        if (!shift.slots?.length) {
          setTabData(prev => ({
            ...prev,
            [tabKey]: { loading: false, membersBySlot: {} },
          }));
          return;
        }

        const membersBySlotEntries = await Promise.all(
          shift.slots.map(async slot => {
            try {
              const members = await fetchShiftMemberStatus(shift.id, {
                slotId: slot.id,
                visibility: level.key,
              });
              return [slot.id, members] as const;
            } catch (error) {
              console.error(`Failed to load members for shift ${shift.id} slot ${slot.id}`, error);
              return [slot.id, [] as ShiftMemberStatus[]] as const;
            }
          })
        );

        const membersBySlot = membersBySlotEntries.reduce<Record<number, ShiftMemberStatus[]>>((acc, [slotId, members]) => {
          acc[slotId] = members;
          return acc;
        }, {});

        setTabData(prev => ({
          ...prev,
          [tabKey]: { loading: false, membersBySlot },
        }));
      } catch (error) {
        console.error('Failed to load tab data', error);
        showSnackbar(`Failed to load data for ${level.label}`);
        setTabData(prev => ({
          ...prev,
          [tabKey]: { loading: false },
        }));
      }
    },
    [getTabKey, showSnackbar]
  );

  const handleAccordionChange = useCallback(
    (shift: Shift) => (_event: React.SyntheticEvent, expanded: boolean) => {
      const shiftId = shift.id;
      setExpandedShift(expanded ? shiftId : false);
      if (expanded && !shift.singleUserOnly && shift.slots?.length) {
        setSelectedSlotByShift(prev => ({
          ...prev,
          [shiftId]: shift.slots?.[0]?.id ?? null,
        }));
      }

      if (expanded) {
        const levels = deriveLevelSequence(shift);
        const currentIdx = Math.max(0, levels.findIndex(level => level.key === shift.visibility));
        const currentLevel = levels[currentIdx];

        // Set the initially selected level to the shift's current level
        setSelectedLevelByShift(prev => ({ ...prev, [shiftId]: currentLevel.key }));

        // Pre-load data for all levels up to the current one
        const levelsToEnsure = levels.slice(0, currentIdx + 1);
        levelsToEnsure.forEach(level => {
          const tabKey = getTabKey(shiftId, level.key);
          if (!tabData[tabKey]) {
            loadTabData(shift, level.key);
          }
        });
        loadCounterOffers(shiftId);
      }
    },
    [deriveLevelSequence, getTabKey, loadTabData, tabData, loadCounterOffers]
  );

  const handleLevelSelect = useCallback(
    (shift: Shift, levelKey: EscalationLevelKey) => {
      setSelectedLevelByShift(prev => ({ ...prev, [shift.id]: levelKey }));
      const tabKey = getTabKey(shift.id, levelKey);
      if (!tabData[tabKey]) {
        loadTabData(shift, levelKey);
      }
    },
    [getTabKey, loadTabData, tabData]
  );

  const handleSlotSelect = useCallback((shiftId: number, slotId: number | null) => {
    setSelectedSlotByShift(prev => ({ ...prev, [shiftId]: slotId }));
  }, []);

  const handleShare = async (shift: Shift) => {
    if (shift.visibility !== PUBLIC_LEVEL_KEY) {
      showSnackbar('Escalate to Platform to get a shareable link.');
      return;
    }
    setSharingShiftId(shift.id);
    try {
      const link = await generateShiftShareLinkService(shift.id);
      const token = link.shareToken ?? link.token;
      if (!token && !link.url) {
        throw new Error('Missing share token');
      }
      const publicUrl = link.url ?? `${window.location.origin}/shifts/link?token=${token}`;
      await navigator.clipboard.writeText(publicUrl);
      showSnackbar('Public share link copied to clipboard!');
    } catch (error) {
      console.error('Share Error:', error);
      showSnackbar('Error: Could not generate share link.');
    } finally {
      setSharingShiftId(null);
    }
  };

  const handleEscalate = async (shift: Shift, targetLevelKey: EscalationLevelKey) => {
    const targetLevel = ESCALATION_LEVELS.find(level => level.key === targetLevelKey);
    const targetLevelIdx = ESCALATION_LEVELS.findIndex(level => level.key === targetLevelKey);

    if (!targetLevel || targetLevelIdx === -1) {
      showSnackbar('Unable to escalate shift.');
      return;
    }

    setEscalating(prev => ({ ...prev, [shift.id]: true }));
    try {
      await escalateShiftService(shift.id, { targetVisibility: targetLevel.key });
      const updatedShift = { ...shift, visibility: targetLevel.key, escalationLevel: targetLevelIdx };
      setShifts(prev => prev.map(s => (s.id === shift.id ? updatedShift : s)));
      loadTabData(updatedShift, targetLevel.key);
      // After escalating, set the selected level to the new level
      setSelectedLevelByShift(prev => ({ ...prev, [shift.id]: targetLevel.key }));
      showSnackbar(`Shift escalated to ${targetLevel.label}`);
    } catch (error: any) {
      const detail = error?.response?.data?.detail || 'Failed to escalate shift.';
      console.error('Failed to escalate shift', detail);
      showSnackbar(detail);
    } finally {
      setEscalating(prev => ({ ...prev, [shift.id]: false }));
    }
  };

  const handleEdit = (shiftId: number) => {
    const baseRoute =
      scopedPharmacyId != null
        ? `/dashboard/admin/${scopedPharmacyId}/post-shift`
        : user?.role?.startsWith('ORG_')
        ? '/dashboard/organization/post-shift'
        : '/dashboard/owner/post-shift';
    navigate(`${baseRoute}?edit=${shiftId}`);
  };

  const handleDelete = (shiftId: number) => {
    setShiftToDelete(shiftId);
    setOpenDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (shiftToDelete === null) return;
    setDeleting(prev => ({ ...prev, [shiftToDelete]: true }));
    try {
      await deleteActiveShiftService(shiftToDelete);
      setShifts(prev => prev.filter(shift => shift.id !== shiftToDelete));
      setTabData(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(key => {
          if (key.startsWith(`${shiftToDelete}_`)) {
            delete updated[key];
          }
        });
        return updated;
      });
      setExpandedShift(prev => (prev === shiftToDelete ? false : prev));
      showSnackbar('Shift cancelled successfully.');
      setOpenDeleteConfirm(false);
      setShiftToDelete(null);
    } catch (error) {
      console.error('Failed to delete shift', error);
      showSnackbar('Failed to delete shift.');
    } finally {
      setDeleting(prev => ({ ...prev, [shiftToDelete]: false }));
    }
  };

  const handleAssign = async (shiftId: number, userId: number, slotId: number | null) => {
    setAssigning(true);
    try {
      await acceptShiftCandidateService(shiftId, { userId, slotId });
      showSnackbar('User assigned successfully.');
      setReviewCandidateDialog({ open: false, candidate: null, shiftId: null, counterOffer: null, slotId: null });
      setPlatformInterestDialog({ open: false, user: null, shiftId: null, interest: null, counterOffer: null });
      // Refresh active shifts so partially assigned multi-slot shifts remain visible until fully staffed.
      await loadShifts();
    } catch (error) {
      console.error('Failed to assign user', error);
      showSnackbar('Failed to assign user.');
    } finally {
      setAssigning(false);
    }
  };

  const handleReviewCandidate = async (candidate: ShiftMemberStatus, shiftId: number, counterOffer: any | null = null, slotId: number | null = null) => {
    resetWorkerRatings();
    setReviewCandidateDialog({ open: true, candidate, shiftId, counterOffer, slotId });
    if (candidate.userId != null) {
      setReviewLoadingId(candidate.userId);
      try {
        await loadWorkerRatings(candidate.userId, 1);
      } finally {
        setReviewLoadingId(null);
      }
    }
  };

  const handleRevealPlatform = async (
    shift: Shift,
    interest: ShiftInterest,
    counterOffer?: any | null
  ) => {
    if (interest.userId == null) {
      showSnackbar('Unable to reveal this interest.');
      return;
    }

    setRevealingInterestId(interest.id);
    try {
      resetWorkerRatings();
      const userDetail = await revealShiftInterestService(shift.id, {
        userId: interest.userId,
        slotId: interest.slotId ?? null,
      });
      setPlatformInterestDialog({
        open: true,
        user: userDetail,
        shiftId: shift.id,
        interest: { ...interest, revealed: true, user: userDetail },
        counterOffer: counterOffer ?? null,
      });
      if (userDetail?.id) {
        setReviewLoadingId(userDetail.id);
        await loadWorkerRatings(userDetail.id, 1);
      }
      setReviewLoadingId(null);
      markInterestRevealed(shift.id, PUBLIC_LEVEL_KEY, interest.id, userDetail);
    } catch (error) {
      console.error('Failed to reveal platform candidate', error);
      showSnackbar('Failed to reveal candidate.');
      setReviewLoadingId(null);
    } finally {
      setRevealingInterestId(null);
    }
  };

  const handleAssignPlatform = async () => {
    const { shiftId, user, interest } = platformInterestDialog;
    if (!shiftId || !user || user.id == null) return;
    await handleAssign(shiftId, user.id, interest?.slotId ?? null);
  };

  const handleWorkerCommentsPageChange = async (_: React.ChangeEvent<unknown>, value: number) => {
    const userId = reviewCandidateDialog.candidate?.userId ?? platformInterestDialog.user?.id;
    if (!userId) return;
    await loadWorkerRatings(userId, value);
    const dialogRef = document.querySelector('[role="dialog"]');
    dialogRef?.scrollTo?.({ top: 0, behavior: 'smooth' });
  };

  const renderStatusCard = (
    title: string,
    members: ShiftMemberStatus[],
    icon: React.ReactElement,
    color: 'success' | 'error' | 'warning' | 'info',
    shiftId: number,
    getOfferForMember?: (member: ShiftMemberStatus) => { offer: any | null; slotId: number | null }
  ) => (
    <Card sx={{ background: customTheme.palette.background.default, boxShadow: 'none', border: `1px solid ${customTheme.palette.divider}` }}>
      <CardHeader
        avatar={
          <Avatar sx={{ bgcolor: customTheme.palette[color].light, color: customTheme.palette[color].dark }}>
            {icon}
          </Avatar>
        }
        title={
          <Typography variant="h6" sx={{ fontWeight: 'bold', color: customTheme.palette[color].dark }}>
            {title}
          </Typography>
        }
        action={
          <Chip
            label={members.length}
            size="small"
            sx={{
              backgroundColor: customTheme.palette[color].dark,
              color: 'white',
              fontWeight: 'bold',
            }}
          />
        }
      />
      <CardContent>
        {members.length > 0 ? (
          <Stack spacing={2}>
            {members.map((member) => {
              const ratingValue = member.averageRating ?? member.rating ?? null;
              return (
                <Paper key={member.userId} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Stack>
                      <Typography variant="body1" fontWeight="bold">
                        {member.name}
                      </Typography>
                      {member.employmentType && (
                        <Typography variant="caption" color="text.secondary">
                          {member.employmentType}
                        </Typography>
                      )}
                    </Stack>
                    {ratingValue ? (
                      <Chip
                        icon={<Star sx={{ fontSize: 16 }} />}
                        label={ratingValue.toFixed(1)}
                        size="small"
                        color="warning"
                        variant="outlined"
                      />
                    ) : null}
                  </Stack>
                  {title === 'Interested' && (
                    <Button
                      size="small"
                      variant="contained"
                      color="secondary"
                      fullWidth
                      sx={{ mt: 1.5 }}
                      onClick={() => {
                        const match = getOfferForMember ? getOfferForMember(member) : { offer: null, slotId: null };
                        handleReviewCandidate(member, shiftId, match.offer, match.slotId);
                      }}
                      disabled={reviewLoadingId === member.userId}
                      startIcon={
                        reviewLoadingId === member.userId ? <CircularProgress size={16} color="inherit" /> : undefined
                      }
                    >
                      Review Candidate
                    </Button>
                  )}
                </Paper>
              );
            })}
          </Stack>
        ) : (
          <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            No candidates yet.
          </Typography>
        )}
      </CardContent>
    </Card>
  );

  const renderOfferList = (
    offers: any[],
    filterSlotId: number | null,
    onOpen: (offer: any) => void,
    labelResolver?: (offer: any) => string,
    titleResolver?: (offer: any) => string
  ) => {
    const list = Array.isArray(offers) ? offers : [];
    const filtered = filterSlotId == null
      ? list
      : list.filter((offer) => (offer.slots || []).some((s: any) => (s.slotId ?? s.slot?.id ?? s.id) === filterSlotId));
    if (filtered.length === 0) {
      return (
        <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          No counter offers yet.
        </Typography>
      );
    }
    return (
      <Stack spacing={1}>
        {filtered.map((offer: any) => (
          <Paper key={offer.id ?? Math.random()} variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  {titleResolver ? titleResolver(offer) : offer.user ? 'Offer' : 'Anonymous offer'}
                </Typography>
              </Box>
              <Button size="small" onClick={() => onOpen(offer)}>
                {labelResolver ? labelResolver(offer) : (offer.user ? 'Review offer' : 'Reveal offer')}
              </Button>
            </Stack>
          </Paper>
        ))}
      </Stack>
    );
  };

  const handleAcceptOffer = async (offer: any) => {
    if (!offer?.id || !offer?.shift) return;
    setCounterActionLoading(offer.id);
    try {
      await acceptShiftCounterOfferService({
        shiftId: offer.shift,
        offerId: offer.id,
        slotId: reviewOfferDialog.slotId ?? null,
      });
      showSnackbar('Counter offer accepted.');
      loadCounterOffers(offer.shift);
      loadShifts();
    } catch (error) {
      console.error('Failed to accept counter offer', error);
      showSnackbar('Failed to accept counter offer.');
    } finally {
      setCounterActionLoading(null);
    }
  };

  const findInterestForOffer = (offer: any, currentTabData: any, selectedSlotId: number | null) => {
    const offerUser = offer?.userDetail ?? offer?.user_detail ?? offer?.user;
    if (!offerUser) return null;
    if (!currentTabData) return null;
    const userId = typeof offerUser === 'object' ? offerUser?.id : offerUser;
    const rawList = selectedSlotId != null
      ? currentTabData.interestsBySlot?.[selectedSlotId] || []
      : currentTabData.interestsAll || [];
    const direct = rawList.find((interest: any) => {
      const iid = interest.userId ?? interest.user?.id ?? interest.user ?? null;
      return iid != null && iid === userId;
    });
    if (direct) return direct;

    if (currentTabData?.interestsBySlot) {
      const flattened = Object.values(currentTabData.interestsBySlot).flat() as any[];
      return flattened.find((interest: any) => {
        const iid = interest.userId ?? interest.user?.id ?? interest.user ?? null;
        return iid != null && iid === userId;
      }) || null;
    }

    return null;
  };

  const markInterestRevealed = (shiftId: number, levelKey: EscalationLevelKey, interestId: number | null, userDetail?: any) => {
    if (!interestId) return;
    const tabKey = getTabKey(shiftId, levelKey);
    setTabData(prev => {
      const current = prev[tabKey];
      if (!current) return prev;
      const nextInterestsBySlot: Record<number, any[]> = {};
      Object.entries(current.interestsBySlot || {}).forEach(([sid, list]) => {
        nextInterestsBySlot[Number(sid)] = (list as any[]).map(item =>
          item.id === interestId ? { ...item, revealed: true, user: userDetail || item.user } : item
        );
      });
      const nextInterestsAll = (current.interestsAll || []).map((item: any) =>
        item.id === interestId ? { ...item, revealed: true, user: userDetail || item.user } : item
      );
      return {
        ...prev,
        [tabKey]: { ...current, interestsBySlot: nextInterestsBySlot, interestsAll: nextInterestsAll },
      };
    });
  };

  const getUserDisplayName = (user: any): string | undefined => {
    if (!user) return undefined;
    const first = user.firstName || user.first_name;
    const last = user.lastName || user.last_name;
    if (first && last) return `${first} ${last}`;
    if (first) return first as string;
    return (
      user.name ||
      user.displayName ||
      user.display_name ||
      user.fullName ||
      user.full_name ||
      user.email ||
      undefined
    );
  };

  const getInterestDisplayName = (interest: any, userDetail?: any): string => {
    return (
      interest?.userName ||
      interest?.displayName ||
      interest?.name ||
      getUserDisplayName(userDetail || interest?.user) ||
      interest?.user ||
      'Candidate'
    );
  };

  const mapOfferSlotsWithShift = (offer: any, shift: Shift | undefined, filterSlotId: number | null = null) => {
    const shiftSlotMap = new Map<number, any>();
    (shift?.slots || []).forEach(s => {
      if (s.id != null) shiftSlotMap.set(Number(s.id), s);
    });
    const baseList = (offer?.slots || []);
    let filtered = filterSlotId == null
      ? baseList
      : baseList.filter((slot: any) => (slot.slotId ?? slot.slot?.id ?? slot.id) === filterSlotId);
    if (filterSlotId != null && filtered.length === 0) {
      filtered = baseList;
    }
    return filtered.map((slot: any, idx: number) => {
      const slotId = slot.slotId ?? slot.slot?.id ?? slot.id ?? null;
      const base = slotId != null ? shiftSlotMap.get(Number(slotId)) : null;
      const date = slot.slotDate ?? slot.slot_date ?? slot.slot?.date ?? slot.date ?? base?.date ?? null;
      const proposedStart = slot.proposedStartTime ?? slot.proposed_start_time ?? slot.start ?? slot.startTime ?? slot.start_time ?? base?.startTime;
      const proposedEnd = slot.proposedEndTime ?? slot.proposed_end_time ?? slot.end ?? slot.endTime ?? slot.end_time ?? base?.endTime;
      const proposedRate = slot.proposedRate ?? slot.proposed_rate ?? slot.rate ?? base?.rate ?? null;
      return {
        id: slotId ?? idx,
        slotId: slotId ?? null,
        date,
        proposedStart,
        proposedEnd,
        proposedRate,
      };
    });
  };

  const findOfferForMemberInShift = (
    offers: any[],
    member: ShiftMemberStatus,
    slotId: number | null
  ): { offer: any | null; slotId: number | null } => {
    if (!Array.isArray(offers) || !member?.userId) return { offer: null, slotId };
    const match = offers.find((offer: any) => {
      const uid = typeof offer.user === 'object' ? offer.user?.id : offer.user;
      const detailId = offer.userDetail?.id ?? offer.user_detail?.id ?? null;
      const offerUserId = uid ?? detailId;
      if (offerUserId !== member.userId) return false;
      if (slotId == null) return true;
      return (offer.slots || []).some(
        (s: any) => (s.slotId ?? s.slot?.id ?? s.id) === slotId
      );
    });
    return { offer: match ?? null, slotId };
  };

  const handleOfferOpen = async (
    shift: Shift,
    offer: any,
    currentTabData: any,
    selectedSlotId: number | null
  ) => {
    resetWorkerRatings();
    let interest = shift.visibility === PUBLIC_LEVEL_KEY
      ? findInterestForOffer(offer, currentTabData, selectedSlotId)
      : null;
    let revealedUser: any = null;
    if (interest) {
      try {
        revealedUser = await revealShiftInterestService(shift.id, {
          userId: interest.userId ?? interest.user?.id ?? interest.user,
          slotId: interest.slotId ?? null,
        });
        interest = { ...interest, revealed: true, user: revealedUser || (interest as any).user };
        markInterestRevealed(shift.id, PUBLIC_LEVEL_KEY, interest.id, revealedUser);
        // Refresh offers so list picks up user_detail
        await loadCounterOffers(shift.id);
      } catch (error) {
        console.error('Failed to reveal offer candidate', error);
      }
    } else if (offer?.user && shift.singleUserOnly) {
      // Fallback for single-user shifts where interest lookup might be null: reveal interest, prefer the current slot.
      const fallbackSlotId =
        selectedSlotId ??
        (offer?.slots || [])[0]?.slotId ??
        (offer?.slots || [])[0]?.slot?.id ??
        (offer?.slots || [])[0]?.id ??
        null;
      try {
        revealedUser = await revealShiftInterestService(shift.id, {
          userId: offer.user,
          slotId: fallbackSlotId,
        });
        await loadCounterOffers(shift.id);
      } catch (error) {
        console.error('Failed to reveal offer candidate (fallback)', error);
      }
    }

    const candidate = interest ? {
      name: getInterestDisplayName(interest, revealedUser),
      email: revealedUser?.email || interest.user?.email || interest.email,
      shortBio: interest.shortBio || interest.user?.shortBio || revealedUser?.shortBio,
    } : (() => {
      const userObj = revealedUser || offer?.userDetail || offer?.user_detail || (typeof offer?.user === 'object' ? offer.user : null) || null;
      return userObj ? {
        name: getUserDisplayName(userObj) || getInterestDisplayName({}, userObj),
        email: userObj.email,
        shortBio: userObj.shortBio || userObj.short_bio || '',
      } : null;
    })();

    const ratingsUserId = (revealedUser?.id ?? interest?.userId ?? interest?.user?.id ?? offer?.user?.id ?? null);
    if (ratingsUserId != null) {
      setReviewLoadingId(ratingsUserId);
      try {
        await loadWorkerRatings(ratingsUserId, 1);
      } finally {
        setReviewLoadingId(null);
      }
    }

    const mappedSlots = mapOfferSlotsWithShift(offer, shift, selectedSlotId);
    console.debug('[ReviewOffer] mapped slots', { shiftId: shift.id, offerId: offer.id, selectedSlotId, mappedSlots, rawSlots: offer?.slots });

    // Ensure the related interest is marked revealed (so list can show name)
    if (interest?.id) {
      markInterestRevealed(shift.id, PUBLIC_LEVEL_KEY, interest.id, revealedUser || offer?.userDetail || offer?.user_detail || offer?.user);
    }

    // Update offers cache so list can show name without another reveal
    if (revealedUser) {
      setCounterOffersByShift(prev => {
        const existing = prev[shift.id] || [];
        const updated = existing.map((o: any) =>
          o.id === offer.id ? { ...o, userDetail: revealedUser, user_detail: revealedUser } : o
        );
        return { ...prev, [shift.id]: updated };
      });
    }

    setReviewOfferDialog({
      open: true,
      offer: { ...offer, _mappedSlots: mappedSlots },
      candidate,
      slotId: selectedSlotId,
    });
  };

  const handleRejectOffer = async (offer: any) => {
    if (!offer?.id || !offer?.shift) return;
    setCounterActionLoading(offer.id);
    try {
      await rejectShiftCounterOfferService({ shiftId: offer.shift, offerId: offer.id });
      showSnackbar('Counter offer rejected.');
      loadCounterOffers(offer.shift);
    } catch (error) {
      console.error('Failed to reject counter offer', error);
      showSnackbar('Failed to reject counter offer.');
    } finally {
      setCounterActionLoading(null);
    }
  };

  return (
    <ThemeProvider theme={customTheme}>
      <Container
        maxWidth={false}
        sx={{
          py: 4,
          px: { xs: 1.5, md: 3.5 },
          backgroundColor: customTheme.palette.background.default,
          minHeight: '100vh',
          maxWidth: 1440,
          margin: '0 auto',
        }}
      >
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', color: '#111827' }}>
          Active Shifts
        </Typography>
        {loadingShifts ? (
          <Box sx={{ py: 2, display: 'grid', gap: 3 }}>
            {[...Array(2)].map((_, idx) => (
              <Skeleton key={idx} variant="rounded" width="100%" height={200} />
            ))}
          </Box>
        ) : shifts.length === 0 ? (
          <Paper elevation={0} sx={{ textAlign: 'center', p: 4, bgcolor: 'white', borderRadius: 4 }}>
            <Typography variant="h6">No active shifts found.</Typography>
            <Typography color="text.secondary">New shifts you post will appear here.</Typography>
          </Paper>
        ) : (
          <Box sx={{ display: 'grid', gap: 3 }}>
          {shifts.map(shift => {
            const levelSequence = deriveLevelSequence(shift);
            const currentLevelIdx = Math.max(
              0,
              levelSequence.findIndex(level => level.key === shift.visibility)
            );
            const selectedLevelKey = selectedLevelByShift[shift.id] ?? levelSequence[currentLevelIdx]?.key;
            const selectedLevelIdx = levelSequence.findIndex(level => level.key === selectedLevelKey);
            const isExpanded = expandedShift === shift.id;
            const cardBorderColor =
              shift.visibility === PUBLIC_LEVEL_KEY
                ? customTheme.palette.secondary.light
                : customTheme.palette.primary.light;
            const pharmacyDetail = shift.pharmacyDetail;
            const location = [
              pharmacyDetail?.streetAddress,
              pharmacyDetail?.suburb,
              pharmacyDetail?.state,
              pharmacyDetail?.postcode,
            ]
              .filter(Boolean)
              .join(', ');
            const slots = shift.slots || [];
            const firstSlot = slots[0];
            const formatSlotDate = (slot: any) =>
              `${new Date(slot.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`;
            const formatTime = (time?: string | null) => (time ? time.slice(0, 5) : '');
            const summaryText = (() => {
              if (!slots.length) return shift.employmentType || 'No slots';
              const uniform =
                slots.every(s => s.startTime === firstSlot?.startTime && s.endTime === firstSlot?.endTime) &&
                firstSlot?.startTime &&
                firstSlot?.endTime;
              const baseLabel = firstSlot ? formatSlotDate(firstSlot) : '';
              const extra = slots.length > 1 ? ` + ${slots.length - 1} more` : '';
              const timeRange = uniform ? ` ${formatTime(firstSlot?.startTime)} - ${formatTime(firstSlot?.endTime)}` : '';
              return `${baseLabel}${timeRange}${extra}`.trim();
            })();
            const allowedKeys = new Set(shift.allowedEscalationLevels || []);
            if (!allowedKeys.size) {
              ESCALATION_LEVELS.forEach(level => allowedKeys.add(level.key));
            }
            const offers = counterOffersByShift[shift.id] || [];
              return (
                <Card
                  key={shift.id}
                  sx={{
                    boxShadow: '0 4px 12px 0 rgba(0,0,0,0.05)',
                    borderLeft: `4px solid ${cardBorderColor}`,
                  }}
                >
                  <CardHeader
                    disableTypography
                    title={
                      <Typography variant="h6" component="div" sx={{ fontWeight: 'bold' }}>
                        {shift.pharmacyDetail?.name ?? "Unnamed Pharmacy"}
                      </Typography>
                    }
                    subheader={
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                        <Chip
                          label={shift.roleNeeded}
                          size="small"
                          sx={{ backgroundColor: cardBorderColor, color: 'white', fontWeight: 500 }}
                        />
                        {shift.employmentType && (
                          <Chip label={shift.employmentType} size="small" variant="outlined" />
                        )}
                        {shift.isUrgent && <Chip label="Urgent" color="error" size="small" />}
                        {summaryText && (
                          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
                            <CalendarDays sx={{ fontSize: 16 }} />
                            <Typography variant="body2" color="text.secondary">
                              {summaryText}
                            </Typography>
                          </Box>
                        )}
                      </Stack>
                    }
                    action={
                      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                        <Tooltip title="Share">
                          <span>
                            <IconButton
                              size="small"
                              onClick={e => {
                                e.stopPropagation();
                                handleShare(shift);
                              }}
                              disabled={sharingShiftId === shift.id}
                            >
                              <Share2 fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Edit">
                          <IconButton
                            size="small"
                            onClick={e => {
                              e.stopPropagation();
                              handleEdit(shift.id);
                            }}
                          >
                            <Edit fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            onClick={e => {
                              e.stopPropagation();
                              handleDelete(shift.id);
                            }}
                            disabled={deleting[shift.id]}
                          >
                            <Trash2 fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <IconButton
                          size="small"
                          onClick={e => {
                            e.stopPropagation();
                            handleAccordionChange(shift)(e, !isExpanded);
                          }}
                        >
                          <ChevronDown
                            style={{
                              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 0.2s',
                            }}
                          />
                        </IconButton>
                      </Box>
                    }
                    sx={{ pb: isExpanded ? 1 : 2 }}
                  />
                  <CardContent sx={{ pt: 0 }}>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                        gap: 2,
                        mb: 2,
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                        color="text.secondary"
                      >
                        <Building sx={{ fontSize: 16 }} />
                        {location || 'Address not available'}
                      </Typography>
                    </Box>

                    {isExpanded && (
                      <>
                        {shift.description ? (
                          <Typography
                            variant="body2"
                            color="text.primary"
                            sx={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 1,
                              my: 2,
                              whiteSpace: 'pre-wrap',
                              bgcolor: '#F9FAFB',
                              p: 1.5,
                              borderRadius: 2,
                              border: '1px solid #E5E7EB',
                            }}
                          >
                            <Info sx={{ fontSize: 16, color: theme.palette.text.secondary, mt: '4px', flexShrink: 0 }} />
                            {shift.description}
                          </Typography>
                        ) : null}
                        <Box sx={{ width: '100%', my: 4 }}>
                          <Stepper alternativeLabel activeStep={currentLevelIdx} connector={<ColorStepConnector />}>
                            {levelSequence.map((level, index) => (
                              <Step key={level.key} completed={index < currentLevelIdx}>
                                {(() => {
                                  const levelSelectable =
                                    index <= currentLevelIdx || allowedKeys.has(level.key);
                                  return (
                                    <ButtonBase
                                      onClick={() =>
                                        levelSelectable ? handleLevelSelect(shift, level.key) : undefined
                                      }
                                      disabled={!levelSelectable}
                                      sx={{ width: '100%', pt: 2, borderRadius: 2, transition: 'background-color 0.3s' }}
                                    >
                                      <StepLabel
                                        StepIconComponent={props => <ColorStepIcon {...props} icon={level.icon} />}
                                        sx={{
                                          flexDirection: 'column',
                                          '& .MuiStepLabel-label': {
                                            mt: 1.5,
                                            fontWeight: 500,
                                            color:
                                              selectedLevelKey === level.key
                                                ? theme.palette.primary.main
                                                : theme.palette.text.secondary,
                                            ...(!levelSelectable && { color: theme.palette.text.disabled }),
                                          },
                                        }}
                                      >
                                        {level.label}
                                      </StepLabel>
                                    </ButtonBase>
                                  );
                                })()}
                              </Step>
                            ))}
                          </Stepper>
                        </Box>

                        {(() => {
                          const canEscalateToSelected =
                            selectedLevelIdx > currentLevelIdx &&
                            selectedLevelIdx !== -1 &&
                            allowedKeys.has(levelSequence[selectedLevelIdx]?.key as EscalationLevelKey);

                          if (escalating[shift.id]) {
                            return (
                              <Box
                                sx={{
                                  py: 2,
                                  textAlign: 'center',
                                  bgcolor: '#F9FAFB',
                                  borderRadius: 2,
                                  border: '1px dashed #E5E7EB',
                                }}
                              >
                                <CircularProgress size={20} sx={{ mr: 1 }} />
                                Escalating...
                              </Box>
                            );
                          }

                          if (canEscalateToSelected) {
                            const targetLevel = levelSequence[selectedLevelIdx];
                            return (
                              <Box
                                sx={{
                                  py: 2,
                                  textAlign: 'center',
                                  bgcolor: '#F9FAFB',
                                  borderRadius: 2,
                                  border: '1px dashed #E5E7EB',
                                }}
                              >
                                <Typography color="text.secondary" sx={{ mb: 1.5 }}>
                                  Ready to widen your search?
                                </Typography>
                                <Button variant="contained" onClick={() => handleEscalate(shift, targetLevel.key)}>
                                  Escalate to {targetLevel.label}
                                </Button>
                              </Box>
                            );
                          }

                          const nextLevel = levelSequence[currentLevelIdx + 1];
                          if (nextLevel && allowedKeys.has(nextLevel.key)) {
                            return (
                              <Box
                                sx={{
                                  py: 2,
                                  textAlign: 'center',
                                  bgcolor: '#F9FAFB',
                                  borderRadius: 2,
                                  border: '1px dashed #E5E7EB',
                                }}
                              >
                                <Typography color="text.secondary" sx={{ mb: 1.5 }}>
                                  Ready to widen your search?
                                </Typography>
                                <Button variant="contained" onClick={() => handleEscalate(shift, nextLevel.key)}>
                                  Escalate to {nextLevel.label}
                                </Button>
                              </Box>
                            );
                          }

                          return null;
                        })()}

                        <Divider sx={{ my: 3 }}>
                          <Chip label={`Candidates for ${levelSequence.find(l => l.key === selectedLevelKey)?.label}`} />
                        </Divider>

                        {(() => {
                          const renderSlotSelector = (slots: Shift['slots'], selectedId: number | null) => {
                            if (!slots?.length || shift.singleUserOnly) return null;
                            const formatLabel = (slot: any) =>
                              `${formatSlotDate(slot)} (${formatTime(slot.startTime)} - ${formatTime(slot.endTime)})`;
                            const currentIdx = slots.findIndex(s => s.id === selectedId);
                            const prevId = slots[Math.max(0, currentIdx - 1)]?.id ?? slots[0]?.id ?? null;
                            const nextId = slots[Math.min(slots.length - 1, currentIdx + 1)]?.id ?? slots[slots.length - 1]?.id ?? null;
                            return (
                              <Stack
                                direction="row"
                                alignItems="center"
                                spacing={1}
                                justifyContent="center"
                                sx={{ mb: 2 }}
                              >
                                <IconButton
                                  size="small"
                                  onClick={() => handleSlotSelect(shift.id, prevId)}
                                  disabled={selectedId === prevId}
                                >
                                  <ChevronLeft />
                                </IconButton>
                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 1,
                                    overflowX: 'auto',
                                    px: 1,
                                    scrollBehavior: 'smooth',
                                    '&::-webkit-scrollbar': { display: 'none' },
                                  }}
                                >
                                  {slots.map(slot => (
                                    <Button
                                      key={slot.id}
                                      variant={slot.id === selectedId ? 'contained' : 'outlined'}
                                      size="small"
                                      onClick={() => handleSlotSelect(shift.id, slot.id!)}
                                    >
                                      {formatLabel(slot)}
                                    </Button>
                                  ))}
                                </Box>
                                <IconButton
                                  size="small"
                                  onClick={() => handleSlotSelect(shift.id, nextId)}
                                  disabled={selectedId === nextId}
                                >
                                  <ChevronRight />
                                </IconButton>
                              </Stack>
                            );
                          };

                          const tabKey = getTabKey(shift.id, selectedLevelKey);
                          const currentTabData = tabData[tabKey];

                          if (!currentTabData || currentTabData.loading) {
                            return (
                              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                <CircularProgress />
                              </Box>
                            );
                          }

                          // Special handling for Platform level to show aggregated previous levels + new interests
                          if (selectedLevelKey === PUBLIC_LEVEL_KEY) {
                            const interestsBySlot = currentTabData.interestsBySlot || {};
                            const interestsAll = currentTabData.interestsAll || [];
                            const rejectionsBySlot = currentTabData.rejectionsBySlot || {};
                            const slots = shift.slots || [];
                            const multiSlots = !shift.singleUserOnly && slots.length > 0;
                            const selectedSlotId =
                              multiSlots ? (selectedSlotByShift[shift.id] ?? slots[0]?.id ?? null) : null;
                          const offerUserIds = new Set(
                            (offers || [])
                              .map((o: any) => o?.user)
                              .filter((id: any) => id != null)
                          );
                            const slotInterestsRaw = selectedSlotId
                              ? interestsBySlot[selectedSlotId] || []
                              : interestsAll;
                            const slotInterests = slotInterestsRaw.filter((interest: any) => {
                              const uid = interest.userId ?? interest.user?.id ?? null;
                              return uid == null || !offerUserIds.has(uid);
                            });
                            const slotRejections = selectedSlotId
                              ? rejectionsBySlot[selectedSlotId] || []
                              : [];
                            const slotAssignments = (shift.slotAssignments || []).filter(
                              a => selectedSlotId ? a.slotId === selectedSlotId : true
                            );
                          const offersForView = renderOfferList(
                            offers,
                            multiSlots ? selectedSlotId : null,
                            (offer) => handleOfferOpen(shift, offer, currentTabData, selectedSlotId),
                            (offer) => {
                              const interest = findInterestForOffer(offer, currentTabData, selectedSlotId);
                              return interest && interest.revealed ? 'Review offer' : 'Reveal offer';
                            },
                            (offer) => {
                              const interest = findInterestForOffer(offer, currentTabData, selectedSlotId);
                              if (interest && interest.revealed) {
                                return getInterestDisplayName(interest, interest.user || interest.user_detail);
                              }
                              const userObj = offer.userDetail || offer.user_detail || (typeof offer.user === 'object' ? offer.user : null);
                              if (userObj) return getUserDisplayName(userObj) || 'Offer';
                              return 'Anonymous offer';
                            }
                          );
                            const hasOfferContent = Array.isArray(offers) && offers.length > 0;
                            const hasInterestContent =
                              (!multiSlots && interestsAll.length > 0) ||
                              (multiSlots && (slotInterests.length > 0 || slotRejections.length > 0 || slotAssignments.length > 0));

                            return (
                              <>
                                {multiSlots && renderSlotSelector(slots, selectedSlotId)}

                                {(!hasOfferContent && !hasInterestContent) ? (
                                  <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                                    No public interest yet.
                                  </Typography>
                                ) : (
                                  <Stack spacing={2} mt={1}>
                                    <Paper variant="outlined" sx={{ p: 2 }}>
                                      <Typography variant="subtitle2">Counter offers</Typography>
                                      {offersForView}
                                    </Paper>
                                    {slotAssignments.length > 0 && (
                                      <Paper variant="outlined" sx={{ p: 2 }}>
                                        <Typography variant="subtitle2">Assigned</Typography>
                                        {slotAssignments.map(assign => (
                                          <Typography key={assign.userId} variant="body2">
                                            User #{assign.userId}
                                          </Typography>
                                        ))}
                                      </Paper>
                                    )}
                                    {slotInterests.length > 0 && (
                                      <Paper variant="outlined" sx={{ p: 2 }}>
                                        <Typography variant="subtitle2">Interested</Typography>
                                    {slotInterests.map(interest => (
                                      <Box key={interest.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1, pt: 1, borderTop: '1px solid #eee' }}>
                                        <Typography variant="body2">
                                          {interest.revealed
                                            ? getInterestDisplayName(interest)
                                            : 'Anonymous Interest User'}
                                        </Typography>
                                        <Button
                                          size="small"
                                          variant={interest.revealed ? 'outlined' : 'contained'}
                                          onClick={() => handleRevealPlatform(shift, interest)}
                                          disabled={revealingInterestId === interest.id || assigning}
                                              startIcon={
                                                revealingInterestId === interest.id ? (
                                                  <CircularProgress size={16} color="inherit" />
                                                ) : undefined
                                              }
                                            >
                                              {interest.revealed ? 'Review' : 'Reveal'}
                                            </Button>
                                          </Box>
                                        ))}
                                      </Paper>
                                    )}
                                    {slotRejections.length > 0 && (
                                      <Paper variant="outlined" sx={{ p: 2 }}>
                                        <Typography variant="subtitle2">Rejected</Typography>
                                        {slotRejections.map(rej => (
                                          <Typography key={rej.id} variant="body2" sx={{ mt: 1, pt: 1, borderTop: '1px solid #eee' }}>
                                            {rej.user}
                                          </Typography>
                                        ))}
                                      </Paper>
                                    )}
                                  </Stack>
                                )}
                              </>
                            );
                          }

                          const members = dedupeMembers(Object.values(currentTabData.membersBySlot || {}).flat());
                          const slots = shift.slots || [];
                          const multiSlots = !shift.singleUserOnly && slots.length > 0;
                          const selectedSlotId =
                            multiSlots ? (selectedSlotByShift[shift.id] ?? slots[0]?.id ?? null) : null;
                          const slotMembers = multiSlots
                            ? dedupeMembers(currentTabData.membersBySlot?.[selectedSlotId ?? -1] || [])
                            : members;
                          const slotSelector = multiSlots ? renderSlotSelector(slots, selectedSlotId) : null;
                          const interested = slotMembers.filter(m => m.status === 'interested');
                          const assigned = slotMembers.filter(m => m.status === 'accepted');
                          const rejected = slotMembers.filter(m => m.status === 'rejected');
                          const noResponse = slotMembers.filter(m => m.status === 'no_response');
                          const offersForView = renderOfferList(
                            offers,
                            multiSlots ? selectedSlotId : null,
                            (offer) => setReviewOfferDialog({ open: true, offer: { ...offer, _mappedSlots: mapOfferSlotsWithShift(offer, shift, selectedSlotId) }, candidate: null, slotId: selectedSlotId })
                          );
                          const hasMembers = slotMembers.length > 0;
                          const getOfferForMember = (member: ShiftMemberStatus) =>
                            findOfferForMemberInShift(offers, member, selectedSlotId);

                          return (
                            <Stack spacing={2}>
                              {slotSelector}
                              <Paper variant="outlined" sx={{ p: 2 }}>
                                <Typography variant="subtitle2">
                                  Counter offers {shift.singleUserOnly ? '(whole shift)' : '(selected slot)'}
                                </Typography>
                                {offersForView}
                              </Paper>
                              {hasMembers ? (
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 2 }}>
                                  {renderStatusCard('Interested', interested, <UserCheck />, 'success', shift.id, getOfferForMember)}
                                  {renderStatusCard('Assigned', assigned, <Check />, 'info', shift.id, getOfferForMember)}
                                  {renderStatusCard('Rejected', rejected, <UserX />, 'error', shift.id, getOfferForMember)}
                                  {renderStatusCard('No Response', noResponse, <Clock />, 'warning', shift.id, getOfferForMember)}
                                </Box>
                              ) : (
                                <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                                  No candidates found for this level.
                                </Typography>
                              )}
                            </Stack>
                          );
                        })()}
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        )}

        <Snackbar
          open={snackbar.open}
          autoHideDuration={3500}
          onClose={closeSnackbar}
          message={snackbar.message}
          action={
            <IconButton size="small" color="inherit" onClick={closeSnackbar}>
              <X fontSize="small" />
            </IconButton>
          }
        />

        <Dialog
          open={reviewCandidateDialog.open}
          onClose={() => {
            setReviewCandidateDialog({ open: false, candidate: null, shiftId: null, counterOffer: null, slotId: null });
            resetWorkerRatings();
          }}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle sx={{ fontWeight: 'bold' }}>Review Candidate</DialogTitle>
          <DialogContent>
            {reviewCandidateDialog.candidate && !loadingWorkerRatings ? (
              <Box>
                <Typography variant="h6">{reviewCandidateDialog.candidate.name}</Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {reviewCandidateDialog.candidate.employmentType}
                </Typography>
                {reviewCandidateDialog.counterOffer && (
                  <Box sx={{ mt: 2 }}>
                    <Divider sx={{ mb: 1 }} />
                    <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                      Counter Offer
                    </Typography>
                    <Stack spacing={1}>
                      {mapOfferSlotsWithShift(
                        reviewCandidateDialog.counterOffer,
                        shifts.find(s => s.id === reviewCandidateDialog.shiftId),
                        reviewCandidateDialog.slotId
                      ).map((slot: any) => (
                        <Paper
                          key={`${slot.slotId ?? slot.id ?? ''}-${slot.slotDate ?? slot.slot?.date ?? slot.date ?? ''}`}
                          variant="outlined"
                          sx={{ p: 1.5, borderRadius: 2 }}
                        >
                          <Typography variant="body2" fontWeight="bold">
                            {slot.slotDate ?? slot.slot?.date ?? slot.date
                              ? new Date(slot.slotDate ?? slot.slot?.date ?? slot.date!).toLocaleDateString()
                              : 'Shift-wide'}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {(slot.proposedStartTime ?? slot.proposed_start_time ?? slot.startTime ?? slot.start_time)?.slice(0, 5)} -{' '}
                            {(slot.proposedEndTime ?? slot.proposed_end_time ?? slot.endTime ?? slot.end_time)?.slice(0, 5)}
                          </Typography>
                          {slot.proposedRate != null && (
                            <Typography variant="body2" color="text.secondary">
                              Proposed rate: {slot.proposedRate}
                            </Typography>
                          )}
                        </Paper>
                      ))}
                      {reviewCandidateDialog.counterOffer.requestTravel && <Chip size="small" color="info" label="Requested travel support" />}
                      {reviewCandidateDialog.counterOffer.message && (
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                          {reviewCandidateDialog.counterOffer.message}
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                )}
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                  Ratings & Reviews
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  {workerRatingSummary ? (
                    <>
                      <Rating value={workerRatingSummary.average} precision={0.5} readOnly />
                      <Typography variant="body1" color="text.secondary">
                        {workerRatingSummary.average.toFixed(1)} ({workerRatingSummary.count} reviews)
                      </Typography>
                    </>
                  ) : (
                    <Skeleton variant="rectangular" width={200} height={28} />
                  )}
                </Box>
                <Box sx={{ display: 'grid', gap: 1.5, mt: 2 }}>
                  {workerRatingComments.map(comment => (
                    <Paper key={comment.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'background.default' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Rating value={comment.stars} readOnly size="small" />
                        {comment.createdAt && (
                          <Typography variant="caption" color="text.secondary">
                            {new Date(comment.createdAt).toLocaleDateString()}
                          </Typography>
                        )}
                      </Box>
                      {comment.comment && (
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          {comment.comment}
                        </Typography>
                      )}
                    </Paper>
                  ))}
                  {workerRatingComments.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      No reviews yet.
                    </Typography>
                  )}
                  {workerCommentsPageCount > 1 && (
                    <Box display="flex" justifyContent="center" mt={1}>
                      <Pagination
                        count={workerCommentsPageCount}
                        page={workerCommentsPage}
                        onChange={handleWorkerCommentsPageChange}
                        color="primary"
                        size="small"
                      />
                    </Box>
                  )}
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ p: '16px 24px' }}>
            <Button
              onClick={() => {
                setReviewCandidateDialog({ open: false, candidate: null, shiftId: null, counterOffer: null, slotId: null });
                resetWorkerRatings();
              }}
            >
              Close
            </Button>
            {reviewCandidateDialog.candidate && reviewCandidateDialog.shiftId && (
              <Button
                variant="contained"
                color="success"
                onClick={() => handleAssign(reviewCandidateDialog.shiftId!, reviewCandidateDialog.candidate!.userId, null)}
                disabled={assigning}
                startIcon={assigning ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                Assign to Shift
              </Button>
            )}
          </DialogActions>
        </Dialog>

        <Dialog
          open={platformInterestDialog.open}
          onClose={() => {
            setPlatformInterestDialog({ open: false, user: null, shiftId: null, interest: null, counterOffer: null });
            resetWorkerRatings();
          }}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle sx={{ fontWeight: 'bold' }}>Review Candidate</DialogTitle>
          <DialogContent>
            {platformInterestDialog.user && !loadingWorkerRatings ? (
              <Box>
                <Typography variant="h6">
                  {getUserDisplayName(platformInterestDialog.user) || 'Candidate'}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {platformInterestDialog.user.email}
                </Typography>
                {platformInterestDialog.user.phoneNumber && (
                  <Typography variant="body2" color="text.secondary">
                    {platformInterestDialog.user.phoneNumber}
                  </Typography>
                )}
                {platformInterestDialog.user.shortBio && (
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    {platformInterestDialog.user.shortBio}
                  </Typography>
                )}
                {platformInterestDialog.counterOffer && (
                  <Box sx={{ mt: 2 }}>
                    <Divider sx={{ mb: 1 }} />
                    <Typography variant="subtitle1" fontWeight="bold">
                      Counter Offer
                    </Typography>
                    <Stack spacing={1} sx={{ mt: 1 }}>
                      {mapOfferSlotsWithShift(
                        platformInterestDialog.counterOffer,
                        shifts.find(s => s.id === platformInterestDialog.shiftId),
                        platformInterestDialog.interest?.slotId ?? null
                      ).map((slot: any) => (
                        <Paper
                          key={`${slot.id ?? ''}-${slot.date ?? ''}`}
                          variant="outlined"
                          sx={{ p: 1.5, borderRadius: 2 }}
                        >
                          <Typography variant="body2" fontWeight="bold">
                            {slot.date
                              ? new Date(slot.date).toLocaleDateString()
                              : 'Shift-wide'}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {(slot.proposedStart ?? slot.proposedStartTime ?? slot.proposed_start_time ?? slot.startTime ?? slot.start_time)?.slice(0, 5)} -{' '}
                            {(slot.proposedEnd ?? slot.proposedEndTime ?? slot.proposed_end_time ?? slot.endTime ?? slot.end_time)?.slice(0, 5)}
                          </Typography>
                          {slot.proposedRate != null ? (
                            <Typography variant="body2" color="text.secondary">
                              Proposed rate: {slot.proposedRate}
                            </Typography>
                          ) : null}
                        </Paper>
                      ))}
                      {platformInterestDialog.counterOffer.requestTravel && (
                        <Chip size="small" color="info" label="Requested travel support" />
                      )}
                      {platformInterestDialog.counterOffer.message && (
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                          {platformInterestDialog.counterOffer.message}
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                )}
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                  Ratings & Reviews
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  {workerRatingSummary ? (
                    <>
                      <Rating value={workerRatingSummary.average} precision={0.5} readOnly />
                      <Typography variant="body1" color="text.secondary">
                        {workerRatingSummary.average.toFixed(1)} ({workerRatingSummary.count} reviews)
                      </Typography>
                    </>
                  ) : (
                    <Skeleton variant="rectangular" width={200} height={28} />
                  )}
                </Box>
                <Box sx={{ display: 'grid', gap: 1.5, mt: 2 }}>
                  {workerRatingComments.map(comment => (
                    <Paper key={comment.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'background.default' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Rating value={comment.stars} readOnly size="small" />
                        {comment.createdAt && (
                          <Typography variant="caption" color="text.secondary">
                            {new Date(comment.createdAt).toLocaleDateString()}
                          </Typography>
                        )}
                      </Box>
                      {comment.comment && (
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          {comment.comment}
                        </Typography>
                      )}
                    </Paper>
                  ))}
                  {workerRatingComments.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      No reviews yet.
                    </Typography>
                  )}
                  {workerCommentsPageCount > 1 && (
                    <Box display="flex" justifyContent="center" mt={1}>
                      <Pagination
                        count={workerCommentsPageCount}
                        page={workerCommentsPage}
                        onChange={handleWorkerCommentsPageChange}
                        color="primary"
                        size="small"
                      />
                    </Box>
                  )}
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ p: '16px 24px' }}>
            <Button
              onClick={() => {
                setPlatformInterestDialog({ open: false, user: null, shiftId: null, interest: null, counterOffer: null });
                resetWorkerRatings();
              }}
            >
              Close
            </Button>
            {platformInterestDialog.user && (
              <Button
                variant="contained"
                color="success"
                onClick={handleAssignPlatform}
                disabled={assigning}
                startIcon={assigning ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                Assign to Shift
              </Button>
            )}
          </DialogActions>
        </Dialog>

        <Dialog
          open={reviewOfferDialog.open}
          onClose={() => setReviewOfferDialog({ open: false, offer: null, candidate: null, slotId: null })}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle sx={{ fontWeight: 'bold' }}>Counter Offer</DialogTitle>
          <DialogContent dividers>
            {reviewOfferDialog.offer ? (
              <Stack spacing={1.5}>
                {reviewOfferDialog.candidate && (
                  <Box sx={{ mb: 1 }}>
                    <Typography variant="subtitle2">Candidate</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {reviewOfferDialog.candidate.name || 'Candidate'}
                    </Typography>
                    {reviewOfferDialog.candidate.email && (
                      <Typography variant="body2" color="text.secondary">
                        {reviewOfferDialog.candidate.email}
                      </Typography>
                    )}
                    {reviewOfferDialog.candidate.shortBio && (
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {reviewOfferDialog.candidate.shortBio}
                      </Typography>
                    )}
                  </Box>
                )}
                {reviewOfferDialog.offer.message && (
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {reviewOfferDialog.offer.message}
                  </Typography>
                )}
                <Divider sx={{ my: 1 }} />
                {(() => {
                  const rawSlots = reviewOfferDialog.offer._mappedSlots || reviewOfferDialog.offer.slots || [];
                  const filterId = reviewOfferDialog.slotId;
                  const visible = filterId == null
                    ? rawSlots
                    : rawSlots.filter((s: any) => (s.slotId ?? s.slot_id ?? s.slot?.id ?? s.id) === filterId);
                  return visible.length ? visible : rawSlots;
                })().map((slot: any, idx: number) => (
                  <Paper
                    key={`${slot.slotId ?? slot.id ?? idx}-${slot.slotDate ?? slot.slot?.date ?? slot.date ?? idx}`}
                    variant="outlined"
                    sx={{ p: 1.5, borderRadius: 2 }}
                  >
                    <Typography variant="body2" fontWeight="bold">
                      {slot.date || slot.slotDate || slot.slot?.date
                        ? new Date(slot.date || slot.slotDate || slot.slot?.date!).toLocaleDateString()
                        : 'Shift-wide'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {(slot.proposedStart ?? slot.proposedStartTime ?? slot.proposed_start_time ?? slot.startTime ?? slot.start_time)?.slice(0, 5)} -{' '}
                      {(slot.proposedEnd ?? slot.proposedEndTime ?? slot.proposed_end_time ?? slot.endTime ?? slot.end_time)?.slice(0, 5)}
                    </Typography>
                    {slot.proposedRate != null ? (
                      <Typography variant="body2" color="text.secondary">
                        Proposed rate: {slot.proposedRate}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Proposed rate: N/A
                      </Typography>
                    )}
                  </Paper>
                ))}
                {reviewOfferDialog.offer.requestTravel && <Chip size="small" color="info" label="Requested travel support" />}
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                  Ratings & Reviews
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  {workerRatingSummary ? (
                    <>
                      <Rating value={workerRatingSummary.average} precision={0.5} readOnly />
                      <Typography variant="body1" color="text.secondary">
                        {workerRatingSummary.average.toFixed(1)} ({workerRatingSummary.count} reviews)
                      </Typography>
                    </>
                  ) : (
                    <Skeleton variant="rectangular" width={200} height={28} />
                  )}
                </Box>
                <Box sx={{ display: 'grid', gap: 1.5, mt: 2 }}>
                  {workerRatingComments.map(comment => (
                    <Paper key={comment.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'background.default' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Rating value={comment.stars} readOnly size="small" />
                        {comment.createdAt && (
                          <Typography variant="caption" color="text.secondary">
                            {new Date(comment.createdAt).toLocaleDateString()}
                          </Typography>
                        )}
                      </Box>
                      {comment.comment && (
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          {comment.comment}
                        </Typography>
                      )}
                    </Paper>
                  ))}
                  {workerRatingComments.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      No reviews yet.
                    </Typography>
                  )}
                  {workerCommentsPageCount > 1 && (
                    <Box display="flex" justifyContent="center" mt={1}>
                      <Pagination
                        count={workerCommentsPageCount}
                        page={workerCommentsPage}
                        onChange={handleWorkerCommentsPageChange}
                        color="primary"
                        size="small"
                      />
                    </Box>
                  )}
                </Box>
              </Stack>
            ) : (
              <Typography color="text.secondary">No offer selected.</Typography>
            )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewOfferDialog({ open: false, offer: null, candidate: null, slotId: null })}>Close</Button>
          {reviewOfferDialog.offer && (
            <>
              <Button
                variant="contained"
                color="success"
                onClick={() => reviewOfferDialog.offer && handleAcceptOffer(reviewOfferDialog.offer)}
                disabled={counterActionLoading === reviewOfferDialog.offer.id}
                startIcon={counterActionLoading === reviewOfferDialog.offer.id ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                Accept offer
              </Button>
              <Button
                variant="outlined"
                color="error"
                onClick={() => reviewOfferDialog.offer && handleRejectOffer(reviewOfferDialog.offer)}
                disabled={counterActionLoading === reviewOfferDialog.offer.id}
              >
                Reject offer
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

        <Dialog open={openDeleteConfirm} onClose={() => setOpenDeleteConfirm(false)}>
          <DialogTitle>Confirm Delete</DialogTitle>
          <DialogContent>
            <Typography>Are you sure you want to cancel/delete this shift? This action cannot be undone.</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDeleteConfirm(false)}>Cancel</Button>
            <Button
              onClick={confirmDelete}
              color="error"
              variant="contained"
              disabled={shiftToDelete !== null && deleting[shiftToDelete]}
            >
              {shiftToDelete !== null && deleting[shiftToDelete] ? <CircularProgress size={24} /> : 'Delete'}
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </ThemeProvider>
  );
};

export default ActiveShiftsPage;









