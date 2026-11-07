import {
  projectTalentSkills,
  resolveTalentBookingRole,
  newcomerTypeLabel,
  getApiConfig,
  type PendingPitch,
  deleteExplorerPost,
  fetchUserAvailabilityService,
  getExplorerPostForEditing,
  getOnboarding,
  getRatingsSummary,
  likeExplorerPost,
  unlikeExplorerPost,
  updateExplorerPost,
  updateOnboardingForm,
} from '@chemisttasker/shared-core';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Button, Chip, IconButton, Text } from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { ENGAGEMENT_LABELS } from './constants';
import { Candidate } from './types';
import { useTalentFeed } from './useTalentFeed';
import { useTalentFilters } from './useTalentFilters';
import { BadgeGuideButton } from '../skills/VerificationBadges';
import AvailabilitySidebar from './components/AvailabilitySidebar';
import FiltersSidebar, { TalentFilterState } from './components/FiltersSidebar';
import PitchDialog, { PitchFormState } from './components/PitchDialog';
import { useUnsavedChangesGuard } from '../forms/useUnsavedChangesGuard';
import TalentCardV2 from './components/TalentCardV2';
import { usePublicAvailabilityEligibility } from './publicAvailabilityEligibility';
import { mobilePendingPitchStore, submitPendingPitch } from './pendingPitch';

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/(^|\s)\S/g, (t) => t.toUpperCase());

const formatRoleLabel = (role?: string | null) => {
  if (!role) return 'New to pharmacy';
  const code = role.toUpperCase();
  if (code === 'EXPLORER') return 'New to pharmacy';
  if (code === 'OTHER_STAFF') return 'Pharmacy team';
  return newcomerTypeLabel(role) ?? titleCase(role);
};

const formatWorkType = (workType?: string | null) => {
  if (!workType) return '';
  return titleCase(workType);
};


const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const todayIso = () => toIsoDate(new Date());

const expandAvailabilityEntryDates = (entry: any) => {
  const startDate = String(entry?.date || '');
  if (!isIsoDate(startDate)) return [];
  const isRecurring = Boolean(entry?.isRecurring ?? entry?.is_recurring);
  const recurringDays = entry?.recurringDays ?? entry?.recurring_days ?? [];
  const recurringEndDate = String(entry?.recurringEndDate ?? entry?.recurring_end_date ?? '');
  if (!isRecurring || !Array.isArray(recurringDays) || !recurringDays.length || !isIsoDate(recurringEndDate)) {
    return [startDate];
  }
  const dates: string[] = [];
  const end = new Date(`${recurringEndDate}T00:00:00`);
  for (let cursor = new Date(`${startDate}T00:00:00`), count = 0; cursor <= end && count < 366; cursor.setDate(cursor.getDate() + 1), count += 1) {
    if (recurringDays.includes(cursor.getDay())) dates.push(toIsoDate(cursor));
  }
  return dates;
};

const mapAvailabilityToPitchSlots = (entries: any[]) =>
  entries.flatMap((entry) =>
    expandAvailabilityEntryDates(entry).map((date) => ({
      date,
      startTime: entry?.startTime || entry?.start_time || '09:00',
      endTime: entry?.endTime || entry?.end_time || '17:00',
      isAllDay: Boolean(entry?.isAllDay ?? entry?.is_all_day),
      notes: '',
    }))
  ).filter((slot) => slot.date >= todayIso());
const allWorkTypes = Object.values(ENGAGEMENT_LABELS);

const registry = require('@chemisttasker/shared-core/skills_registry.json') as any;

type TalentBoardProps = {
  publicMode?: boolean;
  externalPosts?: Record<string, any>[];
  externalLoading?: boolean;
  externalError?: string | null;
  onRequireLogin?: (reason?: 'like' | 'calendar' | 'booking') => void;
  postShiftRoute?: '/owner/post-shift' | '/organization/post-shift' | '/admin/post-shift';
  canRequestBookingOverride?: boolean;
  hidePitchButton?: boolean;
  openPitchOnMount?: boolean;
};

export function TalentBoardInner({
  publicMode = false,
  externalPosts,
  externalLoading,
  externalError,
  onRequireLogin,
  postShiftRoute = '/owner/post-shift',
  canRequestBookingOverride,
  hidePitchButton = false,
  openPitchOnMount = false,
}: TalentBoardProps) {
  const feed = useTalentFeed({ enabled: !publicMode });
  const posts = externalPosts ?? feed.posts;
  const loading = externalLoading ?? feed.loading;
  const reload = feed.reload;
  const { user } = useAuth();
  const router = useRouter();

  const [actionError, setActionError] = useState<string | null>(null);
  const error = externalError ?? actionError ?? feed.error;
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<TalentFilterState>({
    search: '',
    roles: [],
    workTypes: [],
    states: [],
    skills: [],
    willingToTravel: false,
    placementSeeker: false,
    availabilityStart: null,
    availabilityEnd: null,
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedCalendarCandidate, setSelectedCalendarCandidate] = useState<Candidate | null>(null);
  const [expandedRoleSkills, setExpandedRoleSkills] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [ratingSummary, setRatingSummary] = useState<Record<number, { average: number; count: number }>>({});
  const ratingFetchRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!user) return;
    const ids = new Set<number>();
    posts.forEach((post) => {
      if (typeof post.authorUserId === 'number') ids.add(post.authorUserId);
    });
    ids.forEach((id) => {
      if (ratingFetchRef.current.has(id)) return;
      ratingFetchRef.current.add(id);
      void getRatingsSummary({ target_type: 'worker', target_id: id })
        .then((res: any) => {
          const averageRaw = Number(res?.average ?? 0);
          const countRaw = Number(res?.count ?? 0);
          const average = Number.isFinite(averageRaw) ? averageRaw : 0;
          const count = Number.isFinite(countRaw) ? countRaw : 0;
          setRatingSummary((prev) => ({ ...prev, [id]: { average, count } }));
        })
        .catch(() => {});
    });
  }, [posts, user]);

  const candidates = useMemo<Candidate[]>(
    () =>
      posts.map((post) => {
        const roleLabel = formatRoleLabel(post.roleTitle || post.explorerRoleType || post.roleCategory);
        const workTypes =
          Array.isArray(post.workTypes) && post.workTypes.length
            ? post.workTypes.map((w: string) => formatWorkType(w))
            : [];
        const city = post.locationSuburb || post.locationState || '';
        const state = post.locationState || '';
        const coverageRadius = post.coverageRadiusKm ? `+${post.coverageRadiusKm}km` : 'Local';
        const willingToTravel = Boolean(post.openToTravel);
        const travelStates = Array.isArray(post.travelStates)
          ? post.travelStates
          : Array.isArray(post.travel_states)
            ? post.travel_states
            : [];
        const ahpraYears = post.ahpraYearsSinceFirstRegistration ?? post.ahpra_years_since_first_registration ?? null;
        const yearsExperience = post.yearsExperience ?? post.years_experience ?? null;
        const experienceBadge =
          roleLabel.includes('Pharmacist') && ahpraYears != null
            ? `${ahpraYears} yrs AHPRA`
            : roleLabel.includes('Pharmacy') || roleLabel.includes('Assistant') || roleLabel.includes('Technician')
              ? yearsExperience
                ? `${yearsExperience} yrs exp`
                : null
              : null;
        const postKind =
          post.postKind ||
          (post.availabilityMode === 'FULL_TIME_NOTICE' ? 'FULL_TIME_APPLICATION' : 'AVAILABILITY');
        const isFullTimeApplication = postKind === 'FULL_TIME_APPLICATION';
        const availabilityRaw = Array.isArray(post.availabilityDays) ? post.availabilityDays : [];
        const availableSlots = availabilityRaw
          .map((entry: any) => {
            if (typeof entry === 'string') return { date: entry, startTime: null, endTime: null, isAllDay: false };
            if (entry && typeof entry === 'object') {
              return {
                date: String(entry.date || ''),
                startTime: entry.start_time || entry.startTime || null,
                endTime: entry.end_time || entry.endTime || null,
                isAllDay: Boolean(entry.is_all_day ?? entry.isAllDay),
              };
            }
            return null;
          })
          .filter((entry: any) => Boolean(entry && isIsoDate(entry.date)));
        const futureAvailableSlots = availableSlots.filter((entry: any) => entry.date >= todayIso());
        const availableDates = futureAvailableSlots.map((slot: any) => slot.date);
        const rawSkills = Array.from(new Set([...(post.software ?? []), ...(post.skills ?? [])])).filter(Boolean) as string[];
        const { clinicalServices, dispenseSoftware, expandedScope, skills } = projectTalentSkills(registry, rawSkills);
        const rating = post.authorUserId != null ? ratingSummary[post.authorUserId] : undefined;
        const ratingAverage = rating?.average ?? Number(post.ratingAverage ?? post.rating_average ?? post.rating?.average ?? 0);
        const ratingCount = rating?.count ?? Number(post.ratingCount ?? post.rating_count ?? post.rating?.count ?? 0);
        return {
          id: post.id,
          refId: post.referenceCode ? (post.referenceCode.startsWith('REF-') ? post.referenceCode : `REF-${post.referenceCode}`) : 'REF-0000',
          role: roleLabel,
          headline: post.headline || '',
          body: post.body || '',
          city,
          state,
          coverageRadius,
          workTypes,
          willingToTravel,
          pitch: post.body || post.shortBio || '',
          travelStates,
          experienceBadge,
          skills,
          software: dispenseSoftware,
          clinicalServices,
          dispenseSoftware,
          expandedScope,
          experience: null,
          availabilityText: isFullTimeApplication ? 'Open anytime' : '',
          availabilityMode: post.availabilityMode || null,
          postKind,
          isFullTimeApplication,
          showCalendar: !isFullTimeApplication && availableDates.length > 0,
          availableDates,
          availableSlots: futureAvailableSlots as any,
          isInternshipSeeker:
            roleLabel.includes('Student') ||
            roleLabel.includes('Intern') ||
            workTypes.some((type: string) => ['Placement', 'Volunteering'].includes(type)),
          ratingAverage,
          ratingCount,
          likeCount: typeof post.like_count === 'number' ? post.like_count : 0,
          isLikedByMe: Boolean(post.is_liked_by_me),
          authorUserId: post.authorUserId ?? null,
          explorerUserId: post.explorerUserId ?? null,
          isExplorer: (post.roleCategory || '').toUpperCase() === 'EXPLORER' || post.explorerProfileId != null,
          rawRoleCategory: post.roleCategory ?? null,
          explorerRoleType: post.explorerRoleType ?? null,
          explorerProfileId: post.explorerProfileId ?? null,
          verification: post.verification ?? null,
        };
      }),
    [posts, ratingSummary]
  );

  const { filtered: processedCandidates, roleOptions, stateOptions, roleSkillOptions, softwareOptions } = useTalentFilters(candidates, filters);
  const pageCount = Math.max(1, Math.ceil(processedCandidates.length / pageSize));
  const pagedCandidates = useMemo(() => processedCandidates.slice((page - 1) * pageSize, page * pageSize), [processedCandidates, page]);
  const activeFilterCount =
    filters.roles.length +
    filters.workTypes.length +
    filters.states.length +
    filters.skills.length +
    (filters.availabilityStart ? 1 : 0) +
    (filters.availabilityEnd ? 1 : 0) +
    (filters.search ? 1 : 0) +
    (filters.willingToTravel ? 1 : 0) +
    (filters.placementSeeker ? 1 : 0);

  const normalizedRole = useMemo(
    () => String(user?.role || '').trim().toUpperCase().replace(/\s+/g, '_'),
    [user?.role]
  );

  const {
    status: eligibilityStatus,
    staffPublicAccess,
    error: eligibilityError,
    retry: retryEligibility,
    isTalentStaff,
  } = usePublicAvailabilityEligibility(user);

  const canPitch =
    normalizedRole === 'EXPLORER' ||
    (isTalentStaff && staffPublicAccess === true);

  const activeUserRef = useRef({ id: user?.id, role: normalizedRole });
  activeUserRef.current = { id: user?.id, role: normalizedRole };

  const activeEditorPostIdRef = useRef<number | null>(null);
  const activeDeleteTokenRef = useRef<number | null>(null);
  const deleteOperationIdRef = useRef<number>(0);

  const pitchLoadGeneration = useRef(0);
  const saveGeneration = useRef(0);
  const saveInFlightRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      pitchLoadGeneration.current += 1;
      saveGeneration.current += 1;
      activeDeleteTokenRef.current = null;
      deleteInFlightRef.current = false;
      saveInFlightRef.current = false;
    };
  }, []);

  const canRequestBookingByRole = useMemo(() => {
    if (!normalizedRole) return false;
    if (['EXPLORER', 'PHARMACIST', 'OTHER_STAFF'].includes(normalizedRole)) return false;
    return true;
  }, [normalizedRole]);

  const canRequestBooking = canRequestBookingOverride ?? canRequestBookingByRole;

  const handleViewCalendar = useCallback((candidate: Candidate) => {
    if (publicMode) return onRequireLogin?.('calendar');
    setSelectedCalendarCandidate(candidate);
  }, [onRequireLogin, publicMode]);

  const handleRequestBooking = useCallback((candidate: Candidate, dates: string[]) => {
    if (!canRequestBooking) return;
    const targetUserId = candidate.authorUserId ?? candidate.explorerUserId ?? null;
    const uniqueDates = Array.from(new Set(dates)).sort();
    const shiftRole = resolveTalentBookingRole(candidate.rawRoleCategory, candidate.explorerRoleType, candidate.role);
    const firstSlot = (candidate.availableSlots || []).find((slot: any) => uniqueDates.includes(slot.date));
    const startTime = firstSlot?.startTime || (firstSlot as any)?.start_time || null;
    const endTime = firstSlot?.endTime || (firstSlot as any)?.end_time || null;
    const params: Record<string, string | undefined> = {
      dates: uniqueDates.length > 0 ? uniqueDates.join(',') : undefined,
      role: shiftRole || undefined,
      role_needed: shiftRole || undefined,
      start_time: startTime ? String(startTime).slice(0, 5) : undefined,
      end_time: endTime ? String(endTime).slice(0, 5) : undefined,
      embedded: '1',
    };
    if (targetUserId) {
      params.dedicated_user = String(targetUserId);
    }
    const search = Object.entries(params)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');
    router.push(`${postShiftRoute}${search ? `?${search}` : ''}` as any);
    setSelectedCalendarCandidate(null);
  }, [canRequestBooking, postShiftRoute, router]);

  const handleBookTalent = useCallback((candidate: Candidate) => {
    handleRequestBooking(candidate, candidate.isFullTimeApplication ? [] : candidate.availableDates || []);
  }, [handleRequestBooking]);

  const handleToggleLike = useCallback(async (candidate: Candidate) => {
    if (publicMode) return onRequireLogin?.('like');
    setActionError(null);
    try {
      if (candidate.isLikedByMe) await unlikeExplorerPost(candidate.id);
      else await likeExplorerPost(candidate.id);
      await reload();
    } catch (err: any) {
      setActionError(err?.message || 'Unable to update this like. Please try again.');
    }
  }, [onRequireLogin, publicMode, reload]);

  const clearAllFilters = () => {
    setFilters({
      search: '',
      roles: [],
      workTypes: [],
      states: [],
      skills: [],
      willingToTravel: false,
      placementSeeker: false,
      availabilityStart: null,
      availabilityEnd: null,
    });
  };

  const [pitchOpen, setPitchOpen] = useState(false);
  const [pitchSaving, setPitchSaving] = useState(false);
  const [pitchDeleting, setPitchDeleting] = useState(false);
  const [pitchError, setPitchError] = useState<string | null>(null);
  const pitchAccount = JSON.stringify([getApiConfig().baseURL, user?.id, normalizedRole]);
  const pitchAccountRef = useRef(pitchAccount);
  const pitchAbortRef = useRef(new AbortController());
  if (pitchAccountRef.current !== pitchAccount) {
    pitchAbortRef.current.abort();
    pitchAbortRef.current = new AbortController();
    saveGeneration.current += 1;
    saveInFlightRef.current = false;
    pitchLoadGeneration.current += 1;
  }
  pitchAccountRef.current = pitchAccount;
  useEffect(() => {
    if (pitchAbortRef.current.signal.aborted) pitchAbortRef.current = new AbortController();
    const controller = pitchAbortRef.current;
    return () => controller.abort();
  }, [pitchAccount]);
  const pendingStore = useMemo(() => user?.id != null ? mobilePendingPitchStore(getApiConfig().baseURL, user.id) : null, [user?.id]);
  const [pendingPitch, setPendingPitch] = useState<PendingPitch | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [pendingReady, setPendingReady] = useState(false);
  useEffect(() => {
    let current = true;
    setPendingPitch(null);
    setPendingError(null);
    setPendingReady(false);
    if (!pendingStore) return () => { current = false; };
    void pendingStore.read().then((intent) => {
      if (current) { setPendingPitch(intent); setPendingReady(true); }
    }).catch(() => {
      if (current) setPendingError('Your saved pitch could not be read. Review your pitches to recover.');
    });
    return () => { current = false; };
  }, [pendingStore]);

  const [existingPostId, setExistingPostId] = useState<number | null>(null);
  const [existingReferenceCode, setExistingReferenceCode] = useState<string | null>(null);
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    open: boolean;
    postId: number | null;
    referenceCode: string | null;
    headline: string | null;
    token: number;
    accountKey: string;
  }>({
    open: false,
    postId: null,
    referenceCode: null,
    headline: null,
    token: 0,
    accountKey: '',
  });
  const deleteTokenCounter = useRef(0);
  const deleteInFlightRef = useRef(false);
  const consumedTokensRef = useRef<Set<number>>(new Set());
  const [roleTitle, setRoleTitle] = useState<string>('New to pharmacy');
  const [explorerProfileId, setExplorerProfileId] = useState<number | null>(null);
  const [pitchSkills, setPitchSkills] = useState<string[]>([]);
  const [pitchForm, setPitchForm] = useState<PitchFormState>({
    headline: '',
    body: '',
    workTypes: [],
    postKind: 'AVAILABILITY',
    streetAddress: '',
    suburb: '',
    state: '',
    postcode: '',
    openToTravel: false,
    travelStates: [],
    coverageRadiusKm: 30,
    latitude: null,
    longitude: null,
    googlePlaceId: '',
    availabilitySlots: [],
  });

  const [pitchDefaultsStatus, setPitchDefaultsStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const pitchDefaultsReady = useRef<string | null>(null);
  const [slotDraftDirty, setSlotDraftDirty] = useState(false);
  const pitchGuard = useUnsavedChangesGuard({ pitchForm, slotDraftDirty }, {
    enabled: pitchOpen && pitchDefaultsStatus === 'ready',
    saving: pitchSaving || pitchDeleting,
  });
  const markPitchCleanRef = useRef(pitchGuard.markClean);
  markPitchCleanRef.current = pitchGuard.markClean;
  useEffect(() => {
    if (pitchOpen && pitchDefaultsStatus === 'ready') markPitchCleanRef.current();
  }, [pitchOpen, pitchDefaultsStatus]);

  const isExplorer = user?.role === 'EXPLORER';
  const isPharmacist = user?.role === 'PHARMACIST';
  const isOtherStaff = user?.role === 'OTHER_STAFF';

  useEffect(() => {
    activeEditorPostIdRef.current = existingPostId;
    activeDeleteTokenRef.current = null;
  }, [existingPostId]);

  useEffect(() => {
    activeDeleteTokenRef.current = null;
    setDeleteConfirmState({
      open: false,
      postId: null,
      referenceCode: null,
      headline: null,
      token: 0,
      accountKey: '',
    });
  }, [user?.id, normalizedRole]);

  const resetPitchForm = useCallback(() => {
    setPitchForm({
      headline: '',
      body: '',
      workTypes: [],
      postKind: 'AVAILABILITY',
      streetAddress: '',
      suburb: '',
      state: '',
      postcode: '',
      openToTravel: false,
      travelStates: [],
      coverageRadiusKm: 30,
      latitude: null,
      longitude: null,
      googlePlaceId: '',
      availabilitySlots: [],
    });
    setExistingPostId(null);
    setExistingReferenceCode(null);
    activeEditorPostIdRef.current = null;
    activeDeleteTokenRef.current = null;
    setExplorerProfileId(null);
    setRoleTitle('New to pharmacy');
    setPitchSkills([]);
    setDeleteConfirmState({
      open: false,
      postId: null,
      referenceCode: null,
      headline: null,
      token: 0,
      accountKey: '',
    });
  }, []);

  useEffect(() => {
    setPitchSaving(false);
    setPitchError(null);
    pitchDefaultsReady.current = null;
  }, [pitchAccount]);

  const loadPitchDefaults = useCallback(async () => {
    if (!user || deleteInFlightRef.current || saveInFlightRef.current) return;
    const currentGeneration = ++pitchLoadGeneration.current;
    const currentUserId = user.id;
    const currentRole = normalizedRole;
    const isCurrent = () =>
      pitchLoadGeneration.current === currentGeneration &&
      activeUserRef.current.id === currentUserId &&
      activeUserRef.current.role === currentRole;

    pitchDefaultsReady.current = null;
    setPitchDefaultsStatus('loading');
    setPitchError(null);
    resetPitchForm();
    let onboarding: any;
    let onboardingSkills: string[] = [];
    let inheritedAvailabilitySlots: PitchFormState['availabilitySlots'] = [];
    try {
      inheritedAvailabilitySlots = mapAvailabilityToPitchSlots(await fetchUserAvailabilityService().catch(() => []));
      if (!isCurrent()) return;

      if (isExplorer) {
        onboarding = await getOnboarding('explorer');
        if (!isCurrent()) return;
        setRoleTitle((onboarding?.role_type || 'New to pharmacy').replace('_', ' '));
        setExplorerProfileId(onboarding?.id ?? null);
      } else if (isPharmacist) {
        onboarding = await getOnboarding('pharmacist');
        if (!isCurrent()) return;
        setRoleTitle('Pharmacist');
        onboardingSkills = Array.isArray(onboarding?.skills) ? onboarding.skills : [];
      } else if (isOtherStaff) {
        onboarding = await getOnboarding('other_staff');
        if (!isCurrent()) return;
        setRoleTitle((onboarding?.role_type || 'Pharmacy team').replace('_', ' '));
        onboardingSkills = Array.isArray(onboarding?.skills) ? onboarding.skills : [];
      }
      if (!onboarding) throw new Error('Failed to load your profile.');
      setPitchForm((prev) => ({
        ...prev,
        streetAddress: onboarding.street_address ?? '',
        suburb: onboarding.suburb ?? '',
        state: onboarding.state ?? '',
        postcode: onboarding.postcode ?? '',
        openToTravel: Boolean(onboarding.open_to_travel),
        travelStates: Array.isArray(onboarding.travel_states) ? onboarding.travel_states : [],
        coverageRadiusKm: onboarding.coverage_radius_km != null ? Number(onboarding.coverage_radius_km) : 30,
        latitude: onboarding.latitude != null ? Number(onboarding.latitude) : null,
        longitude: onboarding.longitude != null ? Number(onboarding.longitude) : null,
        googlePlaceId: onboarding.google_place_id ?? '',
      }));
      const mine = await getExplorerPostForEditing();
      if (!isCurrent()) return;
      if (mine) {
        const minePostKind =
          mine.postKind ||
          (mine.availabilityMode === 'FULL_TIME_NOTICE' ? 'FULL_TIME_APPLICATION' : 'AVAILABILITY');
        setExistingPostId(mine.id);
        activeEditorPostIdRef.current = mine.id;
        setExistingReferenceCode(mine.referenceCode || (mine.id ? `REF-${mine.id}` : null));
        setPitchForm((prev) => ({
          ...prev,
          headline: mine.headline || prev.headline,
          body: mine.body || prev.body,
          workTypes: Array.isArray(mine.workTypes) ? mine.workTypes : prev.workTypes,
          postKind: minePostKind,
          suburb: mine.locationSuburb || prev.suburb,
          state: mine.locationState || prev.state,
          postcode: mine.locationPostcode || prev.postcode,
          openToTravel: mine.openToTravel != null ? Boolean(mine.openToTravel) : prev.openToTravel,
          coverageRadiusKm: mine.coverageRadiusKm != null ? Number(mine.coverageRadiusKm) : prev.coverageRadiusKm,
          availabilitySlots:
            minePostKind === 'FULL_TIME_APPLICATION'
              ? []
              : Array.isArray(mine.availabilityDays) && mine.availabilityDays.length > 0
                ? mine.availabilityDays.map((entry: any) => {
                    if (typeof entry === 'string') {
                      return { date: entry, startTime: '09:00', endTime: '17:00', isAllDay: false, notes: '' };
                    }
                    return {
                      date: String(entry?.date || ''),
                      startTime: entry?.start_time || entry?.startTime || '09:00',
                      endTime: entry?.end_time || entry?.endTime || '17:00',
                      isAllDay: Boolean(entry?.is_all_day ?? entry?.isAllDay),
                      notes: entry?.notes || '',
                    };
                  }).filter((slot: any) => slot.date >= todayIso())
                : (prev.availabilitySlots.length ? prev.availabilitySlots : inheritedAvailabilitySlots),
        }));
      } else if (inheritedAvailabilitySlots.length > 0) {
        setPitchForm((prev) => ({
          ...prev,
          postKind: 'AVAILABILITY',
          availabilitySlots: inheritedAvailabilitySlots,
        }));
      }
      if (mine && Array.isArray(mine.skills) && mine.skills.length > 0) setPitchSkills(mine.skills);
      else if (onboardingSkills.length > 0) setPitchSkills(onboardingSkills);
      pitchDefaultsReady.current = `${currentUserId}:${currentRole}`;
      setPitchDefaultsStatus('ready');
    } catch (err: any) {
      if (!isCurrent()) return;
      setPitchDefaultsStatus('error');
      setPitchError(err?.message || 'Failed to load your profile.');
    }
  }, [isExplorer, isOtherStaff, isPharmacist, normalizedRole, resetPitchForm, user?.id]);

  useEffect(() => {
    if (pitchOpen) void loadPitchDefaults();
  }, [loadPitchDefaults, pitchOpen]);

  const updateOnboardingLocationPrefs = useCallback(async () => {
    const safeRole = isOtherStaff ? 'otherstaff' : isPharmacist ? 'pharmacist' : 'explorer';
    const form = new FormData();
    form.append('street_address', pitchForm.streetAddress || '');
    form.append('suburb', pitchForm.suburb || '');
    form.append('state', pitchForm.state || '');
    form.append('postcode', pitchForm.postcode || '');
    form.append('open_to_travel', pitchForm.openToTravel ? 'true' : 'false');
    form.append('travel_states', JSON.stringify(pitchForm.travelStates || []));
    form.append('coverage_radius_km', String(pitchForm.coverageRadiusKm || 0));
    if (pitchForm.latitude != null) form.append('latitude', String(pitchForm.latitude));
    if (pitchForm.longitude != null) form.append('longitude', String(pitchForm.longitude));
    if (pitchForm.googlePlaceId) form.append('google_place_id', pitchForm.googlePlaceId);
    await updateOnboardingForm(safeRole, form);
  }, [isOtherStaff, isPharmacist, pitchForm]);

  const handlePitchSave = async () => {
    if (saveInFlightRef.current || deleteInFlightRef.current || activeDeleteTokenRef.current !== null || deleteConfirmState.open) {
      return;
    }
    if (!isMountedRef.current || !pendingStore || (!existingPostId && !pendingReady) || pitchDefaultsReady.current !== `${user?.id}:${normalizedRole}`) return;

    saveInFlightRef.current = true;
    const currentSaveGen = ++saveGeneration.current;
    const currentUserId = user?.id;
    const currentRole = normalizedRole;
    const isCurrentSave = () =>
      isMountedRef.current &&
      saveGeneration.current === currentSaveGen &&
      activeUserRef.current.id === currentUserId &&
      activeUserRef.current.role === currentRole;

    setPitchSaving(true);
    setPitchError(null);
    try {
      let savedIntent: PendingPitch | null = null;
      if (!existingPostId) {
        try { savedIntent = await pendingStore.read(); }
        catch {
          if (isCurrentSave()) {
            setPendingPitch(null);
            setPendingReady(false);
            setPendingError('Your saved pitch could not be read. Review your pitches to recover.');
            setPitchOpen(false);
          }
          return;
        }
      }
      if (savedIntent) {
        if (isCurrentSave()) { setPendingPitch(savedIntent); setPitchError('Finish the saved pitch from the Talent Board before starting another.'); }
        return;
      }
      if (!isCurrentSave()) return;
      if (pitchForm.openToTravel && (pitchForm.travelStates || []).length === 0) {
        if (!isCurrentSave()) return;
        setPitchError('Select at least one travel state.');
        return;
      }
      const isFullTimeApplication = pitchForm.postKind === 'FULL_TIME_APPLICATION';
      if (isExplorer && isFullTimeApplication && !pitchForm.headline.trim() && !pitchForm.body.trim()) {
        if (!isCurrentSave()) return;
        setPitchError('Please add a headline or some text.');
        return;
      }
      await updateOnboardingLocationPrefs();
      if (!isCurrentSave()) return;
      const normalizedWorkTypes = isFullTimeApplication
        ? Array.from(new Set([...(pitchForm.workTypes || []), 'FULL_TIME']))
        : pitchForm.workTypes;
      const normalizedHeadline =
        pitchForm.headline.trim() ||
        (isFullTimeApplication ? `${roleTitle || 'Talent'} profile` : `${roleTitle || 'Talent'} availability`);
      const availabilityDays = isFullTimeApplication
        ? []
        : (pitchForm.availabilitySlots || [])
          .filter((entry: any) => entry && entry.date && String(entry.date) >= todayIso())
          .map((entry: any) => ({
            date: String(entry.date),
            start_time: entry.startTime || entry.start_time || null,
            end_time: entry.endTime || entry.end_time || null,
            is_all_day: Boolean(entry.isAllDay ?? entry.is_all_day),
            startTime: entry.startTime || entry.start_time || null,
            endTime: entry.endTime || entry.end_time || null,
            isAllDay: Boolean(entry.isAllDay ?? entry.is_all_day),
            notes: entry.notes || '',
          }));
      const payload: Record<string, any> = {
        headline: normalizedHeadline,
        body: pitchForm.body || '',
        role_category: isExplorer ? 'EXPLORER' : isPharmacist ? 'PHARMACIST' : 'OTHER_STAFF',
        role_title: roleTitle || '',
        work_types: normalizedWorkTypes.length > 0 ? normalizedWorkTypes : undefined,
        post_kind: pitchForm.postKind,
        skills: pitchSkills.length > 0 ? pitchSkills : undefined,
        location_suburb: pitchForm.suburb || undefined,
        location_state: pitchForm.state || undefined,
        location_postcode: pitchForm.postcode || undefined,
        open_to_travel: pitchForm.openToTravel,
        coverage_radius_km: pitchForm.coverageRadiusKm,
        availability_days: availabilityDays,
        availability_mode: isFullTimeApplication ? 'FULL_TIME_NOTICE' : availabilityDays.length > 0 ? 'CASUAL_CALENDAR' : null,
        availability_summary: isFullTimeApplication ? 'Open to anytime' : undefined,
      };
      if (explorerProfileId) payload.explorer_profile = explorerProfileId;
      if (existingPostId) await updateExplorerPost(existingPostId, payload);
      else {
        const intent = await pendingStore.acquire(payload, normalizedRole);
        if (!isCurrentSave()) return;
        setPendingPitch(intent);
        await submitPendingPitch(pendingStore, intent, isCurrentSave, pitchAbortRef.current.signal);
        if (!isCurrentSave()) return;
        await pendingStore.resolve(intent.key);
        if (!isCurrentSave()) return;
        setPendingPitch(null);
      }
      if (!isCurrentSave()) return;
      try {
        await reload();
      } catch {}
      if (!isCurrentSave()) return;
      pitchDefaultsReady.current = null;
      setPitchOpen(false);
    } catch (err: any) {
      if (!isCurrentSave()) return;
      if (pendingStore) {
        try { const intent = await pendingStore.read(); if (isCurrentSave()) setPendingPitch(intent); }
        catch { if (isCurrentSave()) { setPendingPitch(null); setPendingReady(false); setPendingError('Your saved pitch could not be read. Review your pitches to recover.'); } }
      }
      if (!isCurrentSave()) return;
      const detail = err?.payload || err?.response?.data || err?.data || err;
      if (!existingPostId && err instanceof Error && !(err as any).payload) {
        setPitchError(err.message);
      } else if (detail && typeof detail === 'object') {
        const fieldMessages = Object.entries(detail)
          .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
          .join(' ');
        setPitchError(fieldMessages || 'Failed to save pitch.');
      } else {
        setPitchError(err?.message || 'Failed to save pitch.');
      }
    } finally {
      if (saveGeneration.current === currentSaveGen) {
        saveInFlightRef.current = false;
        if (isMountedRef.current && activeUserRef.current.id === currentUserId) {
          setPitchSaving(false);
        }
      }
    }
  };

  const finishPendingPitch = async () => {
    if (!pendingStore || !pendingPitch || saveInFlightRef.current) return;
    const accountId = user?.id;
    const accountRole = normalizedRole;
    const generation = ++saveGeneration.current;
    const isCurrent = () => isMountedRef.current && saveGeneration.current === generation && activeUserRef.current.id === accountId && activeUserRef.current.role === accountRole;
    saveInFlightRef.current = true;
    setPitchSaving(true);
    setPendingError(null);
    try {
      if (!pendingPitch.terminalCode && !pendingPitch.rejected) await submitPendingPitch(pendingStore, pendingPitch, isCurrent, pitchAbortRef.current.signal);
      if (!isCurrent()) return;
      await pendingStore.resolve(pendingPitch.key);
      if (!isCurrent()) return;
      setPendingPitch(null);
      try { await reload(); } catch {}
    } catch (err: any) {
      if (!isCurrent()) return;
      try {
        const intent = await pendingStore.read();
        if (isCurrent()) { setPendingPitch(intent); setPendingError(err?.message || 'Unable to finish your pitch. Please try again.'); }
      } catch {
        if (isCurrent()) { setPendingPitch(null); setPendingReady(false); setPendingError('Your saved pitch could not be read. Review your pitches to recover.'); }
      }
    } finally {
      if (saveGeneration.current === generation) {
        saveInFlightRef.current = false;
        if (isCurrent()) setPitchSaving(false);
      }
    }
  };

  const reviewCorruptPitch = async () => {
    if (!pendingStore || saveInFlightRef.current) return;
    const account = pitchAccount;
    const generation = ++saveGeneration.current;
    const isCurrent = () => isMountedRef.current && saveGeneration.current === generation && pitchAccountRef.current === account;
    saveInFlightRef.current = true;
    setPitchSaving(true);
    try {
      const mine = await getExplorerPostForEditing();
      if (!isCurrent()) return;
      Alert.alert('Review my pitches', mine
        ? 'A saved pitch was found. Confirm you have reviewed your pitches and want to recover.'
        : 'No saved pitch was found. Confirm you have reviewed your pitches and want to start a new posting intention.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => { void (async () => {
          if (!isCurrent()) return;
          try {
            await pendingStore.recoverCorruptAfterReview();
            if (!isCurrent()) return;
            try {
              const intent = await pendingStore.read();
              if (isCurrent()) { setPendingPitch(intent); setPendingReady(true); setPendingError(null); }
            } catch { if (isCurrent()) { setPendingPitch(null); setPendingReady(false); setPendingError('Your saved pitch could not be read. Review your pitches to recover.'); } }
          } catch (err: any) { if (isCurrent()) setPendingError(err?.message || 'Unable to recover your saved pitch.'); }
        })(); } },
      ]);
    } catch (err: any) {
      if (isCurrent()) setPendingError(err?.message || 'Unable to review your pitches.');
    } finally {
      if (saveGeneration.current === generation) {
        saveInFlightRef.current = false;
        if (isCurrent()) setPitchSaving(false);
      }
    }
  };

  const handleRequestDelete = useCallback(() => {
    if (saveInFlightRef.current || pitchSaving || !existingPostId || pitchDeleting || deleteInFlightRef.current || deleteConfirmState.open) return;
    const token = ++deleteTokenCounter.current;
    activeDeleteTokenRef.current = token;
    const liveUser = activeUserRef.current;
    const currentAccountKey = `${liveUser.id ?? 'anon'}:${liveUser.role ?? ''}`;
    const headline = pitchForm.headline?.trim() || `${roleTitle || 'Talent'} availability`;
    const reference = existingReferenceCode || (existingPostId ? `REF-${existingPostId}` : '');
    setPitchError(null);
    setDeleteConfirmState({
      open: true,
      postId: existingPostId,
      referenceCode: reference,
      headline,
      token,
      accountKey: currentAccountKey,
    });
  }, [deleteConfirmState.open, existingPostId, existingReferenceCode, pitchDeleting, pitchForm.headline, pitchSaving, roleTitle]);

  const handleCancelDelete = useCallback(() => {
    if (pitchDeleting || deleteInFlightRef.current) return;
    activeDeleteTokenRef.current = null;
    setDeleteConfirmState((prev) => ({ ...prev, open: false }));
  }, [pitchDeleting]);

  const handleConfirmDelete = useCallback(async () => {
    const { postId, token, accountKey } = deleteConfirmState;
    const liveUser = activeUserRef.current;
    const liveAccountKey = `${liveUser?.id ?? 'anon'}:${liveUser?.role ?? ''}`;

    // BEFORE dispatch:
    // 1. Synchronous mutex guard
    if (deleteInFlightRef.current || saveInFlightRef.current) return;
    // 2. Active token guard: token must match activeDeleteTokenRef.current and not be consumed
    if (!token || token !== activeDeleteTokenRef.current || consumedTokensRef.current.has(token)) return;
    // 3. Post identity guard: postId must match activeEditorPostIdRef.current (live ref, not stale closure)
    if (!postId || postId !== activeEditorPostIdRef.current) return;
    // 4. Live identity guard: accountKey must match liveAccountKey and user must exist
    if (!liveUser?.id || accountKey !== liveAccountKey) return;
    // 5. Unmount guard
    if (!isMountedRef.current) return;

    // Synchronously consume token, invalidate active token ref, acquire mutex
    activeDeleteTokenRef.current = null;
    consumedTokensRef.current.add(token);
    deleteInFlightRef.current = true;
    const currentOpId = ++deleteOperationIdRef.current;
    setPitchDeleting(true);

    try {
      await deleteExplorerPost(postId);
      // AFTER dispatch:
      if (!isMountedRef.current || currentOpId !== deleteOperationIdRef.current) return;
      const postUser = activeUserRef.current;
      if (!postUser?.id || accountKey !== `${postUser.id}:${postUser.role}`) return;

      // Isolate feed reload error so background feed failure does not turn committed delete into an error
      try {
        await reload();
      } catch {}

      // AFTER await reload: recheck account and generation before closing/messaging
      if (!isMountedRef.current || currentOpId !== deleteOperationIdRef.current) return;
      const postReloadUser = activeUserRef.current;
      if (!postReloadUser?.id || accountKey !== `${postReloadUser.id}:${postReloadUser.role}`) return;

      activeEditorPostIdRef.current = null;
      setDeleteConfirmState({
        open: false,
        postId: null,
        referenceCode: null,
        headline: null,
        token: 0,
        accountKey: '',
      });
      resetPitchForm();
      setPitchOpen(false);
    } catch (err: any) {
      if (!isMountedRef.current || currentOpId !== deleteOperationIdRef.current) return;
      const errUser = activeUserRef.current;
      if (!errUser?.id || accountKey !== `${errUser.id}:${errUser.role}`) return;

      try {
        await reload();
      } catch {}

      // Recheck account & generation after error reload
      if (!isMountedRef.current || currentOpId !== deleteOperationIdRef.current) return;
      const postReloadErrUser = activeUserRef.current;
      if (!postReloadErrUser?.id || accountKey !== `${postReloadErrUser.id}:${postReloadErrUser.role}`) return;

      // Reconcile EDITOR via authoritative getExplorerPostForEditing
      let mine: any = undefined;
      try {
        mine = await getExplorerPostForEditing();
      } catch {
        mine = undefined;
      }

      if (!isMountedRef.current || currentOpId !== deleteOperationIdRef.current) return;
      const postReconcileUser = activeUserRef.current;
      if (!postReconcileUser?.id || accountKey !== `${postReconcileUser.id}:${postReconcileUser.role}`) return;

      setDeleteConfirmState((prev) => ({ ...prev, open: false }));

      if (mine === null || (mine !== undefined && mine.id !== postId)) {
        // The server actually committed the delete or post no longer belongs to worker.
        // Clean up editor state and close so stale delete button or form is not retained.
        activeEditorPostIdRef.current = null;
        resetPitchForm();
        setPitchOpen(false);
      } else {
        // Post still exists on server, or getter threw an error.
        // Keep clear error and avoid blind resubmit.
        const detail = err?.response?.data || err?.data || err;
        const msg = typeof detail === 'object' && detail?.detail ? detail.detail : err?.message || 'Failed to delete pitch.';
        setPitchError(msg);
      }
    } finally {
      // finally can't release newer operation!
      if (currentOpId === deleteOperationIdRef.current) {
        deleteInFlightRef.current = false;
        if (isMountedRef.current) {
          setPitchDeleting(false);
        }
      }
    }
  }, [deleteConfirmState, reload, resetPitchForm]);

  const showPitchButton = !publicMode && !hidePitchButton && canPitch;
  const requestedPitchOpened = useRef(false);
  useEffect(() => {
    if (!openPitchOnMount) requestedPitchOpened.current = false;
  }, [openPitchOnMount]);

  const tryOpenRequestedPitch = useCallback(() => {
    // A deep-link is a one-time create intent, not a request to re-open the dialog on every tab focus.
    if (!openPitchOnMount || publicMode || !canPitch || requestedPitchOpened.current) return;
    requestedPitchOpened.current = true;
    setPitchOpen(true);
  }, [canPitch, openPitchOnMount, publicMode]);

  useEffect(() => {
    tryOpenRequestedPitch();
  }, [tryOpenRequestedPitch]);

  useFocusEffect(
    useCallback(() => {
      void retryEligibility();
    }, [retryEligibility])
  );

  useFocusEffect(
    useCallback(() => {
      tryOpenRequestedPitch();
    }, [tryOpenRequestedPitch])
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <AvailabilitySidebar candidate={selectedCalendarCandidate} onClose={() => setSelectedCalendarCandidate(null)} canRequestBooking={canRequestBooking} onRequestBooking={handleRequestBooking} currentUserId={user?.id ?? null} />
      <FiltersSidebar
        visible={isSidebarOpen}
        onDismiss={() => setIsSidebarOpen(false)}
        filters={filters}
        onChange={setFilters}
        roleOptions={roleOptions}
        stateOptions={stateOptions}
        workTypeOptions={allWorkTypes}
        roleSkillOptions={roleSkillOptions}
        softwareOptions={softwareOptions}
        expandedRoleSkills={expandedRoleSkills}
        onToggleRoleSkillExpand={(role) => setExpandedRoleSkills((prev) => ({ ...prev, [role]: !prev[role] }))}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); try { await Promise.all([reload(), retryEligibility()]); } finally { setRefreshing(false); } }} tintColor="#6366F1" />}
      >
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {pendingPitch || pendingError ? (
          <View style={styles.emptyBox}>
            <Text variant="titleMedium" style={{ fontWeight: '700' }}>Saved pitch needs attention</Text>
            <Text style={styles.subtitle} accessibilityLiveRegion="polite">
              {pendingError || (pendingPitch?.terminalCode === 'PITCH_DELETED' ? 'This pitch was deleted.' : pendingPitch?.terminalCode === 'IDEMPOTENCY_REPLAY_EXPIRED' ? 'This pitch retry has expired. Review your saved pitches before starting again.' : pendingPitch?.terminalCode ? 'This save key was used for a different pitch. Review your saved pitches before starting again.' : pendingPitch?.rejected ? 'The pitch was rejected. Review your saved pitches before starting again.' : 'A pitch save is waiting to finish. Retry to send the saved pitch.')}
            </Text>
            {!pendingPitch && pendingError ? <Button mode="outlined" disabled={pitchSaving} onPress={() => void reviewCorruptPitch()}>Review my pitches</Button> : null}
            {pendingPitch ? <Button mode="outlined" disabled={pitchSaving} onPress={() => void finishPendingPitch()}>{pendingPitch.terminalCode || pendingPitch.rejected ? 'I have reviewed my pitches' : 'Finish saving pitch'}</Button> : null}
          </View>
        ) : null}
        {isTalentStaff && eligibilityStatus === 'error' ? (
          <View style={styles.emptyBox}>
            <Text variant="titleMedium" style={{ fontWeight: '700' }}>Unable to verify publishing eligibility</Text>
            <Text style={styles.subtitle}>
              {eligibilityError || 'Could not verify your public availability eligibility due to a network issue.'}
            </Text>
            <Button mode="outlined" onPress={retryEligibility}>
              Retry eligibility check
            </Button>
          </View>
        ) : null}
        {isTalentStaff && eligibilityStatus === 'ineligible' && staffPublicAccess === false ? (
          <View style={styles.emptyBox}>
            <Text variant="titleMedium" style={{ fontWeight: '700' }}>Public Talent profile verification required</Text>
            <Text style={styles.subtitle}>
              Your pharmacy invitation gives you internal access. Verify your public-platform profile before publishing availability.
            </Text>
            <Button
              mode="outlined"
              onPress={() => router.push((normalizedRole === 'PHARMACIST' ? '/pharmacist/profile' : '/otherstaff/profile') as any)}
            >
              Open public profile
            </Button>
          </View>
        ) : null}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text variant="headlineSmall" style={styles.title}>Find Talent</Text>
            <Text style={styles.subtitle}>{loading ? 'Loading...' : `Showing ${processedCandidates.length} active candidates matching your criteria`}</Text>
            <View style={{ alignSelf: 'flex-start', marginLeft: -8 }}><BadgeGuideButton /></View>
          </View>
          <IconButton icon="tune" onPress={() => setIsSidebarOpen(true)} />
        </View>
        {activeFilterCount > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {filters.willingToTravel ? <Chip onClose={() => setFilters((prev) => ({ ...prev, willingToTravel: !prev.willingToTravel }))}>Open to Travel</Chip> : null}
            {filters.placementSeeker ? <Chip onClose={() => setFilters((prev) => ({ ...prev, placementSeeker: !prev.placementSeeker }))}>Interns/Students</Chip> : null}
            <Chip mode="outlined" onPress={clearAllFilters}>Clear All</Chip>
          </ScrollView>
        ) : null}
        <View style={{ gap: 10 }}>
          {pagedCandidates.length > 0
            ? pagedCandidates.map((candidate) => (
                <TalentCardV2
                  key={candidate.id}
                  candidate={candidate}
                  onViewCalendar={handleViewCalendar}
                  onRequestBooking={handleBookTalent}
                  onToggleLike={handleToggleLike}
                  canViewAvailability={!publicMode}
                  canRequestBooking={canRequestBooking}
                />
              ))
            : !loading
              ? (
                <View style={styles.emptyBox}>
                  <Text variant="titleMedium" style={{ fontWeight: '700' }}>No candidates found</Text>
                  <Text style={styles.subtitle}>We could not find any staff profiles matching your criteria.</Text>
                  <Button mode="outlined" onPress={clearAllFilters}>Reset Filters</Button>
                </View>
                )
              : null}
        </View>
        <View style={styles.paginationRow}>
          <Button mode="outlined" disabled={page <= 1} onPress={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
          <Text style={styles.subtitle}>Page {page} / {pageCount}</Text>
          <Button mode="outlined" disabled={page >= pageCount} onPress={() => setPage((p) => Math.min(pageCount, p + 1))}>Next</Button>
        </View>
      </ScrollView>
      {showPitchButton ? <TouchableOpacity style={styles.fab} onPress={() => { if (!pitchDeleting && !deleteConfirmState.open) setPitchOpen(true); }}><IconButton icon="plus" iconColor="#FFFFFF" style={{ margin: 0 }} /></TouchableOpacity> : null}
      <PitchDialog
        open={pitchOpen}
        onClose={() => {
          if (saveInFlightRef.current || deleteInFlightRef.current || pitchSaving || pitchDeleting || deleteConfirmState.open) return;
          pitchGuard.confirmDiscard(() => {
            pitchDefaultsReady.current = null;
            pitchLoadGeneration.current += 1;
            setPitchOpen(false);
          });
        }}
        onSave={handlePitchSave}
        isExplorer={isExplorer}
        existingPostId={existingPostId}
        existingReferenceCode={existingReferenceCode}
        pitchForm={pitchForm}
        setPitchForm={(action) => { if (!saveInFlightRef.current) setPitchForm(action); }}
        isSaveInFlight={() => saveInFlightRef.current}
        onSlotDraftDirtyChange={setSlotDraftDirty}
        pitchError={pitchError}
        pitchSaving={pitchSaving}
        defaultsStatus={pitchDefaultsStatus}
        onRetryDefaults={loadPitchDefaults}
        deleteConfirmOpen={deleteConfirmState.open}
        deleteBusy={pitchDeleting}
        capturedPostId={deleteConfirmState.postId}
        capturedReferenceCode={deleteConfirmState.referenceCode}
        capturedHeadline={deleteConfirmState.headline}
        onRequestDelete={handleRequestDelete}
        onConfirmDelete={handleConfirmDelete}
        onCancelDelete={handleCancelDelete}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scroll: { flex: 1 },
  content: { padding: 12, paddingBottom: 80, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontWeight: '700', color: '#111827' },
  subtitle: { color: '#6B7280' },
  errorText: { color: '#DC2626', marginBottom: 4 },
  chipsRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  emptyBox: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, backgroundColor: '#FFFFFF', padding: 20, alignItems: 'center', gap: 8 },
  paginationRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center', elevation: 6 },
});

export default function TalentBoard(props: TalentBoardProps) {
  const { user } = useAuth();
  const normalizedRole = String(user?.role || '').trim().toUpperCase().replace(/\s+/g, '_');
  const accountKey = `${user?.id ?? 'anon'}:${normalizedRole}`;
  return <TalentBoardInner key={accountKey} {...props} />;
}
