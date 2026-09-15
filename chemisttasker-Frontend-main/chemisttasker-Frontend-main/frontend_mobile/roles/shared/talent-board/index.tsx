import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Button, Chip, IconButton, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { API_BASE_URL } from '@/constants/api';
import {
  createExplorerPost,
  deleteExplorerPost,
  fetchUserAvailabilityService,
  getOnboarding,
  getRatingsSummary,
  likeExplorerPost,
  unlikeExplorerPost,
  updateExplorerPost,
} from '@chemisttasker/shared-core';
import { ENGAGEMENT_LABELS } from './constants';
import { Candidate } from './types';
import { useTalentFeed } from './useTalentFeed';
import { useTalentFilters } from './useTalentFilters';
import AvailabilitySidebar from './components/AvailabilitySidebar';
import FiltersSidebar, { TalentFilterState } from './components/FiltersSidebar';
import PitchDialog, { PitchFormState } from './components/PitchDialog';
import TalentCardV2 from './components/TalentCardV2';

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/(^|\s)\S/g, (t) => t.toUpperCase());

const formatRoleLabel = (role?: string | null) => {
  if (!role) return 'Explorer';
  return titleCase(role);
};

const formatWorkType = (workType?: string | null) => {
  if (!workType) return '';
  return titleCase(workType);
};

const mapRoleToShiftRole = (value?: string | null) => {
  if (!value) return '';
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '_');
  if (['PHARMACIST', 'INTERN', 'STUDENT', 'ASSISTANT', 'TECHNICIAN', 'EXPLORER'].includes(normalized)) {
    return normalized;
  }
  if (normalized.includes('OTHER_STAFF')) return 'ASSISTANT';
  if (normalized.includes('COMMUNITY_PHARMACIST')) return 'PHARMACIST';
  if (normalized.includes('DISPENSARY_TECHNICIAN')) return 'TECHNICIAN';
  if (normalized.includes('PHARMACY_TECHNICIAN')) return 'TECHNICIAN';
  if (normalized.includes('PHARMACY_ASSISTANT')) return 'ASSISTANT';
  if (normalized.includes('PHARMACIST')) return 'PHARMACIST';
  if (normalized.includes('TECHNICIAN')) return 'TECHNICIAN';
  if (normalized.includes('ASSISTANT')) return 'ASSISTANT';
  if (normalized.includes('INTERN')) return 'INTERN';
  if (normalized.includes('STUDENT')) return 'STUDENT';
  return '';
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
      notes: entry?.notes || '',
    }))
  ).filter((slot) => slot.date >= todayIso());
const allWorkTypes = Object.values(ENGAGEMENT_LABELS);

type SkillItem = {
  code: string;
  label: string;
  description?: string;
  requires_certificate?: boolean;
};
type RoleCatalog = {
  clinical_services: SkillItem[];
  dispense_software: SkillItem[];
  expanded_scope: SkillItem[];
};
type SkillsCatalog = {
  pharmacist: RoleCatalog;
  otherstaff: RoleCatalog;
};

const catalog = require('@chemisttasker/shared-core/skills_catalog.json') as SkillsCatalog;

const buildSkillMaps = () => {
  const codeToLabel = new Map<string, string>();
  const codeToCategory = new Map<string, 'clinical_services' | 'dispense_software' | 'expanded_scope'>();
  (['pharmacist', 'otherstaff'] as const).forEach((roleKey) => {
    const role = catalog[roleKey];
    if (!role) return;
    (['clinical_services', 'dispense_software', 'expanded_scope'] as const).forEach((category) => {
      role[category]?.forEach((item) => {
        if (!item?.code) return;
        if (!codeToLabel.has(item.code)) codeToLabel.set(item.code, item.label || item.code);
        if (!codeToCategory.has(item.code)) codeToCategory.set(item.code, category);
      });
    });
  });
  return { codeToLabel, codeToCategory };
};

const { codeToLabel, codeToCategory } = buildSkillMaps();

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

export default function TalentBoard({
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
  const error = externalError ?? feed.error;
  const reload = feed.reload;
  const { user } = useAuth();
  const router = useRouter();

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
        const clinicalServices: string[] = [];
        const dispenseSoftware: string[] = [];
        const expandedScope: string[] = [];
        const otherSkills: string[] = [];
        rawSkills.forEach((code) => {
          const label = codeToLabel.get(code) ?? code;
          const category = codeToCategory.get(code);
          if (category === 'clinical_services') clinicalServices.push(label);
          else if (category === 'dispense_software') dispenseSoftware.push(label);
          else if (category === 'expanded_scope') expandedScope.push(label);
          else otherSkills.push(label);
        });
        const skills = Array.from(new Set([...clinicalServices, ...expandedScope, ...otherSkills])).filter(Boolean) as string[];
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

  const canPitch = useMemo(() => {
    return ['EXPLORER', 'PHARMACIST', 'OTHER_STAFF'].includes(normalizedRole);
  }, [normalizedRole]);

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
    const shiftRole =
      mapRoleToShiftRole(candidate.rawRoleCategory) ||
      mapRoleToShiftRole(candidate.explorerRoleType) ||
      mapRoleToShiftRole(candidate.role);
    const firstSlot = (candidate.availableSlots || []).find((slot: any) => uniqueDates.includes(slot.date));
    const startTime = firstSlot?.startTime || firstSlot?.start_time || null;
    const endTime = firstSlot?.endTime || firstSlot?.end_time || null;
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
    try {
      if (candidate.isLikedByMe) await unlikeExplorerPost(candidate.id);
      else await likeExplorerPost(candidate.id);
      await reload();
    } catch {}
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
  const [pitchError, setPitchError] = useState<string | null>(null);
  const [existingPostId, setExistingPostId] = useState<number | null>(null);
  const [roleTitle, setRoleTitle] = useState<string>('Explorer');
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

  const isExplorer = user?.role === 'EXPLORER';
  const isPharmacist = user?.role === 'PHARMACIST';
  const isOtherStaff = user?.role === 'OTHER_STAFF';

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
    setExplorerProfileId(null);
    setRoleTitle('Explorer');
    setPitchSkills([]);
  }, []);

  const loadPitchDefaults = useCallback(async () => {
    if (!user) return;
    setPitchError(null);
    resetPitchForm();
    let onboardingSkills: string[] = [];
    let inheritedAvailabilitySlots: PitchFormState['availabilitySlots'] = [];
    try {
      inheritedAvailabilitySlots = mapAvailabilityToPitchSlots(await fetchUserAvailabilityService().catch(() => []));
      if (isExplorer) {
        const onboarding: any = await getOnboarding('explorer');
        setRoleTitle((onboarding?.role_type || 'Explorer').replace('_', ' '));
        setExplorerProfileId(onboarding?.id ?? null);
      } else if (isPharmacist) {
        const onboarding: any = await getOnboarding('pharmacist');
        setRoleTitle('Pharmacist');
        onboardingSkills = Array.isArray(onboarding?.skills) ? onboarding.skills : [];
      } else if (isOtherStaff) {
        const onboarding: any = await getOnboarding('other_staff');
        setRoleTitle((onboarding?.role_type || 'Other Staff').replace('_', ' '));
        onboardingSkills = Array.isArray(onboarding?.skills) ? onboarding.skills : [];
        }
        const mine = posts.find((post) => post.authorUserId === user?.id);
        if (mine) {
          const minePostKind =
            mine.postKind ||
            (mine.availabilityMode === 'FULL_TIME_NOTICE' ? 'FULL_TIME_APPLICATION' : 'AVAILABILITY');
          setExistingPostId(mine.id);
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
    } catch (err: any) {
      setPitchError(err?.message || 'Failed to load your profile.');
    }
  }, [isExplorer, isOtherStaff, isPharmacist, posts, resetPitchForm, user]);

  useEffect(() => {
    if (pitchOpen) void loadPitchDefaults();
  }, [loadPitchDefaults, pitchOpen]);

  const updateOnboardingLocationPrefs = useCallback(async () => {
    if (!API_BASE_URL) return;
    const safeRole = isOtherStaff ? 'otherstaff' : isPharmacist ? 'pharmacist' : 'explorer';
    const form = new FormData();
    form.append('street_address', pitchForm.streetAddress || '');
    form.append('suburb', pitchForm.suburb || '');
    form.append('state', pitchForm.state || '');
    form.append('postcode', pitchForm.postcode || '');
    form.append('open_to_travel', pitchForm.openToTravel ? 'true' : 'false');
    form.append('travel_states', JSON.stringify(pitchForm.travelStates || []));
    form.append('coverage_radius_km', String(pitchForm.coverageRadiusKm || 0));
    const response = await fetch(`${API_BASE_URL}/client-profile/${safeRole}/onboarding/me/`, {
      method: 'PATCH',
      credentials: 'include',
      body: form,
    });
    if (!response.ok) throw new Error('Failed to update location preferences');
  }, [isOtherStaff, isPharmacist, pitchForm]);

  const handlePitchSave = async () => {
    setPitchSaving(true);
    setPitchError(null);
    try {
      await updateOnboardingLocationPrefs();
      const isFullTimeApplication = pitchForm.postKind === 'FULL_TIME_APPLICATION';
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
      else await createExplorerPost(payload);
      await reload();
      setPitchOpen(false);
    } catch (err: any) {
      const detail = err?.response?.data || err?.data || err;
      if (detail && typeof detail === 'object') {
        const fieldMessages = Object.entries(detail)
          .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
          .join(' ');
        setPitchError(fieldMessages || 'Failed to save pitch.');
      } else {
        setPitchError(err?.message || 'Failed to save pitch.');
      }
    } finally {
      setPitchSaving(false);
    }
  };

  const showPitchButton = !publicMode && !hidePitchButton && canPitch;

  useFocusEffect(
    useCallback(() => {
      if (!openPitchOnMount || publicMode || !canPitch) return;
      setPitchOpen(true);
    }, [canPitch, openPitchOnMount, publicMode])
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }} tintColor="#6366F1" />}
      >
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text variant="headlineSmall" style={styles.title}>Find Talent</Text>
            <Text style={styles.subtitle}>{loading ? 'Loading...' : `Showing ${processedCandidates.length} active candidates matching your criteria`}</Text>
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
      {showPitchButton ? <TouchableOpacity style={styles.fab} onPress={() => setPitchOpen(true)}><IconButton icon="plus" iconColor="#FFFFFF" style={{ margin: 0 }} /></TouchableOpacity> : null}
      <PitchDialog
        open={pitchOpen}
        onClose={() => setPitchOpen(false)}
        onSave={handlePitchSave}
        onDelete={async () => {
          if (!existingPostId) return;
          await deleteExplorerPost(existingPostId);
          await reload();
          setPitchOpen(false);
        }}
        isExplorer={isExplorer}
        existingPostId={existingPostId}
        pitchForm={pitchForm}
        setPitchForm={setPitchForm}
        pitchError={pitchError}
        pitchSaving={pitchSaving}
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
