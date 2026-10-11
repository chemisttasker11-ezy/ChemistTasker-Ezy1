import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Alert, Box, Button, Chip, Divider, Drawer, IconButton, Paper, Stack, Pagination, Typography, Dialog } from "@mui/material";
import { Megaphone, SlidersHorizontal } from "lucide-react";
import PageHeader from "../../../../components/ui/PageHeader";
import {
  Close as CloseIcon,
} from "@mui/icons-material";
import { useTalentFeed } from "./hooks/useTalentFeed";
import { useTalentFilters } from "./hooks/useTalentFilters";
import PitchDialog, { PitchFormState } from "./components/PitchDialog";
import AvailabilitySidebar from "./components/AvailabilitySidebar";
import TalentCardV2 from "./components/TalentCardV2";
import DashboardContentState from "../../../../components/dashboard/DashboardContentState";
import FiltersSidebar, { TalentFilterState } from "./components/FiltersSidebar";
const PostShiftPage = lazy(() => import("../PostShiftPage"));
import { Candidate } from "./types";
import { formatRoleLabel, formatWorkType, mapRoleToShiftRole, mapAvailabilityToPitchSlots, allWorkTypes, codeToCategory, resolveTalentSkillCode, resolveTalentSkillLabel, isIsoDate, todayIso } from "./talentModel";
import { useAuth } from "../../../../contexts/AuthContext";
import {
  canPublishTalent,
  createExplorerPost,
  deleteExplorerPost,
  fetchUserAvailabilityService,
  getOnboarding,
  getRatingsSummary,
  likeExplorerPost,
  unlikeExplorerPost,
  updateOnboardingForm,
  updateExplorerPost,
} from "@chemisttasker/shared-core";
import { otherStaffRoleLabel } from "../../../../utils/roleLabels";

type TalentBoardProps = {
  publicMode?: boolean;
  externalPosts?: Record<string, any>[];
  externalLoading?: boolean;
  externalError?: string | null;
  onRequireLogin?: (reason?: "like" | "calendar" | "booking") => void;
};

const TalentBoard: React.FC<TalentBoardProps> = ({
  publicMode = false,
  externalPosts,
  externalLoading,
  externalError,
  onRequireLogin,
}) => {
  const feed = useTalentFeed({ enabled: !publicMode });
  const posts = externalPosts ?? feed.posts;
  const loading = externalLoading ?? feed.loading;
  const error = externalError ?? feed.error;
  const reload = feed.reload;
  const { user, isAdminUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [filters, setFilters] = useState<TalentFilterState>({
    search: "",
    roles: [] as string[],
    workTypes: [] as string[],
    states: [] as string[],
    skills: [] as string[],
    willingToTravel: false,
    placementSeeker: false,
    availabilityStart: null,
    availabilityEnd: null,
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedCalendarCandidate, setSelectedCalendarCandidate] = useState<Candidate | null>(null);
  const [isPostShiftModalOpen, setIsPostShiftModalOpen] = useState(false);
  const [previousSearch, setPreviousSearch] = useState(location.search);
  const [expandedRoleSkills, setExpandedRoleSkills] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [ratingSummary, setRatingSummary] = useState<Record<number, { average: number; count: number }>>({});
  const ratingFetchRef = useRef<Set<number>>(new Set());


  const candidates = useMemo<Candidate[]>(() => {
    return posts.map((post) => {
      const roleLabel = formatRoleLabel(post.roleTitle || post.explorerRoleType || post.roleCategory);
      const workTypes =
        Array.isArray((post as any).workTypes) && (post as any).workTypes.length
          ? (post as any).workTypes.map((w: string) => formatWorkType(w))
          : [];
      const city = post.locationSuburb || post.locationState || "";
      const state = post.locationState || "";
      const coverageRadius = post.coverageRadiusKm ? `+${post.coverageRadiusKm}km` : "Local";
      const willingToTravel = Boolean(post.openToTravel);
      const travelStates = Array.isArray((post as any).travelStates)
        ? (post as any).travelStates
        : Array.isArray((post as any).travel_states)
          ? (post as any).travel_states
          : [];
      const ahpraYears =
        (post as any).ahpraYearsSinceFirstRegistration ??
        (post as any).ahpra_years_since_first_registration ??
        null;
      const yearsExperience =
        (post as any).yearsExperience ?? (post as any).years_experience ?? null;
      const experienceBadge =
        roleLabel.includes("Pharmacist") && ahpraYears != null
          ? `${ahpraYears} yrs AHPRA`
          : roleLabel.includes("Pharmacy") || roleLabel.includes("Assistant") || roleLabel.includes("Technician")
            ? (yearsExperience ? `${yearsExperience} yrs exp` : null)
            : null;
      const pitchText = post.body || (post as any).shortBio || "";
      const availabilityMode = post.availabilityMode || null;
      const postKind =
        post.postKind ||
        (availabilityMode === "FULL_TIME_NOTICE" ? "FULL_TIME_APPLICATION" : "AVAILABILITY");
      const isFullTimeApplication = postKind === "FULL_TIME_APPLICATION";

      const availabilityRaw = Array.isArray(post.availabilityDays) ? post.availabilityDays : [];
      const availableSlots = availabilityRaw
        .map((entry: any) => {
          if (typeof entry === "string") {
            return { date: entry, startTime: null, endTime: null, isAllDay: false };
          }
          if (entry && typeof entry === "object") {
            return {
              date: String(entry.date || ""),
              startTime: entry.start_time || entry.startTime || entry.start || null,
              endTime: entry.end_time || entry.endTime || entry.end || null,
              isAllDay: Boolean(entry.is_all_day ?? entry.isAllDay),
            };
          }
          return null;
        })
        .filter(
          (entry: any): entry is { date: string; startTime?: string | null; endTime?: string | null; isAllDay?: boolean } =>
            Boolean(entry && isIsoDate(entry.date) && entry.date >= todayIso())
        ) as Array<{ date: string; startTime?: string | null; endTime?: string | null; isAllDay?: boolean }>;
      const availableDates = availableSlots.map((slot: any) => slot.date);

      const showCalendar = !isFullTimeApplication && availableDates.length > 0;

      const rawSkills = Array.from(new Set([...(post.software ?? []), ...(post.skills ?? [])])).filter(Boolean) as string[];
      const clinicalServices: string[] = [];
      const dispenseSoftware: string[] = [];
      const expandedScope: string[] = [];
      const otherSkills: string[] = [];
      rawSkills.forEach((code) => {
        const canonical = resolveTalentSkillCode(code);
        if (!canonical) return;
        const label = canonical;
        const category = codeToCategory.get(canonical);
        if (category === "clinical_services") clinicalServices.push(label);
        else if (category === "dispense_software") dispenseSoftware.push(label);
        else if (category === "expanded_scope") expandedScope.push(label);
        else otherSkills.push(label);
      });
      const skills = Array.from(new Set([...clinicalServices, ...expandedScope, ...otherSkills])).filter(Boolean) as string[];
      const ratingFromPostAverageRaw =
        (post as any).ratingAverage ??
        (post as any).rating_average ??
        (post as any).rating?.average ??
        null;
      const ratingFromPostCountRaw =
        (post as any).ratingCount ??
        (post as any).rating_count ??
        (post as any).rating?.count ??
        null;
      const ratingFromPostAverage = Number.isFinite(Number(ratingFromPostAverageRaw))
        ? Number(ratingFromPostAverageRaw)
        : null;
      const ratingFromPostCount = Number.isFinite(Number(ratingFromPostCountRaw))
        ? Number(ratingFromPostCountRaw)
        : null;

      const rating = post.authorUserId != null ? ratingSummary[post.authorUserId] : undefined;
      const ratingAverage = rating?.average ?? ratingFromPostAverage ?? 0;
      const ratingCount = rating?.count ?? ratingFromPostCount ?? 0;

      return {
        id: post.id,
        refId: post.referenceCode
          ? post.referenceCode.startsWith("REF-")
            ? post.referenceCode
            : `REF-${post.referenceCode}`
          : "REF-0000",
        role: roleLabel,
        headline: post.headline || "",
        body: post.body || "",
        city,
        state,
        coverageRadius,
        workTypes,
        willingToTravel,
        pitch: pitchText,
        travelStates,
        experienceBadge,
        skills,
        software: dispenseSoftware,
        clinicalServices,
        dispenseSoftware,
        expandedScope,
        experience: null,
        availabilityText: isFullTimeApplication ? "Open anytime" : "",
        availabilityMode,
        postKind,
        isFullTimeApplication,
        showCalendar,
        availableDates,
        availableSlots,
        isInternshipSeeker:
          roleLabel.includes("Student") ||
          roleLabel.includes("Intern") ||
          workTypes.some((type: string) => ["Placement", "Volunteering"].includes(type)),
        ratingAverage,
        ratingCount,
        likeCount: typeof post.like_count === "number" ? post.like_count : 0,
        isLikedByMe: Boolean(post.is_liked_by_me),
        authorUserId: post.authorUserId ?? null,
        explorerUserId: post.explorerUserId ?? null,
        isExplorer:
          (post.roleCategory || "").toUpperCase() === "EXPLORER" ||
          post.explorerProfileId != null,
        rawRoleCategory: post.roleCategory ?? null,
        explorerRoleType: post.explorerRoleType ?? null,
        explorerProfileId: post.explorerProfileId ?? null,
      };
    });
  }, [posts, ratingSummary]);

  const {
    filtered: processedCandidates,
    roleOptions,
    stateOptions,
    roleSkillOptions,
    softwareOptions,
  } = useTalentFilters(candidates, filters);






  const pageCount = Math.max(1, Math.ceil(processedCandidates.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [
    filters.search,
    filters.roles,
    filters.workTypes,
    filters.states,
    filters.skills,
    filters.willingToTravel,
    filters.placementSeeker,
    filters.availabilityStart,
    filters.availabilityEnd,
  ]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const pagedCandidates = useMemo(() => {
    const start = (page - 1) * pageSize;
    return processedCandidates.slice(start, start + pageSize);
  }, [processedCandidates, page]);

  // Ratings for the people on the visible page only (one request each, applied together). Fetching every
  // profile's rating up front sent hundreds of requests and re-rendered the board for each answer.
  useEffect(() => {
    if (!user) return;
    const ids = Array.from(new Set(pagedCandidates.map((candidate) => candidate.authorUserId)))
      .filter((id): id is number => typeof id === "number" && !ratingFetchRef.current.has(id));
    if (!ids.length) return;
    ids.forEach((id) => ratingFetchRef.current.add(id));
    Promise.allSettled(ids.map((id) => getRatingsSummary({ target_type: "worker", target_id: id }))).then((results) => {
      const next: Record<number, { average: number; count: number }> = {};
      results.forEach((result, index) => {
        if (result.status !== "fulfilled") {
          ratingFetchRef.current.delete(ids[index]); // retry next time the person is shown
          return; // leave unset so any rating data already in the post payload is used
        }
        const res: any = result.value;
        const average = Number(res?.average ?? 0);
        const count = Number(res?.count ?? 0);
        next[ids[index]] = { average: Number.isFinite(average) ? average : 0, count: Number.isFinite(count) ? count : 0 };
      });
      if (Object.keys(next).length) setRatingSummary((prev) => ({ ...prev, ...next }));
    });
  }, [pagedCandidates, user?.id]);

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

  const toggleFilter = (category: keyof typeof filters, value: string) => {
    setFilters((prev) => {
      const current = prev[category] as string[];
      if (current.includes(value)) {
        return { ...prev, [category]: current.filter((item) => item !== value) } as typeof prev;
      }
      return { ...prev, [category]: [...current, value] } as typeof prev;
    });
  };

  const toggleBooleanFilter = (key: "willingToTravel" | "placementSeeker") => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleRoleSkillExpand = (role: string) => {
    setExpandedRoleSkills((prev) => ({ ...prev, [role]: !prev[role] }));
  };


  const canRequestBooking = useMemo(() => {
    if (!user) return false;
    const roleKey = (user.role || "").toUpperCase();
    if (
      [
        "OWNER",
        "PHARMACY_ADMIN",
        "PHARMACY_OWNER",
        "ORG_ADMIN",
        "ORG_OWNER",
        "ORG_STAFF",
        "CHIEF_ADMIN",
        "REGION_ADMIN",
        "ORGANIZATION",
      ].includes(roleKey)
    ) {
      return true;
    }
    return Boolean(isAdminUser);
  }, [user, isAdminUser]);

  const handleViewCalendar = useCallback(
    (candidate: Candidate) => {
      if (publicMode) {
        onRequireLogin?.("calendar");
        return;
      }
      setSelectedCalendarCandidate(candidate);
    },
    [publicMode, onRequireLogin]
  );

  const handleRequestBooking = useCallback((candidate: Candidate, dates: string[]) => {
    if (!canRequestBooking) return;
    const targetUserId = candidate.authorUserId ?? candidate.explorerUserId ?? null;
    if (!targetUserId) return;
    const uniqueDates = Array.from(new Set(dates)).sort();
    const params = new URLSearchParams(location.search);
    if (uniqueDates.length > 0) {
      params.set("dates", uniqueDates.join(","));
      const firstSlot = (candidate.availableSlots || []).find((slot) => uniqueDates.includes(slot.date));
      const startTime = firstSlot?.startTime || (firstSlot as any)?.start_time || null;
      const endTime = firstSlot?.endTime || (firstSlot as any)?.end_time || null;
      if (startTime) params.set("start_time", String(startTime).slice(0, 5));
      if (endTime) params.set("end_time", String(endTime).slice(0, 5));
    }
    params.set("dedicated_user", String(targetUserId));
    const shiftRole =
      mapRoleToShiftRole(candidate.rawRoleCategory) ||
      mapRoleToShiftRole(candidate.explorerRoleType) ||
      mapRoleToShiftRole(candidate.role);
    if (shiftRole) {
      params.set("role", shiftRole);
      params.set("role_needed", shiftRole);
    }
    params.set("embedded", "1");
    setPreviousSearch(location.search);
    navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
    setSelectedCalendarCandidate(null);
    setIsPostShiftModalOpen(true);
  }, [canRequestBooking, location.pathname, location.search, navigate]);

  const handleBookTalent = useCallback((candidate: Candidate) => {
    handleRequestBooking(candidate, candidate.isFullTimeApplication ? [] : candidate.availableDates || []);
  }, [handleRequestBooking]);

  const handleClosePostShiftModal = useCallback(() => {
    setIsPostShiftModalOpen(false);
    navigate({ pathname: location.pathname, search: previousSearch }, { replace: true });
  }, [location.pathname, navigate, previousSearch]);

  const handlePostShiftCompleted = useCallback(() => {
    handleClosePostShiftModal();
  }, [handleClosePostShiftModal]);

  const handleToggleLike = useCallback(
    async (candidate: Candidate) => {
      if (publicMode) {
        onRequireLogin?.("like");
        return;
      }
      try {
        if (candidate.isLikedByMe) {
          await unlikeExplorerPost(candidate.id);
        } else {
          await likeExplorerPost(candidate.id);
        }
        await reload();
      } catch {
        // keep UI stable on failure
      }
    },
    [reload, publicMode, onRequireLogin]
  );

  const clearAllFilters = () => {
    setFilters({
      search: "",
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
  const [roleTitle, setRoleTitle] = useState<string>("Explorer");
  const [explorerProfileId, setExplorerProfileId] = useState<number | null>(null);
  const [pitchForm, setPitchForm] = useState<PitchFormState>({
    headline: "",
    body: "",
    workTypes: [] as string[],
    postKind: "AVAILABILITY",
    streetAddress: "",
    suburb: "",
    state: "",
    postcode: "",
    openToTravel: false,
    travelStates: [] as string[],
    coverageRadiusKm: 30,
    latitude: null as number | null,
    longitude: null as number | null,
    googlePlaceId: "",
    availabilitySlots: [] as any[],
  });

  const [pitchSkills, setPitchSkills] = useState<string[]>([]);


  const isExplorer = user?.role === "EXPLORER";
  const isPharmacist = user?.role === "PHARMACIST";
  const isOtherStaff = user?.role === "OTHER_STAFF";
  const [staffPublicAccess, setStaffPublicAccess] = useState(false);
  useEffect(() => {
    if (!isPharmacist && !isOtherStaff) { setStaffPublicAccess(false); return; }
    let active = true;
    const checkAccess = async () => {
      try {
        const profile: any = await getOnboarding(isPharmacist ? "pharmacist" : "otherstaff");
        if (active) setStaffPublicAccess(canPublishTalent(user, profile, todayIso()));
      } catch { if (active) setStaffPublicAccess(false); }
    };
    void checkAccess();
    window.addEventListener("onboarding-updated", checkAccess);
    return () => { active = false; window.removeEventListener("onboarding-updated", checkAccess); };
  }, [isPharmacist, isOtherStaff, user?.id, user?.is_mobile_verified]);
  const showPitchButton =
    !publicMode &&
    user?.role &&
    (isExplorer || ((isPharmacist || isOtherStaff) && staffPublicAccess));

  const resetPitchForm = useCallback(() => {
      setPitchForm({
        headline: "",
        body: "",
        workTypes: [] as string[],
        postKind: "AVAILABILITY",
        streetAddress: "",
        suburb: "",
      state: "",
      postcode: "",
      openToTravel: false,
      travelStates: [] as string[],
      coverageRadiusKm: 30,
      latitude: null,
      longitude: null,
      googlePlaceId: "",
      availabilitySlots: [],
    });
    setExplorerProfileId(null);
    setExistingPostId(null);
    setRoleTitle("Explorer");
    setPitchSkills([]);
  }, []);

  const loadPitchDefaults = useCallback(async () => {
    if (!user) return;
    setPitchError(null);
    resetPitchForm();
    let onboardingSkills: string[] = [];
    let inheritedAvailabilitySlots: PitchFormState["availabilitySlots"] = [];
    try {
      inheritedAvailabilitySlots = mapAvailabilityToPitchSlots(await fetchUserAvailabilityService().catch(() => []));
      if (isExplorer) {
        const onboarding: any = await getOnboarding("explorer");
        setRoleTitle(
          (onboarding?.role_type || "Explorer")
            .replace("_", " ")
            .toLowerCase()
            .replace(/(^|\s)\S/g, (t: string) => t.toUpperCase())
        );
        setExplorerProfileId(onboarding?.id ?? null);
        setPitchForm((prev) => ({
          ...prev,
          body: onboarding?.short_bio || "",
          streetAddress: onboarding?.street_address || "",
          suburb: onboarding?.suburb || "",
          state: onboarding?.state || "",
          postcode: onboarding?.postcode || "",
          openToTravel: Boolean(onboarding?.open_to_travel),
          travelStates: Array.isArray(onboarding?.travel_states) ? onboarding.travel_states : [],
          coverageRadiusKm: onboarding?.coverage_radius_km || 30,
          latitude: onboarding?.latitude ? Number(onboarding.latitude) : null,
          longitude: onboarding?.longitude ? Number(onboarding.longitude) : null,
          googlePlaceId: onboarding?.google_place_id || "",
        }));
        setPitchSkills(Array.isArray(onboarding?.interests) ? onboarding.interests : []);
      } else if (isPharmacist) {
        const onboarding: any = await getOnboarding("pharmacist");
        setRoleTitle("Pharmacist");
        onboardingSkills = Array.isArray(onboarding?.skills) ? onboarding.skills : [];
        setPitchForm((prev) => ({
          ...prev,
          body: onboarding?.short_bio || "",
          streetAddress: onboarding?.street_address || "",
          suburb: onboarding?.suburb || "",
          state: onboarding?.state || "",
          postcode: onboarding?.postcode || "",
          openToTravel: Boolean(onboarding?.open_to_travel),
          travelStates: Array.isArray(onboarding?.travel_states) ? onboarding.travel_states : [],
          coverageRadiusKm: onboarding?.coverage_radius_km || 30,
          latitude: onboarding?.latitude ? Number(onboarding.latitude) : null,
          longitude: onboarding?.longitude ? Number(onboarding.longitude) : null,
          googlePlaceId: onboarding?.google_place_id || "",
        }));
      } else if (isOtherStaff) {
        const onboarding: any = await getOnboarding("other_staff");
        setRoleTitle(otherStaffRoleLabel(onboarding?.role_type));
        onboardingSkills = Array.isArray(onboarding?.skills) ? onboarding.skills : [];
        setPitchForm((prev) => ({
          ...prev,
          body: onboarding?.short_bio || "",
          streetAddress: onboarding?.street_address || "",
          suburb: onboarding?.suburb || "",
          state: onboarding?.state || "",
          postcode: onboarding?.postcode || "",
          openToTravel: Boolean(onboarding?.open_to_travel),
          travelStates: Array.isArray(onboarding?.travel_states) ? onboarding.travel_states : [],
          coverageRadiusKm: onboarding?.coverage_radius_km || 30,
          latitude: onboarding?.latitude ? Number(onboarding.latitude) : null,
          longitude: onboarding?.longitude ? Number(onboarding.longitude) : null,
          googlePlaceId: onboarding?.google_place_id || "",
        }));
      }
      const mine = posts.find((post) => post.authorUserId === user?.id);
      if (mine) {
        const minePostKind =
          mine.postKind ||
          (mine.availabilityMode === "FULL_TIME_NOTICE" ? "FULL_TIME_APPLICATION" : "AVAILABILITY");
        setExistingPostId(mine.id);
        setPitchForm((prev) => ({
          ...prev,
          headline: mine.headline || prev.headline,
          body: mine.body || prev.body,
          workTypes: mine.workTypes && mine.workTypes.length ? mine.workTypes : prev.workTypes,
          postKind: minePostKind,
          streetAddress: prev.streetAddress,
          suburb: mine.locationSuburb || prev.suburb,
          state: mine.locationState || prev.state,
          postcode: mine.locationPostcode || prev.postcode,
          openToTravel: mine.openToTravel != null ? Boolean(mine.openToTravel) : prev.openToTravel,
          coverageRadiusKm:
            mine.coverageRadiusKm != null ? Number(mine.coverageRadiusKm) : prev.coverageRadiusKm,
          availabilitySlots: minePostKind === "FULL_TIME_APPLICATION"
            ? []
            : Array.isArray(mine.availabilityDays) && mine.availabilityDays.length > 0 ? mine.availabilityDays.map((entry: any) => {
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
            }).filter((slot: any) => slot.date >= todayIso()) : (prev.availabilitySlots.length ? prev.availabilitySlots : inheritedAvailabilitySlots),
        }));
      } else if (inheritedAvailabilitySlots.length > 0) {
        setPitchForm((prev) => ({
          ...prev,
          postKind: "AVAILABILITY",
          availabilitySlots: inheritedAvailabilitySlots,
        }));
      }
      if (mine && Array.isArray(mine.skills) && mine.skills.length > 0) {
        setPitchSkills(mine.skills);
      } else if (onboardingSkills.length > 0) {
        setPitchSkills(onboardingSkills);
      }
    } catch (err: any) {
      setPitchError(err?.message || "Failed to load your profile.");
    }
  }, [user, isExplorer, isPharmacist, isOtherStaff, posts, resetPitchForm]);

  useEffect(() => {
    if (pitchOpen) {
      loadPitchDefaults();
    }
  }, [pitchOpen, loadPitchDefaults]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shouldOpen =
      params.get("publish_availability") === "1" ||
      params.get("pitch") === "1";
    if (!shouldOpen || publicMode || !showPitchButton) return;
    setPitchOpen(true);
    params.delete("publish_availability");
    params.delete("pitch");
    navigate(
      { pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : "" },
      { replace: true }
    );
  }, [location.pathname, location.search, navigate, publicMode, showPitchButton]);

  const updateOnboardingLocationPrefs = useCallback(async () => {
    const safeRole = isOtherStaff ? "otherstaff" : isPharmacist ? "pharmacist" : "explorer";
    const form = new FormData();
    form.append("street_address", pitchForm.streetAddress || "");
    form.append("suburb", pitchForm.suburb || "");
    form.append("state", pitchForm.state || "");
    form.append("postcode", pitchForm.postcode || "");
    form.append("open_to_travel", pitchForm.openToTravel ? "true" : "false");
    form.append("travel_states", JSON.stringify(pitchForm.travelStates || []));
    form.append("coverage_radius_km", String(pitchForm.coverageRadiusKm || 0));
    if (pitchForm.latitude != null) form.append("latitude", String(pitchForm.latitude));
    if (pitchForm.longitude != null) form.append("longitude", String(pitchForm.longitude));
    if (pitchForm.googlePlaceId) form.append("google_place_id", pitchForm.googlePlaceId);

    await updateOnboardingForm(safeRole, form);
  }, [isOtherStaff, isPharmacist, pitchForm]);

  const handlePitchSave = async () => {
    setPitchSaving(true);
    setPitchError(null);
    try {
      if (pitchForm.openToTravel && (pitchForm.travelStates || []).length === 0) {
        setPitchError("Select at least one travel state.");
        setPitchSaving(false);
        return;
      }
      await updateOnboardingLocationPrefs();

      const isFullTimeApplication = pitchForm.postKind === "FULL_TIME_APPLICATION";
      const normalizedWorkTypes = isFullTimeApplication
        ? Array.from(new Set([...(pitchForm.workTypes || []), "FULL_TIME"]))
        : pitchForm.workTypes;
      const normalizedHeadline =
        pitchForm.headline.trim() ||
        (isFullTimeApplication ? `${roleTitle || "Talent"} profile` : `${roleTitle || "Talent"} availability`);
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
      if (isExplorer) {
        if (isFullTimeApplication && !pitchForm.headline.trim() && !pitchForm.body.trim()) {
          setPitchError("Please add a headline or some text.");
          setPitchSaving(false);
          return;
        }
          const payload: Record<string, any> = {
            headline: normalizedHeadline,
            body: pitchForm.body.trim(),
            role_category: "EXPLORER",
            work_types: normalizedWorkTypes.length > 0 ? normalizedWorkTypes : undefined,
            post_kind: pitchForm.postKind,
            skills: pitchSkills.length > 0 ? pitchSkills : undefined,
            location_suburb: pitchForm.suburb || undefined,
            location_state: pitchForm.state || undefined,
            location_postcode: pitchForm.postcode || undefined,
            open_to_travel: pitchForm.openToTravel,
            coverage_radius_km: pitchForm.coverageRadiusKm,
            availability_days: availabilityDays,
            availability_mode: isFullTimeApplication ? "FULL_TIME_NOTICE" : availabilityDays.length > 0 ? "CASUAL_CALENDAR" : null,
            availability_summary: isFullTimeApplication ? "Open to anytime" : undefined,
          };
        if (explorerProfileId) payload.explorer_profile = explorerProfileId;
        if (existingPostId) {
          await updateExplorerPost(existingPostId, payload);
        } else {
          await createExplorerPost(payload);
        }
      } else {
          const payload: Record<string, any> = {
            headline: normalizedHeadline,
            body: pitchForm.body || "",
            role_category: isPharmacist ? "PHARMACIST" : "OTHER_STAFF",
            role_title: roleTitle || "",
            work_types: normalizedWorkTypes.length > 0 ? normalizedWorkTypes : undefined,
            post_kind: pitchForm.postKind,
            skills: pitchSkills.length > 0 ? pitchSkills : undefined,
            location_suburb: pitchForm.suburb || undefined,
            location_state: pitchForm.state || undefined,
          location_postcode: pitchForm.postcode || undefined,
          open_to_travel: pitchForm.openToTravel,
            coverage_radius_km: pitchForm.coverageRadiusKm,
            is_anonymous: true,
            availability_days: availabilityDays,
            availability_mode: isFullTimeApplication ? "FULL_TIME_NOTICE" : availabilityDays.length > 0 ? "CASUAL_CALENDAR" : null,
            availability_summary: isFullTimeApplication ? "Open to anytime" : undefined,
          };
        if (existingPostId) {
          await updateExplorerPost(existingPostId, payload);
        } else {
          await createExplorerPost(payload);
        }
      }
      await reload();
      setPitchOpen(false);
    } catch (err: any) {
      const detail = err?.response?.data || err?.data || err;
      if (detail && typeof detail === "object") {
        const fieldMessages = Object.entries(detail)
          .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
          .join(" ");
        setPitchError(fieldMessages || "Failed to save pitch.");
      } else {
        setPitchError(err?.message || "Failed to save pitch.");
      }
    } finally {
      setPitchSaving(false);
    }
  };

  const renderCandidateList = () => {
    if (pagedCandidates.length > 0) {
      return pagedCandidates.map((candidate) => (
        <TalentCardV2
          key={candidate.id}
          candidate={candidate}
          onViewCalendar={handleViewCalendar}
          onToggleLike={handleToggleLike}
          onRequestBooking={handleBookTalent}
          canViewAvailability={!publicMode}
          canRequestBooking={canRequestBooking}
        />
      ));
    }
    if (loading) {
      return <DashboardContentState kind="loading" title="Loading talent profiles" />;
    }
    if (error) {
      return (
        <DashboardContentState
          kind="error"
          title="We couldn't load talent profiles"
          description="Check your connection and try again."
          actionLabel={publicMode ? undefined : "Try again"}
          onAction={publicMode ? undefined : () => { void reload(); }}
        />
      );
    }
    const filtered = activeFilterCount > 0;
    return (
      <DashboardContentState
        kind="empty"
        title={filtered ? "No candidates match your filters" : "No published talent yet"}
        description={
          filtered
            ? "Adjust your role, location, skills or availability filters."
            : "Verified talent profiles will appear here once published."
        }
        actionLabel={filtered ? "Reset filters" : undefined}
        onAction={filtered ? clearAllFilters : undefined}
      />
    );
  };

  return (
    <Box sx={{ width: "100%", color: "text.primary" }}>
      {selectedCalendarCandidate && (
        <AvailabilitySidebar
          candidate={selectedCalendarCandidate}
          onClose={() => setSelectedCalendarCandidate(null)}
          canRequestBooking={canRequestBooking}
          onRequestBooking={handleRequestBooking}
          currentUserId={user?.id ?? null}
        />
      )}

      <Box sx={{ width: "100%" }}>
        {!publicMode && (isPharmacist || isOtherStaff) && !staffPublicAccess && (
          <Alert
            severity="info"
            sx={{ mb: 2 }}
            action={<Button color="inherit" size="small" onClick={() => navigate(`/dashboard/${isPharmacist ? "pharmacist" : "otherstaff"}/onboarding`)}>Verify profile</Button>}
          >
            Your pharmacy invitation gives you team access. Verify your public profile to publish your availability here.
          </Alert>
        )}
        {error && pagedCandidates.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }} action={publicMode ? undefined : <Button color="inherit" size="small" onClick={() => { void reload(); }}>Try again</Button>}>
            We couldn't refresh talent profiles. Showing the last results.
          </Alert>
        )}

        <PageHeader
          title="Find talent"
          subtitle={
            <Box component="span" aria-live="polite">
              {loading
                ? "Finding published profiles…"
                : error && pagedCandidates.length === 0
                ? "Browse verified pharmacy professionals and request a booking."
                : `${processedCandidates.length} ${processedCandidates.length === 1 ? "profile matches" : "profiles match"} your filters`}
            </Box>
          }
          actions={
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Button
                variant="outlined"
                startIcon={<SlidersHorizontal size={16} />}
                onClick={() => setIsSidebarOpen(true)}
                sx={{ display: { lg: "none" }, minHeight: 44 }}
              >
                Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </Button>
              {!publicMode && showPitchButton && (
                <Button variant="contained" startIcon={<Megaphone size={16} />} onClick={() => setPitchOpen(true)} sx={{ minHeight: 44 }}>
                  {existingPostId ? "Update my pitch" : "Publish your availability"}
                </Button>
              )}
            </Stack>
          }
        />

        <Stack direction={{ xs: "column", lg: "row" }} spacing={3} alignItems={{ xs: "stretch", lg: "flex-start" }} sx={{ width: "100%" }}>
          <Drawer
            anchor="left"
            open={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
            sx={{ display: { lg: "none" } }}
          >
            <Box sx={{ width: { xs: "min(100vw, 360px)", sm: 360 }, maxWidth: "100vw" }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 2 }}>
                <Typography component="h2" sx={{ fontFamily: "var(--ct-font-display)", fontWeight: 500, fontSize: 20 }}>Filters</Typography>
                <IconButton onClick={() => setIsSidebarOpen(false)} aria-label="Close talent filters">
                  <CloseIcon />
                </IconButton>
              </Box>
              <Divider />
              <FiltersSidebar
                filters={filters}
                onChange={setFilters}
                roleOptions={roleOptions}
                stateOptions={stateOptions}
                workTypeOptions={allWorkTypes}
                roleSkillOptions={roleSkillOptions}
                softwareOptions={softwareOptions}
                expandedRoleSkills={expandedRoleSkills}
                onToggleRoleSkillExpand={toggleRoleSkillExpand}
              />
              <Box sx={{ position: "sticky", bottom: 0, px: 2, py: 1.5, borderTop: "1px solid var(--ct-border-color)", bgcolor: "var(--ct-surface-bg)" }}>
                <Button variant="contained" fullWidth onClick={() => setIsSidebarOpen(false)} sx={{ minHeight: 44 }}>
                  Show {processedCandidates.length} {processedCandidates.length === 1 ? "profile" : "profiles"}
                </Button>
              </Box>
            </Box>
          </Drawer>

          <Paper
            component="aside"
            aria-label="Talent filters"
            variant="outlined"
            sx={{
              width: 320,
              flex: "0 0 320px",
              minWidth: 0,
              display: { xs: "none", lg: "block" },
              borderRadius: 3,
              bgcolor: "background.paper",
              borderColor: "divider",
              boxShadow: "none",
              alignSelf: "flex-start",
              position: "relative",
              maxHeight: "none",
              overflow: "visible",
            }}
          >
            <FiltersSidebar
              filters={filters}
              onChange={setFilters}
              roleOptions={roleOptions}
              stateOptions={stateOptions}
              workTypeOptions={allWorkTypes}
              roleSkillOptions={roleSkillOptions}
              softwareOptions={softwareOptions}
              expandedRoleSkills={expandedRoleSkills}
              onToggleRoleSkillExpand={toggleRoleSkillExpand}
            />
          </Paper>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            {activeFilterCount > 0 && (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mb: 2 }}>
                {filters.willingToTravel && (
                  <Chip label="Open to travel" onDelete={() => toggleBooleanFilter("willingToTravel")} />
                )}
                {filters.placementSeeker && (
                  <Chip label="Students & interns" onDelete={() => toggleBooleanFilter("placementSeeker")} />
                )}
                {(filters.availabilityStart || filters.availabilityEnd) && (
                  <Chip
                    label={`Available ${filters.availabilityStart ?? "any time"} to ${filters.availabilityEnd ?? "any time"}`}
                    onDelete={() =>
                      setFilters((prev) => ({ ...prev, availabilityStart: null, availabilityEnd: null }))
                    }
                  />
                )}
                {filters.roles.map((r: string) => (
                  <Chip key={r} label={r} onDelete={() => toggleFilter("roles", r)} />
                ))}
                {filters.skills.map((s: string) => (
                  <Chip key={s} label={resolveTalentSkillLabel(s)} onDelete={() => toggleFilter("skills", s)} />
                ))}
                <Button size="small" onClick={clearAllFilters} sx={{ ml: "auto", minHeight: 32 }}>
                  Clear all
                </Button>
              </Stack>
            )}

            <Stack spacing={2} sx={{ pb: 3 }} aria-live="polite">
              {renderCandidateList()}
            </Stack>
            {pageCount > 1 && (
              <Stack alignItems="center" sx={{ mt: 2 }}>
                <Pagination count={pageCount} page={page} onChange={(_, value) => setPage(value)} aria-label="Talent results pages" />
              </Stack>
            )}
          </Box>
        </Stack>
      </Box>


      {!publicMode && (
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
      )}

      <Dialog
        open={isPostShiftModalOpen}
        onClose={handleClosePostShiftModal}
        fullWidth
        maxWidth="lg"
        PaperProps={{
          sx: {
            width: { xs: "100vw", sm: "96vw", lg: "92vw", xl: "1320px" },
            maxWidth: "none",
            maxHeight: { xs: "100dvh", sm: "94dvh" },
            m: { xs: 0, sm: 2 },
            borderRadius: { xs: 0, sm: 3 },
            overflow: "hidden",
            display: "flex",
          },
        }}
      >
        <Box sx={{ flex: 1, minHeight: 0, maxHeight: { xs: "100dvh", sm: "94dvh" }, overflow: "auto", bgcolor: "background.default" }}>
          <Suspense fallback={<DashboardContentState kind="loading" title="Loading shift form" compact />}><PostShiftPage onCompleted={handlePostShiftCompleted} /></Suspense>
        </Box>
      </Dialog>
    </Box>
  );

};

export default TalentBoard;
