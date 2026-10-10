import {
  Alert,
  Box,
  Button,
  Skeleton,
  Stack,
  Tab,
  Tabs
} from "@mui/material";
import {
  BadgeCheck,
  Clock3,
  Inbox,
  Pencil,
  Plus,
  Star,
  UserPlus,
  Wallet
} from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import DashboardContentState from "../../../../components/dashboard/DashboardContentState";
import { type Tone } from "../../../../components/ui/IconTile";
import PageHeader from "../../../../components/ui/PageHeader";
import { Pill } from "../../../../components/ui/Pill";
import LocumManager from "./LocumManager";
import PharmacyAdmins from "./PharmacyAdmins";
import StaffManager from "./StaffManager";
import { roleLabel } from "./teamUi";
import { MembershipDTO, PharmacyAdminDTO, PharmacyDTO } from "./types";

import PharmacyOverview from "./PharmacyOverview";
import type { PharmacyProfileExtras } from "./PharmacyProfileCard";
import PharmacySettings from "./PharmacySettings";
import { TabLabel } from "./pharmacyDetailParts";
import { usePayrollSetting } from "./usePayrollSetting";
export type { PharmacyProfileExtras } from "./PharmacyProfileCard";

/* ---------- helpers ---------- */

export type TabKey = "overview" | "staff" | "locums" | "admins" | "settings";
const TABS: TabKey[] = ["overview", "staff", "locums", "admins", "settings"];

const isPending = (m: MembershipDTO) =>
  String(m.status || "").toUpperCase() === "PENDING" || (m.is_active ?? m.isActive) === false;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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

  const { payrollEnabled, payrollReady, payrollLoadError, payrollSaving, payrollSaveError, handlePayrollToggle, retryPayroll } = usePayrollSetting(Number(pharmacy.id));

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

      <PharmacyOverview hidden={tab !== "overview"} firstLoad={firstLoad} listsUnavailable={listsUnavailable} hasAnyMembers={hasAnyMembers}
          onMembershipsChanged={onMembershipsChanged} attention={attention} counts={counts} statValue={statValue} statDetail={statDetail}
          roleSummary={roleSummary} setTab={setTab} profile={profile} editPharmacy={editPharmacy} go={go}
          inviteStaff={() => setInviteStaff(n => n + 1)} inviteLocum={() => setInviteLocum(n => n + 1)} inviteAdmin={() => setInviteAdmin(n => n + 1)}
          openWorkforce={() => navigate(`/dashboard/workforce/settings?pharmacy_id=${pharmacy.id}`)} />

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

      <PharmacySettings hidden={tab !== "settings"} autoPublishWorkerRequests={autoPublishWorkerRequests} autoPublishSaving={autoPublishSaving} autoPublishError={autoPublishError}
          onToggleAutoPublishWorkerRequests={onToggleAutoPublishWorkerRequests} payrollEnabled={payrollEnabled} payrollReady={payrollReady}
          payrollLoadError={payrollLoadError} payrollSaving={payrollSaving} payrollSaveError={payrollSaveError} handlePayrollToggle={handlePayrollToggle}
          retryPayroll={retryPayroll} editPharmacy={editPharmacy} />
    </Box>
  );
}
