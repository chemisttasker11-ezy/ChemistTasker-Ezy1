import { useEffect, useState } from "react";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ChatIcon from "@mui/icons-material/Chat";
import LogoutIcon from "@mui/icons-material/Logout";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import StoreIcon from "@mui/icons-material/Store";
import WorkOutlineIcon from "@mui/icons-material/WorkOutline";
import { useNavigate } from "react-router-dom";
import DashboardOverviewTemplate, {
  type DashboardAction,
  type DashboardMetric,
} from "../../../components/dashboard/DashboardOverviewTemplate";
import { useAdminScope } from "../../../contexts/AdminScopeContext";
import { useAuth } from "../../../contexts/AuthContext";
import apiClient from "../../../utils/apiClient";
import { dashboardGreetingName } from "../../../utils/displayName";

export default function AdminOverview() {
  const { user } = useAuth();
  const { assignment, pharmacyId } = useAdminScope();
  const navigate = useNavigate();
  const adminBasePath = `/dashboard/admin/${pharmacyId}`;
  const [pillSummary, setPillSummary] = useState<{ balance: number; shift_post_cost: number } | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);

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

  useEffect(() => {
    let mounted = true;
    apiClient
      .get("/client-profile/dashboard/owner/", { params: { workspace: "internal", pharmacy_id: pharmacyId } })
      .then(({ data }) => {
        if (mounted) setDashboardData(data);
      })
      .catch((error: any) => {
        console.error("Admin dashboard analytics fetch error:", error);
        if (mounted) setDashboardData(null);
      });
    return () => {
      mounted = false;
    };
  }, [pharmacyId]);

  const pharmacyName = assignment.pharmacy_name || `Pharmacy #${pharmacyId}`;

  const actions: DashboardAction[] = [
    { title: "Manage Pharmacies", description: "Edit profile and staff", icon: <ManageAccountsIcon />, onClick: () => navigate(`${adminBasePath}/manage-pharmacies`), tone: "blue" },
    { title: "Internal Roster", description: "Review assignments", icon: <CalendarMonthIcon />, onClick: () => navigate(`${adminBasePath}/manage-pharmacies/roster`), tone: "purple" },
    { title: "Post Shift", description: "Create a new shift", icon: <StoreIcon />, onClick: () => navigate(`${adminBasePath}/post-shift`), tone: "pink" },
    { title: "Shift Centre", description: "Active and confirmed shifts", icon: <AccessTimeIcon />, onClick: () => navigate(`${adminBasePath}/shift-center`), tone: "cyan" },
    { title: "Chat", description: "Talk with the team", icon: <ChatIcon />, onClick: () => navigate(`${adminBasePath}/chat`), tone: "purple" },
    { title: "Logout Admin View", description: "Return to your account", icon: <LogoutIcon />, onClick: () => navigate(`${adminBasePath}/logout`), tone: "blue", wide: true },
  ];

  const metrics: DashboardMetric[] = [
    { label: "Open Shifts", value: dashboardData?.shift_summary?.open_count ?? 0, helper: pharmacyName, icon: <CalendarMonthIcon />, tone: "blue" },
    { label: "Confirmed Shifts", value: dashboardData?.shift_summary?.confirmed_count ?? dashboardData?.confirmed_shifts_count ?? 0, helper: "Booked work", icon: <WorkOutlineIcon />, tone: "purple" },
    { label: "Count of Shifts", value: dashboardData?.shift_summary?.all_count ?? dashboardData?.shift_summary?.upcoming_count ?? 0, helper: "Active shift records", icon: <ManageAccountsIcon />, tone: "cyan" },
    { label: "Unpaid Invoices", value: dashboardData?.invoice_summary?.unpaid_count ?? 0, helper: dashboardData?.invoice_summary?.unpaid_total ?? "$0.00", icon: <StoreIcon />, tone: "pink" },
  ];
  const activityItems = Array.isArray(dashboardData?.activity)
    ? dashboardData.activity.map((item: any) => ({
        ...item,
        action_url:
          typeof item?.action_url === "string" && item.action_url.startsWith("/dashboard/owner/shifts/")
            ? item.action_url.replace("/dashboard/owner", adminBasePath)
            : typeof item?.action_url === "string" && item.action_url.startsWith("/dashboard/owner/invoice/")
              ? item.action_url.replace("/dashboard/owner", adminBasePath)
            : item?.action_url,
      }))
    : [];

  return (
    <DashboardOverviewTemplate
      title="Admin Dashboard"
      badge="Internal workspace"
      subtitle="Manage staffing, rosters and operations for this pharmacy"
      heroTitle={`Welcome back, ${dashboardGreetingName(user)}!`}
      heroSubtitle={`Here's what's happening at ${pharmacyName} today.`}
      primaryAction={{ label: "Post a shift", icon: <CalendarMonthIcon />, onClick: () => navigate(`${adminBasePath}/post-shift`) }}
      secondaryAction={{ label: "Manage pharmacy", icon: <StoreIcon />, onClick: () => navigate(`${adminBasePath}/manage-pharmacies`) }}
      pillSummary={
        pillSummary
          ? { balance: pillSummary.balance, shiftPostCost: pillSummary.shift_post_cost }
          : { balance: 0, loading: true }
      }
      actions={actions}
      upcoming={{
        today: Number(dashboardData?.upcoming_stats?.today ?? 0),
        week: Number(dashboardData?.upcoming_stats?.week ?? dashboardData?.upcoming_shifts_count ?? 0),
        month: Number(dashboardData?.upcoming_stats?.month ?? dashboardData?.upcoming_shifts_count ?? 0),
      }}
      activity={activityItems}
      metrics={metrics}
      onOpenShifts={() => navigate(`${adminBasePath}/shift-center`)}
      onOpenActivity={() => navigate(`${adminBasePath}/shift-center`)}
    />
  );
}
