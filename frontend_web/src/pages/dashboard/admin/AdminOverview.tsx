import { useEffect, useState } from "react";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import StoreIcon from "@mui/icons-material/Store";
import WorkOutlineIcon from "@mui/icons-material/WorkOutline";
import ForumIcon from "@mui/icons-material/Forum";
import { useNavigate } from "react-router-dom";
import DashboardOverviewTemplate, {
  type DashboardAction,
  type DashboardMetric,
} from "../../../components/dashboard/DashboardOverviewTemplate";
import { useAdminScope } from "../../../contexts/AdminScopeContext";
import { useAuth } from "../../../contexts/AuthContext";
import apiClient from "../../../utils/apiClient";
import ChooseAccountTypeCard from "../../../components/ChooseAccountTypeCard";
import { dashboardGreetingName } from "../../../utils/displayName";
import {
  ADMIN_CAPABILITY_MANAGE_COMMUNICATIONS,
  ADMIN_CAPABILITY_MANAGE_ROSTER,
  ADMIN_CAPABILITY_MANAGE_STAFF,
} from "../../../constants/adminCapabilities";

export default function AdminOverview() {
  const { user, hasCapability, unreadCount } = useAuth();
  const { assignment, pharmacyId } = useAdminScope();
  const navigate = useNavigate();
  const adminBasePath = `/dashboard/admin/${pharmacyId}`;
  const [pillSummary, setPillSummary] = useState<{ balance: number; shift_post_cost: number } | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);

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

  useEffect(() => {
    let mounted = true;
    apiClient
      .get("/dashboard/owner/", { params: { workspace: "internal", pharmacy_id: pharmacyId } })
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
  const canManageRoster = hasCapability(ADMIN_CAPABILITY_MANAGE_ROSTER, pharmacyId);
  const canManageStaff = hasCapability(ADMIN_CAPABILITY_MANAGE_STAFF, pharmacyId);
  const canManageCommunications =
    hasCapability(ADMIN_CAPABILITY_MANAGE_COMMUNICATIONS, pharmacyId) ||
    canManageStaff ||
    canManageRoster;

  const actions: DashboardAction[] = [];
  if (canManageRoster) {
    actions.push(
      { title: "Post Shift", description: "Fill an immediate staffing gap", icon: <StoreIcon />, onClick: () => navigate(`${adminBasePath}/post-shift`), tone: "pink" },
      { title: "Internal Roster", description: "Review upcoming pharmacy coverage", icon: <CalendarMonthIcon />, onClick: () => navigate(`${adminBasePath}/manage-pharmacies/roster`), tone: "purple" },
      { title: "Shift Centre", description: "Resolve active and confirmed shift work", icon: <AccessTimeIcon />, onClick: () => navigate(`${adminBasePath}/shift-center`), tone: "cyan" },
    );
  }
  if (canManageStaff) {
    actions.push(
      { title: "Manage Pharmacy", description: "Staff, access and pharmacy details", icon: <ManageAccountsIcon />, onClick: () => navigate(`${adminBasePath}/manage-pharmacies`), tone: "blue" },
    );
  }
  if (canManageCommunications && actions.length < 4) {
    actions.push(
      { title: "Pharmacy Hub", description: "Open pharmacy communication and updates", icon: <ForumIcon />, onClick: () => navigate("/dashboard/pharmacy-hub"), tone: "blue" },
    );
  }

  const primaryAction = canManageRoster
    ? { label: "Post a shift", icon: <CalendarMonthIcon />, onClick: () => navigate(`${adminBasePath}/post-shift`) }
    : canManageStaff
      ? { label: "Manage pharmacy", icon: <StoreIcon />, onClick: () => navigate(`${adminBasePath}/manage-pharmacies`) }
      : canManageCommunications
        ? { label: "Open Pharmacy Hub", icon: <ForumIcon />, onClick: () => navigate("/dashboard/pharmacy-hub") }
        : { label: "Open chat", icon: <ManageAccountsIcon />, onClick: () => navigate(`${adminBasePath}/chat`) };

  const secondaryAction = canManageRoster && canManageStaff
    ? { label: "Manage pharmacy", icon: <StoreIcon />, onClick: () => navigate(`${adminBasePath}/manage-pharmacies`) }
    : canManageRoster
      ? { label: "Shift Centre", icon: <AccessTimeIcon />, onClick: () => navigate(`${adminBasePath}/shift-center`) }
      : undefined;

  const metrics: DashboardMetric[] = canManageRoster
    ? [
        { label: "Open Shifts", value: dashboardData?.shift_summary?.open_count ?? 0, helper: pharmacyName, icon: <CalendarMonthIcon />, tone: "blue" },
        { label: "Confirmed Shifts", value: dashboardData?.shift_summary?.confirmed_count ?? dashboardData?.confirmed_shifts_count ?? 0, helper: "Booked work", icon: <WorkOutlineIcon />, tone: "purple" },
        { label: "Active Shifts", value: dashboardData?.shift_summary?.all_count ?? dashboardData?.shift_summary?.upcoming_count ?? 0, helper: "Current staffing work", icon: <ManageAccountsIcon />, tone: "cyan" },
        { label: "Today", value: dashboardData?.upcoming_stats?.today ?? 0, helper: "Shifts needing today's attention", icon: <AccessTimeIcon />, tone: "pink" },
      ]
    : [
        { label: "Workspace", value: pharmacyName, helper: "Current pharmacy", icon: <StoreIcon />, tone: "blue" },
        { label: "Admin access", value: assignment.admin_level?.replace(/_/g, " ") ?? "Admin", helper: "Current permission scope", icon: <ManageAccountsIcon />, tone: "purple" },
        { label: "Unread messages", value: unreadCount, helper: "Conversations needing attention", icon: <ForumIcon />, tone: "pink" },
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
    <>
    <ChooseAccountTypeCard pharmacyId={pharmacyId} />
    <DashboardOverviewTemplate
      title="Admin Dashboard"
      badge="Internal workspace"
      subtitle="Manage staffing, rosters and operations for this pharmacy"
      heroTitle={`Welcome back, ${dashboardGreetingName(user)}!`}
      heroSubtitle={
        canManageRoster
          ? `Focus on staffing coverage, confirmed work and exceptions at ${pharmacyName}.`
          : canManageStaff
            ? `Focus on staff access and pharmacy operations at ${pharmacyName}.`
            : `Focus on the communication tools available to you at ${pharmacyName}.`
      }
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
      pillSummary={
        canManageRoster
          ? pillSummary
            ? { balance: pillSummary.balance, shiftPostCost: pillSummary.shift_post_cost }
            : { balance: 0, loading: true }
          : undefined
      }
      actions={actions}
      upcoming={{
        today: Number(dashboardData?.upcoming_stats?.today ?? 0),
        week: Number(dashboardData?.upcoming_stats?.week ?? dashboardData?.upcoming_shifts_count ?? 0),
        month: Number(dashboardData?.upcoming_stats?.month ?? dashboardData?.upcoming_shifts_count ?? 0),
      }}
      showUpcoming={canManageRoster}
      activity={activityItems}
      metrics={metrics}
      onOpenShifts={canManageRoster ? () => navigate(`${adminBasePath}/shift-center`) : undefined}
      onOpenActivity={canManageRoster ? () => navigate(`${adminBasePath}/shift-center`) : undefined}
    />
    </>
  );
}
