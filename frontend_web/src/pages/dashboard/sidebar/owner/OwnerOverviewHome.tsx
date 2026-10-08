import { useEffect, useMemo, useState } from "react";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import ListAltIcon from "@mui/icons-material/ListAlt";
import SettingsIcon from "@mui/icons-material/Settings";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import StoreIcon from "@mui/icons-material/Store";
import WorkOutlineIcon from "@mui/icons-material/WorkOutline";
import { useNavigate } from "react-router-dom";
import DashboardOverviewTemplate, {
  type DashboardAction,
  type DashboardMetric,
} from "../../../../components/dashboard/DashboardOverviewTemplate";
import { useAuth } from "../../../../contexts/AuthContext";
import apiClient from "../../../../utils/apiClient";
import { dashboardGreetingName } from "../../../../utils/displayName";
import type { PharmacyDTO } from "./types";

export default function OwnerOverviewHome({
  totalPharmacies,
  pharmacies,
  selectedPharmacyId,
  onOpenManage,
  onOpenRoster,
  onOpenShifts,
  onPostShift,
  onOpenSettings,
  onOpenPills,
  dashboardData,
}: {
  totalPharmacies: number;
  pharmacies: PharmacyDTO[];
  selectedPharmacyId: number | null;
  dashboardData?: any;
  onOpenManage: () => void;
  onOpenRoster: () => void;
  onOpenShifts: () => void;
  onPostShift: () => void;
  onOpenSettings: () => void;
  onOpenPills: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pillSummary, setPillSummary] = useState<{ balance: number; shift_post_cost: number } | null>(null);

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

  const selectedPharmacy = useMemo(
    () => pharmacies.find((pharmacy) => Number(pharmacy.id) === Number(selectedPharmacyId)) ?? null,
    [pharmacies, selectedPharmacyId]
  );
  const scopeName = selectedPharmacy?.name ?? "All pharmacies";

  const openShiftCount = Number(dashboardData?.shift_summary?.open_count ?? 0);
  const confirmedShiftCount = Number(
    dashboardData?.shift_summary?.confirmed_count ?? dashboardData?.confirmed_shifts_count ?? 0
  );
  const allShiftCount = Number(
    dashboardData?.shift_summary?.all_count ??
      dashboardData?.shift_summary?.upcoming_count ??
      dashboardData?.upcoming_shifts_count ??
      0
  );
  const unpaidInvoiceCount = Number(dashboardData?.invoice_summary?.unpaid_count ?? 0);
  const unpaidInvoiceTotal = dashboardData?.invoice_summary?.unpaid_total ?? "$0.00";

  const actions: DashboardAction[] = [
    {
      title: totalPharmacies > 1 ? "Manage Pharmacies" : "Manage Pharmacy",
      description:
        totalPharmacies > 1
          ? "Staff, access and store configuration"
          : "Staff, access and pharmacy details",
      icon: <StoreIcon />,
      onClick: onOpenManage,
      tone: "blue",
    },
    {
      title: "Internal Roster",
      description: "Plan coverage for your pharmacy team",
      icon: <CalendarMonthIcon />,
      onClick: onOpenRoster,
      tone: "purple",
    },
    {
      title: "Post Shift",
      description: "Fill an uncovered staffing requirement",
      icon: <ListAltIcon />,
      onClick: onPostShift,
      tone: "pink",
    },
    {
      title: "Shift Centre",
      description: "Resolve active, confirmed and historical work",
      icon: <WorkOutlineIcon />,
      onClick: onOpenShifts,
      tone: "cyan",
    },
    {
      title: "Workforce Settings",
      description: "Attendance, payroll and workforce configuration",
      icon: <SettingsIcon />,
      onClick: onOpenSettings,
      tone: "purple",
      wide: true,
    },
  ];

  const metrics: DashboardMetric[] = [
    {
      label: "Open Shifts",
      value: openShiftCount,
      helper: scopeName,
      icon: <CalendarMonthIcon />,
      tone: "blue",
    },
    {
      label: "Confirmed Shifts",
      value: confirmedShiftCount,
      helper: "Booked work",
      icon: <ShieldOutlinedIcon />,
      tone: "purple",
    },
    {
      label: "Active Shifts",
      value: allShiftCount,
      helper: "Current staffing work",
      icon: <WorkOutlineIcon />,
      tone: "cyan",
    },
    {
      label: "Unpaid Invoices",
      value: unpaidInvoiceCount,
      helper: unpaidInvoiceTotal,
      icon: <CreditCardIcon />,
      tone: "pink",
    },
  ];

  return (
    <DashboardOverviewTemplate
      title="Owner Dashboard"
      badge={selectedPharmacy ? "Internal workspace" : "Owner workspace"}
      subtitle={
        selectedPharmacy
          ? `Operate ${scopeName}: staffing, roster coverage, shifts and invoices`
          : `Operate ${totalPharmacies} active ${totalPharmacies === 1 ? "pharmacy" : "pharmacies"} from one workspace`
      }
      heroTitle={`Welcome back, ${dashboardGreetingName(user)}!`}
      heroSubtitle={
        selectedPharmacy
          ? `Start with the work needing attention now at ${scopeName}.`
          : "Start with staffing coverage, confirmed commitments and operational exceptions across your pharmacies."
      }
      primaryAction={{
        label: "Post a shift",
        icon: <CalendarMonthIcon />,
        onClick: onPostShift,
      }}
      secondaryAction={{
        label: totalPharmacies > 1 ? "Manage pharmacies" : "Manage pharmacy",
        icon: <StoreIcon />,
        onClick: onOpenManage,
      }}
      pillSummary={
        pillSummary
          ? { balance: pillSummary.balance, shiftPostCost: pillSummary.shift_post_cost }
          : { balance: 0, loading: true }
      }
      onOpenPills={onOpenPills}
      actions={actions}
      upcoming={{
        today: Number(dashboardData?.upcoming_stats?.today ?? 0),
        week: Number(dashboardData?.upcoming_stats?.week ?? dashboardData?.upcoming_shifts_count ?? 0),
        month: Number(dashboardData?.upcoming_stats?.month ?? dashboardData?.upcoming_shifts_count ?? 0),
      }}
      upcomingTitle="Staffing Commitments"
      activity={Array.isArray(dashboardData?.activity) ? dashboardData.activity : []}
      metrics={metrics}
      invoicePanel={{
        title: "Invoices",
        total: dashboardData?.invoice_summary?.total_billed ?? dashboardData?.bills_summary?.total_billed ?? "$0.00",
        totalLabel: selectedPharmacy ? `Invoice value for ${scopeName}` : "Invoice value across your current scope",
        unpaidCount: unpaidInvoiceCount,
        unpaidTotal: unpaidInvoiceTotal,
        buttonLabel: "Review invoices",
        onClick: () => navigate("/dashboard/owner/invoice"),
      }}
      onOpenShifts={onOpenShifts}
      onOpenActivity={onOpenShifts}
    />
  );
}
