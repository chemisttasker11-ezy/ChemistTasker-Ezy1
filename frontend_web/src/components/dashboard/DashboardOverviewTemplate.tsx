import React, { useState } from "react";
import {
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";
import RecentActivityDialog from "./RecentActivityDialog";
import {
  DashboardQuickActionGrid,
  DashboardUpcomingShiftsCard,
  DashboardRecentActivityCard,
  DashboardMetricsGrid,
  dashboardColors as DNA,
} from "./DashboardOverviewPrimitives";
import type {
  DashboardAction,
  DashboardActivity,
  DashboardMetric,
  DashboardUpcomingStat,
} from "./DashboardOverviewPrimitives";
export type { DashboardAction, DashboardActivity, DashboardMetric, DashboardTone } from "./DashboardOverviewPrimitives";


type PillSummary = {
  balance: number;
  shiftPostCost?: number | null;
  loading?: boolean;
};

type UpcomingStat = DashboardUpcomingStat;

type DashboardInvoicePanel = {
  title: string;
  total: string;
  totalLabel: string;
  unpaidCount: string | number;
  unpaidTotal: string;
  buttonLabel: string;
  onClick: () => void;
};

export default function DashboardOverviewTemplate({
  title,
  badge,
  subtitle,
  heroTitle,
  heroSubtitle,
  primaryAction,
  secondaryAction,
  pillSummary,
  actions,
  upcoming,
  upcomingTitle = "Upcoming Shifts",
  activity = [],
  metrics,
  invoicePanel,
  onOpenShifts,
  onOpenActivity,
}: {
  title: string;
  badge: string;
  subtitle: string;
  heroTitle: string;
  heroSubtitle: string;
  primaryAction: { label: string; icon?: React.ReactNode; onClick: () => void };
  secondaryAction?: { label: string; icon?: React.ReactNode; onClick: () => void };
  pillSummary?: PillSummary;
  actions: DashboardAction[];
  upcoming: UpcomingStat;
  upcomingTitle?: string;
  activity?: DashboardActivity[];
  metrics: DashboardMetric[];
  invoicePanel?: DashboardInvoicePanel;
  onOpenShifts: () => void;
  onOpenActivity?: () => void;
}) {
  const navigate = useNavigate();
  const [activityDialogOpen, setActivityDialogOpen] = useState(false);
  const [activityDialogLoading, setActivityDialogLoading] = useState(false);
  const handleActivityClick = (event: DashboardActivity) => {
    const url = event.actionUrl || event.action_url;
    if (url) {
      navigate(url);
    }
  };
  const handleOpenActivity = () => {
    onOpenActivity?.();
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
            {title}
          </Typography>
          <Chip
            label={badge}
            size="small"
            sx={{
              bgcolor: "#EAF2FF",
              color: DNA.blue,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: ".05em",
            }}
          />
        </Stack>
        <Typography sx={{ mt: 1.25, color: DNA.muted, fontSize: { xs: 15, md: 17 }, fontWeight: 700, lineHeight: 1.45, overflowWrap: "anywhere" }}>
          {subtitle}
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
            <Stack direction={{ xs: "column", md: "row" }} spacing={{ xs: 2.25, md: 5 }} alignItems={{ xs: "stretch", md: "center" }} justifyContent="space-between" sx={{ position: "relative", zIndex: 1, minWidth: 0 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h4" fontWeight={950} gutterBottom sx={{ fontSize: { xs: 28, sm: 38, md: 50 }, lineHeight: 1.08, overflowWrap: "anywhere" }}>
                  {heroTitle}
                </Typography>
                <Typography variant="body1" sx={{ opacity: 0.96, maxWidth: 620, fontWeight: 800, fontSize: { xs: 15, md: 18 }, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                  {heroSubtitle}
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ mt: { xs: 2, md: 3 }, "& > *": { width: { xs: "100%", sm: "auto" } } }}>
                  <Button variant="contained" color="inherit" startIcon={primaryAction.icon} onClick={primaryAction.onClick} sx={{ color: DNA.blue, borderRadius: "12px", fontWeight: 950, minHeight: { xs: 48, md: 56 }, px: { xs: 2, md: 3 }, justifyContent: "center" }}>
                    {primaryAction.label}
                  </Button>
                  {secondaryAction && (
                    <Button variant="outlined" color="inherit" startIcon={secondaryAction.icon} onClick={secondaryAction.onClick} sx={{ borderColor: alpha("#ffffff", 0.34), color: "#fff", borderRadius: "12px", fontWeight: 950, minHeight: { xs: 48, md: 56 }, px: { xs: 2, md: 3 }, justifyContent: "center", bgcolor: alpha("#ffffff", 0.08) }}>
                      {secondaryAction.label}
                    </Button>
                  )}
                </Stack>
              </Box>
              {pillSummary && (
                <Stack role="button" direction="row" spacing={1.5} alignItems="center" sx={{ width: { xs: "100%", md: "auto" }, minWidth: { xs: 0, md: 320 }, p: { xs: 1.5, md: 2.5 }, borderRadius: { xs: "16px", md: "24px" }, bgcolor: alpha("#ffffff", 0.13), border: `1px solid ${alpha("#ffffff", 0.26)}`, boxShadow: `inset 0 1px 0 ${alpha("#ffffff", 0.18)}` }}>
                  <Box component="img" src="/images/drugs.png" alt="" sx={{ width: { xs: 58, sm: 78, md: 98 }, height: { xs: 58, sm: 78, md: 98 }, objectFit: "contain", flexShrink: 0, filter: `contrast(1.08) saturate(1.08) drop-shadow(0 14px 22px ${alpha("#111827", 0.26)})` }} />
                  <Stack spacing={0.75} sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ textTransform: "uppercase", letterSpacing: ".08em", opacity: 0.72, fontSize: { xs: 12, md: 14 } }}>Pill balance</Typography>
                    <Stack direction="row" spacing={1} alignItems="baseline">
                      {pillSummary.loading ? <CircularProgress size={22} sx={{ color: "#fff" }} /> : <Typography sx={{ fontSize: { xs: 34, md: 58 }, fontWeight: 950, lineHeight: 1 }}>{pillSummary.balance}</Typography>}
                      <Typography variant="body2" sx={{ opacity: 0.9, fontWeight: 900, fontSize: { xs: 15, md: 18 } }}>pills</Typography>
                    </Stack>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip size="small" label={pillSummary.shiftPostCost != null ? `${pillSummary.shiftPostCost} pills per shift post` : "Custom rates"} sx={{ maxWidth: "100%", bgcolor: alpha("#ffffff", 0.18), color: "#fff", fontWeight: 800, "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" } }} />
                      <Chip size="small" label="View activity" sx={{ maxWidth: "100%", bgcolor: alpha("#ffffff", 0.18), color: "#fff", fontWeight: 800 }} />
                    </Stack>
                  </Stack>
                </Stack>
              )}
            </Stack>
          </Paper>

          <DashboardQuickActionGrid actions={actions} />
        </Stack>

        <Stack spacing={{ xs: 2.5, md: 3 }}>
          <DashboardUpcomingShiftsCard counts={upcoming} title={upcomingTitle} onViewShifts={onOpenShifts} />
          <DashboardRecentActivityCard activity={activity} onActivityClick={handleActivityClick} onViewAll={handleOpenActivity} />

          {invoicePanel && (
            <Paper
              sx={{
                position: "relative",
                overflow: "hidden",
                borderRadius: "22px",
                p: { xs: 2.5, md: 3 },
                color: "#fff",
                background: "linear-gradient(100deg, #267DB8 0%, #433894 58%, #9A087D 100%)",
                boxShadow: "0 10px 28px rgba(37, 99, 235, 0.18)",
              }}
            >
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: [
                    `linear-gradient(64deg, ${alpha("#ffffff", 0.12)} 0 22%, transparent 22% 100%)`,
                    `linear-gradient(118deg, transparent 0 86%, ${alpha("#ffffff", 0.08)} 86% 100%)`,
                  ].join(", "),
                  pointerEvents: "none",
                }}
              />
              <Stack
                direction={{ xs: "column", sm: "row" }}
                alignItems={{ xs: "flex-start", sm: "center" }}
                justifyContent="space-between"
                spacing={2}
                sx={{ position: "relative", zIndex: 1 }}
              >
                <Box>
                  <Typography sx={{ textTransform: "uppercase", letterSpacing: ".08em", opacity: 0.72, fontSize: 13, fontWeight: 800, mb: 1 }}>
                    {invoicePanel.title}
                  </Typography>
                  <Typography sx={{ fontSize: { xs: 30, md: 38 }, fontWeight: 950, lineHeight: 1.08 }}>
                    {invoicePanel.total}
                  </Typography>
                  <Typography sx={{ opacity: 0.84, fontSize: 14, fontWeight: 700, mt: 0.5 }}>
                    {invoicePanel.totalLabel}
                  </Typography>
                  <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
                    <Box sx={{ minWidth: 128, px: 1.5, py: 1.1, borderRadius: "16px", bgcolor: alpha("#ffffff", 0.13), border: `1px solid ${alpha("#ffffff", 0.2)}` }}>
                      <Typography sx={{ fontSize: 24, fontWeight: 950, lineHeight: 1 }}>{invoicePanel.unpaidCount}</Typography>
                      <Typography sx={{ fontSize: 12, opacity: 0.76, fontWeight: 700, mt: 0.4 }}>Unpaid invoices</Typography>
                    </Box>
                    <Box sx={{ minWidth: 128, px: 1.5, py: 1.1, borderRadius: "16px", bgcolor: alpha("#ffffff", 0.13), border: `1px solid ${alpha("#ffffff", 0.2)}` }}>
                      <Typography sx={{ fontSize: 24, fontWeight: 950, lineHeight: 1 }}>{invoicePanel.unpaidTotal}</Typography>
                      <Typography sx={{ fontSize: 12, opacity: 0.76, fontWeight: 700, mt: 0.4 }}>Unpaid total</Typography>
                    </Box>
                  </Stack>
                </Box>
                <Button
                  variant="outlined"
                  onClick={invoicePanel.onClick}
                  sx={{
                    alignSelf: { xs: "flex-start", sm: "center" },
                    borderRadius: "999px",
                    px: 2.25,
                    py: 0.8,
                    color: "#fff",
                    borderColor: alpha("#ffffff", 0.28),
                    bgcolor: alpha("#ffffff", 0.12),
                    fontWeight: 900,
                    textTransform: "none",
                  }}
                >
                  {invoicePanel.buttonLabel}
                </Button>
              </Stack>
            </Paper>
          )}
        </Stack>
      </Box>

      <DashboardMetricsGrid metrics={metrics} />
      <RecentActivityDialog
        open={activityDialogOpen}
        onClose={() => setActivityDialogOpen(false)}
        activity={activity}
        loading={activityDialogLoading}
        onActivityClick={handleActivityClick}
      />
    </Box>
  );
}
