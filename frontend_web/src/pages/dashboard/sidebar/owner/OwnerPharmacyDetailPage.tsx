import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Paper,
  Skeleton,
  Stack,
  Switch,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import {
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Inbox,
  Mail,
  Pencil,
  Plus,
  ShieldCheck,
  Star,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { MembershipDTO, PharmacyAdminDTO, PharmacyDTO } from "./types";
import StaffManager from "./StaffManager";
import LocumManager from "./LocumManager";
import PharmacyAdmins from "./PharmacyAdmins";
import { getPayrollConfiguration, updatePayrollConfiguration } from "../../../../features/workforce/api";
import PageHeader from "../../../../components/ui/PageHeader";
import SectionCard from "../../../../components/ui/SectionCard";
import IconTile, { type Tone } from "../../../../components/ui/IconTile";
import DashboardContentState from "../../../../components/dashboard/DashboardContentState";
import { Pill } from "../../../../components/ui/Pill";
import { roleLabel } from "./teamUi";

/* ---------- helpers ---------- */

type TabKey = "overview" | "staff" | "locums" | "admins" | "settings";
const TABS: TabKey[] = ["overview", "staff", "locums", "admins", "settings"];

const isPending = (m: MembershipDTO) =>
  String(m.status || "").toUpperCase() === "PENDING" || (m.is_active ?? m.isActive) === false;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Optional extras the pharmacy record carries (hours, ABN, rates). Every field is optional. */
export type PharmacyProfileExtras = Partial<{
  email: string | null;
  abn: string;
  abn_verified: boolean | null;
  abn_entity_name: string | null;
  default_rate_type: string | null;
  default_fixed_rate: string | null;
  [key: string]: unknown;
}>;

const DAYS: { key: string; label: string; fallback?: string }[] = [
  { key: "monday", label: "Mon", fallback: "weekdays" },
  { key: "tuesday", label: "Tue", fallback: "weekdays" },
  { key: "wednesday", label: "Wed", fallback: "weekdays" },
  { key: "thursday", label: "Thu", fallback: "weekdays" },
  { key: "friday", label: "Fri", fallback: "weekdays" },
  { key: "saturdays", label: "Sat" },
  { key: "sundays", label: "Sun" },
  { key: "public_holidays", label: "Public holidays" },
];
const fmtTime = (value: unknown) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ""));
  if (!match) return "";
  const h = Number(match[1]);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return match[2] === "00" ? `${hour} ${suffix}` : `${hour}:${match[2]} ${suffix}`;
};
const hoursFor = (p: PharmacyProfileExtras | undefined, day: (typeof DAYS)[number]) => {
  if (!p) return "";
  if (p[`${day.key}_closed`]) return "Closed";
  let start = fmtTime(p[`${day.key}_start`]);
  let end = fmtTime(p[`${day.key}_end`]);
  if ((!start || !end) && day.fallback) {
    start = fmtTime(p[`${day.fallback}_start`]);
    end = fmtTime(p[`${day.fallback}_end`]);
  }
  return start && end ? `${start} – ${end}` : "";
};
const RATE_LABELS: Record<string, string> = {
  FIXED: "Fixed rate",
  FLEXIBLE: "Flexible rate",
  PHARMACIST_PROVIDED: "Pharmacist sets the rate",
};

/* ---------- small parts ---------- */

function ActionRow({ icon, tone, title, detail, onClick, emphasis = false }: { icon: React.ReactNode; tone: Tone; title: string; detail?: string; onClick: () => void; emphasis?: boolean }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 1.5,
        px: 2.25,
        py: 1.25,
        textAlign: "left",
        borderTop: "1px solid var(--ct-border-color)",
        "&:hover": { bgcolor: "var(--ct-subtle-bg)" },
        "&.Mui-focusVisible": { outline: "2px solid var(--ct-accent-strong)", outlineOffset: -2 },
      }}
    >
      <IconTile icon={icon} tone={tone} size={36} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ color: emphasis ? "var(--ct-accent-strong)" : "var(--ct-text-primary)", fontWeight: 600, fontSize: 14.5 }}>{title}</Typography>
        {detail ? <Typography noWrap sx={{ color: "var(--ct-text-secondary)", fontSize: 13 }}>{detail}</Typography> : null}
      </Box>
      <ChevronRight size={18} color="var(--ct-text-secondary)" aria-hidden="true" />
    </ButtonBase>
  );
}

function StatButton({ icon, tone, label, value, detail, onClick }: { icon: React.ReactNode; tone: Tone; label: string; value: React.ReactNode; detail?: React.ReactNode; onClick: () => void }) {
  return (
    <ButtonBase
      onClick={onClick}
      aria-label={`${label}: open the ${label.toLowerCase()} tab`}
      sx={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        gap: 1.5,
        p: { xs: 1.5, sm: 2 },
        textAlign: "left",
        borderRadius: "14px",
        "& .ct-stat-icon, & .ct-stat-detail": { display: { xs: "none", sm: "block" } },
        border: "1px solid var(--ct-border-color)",
        "&:hover": { borderColor: "var(--ct-accent-strong)" },
        "&.Mui-focusVisible": { outline: "2px solid var(--ct-accent-strong)", outlineOffset: 2 },
      }}
    >
      <Box className="ct-stat-icon"><IconTile icon={icon} tone={tone} size={40} /></Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 13, lineHeight: 1.3 }}>{label}</Typography>
        <Typography sx={{ color: "var(--ct-text-primary)", fontFamily: "var(--ct-font-display)", fontWeight: 500, fontSize: 26, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
        {detail ? <Typography component="div" className="ct-stat-detail" sx={{ color: "var(--ct-text-secondary)", fontSize: 12.5, mt: 0.25 }}>{detail}</Typography> : null}
      </Box>
    </ButtonBase>
  );
}

function SettingRow({
  title,
  description,
  checked,
  busy,
  disabled,
  onChange,
  note,
  error,
  loading,
  onRetry,
}: {
  title: string;
  description: string;
  checked: boolean;
  busy?: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  note?: React.ReactNode;
  error?: string;
  loading?: boolean;
  onRetry?: () => void;
}) {
  const id = `setting-${title.replace(/\W+/g, "-").toLowerCase()}`;
  const unavailable = Boolean(onRetry && error);
  return (
    <Box sx={{ p: 2.25 }}>
      <Stack direction="row" spacing={2} alignItems="flex-start" justifyContent="space-between">
        <Box sx={{ minWidth: 0 }}>
          <Typography id={id} sx={{ color: "var(--ct-text-primary)", fontWeight: 600, fontSize: 15.5 }}>{title}</Typography>
          <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 14, lineHeight: 1.5, mt: 0.5, maxWidth: 640 }}>{description}</Typography>
        </Box>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0, minHeight: 40 }}>
          {loading ? (
            <Skeleton variant="rounded" width={86} height={28} aria-label={`Loading ${title}`} />
          ) : unavailable ? null : (
            <>
              {busy ? <CircularProgress size={18} aria-label="Saving" /> : null}
              <Switch checked={checked} disabled={disabled || busy} onChange={(_, next) => onChange(next)} inputProps={{ "aria-labelledby": id }} />
              <Typography sx={{ color: checked ? "var(--ct-status-green-fg)" : "var(--ct-text-secondary)", fontWeight: 600, fontSize: 14, minWidth: 26 }}>
                {checked ? "On" : "Off"}
              </Typography>
            </>
          )}
        </Stack>
      </Stack>
      {note && !error && !loading ? (
        <Box sx={{ mt: 1.5, p: 1.5, borderRadius: "12px", bgcolor: "var(--ct-subtle-bg)", color: "var(--ct-text-secondary)", fontSize: 13.5, lineHeight: 1.55 }}>{note}</Box>
      ) : null}
      {error ? (
        <Alert severity="error" sx={{ mt: 1.5 }} action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>Try again</Button> : undefined}>
          {error}
        </Alert>
      ) : null}
    </Box>
  );
}

function TabLabel({ label, count, attention }: { label: string; count?: number; attention?: number }) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <span>{label}</span>
      {typeof count === "number" ? (
        <Box component="span" sx={{ px: 0.75, minWidth: 22, borderRadius: "999px", bgcolor: "var(--ct-subtle-bg)", color: "var(--ct-text-secondary)", fontSize: 12, fontWeight: 600, lineHeight: "20px" }}>
          {count}
        </Box>
      ) : null}
      {attention ? (
        <Badge
          badgeContent={attention}
          sx={{ "& .MuiBadge-badge": { position: "static", transform: "none", bgcolor: "#C000B4", color: "#FFFFFF", fontWeight: 600 } }}
          aria-label={`${attention} waiting for review`}
        />
      ) : null}
    </Stack>
  );
}

/* ---------- page ---------- */

interface OwnerPharmacyDetailPageProps {
  pharmacy: PharmacyDTO;
  /** The full pharmacy record when the caller has it: opening hours, ABN, default rate. */
  profile?: PharmacyProfileExtras;
  staffMemberships: MembershipDTO[];
  locumMemberships: MembershipDTO[];
  adminAssignments: PharmacyAdminDTO[];
  pendingAdminMemberships?: MembershipDTO[];
  onMembershipsChanged: () => void;
  onEditPharmacy?: (pharmacy: PharmacyDTO) => void;
  membershipsLoading?: boolean;
  /** Set when the team lists failed to load; the page offers Try again (onMembershipsChanged). */
  membershipsError?: string;
  autoPublishWorkerRequests?: boolean;
  onToggleAutoPublishWorkerRequests?: (nextValue: boolean) => Promise<void> | void;
  autoPublishSaving?: boolean;
  autoPublishError?: string;
}

export default function OwnerPharmacyDetailPage({
  pharmacy,
  profile,
  staffMemberships,
  locumMemberships,
  adminAssignments,
  pendingAdminMemberships = [],
  onMembershipsChanged,
  onEditPharmacy,
  membershipsLoading = false,
  membershipsError = "",
  autoPublishWorkerRequests = false,
  onToggleAutoPublishWorkerRequests,
  autoPublishSaving = false,
  autoPublishError = "",
}: OwnerPharmacyDetailPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Persona base (/dashboard/owner, /dashboard/organization, /dashboard/admin/12) so links stay in the current workspace.
  const basePath = useMemo(() => {
    const match = /^\/dashboard\/(admin\/\d+|[a-z-]+)/.exec(location.pathname);
    return match ? `/dashboard/${match[1]}` : "/dashboard/owner";
  }, [location.pathname]);
  const go = useCallback((suffix: string) => navigate(`${basePath}/${suffix}`), [navigate, basePath]);
  const chatPathFor = useCallback((userId: number) => `${basePath}/chat?startDmWithUser=${userId}`, [basePath]);

  const rawTab = searchParams.get("tab") as TabKey | null;
  const tab: TabKey = rawTab && TABS.includes(rawTab) ? rawTab : "overview";
  const setTab = useCallback(
    (next: TabKey) => {
      const params = new URLSearchParams(searchParams);
      if (next === "overview") params.delete("tab");
      else params.set("tab", next);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const [staffApps, setStaffApps] = useState(0);
  const [locumApps, setLocumApps] = useState(0);
  const [inviteStaff, setInviteStaff] = useState(0);
  const [inviteLocum, setInviteLocum] = useState(0);
  const [inviteAdmin, setInviteAdmin] = useState(0);

  /* payroll setting */
  const [payrollEnabled, setPayrollEnabled] = useState<boolean>(
    Boolean((pharmacy as any).use_chemisttasker_payroll ?? (pharmacy as any).useChemisttaskerPayroll),
  );
  const [payrollReady, setPayrollReady] = useState(false);
  const [payrollLoadError, setPayrollLoadError] = useState("");
  const [payrollSaving, setPayrollSaving] = useState(false);
  const [payrollSaveError, setPayrollSaveError] = useState("");
  const [payrollAttempt, setPayrollAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPayrollReady(false);
    setPayrollLoadError("");
    getPayrollConfiguration(Number(pharmacy.id))
      .then((config) => {
        if (cancelled) return;
        setPayrollEnabled(Boolean(config.use_chemisttasker_payroll));
        setPayrollReady(true);
      })
      .catch(() => {
        if (!cancelled) setPayrollLoadError("The payroll setting didn't load, so it can't be changed right now.");
      });
    return () => {
      cancelled = true;
    };
  }, [pharmacy.id, payrollAttempt]);

  const handlePayrollToggle = async (enabled: boolean) => {
    setPayrollSaving(true);
    setPayrollSaveError("");
    try {
      const config = await updatePayrollConfiguration(Number(pharmacy.id), enabled);
      setPayrollEnabled(Boolean(config.use_chemisttasker_payroll));
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      setPayrollSaveError(typeof detail === "string" && detail ? detail : "The payroll setting wasn't saved. Try again.");
    } finally {
      setPayrollSaving(false);
    }
  };

  const editPharmacy = useCallback(() => {
    if (onEditPharmacy) onEditPharmacy(pharmacy);
    else go("manage-pharmacies/my-pharmacies");
  }, [onEditPharmacy, pharmacy, go]);

  /* counts */
  const counts = useMemo(() => {
    const staffActive = staffMemberships.filter((m) => !isPending(m));
    const locumActive = locumMemberships.filter((m) => !isPending(m));
    const byRole: Record<string, number> = {};
    const byType: Record<string, number> = {};
    staffActive.forEach((m) => {
      const r = String(m.role || "").toUpperCase();
      const t = String(m.employment_type ?? m.employmentType ?? "").toUpperCase();
      if (r) byRole[r] = (byRole[r] || 0) + 1;
      if (t) byType[t] = (byType[t] || 0) + 1;
    });
    return {
      staff: staffActive.length,
      staffPending: staffMemberships.length - staffActive.length,
      locums: locumActive.length,
      locumPending: locumMemberships.length - locumActive.length,
      admins: adminAssignments.filter((a) => a.is_active !== false && a.admin_level !== "OWNER").length,
      adminPending: pendingAdminMemberships.length,
      byRole,
      byType,
    };
  }, [staffMemberships, locumMemberships, adminAssignments, pendingAdminMemberships]);

  const address = [pharmacy.street_address, pharmacy.suburb, pharmacy.state, pharmacy.postcode].filter(Boolean).join(", ");
  const hasAnyMembers = staffMemberships.length + locumMemberships.length + adminAssignments.length > 0;
  const firstLoad = membershipsLoading && !hasAnyMembers;
  const listsUnavailable = Boolean(membershipsError) && !membershipsLoading;
  const invitesWaiting = counts.staffPending + counts.locumPending + counts.adminPending;
  const countsUnknown = firstLoad || (listsUnavailable && !hasAnyMembers);
  const statValue = (n: number) => (firstLoad ? <Skeleton width={36} /> : countsUnknown ? "—" : n);
  const statDetail = (pending: number, fallback: string) => (countsUnknown && !firstLoad ? "Not loaded" : pending ? `${pending} invited` : fallback);

  /* attention items */
  const attention: { key: string; icon: React.ReactNode; tone: Tone; text: string; action: string; onClick: () => void }[] = [];
  if (staffApps) attention.push({ key: "staff-apps", icon: <Inbox />, tone: "magenta", text: `${plural(staffApps, "staff application")} to review`, action: "Review", onClick: () => setTab("staff") });
  if (locumApps) attention.push({ key: "locum-apps", icon: <Inbox />, tone: "magenta", text: `${plural(locumApps, "favourite locum application")} to review`, action: "Review", onClick: () => setTab("locums") });
  if (payrollLoadError) attention.push({ key: "payroll", icon: <Wallet />, tone: "magenta", text: "The payroll setting didn't load", action: "Open settings", onClick: () => setTab("settings") });
  if (!firstLoad && !listsUnavailable && counts.staff === 0) attention.push({ key: "no-staff", icon: <UserPlus />, tone: "violet", text: "Invite your team so you can roster them and post internal shifts", action: "Invite staff", onClick: () => { setTab("staff"); setInviteStaff((n) => n + 1); } });
  if (!firstLoad && !listsUnavailable && counts.locums === 0) attention.push({ key: "no-locums", icon: <Star />, tone: "violet", text: "Add favourite locums so trusted people see your shifts first", action: "Add favourite", onClick: () => { setTab("locums"); setInviteLocum((n) => n + 1); } });
  if (invitesWaiting) attention.push({ key: "invites", icon: <Clock3 />, tone: "cyan", text: `${plural(invitesWaiting, "invitation")} waiting for a reply`, action: "View", onClick: () => setTab(counts.staffPending ? "staff" : counts.locumPending ? "locums" : "admins") });

  const roleSummary = Object.entries(counts.byRole)
    .sort((a, b) => b[1] - a[1])
    .map(([role, n]) => `${n} ${roleLabel(role).toLowerCase()}${n === 1 ? "" : "s"}`)
    .join(" · ");
  const abnVerified = Boolean(profile?.abn_verified);
  const rateLabel = profile?.default_rate_type ? RATE_LABELS[String(profile.default_rate_type)] ?? "" : "";
  const fixedRate = profile?.default_rate_type === "FIXED" && profile?.default_fixed_rate ? `$${profile.default_fixed_rate}/hr` : "";
  const weekHours = DAYS.map((d) => ({ ...d, hours: hoursFor(profile, d) })).filter((d) => d.hours);

  const teamPanels = (
    <>
      <Box hidden={tab !== "staff"} role="tabpanel" id="pharmacy-tab-staff" aria-labelledby="pharmacy-tab-btn-staff">
        <StaffManager
          pharmacyId={pharmacy.id}
          memberships={staffMemberships}
          onMembershipsChanged={onMembershipsChanged}
          pharmacyName={pharmacy.name}
          loading={membershipsLoading}
          inviteRequest={inviteStaff}
          onApplicationsCount={setStaffApps}
          chatPathFor={chatPathFor}
        />
      </Box>
      <Box hidden={tab !== "locums"} role="tabpanel" id="pharmacy-tab-locums" aria-labelledby="pharmacy-tab-btn-locums">
        <LocumManager
          pharmacyId={pharmacy.id}
          memberships={locumMemberships}
          onMembershipsChanged={onMembershipsChanged}
          pharmacyName={pharmacy.name}
          loading={membershipsLoading}
          inviteRequest={inviteLocum}
          onApplicationsCount={setLocumApps}
          chatPathFor={chatPathFor}
        />
      </Box>
      <Box hidden={tab !== "admins"} role="tabpanel" id="pharmacy-tab-admins" aria-labelledby="pharmacy-tab-btn-admins">
        <PharmacyAdmins
          pharmacyId={pharmacy.id}
          admins={adminAssignments}
          pendingAdminMemberships={pendingAdminMemberships}
          onAdminsChanged={onMembershipsChanged}
          loading={membershipsLoading}
          inviteRequest={inviteAdmin}
          chatPathFor={chatPathFor}
        />
      </Box>
    </>
  );

  return (
    <Box data-ct-tokens="" sx={{ width: "100%", maxWidth: 1240, mx: "auto", px: { xs: 0, sm: 1.5, md: 2 }, py: { xs: 2, md: 3 } }}>
      <PageHeader
        title={pharmacy.name}
        subtitle={address || undefined}
        actions={
          <>
            <Button variant="outlined" startIcon={<Pencil size={16} />} onClick={editPharmacy} sx={{ minHeight: 44 }}>
              Edit details
            </Button>
            <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => go("post-shift")} sx={{ minHeight: 44 }}>
              Post a shift
            </Button>
          </>
        }
      >
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
          {abnVerified ? <Pill label="ABN verified" tone="green" icon={<BadgeCheck size={13} />} /> : null}
          {payrollReady ? (
            <Pill label={payrollEnabled ? "ChemistTasker Payroll" : "Timesheet-only payroll"} tone={payrollEnabled ? "violet" : "neutral"} icon={<Wallet size={13} />} />
          ) : null}
          <Pill label={autoPublishWorkerRequests ? "Staff requests publish automatically" : "You review staff requests"} tone="neutral" icon={<Inbox size={13} />} />
        </Stack>
      </PageHeader>

      <Box sx={{ borderBottom: "1px solid var(--ct-border-color)", mb: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, next) => setTab(next)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label="Pharmacy sections"
          sx={{
            minHeight: 48,
            "& .MuiTab-root": { minHeight: 48, textTransform: "none", fontSize: 15, fontWeight: 600, color: "var(--ct-text-secondary)", px: 1.75 },
            "& .MuiTab-root.Mui-selected": { color: "var(--ct-accent-strong)" },
            "& .MuiTabs-indicator": { height: 3, borderRadius: "3px 3px 0 0", bgcolor: "var(--ct-accent-strong)" },
          }}
        >
          <Tab value="overview" id="pharmacy-tab-btn-overview" aria-controls="pharmacy-tab-overview" label="Overview" />
          <Tab value="staff" id="pharmacy-tab-btn-staff" aria-controls="pharmacy-tab-staff" label={<TabLabel label="Staff" count={countsUnknown ? undefined : counts.staff} attention={staffApps} />} />
          <Tab value="locums" id="pharmacy-tab-btn-locums" aria-controls="pharmacy-tab-locums" label={<TabLabel label="Favourite locums" count={countsUnknown ? undefined : counts.locums} attention={locumApps} />} />
          <Tab value="admins" id="pharmacy-tab-btn-admins" aria-controls="pharmacy-tab-admins" label={<TabLabel label="Admins" count={countsUnknown ? undefined : counts.admins} />} />
          <Tab value="settings" id="pharmacy-tab-btn-settings" aria-controls="pharmacy-tab-settings" label="Settings" />
        </Tabs>
      </Box>

      {listsUnavailable && hasAnyMembers ? (
        <Alert severity="warning" sx={{ mb: 2.5 }} action={<Button color="inherit" size="small" onClick={onMembershipsChanged}>Try again</Button>}>
          The team lists didn't refresh. You're seeing the last saved version.
        </Alert>
      ) : null}

      {/* Overview */}
      <Box hidden={tab !== "overview"} role="tabpanel" id="pharmacy-tab-overview" aria-labelledby="pharmacy-tab-btn-overview">
        <Box
          sx={{
            display: "grid",
            gap: 2.5,
            alignItems: "start",
            gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 2fr) minmax(300px, 1fr)" },
            gridTemplateAreas: { xs: '"attention" "actions" "team" "profile"', lg: '"attention actions" "team actions" "profile actions"' },
            gridTemplateRows: { lg: "auto auto 1fr" },
          }}
        >
          <Box sx={{ gridArea: "attention", minWidth: 0 }}>
            <SectionCard dense flush title="Needs your attention">
              {firstLoad ? (
                <Box sx={{ px: 2.25, pb: 2 }}>
                  <Skeleton height={44} />
                  <Skeleton height={44} />
                </Box>
              ) : listsUnavailable && !hasAnyMembers ? (
                <Box sx={{ px: 2.25, pb: 2.25 }}>
                  <DashboardContentState
                    kind="error"
                    compact
                    title="Team lists can't load right now"
                    description="Staff, favourite locums and admins didn't load. This is a connection problem, not an empty team."
                    actionLabel="Try again"
                    onAction={onMembershipsChanged}
                  />
                </Box>
              ) : attention.length === 0 ? (
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ px: 2.25, pb: 2.25 }}>
                  <IconTile icon={<CheckCircle2 />} tone="cyan" size={36} />
                  <Box>
                    <Typography sx={{ color: "var(--ct-text-primary)", fontWeight: 600, fontSize: 14.5 }}>You're all caught up</Typography>
                    <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 13.5 }}>No applications or invitations are waiting on you.</Typography>
                  </Box>
                </Stack>
              ) : (
                <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
                  {attention.map((item) => (
                    <Stack
                      component="li"
                      key={item.key}
                      direction="row"
                      spacing={1.5}
                      alignItems="center"
                      sx={{ px: 2.25, py: 1.25, borderTop: "1px solid var(--ct-border-color)" }}
                    >
                      <IconTile icon={item.icon} tone={item.tone} size={36} />
                      <Typography sx={{ flex: 1, minWidth: 0, color: "var(--ct-text-primary)", fontSize: 14.5 }}>{item.text}</Typography>
                      <Button size="small" variant={item.tone === "magenta" ? "contained" : "outlined"} onClick={item.onClick} sx={{ minHeight: 36, flexShrink: 0 }}>
                        {item.action}
                      </Button>
                    </Stack>
                  ))}
                </Box>
              )}
            </SectionCard>
          </Box>

          <Box sx={{ gridArea: "team", minWidth: 0 }}>
            <SectionCard dense title="Your team">
              <Box sx={{ display: "grid", gap: { xs: 1, sm: 1.5 }, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                <StatButton
                  icon={<Users />}
                  tone="magenta"
                  label="Staff"
                  value={statValue(counts.staff)}
                  detail={statDetail(counts.staffPending, "Full-time, part-time, casual")}
                  onClick={() => setTab("staff")}
                />
                <StatButton
                  icon={<Star />}
                  tone="violet"
                  label="Favourite locums"
                  value={statValue(counts.locums)}
                  detail={statDetail(counts.locumPending, "See your shifts first")}
                  onClick={() => setTab("locums")}
                />
                <StatButton
                  icon={<ShieldCheck />}
                  tone="blue"
                  label="Admins"
                  value={statValue(counts.admins)}
                  detail={statDetail(counts.adminPending, "Help you run the pharmacy")}
                  onClick={() => setTab("admins")}
                />
              </Box>
              {roleSummary ? (
                <Typography sx={{ mt: 1.75, color: "var(--ct-text-secondary)", fontSize: 13.5 }}>
                  Team mix: <Box component="span" sx={{ color: "var(--ct-text-primary)" }}>{roleSummary}</Box>
                </Typography>
              ) : null}
            </SectionCard>
          </Box>

          <Box sx={{ gridArea: "profile", minWidth: 0 }}>
            <SectionCard dense title="Pharmacy profile" action={<Button size="small" startIcon={<Pencil size={14} />} onClick={editPharmacy}>Edit</Button>}>
              <Box sx={{ display: "grid", gap: 2.5, gridTemplateColumns: { xs: "1fr", sm: "minmax(0, 1fr) minmax(0, 1fr)" } }}>
              <Stack spacing={1.5} sx={{ minWidth: 0 }}>
                {profile?.email ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Mail size={16} color="var(--ct-text-secondary)" aria-hidden="true" />
                    <Typography noWrap sx={{ color: "var(--ct-text-primary)", fontSize: 14 }}>{String(profile.email)}</Typography>
                  </Stack>
                ) : null}
                {profile?.abn ? (
                  <Box>
                    <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 12.5 }}>ABN</Typography>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Typography sx={{ color: "var(--ct-text-primary)", fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{String(profile.abn)}</Typography>
                      <Pill label={abnVerified ? "Verified" : "Not verified"} tone={abnVerified ? "green" : "amber"} />
                    </Stack>
                    {profile.abn_entity_name ? <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 13 }}>{String(profile.abn_entity_name)}</Typography> : null}
                  </Box>
                ) : null}
                {rateLabel ? (
                  <Box>
                    <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 12.5 }}>Default shift rate</Typography>
                    <Typography sx={{ color: "var(--ct-text-primary)", fontSize: 14 }}>{[rateLabel, fixedRate].filter(Boolean).join(" · ")}</Typography>
                  </Box>
                ) : null}
              </Stack>
                {weekHours.length ? (
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 12.5, mb: 0.5 }}>Opening hours</Typography>
                    <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 2, rowGap: 0.25 }}>
                      {weekHours.map((d) => (
                        <React.Fragment key={d.key}>
                          <Typography component="dt" sx={{ color: "var(--ct-text-secondary)", fontSize: 13.5 }}>{d.label}</Typography>
                          <Typography component="dd" sx={{ m: 0, color: d.hours === "Closed" ? "var(--ct-text-secondary)" : "var(--ct-text-primary)", fontSize: 13.5, fontVariantNumeric: "tabular-nums" }}>{d.hours}</Typography>
                        </React.Fragment>
                      ))}
                    </Box>
                  </Box>
                ) : null}
              </Box>
                {!profile?.email && !profile?.abn && !rateLabel && !weekHours.length ? (
                  <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 14 }}>
                    Add opening hours, ABN and a default rate so workers know what to expect.
                  </Typography>
                ) : null}
            </SectionCard>
          </Box>

          <Box sx={{ gridArea: "actions", minWidth: 0 }}>
            <SectionCard dense flush title="Quick actions">
              <ActionRow icon={<ClipboardList />} tone="violet" title="Post a shift" detail="Open, internal or to favourites" onClick={() => go("post-shift")} emphasis />
              <ActionRow icon={<UserPlus />} tone="magenta" title="Invite staff" detail="By email or invite link" onClick={() => { setTab("staff"); setInviteStaff((n) => n + 1); }} />
              <ActionRow icon={<Star />} tone="violet" title="Add a favourite locum" onClick={() => { setTab("locums"); setInviteLocum((n) => n + 1); }} />
              <ActionRow icon={<ShieldCheck />} tone="blue" title="Invite an admin" detail="Share the running of the pharmacy" onClick={() => { setTab("admins"); setInviteAdmin((n) => n + 1); }} />
              <ActionRow icon={<CalendarClock />} tone="cyan" title="Internal roster" detail="Plan your team's week" onClick={() => go("manage-pharmacies/roster")} />
              <ActionRow icon={<CalendarClock />} tone="blue" title="Shift Centre" detail="Active, confirmed and past shifts" onClick={() => go("shift-center")} />
              <ActionRow icon={<Wallet />} tone="cyan" title="Workforce & payroll" detail="Timesheets, leave and pay settings" onClick={() => navigate(`/dashboard/workforce/settings?pharmacy_id=${pharmacy.id}`)} />
            </SectionCard>
          </Box>
        </Box>
      </Box>

      {listsUnavailable && !hasAnyMembers && tab !== "overview" && tab !== "settings" ? (
        <DashboardContentState
          kind="error"
          title="Team lists can't load right now"
          description="Staff, favourite locums and admins didn't load. This is a connection problem, not an empty team."
          actionLabel="Try again"
          onAction={onMembershipsChanged}
        />
      ) : (
        teamPanels
      )}

      {/* Settings */}
      <Box hidden={tab !== "settings"} role="tabpanel" id="pharmacy-tab-settings" aria-labelledby="pharmacy-tab-btn-settings">
        <Stack spacing={3}>
          {[
            {
              title: "Shift requests",
              text: "Decide whether staff cover and swap requests reach the team straight away.",
              body: (
                <SettingRow
                  title="Publish staff requests automatically"
                  description="When on, shift-cover and swap requests from your staff go to the team without waiting for you."
                  checked={autoPublishWorkerRequests}
                  busy={autoPublishSaving}
                  disabled={!onToggleAutoPublishWorkerRequests}
                  onChange={(next) => void onToggleAutoPublishWorkerRequests?.(next)}
                  note={autoPublishWorkerRequests ? "Requests go straight to the team. You still see every one in the Shift Centre." : "You approve each request before the team sees it."}
                  error={autoPublishError}
                />
              ),
            },
            {
              title: "Payroll",
              text: "Optional. Run pay through ChemistTasker, or keep your current payroll system.",
              body: (
                <SettingRow
                  title="Use ChemistTasker Payroll"
                  description="Keep it off while you use your current payroll system. Staff can still be invited, rostered, clocked and timesheeted without Award classifications or ChemistTasker pay rates."
                  checked={payrollEnabled}
                  loading={!payrollReady && !payrollLoadError}
                  busy={payrollSaving}
                  onChange={(next) => void handlePayrollToggle(next)}
                  note={
                    payrollEnabled
                      ? "Payroll needs dated employment terms for TFN staff: employment type, Award classification, Award or above-award rates, and agreed part-time hours where they apply. Workers also add their TFN and super fund before payroll runs. ABN workers keep invoicing."
                      : "Timesheet-only mode. Direct staff need no Award classification or pay rates here. Approved timesheets can go to your existing payroll."
                  }
                  error={payrollLoadError || payrollSaveError}
                  onRetry={payrollLoadError ? () => setPayrollAttempt((n) => n + 1) : undefined}
                />
              ),
            },
            {
              title: "Pharmacy details",
              text: "Address, opening hours, ABN, default rates and documents workers see.",
              body: (
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }} justifyContent="space-between" sx={{ p: 2.25 }}>
                  <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 14 }}>Update these whenever your hours or rates change.</Typography>
                  <Button variant="outlined" startIcon={<Pencil size={16} />} onClick={editPharmacy} sx={{ minHeight: 40, flexShrink: 0 }}>
                    Edit pharmacy details
                  </Button>
                </Stack>
              ),
            },
          ].map((group) => (
            <Box key={group.title} sx={{ display: "grid", gap: { xs: 1.25, md: 3 }, gridTemplateColumns: { xs: "1fr", md: "260px minmax(0, 1fr)" } }}>
              <Box>
                <Typography component="h2" sx={{ color: "var(--ct-text-primary)", fontWeight: 600, fontSize: 16 }}>{group.title}</Typography>
                <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 14, mt: 0.5 }}>{group.text}</Typography>
              </Box>
              <Paper variant="outlined" sx={{ borderRadius: "var(--ct-card-radius)", borderColor: "var(--ct-border-color)", bgcolor: "var(--ct-surface-bg)", boxShadow: "none" }}>
                {group.body}
              </Paper>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
