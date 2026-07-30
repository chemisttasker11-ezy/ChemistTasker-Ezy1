import { useEffect, useMemo, useState } from "react";
import { Alert, Box, CircularProgress } from "@mui/material";
import AppsIcon from "@mui/icons-material/Apps";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ChatOutlinedIcon from "@mui/icons-material/ChatOutlined";
import GroupsIcon from "@mui/icons-material/Groups";
import HowToRegIcon from "@mui/icons-material/HowToReg";
import HubIcon from "@mui/icons-material/Hub";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import PostAddIcon from "@mui/icons-material/PostAdd";
import StoreIcon from "@mui/icons-material/Store";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getOrganizationDashboard } from "@chemisttasker/shared-core";
import DashboardOverviewTemplate, {
  type DashboardAction,
  type DashboardMetric,
} from "../../../components/dashboard/DashboardOverviewTemplate";
import { ORG_ROLES } from "../../../constants/roles";
import { useAuth, type OrgMembership } from "../../../contexts/AuthContext";
import { useWorkspace } from "../../../contexts/WorkspaceContext";
import apiClient from "../../../utils/apiClient";

function isOrgMembership(membership: unknown): membership is OrgMembership {
  if (!membership || typeof membership !== "object") return false;
  const candidate = membership as OrgMembership & { role?: string };
  return (
    typeof candidate.organization_id === "number" &&
    typeof candidate.role === "string" &&
    ORG_ROLES.includes(candidate.role as any)
  );
}

export default function OrganizationOverviewPage() {
  const { user } = useAuth();
  const { selectedPharmacyId, workspace } = useWorkspace();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlPharmacyId = Number(searchParams.get("pharmacy_id") ?? searchParams.get("pharmacy") ?? searchParams.get("pharmacyId"));
  const effectivePharmacyId =
    workspace === "internal" && selectedPharmacyId
      ? selectedPharmacyId
      : Number.isFinite(urlPharmacyId)
        ? urlPharmacyId
        : null;
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [pillSummary, setPillSummary] = useState<{ balance: number; shift_post_cost: number } | null>(null);

  const orgMembership = Array.isArray(user?.memberships) ? user.memberships.find(isOrgMembership) : undefined;
  const orgId = orgMembership?.organization_id ?? null;

  useEffect(() => {
    if (!orgId) return;
    let isActive = true;
    setError(null);
    const dashboardParams =
      workspace === "internal" && selectedPharmacyId
        ? { workspace: "internal", pharmacy_id: selectedPharmacyId }
        : effectivePharmacyId
          ? { workspace: "internal", pharmacy_id: effectivePharmacyId }
        : { workspace: "platform" };
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
      .get("/client-profile/pill-rewards/balance/")
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
  const pharmacies = useMemo(() => (Array.isArray(data?.pharmacies) ? data.pharmacies : []), [data]);
  const selectedPharmacy = effectivePharmacyId ? pharmacies.find((pharmacy: any) => Number(pharmacy?.id) === Number(effectivePharmacyId)) ?? null : null;
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

  const actions: DashboardAction[] = [
    { title: "Invite Staff", description: "Add organization members", icon: <PersonAddIcon />, onClick: () => navigate("/dashboard/organization/invite"), tone: "blue" },
    { title: "Claim Pharmacies", description: "Submit ownership claims", icon: <HowToRegIcon />, onClick: () => navigate("/dashboard/organization/manage-pharmacies?claim=open"), tone: "purple" },
    { title: "Manage Pharmacies", description: "Configure stores", icon: <StoreIcon />, onClick: () => navigate("/dashboard/organization/manage-pharmacies"), tone: "blue" },
    { title: "Post Shift", description: "Publish an open shift", icon: <PostAddIcon />, onClick: () => navigate("/dashboard/organization/post-shift"), tone: "pink" },
    { title: "Shift Centre", description: "Active and confirmed shifts", icon: <CalendarMonthIcon />, onClick: () => navigate("/dashboard/organization/shift-center"), tone: "cyan" },
    { title: "Talent Hub", description: "Review talent activity", icon: <AppsIcon />, onClick: () => navigate("/dashboard/organization/interests"), tone: "blue" },
    { title: "Chat", description: "Coordinate with teams", icon: <ChatOutlinedIcon />, onClick: () => navigate("/dashboard/organization/chat"), tone: "purple" },
    { title: "Pharmacy Hub", description: "Community and feeds", icon: <HubIcon />, onClick: () => navigate("/dashboard/organization/pharmacy-hub"), tone: "cyan", wide: true },
  ];

  const metrics: DashboardMetric[] = [
    { label: "Pending Claims", value: pendingClaims, helper: "Awaiting approval", icon: <HowToRegIcon />, tone: "purple" },
    { label: "Approved Claims", value: acceptedClaims, helper: "Connected stores", icon: <StoreIcon />, tone: "blue" },
    { label: "Open Shifts", value: data?.shift_summary?.open_count ?? 0, helper: selectedPharmacy ? scopeName : "Public platform", icon: <CalendarMonthIcon />, tone: "cyan" },
    { label: "Count of Shifts", value: data?.shift_summary?.all_count ?? activeShifts, helper: "Active shift records", icon: <CalendarMonthIcon />, tone: "blue" },
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
        badge={selectedPharmacy ? "Internal workspace" : "Public platform"}
        subtitle="Manage pharmacies, teams and operations"
        heroTitle="Welcome back!"
        heroSubtitle={`Here's what's happening across ${selectedPharmacy ? scopeName : "your organization"} today.`}
        primaryAction={{ label: "Post a shift", icon: <CalendarMonthIcon />, onClick: () => navigate("/dashboard/organization/post-shift") }}
        secondaryAction={{ label: "Manage pharmacies", icon: <StoreIcon />, onClick: () => navigate("/dashboard/organization/manage-pharmacies") }}
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
