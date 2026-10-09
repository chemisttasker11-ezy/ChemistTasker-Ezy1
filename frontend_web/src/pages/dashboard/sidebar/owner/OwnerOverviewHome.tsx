import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Stack,
  Button,
  Chip,
  CircularProgress,
} from "@mui/material";
import StoreIcon from "@mui/icons-material/Store";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ListAltIcon from "@mui/icons-material/ListAlt";
import WorkOutlineIcon from "@mui/icons-material/WorkOutline";
import AppsIcon from "@mui/icons-material/Apps";
import PeopleIcon from "@mui/icons-material/People";
import SettingsIcon from "@mui/icons-material/Settings";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import { alpha } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";
import apiClient from "../../../../utils/apiClient";
import { useAuth } from "../../../../contexts/AuthContext";
import { dashboardGreetingName } from "../../../../utils/displayName";
import RecentActivityDialog from "../../../../components/dashboard/RecentActivityDialog";
import {
  DashboardQuickActionGrid,
  DashboardUpcomingShiftsCard,
  DashboardRecentActivityCard,
  DashboardMetricsGrid,
  dashboardColors as DNA,
} from "../../../../components/dashboard/DashboardOverviewPrimitives";
import type {
  DashboardAction,
  DashboardActivity,
  DashboardMetric,
} from "../../../../components/dashboard/DashboardOverviewPrimitives";

import type { PharmacyDTO } from "./types";

type QuickAction = DashboardAction;
type StatItem = DashboardMetric;
type ActivityItem = DashboardActivity;

export default function OwnerOverviewHome({
  totalPharmacies,
  pharmacies,
  selectedPharmacyId,
  onOpenManage,
  onOpenRoster,
  onOpenShifts,
  onPostShift,
  onOpenProfile,
  onOpenInterests,
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
  onOpenProfile: () => void;
  onOpenInterests: () => void;
  onOpenSettings: () => void;
  onOpenPills: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pillBalance, setPillBalance] = useState<number | null>(null);
  const [shiftPostCost, setShiftPostCost] = useState<number | null>(null);
  const [activityDialogOpen, setActivityDialogOpen] = useState(false);
  const [activityDialogLoading, setActivityDialogLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    apiClient
      .get("/pill-rewards/balance/")
      .then(({ data }) => {
        if (!mounted) return;
        setPillBalance(Number(data?.balance ?? 0));
        setShiftPostCost(Number(data?.shift_post_cost ?? 0));
      })
      .catch(() => {
        if (!mounted) return;
        setPillBalance(0);
        setShiftPostCost(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const selectedPharmacy = useMemo(
    () => pharmacies.find((pharmacy) => Number(pharmacy.id) === Number(selectedPharmacyId)) ?? null,
    [pharmacies, selectedPharmacyId]
  );
  const activePharmacyName = selectedPharmacy?.name || "All pharmacies";
  const todayShifts = Number(dashboardData?.upcoming_stats?.today ?? 0);
  const weekShifts = Number(dashboardData?.upcoming_stats?.week ?? dashboardData?.upcoming_shifts_count ?? 0);
  const monthShifts = Number(dashboardData?.upcoming_stats?.month ?? dashboardData?.upcoming_shifts_count ?? 0);
  const openShiftCount = Number(dashboardData?.shift_summary?.open_count ?? 0);
  const confirmedShiftCount = Number(dashboardData?.shift_summary?.confirmed_count ?? dashboardData?.confirmed_shifts_count ?? 0);
  const allShiftCount = Number(dashboardData?.shift_summary?.all_count ?? dashboardData?.shift_summary?.upcoming_count ?? dashboardData?.upcoming_shifts_count ?? 0);
  const unpaidInvoiceCount = Number(dashboardData?.invoice_summary?.unpaid_count ?? 0);
  const unpaidInvoiceTotal = dashboardData?.invoice_summary?.unpaid_total ?? "$0.00";
  const displayName = dashboardGreetingName(user);

  const quickActions: QuickAction[] = [
    {
      title: totalPharmacies > 1 ? "Manage Pharmacies" : "Manage Pharmacy",
      icon: <StoreIcon />,
      description: totalPharmacies > 1 ? "Create, edit and configure stores" : "Manage staff",
      onClick: onOpenManage,
      tone: "blue",
    },
    {
      title: "Internal Roster",
      description: "Map out internal coverage",
      icon: <CalendarMonthIcon />,
      onClick: onOpenRoster,
      tone: "purple",
    },
    {
      title: "Post Shift",
      description: "Publish an open shift in seconds",
      icon: <ListAltIcon />,
      onClick: onPostShift,
      tone: "pink",
    },
    {
      title: "Shift Centre",
      description: "Upcoming & confirmed shifts",
      icon: <WorkOutlineIcon />,
      onClick: onOpenShifts,
      tone: "cyan",
    },
    {
      title: "Invoices",
      description: "Review received invoices",
      icon: <CreditCardIcon />,
      onClick: () => navigate("/dashboard/owner/invoice"),
      tone: "purple",
    },
    {
      title: "Talent Hub",
      description: "Training & recommended topics",
      icon: <AppsIcon />,
      onClick: onOpenInterests,
      tone: "blue",
    },
    {
      title: "Profile & Verification",
      description: "Manage your organisation profile",
      icon: <PeopleIcon />,
      onClick: onOpenProfile,
      tone: "pink",
    },
    {
      title: "Settings",
      description: "Hours, rates and configurations",
      icon: <SettingsIcon />,
      onClick: onOpenSettings,
      tone: "purple",
      wide: true,
    },
  ];

  const stats: StatItem[] = [
    { label: "Open Shifts", value: openShiftCount, helper: activePharmacyName, icon: <CalendarMonthIcon />, tone: "blue" },
    { label: "Confirmed Shifts", value: confirmedShiftCount, helper: "Booked work", icon: <ShieldOutlinedIcon />, tone: "purple" },
    { label: "Count of Shifts", value: allShiftCount, helper: "Active shift records", icon: <WorkOutlineIcon />, tone: "cyan" },
    { label: "Unpaid Invoices", value: unpaidInvoiceCount, helper: unpaidInvoiceTotal, icon: <CreditCardIcon />, tone: "pink" },
  ];

  const realActivity: ActivityItem[] = Array.isArray(dashboardData?.activity)
    ? dashboardData.activity.map((event: any) => ({
        title: event.title,
        description: event.description,
        time: event.time,
        kind: event.kind,
        target_id: event.target_id,
        action_url: event.action_url,
      }))
    : [];
  const activityItems: ActivityItem[] = realActivity;
  const handleActivityClick = (event: ActivityItem) => {
    const actionUrl = event.actionUrl || event.action_url;
    if (actionUrl) {
      navigate(actionUrl);
    }
  };
  const handleOpenActivity = () => {
    setActivityDialogLoading(true);
    setActivityDialogOpen(true);
    window.setTimeout(() => setActivityDialogLoading(false), 250);
  };

  return (
    <Box
      sx={{
        width: "100%",
        mx: "auto",
        maxWidth: 1660,
        py: { xs: 1.5, md: 3 },
        color: DNA.ink,
        fontFamily: '"DM Sans Variable", "DM Sans", "Barlow", Arial, sans-serif',
        display: "flex",
        flexDirection: "column",
        gap: { xs: 2, md: 3.5 },
      }}
    >
      <Box>
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
          <Typography sx={{ fontSize: { xs: 26, md: 34 }, lineHeight: 1.08, fontWeight: 950, color: DNA.ink, overflowWrap: "anywhere" }}>
            Owner Dashboard
          </Typography>
          <Chip
            label={selectedPharmacy ? "Internal workspace" : "Public platform"}
            size="small"
            sx={{
              bgcolor: "#EAF2FF",
              color: "#063BDA",
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: ".05em",
            }}
          />
        </Stack>
        <Typography sx={{ mt: 1.25, color: DNA.muted, fontSize: { xs: 15, md: 17 }, fontWeight: 700, lineHeight: 1.45, overflowWrap: "anywhere" }}>
          Manage {totalPharmacies} active {totalPharmacies === 1 ? "pharmacy" : "pharmacies"}, teams and operations
        </Typography>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1fr) 388px" },
          gap: { xs: 2, md: 3 },
          alignItems: "start",
          minWidth: 0,
        }}
      >
        <Stack spacing={{ xs: 2, md: 3 }} sx={{ minWidth: 0 }}>
          <Paper
        sx={{
          p: { xs: 2, sm: 3, md: 4 },
          minHeight: { xs: "auto", md: 290 },
          borderRadius: { xs: "18px", md: "22px" },
          backgroundImage: "linear-gradient(135deg, #143EEA 0%, #2429B8 45%, #8B1CF6 72%, #D20DAE 100%)",
          color: "#fff",
          overflow: "hidden",
          position: "relative",
          boxShadow: "0 22px 54px rgba(6, 26, 61, 0.12)",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            backgroundImage: [
              `radial-gradient(circle at 64% 98%, ${alpha("#8FE8FF", 0.14)} 0 110px, transparent 111px)`,
              `radial-gradient(circle at 72% 96%, ${alpha("#6FE7DD", 0.16)} 0 190px, transparent 191px)`,
              `radial-gradient(circle at 66% 96%, ${alpha("#ffffff", 0.12)} 0 275px, transparent 276px)`,
              `linear-gradient(100deg, transparent 0 78%, ${alpha("#D20DAE", 0.75)} 78% 100%)`,
            ].join(", "),
            pointerEvents: "none",
          }}
        />
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={{ xs: 2.25, md: 5 }}
          alignItems={{ xs: "stretch", md: "center" }}
          justifyContent="space-between"
          sx={{ position: "relative", zIndex: 1, minWidth: 0 }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h4" fontWeight={950} gutterBottom sx={{ fontSize: { xs: 28, sm: 38, md: 50 }, lineHeight: 1.08, overflowWrap: "anywhere" }}>
              Welcome back, {displayName}!
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.96, maxWidth: 620, fontWeight: 800, fontSize: { xs: 15, md: 18 }, lineHeight: 1.45, overflowWrap: "anywhere" }}>
              Here's what's happening across your pharmacies today.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ mt: { xs: 2, md: 3 }, "& > *": { width: { xs: "100%", sm: "auto" } } }}>
              <Button
                variant="contained"
                color="inherit"
                startIcon={<CalendarMonthIcon />}
                onClick={onPostShift}
                sx={{ color: "#063BDA", borderRadius: "12px", fontWeight: 950, minHeight: { xs: 48, md: 56 }, px: { xs: 2, md: 3 }, justifyContent: "center" }}
              >
                Post a shift
              </Button>
              <Button
                variant="outlined"
                color="inherit"
                startIcon={<StoreIcon />}
                onClick={onOpenManage}
                sx={{ borderColor: alpha("#ffffff", 0.34), color: "#fff", borderRadius: "12px", fontWeight: 950, minHeight: { xs: 48, md: 56 }, px: { xs: 2, md: 3 }, justifyContent: "center", bgcolor: alpha("#ffffff", 0.08) }}
              >
                Manage pharmacies
              </Button>
            </Stack>
          </Box>
          <Stack
            role="button"
            onClick={onOpenPills}
            direction="row"
            spacing={2}
            alignItems="center"
            sx={{
              position: "relative",
              zIndex: 1,
              width: { xs: "100%", md: "auto" },
              minWidth: { xs: 0, md: 320 },
              p: { xs: 1.5, md: 2.5 },
              borderRadius: { xs: "16px", md: "24px" },
              cursor: "pointer",
              bgcolor: alpha("#ffffff", 0.13),
              border: `1px solid ${alpha("#ffffff", 0.26)}`,
              boxShadow: `inset 0 1px 0 ${alpha("#ffffff", 0.18)}`,
              transition: "transform 0.18s ease, background-color 0.18s ease",
              "&:hover": {
                transform: "translateY(-2px)",
                bgcolor: alpha("#ffffff", 0.22),
              },
            }}
          >
            <Box
              component="img"
              src="/images/drugs.png"
              alt=""
              sx={{
                width: { xs: 58, sm: 78, md: 98 },
                height: { xs: 58, sm: 78, md: 98 },
                objectFit: "contain",
                flexShrink: 0,
                filter: `contrast(1.08) saturate(1.08) drop-shadow(0 14px 22px ${alpha("#111827", 0.26)})`,
              }}
            />
            <Stack spacing={0.75} sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ textTransform: "uppercase", letterSpacing: ".08em", opacity: 0.72 }}>
                Pill balance
              </Typography>
              <Stack direction="row" spacing={1} alignItems="baseline">
                {pillBalance == null ? (
                  <CircularProgress size={22} sx={{ color: "#fff" }} />
                ) : (
                <Typography sx={{ fontSize: { xs: 34, md: 58 }, fontWeight: 950, lineHeight: 1 }}>
                    {pillBalance}
                  </Typography>
                )}
                <Typography variant="body2" sx={{ opacity: 0.9, fontWeight: 900, fontSize: { xs: 15, md: 18 } }}>
                  pills
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip
                  size="small"
                  label={shiftPostCost != null ? `${shiftPostCost} pills per shift post` : "Custom rates"}
                  sx={{ maxWidth: "100%", bgcolor: alpha("#ffffff", 0.18), color: "#fff", fontWeight: 800, "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" } }}
                />
                <Chip size="small" label="View activity" sx={{ maxWidth: "100%", bgcolor: alpha("#ffffff", 0.18), color: "#fff", fontWeight: 800 }} />
              </Stack>
            </Stack>
          </Stack>
        </Stack>
      </Paper>

          <DashboardQuickActionGrid actions={quickActions} />
        </Stack>

        <Stack spacing={{ xs: 2.5, md: 3 }}>
          <DashboardUpcomingShiftsCard
            counts={{ today: todayShifts, week: weekShifts, month: monthShifts }}
            onViewShifts={onOpenShifts}
          />
          <DashboardRecentActivityCard activity={activityItems} onActivityClick={handleActivityClick} onViewAll={handleOpenActivity} />
        </Stack>
      </Box>

      <DashboardMetricsGrid
        metrics={stats.map((item) => ({
          ...item,
          onClick: item.label === "Unpaid Invoices" ? () => navigate("/dashboard/owner/invoice") : undefined,
        }))}
      />
      <RecentActivityDialog
        open={activityDialogOpen}
        onClose={() => setActivityDialogOpen(false)}
        activity={activityItems}
        loading={activityDialogLoading}
        onActivityClick={handleActivityClick}
      />
    </Box>
  );
}
