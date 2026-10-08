import { useEffect, useMemo, useState } from "react";
import { Alert, Box, CircularProgress } from "@mui/material";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import GroupsIcon from "@mui/icons-material/Groups";
import HowToRegIcon from "@mui/icons-material/HowToReg";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import PostAddIcon from "@mui/icons-material/PostAdd";
import StoreIcon from "@mui/icons-material/Store";
import ForumIcon from "@mui/icons-material/Forum";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getOrganizationDashboard, getOrganizationMembership } from "@chemisttasker/shared-core";
import DashboardOverviewTemplate, {
  type DashboardAction,
  type DashboardMetric,
} from "../../../components/dashboard/DashboardOverviewTemplate";
import { useAuth } from "../../../contexts/AuthContext";
import { useWorkspace } from "../../../contexts/WorkspaceContext";
import apiClient from "../../../utils/apiClient";

export default function OrganizationOverviewPage() {
  const { user } = useAuth();
  const { selectedPharmacyId, workspace } = useWorkspace();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlPharmacyId = Number(searchParams.get("pharmacy_id") ?? searchParams.get("pharmacy") ?? searchParams.get("pharmacyId"));
  const effectivePharmacyId =
    workspace === "internal" && selectedPharmacyId
      ? selectedPharmacyId
      : Number.isInteger(urlPharmacyId) && urlPharmacyId > 0
        ? urlPharmacyId
        : null;
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [pillSummary, setPillSummary] = useState<{ balance: number; shift_post_cost: number } | null>(null);

  const orgMembership = getOrganizationMembership(user);
  const orgId = orgMembership?.organization_id ?? null;
  const orgCapabilities = new Set((orgMembership?.capabilities ?? []).map((capability) => String(capability)));
  const canManageRoster = orgCapabilities.has("manage_roster");
  const canInviteStaff = orgCapabilities.has("invite_staff");
  const canManagePharmacies =
    orgCapabilities.has("manage_staff") ||
    orgCapabilities.has("view_all_pharmacies") ||
    orgCapabilities.has("assign_pharmacies");
  const canManageCommunications = orgCapabilities.has("manage_communications");

  useEffect(() => {
    if (!orgId) return;
    let isActive = true;
    setError(null);
    const dashboardParams =
      workspace === "internal" && selectedPharmacyId
        ? { workspace: "internal", pharmacy_id: selectedPharmacyId }
        : effectivePharmacyId
          ? { workspace: "internal", pharmacy_id: effectivePharmacyId }
        : { workspace: "internal" };
    getOrganizationDashboard(orgId, dashboardParams)
      .then((res) => {
        if (!isActive) return;
        setData(res as any);
      })
      .catch((err) => {
        console.error(err);
        if (isActive) setError("Failed to load organization dashboard.");
      });
    return () => {
      isActive = false;
    };
  }, [orgId, selectedPharmacyId, effectivePharmacyId, workspace]);

  useEffect(() => {
    let mounted = true;
    apiClient
      .get("/pill-rewards/balance/")
      .then(({ data }) => {
        if (!mounted) return;
        setPillSummary({
          balance: Number(data?.balance ?? 0),
          shift_post_cost: Number(data?.shift_post_cost ?? 0),
        });
      })
      .catch(() => {
        if (mounted) setPillSummary({ balance: 0, shift_post_cost: 0 });
      });
    return () => {
      mounted = false;
    };
  }, []);

  const claims = useMemo(() => (Array.isArray(data?.pharmacy_claims) ? data.pharmacy_claims : []), [data]);
  const selectedPharmacy =
    effectivePharmacyId && Number(data?.selected_pharmacy?.id) === effectivePharmacyId
      ? data.selected_pharmacy
      : null;
  const scopeName = selectedPharmacy?.name ?? data?.organization?.name ?? orgMembership?.organization_name ?? "All pharmacies";

  const pendingClaims = claims.filter((claim: any) => claim.status === "PENDING").length;
  const acceptedClaims = claims.filter((claim: any) => claim.status === "ACCEPTED").length;
  const activeShifts =
    typeof data?.active_shifts === "number"
      ? data.active_shifts
      : Array.isArray(data?.shifts)
      ? data.shifts.length
      : 0;
  const upcoming = {
    today: Number(data?.upcoming_stats?.today ?? 0),
    week: Number(data?.upcoming_stats?.week ?? activeShifts),
    month: Number(data?.upcoming_stats?.month ?? activeShifts),
  };

  const actions: DashboardAction[] = [];
  if (canManageRoster) {
    actions.push(
      { title: "Post Shift", description: "Cover an open workforce need", icon: <PostAddIcon />, onClick: () => navigate("/dashboard/organization/post-shift"), tone: "pink" },
      { title: "Shift Centre", description: "Review active and confirmed work", icon: <CalendarMonthIcon />, onClick: () => navigate("/dashboard/organization/shift-center"), tone: "cyan" },
    );
  }
  if (canInviteStaff) {
    actions.push(
      { title: "Invite Staff", description: "Add people within your organization authority", icon: <PersonAddIcon />, onClick: () => navigate("/dashboard/organization/invite"), tone: "blue" },
    );
  }
  if (canManagePharmacies) {
    actions.push(
      { title: "Manage Pharmacies", description: "Stores, claims and organization coverage", icon: <StoreIcon />, onClick: () => navigate("/dashboard/organization/manage-pharmacies"), tone: "purple" },
    );
  }
  if (canManageCommunications && actions.length < 4) {
    actions.push(
      { title: "Pharmacy Hub", description: "Open organization communication and updates", icon: <ForumIcon />, onClick: () => navigate("/dashboard/pharmacy-hub"), tone: "blue" },
    );
  }

  const primaryAction = canManageRoster
    ? { label: "Post a shift", icon: <CalendarMonthIcon />, onClick: () => navigate("/dashboard/organization/post-shift") }
    : canManagePharmacies
      ? { label: "Manage pharmacies", icon: <StoreIcon />, onClick: () => navigate("/dashboard/organization/manage-pharmacies") }
      : canInviteStaff
        ? { label: "Invite staff", icon: <PersonAddIcon />, onClick: () => navigate("/dashboard/organization/invite") }
        : { label: "Open Pharmacy Hub", icon: <ForumIcon />, onClick: () => navigate("/dashboard/pharmacy-hub") };

  const secondaryAction = canManageRoster && canManagePharmacies
    ? { label: "Manage pharmacies", icon: <StoreIcon />, onClick: () => navigate("/dashboard/organization/manage-pharmacies") }
    : canManageRoster
      ? { label: "Shift Centre", icon: <CalendarMonthIcon />, onClick: () => navigate("/dashboard/organization/shift-center") }
      : undefined;

  const metrics: DashboardMetric[] = [
    { label: "Pending Claims", value: pendingClaims, helper: "Awaiting approval", icon: <HowToRegIcon />, tone: "purple" },
    { label: "Connected Pharmacies", value: acceptedClaims, helper: "Approved organization stores", icon: <StoreIcon />, tone: "blue" },
    { label: "Open Shifts", value: data?.shift_summary?.open_count ?? 0, helper: selectedPharmacy ? scopeName : "All organization pharmacies", icon: <CalendarMonthIcon />, tone: "cyan" },
    { label: "Confirmed Shifts", value: data?.shift_summary?.confirmed_count ?? data?.confirmed_shifts_count ?? 0, helper: "Booked work", icon: <GroupsIcon />, tone: "pink" },
  ];
  const activityItems = Array.isArray(data?.activity) ? data.activity : [];

  if (!orgId) {
    return <Alert severity="warning">No organization membership was found for this account.</Alert>;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <DashboardOverviewTemplate
        title="Organization Dashboard"
        badge={selectedPharmacy ? "Internal pharmacy" : "Organization workspace"}
        subtitle="See organization-wide staffing, pharmacy coverage and exceptions"
        heroTitle="Welcome back!"
        heroSubtitle={
          canManageRoster
            ? `Focus on staffing coverage, claims and shift activity across ${selectedPharmacy ? scopeName : "your organization"}.`
            : `Focus on the organization tools and pharmacy scope available to your role across ${selectedPharmacy ? scopeName : "your organization"}.`
        }
        primaryAction={primaryAction}
        secondaryAction={secondaryAction}
        pillSummary={
          pillSummary
            ? { balance: pillSummary.balance, shiftPostCost: pillSummary.shift_post_cost }
            : { balance: 0, loading: true }
        }
        actions={actions}
        upcoming={upcoming}
        activity={activityItems}
        metrics={metrics}
        onOpenShifts={() => navigate("/dashboard/organization/shift-center")}
        onOpenActivity={() => navigate("/dashboard/organization/shift-center")}
      />
      {!data && !error && <CircularProgress size={24} />}
      {error && <Alert severity="error">{error}</Alert>}
    </Box>
  );
}
