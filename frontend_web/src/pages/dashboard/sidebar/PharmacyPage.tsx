/// <reference types="@types/google.maps" />

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Paper,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormGroup,
  GlobalStyles,
  GridLegacy as Grid,
  InputAdornment,
  InputLabel,
  Link as MuiLink,
  MenuItem,
  Select,
  Skeleton,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/AddCircleOutline";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import BusinessRoundedIcon from "@mui/icons-material/BusinessRounded";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import GroupRoundedIcon from "@mui/icons-material/GroupRounded";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import TopicRoundedIcon from "@mui/icons-material/TopicRounded";
import BlockRoundedIcon from "@mui/icons-material/BlockRounded";
import { AxiosError } from "axios";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useJsApiLoader, Autocomplete } from "@react-google-maps/api";
import { useAuth } from "../../../contexts/AuthContext";
import type { OrgMembership } from "../../../contexts/AuthContext";
import { API_BASE_URL } from "../../../constants/api";
import OwnerPharmaciesPage from "./owner/OwnerPharmaciesPage";
import OwnerPharmacyDetailPage from "./owner/OwnerPharmacyDetailPage";
import TopBar from "./owner/TopBar";
import type { MembershipDTO, PharmacyAdminDTO, PharmacyDTO as OwnerPharmacyDTO } from "./owner/types";
import { ORG_ROLES } from "../../../constants/roles";
import { clearOwnerPharmacySetupSkipped, markOwnerPharmacySetupSkipped } from "../../../utils/ownerSetup";
import {
  claimOnboarding,
  createPharmacy,
  deletePharmacy,
  fetchPharmaciesService,
  fetchPharmacyAdminsService,
  getOnboarding,
  getPharmacyClaims,
  lookupPharmacyAbn,
  updatePharmacy,
  updatePharmacyClaim,
} from "@chemisttasker/shared-core";
import { fetchMembershipsForPharmacy } from "./owner/membershipApi";

const GOOGLE_LIBRARIES = ["places"] as Array<"places">;
const LIGHT_SURFACE = "#FFFFFF";
const LIGHT_BORDER = "#D9E2F2";
const HERO_GRADIENT_START = "#143EEA";
// const HERO_GRADIENT_END = "#D20DAE";
const HERO_GRADIENT = "linear-gradient(135deg, #143EEA 0%, #2429B8 45%, #8B1CF6 72%, #D20DAE 100%)";
const DASHBOARD_FONT_FAMILY = '"DM Sans Variable", "DM Sans", "Barlow", Arial, sans-serif';
const DASHBOARD_INK = "#06123A";
const DASHBOARD_MUTED = "#5E6B8D";

type PharmacyApi = {
  id: string | number;
  owner: number;
  name: string;
  email: string | null;
  claimed?: boolean | null;
  claim_status?: string | null;
  organization?: { id: number; name?: string | null } | number | null;
  organization_id?: number | null;
  street_address: string;
  suburb: string;
  postcode: string;
  google_place_id: string;
  latitude: number | null;
  longitude: number | null;
  state: string;
  chain: number | null;
  abn: string;
  abn_verified?: boolean | null;
  abn_entity_confirmed?: boolean | null;
  abn_entity_name?: string | null;
  abn_entity_type?: string | null;
  abn_status?: string | null;
  abn_gst_registered?: boolean | null;
  abn_gst_from?: string | null;
  abn_gst_to?: string | null;
  abn_last_checked?: string | null;
  abn_verification_note?: string | null;
  methadone_s8_protocols?: string;
  qld_sump_docs?: string;
  sops?: string;
  induction_guides?: string;
  employment_types?: string[];
  roles_needed?: string[];
  weekdays_start: string | null;
  weekdays_end: string | null;
  monday_start: string | null;
  monday_end: string | null;
  monday_closed?: boolean | null;
  tuesday_start: string | null;
  tuesday_end: string | null;
  tuesday_closed?: boolean | null;
  wednesday_start: string | null;
  wednesday_end: string | null;
  wednesday_closed?: boolean | null;
  thursday_start: string | null;
  thursday_end: string | null;
  thursday_closed?: boolean | null;
  friday_start: string | null;
  friday_end: string | null;
  friday_closed?: boolean | null;
  saturdays_start: string | null;
  saturdays_end: string | null;
  saturdays_closed?: boolean | null;
  sundays_start: string | null;
  sundays_end: string | null;
  sundays_closed?: boolean | null;
  public_holidays_start: string | null;
  public_holidays_end: string | null;
  public_holidays_closed?: boolean | null;
  default_rate_type: "FIXED" | "FLEXIBLE" | "PHARMACIST_PROVIDED" | null;
  default_fixed_rate: string | null;
  rate_weekday?: string | null;
  rate_saturday?: string | null;
  rate_sunday?: string | null;
  rate_public_holiday?: string | null;
  rate_early_morning?: string | null;
  rate_late_night?: string | null;
  about: string;
  auto_publish_worker_requests?: boolean;
};

type Pharmacy = Omit<PharmacyApi, "id"> & { id: string };

const normalizePharmacy = (raw: any): Pharmacy => ({
  id: String(raw.id),
  owner: raw.owner ?? raw.ownerId ?? 0,
  name: raw.name ?? "",
  email: raw.email ?? null,
  claimed: raw.claimed ?? false,
  claim_status: raw.claim_status ?? raw.claimStatus ?? null,
  organization: raw.organization ?? null,
  organization_id: raw.organization_id ?? raw.organizationId ?? null,
  street_address: raw.street_address ?? raw.streetAddress ?? "",
  suburb: raw.suburb ?? "",
  postcode: raw.postcode ?? "",
  google_place_id: raw.google_place_id ?? raw.googlePlaceId ?? "",
  latitude: raw.latitude ?? null,
  longitude: raw.longitude ?? null,
  state: raw.state ?? "",
  chain: raw.chain ?? null,
  abn: raw.abn ?? "",
  abn_verified: raw.abn_verified ?? false,
  abn_entity_confirmed: raw.abn_entity_confirmed ?? false,
  abn_entity_name: raw.abn_entity_name ?? null,
  abn_entity_type: raw.abn_entity_type ?? null,
  abn_status: raw.abn_status ?? null,
  abn_gst_registered: raw.abn_gst_registered ?? null,
  abn_gst_from: raw.abn_gst_from ?? null,
  abn_gst_to: raw.abn_gst_to ?? null,
  abn_last_checked: raw.abn_last_checked ?? null,
  abn_verification_note: raw.abn_verification_note ?? null,
  methadone_s8_protocols: raw.methadone_s8_protocols ?? raw.methadoneS8Protocols ?? undefined,
  qld_sump_docs: raw.qld_sump_docs ?? raw.qldSumpDocs ?? undefined,
  sops: raw.sops ?? undefined,
  induction_guides: raw.induction_guides ?? raw.inductionGuides ?? undefined,
  employment_types: raw.employment_types ?? raw.employmentTypes ?? [],
  roles_needed: raw.roles_needed ?? raw.rolesNeeded ?? [],
  weekdays_start: raw.weekdays_start ?? raw.weekdaysStart ?? "",
  weekdays_end: raw.weekdays_end ?? raw.weekdaysEnd ?? "",
  monday_start: raw.monday_start ?? raw.mondayStart ?? raw.weekdays_start ?? raw.weekdaysStart ?? "",
  monday_end: raw.monday_end ?? raw.mondayEnd ?? raw.weekdays_end ?? raw.weekdaysEnd ?? "",
  monday_closed: raw.monday_closed ?? raw.mondayClosed ?? false,
  tuesday_start: raw.tuesday_start ?? raw.tuesdayStart ?? raw.weekdays_start ?? raw.weekdaysStart ?? "",
  tuesday_end: raw.tuesday_end ?? raw.tuesdayEnd ?? raw.weekdays_end ?? raw.weekdaysEnd ?? "",
  tuesday_closed: raw.tuesday_closed ?? raw.tuesdayClosed ?? false,
  wednesday_start: raw.wednesday_start ?? raw.wednesdayStart ?? raw.weekdays_start ?? raw.weekdaysStart ?? "",
  wednesday_end: raw.wednesday_end ?? raw.wednesdayEnd ?? raw.weekdays_end ?? raw.weekdaysEnd ?? "",
  wednesday_closed: raw.wednesday_closed ?? raw.wednesdayClosed ?? false,
  thursday_start: raw.thursday_start ?? raw.thursdayStart ?? raw.weekdays_start ?? raw.weekdaysStart ?? "",
  thursday_end: raw.thursday_end ?? raw.thursdayEnd ?? raw.weekdays_end ?? raw.weekdaysEnd ?? "",
  thursday_closed: raw.thursday_closed ?? raw.thursdayClosed ?? false,
  friday_start: raw.friday_start ?? raw.fridayStart ?? raw.weekdays_start ?? raw.weekdaysStart ?? "",
  friday_end: raw.friday_end ?? raw.fridayEnd ?? raw.weekdays_end ?? raw.weekdaysEnd ?? "",
  friday_closed: raw.friday_closed ?? raw.fridayClosed ?? false,
  saturdays_start: raw.saturdays_start ?? raw.saturdaysStart ?? "",
  saturdays_end: raw.saturdays_end ?? raw.saturdaysEnd ?? "",
  saturdays_closed: raw.saturdays_closed ?? raw.saturdaysClosed ?? false,
  sundays_start: raw.sundays_start ?? raw.sundaysStart ?? "",
  sundays_end: raw.sundays_end ?? raw.sundaysEnd ?? "",
  sundays_closed: raw.sundays_closed ?? raw.sundaysClosed ?? false,
  public_holidays_start: raw.public_holidays_start ?? raw.publicHolidaysStart ?? "",
  public_holidays_end: raw.public_holidays_end ?? raw.publicHolidaysEnd ?? "",
  public_holidays_closed: raw.public_holidays_closed ?? raw.publicHolidaysClosed ?? false,
  default_rate_type: raw.default_rate_type ?? raw.defaultRateType ?? null,
  default_fixed_rate: raw.default_fixed_rate ?? raw.defaultFixedRate ?? null,
  rate_weekday: raw.rate_weekday ?? raw.rateWeekday ?? null,
  rate_saturday: raw.rate_saturday ?? raw.rateSaturday ?? null,
  rate_sunday: raw.rate_sunday ?? raw.rateSunday ?? null,
  rate_public_holiday: raw.rate_public_holiday ?? raw.ratePublicHoliday ?? null,
  rate_early_morning: raw.rate_early_morning ?? raw.rateEarlyMorning ?? null,
  rate_late_night: raw.rate_late_night ?? raw.rateLateNight ?? null,
  about: raw.about ?? "",
  auto_publish_worker_requests: raw.auto_publish_worker_requests ?? raw.autoPublishWorkerRequests ?? false,
});

const toOwnerPharmacyDTO = (pharmacy: Pharmacy): OwnerPharmacyDTO => ({
  id: pharmacy.id,
  name: pharmacy.name,
  street_address: pharmacy.street_address,
  suburb: pharmacy.suburb,
  state: pharmacy.state,
  postcode: pharmacy.postcode,
});

type ClaimStatus = "PENDING" | "ACCEPTED" | "REJECTED";

type OrganizationClaimItem = {
  id: number;
  status: ClaimStatus;
  status_display?: string;
  pharmacy: {
    id: number;
    name?: string | null;
    email?: string | null;
  } | null;
  message?: string | null;
  response_message?: string | null;
  created_at?: string | null;
  responded_at?: string | null;
};

type OwnerClaimRequest = {
  id: number;
  status: ClaimStatus;
  status_display?: string;
  message?: string | null;
  response_message?: string | null;
  pharmacy: {
    id: number;
    name: string;
    email: string | null;
  };
  organization: {
    id: number;
    name?: string | null;
  } | null;
  created_at: string;
  responded_at: string | null;
};

type OwnerClaimDialogState = {
  open: boolean;
  claim: OwnerClaimRequest | null;
  action: ClaimStatus | null;
  note: string;
};

const initialOwnerDialogState: OwnerClaimDialogState = { open: false, claim: null, action: null, note: "" };

const CLAIM_STATUS_COLORS: Record<ClaimStatus, "success" | "warning" | "error"> = {
  ACCEPTED: "success",
  PENDING: "warning",
  REJECTED: "error",
};

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "-";

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString() : "-";

const membershipIsVisibleCategoryMember = (membership: MembershipDTO) => {
  const status = String((membership as any).status || "").toUpperCase();
  return !["REJECTED", "LEFT"].includes(status);
};

const tabLabels = [
  { label: "Basic", icon: <BusinessRoundedIcon fontSize="small" /> },
  { label: "Regulatory", icon: <TaskAltRoundedIcon fontSize="small" /> },
  { label: "Docs", icon: <TopicRoundedIcon fontSize="small" /> },
  { label: "Employment", icon: <GroupRoundedIcon fontSize="small" /> },
  { label: "Hours", icon: <AccessTimeRoundedIcon fontSize="small" /> },
  { label: "Rate", icon: <PaymentsRoundedIcon fontSize="small" /> },
  { label: "About", icon: <ForumRoundedIcon fontSize="small" /> },
];
const EMPLOYMENT_TYPE_OPTIONS = ["PART_TIME", "FULL_TIME", "LOCUMS"];
const ROLE_OPTIONS = ["PHARMACIST", "INTERN", "ASSISTANT", "TECHNICIAN", "STUDENT", "ADMIN", "DRIVER"];
const RATE_TYPES = [
  { value: "FIXED", label: "Fixed" },
  { value: "FLEXIBLE", label: "Flexible" },
  { value: "PHARMACIST_PROVIDED", label: "Pharmacist Provided" },
] as const;
const RATE_MINIMUM_EXAMPLE = "55";
const GOVERNMENT_AWARD_GUIDE_URL = "https://calculate.fairwork.gov.au/payguides/fairwork/ma000012/pdf";
const prettifyOptionLabel = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
const PHARMACY_CACHE_KEY = "pharmacyPage.cache.v2";
const pharmacyPageFrameSx = {
  width: "100%",
  maxWidth: "none",
  mx: "auto",
  px: { xs: 0, sm: 1.5, md: 2, xl: 3 },
  fontFamily: DASHBOARD_FONT_FAMILY,
} as const;
const pharmacyFormLightSx = {
  color: "#111827",
  "& .MuiTabs-root": {
    borderBottomColor: LIGHT_BORDER,
  },
  "& .MuiTab-root": {
    color: "#475569",
    fontWeight: 700,
    textTransform: "none",
  },
  "& .MuiTab-root.Mui-selected": {
    color: HERO_GRADIENT_START,
  },
  "& .MuiOutlinedInput-root": {
    bgcolor: LIGHT_SURFACE,
    color: "#111827",
    borderRadius: 2,
    "& .MuiInputBase-input": {
      color: "#111827",
      WebkitTextFillColor: "#111827",
    },
    "& .MuiSelect-select": {
      color: "#111827",
    },
    "& fieldset": {
      borderColor: LIGHT_BORDER,
    },
    "&:hover fieldset": {
      borderColor: "#B8C4DB",
    },
    "&.Mui-focused fieldset": {
      borderColor: HERO_GRADIENT_START,
      borderWidth: 1,
    },
  },
  "& .MuiInputLabel-root": {
    color: "#64748B",
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: HERO_GRADIENT_START,
  },
  "& .MuiFormHelperText-root": {
    color: "#64748B",
  },
  "& .MuiTypography-root": {
    color: "#111827",
  },
  "& .MuiTypography-body2": {
    color: "#64748B",
  },
  "& .MuiFormControlLabel-label": {
    color: "#111827",
  },
  "& .MuiCheckbox-root.Mui-checked": {
    color: HERO_GRADIENT_START,
  },
} as const;

type PharmacyPageProps = {
  standalone?: boolean;
  onNeedsOnboardingPath?: string;
  onCompletePath?: string;
  targetPharmacyCount?: number;
};

export default function PharmacyPage({
  standalone = false,
  onNeedsOnboardingPath = "/onboarding/owner",
  onCompletePath = "/dashboard/owner/overview",
  targetPharmacyCount = 1,
}: PharmacyPageProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAdminUser, activePersona, activeAdminPharmacyId, activeAdminAssignment } = useAuth();
  const scopedPharmacyId =
    activePersona === "admin" && typeof activeAdminPharmacyId === "number"
      ? activeAdminPharmacyId
      : null;

  const orgMembership = useMemo(() => {
    const memberships = Array.isArray(user?.memberships) ? user!.memberships : [];
    for (const membership of memberships) {
      if (!membership || typeof membership !== "object") {
        continue;
      }
      const rawRole = String((membership as any).role ?? "").toUpperCase();
      if (
        ["ORG_ADMIN", "ORG_OWNER", "ORG_STAFF", "CHIEF_ADMIN", "REGION_ADMIN", "ORGANIZATION"].includes(rawRole) &&
        (membership as any).organization_id != null
      ) {
        return membership as OrgMembership;
      }
    }
    return null;
  }, [user?.memberships]);

  const organizationId = orgMembership?.organization_id ?? null;
  const isOrganizationUser = organizationId != null;

  const scopedOrgPharmacyIds = useMemo(() => {
    if (!orgMembership?.pharmacies || !Array.isArray(orgMembership.pharmacies)) {
      return null;
    }
    const ids = orgMembership.pharmacies
      .map((record) => {
        if (!record || typeof record !== 'object' || !('id' in record)) {
          return null;
        }
        const numeric = Number((record as any).id);
        return Number.isFinite(numeric) ? numeric : null;
      })
      .filter((value): value is number => value != null);
    if (!ids.length) {
      return null;
    }
    return new Set(ids);
  }, [orgMembership?.pharmacies]);
  const canRespondToClaims = useMemo(() => {
    if (user?.role === "OWNER") {
      return true;
    }
    return activePersona === "admin" && activeAdminAssignment?.admin_level === "OWNER";
  }, [user?.role, activePersona, activeAdminAssignment?.admin_level]);

  const scopePharmacies = useCallback(
    (input: Pharmacy[]): Pharmacy[] => {
      if (scopedPharmacyId == null) {
        return input;
      }
      return input.filter((pharmacy) => Number(pharmacy.id) === scopedPharmacyId);
    },
    [scopedPharmacyId]
  );

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_Maps_API_KEY || "",
    libraries: GOOGLE_LIBRARIES,
  });

  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [membershipsByPharmacy, setMembershipsByPharmacy] = useState<Record<string, MembershipDTO[]>>({});
  const [adminAssignmentsByPharmacy, setAdminAssignmentsByPharmacy] = useState<Record<string, PharmacyAdminDTO[]>>({});
  const [membershipsLoading, setMembershipsLoading] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<"list" | "detail">("list");
  const [activePharmacyId, setActivePharmacyId] = useState<string | null>(null);
  const [pendingDeletePharmacy, setPendingDeletePharmacy] = useState<Pharmacy | null>(null);
  const [isDeletingPharmacy, setIsDeletingPharmacy] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Pharmacy | null>(null);
  const [tabIndex, setTabIndex] = useState(0);
  const lastTabIndex = tabLabels.length - 1;
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [postcode, setPostcode] = useState("");
  const [googlePlaceId, setGooglePlaceId] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [state, setState] = useState("");
  const [abn, setAbn] = useState("");
  const [abnEntityName, setAbnEntityName] = useState<string | null>(null);
  const [abnEntityType, setAbnEntityType] = useState<string | null>(null);
  const [abnStatus, setAbnStatus] = useState<string | null>(null);
  const [abnGstRegistered, setAbnGstRegistered] = useState<boolean | null>(null);
  const [abnGstFrom, setAbnGstFrom] = useState<string | null>(null);
  const [abnGstTo, setAbnGstTo] = useState<string | null>(null);
  const [abnLastChecked, setAbnLastChecked] = useState<string | null>(null);
  const [abnVerificationNote, setAbnVerificationNote] = useState<string | null>(null);
  const [checkingABN, setCheckingABN] = useState(false);
  const [abnConfirmedLocal, setAbnConfirmedLocal] = useState(false);

  const [approvalCertFile, setApprovalCertFile] = useState<File | null>(null);
  const [existingApprovalCert, setExistingApprovalCert] = useState<string | null>(null);
  const [sopsFile, setSopsFile] = useState<File | null>(null);
  const [existingSops, setExistingSops] = useState<string | null>(null);
  const [inductionGuidesFile, setInductionGuidesFile] = useState<File | null>(null);
  const [existingInductionGuides, setExistingInductionGuides] = useState<string | null>(null);
  const [sumpDocsFile, setSumpDocsFile] = useState<File | null>(null);
  const [existingSumpDocs, setExistingSumpDocs] = useState<string | null>(null);

  const [employmentTypes, setEmploymentTypes] = useState<string[]>([]);
  const [rolesNeeded, setRolesNeeded] = useState<string[]>([]);

  const [weekdaysStart, setWeekdaysStart] = useState("");
  const [weekdaysEnd, setWeekdaysEnd] = useState("");
  const [mondayStart, setMondayStart] = useState("");
  const [mondayEnd, setMondayEnd] = useState("");
  const [mondayClosed, setMondayClosed] = useState(false);
  const [tuesdayStart, setTuesdayStart] = useState("");
  const [tuesdayEnd, setTuesdayEnd] = useState("");
  const [tuesdayClosed, setTuesdayClosed] = useState(false);
  const [wednesdayStart, setWednesdayStart] = useState("");
  const [wednesdayEnd, setWednesdayEnd] = useState("");
  const [wednesdayClosed, setWednesdayClosed] = useState(false);
  const [thursdayStart, setThursdayStart] = useState("");
  const [thursdayEnd, setThursdayEnd] = useState("");
  const [thursdayClosed, setThursdayClosed] = useState(false);
  const [fridayStart, setFridayStart] = useState("");
  const [fridayEnd, setFridayEnd] = useState("");
  const [fridayClosed, setFridayClosed] = useState(false);
  const [saturdaysStart, setSaturdaysStart] = useState("");
  const [saturdaysEnd, setSaturdaysEnd] = useState("");
  const [saturdaysClosed, setSaturdaysClosed] = useState(false);
  const [sundaysStart, setSundaysStart] = useState("");
  const [sundaysEnd, setSundaysEnd] = useState("");
  const [sundaysClosed, setSundaysClosed] = useState(false);
  const [publicHolidaysStart, setPublicHolidaysStart] = useState("");
  const [publicHolidaysEnd, setPublicHolidaysEnd] = useState("");
  const [publicHolidaysClosed, setPublicHolidaysClosed] = useState(false);

  const [defaultRateType, setDefaultRateType] = useState<string>("FIXED");
  const [defaultFixedRate, setDefaultFixedRate] = useState<string>("");
  const [rateWeekday, setRateWeekday] = useState("");
  const [rateSaturday, setRateSaturday] = useState("");
  const [rateSunday, setRateSunday] = useState("");
  const [ratePublicHoliday, setRatePublicHoliday] = useState("");
  const [rateEarlyMorning, setRateEarlyMorning] = useState("");
  const [rateLateNight, setRateLateNight] = useState("");
  const [about, setAbout] = useState("");
  const [autoPublishWorkerRequests, setAutoPublishWorkerRequests] = useState(false);

  const [claimEmail, setClaimEmail] = useState("");
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimItems, setClaimItems] = useState<OrganizationClaimItem[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimAccordionOpen, setClaimAccordionOpen] = useState(false);

  const [ownerClaims, setOwnerClaims] = useState<OwnerClaimRequest[]>([]);
  const [ownerClaimsLoading, setOwnerClaimsLoading] = useState(false);
  const [ownerClaimError, setOwnerClaimError] = useState<string | null>(null);
  const [ownerDialog, setOwnerDialog] = useState<OwnerClaimDialogState>(initialOwnerDialogState);
  const [ownerResponding, setOwnerResponding] = useState(false);
  const [ownerAccordionOpen, setOwnerAccordionOpen] = useState(true);

  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarState, setSnackbarState] = useState<{ message: string; severity: "success" | "error" | "info" } | null>(null);
  const [additionalPharmacyPromptOpen, setAdditionalPharmacyPromptOpen] = useState(false);
  const [autoPublishSaving, setAutoPublishSaving] = useState(false);
  const [autoPublishError, setAutoPublishError] = useState("");

  const abnDigits = abn.replace(/\D/g, "");
  const abnInvalid = abnDigits.length > 0 && abnDigits.length !== 11;
  const abnLocked = Boolean(editing?.abn_verified && editing?.abn_entity_confirmed);
  const abnIsLocked = abnLocked || abnConfirmedLocal;

  const applyAbnMeta = useCallback((pharmacy?: Partial<PharmacyApi> | null) => {
    setAbnEntityName(pharmacy?.abn_entity_name ?? null);
    setAbnEntityType(pharmacy?.abn_entity_type ?? null);
    setAbnStatus(pharmacy?.abn_status ?? null);
    setAbnGstRegistered(pharmacy?.abn_gst_registered ?? null);
    setAbnGstFrom(pharmacy?.abn_gst_from ?? null);
    setAbnGstTo(pharmacy?.abn_gst_to ?? null);
    setAbnLastChecked(pharmacy?.abn_last_checked ?? null);
    setAbnVerificationNote(pharmacy?.abn_verification_note ?? null);
    setAbnConfirmedLocal(Boolean(pharmacy?.abn_entity_confirmed));
  }, []);

  const ownerPharmacies = useMemo(() => pharmacies.map(toOwnerPharmacyDTO), [pharmacies]);
  const activePharmacy = useMemo(
    () => pharmacies.find((p) => p.id === activePharmacyId) || null,
    [pharmacies, activePharmacyId]
  );

  const staffCounts = useMemo(
    () => Object.fromEntries(pharmacies.map((p) => [p.id, (membershipsByPharmacy[p.id] || []).length])),
    [pharmacies, membershipsByPharmacy]
  );

  const activeMemberships = activePharmacyId ? membershipsByPharmacy[activePharmacyId] || [] : [];
  const staffMemberships = useMemo(
    () =>
      activeMemberships.filter((m) => {
        const role = (m.role || "").toUpperCase();
        const work = (m.employment_type || "").toUpperCase();
        return membershipIsVisibleCategoryMember(m) && !role.includes("ADMIN") && !work.includes("LOCUM") && !work.includes("SHIFT");
      }),
    [activeMemberships]
  );
  const locumMemberships = useMemo(
    () =>
      activeMemberships.filter((m) => {
        const role = (m.role || "").toUpperCase();
        const work = (m.employment_type || "").toUpperCase();
        return membershipIsVisibleCategoryMember(m) && !role.includes("ADMIN") && (work.includes("LOCUM") || work.includes("SHIFT"));
      }),
    [activeMemberships]
  );
  const activeAdminAssignments = useMemo(
    () => (activePharmacyId ? adminAssignmentsByPharmacy[activePharmacyId] || [] : []),
    [activePharmacyId, adminAssignmentsByPharmacy]
  );
  const pendingAdminMemberships = useMemo(
    () =>
      activeMemberships.filter(
        (membership) =>
          Boolean((membership as any).is_pharmacy_admin ?? (membership as any).isPharmacyAdmin) &&
          (String((membership as any).status || "").toUpperCase() === "PENDING" ||
            ((membership as any).is_active ?? (membership as any).isActive) === false)
      ),
    [activeMemberships]
  );

  const claimCounts = useMemo(() => {
    const pending = claimItems.filter((item) => item.status === "PENDING").length;
    const accepted = claimItems.filter((item) => item.status === "ACCEPTED").length;
    return { pending, accepted };
  }, [claimItems]);

  const ownerClaimCounts = useMemo(() => {
    const pending = ownerClaims.filter((item) => item.status === "PENDING").length;
    const accepted = ownerClaims.filter((item) => item.status === "ACCEPTED").length;
    return { pending, accepted };
  }, [ownerClaims]);
  const claimedPharmacyCount = useMemo(
    () =>
      pharmacies.filter((pharmacy) => {
        const status = String(pharmacy.claim_status ?? "").toUpperCase();
        return Boolean(pharmacy.claimed || pharmacy.organization || pharmacy.organization_id || status === "ACCEPTED");
      }).length,
    [pharmacies]
  );

  const normalizedTargetPharmacyCount = Math.max(1, targetPharmacyCount || 1);
  const toggleArrayValue = (
    current: string[],
    nextValue: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter(
      current.includes(nextValue)
        ? current.filter((item) => item !== nextValue)
        : [...current, nextValue]
    );
  };

  const renderABNChip = () => {
    if (abnIsLocked) {
      return <Chip color="success" variant="outlined" label="ABN verified" />;
    }
    if (!abnEntityName && abnVerificationNote) {
      return <Chip color="error" variant="outlined" label="ABN invalid/unavailable" />;
    }
    if (abnEntityName || abnVerificationNote) {
      return <Chip variant="outlined" label="ABN awaiting confirmation" />;
    }
    return <Chip variant="outlined" label="ABN not checked" />;
  };

  const abrResults = () => {
    if (checkingABN) {
      return (
        <Box
          sx={{
            mt: 1.5,
            p: 1.75,
            borderRadius: 2.5,
            border: `1px solid ${LIGHT_BORDER}`,
            bgcolor: "#FFFFFF",
          }}
        >
          <Typography variant="subtitle2" sx={{ mb: 0.75, fontWeight: 800 }}>
            ABN details (from ABR)
          </Typography>
          <Skeleton variant="text" width="70%" height={28} />
          <Skeleton variant="text" width="56%" height={28} />
          <Skeleton variant="text" width="62%" height={28} />
          <Skeleton variant="rectangular" height={42} sx={{ mt: 1, borderRadius: 1.5 }} />
        </Box>
      );
    }

    const hasAny = Boolean(abnEntityName || abnEntityType || abnStatus || abnLastChecked || abnGstRegistered !== null);
    if (!hasAny && !abnVerificationNote) {
      return null;
    }
    if (!hasAny && abnVerificationNote) {
      return (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          We couldn&apos;t verify this ABN. Reason: {abnVerificationNote}
        </Alert>
      );
    }
    return (
      <Box
        sx={{
          mt: 1.5,
          p: 1.75,
          borderRadius: 2.5,
          border: `1px solid ${LIGHT_BORDER}`,
          bgcolor: "#FFFFFF",
        }}
      >
        <Typography variant="subtitle2" sx={{ mb: 0.75, fontWeight: 800 }}>
          ABN details (from ABR)
        </Typography>
        <Box component="ul" sx={{ pl: 2.25, m: 0, color: "#64748B" }}>
          {abnEntityName ? <li><strong>Entity name:</strong> {abnEntityName}</li> : null}
          {abnEntityType ? <li><strong>Entity type:</strong> {abnEntityType}</li> : null}
          {abnStatus ? <li><strong>ABN status:</strong> {abnStatus}</li> : null}
          <li>
            <strong>GST registered (ABR):</strong>{" "}
            {abnGstRegistered == null ? "-" : abnGstRegistered ? "Yes" : "No"}
            {abnGstRegistered ? (
              <>
                {" • "}
                <strong>From:</strong> {formatDate(abnGstFrom)}
                {abnGstTo ? <> {" • "} <strong>To:</strong> {formatDate(abnGstTo)}</> : null}
              </>
            ) : null}
          </li>
          {abnLastChecked ? <li><strong>Last checked:</strong> {formatDateTime(abnLastChecked)}</li> : null}
        </Box>
        {abnVerificationNote ? (
          <Alert severity={editing?.abn_verified ? "success" : "info"} sx={{ mt: 1.25 }}>
            {abnVerificationNote}
          </Alert>
        ) : null}
      </Box>
    );
  };

  const renderPharmacyFormSections = () => (
    <>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Tabs
        value={tabIndex}
        onChange={(_, i) => setTabIndex(i)}
        sx={{
          mb: 3,
          minHeight: 0,
          display: "flex",
          justifyContent: "center",
          "& .MuiTabs-flexContainer": {
            justifyContent: "center",
            gap: 1.25,
            flexWrap: "wrap",
          },
          "& .MuiTabs-scroller": {
            overflow: "visible !important",
          },
          "& .MuiTabs-indicator": {
            display: "none",
          },
        }}
      >
        {tabLabels.map((tab) => (
          <Tab
            key={tab.label}
            icon={tab.icon}
            iconPosition="start"
            label={tab.label}
            sx={{
              minHeight: { xs: 44, md: 48 },
              borderRadius: 999,
              border: `1px solid ${LIGHT_BORDER}`,
              bgcolor: "#FFFFFF",
              color: "#42526E",
              px: { xs: 1.5, md: 2.25 },
              py: 0.5,
              textTransform: "none",
              fontWeight: 900,
              fontSize: { xs: 13, md: 14 },
              boxShadow: "0 8px 18px rgba(6,18,58,0.04)",
              transition: "transform 140ms ease, border-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease",
              "& .MuiTab-iconWrapper": {
                mb: "0 !important",
                mr: 0.9,
                color: "#6D28D9",
              },
              "&.Mui-selected": {
                color: "#143EEA",
                bgcolor: alpha(HERO_GRADIENT_START, 0.1),
                borderColor: alpha(HERO_GRADIENT_START, 0.28),
                boxShadow: "0 14px 30px rgba(20, 62, 234, 0.12)",
                "& .MuiTab-iconWrapper": {
                  color: "#143EEA",
                },
              },
              "&:hover": {
                transform: "translateY(-1px)",
                borderColor: alpha(HERO_GRADIENT_START, 0.22),
                bgcolor: alpha("#FFFFFF", 0.98),
              },
            }}
          />
        ))}
      </Tabs>

      {tabIndex === 0 && (
        <Box sx={{ p: 2 }}>
          {isLoaded && !googlePlaceId && (
            <Autocomplete
              onLoad={(ref) => (autocompleteRef.current = ref)}
              onPlaceChanged={handlePlaceChanged}
              options={{
                componentRestrictions: { country: "au" },
                fields: ["address_components", "geometry", "place_id", "name"],
              }}
            >
              <TextField fullWidth margin="normal" label="Search Address" id="autocomplete-textfield" />
            </Autocomplete>
          )}
          {loadError && <Alert severity="error">Google Maps failed to load.</Alert>}

          {googlePlaceId && (
            <Box
              sx={{
                mt: 2,
                p: 2,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                bgcolor: "action.hover",
              }}
            >
              <TextField label="Street Address" fullWidth margin="normal" value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)} />
              <TextField label="Suburb" fullWidth margin="normal" value={suburb} onChange={(e) => setSuburb(e.target.value)} />
              <TextField label="State" fullWidth margin="normal" value={state} onChange={(e) => setState(e.target.value)} />
              <TextField label="Postcode" fullWidth margin="normal" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
              <Button size="small" onClick={clearAddress} sx={{ mt: 1 }}>
                Clear Address & Search Again
              </Button>
            </Box>
          )}

          <TextField label="Pharmacy Name" fullWidth margin="normal" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Pharmacy Email" type="email" fullWidth margin="normal" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Box>
      )}

      {tabIndex === 1 && (
        <Box sx={{ p: 2 }}>
          <Typography>Approval Certificate</Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 1 }}>
            <Button variant="outlined" component="label">
              Upload Certificate
              <input hidden type="file" onChange={(e) => setApprovalCertFile(e.target.files?.[0] || null)} />
            </Button>
            {approvalCertFile ? (
              <Typography variant="body2">{approvalCertFile.name}</Typography>
            ) : existingApprovalCert ? (
              <MuiLink href={getFileUrl(existingApprovalCert)} target="_blank" rel="noopener noreferrer">
                View
              </MuiLink>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No file uploaded
              </Typography>
            )}
          </Box>
          <TextField
            label="ABN"
            required
            fullWidth
            margin="normal"
            value={abn}
            onChange={(e) => setAbn(e.target.value)}
            disabled={abnIsLocked}
            error={abnInvalid}
            helperText={
              abnIsLocked
                ? "This pharmacy ABN is locked after verification and confirmation."
                : abnInvalid
                  ? "ABN must be exactly 11 digits"
                  : undefined
            }
          />
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} sx={{ alignItems: { xs: "stretch", md: "center" }, mt: 0.5 }}>
            <Button
              variant="outlined"
              onClick={checkABN}
              disabled={abnIsLocked || abnInvalid || !abnDigits || checkingABN}
            >
              {checkingABN ? "Checking..." : "Check ABN"}
            </Button>
            {renderABNChip()}
          </Stack>
          {/* {!editing ? (
            <Alert severity="info" sx={{ mt: 1.5 }}>
              Checking the ABN does not create a pharmacy record. The real pharmacy will be created when you finish and save the onboarding.
            </Alert>
          ) : null} */}
          {abrResults()}
          <Stack direction="row" spacing={1.25} sx={{ mt: 1.5 }}>
            <Button
              variant="contained"
              color="success"
              onClick={confirmABN}
              disabled={isSaving || !abnEntityName || abnIsLocked}
            >
              {abnIsLocked ? "Confirmed" : isSaving ? "Confirming..." : "Confirm this ABN"}
            </Button>
          </Stack>
        </Box>
      )}

      {tabIndex === 2 && (
        <Box sx={{ p: 2 }}>
          <Typography>SOPs (optional)</Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 1, mb: 2 }}>
            <Button variant="outlined" component="label">
              Upload SOPs
              <input hidden type="file" onChange={(e) => setSopsFile(e.target.files?.[0] || null)} />
            </Button>
            {sopsFile ? (
              <Typography variant="body2">{sopsFile.name}</Typography>
            ) : existingSops ? (
              <MuiLink href={getFileUrl(existingSops)} target="_blank" rel="noopener noreferrer">
                View
              </MuiLink>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No file uploaded
              </Typography>
            )}
          </Box>

          <Typography>Induction Guides (optional)</Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 1, mb: 2 }}>
            <Button variant="outlined" component="label">
              Upload Induction Guides
              <input hidden type="file" onChange={(e) => setInductionGuidesFile(e.target.files?.[0] || null)} />
            </Button>
            {inductionGuidesFile ? (
              <Typography variant="body2">{inductionGuidesFile.name}</Typography>
            ) : existingInductionGuides ? (
              <MuiLink href={getFileUrl(existingInductionGuides)} target="_blank" rel="noopener noreferrer">
                View
              </MuiLink>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No file uploaded
              </Typography>
            )}
          </Box>

          <Typography>S8/SUMP Docs (optional)</Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 1 }}>
            <Button variant="outlined" component="label">
              Upload S8/SUMP
              <input hidden type="file" onChange={(e) => setSumpDocsFile(e.target.files?.[0] || null)} />
            </Button>
            {sumpDocsFile ? (
              <Typography variant="body2">{sumpDocsFile.name}</Typography>
            ) : existingSumpDocs ? (
              <MuiLink href={getFileUrl(existingSumpDocs)} target="_blank" rel="noopener noreferrer">
                View
              </MuiLink>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No file uploaded
              </Typography>
            )}
          </Box>
        </Box>
      )}

      {tabIndex === 3 && (
        <Box sx={{ p: { xs: 1, md: 2 } }}>
          <Stack spacing={3}>
            <Box
              sx={{
                p: { xs: 2, md: 2.5 },
                borderRadius: 3,
                border: `1px solid ${LIGHT_BORDER}`,
                bgcolor: "#F8FAFF",
              }}
            >
              <Typography variant="h6" fontWeight={800} sx={{ mb: 0.75 }}>
                Employment Types
              </Typography>
              <Typography variant="body2" sx={{ color: "#64748B", mb: 2 }}>
                Choose the employment arrangements this pharmacy supports.
              </Typography>
              <FormGroup sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" }, gap: 1.5 }}>
                {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
                  <Box
                    key={option}
                    onClick={() => toggleArrayValue(employmentTypes, option, setEmploymentTypes)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.25,
                      p: 1.5,
                      borderRadius: 2.5,
                      border: `1px solid ${employmentTypes.includes(option) ? alpha(HERO_GRADIENT_START, 0.34) : LIGHT_BORDER}`,
                      bgcolor: employmentTypes.includes(option) ? alpha(HERO_GRADIENT_START, 0.08) : LIGHT_SURFACE,
                      cursor: "pointer",
                      transition: "background-color 120ms ease, border-color 120ms ease, transform 120ms ease",
                      "&:hover": {
                        borderColor: alpha(HERO_GRADIENT_START, 0.28),
                        transform: "translateY(-1px)",
                      },
                    }}
                  >
                    <Checkbox
                      checked={employmentTypes.includes(option)}
                      onChange={() => toggleArrayValue(employmentTypes, option, setEmploymentTypes)}
                      sx={{ p: 0.5 }}
                    />
                    <Box>
                      <Typography fontWeight={700}>{prettifyOptionLabel(option)}</Typography>
                      <Typography variant="body2" sx={{ color: "#64748B" }}>
                        Available for this pharmacy
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </FormGroup>
            </Box>

            <Box
              sx={{
                p: { xs: 2, md: 2.5 },
                borderRadius: 3,
                border: `1px solid ${LIGHT_BORDER}`,
                bgcolor: LIGHT_SURFACE,
              }}
            >
              <Typography variant="h6" fontWeight={800} sx={{ mb: 0.75 }}>
                Roles Needed
              </Typography>
              <Typography variant="body2" sx={{ color: "#64748B", mb: 2 }}>
                Mark the staff profiles this pharmacy expects to hire or assign.
              </Typography>
              <FormGroup sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 }}>
                {ROLE_OPTIONS.map((option) => (
                  <Box
                    key={option}
                    onClick={() => toggleArrayValue(rolesNeeded, option, setRolesNeeded)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 1.25,
                      p: 1.5,
                      minHeight: 78,
                      borderRadius: 2.5,
                      border: `1px solid ${rolesNeeded.includes(option) ? alpha(HERO_GRADIENT_START, 0.34) : LIGHT_BORDER}`,
                      bgcolor: rolesNeeded.includes(option) ? alpha(HERO_GRADIENT_START, 0.08) : "#FBFCFE",
                      cursor: "pointer",
                      transition: "background-color 120ms ease, border-color 120ms ease, transform 120ms ease",
                      "&:hover": {
                        borderColor: alpha(HERO_GRADIENT_START, 0.28),
                        transform: "translateY(-1px)",
                      },
                    }}
                  >
                    <Checkbox
                      checked={rolesNeeded.includes(option)}
                      onChange={() => toggleArrayValue(rolesNeeded, option, setRolesNeeded)}
                      sx={{ p: 0.5 }}
                    />
                    <Box sx={{ flex: 1, display: "flex", justifyContent: "left" }}>
                      <Typography fontWeight={700}>{prettifyOptionLabel(option)}</Typography>
                    </Box>
                  </Box>
                ))}
              </FormGroup>
            </Box>
          </Stack>
        </Box>
      )}

      {tabIndex === 4 && (
        <Box sx={{ p: 2 }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "150px 1fr 1fr auto" },
              gap: 2,
              alignItems: "center",
              mb: 3,
              p: 2,
              borderRadius: 3,
              border: `1px solid ${LIGHT_BORDER}`,
              bgcolor: "#F8FAFF",
            }}
          >
            <Typography fontWeight={800}>Weekdays</Typography>
            <TextField
              label="Start"
              type="time"
              fullWidth
              value={weekdaysStart}
              onChange={(e) => setWeekdaysStart(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="End"
              type="time"
              fullWidth
              value={weekdaysEnd}
              onChange={(e) => setWeekdaysEnd(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <Button size="small" onClick={handleApplyToWeekdays} disabled={!weekdaysStart || !weekdaysEnd}>
              Apply to all
            </Button>
          </Box>

          {hoursFields.map(({ label, start, setStart, end, setEnd, closed, setClosed }) => (
            <Box
              key={label}
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "150px 1fr 1fr 110px" },
                gap: 2,
                alignItems: "center",
                mb: 2,
              }}
            >
              <Typography>{label}</Typography>
              <TextField
                label="Start"
                type="time"
                fullWidth
                value={closed ? "" : start}
                onChange={(e) => setStart(e.target.value)}
                disabled={closed}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="End"
                type="time"
                fullWidth
                value={closed ? "" : end}
                onChange={(e) => setEnd(e.target.value)}
                disabled={closed}
                InputLabelProps={{ shrink: true }}
              />
              <Box
                onClick={() => setClosed(!closed)}
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.75,
                  minHeight: 42,
                  px: 1.25,
                  borderRadius: 999,
                  border: "1px solid",
                  borderColor: closed ? alpha("#DC2626", 0.5) : LIGHT_BORDER,
                  bgcolor: closed ? alpha("#DC2626", 0.1) : "#F8FAFC",
                  color: closed ? "#B91C1C" : "#475569",
                  cursor: "pointer",
                  transition: "background-color 120ms ease, border-color 120ms ease, color 120ms ease",
                  "&:hover": {
                    borderColor: closed ? alpha("#DC2626", 0.65) : alpha("#DC2626", 0.34),
                    bgcolor: closed ? alpha("#DC2626", 0.14) : alpha("#DC2626", 0.06),
                  },
                }}
              >
                <BlockRoundedIcon fontSize="small" />
                <Typography variant="body2" fontWeight={900} sx={{ color: "inherit" }}>Closed</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {tabIndex === 5 && (
        <Box sx={{ p: 2 }}>
          <Box
            component="a"
            href={GOVERNMENT_AWARD_GUIDE_URL}
            target="_blank"
            rel="noreferrer"
            sx={{
              display: "block",
              mb: 2,
              p: 2,
              borderRadius: 3,
              border: `1px solid ${alpha(HERO_GRADIENT_START, 0.12)}`,
              bgcolor: "#F7F9FF",
              boxShadow: "0 10px 24px rgba(20, 62, 234, 0.06)",
              textDecoration: "none",
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color: "#6D28D9",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: ".08em",
              }}
            >
              Award Guide
            </Typography>
            <Typography sx={{ mt: 0.5, color: "#111827", fontSize: 15, fontWeight: 800, lineHeight: 1.45 }}>
              Staff are paid according to the current government award rate.
            </Typography>
            <Typography sx={{ mt: 0.5, color: "#64748B", fontSize: 13, lineHeight: 1.6 }}>
              The rate details below apply to the locum Pharmacist rates for this pharmacy.
            </Typography>
            <Typography sx={{ mt: 1, color: HERO_GRADIENT_START, fontSize: 13, fontWeight: 800 }}>
              View Fair Work award guide
            </Typography>
            <Typography sx={{ mt: 0.25, color: "#64748B", fontSize: 12 }}>
              Published 6 February 2026
            </Typography>
          </Box>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
            Default Rate Type
          </Typography>
          <FormControl fullWidth margin="normal">
            <InputLabel id="rate-type-label">Default Rate Type</InputLabel>
            <Select
              labelId="rate-type-label"
              value={defaultRateType}
              label="Default Rate Type"
              onChange={(e) => setDefaultRateType(e.target.value)}
            >
              {RATE_TYPES.map((type) => (
                <MenuItem key={type.value} value={type.value}>
                  {type.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {defaultRateType && defaultRateType !== "PHARMACIST_PROVIDED" && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                Base Rates
              </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            These rates apply when "Fixed" or "Flexible" is selected. They are disabled if you choose
            "Pharmacist Provided".
          </Typography>
          <Typography variant="body2" sx={{ color: "#64748B", mb: 2 }}>
            Enter rates in AUD. Minimum example: {RATE_MINIMUM_EXAMPLE}.
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Weekday Rate"
                type="number"
                fullWidth
                value={rateWeekday}
                onChange={(e) => setRateWeekday(e.target.value)}
                placeholder={RATE_MINIMUM_EXAMPLE}
                inputProps={{ min: 55, step: "0.01" }}
                InputProps={{ startAdornment: <InputAdornment position="start">AUD</InputAdornment> }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Saturday Rate"
                type="number"
                fullWidth
                value={rateSaturday}
                onChange={(e) => setRateSaturday(e.target.value)}
                placeholder={RATE_MINIMUM_EXAMPLE}
                inputProps={{ min: 55, step: "0.01" }}
                InputProps={{ startAdornment: <InputAdornment position="start">AUD</InputAdornment> }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Sunday Rate"
                type="number"
                fullWidth
                value={rateSunday}
                onChange={(e) => setRateSunday(e.target.value)}
                placeholder={RATE_MINIMUM_EXAMPLE}
                inputProps={{ min: 55, step: "0.01" }}
                InputProps={{ startAdornment: <InputAdornment position="start">AUD</InputAdornment> }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Public Holiday Rate"
                type="number"
                fullWidth
                value={ratePublicHoliday}
                onChange={(e) => setRatePublicHoliday(e.target.value)}
                placeholder={RATE_MINIMUM_EXAMPLE}
                inputProps={{ min: 55, step: "0.01" }}
                InputProps={{ startAdornment: <InputAdornment position="start">AUD</InputAdornment> }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Early Morning Rate (Before 8am)"
                type="number"
                fullWidth
                value={rateEarlyMorning}
                onChange={(e) => setRateEarlyMorning(e.target.value)}
                placeholder={RATE_MINIMUM_EXAMPLE}
                inputProps={{ min: 55, step: "0.01" }}
                InputProps={{ startAdornment: <InputAdornment position="start">AUD</InputAdornment> }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Late Night Rate (After 7pm)"
                type="number"
                fullWidth
                value={rateLateNight}
                onChange={(e) => setRateLateNight(e.target.value)}
                placeholder={RATE_MINIMUM_EXAMPLE}
                inputProps={{ min: 55, step: "0.01" }}
                InputProps={{ startAdornment: <InputAdornment position="start">AUD</InputAdornment> }}
              />
            </Grid>
          </Grid>
            </Box>
          )}
        </Box>
      )}

      {tabIndex === 6 && (
        <Box sx={{ p: 2 }}>
          <TextField
            label="About"
            fullWidth
            multiline
            minRows={4}
            value={about}
            onChange={(e) => setAbout(e.target.value)}
          />
        </Box>
      )}
    </>
  );

  useEffect(() => {
    const viewParam = searchParams.get("view");
    const idParam = searchParams.get("pharmacyId");
    const claimParam = searchParams.get("claim");
    if (viewParam === "detail" && idParam) {
      if (searchParams.get("pharmacy_id") !== idParam) {
        const params = new URLSearchParams(searchParams);
        params.set("workspace", "internal");
        params.set("pharmacy_id", idParam);
        setSearchParams(params, { replace: true });
        return;
      }
      setView((prev) => (prev === "detail" ? prev : "detail"));
      setActivePharmacyId((prev) => (prev === idParam ? prev : idParam));
    } else {
      setView((prev) => (prev === "list" ? prev : "list"));
      setActivePharmacyId((prev) => (prev === null ? prev : null));
    }
    if (claimParam === "open") {
      if (isOrganizationUser) {
        setClaimAccordionOpen(true);
      } else {
        setOwnerAccordionOpen(true);
      }
      const params = new URLSearchParams(searchParams);
      params.delete("claim");
      setSearchParams(params, { replace: true });
    }
  }, [searchParams, isOrganizationUser, setSearchParams]);

  const setViewWithHistory = useCallback(
    (nextView: "list" | "detail", options?: { pharmacyId?: string | null; replace?: boolean }) => {
      const params = new URLSearchParams(searchParams);
      params.delete("action");
      if (nextView === "detail" && options?.pharmacyId) {
        params.set("view", "detail");
        params.set("pharmacyId", options.pharmacyId);
        params.set("workspace", "internal");
        params.set("pharmacy_id", options.pharmacyId);
        setSearchParams(params, { replace: options?.replace });
        setView("detail");
        setActivePharmacyId(options.pharmacyId);
      } else {
        params.delete("view");
        params.delete("pharmacyId");
        setSearchParams(params, { replace: options?.replace });
        setView("list");
        setActivePharmacyId(null);
      }
    },
    [searchParams, setSearchParams]
  );

  const clearActionParam = useCallback(() => {
    if (!searchParams.get("action")) return;
    const params = new URLSearchParams(searchParams);
    params.delete("action");
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const hoursFields = [
    { label: "Monday", start: mondayStart, setStart: setMondayStart, end: mondayEnd, setEnd: setMondayEnd, closed: mondayClosed, setClosed: setMondayClosed },
    { label: "Tuesday", start: tuesdayStart, setStart: setTuesdayStart, end: tuesdayEnd, setEnd: setTuesdayEnd, closed: tuesdayClosed, setClosed: setTuesdayClosed },
    { label: "Wednesday", start: wednesdayStart, setStart: setWednesdayStart, end: wednesdayEnd, setEnd: setWednesdayEnd, closed: wednesdayClosed, setClosed: setWednesdayClosed },
    { label: "Thursday", start: thursdayStart, setStart: setThursdayStart, end: thursdayEnd, setEnd: setThursdayEnd, closed: thursdayClosed, setClosed: setThursdayClosed },
    { label: "Friday", start: fridayStart, setStart: setFridayStart, end: fridayEnd, setEnd: setFridayEnd, closed: fridayClosed, setClosed: setFridayClosed },
    { label: "Saturdays", start: saturdaysStart, setStart: setSaturdaysStart, end: saturdaysEnd, setEnd: setSaturdaysEnd, closed: saturdaysClosed, setClosed: setSaturdaysClosed },
    { label: "Sundays", start: sundaysStart, setStart: setSundaysStart, end: sundaysEnd, setEnd: setSundaysEnd, closed: sundaysClosed, setClosed: setSundaysClosed },
    { label: "Public Holidays", start: publicHolidaysStart, setStart: setPublicHolidaysStart, end: publicHolidaysEnd, setEnd: setPublicHolidaysEnd, closed: publicHolidaysClosed, setClosed: setPublicHolidaysClosed },
  ];

  const showSnackbar = (message: string, severity: "success" | "error" | "info" = "info") => {
    setSnackbarState({ message, severity });
    setSnackbarOpen(true);
  };

  const loadOrganizationClaims = useCallback(async () => {
    if (!isOrganizationUser || organizationId == null) {
      return;
    }
    setClaimsLoading(true);
    setClaimError(null);
    try {
      const res = await getPharmacyClaims({ organization: organizationId });
      const payload = Array.isArray((res as any)?.results)
        ? (res as any).results
        : Array.isArray(res)
        ? res
        : [];
      setClaimItems(payload);
      setClaimError(null);
    } catch (err) {
      console.error(err);
      setClaimError("Failed to load claim requests.");
    } finally {
      setClaimsLoading(false);
    }
  }, [isOrganizationUser, organizationId]);

  const loadOwnerClaims = useCallback(async () => {
    if (isOrganizationUser) {
      return;
    }
    setOwnerClaimsLoading(true);
    setOwnerClaimError(null);
    try {
      const res = await getPharmacyClaims({ owned_by_me: true });
      const data = Array.isArray((res as any)?.results)
        ? (res as any).results
        : Array.isArray(res)
        ? res
        : [];
      setOwnerClaims(data);
      setOwnerClaimError(null);
    } catch (err: any) {
      const message = err?.response?.data?.detail ?? "Failed to load claim requests.";
      setOwnerClaimError(message);
    } finally {
      setOwnerClaimsLoading(false);
    }
  }, [isOrganizationUser]);

  const handleSubmitClaim = async () => {
    if (!claimEmail.trim()) {
      setClaimError("Please enter a pharmacy email.");
      return;
    }
    setClaimError(null);
    setClaimSubmitting(true);
    try {
      await claimOnboarding({ pharmacy_email: claimEmail.trim() });
      setClaimEmail("");
      showSnackbar("Claim submitted!", "success");
      await loadOrganizationClaims();
      if (!claimAccordionOpen) {
        setClaimAccordionOpen(true);
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        (Array.isArray(err?.response?.data?.pharmacy_email)
          ? err.response.data.pharmacy_email[0]
          : "Claim failed. Please confirm you have organization access.");
      setClaimError(message);
    } finally {
      setClaimSubmitting(false);
    }
  };

  const openOwnerClaimDialog = (claim: OwnerClaimRequest, action: ClaimStatus) => {
    setOwnerDialog({ open: true, claim, action, note: "" });
  };

  const closeOwnerDialog = () => {
    if (ownerResponding) {
      return;
    }
    setOwnerDialog(initialOwnerDialogState);
  };

  const handleOwnerRespond = async () => {
    if (!ownerDialog.claim || !ownerDialog.action || !canRespondToClaims) {
      return;
    }
    setOwnerResponding(true);
    try {
      await updatePharmacyClaim(ownerDialog.claim.id, {
        status: ownerDialog.action,
        response_message: ownerDialog.note.trim() || undefined,
      });
      showSnackbar(
        ownerDialog.action === "ACCEPTED" ? "Claim accepted." : "Claim rejected.",
        "success"
      );
      setOwnerDialog(initialOwnerDialogState);
      await loadOwnerClaims();
    } catch (err: any) {
      const message = err?.response?.data?.detail ?? "Failed to update the claim.";
      setOwnerClaimError(message);
    } finally {
      setOwnerResponding(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const cachedRaw = sessionStorage.getItem(PHARMACY_CACHE_KEY);
      if (!cachedRaw) return;
      const cached = JSON.parse(cachedRaw) as {
        pharmacies?: Pharmacy[];
        memberships?: Record<string, MembershipDTO[]>;
        admin_assignments?: Record<string, PharmacyAdminDTO[]>;
      };
      if (Array.isArray(cached.pharmacies)) {
        const normalized = cached.pharmacies.map((ph) => normalizePharmacy(ph));
        setPharmacies(scopePharmacies(normalized));
        if (cached.pharmacies.length > 0) {
          setInitialLoadComplete(true);
        }
      }
      if (cached.memberships) {
        setMembershipsByPharmacy(cached.memberships);
      }
      if (cached.admin_assignments) {
        setAdminAssignmentsByPharmacy(cached.admin_assignments);
      }
    } catch (error) {
      console.error("Failed to hydrate pharmacy cache", error);
    }
  }, []);

  const loadMembers = useCallback(
    async (pharmacyId: string) => {
      setMembershipsLoading((prev) => ({ ...prev, [pharmacyId]: true }));
      try {
        const [memberData, adminData] = await Promise.all([
          fetchMembershipsForPharmacy(pharmacyId),
          fetchPharmacyAdminsService({ pharmacy: pharmacyId }),
        ]);
        setMembershipsByPharmacy((prev) => ({
          ...prev,
          [pharmacyId]: Array.isArray(memberData) ? memberData : [],
        }));
        setAdminAssignmentsByPharmacy((prev) => ({
          ...prev,
          [pharmacyId]: Array.isArray(adminData) ? adminData : [],
        }));
      } catch (err) {
        console.error("Failed to load memberships", err);
      } finally {
        setMembershipsLoading((prev) => ({ ...prev, [pharmacyId]: false }));
      }
    },
    []
  );

  useEffect(() => {
    if (view === "detail" && activePharmacyId) {
      void loadMembers(activePharmacyId);
    }
  }, [view, activePharmacyId, loadMembers]);

  const loadPharmacies = useCallback(async () => {
    setIsFetching(true);
    try {
      const data = await fetchPharmaciesService({});
      const normalized = data.map(normalizePharmacy);
      let accessible = normalized;
      if (isOrganizationUser && scopedOrgPharmacyIds && scopedOrgPharmacyIds.size > 0 && user?.role !== "ORG_ADMIN") {
        accessible = normalized.filter((pharmacy: Pharmacy) => scopedOrgPharmacyIds.has(Number(pharmacy.id)));
      }
      setPharmacies(scopePharmacies(accessible));
      await Promise.all(accessible.map((p: Pharmacy) => loadMembers(p.id)));
      setInitialLoadComplete(true);
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 404) {
        setNeedsOnboarding(true);
        setInitialLoadComplete(true);
      } else {
        console.error(err);
      }
    } finally {
      setIsFetching(false);
    }
  }, [isOrganizationUser, loadMembers, scopePharmacies, scopedOrgPharmacyIds, user?.role]);

  useEffect(() => {
    if (!user) return;

    const isOrgRoleUser =
      Array.isArray(user?.memberships) &&
      user.memberships.some((m: any) => {
        const roleSlug = String(m?.role ?? "").toUpperCase();
        return ORG_ROLES.includes(roleSlug as (typeof ORG_ROLES)[number]);
      });

    if (isOrgRoleUser || isAdminUser || isOrganizationUser) {
      void loadPharmacies();
      return;
    }

    setIsFetching(true);
    getOnboarding("owner")
      .then(() => loadPharmacies())
      .catch((err: unknown) => {
        if (err instanceof AxiosError && err.response?.status === 404) {
          setNeedsOnboarding(true);
          setInitialLoadComplete(true);
        } else {
          console.error(err);
        }
        setIsFetching(false);
      });
  }, [user, loadPharmacies]);

  useEffect(() => {
    if (!standalone || isFetching || needsOnboarding || dialogOpen || editing || pharmacies.length > 0) {
      return;
    }
    openDialog();
  }, [standalone, isFetching, needsOnboarding, dialogOpen, editing, pharmacies.length]);

  useEffect(() => {
    if (isOrganizationUser) {
      void loadOrganizationClaims();
    }
  }, [isOrganizationUser, loadOrganizationClaims]);

  useEffect(() => {
    if (!isOrganizationUser) {
      void loadOwnerClaims();
    }
  }, [isOrganizationUser, loadOwnerClaims]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!initialLoadComplete) return;
    try {
      const payload = JSON.stringify({
        pharmacies,
        memberships: membershipsByPharmacy,
        admin_assignments: adminAssignmentsByPharmacy,
      });
      sessionStorage.setItem(PHARMACY_CACHE_KEY, payload);
    } catch (error) {
      console.error("Failed to persist pharmacy cache", error);
    }
  }, [pharmacies, membershipsByPharmacy, adminAssignmentsByPharmacy, initialLoadComplete]);

  const openPharmacy = useCallback(
    (pharmacyId: string, options?: { replace?: boolean }) => {
      setViewWithHistory("detail", { pharmacyId, replace: options?.replace });
      void loadMembers(pharmacyId);
    },
    [loadMembers, setViewWithHistory]
  );

  const openAdmins = useCallback(
    (pharmacyId: string) => {
      openPharmacy(pharmacyId);
    },
    [openPharmacy]
  );

  const goBackToList = useCallback(() => {
    setViewWithHistory("list", { replace: true });
  }, [setViewWithHistory]);

  const resetDialogState = () => {
    setApprovalCertFile(null);
    setSopsFile(null);
    setInductionGuidesFile(null);
    setSumpDocsFile(null);
    applyAbnMeta(null);
    setCheckingABN(false);
    setTabIndex(0);
    setError("");
  };

  const openDialog = (pharmacy?: Pharmacy) => {
    resetDialogState();
    if (pharmacy) {
      setEditing(pharmacy);
      setName(pharmacy.name || "");
      setEmail(pharmacy.email ?? "");
      setStreetAddress(pharmacy.street_address || "");
      setSuburb(pharmacy.suburb || "");
      setPostcode(pharmacy.postcode || "");
      setGooglePlaceId(pharmacy.google_place_id || "");
      setLatitude(pharmacy.latitude !== null && pharmacy.latitude !== undefined ? Number(pharmacy.latitude) : null);
      setLongitude(pharmacy.longitude !== null && pharmacy.longitude !== undefined ? Number(pharmacy.longitude) : null);
      setState(pharmacy.state || "");
      setAbn(pharmacy.abn || "");
      applyAbnMeta(pharmacy);
      setExistingApprovalCert(pharmacy.methadone_s8_protocols || null);
      setExistingSops(pharmacy.sops || null);
      setExistingInductionGuides(pharmacy.induction_guides || null);
      setExistingSumpDocs(pharmacy.qld_sump_docs || null);
      setEmploymentTypes(pharmacy.employment_types || []);
      setRolesNeeded(pharmacy.roles_needed || []);
      setWeekdaysStart(pharmacy.weekdays_start || pharmacy.monday_start || "");
      setWeekdaysEnd(pharmacy.weekdays_end || pharmacy.monday_end || "");
      setMondayStart(pharmacy.monday_start || pharmacy.weekdays_start || "");
      setMondayEnd(pharmacy.monday_end || pharmacy.weekdays_end || "");
      setMondayClosed(Boolean(pharmacy.monday_closed));
      setTuesdayStart(pharmacy.tuesday_start || pharmacy.weekdays_start || "");
      setTuesdayEnd(pharmacy.tuesday_end || pharmacy.weekdays_end || "");
      setTuesdayClosed(Boolean(pharmacy.tuesday_closed));
      setWednesdayStart(pharmacy.wednesday_start || pharmacy.weekdays_start || "");
      setWednesdayEnd(pharmacy.wednesday_end || pharmacy.weekdays_end || "");
      setWednesdayClosed(Boolean(pharmacy.wednesday_closed));
      setThursdayStart(pharmacy.thursday_start || pharmacy.weekdays_start || "");
      setThursdayEnd(pharmacy.thursday_end || pharmacy.weekdays_end || "");
      setThursdayClosed(Boolean(pharmacy.thursday_closed));
      setFridayStart(pharmacy.friday_start || pharmacy.weekdays_start || "");
      setFridayEnd(pharmacy.friday_end || pharmacy.weekdays_end || "");
      setFridayClosed(Boolean(pharmacy.friday_closed));
      setSaturdaysStart(pharmacy.saturdays_start || "");
      setSaturdaysEnd(pharmacy.saturdays_end || "");
      setSaturdaysClosed(Boolean(pharmacy.saturdays_closed));
      setSundaysStart(pharmacy.sundays_start || "");
      setSundaysEnd(pharmacy.sundays_end || "");
      setSundaysClosed(Boolean(pharmacy.sundays_closed));
      setPublicHolidaysStart(pharmacy.public_holidays_start || "");
      setPublicHolidaysEnd(pharmacy.public_holidays_end || "");
      setPublicHolidaysClosed(Boolean(pharmacy.public_holidays_closed));
      setDefaultRateType(pharmacy.default_rate_type || "FIXED");
      setDefaultFixedRate(pharmacy.default_fixed_rate || "");
      setRateWeekday(pharmacy.rate_weekday || "");
      setRateSaturday(pharmacy.rate_saturday || "");
      setRateSunday(pharmacy.rate_sunday || "");
      setRatePublicHoliday(pharmacy.rate_public_holiday || "");
      setRateEarlyMorning(pharmacy.rate_early_morning || "");
      setRateLateNight(pharmacy.rate_late_night || "");
      setAbout(pharmacy.about || "");
      setAutoPublishWorkerRequests(Boolean(pharmacy.auto_publish_worker_requests));
    } else {
      setEditing(null);
      setName("");
      setEmail("");
      setStreetAddress("");
      setSuburb("");
      setPostcode("");
      setGooglePlaceId("");
      setLatitude(null);
      setLongitude(null);
      setState("");
      setAbn("");
      applyAbnMeta(null);
      setExistingApprovalCert(null);
      setExistingSops(null);
      setExistingInductionGuides(null);
      setExistingSumpDocs(null);
      setEmploymentTypes([]);
      setRolesNeeded([]);
      setWeekdaysStart("");
      setWeekdaysEnd("");
      setMondayStart("");
      setMondayEnd("");
      setMondayClosed(false);
      setTuesdayStart("");
      setTuesdayEnd("");
      setTuesdayClosed(false);
      setWednesdayStart("");
      setWednesdayEnd("");
      setWednesdayClosed(false);
      setThursdayStart("");
      setThursdayEnd("");
      setThursdayClosed(false);
      setFridayStart("");
      setFridayEnd("");
      setFridayClosed(false);
      setSaturdaysStart("");
      setSaturdaysEnd("");
      setSaturdaysClosed(false);
      setSundaysStart("");
      setSundaysEnd("");
      setSundaysClosed(false);
      setPublicHolidaysStart("");
      setPublicHolidaysEnd("");
      setPublicHolidaysClosed(false);
      setDefaultRateType("FIXED");
      setDefaultFixedRate("");
      setRateWeekday("");
      setRateSaturday("");
      setRateSunday("");
      setRatePublicHoliday("");
      setRateEarlyMorning("");
      setRateLateNight("");
      setAbout("");
      setAutoPublishWorkerRequests(false);
    }
  if (standalone) {
    setView("list");
    setActivePharmacyId(null);
    return;
  }
  setDialogOpen(true);
};

  useEffect(() => {
    const action = searchParams.get("action");
    const idParam = searchParams.get("pharmacyId");
    if (!action || !idParam) return;

    const target = pharmacies.find((p) => p.id === idParam);
    if (!target) return;

    if (action === "edit") {
      openDialog(target);
      clearActionParam();
    } else if (action === "delete") {
      setPendingDeletePharmacy((current) => (current?.id === target.id ? current : target));
    }
  }, [searchParams, pharmacies, openDialog, clearActionParam]);

  const closeDialog = () => {
    if (standalone) {
      setEditing(null);
      setError("");
      clearActionParam();
      return;
    }
    setDialogOpen(false);
    setEditing(null);
    setError("");
    clearActionParam();
  };

  const clearAddress = () => {
    setStreetAddress("");
    setSuburb("");
    setPostcode("");
    setGooglePlaceId("");
    setLatitude(null);
    setLongitude(null);
    const input = document.getElementById("autocomplete-textfield") as HTMLInputElement | null;
    if (input) input.value = "";
  };

  const updatePharmacyAbnState = (saved: Pharmacy) => {
    setEditing(saved);
    setAbn(saved.abn || "");
    applyAbnMeta(saved);
    setPharmacies((prev) => {
      const exists = prev.some((item) => item.id === saved.id);
      const next = exists
        ? prev.map((item) => (item.id === saved.id ? saved : item))
        : [...prev, saved];
      return scopePharmacies(next);
    });
    if (activePharmacyId === saved.id) {
      setActivePharmacyId(saved.id);
    }
  };

  const checkABN = async () => {
    if (!name.trim() || !streetAddress.trim() || !suburb.trim() || !postcode.trim()) {
      setError("Enter the pharmacy basic details first so the ABN check can run during onboarding.");
      setTabIndex(0);
      return;
    }
    if (abnDigits.length !== 11) {
      setError("ABN must be 11 digits.");
      setTabIndex(1);
      return;
    }
    setCheckingABN(true);
    setError("");
    try {
      const res = await lookupPharmacyAbn({ abn: abnDigits });
      setAbnConfirmedLocal(false);
      setAbn(res?.abn || abnDigits);
      applyAbnMeta(res);
      showSnackbar("ABN details fetched.", "success");
    } catch (err: any) {
      setError(err?.response?.data?.abn?.[0] || err?.response?.data?.detail || err?.message || "Failed to check ABN.");
    } finally {
      setCheckingABN(false);
    }
  };

  const confirmABN = async () => {
    if (!abnEntityName) {
      setError("Run the ABN check first, then confirm the ABN details.");
      return;
    }
    if (!editing) {
      setAbnConfirmedLocal(true);
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const res = await updatePharmacy(editing.id, {
        abn: abnDigits,
        submitted_for_verification: true,
        abn_entity_confirmed: true,
      });
      const saved = normalizePharmacy(res);
      updatePharmacyAbnState(saved);
      showSnackbar("ABN confirmed.", "success");
    } catch (err: any) {
      setError(err?.response?.data?.abn?.[0] || err?.response?.data?.detail || err?.message || "Failed to confirm ABN.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyToWeekdays = () => {
    if (weekdaysStart && weekdaysEnd) {
      setMondayStart(weekdaysStart);
      setMondayEnd(weekdaysEnd);
      setTuesdayStart(weekdaysStart);
      setTuesdayEnd(weekdaysEnd);
      setWednesdayStart(weekdaysStart);
      setWednesdayEnd(weekdaysEnd);
      setThursdayStart(weekdaysStart);
      setThursdayEnd(weekdaysEnd);
      setFridayStart(weekdaysStart);
      setFridayEnd(weekdaysEnd);
      setSaturdaysStart(weekdaysStart);
      setSaturdaysEnd(weekdaysEnd);
      setSundaysStart(weekdaysStart);
      setSundaysEnd(weekdaysEnd);
      setPublicHolidaysStart(weekdaysStart);
      setPublicHolidaysEnd(weekdaysEnd);
      setMondayClosed(false);
      setTuesdayClosed(false);
      setWednesdayClosed(false);
      setThursdayClosed(false);
      setFridayClosed(false);
      setSaturdaysClosed(false);
      setSundaysClosed(false);
      setPublicHolidaysClosed(false);
      showSnackbar("Hours applied to every day.", "success");
    }
  };

  const handlePlaceChanged = () => {
    if (!autocompleteRef.current) return;
    const place = autocompleteRef.current.getPlace();
    if (!place || !place.address_components) return;

    let streetNumber = "";
    let route = "";
    let locality = "";
    let postalCode = "";
    let stateShort = "";

    place.address_components.forEach((component) => {
      const types = component.types;
      if (types.includes("street_number")) streetNumber = component.long_name;
      if (types.includes("route")) route = component.short_name;
      if (types.includes("locality")) locality = component.long_name;
      if (types.includes("postal_code")) postalCode = component.long_name;
      if (types.includes("administrative_area_level_1")) stateShort = component.short_name;
    });

    setStreetAddress(`${streetNumber} ${route}`.trim());
    setSuburb(locality);
    setPostcode(postalCode);
    setState(stateShort);
    setGooglePlaceId(place.place_id || "");
    if (place.geometry?.location) {
      setLatitude(place.geometry.location.lat());
      setLongitude(place.geometry.location.lng());
    }
    if (place.name) setName(place.name);
  };

  const getFileUrl = (path: string | null) => {
    if (!path) return "";
    return path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
  };

  const hasDraftContent =
    Boolean(
      name.trim() ||
      email.trim() ||
      streetAddress.trim() ||
      suburb.trim() ||
      postcode.trim() ||
      abn.trim() ||
      googlePlaceId ||
      about.trim() ||
      approvalCertFile ||
      sopsFile ||
      inductionGuidesFile ||
      sumpDocsFile
    ) ||
    employmentTypes.length > 0 ||
    rolesNeeded.length > 0;

  const canCreatePharmacyDraft =
    Boolean(name.trim() && streetAddress.trim() && suburb.trim() && postcode.trim()) &&
    abnDigits.length === 11 &&
    (!defaultRateType ||
      defaultRateType === "PHARMACIST_PROVIDED" ||
      Boolean(rateWeekday && rateSaturday && rateSunday && ratePublicHoliday));

  const buildPharmacyFormData = ({ includeFiles = true, submittedForVerification = false }: { includeFiles?: boolean; submittedForVerification?: boolean } = {}) => {
    const fd = new FormData();
    fd.append("name", name);
    fd.append("email", email.trim());
    fd.append("street_address", streetAddress);
    fd.append("suburb", suburb);
    fd.append("postcode", postcode);
    fd.append("google_place_id", googlePlaceId);
    if (latitude !== null && !Number.isNaN(Number(latitude))) {
      fd.append("latitude", Number(latitude).toFixed(6));
    }
    if (longitude !== null && !Number.isNaN(Number(longitude))) {
      fd.append("longitude", Number(longitude).toFixed(6));
    }
    fd.append("state", state);
    fd.append("abn", abnDigits);
    if (includeFiles && approvalCertFile) fd.append("methadone_s8_protocols", approvalCertFile);
    if (includeFiles && sopsFile) fd.append("sops", sopsFile);
    if (includeFiles && inductionGuidesFile) fd.append("induction_guides", inductionGuidesFile);
    if (includeFiles && sumpDocsFile) fd.append("qld_sump_docs", sumpDocsFile);
    fd.append("employment_types", JSON.stringify(employmentTypes));
    fd.append("roles_needed", JSON.stringify(rolesNeeded));
    fd.append("weekdays_start", weekdaysStart);
    fd.append("weekdays_end", weekdaysEnd);
    const appendHours = (prefix: string, start: string, end: string, closed: boolean) => {
      fd.append(`${prefix}_closed`, String(closed));
      fd.append(`${prefix}_start`, closed ? "" : start);
      fd.append(`${prefix}_end`, closed ? "" : end);
    };
    appendHours("monday", mondayStart, mondayEnd, mondayClosed);
    appendHours("tuesday", tuesdayStart, tuesdayEnd, tuesdayClosed);
    appendHours("wednesday", wednesdayStart, wednesdayEnd, wednesdayClosed);
    appendHours("thursday", thursdayStart, thursdayEnd, thursdayClosed);
    appendHours("friday", fridayStart, fridayEnd, fridayClosed);
    appendHours("saturdays", saturdaysStart, saturdaysEnd, saturdaysClosed);
    appendHours("sundays", sundaysStart, sundaysEnd, sundaysClosed);
    appendHours("public_holidays", publicHolidaysStart, publicHolidaysEnd, publicHolidaysClosed);
    fd.append("default_rate_type", defaultRateType);
    if (defaultFixedRate) fd.append("default_fixed_rate", defaultFixedRate);

    if (rateWeekday) fd.append("rate_weekday", rateWeekday);
    if (rateSaturday) fd.append("rate_saturday", rateSaturday);
    if (rateSunday) fd.append("rate_sunday", rateSunday);
    if (ratePublicHoliday) fd.append("rate_public_holiday", ratePublicHoliday);
    if (rateEarlyMorning) fd.append("rate_early_morning", rateEarlyMorning);
    if (rateLateNight) fd.append("rate_late_night", rateLateNight);
    fd.append("about", about);
    fd.append("auto_publish_worker_requests", String(autoPublishWorkerRequests));
    if (submittedForVerification) {
      fd.append("submitted_for_verification", "true");
    }
    if (abnConfirmedLocal) {
      fd.append("abn_entity_confirmed", "true");
      fd.append("submitted_for_verification", "true");
    }

    const orgMem = Array.isArray(user?.memberships)
      ? user.memberships.find(
          (m): m is OrgMembership =>
            (m as any)?.role === "ORG_ADMIN" && "organization_id" in (m as any)
        )
      : undefined;
    if (orgMem?.organization_id) {
      fd.append("organization", String(orgMem.organization_id));
    }

    return fd;
  };

  const persistPharmacy = async ({ redirectAfterSave = false }: { redirectAfterSave?: boolean } = {}) => {
    if (abnDigits.length !== 11) {
      setError("ABN must be 11 digits.");
      return false;
    }

    if (defaultRateType && defaultRateType !== "PHARMACIST_PROVIDED") {
      if (!rateWeekday || !rateSaturday || !rateSunday || !ratePublicHoliday) {
        setError(
          "Please fill in base rates (Weekday, Saturday, Sunday, Public Holiday) or select 'Pharmacist Provided'."
        );
        return false;
      }
    }

    const fd = buildPharmacyFormData();

    try {
      setIsSaving(true);
      if (editing) {
        const res = await updatePharmacy(editing.id, fd);
        const saved = normalizePharmacy(res);
        setPharmacies((prev) =>
          scopePharmacies(prev.map((p) => (p.id === saved.id ? saved : p)))
        );
        await loadMembers(saved.id);
        showSnackbar("Pharmacy updated!", "success");
        if (activePharmacyId === editing.id) {
          setActivePharmacyId(saved.id);
        }
        if (redirectAfterSave) {
          closeDialog();
          navigate(onCompletePath);
          return true;
        }
      } else {
        const res = await createPharmacy(fd);
        const saved = normalizePharmacy(res);
        const nextCount = pharmacies.some((p) => p.id === saved.id) ? pharmacies.length : pharmacies.length + 1;
        clearOwnerPharmacySetupSkipped();
        setPharmacies((prev) => {
          if (scopedPharmacyId != null && Number(saved.id) !== scopedPharmacyId) {
            return prev;
          }
          return scopePharmacies([...prev, saved]);
        });
        await loadMembers(saved.id);
        showSnackbar("Pharmacy added!", "success");
        if (redirectAfterSave) {
          closeDialog();
          navigate(onCompletePath);
          return true;
        }
        if (standalone) {
          if (normalizedTargetPharmacyCount > 1 && nextCount < normalizedTargetPharmacyCount) {
            setAdditionalPharmacyPromptOpen(true);
          } else {
            navigate(onCompletePath);
          }
        } else {
          setViewWithHistory("detail", { pharmacyId: saved.id });
        }
      }
      closeDialog();
      return true;
    } catch (err) {
      if (err instanceof AxiosError) {
        setError(err.response?.data?.detail || err.message);
      } else {
        setError("An unexpected error occurred.");
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    await persistPharmacy();
  };

  const handleContinueLater = async () => {
    if (!hasDraftContent) {
      markOwnerPharmacySetupSkipped();
      navigate(onCompletePath);
      return;
    }
    if (!editing && !canCreatePharmacyDraft) {
      showSnackbar("Pharmacy draft was not saved. Finish the required basic details and ABN before saving.", "info");
      markOwnerPharmacySetupSkipped();
      navigate(onCompletePath);
      return;
    }
    markOwnerPharmacySetupSkipped();
    await persistPharmacy({ redirectAfterSave: true });
  };

  const handleNextTab = () => {
    setTabIndex((prev) => Math.min(prev + 1, lastTabIndex));
  };

  const handlePreviousTab = () => {
    setTabIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleEditPharmacyDto = (dto: OwnerPharmacyDTO) => {
    const target = pharmacies.find((p) => p.id === dto.id);
    if (target) {
      openDialog(target);
    }
  };

  const handleToggleAutoPublishWorkerRequests = useCallback(
    async (nextValue: boolean) => {
      if (!activePharmacy) return;
      setAutoPublishSaving(true);
      setAutoPublishError("");
      try {
        const res = await updatePharmacy(activePharmacy.id, {
          auto_publish_worker_requests: nextValue,
        } as any);
        const saved = normalizePharmacy(res);
        setPharmacies((prev) =>
          scopePharmacies(prev.map((item) => (item.id === saved.id ? saved : item)))
        );
        showSnackbar(
          nextValue
            ? "Automatic staff request publishing enabled."
            : "Automatic staff request publishing disabled.",
          "success"
        );
      } catch (err: any) {
        setAutoPublishError(
          err?.response?.data?.detail || err?.message || "Failed to update publishing preference."
        );
      } finally {
        setAutoPublishSaving(false);
      }
    },
    [activePharmacy, scopePharmacies]
  );

  const handleRequestDeletePharmacy = (id: string) => {
    const target = pharmacies.find((p) => p.id === id);
    if (target) {
      setPendingDeletePharmacy(target);
    }
  };

  const handleCancelDeletePharmacy = () => {
    if (isDeletingPharmacy) return;
    setPendingDeletePharmacy(null);
    clearActionParam();
  };

  const confirmDeletePharmacy = async () => {
    if (!pendingDeletePharmacy) return;
    const id = pendingDeletePharmacy.id;
    setIsDeletingPharmacy(true);
    try {
      await deletePharmacy(id);
      setPharmacies((prev) => prev.filter((p) => p.id !== id));
      setMembershipsByPharmacy((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (activePharmacyId === id) {
        goBackToList();
      }
      showSnackbar("Deleted successfully!", "success");
    } catch (err) {
      console.error(err);
      showSnackbar("Failed to delete pharmacy.", "error");
    } finally {
      setIsDeletingPharmacy(false);
      setPendingDeletePharmacy(null);
      clearActionParam();
    }
  };

  const showSkeleton = !initialLoadComplete && isFetching;
  const activeMembershipsLoading = activePharmacy ? membershipsLoading[activePharmacy.id] ?? false : false;

  if (needsOnboarding) {
    return (
      <Box p={4} textAlign="center">
        <Alert severity="warning">
          Please complete <strong>Owner Onboarding</strong> first.
        </Alert>
        <Button variant="contained" sx={{ mt: 2 }} onClick={() => navigate(onNeedsOnboardingPath)}>
          Go to Onboarding
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, width: "100%", color: DASHBOARD_INK, fontFamily: DASHBOARD_FONT_FAMILY }}>
      <GlobalStyles styles={{ ".pac-container": { zIndex: 1400 } }} />
      {!standalone && (
        <TopBar
          breadcrumb={
            view === "detail" && activePharmacy
              ? ["My Pharmacies", activePharmacy.name]
              : ["My Pharmacies"]
          }
          onBack={view === "detail" ? goBackToList : undefined}
        />
      )}

      {view === "list" && isOrganizationUser && !standalone && (
        <Box
          sx={{
            ...pharmacyPageFrameSx,
            pt: 3,
          }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            alignItems={{ xs: "flex-start", sm: "center" }}
          >
            <Box>
              <Typography sx={{ fontSize: { xs: 28, md: 34 }, lineHeight: 1.08, fontWeight: 950, color: DASHBOARD_INK }}>
                Claim Pharmacies & Requests
              </Typography>
              <Typography sx={{ mt: 1, color: DASHBOARD_MUTED, fontSize: { xs: 15, md: 16 }, fontWeight: 800, lineHeight: 1.45 }}>
                Link new pharmacies to your organization and track pending claim activity.
              </Typography>
            </Box>
            <Button
              variant="contained"
              sx={{
                ml: { sm: "auto" },
                minHeight: 46,
                px: 2.25,
                borderRadius: "12px",
                fontWeight: 900,
                boxShadow: "0 12px 28px rgba(20, 62, 234, 0.18)",
              }}
              onClick={() => setClaimAccordionOpen((prev) => !prev)}
            >
              {claimAccordionOpen ? "Hide Claim Form" : "Claim Pharmacy"}
            </Button>
          </Stack>

          <Accordion
            expanded={claimAccordionOpen}
            onChange={(_, expanded) => setClaimAccordionOpen(expanded)}
            sx={{
              mt: 2,
              borderRadius: "20px !important",
              border: `1px solid ${LIGHT_BORDER}`,
              boxShadow: "0 8px 24px rgba(6, 18, 58, 0.06)",
              overflow: "hidden",
              "&:before": { display: "none" },
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={{ xs: 1, sm: 3 }}
                alignItems={{ xs: "flex-start", sm: "center" }}
                justifyContent="space-between"
                sx={{ width: "100%" }}
              >
                <Typography sx={{ color: DASHBOARD_INK, fontWeight: 900, fontSize: 18 }}>Submit a claim by email</Typography>
                <Stack direction="row" spacing={3}>
                  <Typography variant="body2" sx={{ color: DASHBOARD_MUTED, fontWeight: 800 }}>
                    Pending: <strong>{claimCounts.pending}</strong>
                  </Typography>
                  <Typography variant="body2" sx={{ color: DASHBOARD_MUTED, fontWeight: 800 }}>
                    Accepted: <strong>{claimCounts.accepted}</strong>
                  </Typography>
                </Stack>
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              {claimError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {claimError}
                </Alert>
              )}
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                alignItems={{ xs: "stretch", sm: "flex-end" }}
              >
                <TextField
                  fullWidth
                  label="Pharmacy Email"
                  value={claimEmail}
                  onChange={(event) => setClaimEmail(event.target.value)}
                />
                <Button
                  variant="contained"
                  onClick={handleSubmitClaim}
                  disabled={claimSubmitting}
                  sx={{ minWidth: 160, minHeight: 48, borderRadius: "12px", fontWeight: 900, boxShadow: "0 12px 28px rgba(20, 62, 234, 0.18)" }}
                >
                  {claimSubmitting ? <CircularProgress size={20} color="inherit" /> : "Submit Claim"}
                </Button>
              </Stack>

              {claimsLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
                  <CircularProgress size={28} />
                </Box>
              ) : claimItems.length === 0 ? (
                <Typography sx={{ mt: 3 }} color="text.secondary">
                  No claim activity yet.
                </Typography>
              ) : (
                <Table sx={{ mt: 3 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Pharmacy</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Requested</TableCell>
                      <TableCell>Responded</TableCell>
                      <TableCell>Response Note</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {claimItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Typography fontWeight={600}>{item.pharmacy?.name ?? "Untitled Pharmacy"}</Typography>
                          {item.pharmacy?.email && (
                            <Typography variant="body2" color="text.secondary">
                              {item.pharmacy.email}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={item.status_display ?? item.status}
                            color={CLAIM_STATUS_COLORS[item.status]}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{formatDateTime(item.created_at)}</TableCell>
                        <TableCell>{formatDateTime(item.responded_at)}</TableCell>
                        <TableCell sx={{ maxWidth: 280 }}>
                          {item.response_message ? (
                            <Typography variant="body2">{item.response_message}</Typography>
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              {item.status === "PENDING" ? "Awaiting owner decision" : "-"}
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </AccordionDetails>
          </Accordion>
        </Box>
      )}

      {view === "list" && !isOrganizationUser && !standalone && claimedPharmacyCount > 0 && (
        <Box
          sx={{
            ...pharmacyPageFrameSx,
            pt: 3,
          }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            alignItems={{ xs: "flex-start", sm: "center" }}
          >
            <Box>
              <Typography sx={{ fontSize: { xs: 28, md: 34 }, lineHeight: 1.08, fontWeight: 950, color: DASHBOARD_INK }}>
                Claim Requests
              </Typography>
              <Typography sx={{ mt: 1, color: DASHBOARD_MUTED, fontSize: { xs: 15, md: 16 }, fontWeight: 800, lineHeight: 1.45 }}>
                Organizations can request access to manage your pharmacies. Review and respond to requests below.
              </Typography>
            </Box>
            <Button
              variant="contained"
              sx={{
                ml: { sm: "auto" },
                width: { xs: "100%", sm: "auto" },
                minHeight: 46,
                px: 2.25,
                borderRadius: "12px",
                fontWeight: 900,
                boxShadow: "0 12px 28px rgba(20, 62, 234, 0.18)",
              }}
              onClick={() => setOwnerAccordionOpen((prev) => !prev)}
            >
              {ownerAccordionOpen ? "Hide Requests" : "View Requests"}
            </Button>
          </Stack>

          <Accordion
            expanded={ownerAccordionOpen}
            onChange={(_, expanded) => setOwnerAccordionOpen(expanded)}
            sx={{
              mt: 2,
              borderRadius: "20px !important",
              border: `1px solid ${LIGHT_BORDER}`,
              boxShadow: "0 8px 24px rgba(6, 18, 58, 0.06)",
              overflow: "hidden",
              "&:before": { display: "none" },
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={{ xs: 1, sm: 3 }}
                alignItems={{ xs: "flex-start", sm: "center" }}
                justifyContent="space-between"
                sx={{ width: "100%" }}
              >
                <Typography sx={{ color: DASHBOARD_INK, fontWeight: 900, fontSize: 18 }}>Organization claim requests</Typography>
                <Stack direction="row" spacing={3}>
                  <Typography variant="body2" sx={{ color: DASHBOARD_MUTED, fontWeight: 800 }}>
                    Pending: <strong>{ownerClaimCounts.pending}</strong>
                  </Typography>
                  <Typography variant="body2" sx={{ color: DASHBOARD_MUTED, fontWeight: 800 }}>
                    Accepted: <strong>{ownerClaimCounts.accepted}</strong>
                  </Typography>
                </Stack>
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              {ownerClaimError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {ownerClaimError}
                </Alert>
              )}

              {ownerClaimsLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                  <CircularProgress size={32} />
                </Box>
              ) : ownerClaims.length === 0 ? (
                <Alert severity="info">No claim requests at the moment.</Alert>
              ) : (
                <Stack spacing={2.5}>
                  {ownerClaims.map((claim) => (
                    <Paper
                      key={claim.id}
                      variant="outlined"
                      sx={{
                        borderRadius: { xs: "16px", md: "20px" },
                        p: { xs: 2, md: 2.5 },
                        borderColor: "#E5ECF7",
                        boxShadow: "0 8px 24px rgba(6, 18, 58, 0.06)",
                        transition: "transform 0.2s ease, box-shadow 0.2s ease",
                        "&:hover": {
                          transform: { xs: "none", md: "translateY(-3px)" },
                          boxShadow: "0 18px 42px rgba(6, 18, 58, 0.12)",
                        },
                      }}
                    >
                      <Stack spacing={1.5}>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "flex-start", sm: "center" }} justifyContent="space-between">
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ color: DASHBOARD_INK, fontWeight: 950, fontSize: { xs: 20, md: 22 }, lineHeight: 1.15 }}>
                              {claim.pharmacy?.name ?? "Untitled Pharmacy"}
                            </Typography>
                            {claim.pharmacy?.email && (
                              <Typography variant="body2" sx={{ color: DASHBOARD_MUTED, fontWeight: 700 }}>
                                {claim.pharmacy.email}
                              </Typography>
                            )}
                          </Box>
                          <Chip
                            label={claim.status_display ?? claim.status}
                            color={CLAIM_STATUS_COLORS[claim.status]}
                            variant={claim.status === "PENDING" ? "outlined" : "filled"}
                            size="small"
                          />
                        </Stack>

                        <Typography variant="body2" sx={{ color: DASHBOARD_MUTED, fontWeight: 700 }}>
                          Requested by <strong>{claim.organization?.name ?? "Unknown organization"}</strong>
                          {" on "}
                          {formatDateTime(claim.created_at)}
                        </Typography>

                        {claim.message && (
                          <Box sx={{ p: 2, borderRadius: 2, bgcolor: "grey.100", fontStyle: "italic" }}>
                            "{claim.message}"
                          </Box>
                        )}

                        {claim.status !== "PENDING" && claim.response_message && (
                          <Typography variant="body2" color="text.secondary">
                            Your response: {claim.response_message}
                          </Typography>
                        )}

                        {claim.status === "PENDING" && (
                          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                            <Button
                              variant="contained"
                              color="success"
                              disabled={!canRespondToClaims}
                              sx={{ minHeight: 42, borderRadius: "12px", fontWeight: 900 }}
                              onClick={() => canRespondToClaims && openOwnerClaimDialog(claim, "ACCEPTED")}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="outlined"
                              color="error"
                              disabled={!canRespondToClaims}
                              sx={{ minHeight: 42, borderRadius: "12px", fontWeight: 900 }}
                              onClick={() => canRespondToClaims && openOwnerClaimDialog(claim, "REJECTED")}
                            >
                              Reject
                            </Button>
                            {!canRespondToClaims && (
                              <Typography variant="body2" color="text.secondary">
                                Only owner-level administrators can respond to requests.
                              </Typography>
                            )}
                          </Stack>
                        )}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
            </AccordionDetails>
          </Accordion>
        </Box>
      )}

      {view === "list" && !standalone && (
        <Box
          sx={{
            ...pharmacyPageFrameSx,
            pt: 3,
            pb: 1,
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            justifyContent: "space-between",
            alignItems: { xs: "stretch", sm: "center" },
            gap: 2,
          }}
        >
          <Box>
            <Typography sx={{ fontSize: { xs: 28, md: 34 }, lineHeight: 1.08, fontWeight: 950, color: DASHBOARD_INK }}>
              {standalone ? "Set Up Your Pharmacy" : "My Pharmacies"}
            </Typography>
            <Typography sx={{ mt: 1, color: DASHBOARD_MUTED, fontSize: { xs: 15, md: 16 }, fontWeight: 800, lineHeight: 1.45 }}>
              {standalone
                ? "Add your first pharmacy now. You can keep building the rest of your workspace after this step."
                : "Manage your locations, staff and admins"}
            </Typography>
          </Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ width: { xs: "100%", sm: "auto" } }}>
            {standalone && pharmacies.length > 0 && (
              <Button variant="outlined" onClick={handleContinueLater} disabled={isSaving}>
                Save & Continue Later
              </Button>
            )}
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => openDialog()}
              sx={{
                width: { xs: "100%", sm: "auto" },
                minHeight: 48,
                px: 2.5,
                borderRadius: "12px",
                fontWeight: 900,
                boxShadow: "0 12px 28px rgba(20, 62, 234, 0.18)",
              }}
            >
              Add Pharmacy
            </Button>
          </Stack>
        </Box>
      )}

      {standalone && view === "list" ? (
        <Box sx={{ width: "100%", maxWidth: 1320, mx: "auto", px: { xs: 2, sm: 3, md: 4 }, py: { xs: 2, md: 4 } }}>
          <Box
            sx={{
              borderRadius: { xs: 3, md: 4 },
              overflow: "hidden",
              mb: 2,
              backgroundImage: HERO_GRADIENT,
              color: "#FFFFFF",
              minHeight: { xs: 250, md: 300 },
              position: "relative",
              boxShadow: "0 22px 54px rgba(6, 26, 61, 0.12)",
              px: { xs: 2, md: 4 },
              py: { xs: 2.5, md: 4 },
            }}
          >
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                backgroundImage: [
                  `radial-gradient(circle at 64% 98%, ${alpha("#8FE8FF", 0.14)} 0 110px, transparent 111px)`,
                  `radial-gradient(circle at 72% 96%, ${alpha("#6FE7DD", 0.16)} 0 190px, transparent 191px)`,
                  `radial-gradient(circle at 66% 96%, ${alpha("#FFFFFF", 0.12)} 0 275px, transparent 276px)`,
                  `linear-gradient(100deg, transparent 0 78%, ${alpha("#D20DAE", 0.75)} 78% 100%)`,
                ].join(", "),
                pointerEvents: "none",
              }}
            />
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={{ xs: 2.5, md: 4 }}
              alignItems={{ xs: "stretch", md: "center" }}
              justifyContent="space-between"
              sx={{ position: "relative", zIndex: 1, minHeight: "100%" }}
            >
              <Box sx={{ maxWidth: 760 }}>
                <Chip
                  label="Pharmacy setup"
                  size="small"
                  sx={{
                    mb: 1.5,
                    bgcolor: alpha("#FFFFFF", 0.14),
                    color: "#FFFFFF",
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: ".08em",
                    border: `1px solid ${alpha("#FFFFFF", 0.24)}`,
                  }}
                />
                <Typography
                  variant="h3"
                  sx={{
                    fontSize: { xs: 34, md: 56 },
                    fontWeight: 900,
                    lineHeight: 1.04,
                    color: "#FFFFFF",
                    overflowWrap: "anywhere",
                  }}
                >
                  Add your pharmacy
                </Typography>
                <Typography
                  variant="body1"
                  sx={{
                    mt: 1.5,
                    maxWidth: 680,
                    fontSize: { xs: 15, md: 20 },
                    fontWeight: 700,
                    lineHeight: 1.45,
                    color: alpha("#FFFFFF", 0.96),
                  }}
                >
                  Create the first pharmacy in your workspace. You can add more locations, documents and operating details here.
                </Typography>
                {/* <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ mt: { xs: 2, md: 3 } }}>
                  <Chip
                    label="Basic details first"
                    sx={{
                      bgcolor: "#FFFFFF",
                      color: "#063BDA",
                      fontWeight: 900,
                      "& .MuiChip-label": { px: 1.75 },
                    }}
                  />
                  {normalizedTargetPharmacyCount > 1 ? (
                    <Chip
                      label={`${normalizedTargetPharmacyCount} pharmacies planned`}
                      sx={{
                        bgcolor: alpha("#FFFFFF", 0.14),
                        color: "#FFFFFF",
                        fontWeight: 800,
                        border: `1px solid ${alpha("#FFFFFF", 0.24)}`,
                      }}
                    />
                  ) : (
                    <Chip
                      label="Location, docs, staffing and hours"
                      sx={{
                        bgcolor: alpha("#FFFFFF", 0.14),
                        color: "#FFFFFF",
                        fontWeight: 800,
                        border: `1px solid ${alpha("#FFFFFF", 0.24)}`,
                      }}
                    />
                  )}
                </Stack> */}
              </Box>
              {/* <Box
                sx={{
                  alignSelf: { xs: "flex-start", md: "center" },
                  minWidth: { xs: "100%", md: 280 },
                  maxWidth: 340,
                  p: { xs: 1.75, md: 2.25 },
                  borderRadius: 3,
                  bgcolor: alpha("#FFFFFF", 0.12),
                  border: `1px solid ${alpha("#FFFFFF", 0.24)}`,
                  boxShadow: `inset 0 1px 0 ${alpha("#FFFFFF", 0.18)}`,
                  backdropFilter: "blur(8px)",
                }}
              >
                <Typography variant="body2" sx={{ textTransform: "uppercase", letterSpacing: ".08em", opacity: 0.72, fontSize: { xs: 12, md: 14 } }}>
                  Setup flow
                </Typography>
                <Typography sx={{ mt: 0.75, fontSize: { xs: 30, md: 46 }, fontWeight: 950, lineHeight: 1 }}>
                  7
                </Typography>
                <Typography sx={{ mt: 0.5, fontWeight: 900, fontSize: { xs: 15, md: 18 } }}>
                  sections to complete
                </Typography>
                <Typography sx={{ mt: 1.25, color: alpha("#FFFFFF", 0.86), fontWeight: 700, lineHeight: 1.45 }}>
                  Basic, regulatory, docs, employment, hours, rate and about.
                </Typography>
              </Box> */}
            </Stack>
          </Box>

          <Paper
            variant="outlined"
            sx={{
              borderRadius: 4,
              borderColor: LIGHT_BORDER,
              bgcolor: LIGHT_SURFACE,
              boxShadow: "0 18px 42px rgba(99, 102, 241, 0.08)",
              overflow: "hidden",
            }}
          >
            <Box sx={{ px: { xs: 2, md: 4 }, pt: { xs: 2.5, md: 3.5 }, pb: 1.5 }}>
              <Stack
                direction="column"
                spacing={1.75}
                justifyContent="center"
                alignItems="center"
                sx={{ textAlign: "center" }}
              >
                <Box sx={{ maxWidth: 740 }}>
                  <Typography variant="h5" fontWeight={900} sx={{ color: "#111827", letterSpacing: "-0.02em" }}>
                    Pharmacy details
                  </Typography>
                  <Typography variant="body1" sx={{ color: "#64748B", mt: 0.75, fontWeight: 700 }}>
                    Enter location, regulatory, staffing and hours information for this pharmacy.
                  </Typography>
                </Box>
                {pharmacies.length > 0 && (
                  <Button variant="outlined" onClick={handleContinueLater} disabled={isSaving} sx={{ borderColor: LIGHT_BORDER, color: "#111827" }}>
                    Save & Continue Later
                  </Button>
                )}
              </Stack>
            </Box>
            <Box sx={{ px: { xs: 1.5, md: 3 }, pb: 1, ...pharmacyFormLightSx }}>
              {renderPharmacyFormSections()}
            </Box>
            <Stack direction="row" justifyContent="space-between" sx={{ px: { xs: 2, md: 4 }, pb: { xs: 2.5, md: 3.5 } }}>
              {editing ? (
                <>
                  <Button variant="outlined" onClick={handleSave} disabled={isSaving} sx={{ borderColor: LIGHT_BORDER, color: "#111827" }}>
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                  <Stack direction="row" spacing={1.5}>
                    <Button variant="outlined" onClick={handlePreviousTab} disabled={isSaving || tabIndex === 0} sx={{ borderColor: LIGHT_BORDER, color: "#111827" }}>
                      Back
                    </Button>
                    <Button variant="contained" onClick={handleNextTab} disabled={isSaving || tabIndex === lastTabIndex} sx={{ bgcolor: "#7C8CF8", color: "#FFFFFF", px: 3, boxShadow: "none", "&:hover": { bgcolor: "#6978F5", boxShadow: "none" } }}>
                      Next
                    </Button>
                  </Stack>
                </>
              ) : (
                <>
                  <Button variant="outlined" onClick={tabIndex > 0 ? handlePreviousTab : handleContinueLater} sx={{ borderColor: LIGHT_BORDER, color: "#111827" }} disabled={isSaving}>
                    {tabIndex > 0 ? "Back" : "Save & Continue Later"}
                  </Button>
                  <Button
                    variant="contained"
                    onClick={tabIndex === lastTabIndex ? handleSave : handleNextTab}
                    disabled={isSaving}
                    sx={{ bgcolor: "#7C8CF8", color: "#FFFFFF", px: 3, boxShadow: "none", "&:hover": { bgcolor: "#6978F5", boxShadow: "none" } }}
                  >
                    {tabIndex === lastTabIndex ? (isSaving ? "Saving..." : "Create Pharmacy") : "Next"}
                  </Button>
                </>
              )}
            </Stack>
          </Paper>
        </Box>
      ) : view === "list" && showSkeleton ? (
        <Box sx={{ ...pharmacyPageFrameSx, pb: 4 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 }}>
            {Array.from({ length: 3 }).map((_, index) => (
              <Box
                key={index}
                sx={{
                  borderRadius: { xs: "16px", md: "20px" },
                  border: "1px solid",
                  borderColor: "#E5ECF7",
                  p: { xs: 2, md: 2.5 },
                  bgcolor: "#FFFFFF",
                  boxShadow: "0 8px 24px rgba(6, 18, 58, 0.06)",
                }}
              >
                <Box sx={{ display: "flex", gap: 2 }}>
                  <Skeleton variant="circular" width={40} height={40} />
                  <Box sx={{ flex: 1 }}>
                    <Skeleton variant="text" width="75%" />
                    <Skeleton variant="text" width="60%" />
                    <Skeleton variant="text" width="40%" />
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      ) : view === "list" ? (
        <OwnerPharmaciesPage
          pharmacies={ownerPharmacies}
          staffCounts={staffCounts}
          onOpenPharmacy={openPharmacy}
          onOpenAdmins={openAdmins}
          onEditPharmacy={handleEditPharmacyDto}
          onDeletePharmacy={handleRequestDeletePharmacy}
        />
      ) : activePharmacy ? (
        <OwnerPharmacyDetailPage
          pharmacy={toOwnerPharmacyDTO(activePharmacy)}
          staffMemberships={staffMemberships}
          locumMemberships={locumMemberships}
          adminAssignments={activeAdminAssignments}
          pendingAdminMemberships={pendingAdminMemberships}
          onMembershipsChanged={() => loadMembers(activePharmacy.id)}
          onEditPharmacy={handleEditPharmacyDto}
          membershipsLoading={activeMembershipsLoading}
          autoPublishWorkerRequests={Boolean(activePharmacy.auto_publish_worker_requests)}
          onToggleAutoPublishWorkerRequests={handleToggleAutoPublishWorkerRequests}
          autoPublishSaving={autoPublishSaving}
          autoPublishError={autoPublishError}
        />
      ) : (
        <Box sx={{ ...pharmacyPageFrameSx, pt: 3 }}>
          <Alert severity="info">Select a pharmacy to view its details.</Alert>
        </Box>
      )}

      {snackbarState && (
        <Snackbar
          open={snackbarOpen}
          autoHideDuration={4000}
          onClose={() => {
            setSnackbarOpen(false);
            setSnackbarState(null);
          }}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            severity={snackbarState.severity}
            onClose={() => {
              setSnackbarOpen(false);
              setSnackbarState(null);
            }}
            sx={{ width: "100%" }}
          >
            {snackbarState.message}
          </Alert>
        </Snackbar>
      )}

      <Dialog
        open={ownerDialog.open}
        onClose={closeOwnerDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {ownerDialog.action === "ACCEPTED" ? "Approve claim request" : "Reject claim request"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Organization: <strong>{ownerDialog.claim?.organization?.name ?? "Unknown organization"}</strong>
          </Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Pharmacy: <strong>{ownerDialog.claim?.pharmacy?.name ?? "Untitled pharmacy"}</strong>
          </Typography>
          <TextField
            label={ownerDialog.action === "ACCEPTED" ? "Optional note to the organization" : "Reason (optional)"}
            multiline
            minRows={3}
            fullWidth
            value={ownerDialog.note}
            onChange={(event) => setOwnerDialog((prev) => ({ ...prev, note: event.target.value }))}
            placeholder={ownerDialog.action === "ACCEPTED" ? "Add a short note (optional)." : "Explain why you are rejecting (optional)."}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeOwnerDialog} disabled={ownerResponding}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color={ownerDialog.action === "ACCEPTED" ? "success" : "error"}
            onClick={handleOwnerRespond}
            disabled={ownerResponding || !canRespondToClaims}
          >
            {ownerResponding ? <CircularProgress size={18} color="inherit" /> : ownerDialog.action === "ACCEPTED" ? "Approve" : "Reject"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(pendingDeletePharmacy)}
        onClose={handleCancelDeletePharmacy}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete Pharmacy</DialogTitle>
        <DialogContent>
          <Typography>
            {pendingDeletePharmacy
              ? `You are about to delete "${pendingDeletePharmacy.name}". This action can't be undone.`
              : "This action can't be undone."}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDeletePharmacy} disabled={isDeletingPharmacy}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={confirmDeletePharmacy}
            disabled={isDeletingPharmacy}
          >
            {isDeletingPharmacy ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={additionalPharmacyPromptOpen}
        onClose={() => setAdditionalPharmacyPromptOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Add another pharmacy?</DialogTitle>
        <DialogContent>
          <Typography>
            Do you want to add another pharmacy now, or go straight to your dashboard?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setAdditionalPharmacyPromptOpen(false);
              navigate(onCompletePath);
            }}
          >
            Go to Dashboard
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setAdditionalPharmacyPromptOpen(false);
              openDialog();
            }}
          >
            Add Another
          </Button>
        </DialogActions>
      </Dialog>

      {!standalone && (
      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        fullWidth
        maxWidth="xl"
        disableEnforceFocus
        PaperProps={{
          sx: {
            width: "min(1320px, calc(100vw - 32px))",
            maxWidth: "1320px",
            minHeight: "min(860px, calc(100vh - 48px))",
            borderRadius: 4,
            bgcolor: LIGHT_SURFACE,
            border: `1px solid ${LIGHT_BORDER}`,
            boxShadow: "0 18px 42px rgba(99, 102, 241, 0.08)",
            overflow: "hidden",
          },
        }}
      >
        <DialogTitle>{editing ? "Edit Pharmacy" : "Add Pharmacy"}</DialogTitle>
        <DialogContent
          sx={{
            minHeight: 640,
            px: { xs: 2, md: 3 },
            pb: 2,
            ...pharmacyFormLightSx,
          }}
        >
          {renderPharmacyFormSections()}
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, md: 3 }, pb: { xs: 2, md: 2.5 } }}>
          {editing ? (
            <Stack direction="row" justifyContent="space-between" sx={{ width: '100%' }}>
              <Button variant="outlined" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
              <Stack direction="row" spacing={1.5}>
                <Button onClick={handlePreviousTab} disabled={isSaving || tabIndex === 0}>
                  Back
                </Button>
                <Button variant="contained" onClick={handleNextTab} disabled={isSaving || tabIndex === lastTabIndex} sx={{ bgcolor: "#7C8CF8", color: "#FFFFFF", boxShadow: "none", "&:hover": { bgcolor: "#6978F5", boxShadow: "none" } }}>
                  Next
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Stack direction="row" justifyContent="space-between" sx={{ width: '100%' }}>
              <Button onClick={tabIndex > 0 ? handlePreviousTab : closeDialog} disabled={isSaving}>
                {tabIndex > 0 ? "Back" : "Cancel"}
              </Button>
              <Button variant="contained" onClick={tabIndex === lastTabIndex ? handleSave : handleNextTab} disabled={isSaving} sx={{ bgcolor: "#7C8CF8", color: "#FFFFFF", boxShadow: "none", "&:hover": { bgcolor: "#6978F5", boxShadow: "none" } }}>
                {tabIndex === lastTabIndex ? (isSaving ? "Saving..." : "Create Pharmacy") : "Next"}
              </Button>
            </Stack>
          )}
        </DialogActions>
      </Dialog>
      )}
    </Box>
  );
}
