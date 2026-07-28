import React from "react";
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
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import ForumIcon from "@mui/icons-material/Forum";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import StoreIcon from "@mui/icons-material/Store";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { alpha } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";

const DNA = {
  ink: "#06123A",
  muted: "#5E6B8D",
  line: "#E5ECF7",
  blue: "#063BDA",
  violet: "#6D28D9",
  magenta: "#EA0A8E",
};

export type DashboardTone = "blue" | "purple" | "pink" | "cyan";

export type DashboardAction = {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone: DashboardTone;
  wide?: boolean;
};

export type DashboardMetric = {
  label: string;
  value: string | number;
  helper: string;
  icon: React.ReactNode;
  tone: DashboardTone;
};

export type DashboardActivity = {
  title: string;
  description: string;
  time: string;
  icon?: React.ReactNode;
  color?: string;
  kind?: "shift" | "hub" | "reveal" | "confirmed" | "pharmacy" | "invoice" | string;
  target_id?: number | string;
  targetId?: number | string;
  target_type?: string;
  targetType?: string;
  action_url?: string;
  actionUrl?: string;
};

type PillSummary = {
  balance: number;
  shiftPostCost?: number | null;
  loading?: boolean;
};

type UpcomingStat = {
  today: number;
  week: number;
  month: number;
};

type DashboardInvoicePanel = {
  title: string;
  total: string;
  totalLabel: string;
  unpaidCount: string | number;
  unpaidTotal: string;
  buttonLabel: string;
  onClick: () => void;
};

const toneStyles: Record<DashboardTone, { bg: string; color: string; link: string }> = {
  blue: { bg: "#E7F0FF", color: "#063BDA", link: "#063BDA" },
  purple: { bg: "#EFE7FF", color: "#6D28D9", link: "#4C0DDE" },
  pink: { bg: "#FDE7F5", color: "#EA0A8E", link: "#EA0A8E" },
  cyan: { bg: "#DDFBFF", color: "#008EA6", link: "#063BDA" },
};

function activityIcon(event: DashboardActivity) {
  if (event.icon) return event.icon;
  if (event.kind === "hub") return <ForumIcon />;
  if (event.kind === "reveal") return <VisibilityIcon />;
  if (event.kind === "confirmed") return <ShieldOutlinedIcon />;
  if (event.kind === "pharmacy") return <StoreIcon />;
  if (event.kind === "invoice") return <CreditCardIcon />;
  return <CalendarMonthIcon />;
}

function activityColor(event: DashboardActivity) {
  if (event.color) return event.color;
  if (event.kind === "hub") return "#063BDA";
  if (event.kind === "reveal") return "#EA0A8E";
  if (event.kind === "confirmed") return "#00C853";
  if (event.kind === "pharmacy") return "#5B18E8";
  if (event.kind === "invoice") return "#FF5A00";
  return "#5B18E8";
}

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
  const handleActivityClick = (event: DashboardActivity) => {
    const url = event.actionUrl || event.action_url;
    if (url) {
      navigate(url);
    }
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

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" }, gap: { xs: 1.5, md: 2.5 }, minWidth: 0 }}>
            {actions.map((action) => {
              const tone = toneStyles[action.tone];
              return (
                <Paper key={action.title} role="button" onClick={action.onClick} sx={{ minHeight: { xs: 132, md: 196 }, gridColumn: { lg: action.wide ? "span 2" : "span 1" }, borderRadius: { xs: "16px", md: "20px" }, bgcolor: "#FFFFFF", border: `1px solid ${DNA.line}`, boxShadow: "0 8px 24px rgba(6, 18, 58, 0.06)", transition: "all 0.2s ease", cursor: "pointer", p: { xs: 2, md: 3 }, display: "flex", flexDirection: "column", justifyContent: "center", "&:hover": { transform: { xs: "none", md: "translateY(-4px)" }, boxShadow: "0 18px 42px rgba(6, 18, 58, 0.12)" } }}>
                  <Stack direction="row" spacing={{ xs: 1.75, md: 2.75 }} alignItems="flex-start" sx={{ minWidth: 0, width: "100%" }}>
                    <Box sx={{ width: { xs: 52, md: 64 }, height: { xs: 52, md: 64 }, borderRadius: { xs: "15px", md: "18px" }, bgcolor: tone.bg, color: tone.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, "& svg": { fontSize: { xs: 28, md: 34 } } }}>
                      {action.icon}
                    </Box>
                    <Stack spacing={{ xs: 0.75, md: 1.15 }} sx={{ minWidth: 0, flex: 1 }}>
                      <Typography fontWeight={950} color={DNA.ink} sx={{ fontSize: { xs: 20, md: 22 }, lineHeight: 1.12, overflowWrap: "anywhere" }}>{action.title}</Typography>
                      <Typography variant="body2" sx={{ color: DNA.muted, fontWeight: 800, fontSize: { xs: 15, md: 16 }, lineHeight: 1.32, maxWidth: action.wide ? 360 : { xs: "none", md: 220 }, overflowWrap: "anywhere" }}>{action.description}</Typography>
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
              <Typography sx={{ fontSize: 24, fontWeight: 950, color: DNA.ink }}>{upcomingTitle}</Typography>
            </Stack>
            <Stack divider={<Box sx={{ height: "1px", bgcolor: DNA.line }} />}>
              {[["Today", upcoming.today], ["This Week", upcoming.week], ["This Month", upcoming.month]].map(([label, value]) => (
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
              {activity.length === 0 ? (
                <Typography variant="body2" sx={{ color: DNA.muted, fontWeight: 700 }}>
                  No recent activity yet.
                </Typography>
              ) : activity.map((event) => {
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
            <Button onClick={onOpenActivity ?? onOpenShifts} endIcon={<ArrowForwardIcon />} sx={{ mt: 2, px: 0, color: "#4C0DDE", fontWeight: 950 }}>
              View all activity
            </Button>
          </Paper>

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

      <Paper sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", xl: "repeat(4, minmax(0, 1fr))" }, overflow: "hidden", borderRadius: { xs: "16px", md: "20px" }, bgcolor: "#FFFFFF", border: `1px solid ${DNA.line}`, boxShadow: "0 8px 24px rgba(6, 18, 58, 0.06)" }}>
        {metrics.map((item, index) => {
          const tone = toneStyles[item.tone];
          return (
            <Box key={item.label} sx={{ display: "flex", alignItems: "center", gap: { xs: 1.5, md: 2.25 }, minHeight: { xs: 104, md: 132 }, px: { xs: 2, md: 4 }, py: { xs: 2, md: 2.5 }, borderLeft: { xl: index === 0 ? "none" : `1px solid ${DNA.line}` }, borderTop: { xs: index === 0 ? "none" : `1px solid ${DNA.line}`, sm: index < 2 ? "none" : `1px solid ${DNA.line}`, xl: "none" } }}>
              <Box sx={{ width: { xs: 54, md: 66 }, height: { xs: 54, md: 66 }, borderRadius: { xs: "15px", md: "18px" }, bgcolor: tone.bg, color: tone.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, "& svg": { fontSize: { xs: 30, md: 36 } } }}>{item.icon}</Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ color: DNA.muted, fontWeight: 800, fontSize: 14 }}>{item.label}</Typography>
                <Typography sx={{ color: DNA.ink, fontWeight: 950, fontSize: { xs: 21, md: 24 }, lineHeight: 1.18, overflowWrap: "anywhere" }}>{item.value}</Typography>
                <Typography sx={{ color: DNA.muted, fontWeight: 700, fontSize: 13, mt: 0.5, overflowWrap: "anywhere" }}>{item.helper}</Typography>
              </Box>
            </Box>
          );
        })}
      </Paper>
    </Box>
  );
}
