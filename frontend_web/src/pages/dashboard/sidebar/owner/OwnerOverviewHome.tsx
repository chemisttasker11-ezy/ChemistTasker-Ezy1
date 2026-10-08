import { useEffect, useMemo, useState } from "react";
import { Box, Button, Paper, Stack, Typography, Skeleton } from "@mui/material";
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
      title: "Review roster",
      description: "Check team coverage and upcoming shifts",
      icon: <CalendarMonthIcon />,
      onClick: onOpenRoster,
      tone: "purple",
    },
    {
      title: "Post a shift",
      description: "Arrange cover where it is needed",
      icon: <ListAltIcon />,
      onClick: onPostShift,
      tone: "pink",
    },
    {
      title: "Manage shift responses",
      description: "Review active shifts and staffing responses",
      icon: <WorkOutlineIcon />,
      onClick: onOpenShifts,
      tone: "cyan",
    },
    {
      title: "Workforce controls",
      description: "Attendance and payroll settings",
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

  const hasDashboardData = Boolean(dashboardData?.shift_summary);
  const focusItems = [
    {
      title: "Shifts needing cover",
      value: openShiftCount,
      detail: "Open shifts across the selected scope",
      action: onOpenShifts,
      actionLabel: "Review open shifts",
      tone: "#5222B8",
    },
    {
      title: "Coverage confirmed",
      value: confirmedShiftCount,
      detail: "Confirmed staffing commitments",
      action: onOpenRoster,
      actionLabel: "View roster",
      tone: "#075B75",
    },
    {
      title: "Invoices to review",
      value: unpaidInvoiceCount,
      detail: unpaidInvoiceTotal + " outstanding",
      action: () => navigate("/dashboard/owner/invoice"),
      actionLabel: "Review invoices",
      tone: "#8A2765",
    },
  ];

  return (
    <Stack spacing={2.5}>
      <Box component="section" aria-label="Owner operational snapshot">
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "end" }} gap={1} sx={{ mb: 1.5 }}>
          <Box>
            <Typography component="h2" sx={{ color: "#06123A", fontSize: 23, fontWeight: 800, lineHeight: 1.25 }}>What needs attention</Typography>
            <Typography sx={{ color: "#445474", fontSize: 14, mt: 0.5 }}>Live snapshot for {scopeName}. Select a panel to act.</Typography>
          </Box>
          <Typography sx={{ color: "#52617C", fontSize: 12, fontWeight: 700 }}>{selectedPharmacy ? "Selected pharmacy" : "Current owner scope"}</Typography>
        </Stack>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0,1fr))" }, gap: 1.5 }}>
          {focusItems.map((item) => (
            <Paper key={item.title} variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 2.5, borderColor: "#DCE4F0", boxShadow: "none" }}>
              <Typography sx={{ color: "#344563", fontSize: 13, fontWeight: 750 }}>{item.title}</Typography>
              {hasDashboardData ? (
                <Typography sx={{ color: item.tone, fontSize: 32, lineHeight: 1.35, fontWeight: 850, fontVariantNumeric: "tabular-nums" }}>{item.value}</Typography>
              ) : (
                <Skeleton width={75} height={44} aria-label="Loading operational snapshot" />
              )}
              <Typography sx={{ color: "#52617C", fontSize: 13, mb: 1.5 }}>{hasDashboardData ? item.detail : "Waiting for current data"}</Typography>
              <Button size="small" onClick={item.action} sx={{ px: 0, textTransform: "none", fontWeight: 800, justifyContent: "flex-start", minHeight: 44 }}>
                {item.actionLabel}
              </Button>
            </Paper>
          ))}
        </Box>
      </Box>
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
    </Stack>
  );
}
