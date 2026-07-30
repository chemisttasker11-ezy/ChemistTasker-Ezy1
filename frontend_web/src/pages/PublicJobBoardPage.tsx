import { useEffect, useState, useCallback } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Typography,
} from '@mui/material';
import ShiftsBoard from './dashboard/sidebar/ShiftsBoard';
import PublicLogoTopBar from '../components/PublicLogoTopBar';
import {
  Shift,
  ShiftCounterOfferPayload,
  ShiftInterest,
  expressInterestInPublicShiftService,
  fetchShiftInterests,
  getOnboardingDetail,
  PaginatedResponse,
  getPublicJobBoard,
  submitShiftCounterOfferService,
} from '@chemisttasker/shared-core';
import AuthLayout from '../layouts/AuthLayout';
import { setCanonical, setPageMeta, setSocialMeta } from '../utils/seo';
import { useAuth } from '../contexts/AuthContext';

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

// Show all supported roles in the public filter, even when no shifts exist yet.
const PUBLIC_ROLE_OPTIONS = ['Pharmacist', 'Intern', 'Assistant', 'Technician', 'Student'];

const normalizeRoleForApi = (role: string) =>
  role
    ? role
        .toString()
        .trim()
        .replace(/\s+/g, '_')
        .toUpperCase()
    : '';

export default function PublicJobBoardPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorOpen, setErrorOpen] = useState(false);
  const [filters, setFilters] = useState<FilterConfig>(DEFAULT_FILTERS);
  const [debouncedFilters, setDebouncedFilters] = useState<FilterConfig>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [appliedShiftIds, setAppliedShiftIds] = useState<number[]>([]);
  const [appliedSlotIds, setAppliedSlotIds] = useState<number[]>([]);
  const [isVerified, setIsVerified] = useState(false);

  const coerceVerified = (value: any) => {
    if (value === true || value === 'true' || value === 'True') return true;
    if (value === 1 || value === '1') return true;
    return false;
  };

  useEffect(() => {
    const title = 'Public Job Board | ChemistTasker';
    const description = 'Browse public pharmacy shifts and apply on ChemistTasker.';
    const origin = window.location.origin;
    const baseUrl = `${origin}/shifts/public-board`;
    const org = searchParams.get('organization');
    const canonicalUrl = org ? `${baseUrl}?organization=${org}` : baseUrl;
    const image = `${origin}/images/ChatGPT Image Jan 18, 2026, 08_14_43 PM.png`;

    setPageMeta(title, description);
    setCanonical(canonicalUrl);
    setSocialMeta({
      title,
      description,
      url: canonicalUrl,
      image,
      type: 'website',
    });
  }, [searchParams]);

  const mapPublicShift = (raw: any): Shift => {
    const pharmacy = raw.pharmacy_detail || raw.pharmacyDetail || {};
    const slots = (raw.slots || []).map((slot: any) => ({
      ...slot,
      id: slot.id,
      date: slot.date ?? slot.slot_date ?? slot.slotDate,
      startTime: slot.start_time ?? slot.startTime ?? '',
      endTime: slot.end_time ?? slot.endTime ?? '',
      startHour: slot.start_hour ?? slot.startHour,
      rate: slot.rate,
    }));
    return {
      ...raw,
      roleLabel: raw.role_label ?? raw.roleLabel ?? raw.role_needed ?? raw.roleNeeded,
      roleNeeded: raw.role_needed ?? raw.roleNeeded,
      employmentType: raw.employment_type ?? raw.employmentType,
      rateType: raw.rate_type ?? raw.rateType,
      minHourlyRate: raw.min_hourly_rate ?? raw.minHourlyRate,
      maxHourlyRate: raw.max_hourly_rate ?? raw.maxHourlyRate,
      minAnnualSalary: raw.min_annual_salary ?? raw.minAnnualSalary,
      maxAnnualSalary: raw.max_annual_salary ?? raw.maxAnnualSalary,
      fixedRate: raw.fixed_rate ?? raw.fixedRate,
      superPercent: raw.super_percent ?? raw.superPercent,
      paymentPreference: raw.payment_preference ?? raw.paymentPreference,
      postAnonymously: raw.post_anonymously ?? raw.postAnonymously,
      slots,
      flexibleTiming: raw.flexible_timing ?? raw.flexibleTiming,
      singleUserOnly: raw.single_user_only ?? raw.singleUserOnly,
      workloadTags: raw.workload_tags ?? raw.workloadTags ?? [],
      mustHave: raw.must_have ?? raw.mustHave ?? [],
      niceToHave: raw.nice_to_have ?? raw.niceToHave ?? [],
      hasTravel: raw.has_travel ?? raw.hasTravel ?? false,
      hasAccommodation: raw.has_accommodation ?? raw.hasAccommodation ?? false,
      isUrgent: raw.is_urgent ?? raw.isUrgent ?? false,
      uiIsNegotiable: raw.ui_is_negotiable ?? raw.uiIsNegotiable,
      uiIsFlexibleTime: raw.ui_is_flexible_time ?? raw.uiIsFlexibleTime,
      uiAllowPartial: raw.ui_allow_partial ?? raw.uiAllowPartial,
      uiLocationCity: raw.ui_location_city ?? raw.uiLocationCity ?? pharmacy.suburb,
      uiLocationState: raw.ui_location_state ?? raw.uiLocationState ?? pharmacy.state,
      uiAddressLine: raw.ui_address_line ?? raw.uiAddressLine ?? [
        pharmacy.street_address ?? pharmacy.streetAddress,
        pharmacy.suburb,
        pharmacy.state,
        pharmacy.postcode,
      ].filter(Boolean).join(', '),
      uiDistanceKm: raw.ui_distance_km ?? raw.uiDistanceKm,
      uiIsUrgent: raw.ui_is_urgent ?? raw.uiIsUrgent ?? raw.is_urgent ?? raw.isUrgent,
      pharmacyDetail: {
        name: pharmacy.name,
        streetAddress: pharmacy.street_address ?? pharmacy.streetAddress,
        suburb: pharmacy.suburb,
        state: pharmacy.state,
        postcode: pharmacy.postcode,
      },
      createdAt: raw.created_at ?? raw.createdAt,
    } as Shift;
  };

  const showError = (message: string) => {
    setError(message);
    setErrorOpen(true);
  };

  const loadShifts = useCallback(
    async (activeFilters: FilterConfig, activePage: number) => {
      setLoading(true);
      setError(null);
      try {
        const org = searchParams.get('organization');
        const roleFilters = activeFilters.roles
          .map(normalizeRoleForApi)
          .filter((value) => Boolean(value));
        const payload: any = {
          organization: org || undefined,
          search: activeFilters.search,
          // Backend expects enum codes (e.g. PHARMACIST), while the UI uses labels.
          roles: roleFilters,
          employment_types: activeFilters.employmentTypes,
          city: activeFilters.city,
          state: [],
          min_rate: activeFilters.minRate || undefined,
          only_urgent: activeFilters.onlyUrgent || undefined,
          negotiable_only: activeFilters.negotiableOnly || undefined,
          flexible_only: activeFilters.flexibleOnly || undefined,
          travel_provided: activeFilters.travelProvided || undefined,
          accommodation_provided: activeFilters.accommodationProvided || undefined,
          bulk_shifts_only: activeFilters.bulkShiftsOnly || undefined,
          time_of_day: activeFilters.timeOfDay,
          start_date: activeFilters.dateRange.start || undefined,
          end_date: activeFilters.dateRange.end || undefined,
          page: activePage,
          page_size: pageSize,
        };

        const [publicShifts, interests] = await Promise.all([
          getPublicJobBoard(payload) as Promise<PaginatedResponse<Shift>>,
          user?.id ? fetchShiftInterests({ userId: user.id }) : Promise.resolve([]),
        ]);
        const list = Array.isArray(publicShifts?.results)
          ? publicShifts.results
          : Array.isArray(publicShifts)
            ? publicShifts
            : [];
        setShifts((list as any[]).map(mapPublicShift));
        setTotalCount((publicShifts as any)?.count);

        const nextShiftIds = new Set<number>();
        const nextSlotIds = new Set<number>();
        (interests as ShiftInterest[]).forEach((interest) => {
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
    [searchParams, user?.id]
  );

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedFilters(filters), 350);
    return () => clearTimeout(handle);
  }, [filters]);

  useEffect(() => {
    loadShifts(debouncedFilters, page);
  }, [debouncedFilters, page, loadShifts]);

  const requireLogin = () => setLoginDialogOpen(true);

  useEffect(() => {
    const fetchVerification = async () => {
      if (!user) {
        setIsVerified(false);
        return;
      }

      const initialVerified =
        coerceVerified((user as any)?.verified) ||
        coerceVerified((user as any)?.pharmacist_profile?.verified) ||
        coerceVerified((user as any)?.other_staff_profile?.verified);
      setIsVerified(initialVerified);

      const roleKey =
        user.role === 'PHARMACIST' ? 'pharmacist' :
        user.role === 'OTHER_STAFF' ? 'other_staff' :
        user.role === 'EXPLORER' ? 'explorer' :
        user.role === 'OWNER' ? 'owner' :
        null;
      if (!roleKey) return;

      try {
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

    void fetchVerification();
  }, [user]);

  const requireVerified = () => {
    if (!user) {
      requireLogin();
      throw new Error('Login required.');
    }
    if (!isVerified) {
      const msg = 'You must be verified before applying to public shifts. Please complete your onboarding and verification process.';
      showError(msg);
      throw new Error(msg);
    }
  };

  const handleApplyAll = async (shift: Shift) => {
    requireVerified();
    try {
      const slots = shift.slots ?? [];
      if (shift.singleUserOnly || slots.length === 0) {
        await expressInterestInPublicShiftService({ shiftId: shift.id, slotId: null });
        setAppliedShiftIds((prev) => Array.from(new Set([...prev, shift.id])));
        return;
      }

      const slotIds = slots.map((slot) => slot.id);
      await expressInterestInPublicShiftService({ shiftId: shift.id, slotIds } as any);
      setAppliedSlotIds((prev) => Array.from(new Set([...prev, ...slotIds])));
    } catch (err) {
      console.error('Failed to express interest', err);
      showError('Failed to express interest in this shift.');
      throw err;
    }
  };

  const handleApplySlot = async (shift: Shift, slotId: number) => {
    requireVerified();
    try {
      await expressInterestInPublicShiftService({ shiftId: shift.id, slotId });
      setAppliedSlotIds((prev) => Array.from(new Set([...prev, slotId])));
    } catch (err) {
      console.error('Failed to express interest in slot', err);
      showError('Failed to express interest in this slot.');
      throw err;
    }
  };

  const handleApplySlots = async (shift: Shift, slotIds: number[]) => {
    requireVerified();
    try {
      const uniqueSlotIds = Array.from(new Set(slotIds)).filter((slotId) => Number.isFinite(slotId));
      if (uniqueSlotIds.length === 0) return;
      await expressInterestInPublicShiftService({ shiftId: shift.id, slotIds: uniqueSlotIds } as any);
      setAppliedSlotIds((prev) => Array.from(new Set([...prev, ...uniqueSlotIds])));
    } catch (err) {
      console.error('Failed to express interest in slots', err);
      showError('Failed to express interest in the selected slots.');
      throw err;
    }
  };

  const handleSubmitCounterOffer = async (payload: ShiftCounterOfferPayload) => {
    requireVerified();
    try {
      await submitShiftCounterOfferService(payload);
    } catch (err) {
      console.error('Failed to submit counter offer', err);
      showError('Failed to submit counter offer.');
      throw err;
    }
  };

  const handleFiltersChange = (nextFilters: FilterConfig) => {
    setFilters(nextFilters);
  };

  const handleCloseError = () => setErrorOpen(false);

  return (
    <>
      <PublicLogoTopBar />
      <AuthLayout title="Public Job Board" maxWidth={false} noCard showTitle={false}>
        <Box sx={{ px: { xs: 2, lg: 3 }, py: 3, bgcolor: 'grey.50', minHeight: '100vh' }}>
          {error && (
            <Typography color="error" sx={{ mb: 1 }}>
              {error}
            </Typography>
          )}
          <ShiftsBoard
            title="Public Job Board"
            shifts={shifts}
            loading={loading}
            useServerFiltering
            filters={filters}
            onFiltersChange={handleFiltersChange}
            totalCount={totalCount}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            enableSaved={false}
            hideSaveToggle
            readOnlyActions={!user}
            disableLocalPersistence
            roleOptionsOverride={PUBLIC_ROLE_OPTIONS}
            initialAppliedShiftIds={appliedShiftIds}
            initialAppliedSlotIds={appliedSlotIds}
            initialRejectedShiftIds={[]}
            initialRejectedSlotIds={[]}
            onApplyAll={handleApplyAll}
            onApplySlot={handleApplySlot}
            onApplySlots={handleApplySlots}
            onSubmitCounterOffer={handleSubmitCounterOffer}
            hideCounterOffer={!user}
            onRefresh={() => loadShifts(filters, page)}
          />
        </Box>

        <Dialog open={loginDialogOpen} onClose={() => setLoginDialogOpen(false)}>
          <DialogTitle>Log in to apply</DialogTitle>
          <DialogContent dividers>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              You need an account to apply or send a counter offer.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setLoginDialogOpen(false)}>Cancel</Button>
            <Button component={RouterLink} to="/register" variant="outlined">
              Create account
            </Button>
            <Button component={RouterLink} to="/login" variant="contained">
              Log in
            </Button>
          </DialogActions>
        </Dialog>

        <Snackbar open={errorOpen} autoHideDuration={4000} onClose={handleCloseError}>
          <Alert severity="error" onClose={handleCloseError} sx={{ width: '100%' }}>
            {error}
          </Alert>
        </Snackbar>
      </AuthLayout>
    </>
  );
}
