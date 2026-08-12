import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Grid, Skeleton } from "@mui/material";
import WorkOutlineIcon from "@mui/icons-material/WorkOutline";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import HistoryIcon from "@mui/icons-material/History";
import PersonIcon from "@mui/icons-material/Person";
import AppsIcon from "@mui/icons-material/Apps";
import SchoolIcon from "@mui/icons-material/School";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import { useNavigate } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import { useWorkspace } from "../../../contexts/WorkspaceContext";
import { getExplorerDashboard, getOnboardingDetail } from "@chemisttasker/shared-core";
import apiClient from "../../../utils/apiClient";
import { dashboardGreetingName } from "../../../utils/displayName";
import { dashboardTitleForRole } from "../../../utils/roleLabels";
import DashboardOverviewTemplate, {
  type DashboardAction,
  type DashboardMetric,
} from "../../../components/dashboard/DashboardOverviewTemplate";

type User = {
  id: number;
  email: string;
  first_name?: string;
  username?: string;
  role?: string;
};

type DashboardData = {
  user?: User;
  message?: string;
  upcoming_shifts_count?: number;
  confirmed_shifts_count?: number;
  community_shifts_count?: number;
  bills_summary?: Record<string, string>;
  upcoming_stats?: { today?: number; week?: number; month?: number };
  shift_summary?: {
    upcoming_count?: number;
    confirmed_count?: number;
    community_count?: number;
    open_count?: number;
    all_count?: number;
  };
  invoice_summary?: { unpaid_count?: number; unpaid_total?: string; total_billed?: string };
  activity?: any[];
};

export default function OverviewPageStaff() {
  const { user, activePersona } = useAuth() as { user: User; activePersona?: string };
  const { selectedPharmacyId, workspace } = useWorkspace();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlPharmacyId = Number(searchParams.get("pharmacy_id") ?? searchParams.get("pharmacy") ?? searchParams.get("pharmacyId"));
  const effectivePharmacyId =
    workspace === "internal" && selectedPharmacyId
      ? selectedPharmacyId
      : workspace === "internal" && Number.isFinite(urlPharmacyId)
        ? urlPharmacyId
        : null;

  const role = (user?.role || "").toLowerCase();
  const isPharmacist = role === "pharmacist";
  const isOtherStaff = role === "other_staff";
  const isExplorer = role === "explorer";
  const roleSegment = isExplorer ? "explorer" : isPharmacist ? "pharmacist" : "otherstaff";

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [otherStaffRoleType, setOtherStaffRoleType] = useState<string | null>(
    () => (user as any)?.other_staff_profile?.role_type ?? (user as any)?.otherStaffProfile?.roleType ?? null
  );

  useEffect(() => {
    if (!isOtherStaff) {
      setOtherStaffRoleType(null);
      return;
    }
    let cancelled = false;
    getOnboardingDetail("other_staff")
      .then((onboarding: any) => {
        if (!cancelled) {
          setOtherStaffRoleType(onboarding?.data?.role_type ?? onboarding?.role_type ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOtherStaffRoleType(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOtherStaff, user?.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        const dashboardParams =
          workspace === "internal" && selectedPharmacyId
            ? { workspace: "internal", pharmacy_id: selectedPharmacyId }
            : workspace === "internal" && effectivePharmacyId
              ? { workspace: "internal", pharmacy_id: effectivePharmacyId }
            : { workspace: "platform" };
        const result = isPharmacist
          ? (await apiClient.get("/client-profile/dashboard/pharmacist/", { params: dashboardParams })).data
          : isOtherStaff
            ? (await apiClient.get("/client-profile/dashboard/otherstaff/", { params: dashboardParams })).data
            : await getExplorerDashboard();
        if (cancelled) return;
        setData(result as any);
        setError(null);
      } catch (err: any) {
        if (!isExplorer && err?.response?.status === 403) {
          try {
            const fallback = await getExplorerDashboard();
            if (!cancelled) {
              setData(fallback as any);
              setError(null);
            }
            return;
          } catch {
            // fall through
          }
        }
        if (!cancelled) {
          setError("Error loading dashboard.");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isPharmacist, isOtherStaff, isExplorer, selectedPharmacyId, effectivePharmacyId, workspace]);

  const selectedPharmacyName = useMemo(() => {
    const memberships = Array.isArray((user as any)?.memberships) ? (user as any).memberships : [];
    const match = memberships.find((membership: any) => Number(membership?.pharmacy_id ?? membership?.pharmacyId ?? membership?.pharmacy?.id) === Number(effectivePharmacyId));
    return match?.pharmacy_name ?? match?.pharmacyName ?? match?.pharmacy?.name ?? (effectivePharmacyId ? `Pharmacy #${effectivePharmacyId}` : "All pharmacies");
  }, [effectivePharmacyId, user]);

  if (loading) {
    return (
      <Box sx={{ width: "100%", maxWidth: 1660, mx: "auto", py: { xs: 3, md: 4 }, display: "flex", flexDirection: "column", gap: { xs: 3, md: 4 } }}>
        <Skeleton variant="rounded" height={290} sx={{ borderRadius: "22px" }} />
        <Grid container spacing={2.5}>
          {Array.from({ length: 4 }).map((_, idx) => (
            <Grid size={{ xs: 12, sm: 6, md: 3 }} key={idx}>
              <Skeleton variant="rounded" height={196} sx={{ borderRadius: "20px" }} />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ maxWidth: 900, mx: "auto", px: { xs: 2, md: 4 }, py: { xs: 3, md: 6 } }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  const displayName = dashboardGreetingName(user);
  const upcoming = {
    today: Number(data?.upcoming_stats?.today ?? 0),
    week: Number(data?.upcoming_stats?.week ?? data?.upcoming_shifts_count ?? 0),
    month: Number(data?.upcoming_stats?.month ?? data?.upcoming_shifts_count ?? 0),
  };
  const dashboardTitle = dashboardTitleForRole(user?.role, otherStaffRoleType);
  const dashboardSubtitle = isExplorer
    ? "Browse the public ChemistTasker platform, resources and opportunities"
    : effectivePharmacyId
      ? `Working inside ${selectedPharmacyName}`
      : "Review shifts, availability and pharmacy opportunities";
  const isInternalWorkspace = !isExplorer && workspace === "internal" && Boolean(effectivePharmacyId);
  const openShiftActionTitle = isInternalWorkspace ? "Community Shifts" : "Public Shifts";
  const openShiftActionDescription = isInternalWorkspace ? "View this pharmacy's open shifts" : "View open platform shifts";
  const openShiftPath = `/dashboard/${roleSegment}/shifts/${isInternalWorkspace ? "community" : "public"}`;
  const publishAvailabilityPath = (() => {
    const params = new URLSearchParams(searchParams);
    params.set("publish_availability", "1");
    return `/dashboard/${roleSegment}/interests?${params.toString()}`;
  })();

  const actions: DashboardAction[] = isExplorer
    ? [
        { title: "Public Shifts", description: "Browse open roles near you", icon: <WorkOutlineIcon />, onClick: () => navigate(`/dashboard/${roleSegment}/shifts/public`), tone: "blue" },
        { title: "Community Shifts", description: "Explore platform opportunities", icon: <CalendarMonthIcon />, onClick: () => navigate(`/dashboard/${roleSegment}/shifts/community`), tone: "purple" },
        { title: "Profile", description: "Complete your onboarding", icon: <PersonIcon />, onClick: () => navigate(`/dashboard/${roleSegment}/onboarding`), tone: "pink" },
        { title: "Talent Hub", description: "Discover learning paths", icon: <AppsIcon />, onClick: () => navigate(`/dashboard/${roleSegment}/interests`), tone: "cyan" },
      ]
    : [
        { title: openShiftActionTitle, description: openShiftActionDescription, icon: <WorkOutlineIcon />, onClick: () => navigate(openShiftPath), tone: "blue" },
        { title: "Publish Availability", description: "Post your available times", icon: <AccessTimeIcon />, onClick: () => navigate(publishAvailabilityPath), tone: "pink" },
        { title: "My Roster", description: "Review internal assignments", icon: <CalendarMonthIcon />, onClick: () => navigate(`/dashboard/${roleSegment}/shifts/roster`), tone: "purple" },
        { title: "Confirmed Shifts", description: "Track your booked work", icon: <ShieldOutlinedIcon />, onClick: () => navigate(`/dashboard/${roleSegment}/shifts/confirmed`), tone: "cyan" },
        { title: "Availability", description: "Update your working times", icon: <AccessTimeIcon />, onClick: () => navigate(`/dashboard/${roleSegment}/availability`), tone: "pink" },
        { title: "Invoices", description: "Manage and create invoices", icon: <CreditCardIcon />, onClick: () => navigate(`/dashboard/${roleSegment}/invoice`), tone: "cyan" },
        { title: "Shift History", description: "Review past shifts", icon: <HistoryIcon />, onClick: () => navigate(`/dashboard/${roleSegment}/shifts/history`), tone: "purple" },
        { title: "Profile", description: "Documents and preferences", icon: <PersonIcon />, onClick: () => navigate(`/dashboard/${roleSegment}/onboarding`), tone: "pink" },
        { title: "Learning Materials", description: "Training and resources", icon: <SchoolIcon />, onClick: () => navigate(`/dashboard/${roleSegment}/learning`), tone: "blue", wide: true },
      ];

  const metrics: DashboardMetric[] = [
    { label: "Open Shifts", value: data?.shift_summary?.open_count ?? 0, helper: effectivePharmacyId ? selectedPharmacyName : "Public platform", icon: <CalendarMonthIcon />, tone: "blue" },
    { label: "Confirmed Shifts", value: data?.shift_summary?.confirmed_count ?? data?.confirmed_shifts_count ?? 0, helper: "Booked work", icon: <ShieldOutlinedIcon />, tone: "purple" },
    { label: "Count of Shifts", value: data?.shift_summary?.all_count ?? data?.shift_summary?.upcoming_count ?? data?.upcoming_shifts_count ?? 0, helper: "Active shift records", icon: <WorkOutlineIcon />, tone: "cyan" },
    { label: isExplorer ? "Saved Interests" : "Unpaid Invoices", value: isExplorer ? "No saves yet" : data?.invoice_summary?.unpaid_count ?? 0, helper: isExplorer ? "Start saving topics" : data?.invoice_summary?.unpaid_total ?? "$0.00", icon: isExplorer ? <FavoriteBorderIcon /> : <CreditCardIcon />, tone: "pink" },
  ];
  const activityItems = Array.isArray(data?.activity) ? data.activity : [];

  return (
    <DashboardOverviewTemplate
      title={dashboardTitle}
      badge={effectivePharmacyId ? "Internal workspace" : "Public platform"}
      subtitle={dashboardSubtitle}
      heroTitle={`Welcome back, ${displayName}!`}
      heroSubtitle={isExplorer ? data?.message || "Discover open roles and finish onboarding to unlock personalised matches." : "Review your upcoming shifts, update availability, and keep an eye on community opportunities."}
      primaryAction={{ label: isExplorer ? "Browse community shifts" : `View ${openShiftActionTitle.toLowerCase()}`, icon: <WorkOutlineIcon />, onClick: () => navigate(isExplorer ? `/dashboard/${roleSegment}/shifts/community` : openShiftPath) }}
      secondaryAction={{ label: isExplorer ? "Complete profile" : "Publish Availability", icon: <CalendarMonthIcon />, onClick: () => navigate(isExplorer ? `/dashboard/${roleSegment}/onboarding` : publishAvailabilityPath) }}
      actions={actions}
      upcoming={upcoming}
      upcomingTitle={isExplorer ? "Job Snapshot" : "My Shifts"}
      activity={activityItems}
      metrics={metrics}
      invoicePanel={isExplorer || activePersona === "admin" ? undefined : {
        title: "Invoices",
        total: data?.invoice_summary?.total_billed ?? data?.bills_summary?.total_billed ?? "$0.00",
        totalLabel: "Total income this month",
        unpaidCount: data?.invoice_summary?.unpaid_count ?? 0,
        unpaidTotal: data?.invoice_summary?.unpaid_total ?? "$0.00",
        buttonLabel: "Invoices",
        onClick: () => navigate(`/dashboard/${roleSegment}/invoice`),
      }}
      onOpenShifts={() => navigate(isExplorer ? `/dashboard/${roleSegment}/shifts/community` : openShiftPath)}
      onOpenActivity={() => navigate(isExplorer ? `/dashboard/${roleSegment}/shifts/community` : openShiftPath)}
    />
  );
}
