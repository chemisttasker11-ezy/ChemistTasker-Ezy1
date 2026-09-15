import { useEffect, useState, useCallback, useMemo } from 'react';
import { Typography, Snackbar, Alert, Box, Paper, Stack, Tabs, Tab, alpha, useTheme } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import ShiftsBoard from './ShiftsBoard';
import {
  Shift,
  ShiftCounterOfferPayload,
  ShiftInterest,
  ShiftOffer,
  deleteSavedShift,
  fetchShiftOffersService,
  expressInterestInPublicShiftService,
  fetchPublicShifts,
  fetchSavedShifts,
  fetchShiftInterests,
  acceptShiftOfferService,
  declineShiftOfferService,
  saveShift,
  PaginatedResponse,
  getOnboardingDetail,
} from '@chemisttasker/shared-core';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { submitCounterOfferDirect } from './ShiftsBoard/utils/submitCounterOffer';

type FilterConfig = {
  city: string[];
  roles: string[];
  employmentTypes: string[];
  minRate: number;
  search: string;
  timeOfDay: Array<'morning' | 'afternoon' | 'evening'>;
  dateRange: { start: string; end: string };
  onlyUrgent: boolean;
  negotiableOnly: boolean;
  flexibleOnly: boolean;
  travelProvided: boolean;
  accommodationProvided: boolean;
  bulkShiftsOnly: boolean;
};

type PublicShiftsPageProps = {
  activeTabOverride?: 'browse' | 'saved' | 'interested' | 'rejected' | 'accepted';
  onActiveTabChange?: (tab: 'browse' | 'saved' | 'interested' | 'rejected' | 'accepted') => void;
  hideTabs?: boolean;
};

const DEFAULT_FILTERS: FilterConfig = {
  city: [],
  roles: [],
  employmentTypes: [],
  minRate: 0,
  search: '',
  timeOfDay: [],
  dateRange: { start: '', end: '' },
  onlyUrgent: false,
  negotiableOnly: false,
  flexibleOnly: false,
  travelProvided: false,
  accommodationProvided: false,
  bulkShiftsOnly: false,
};

export default function PublicShiftsPage({
  activeTabOverride,
  onActiveTabChange,
  hideTabs,
}: PublicShiftsPageProps = {}) {
  const auth = useAuth();
  const user = auth?.user;
  if (!user) return null;
  const { workspace } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const queryTab = useMemo(() => new URLSearchParams(location.search).get('tab'), [location.search]);
  const coerceVerified = (value: any) => {
    if (value === true || value === 'true' || value === 'True') return true;
    if (value === 1 || value === '1') return true;
    return false;
  };
  const initialVerified =
    coerceVerified((user as any)?.verified) ||
    coerceVerified((user as any)?.pharmacist_profile?.verified) ||
    coerceVerified((user as any)?.other_staff_profile?.verified);
  const [isVerified, setIsVerified] = useState<boolean>(initialVerified);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorOpen, setErrorOpen] = useState(false);
  const [appliedShiftIds, setAppliedShiftIds] = useState<number[]>([]);
  const [appliedSlotIds, setAppliedSlotIds] = useState<number[]>([]);
  const [filters, setFilters] = useState<FilterConfig>(DEFAULT_FILTERS);
  const [debouncedFilters, setDebouncedFilters] = useState<FilterConfig>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);
  const [savedShiftIds, setSavedShiftIds] = useState<Set<number>>(new Set());
  const [savedMap, setSavedMap] = useState<Map<number, number>>(new Map()); // shiftId -> savedId
  const [boardTab, setBoardTab] = useState<'browse' | 'saved' | 'interested' | 'rejected' | 'accepted'>(
    activeTabOverride ?? 'browse'
  );
  const [offers, setOffers] = useState<ShiftOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);

  useEffect(() => {
    if (activeTabOverride) {
      setBoardTab(activeTabOverride);
    }
  }, [activeTabOverride]);

  useEffect(() => {
    if (activeTabOverride) return;
    if (queryTab === 'accepted') {
      setBoardTab('accepted');
    }
  }, [activeTabOverride, queryTab]);

  const showError = (message: string) => {
    setError(message && message.trim().length > 0 ? message : 'Something went wrong. Please try again.');
    setErrorOpen(true);
  };
  const errorMessage = (err: unknown, fallback: string) =>
    err instanceof Error && err.message.trim().length > 0 ? err.message : fallback;

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'PHARMACIST' && user.role !== 'OTHER_STAFF') return;
    const isPlatform = workspace === 'platform';
    const isOnPublic =
      location.pathname.includes('/dashboard/pharmacist/shifts/public') ||
      location.pathname.includes('/dashboard/otherstaff/shifts/public');
    if (!isPlatform && isOnPublic) {
      const target = location.pathname.includes('/dashboard/pharmacist')
        ? '/dashboard/pharmacist/shifts/community'
        : '/dashboard/otherstaff/shifts/community';
      navigate(target, { replace: true });
    }
  }, [workspace, location.pathname, navigate, user]);

  const heroGradient = useMemo(
    () =>
      `linear-gradient(135deg, ${alpha(
        theme.palette.primary.main,
        0.94
      )}, ${alpha(theme.palette.primary.dark, 0.74)})`,
    [theme.palette.primary.dark, theme.palette.primary.main]
  );

  const loadSaved = useCallback(async () => {
    try {
      const saved = await fetchSavedShifts();
      const ids = new Set<number>();
      const map = new Map<number, number>();
      saved.forEach((entry: any) => {
        if (typeof entry.shift === 'number') {
          ids.add(entry.shift);
          if (entry.id) {
            map.set(entry.shift, entry.id);
          }
        }
      });
      setSavedShiftIds(ids);
      setSavedMap(map);
    } catch (err) {
      console.error('Failed to load saved shifts', err);
    }
  }, []);

  const loadShifts = useCallback(
    async (activeFilters: FilterConfig, activePage: number) => {
      setLoading(true);
      setError(null);
      try {
        const apiFilters = {
          search: activeFilters.search,
          roles: activeFilters.roles,
          employmentTypes: activeFilters.employmentTypes,
          city: activeFilters.city,
          state: [],
          minRate: activeFilters.minRate || undefined,
          onlyUrgent: activeFilters.onlyUrgent || undefined,
          negotiableOnly: activeFilters.negotiableOnly || undefined,
          flexibleOnly: activeFilters.flexibleOnly || undefined,
          travelProvided: activeFilters.travelProvided || undefined,
          accommodationProvided: activeFilters.accommodationProvided || undefined,
          bulkShiftsOnly: activeFilters.bulkShiftsOnly || undefined,
          timeOfDay: activeFilters.timeOfDay,
          startDate: activeFilters.dateRange.start || undefined,
          endDate: activeFilters.dateRange.end || undefined,
          page: activePage,
          pageSize,
        };

        const [publicShifts, interests] = await Promise.all([
          fetchPublicShifts(apiFilters) as Promise<PaginatedResponse<Shift>>,
          fetchShiftInterests({ userId: user.id }),
        ]);

        const available = (publicShifts.results ?? []).filter((shift: Shift) => {
          const slots = shift.slots ?? [];
          if (slots.length === 0) return true;
          const assignedSlotCount = shift.slotAssignments?.length ?? 0;
          return assignedSlotCount < slots.length;
        });

        setShifts(available);
        setTotalCount(publicShifts.count);

        const nextShiftIds = new Set<number>();
        const nextSlotIds = new Set<number>();
        interests.forEach((interest: ShiftInterest) => {
          if (interest.slotId != null) {
            nextSlotIds.add(interest.slotId);
          } else if (typeof interest.shift === 'number') {
            nextShiftIds.add(interest.shift);
          }
        });
        setAppliedShiftIds(Array.from(nextShiftIds));
        setAppliedSlotIds(Array.from(nextSlotIds));
      } catch (err) {
        console.error('Failed to load public shifts', err);
        showError('Failed to load public shifts.');
      } finally {
        setLoading(false);
      }
    },
    [user.id]
  );

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  // Fetch onboarding verification status to avoid false negatives
  useEffect(() => {
    const fetchVerification = async () => {
      try {
        const roleKey =
          user.role === 'PHARMACIST' ? 'pharmacist' :
          user.role === 'OTHER_STAFF' ? 'other_staff' :
          user.role === 'EXPLORER' ? 'explorer' :
          user.role === 'OWNER' ? 'owner' :
          null;
        if (!roleKey) return;
        const onboarding: any = await getOnboardingDetail(roleKey);
        const verifiedFlag =
          onboarding?.verified ??
          onboarding?.data?.verified ??
          (roleKey === 'pharmacist' ? onboarding?.ahpra_verified : undefined);
        setIsVerified(coerceVerified(verifiedFlag));
      } catch (err) {
        console.warn('Failed to fetch onboarding verification', err);
      }
    };
    fetchVerification();
  }, [user.role]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedFilters(filters), 350);
    return () => clearTimeout(handle);
  }, [filters]);

  useEffect(() => {
    loadShifts(debouncedFilters, page);
  }, [debouncedFilters, page, loadShifts]);

  const handleApplyAll = async (shift: Shift) => {
    if (!isVerified) {
      const msg = 'Your onboarding must be verified by admin before applying for public shifts.';
      showError(msg);
      throw new Error(msg);
    }
    try {
      const slots = shift.slots ?? [];
      if (shift.singleUserOnly || slots.length === 0) {
        await expressInterestInPublicShiftService({ shiftId: shift.id, slotId: null });
        setAppliedShiftIds((prev) => Array.from(new Set([...prev, shift.id])));
        return;
      }

      await expressInterestInPublicShiftService({ shiftId: shift.id, slotIds: slots.map((slot) => slot.id) } as any);
      setAppliedSlotIds((prev) => Array.from(new Set([...prev, ...slots.map((slot) => slot.id)])));
    } catch (err) {
      console.error('Failed to express interest', err);
      showError(errorMessage(err, 'Failed to express interest in this shift.'));
      throw err;
    }
  };

  const handleApplySlot = async (shift: Shift, slotId: number) => {
    if (!isVerified) {
      const msg = 'Your onboarding must be verified by admin before applying for public shifts.';
      showError(msg);
      throw new Error(msg);
    }
    try {
      await expressInterestInPublicShiftService({ shiftId: shift.id, slotId });
      setAppliedSlotIds((prev) => Array.from(new Set([...prev, slotId])));
    } catch (err) {
      console.error('Failed to express interest in slot', err);
      showError(errorMessage(err, 'Failed to express interest in this slot.'));
      throw err;
    }
  };

  const handleToggleSave = async (shiftId: number) => {
    const savedId = savedMap.get(shiftId);
    if (savedId) {
      try {
        await deleteSavedShift(savedId);
        const next = new Set(savedShiftIds);
        next.delete(shiftId);
        setSavedShiftIds(next);
        const nextMap = new Map(savedMap);
        nextMap.delete(shiftId);
        setSavedMap(nextMap);
      } catch (err) {
        console.error('Failed to unsave shift', err);
        showError('Failed to unsave this shift.');
      }
      return;
    }
    try {
      const created = await saveShift(shiftId);
      const next = new Set(savedShiftIds);
      next.add(shiftId);
      setSavedShiftIds(next);
      const nextMap = new Map(savedMap);
      if (created?.id) nextMap.set(shiftId, created.id);
      setSavedMap(nextMap);
    } catch (err) {
      console.error('Failed to save shift', err);
      showError('Failed to save this shift.');
    }
  };

  const handleFiltersChange = (nextFilters: FilterConfig) => {
    setFilters(nextFilters);
    setPage(1);
  };

  const handleSubmitCounterOffer = async (payload: ShiftCounterOfferPayload) => {
    if (!isVerified) {
      const msg = 'Your onboarding must be verified by admin before applying for public shifts.';
      throw new Error(msg);
    }
    try {
      await submitCounterOfferDirect(payload);
    } catch (err) {
      console.error('Failed to submit counter offer', err);
      throw new Error(errorMessage(err, 'Failed to submit counter offer.'));
    }
  };

  const handleCloseError = () => setErrorOpen(false);

  const handleBoardTabChange = (tab: 'browse' | 'saved' | 'interested' | 'rejected' | 'accepted') => {
    setBoardTab(tab);
    onActiveTabChange?.(tab);
  };

  const loadOffers = useCallback(async () => {
    setOffersLoading(true);
    try {
      const pending = await fetchShiftOffersService({ status: 'PENDING' });
      setOffers(pending as ShiftOffer[]);
    } catch (err) {
      console.error('Failed to load offers', err);
      showError('Failed to load offers.');
    } finally {
      setOffersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (boardTab === 'accepted') {
      loadOffers();
    }
  }, [boardTab, loadOffers]);

  const offersByShift = useMemo(() => {
    const map = new Map<number, ShiftOffer[]>();
    offers.forEach((offer) => {
      if (String(offer.status ?? '').toUpperCase() !== 'PENDING') return;
      const shift = offer.shiftDetail;
      if (!shift) return;
      const list = map.get(shift.id) ?? [];
      list.push(offer);
      map.set(shift.id, list);
    });
    return map;
  }, [offers]);

  const offerShifts = useMemo(() => {
    return Array.from(offersByShift.entries())
      .map(([, shiftOffers]) => {
        const shift = shiftOffers[0]?.shiftDetail as Shift | undefined;
        if (!shift) return null;

        const offerSlotIds = new Set<number>();
        const offerStatusBySlot: Record<number, string> = {};
        const shiftLevelOfferStatus = String(shiftOffers[0]?.status ?? '').toUpperCase();
        shiftOffers.forEach((offer) => {
          const raw = offer.slot ?? (offer as any).slotId ?? offer.slotDetail?.id ?? null;
          const n = Number(raw);
          if (!Number.isFinite(n)) return;
          offerSlotIds.add(n);
          offerStatusBySlot[n] = String(offer.status ?? '').toUpperCase();
        });

        if (offerSlotIds.size === 0) {
          return shift;
        }

        const slots = (shift.slots ?? []).filter((slot: any) => {
          const n = Number(slot?.id);
          return Number.isFinite(n) && offerSlotIds.has(n);
        });
        return ({
          ...shift,
          slots: slots.length > 0 ? slots : shift.slots,
          __offerStatusBySlot: offerStatusBySlot,
          __shiftOfferStatus: shiftLevelOfferStatus,
        } as Shift);
      })
      .filter(Boolean) as Shift[];
  }, [offersByShift]);

  const handleConfirmOfferShift = async (targetShift: Shift) => {
    const list = (offersByShift.get(targetShift.id) ?? []).filter(
      (offer) => String(offer.status ?? '').toUpperCase() === 'PENDING'
    );
    if (list.length === 0) return;
    await Promise.all(list.map((offer) => acceptShiftOfferService(offer.id)));
    await loadOffers();
  };

  const handleConfirmOfferSlot = async (targetShift: Shift, slotId: number) => {
    const offer = (offersByShift.get(targetShift.id) ?? []).find((item) => {
      const raw = item.slot ?? (item as any).slotId ?? item.slotDetail?.id ?? null;
      const offerSlotId = Number(raw);
      return Number.isFinite(offerSlotId)
        && offerSlotId === slotId
        && String(item.status ?? '').toUpperCase() === 'PENDING';
    });
    if (!offer) return;
    await acceptShiftOfferService(offer.id);
    await loadOffers();
  };

  const handleApplySlots = async (shift: Shift, slotIds: number[]) => {
    if (!isVerified) {
      const msg = 'Your onboarding must be verified by admin before applying for public shifts.';
      showError(msg);
      throw new Error(msg);
    }
    try {
      const uniqueSlotIds = Array.from(new Set(slotIds)).filter((slotId) => Number.isFinite(slotId));
      if (uniqueSlotIds.length === 0) return;
      await expressInterestInPublicShiftService({ shiftId: shift.id, slotIds: uniqueSlotIds } as any);
      setAppliedSlotIds((prev) => Array.from(new Set([...prev, ...uniqueSlotIds])));
    } catch (err) {
      console.error('Failed to express interest in slots', err);
      showError(errorMessage(err, 'Failed to express interest in the selected slots.'));
      throw err;
    }
  };

  const handleDeclineOfferShift = async (targetShift: Shift) => {
    const list = (offersByShift.get(targetShift.id) ?? []).filter(
      (offer) => String(offer.status ?? '').toUpperCase() === 'PENDING'
    );
    if (list.length === 0) return;
    await Promise.all(list.map((offer) => declineShiftOfferService(offer.id)));
    await loadOffers();
  };

  const renderContent = () => {
    if (boardTab === 'accepted') {
      return (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, md: 4 },
            borderRadius: 3,
            border: `1px dashed ${alpha(theme.palette.divider, 0.8)}`,
          }}
        >
          {offersLoading ? (
            <Typography color="text.secondary">Loading offers...</Typography>
          ) : offerShifts.length === 0 ? (
            <>
              <Typography variant="h6" gutterBottom>
                Offers
              </Typography>
              <Typography color="text.secondary">No offers yet.</Typography>
            </>
          ) : (
            <Stack spacing={2}>
              <ShiftsBoard
                title="Offers"
                shifts={offerShifts}
                loading={offersLoading}
                onApplyAll={handleConfirmOfferShift}
                onApplySlot={handleConfirmOfferSlot}
                onSubmitCounterOffer={handleSubmitCounterOffer}
                onRejectShift={handleDeclineOfferShift}
                onRejectSlot={undefined}
                enableSaved={false}
                hideSaveToggle
                hideFiltersAndSort
                hideTabs
                disableLocalPersistence
                applyLabel="Confirm"
                disableActionGuards
                actionDisabledGuard={(shift) =>
                  !(offersByShift.get(shift.id) ?? []).some(
                    (offer) => String(offer.status ?? '').toUpperCase() === 'PENDING'
                  )
                }
                onRefresh={loadOffers}
                fallbackToAllShiftsWhenEmpty
                showAllSlots
              />
            </Stack>
          )}
        </Paper>
      );
    }

    if (boardTab === 'browse' || boardTab === 'saved' || boardTab === 'interested' || boardTab === 'rejected') {
      const slotFilterMode =
        boardTab === 'interested' ? 'interested' : boardTab === 'rejected' ? 'rejected' : 'all';
      return (
        <ShiftsBoard
          title="Public Shifts"
          shifts={shifts}
          loading={loading}
          useServerFiltering
          filters={filters}
          onFiltersChange={handleFiltersChange}
          totalCount={totalCount}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          savedShiftIds={Array.from(savedShiftIds)}
          onToggleSave={handleToggleSave}
          onApplyAll={handleApplyAll}
          onApplySlot={handleApplySlot}
          onApplySlots={handleApplySlots}
          onSubmitCounterOffer={handleSubmitCounterOffer}
          initialAppliedShiftIds={appliedShiftIds}
          initialAppliedSlotIds={appliedSlotIds}
          hideTabs
          activeTabOverride={boardTab === 'saved' ? 'saved' : 'browse'}
          onActiveTabChange={(tab) => handleBoardTabChange(tab)}
          onRefresh={() => loadShifts(debouncedFilters, page)}
          disableLocalPersistence
          slotFilterMode={slotFilterMode}
        />
      );
    }
  };

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 1440,
        mx: 'auto',
        px: { xs: 1.5, md: 3.5 },
        py: { xs: 2, md: 4 },
        display: 'flex',
        flexDirection: 'column',
        gap: { xs: 2.5, md: 3 },
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: { xs: 3, md: 4 },
          borderRadius: { xs: 3, md: 4 },
          backgroundImage: heroGradient,
          color: '#fff',
          overflow: 'hidden',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={{ xs: 2, md: 3 }}
          alignItems={{ xs: 'flex-start', md: 'center' }}
          justifyContent="space-between"
        >
          <Box>
            <Typography variant="overline" sx={{ opacity: 0.72, letterSpacing: '.1em' }}>
              Shift Board
            </Typography>
            <Typography variant="h4" fontWeight={800} gutterBottom>
              Discover shifts at a glance
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.92, maxWidth: 560 }}>
              Browse open shifts, review your saved list, and track interested or rejected opportunities.
            </Typography>
          </Box>
        </Stack>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          borderRadius: { xs: 3, md: 4 },
          border: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
        }}
      >
        {!hideTabs && (
          <Tabs
            value={boardTab}
            onChange={(_, value) => handleBoardTabChange(value as any)}
            variant="scrollable"
            allowScrollButtonsMobile
            sx={{
              px: { xs: 1.5, md: 2.5 },
              pt: { xs: 1.5, md: 2 },
              '& .MuiTabs-flexContainer': {
                gap: { xs: 1, sm: 1.5 },
                justifyContent: { xs: 'flex-start', md: 'center' },
              },
              '& .MuiTabs-indicator': {
                display: 'none',
              },
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 700,
                fontSize: { xs: 14, sm: 16 },
                minHeight: 52,
                minWidth: 0,
                borderRadius: 999,
                px: { xs: 2.5, sm: 3.5 },
                py: { xs: 1, sm: 1.3 },
                color: alpha(theme.palette.text.primary, 0.72),
                border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
                transition: theme.transitions.create(['color', 'background-color', 'border-color', 'box-shadow']),
                '&.Mui-selected': {
                  color: theme.palette.primary.main,
                  backgroundColor: alpha(theme.palette.primary.main, 0.15),
                  borderColor: alpha(theme.palette.primary.main, 0.45),
                  boxShadow: `0 6px 16px ${alpha(theme.palette.primary.main, 0.18)}`,
                },
                '&:not(.Mui-selected):hover': {
                  backgroundColor: alpha(theme.palette.primary.main, 0.08),
                  borderColor: alpha(theme.palette.primary.main, 0.25),
                },
              },
            }}
          >
            <Tab value="browse" label="Browse" disableRipple />
            <Tab value="saved" label={`Saved (${savedShiftIds.size})`} disableRipple />
            <Tab value="interested" label="Interested" disableRipple />
            <Tab value="rejected" label="Rejected" disableRipple />
            <Tab value="accepted" label="Offers" disableRipple />
          </Tabs>
        )}
        <Box
          sx={{
            px: { xs: 1.5, md: 2.5 },
            pb: { xs: 2, md: 3 },
            pt: { xs: 2, md: 3 },
          }}
        >
          {renderContent()}
        </Box>
      </Paper>

      <Snackbar
        open={errorOpen}
        autoHideDuration={4000}
        onClose={handleCloseError}
        sx={{ zIndex: (theme) => theme.zIndex.modal + 2 }}
      >
        <Alert severity="error" onClose={handleCloseError} sx={{ width: '100%' }}>
          {error || 'Something went wrong. Please try again.'}
        </Alert>
      </Snackbar>
    </Box>
  );
}
