import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Stack,
  Button,
  ButtonBase,
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
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ForumIcon from "@mui/icons-material/Forum";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { alpha } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";
import apiClient from "../../../../utils/apiClient";
import { useAuth } from "../../../../contexts/AuthContext";
import { dashboardGreetingName } from "../../../../utils/displayName";
import RecentActivityDialog from "../../../../components/dashboard/RecentActivityDialog";
import type { PharmacyDTO } from "./types";

const DNA = {
  ink: "#06123A",
  muted: "#5E6B8D",
  line: "#E5ECF7",
  blue: "#063BDA",
  violet: "#6D28D9",
  magenta: "#EA0A8E",
  cyan: "#08BEEA",
};

type QuickAction = {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone: "blue" | "purple" | "pink" | "cyan";
  wide?: boolean;
};

type StatItem = {
  label: string;
  value: string | number;
  helper: string;
  icon: React.ReactNode;
  tone: "blue" | "purple" | "pink" | "cyan";
};

type ActivityItem = {
  title: string;
  description: string;
  time: string;
  icon?: React.ReactNode;
  color?: string;
  kind?: string;
  target_id?: number | string;
  targetId?: number | string;
  action_url?: string;
  actionUrl?: string;
};

const toneStyles = {
  blue: { bg: "#E7F0FF", color: "#063BDA", link: "#063BDA" },
  purple: { bg: "#EFE7FF", color: "#6D28D9", link: "#4C0DDE" },
  pink: { bg: "#FDE7F5", color: "#EA0A8E", link: "#EA0A8E" },
  cyan: { bg: "#DDFBFF", color: "#008EA6", link: "#063BDA" },
};

function activityIcon(event: ActivityItem) {
  if (event.icon) return event.icon;
  if (event.kind === "hub") return <ForumIcon />;
  if (event.kind === "reveal") return <VisibilityIcon />;
  if (event.kind === "confirmed") return <ShieldOutlinedIcon />;
  if (event.kind === "invoice") return <CreditCardIcon />;
  if (event.kind === "pharmacy") return <StoreIcon />;
  return <CalendarMonthIcon />;
}

function activityColor(event: ActivityItem) {
  if (event.color) return event.color;
  if (event.kind === "hub") return "#063BDA";
  if (event.kind === "reveal") return "#EA0A8E";
  if (event.kind === "confirmed") return "#00C853";
  if (event.kind === "invoice") return "#FF5A00";
  return "#5B18E8";
}

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
      .get("/client-profile/pill-rewards/balance/")
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

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" },
              gap: { xs: 1.5, md: 2.5 },
              minWidth: 0,
            }}
          >
            {quickActions.map((action) => {
              const tone = toneStyles[action.tone];
              return (
                <Paper
                  key={action.title}
                  role="button"
                  onClick={action.onClick}
                  sx={{
                    minHeight: { xs: 132, md: 196 },
                    gridColumn: { lg: action.wide ? "span 2" : "span 1" },
                    borderRadius: { xs: "16px", md: "20px" },
                    bgcolor: "#FFFFFF",
                    border: `1px solid ${DNA.line}`,
                    boxShadow: "0 8px 24px rgba(6, 18, 58, 0.06)",
                    transition: "all 0.2s ease",
                    cursor: "pointer",
                    p: { xs: 2, md: 3 },
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    "&:hover": {
                      transform: { xs: "none", md: "translateY(-4px)" },
                      boxShadow: "0 18px 42px rgba(6, 18, 58, 0.12)",
                    },
                  }}
                >
                  <Stack direction="row" spacing={{ xs: 1.75, md: 2.75 }} alignItems="flex-start" sx={{ minWidth: 0, width: "100%" }}>
                    <Box
                      sx={{
                        width: { xs: 52, md: 64 },
                        height: { xs: 52, md: 64 },
                        borderRadius: { xs: "15px", md: "18px" },
                        bgcolor: tone.bg,
                        color: tone.color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        "& svg": { fontSize: { xs: 28, md: 34 } },
                      }}
                    >
                      {action.icon}
                    </Box>
                    <Stack spacing={{ xs: 0.75, md: 1.15 }} sx={{ minWidth: 0, flex: 1 }}>
                      <Typography fontWeight={950} color={DNA.ink} sx={{ fontSize: { xs: 20, md: 22 }, lineHeight: 1.12, overflowWrap: "anywhere" }}>
                        {action.title}
                      </Typography>
                      <Typography variant="body2" sx={{ color: DNA.muted, fontWeight: 800, fontSize: { xs: 15, md: 16 }, lineHeight: 1.32, maxWidth: action.wide ? 360 : { xs: "none", md: 220 }, overflowWrap: "anywhere" }}>
                        {action.description}
                      </Typography>
                    </Stack>
                  </Stack>
                </Paper>
              );
            })}
          </Box>
        </Stack>

        <Stack spacing={{ xs: 2.5, md: 3 }}>
          <Paper sx={{ borderRadius: "22px", border: `1px solid ${DNA.line}`, bgcolor: "#fff", p: { xs: 2.5, md: 3.5 }, boxShadow: "0 8px 24px rgba(6, 18, 58, 0.06)" }}>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
              <CalendarMonthIcon sx={{ color: DNA.violet, fontSize: 30 }} />
              <Typography sx={{ fontSize: 24, fontWeight: 950, color: DNA.ink }}>Upcoming Shifts</Typography>
            </Stack>
            <Stack divider={<Box sx={{ height: "1px", bgcolor: DNA.line }} />}>
              {[
                ["Today", todayShifts],
                ["This Week", weekShifts],
                ["This Month", monthShifts],
              ].map(([label, value]) => (
                <Stack key={label} direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 1.8 }}>
                  <Typography sx={{ color: DNA.muted, fontWeight: 800, fontSize: 16 }}>{label}</Typography>
                  <Typography sx={{ color: "#5B18E8", fontWeight: 950, fontSize: 30, lineHeight: 1 }}>{value}</Typography>
                </Stack>
              ))}
            </Stack>
            <Button onClick={onOpenShifts} endIcon={<ArrowForwardIcon />} sx={{ mt: 2, px: 0, color: "#4C0DDE", fontWeight: 950 }}>
              View all shifts
            </Button>
          </Paper>

          <Paper sx={{ borderRadius: "22px", border: `1px solid ${DNA.line}`, bgcolor: "#fff", p: { xs: 2.5, md: 3.5 }, boxShadow: "0 8px 24px rgba(6, 18, 58, 0.06)" }}>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2.5 }}>
              <FavoriteBorderIcon sx={{ color: "#5B18E8", fontSize: 30 }} />
              <Typography sx={{ fontSize: 24, fontWeight: 950, color: DNA.ink }}>Recent Activity</Typography>
            </Stack>
            <Stack divider={<Box sx={{ height: "1px", bgcolor: DNA.line }} />}>
              {activityItems.length === 0 ? (
                <Typography variant="body2" sx={{ color: DNA.muted, fontWeight: 700 }}>
                  No recent activity yet.
                </Typography>
              ) : activityItems.map((event) => {
                const actionUrl = event.actionUrl || event.action_url;
                return (
                <ButtonBase
                  key={`${event.kind || "activity"}-${event.targetId || event.target_id || event.title}-${event.time}`}
                  onClick={() => handleActivityClick(event)}
                  disabled={!actionUrl}
                  sx={{
                    width: "100%",
                    display: "block",
                    textAlign: "left",
                    borderRadius: 1,
                    cursor: actionUrl ? "pointer" : "default",
                    "&:hover": actionUrl ? { bgcolor: alpha("#5B18E8", 0.05) } : undefined,
                  }}
                >
                <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ py: 1.8, px: 0.75 }}>
                  <Box sx={{ color: activityColor(event), width: 24, pt: 0.25, "& svg": { fontSize: 24 } }}>{activityIcon(event)}</Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ color: DNA.ink, fontWeight: 950, fontSize: 14 }}>{event.title}</Typography>
                    <Typography noWrap sx={{ color: DNA.muted, fontWeight: 700, fontSize: 13 }}>{event.description}</Typography>
                  </Box>
                  <Typography sx={{ color: "#7A86A3", fontWeight: 800, fontSize: 12, whiteSpace: "nowrap" }}>{event.time}</Typography>
                </Stack>
                </ButtonBase>
              )})}
            </Stack>
            <Button onClick={handleOpenActivity} endIcon={<ArrowForwardIcon />} sx={{ mt: 2, px: 0, color: "#4C0DDE", fontWeight: 950 }}>
              View all activity
            </Button>
          </Paper>
        </Stack>
      </Box>

      <Paper
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", xl: "repeat(4, minmax(0, 1fr))" },
          overflow: "hidden",
          borderRadius: { xs: "16px", md: "20px" },
          bgcolor: "#FFFFFF",
          border: `1px solid ${DNA.line}`,
          boxShadow: "0 8px 24px rgba(6, 18, 58, 0.06)",
        }}
      >
        {stats.map((item, index) => {
          const tone = toneStyles[item.tone];
          return (
            <Box
              key={item.label}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: { xs: 1.5, md: 2.25 },
                minHeight: { xs: 104, md: 132 },
                px: { xs: 2, md: 4 },
                py: { xs: 2, md: 2.5 },
                borderLeft: { xl: index === 0 ? "none" : `1px solid ${DNA.line}` },
                borderTop: { xs: index === 0 ? "none" : `1px solid ${DNA.line}`, sm: index < 2 ? "none" : `1px solid ${DNA.line}`, xl: "none" },
              }}
            >
              <Box
                sx={{
                  width: { xs: 54, md: 66 },
                  height: { xs: 54, md: 66 },
                  borderRadius: { xs: "15px", md: "18px" },
                  bgcolor: tone.bg,
                  color: tone.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  "& svg": { fontSize: { xs: 30, md: 36 } },
                }}
              >
                {item.icon}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ color: DNA.muted, fontWeight: 800, fontSize: 14 }}>{item.label}</Typography>
                <Typography sx={{ color: DNA.ink, fontWeight: 950, fontSize: { xs: 21, md: 24 }, lineHeight: 1.18, overflowWrap: "anywhere" }}>
                  {item.value}
                </Typography>
                <Typography sx={{ color: DNA.muted, fontWeight: 700, fontSize: 13, mt: 0.5, overflowWrap: "anywhere" }}>{item.helper}</Typography>
              </Box>
            </Box>
          );
        })}
      </Paper>
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
