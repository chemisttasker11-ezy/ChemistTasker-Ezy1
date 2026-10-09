import type { ReactNode } from "react";
import {
  Box,
  Button,
  ButtonBase,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import ForumIcon from "@mui/icons-material/Forum";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import StoreIcon from "@mui/icons-material/Store";
import VisibilityIcon from "@mui/icons-material/Visibility";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import { alpha } from "@mui/material/styles";

/**
 * Reusable Vite dashboard presentation, adapted from the ChemistTasker Figma
 * Web / Authenticated frames. These components intentionally receive data
 * and callbacks; authentication, scope, navigation and API logic stay in the
 * owning page. MUI is our existing design system, not a second CSS framework.
 */
export const dashboardColors = {
  ink: "#06123A",
  muted: "#5E6B8D",
  line: "#E5ECF7",
  blue: "#063BDA",
  violet: "#6D28D9",
  magenta: "#EA0A8E",
  cyan: "#08BEEA",
} as const;

export type DashboardTone = "blue" | "purple" | "pink" | "cyan";

export const dashboardToneStyles: Record<DashboardTone, { bg: string; color: string; link: string }> = {
  blue: { bg: "#E7F0FF", color: dashboardColors.blue, link: dashboardColors.blue },
  purple: { bg: "#EFE7FF", color: dashboardColors.violet, link: "#4C0DDE" },
  pink: { bg: "#FDE7F5", color: dashboardColors.magenta, link: dashboardColors.magenta },
  cyan: { bg: "#DDFBFF", color: "#008EA6", link: dashboardColors.blue },
};

export type DashboardAction = {
  title: string;
  description: string;
  icon: ReactNode;
  onClick: () => void;
  tone: DashboardTone;
  wide?: boolean;
};

export type DashboardMetric = {
  label: string;
  value: string | number;
  helper: string;
  icon: ReactNode;
  tone: DashboardTone;
  onClick?: () => void;
};

export type DashboardActivity = {
  title: string;
  description: string;
  time: string;
  icon?: ReactNode;
  color?: string;
  kind?: string;
  target_id?: number | string;
  targetId?: number | string;
  target_type?: string;
  targetType?: string;
  action_url?: string;
  actionUrl?: string;
};

export type DashboardUpcomingStat = {
  today: number;
  week: number;
  month: number;
};

export function dashboardActivityIcon(event: DashboardActivity): ReactNode {
  if (event.icon) return event.icon;
  if (event.kind === "hub") return <ForumIcon />;
  if (event.kind === "reveal") return <VisibilityIcon />;
  if (event.kind === "confirmed") return <ShieldOutlinedIcon />;
  if (event.kind === "pharmacy") return <StoreIcon />;
  if (event.kind === "invoice") return <CreditCardIcon />;
  return <CalendarMonthIcon />;
}

export function dashboardActivityColor(event: DashboardActivity): string {
  if (event.color) return event.color;
  if (event.kind === "hub") return dashboardColors.blue;
  if (event.kind === "reveal") return dashboardColors.magenta;
  if (event.kind === "confirmed") return "#00C853";
  if (event.kind === "invoice") return "#FF5A00";
  return "#5B18E8";
}

const panelSx = {
  borderRadius: { xs: "16px", md: "20px" },
  border: "1px solid " + dashboardColors.line,
  bgcolor: "#fff",
  boxShadow: "0 8px 24px rgba(6, 18, 58, 0.06)",
} as const;

export function DashboardQuickActionGrid({ actions }: { actions: DashboardAction[] }) {
  return (
    <Box
      data-ct-dashboard-actions
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          sm: "repeat(2, minmax(0, 1fr))",
          lg: "repeat(3, minmax(0, 1fr))",
        },
        gap: { xs: 1.5, md: 2 },
        minWidth: 0,
      }}
    >
      {actions.map((action) => {
        const tone = dashboardToneStyles[action.tone];
        return (
          <ButtonBase
            key={action.title}
            type="button"
            focusRipple
            onClick={action.onClick}
            aria-label={action.title}
            sx={{
              ...panelSx,
              display: "flex",
              width: "100%",
              minWidth: 0,
              minHeight: { xs: 128, md: 152 },
              gridColumn: { lg: action.wide ? "span 2" : "span 1" },
              textAlign: "left",
              alignItems: "center",
              justifyContent: "flex-start",
              p: { xs: 2, md: 2.25 },
              transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
              "&:hover": {
                borderColor: alpha(tone.color, 0.4),
                boxShadow: "0 16px 34px rgba(6, 18, 58, 0.11)",
                transform: { xs: "none", md: "translateY(-2px)" },
              },
              "&.Mui-focusVisible": {
                outline: "3px solid " + tone.color,
                outlineOffset: 3,
              },
              "@media (prefers-reduced-motion: reduce)": { transition: "none", "&:hover": { transform: "none" } },
            }}
          >
            <Stack direction="row" spacing={{ xs: 1.5, md: 1.75 }} alignItems="center" sx={{ width: "100%", minWidth: 0 }}>
              <Box
                aria-hidden="true"
                sx={{
                  width: { xs: 46, md: 50 },
                  height: { xs: 46, md: 50 },
                  borderRadius: "14px",
                  bgcolor: tone.bg,
                  color: tone.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  "& svg": { fontSize: { xs: 25, md: 28 } },
                }}
              >
                {action.icon}
              </Box>
              <Stack spacing={0.7} sx={{ flex: 1, minWidth: 0 }}>
                <Typography component="span" sx={{ color: dashboardColors.ink, fontWeight: 800, fontSize: { xs: 16, md: 17 }, lineHeight: 1.25, overflowWrap: "anywhere" }}>
                  {action.title}
                </Typography>
                <Typography component="span" sx={{ color: dashboardColors.muted, fontWeight: 500, fontSize: { xs: 12, md: 13 }, lineHeight: 1.45, overflowWrap: "anywhere", whiteSpace: "normal" }}>
                  {action.description}
                </Typography>
              </Stack>
            </Stack>
          </ButtonBase>
        );
      })}
    </Box>
  );
}

export function DashboardUpcomingShiftsCard({
  counts,
  title = "Upcoming Shifts",
  onViewShifts,
}: {
  counts: DashboardUpcomingStat;
  title?: string;
  onViewShifts: () => void;
}) {
  return (
    <Paper sx={{ ...panelSx, p: { xs: 2.25, md: 3 } }}>
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 2.25 }}>
        <CalendarMonthIcon sx={{ color: dashboardColors.violet, fontSize: 25 }} />
        <Typography component="h2" sx={{ color: dashboardColors.ink, fontSize: { xs: 18, md: 20 }, fontWeight: 850 }}>
          {title}
        </Typography>
      </Stack>
      <Stack divider={<Box sx={{ height: 1, bgcolor: dashboardColors.line }} />}>
        {[
          { label: "Today", value: counts.today },
          { label: "This Week", value: counts.week },
          { label: "This Month", value: counts.month },
        ].map(({ label, value }) => (
          <Stack key={label} direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 1.15, gap: 2 }}>
            <Typography sx={{ color: dashboardColors.muted, fontSize: 14, fontWeight: 650 }}>{label}</Typography>
            <Typography sx={{ color: dashboardColors.violet, fontWeight: 850, fontSize: 23, lineHeight: 1.15 }}>{value}</Typography>
          </Stack>
        ))}
      </Stack>
      <Button onClick={onViewShifts} endIcon={<ArrowForwardIcon />} sx={{ mt: 1.5, px: 0, color: dashboardColors.violet, fontWeight: 750 }}>
        View all shifts
      </Button>
    </Paper>
  );
}

export function DashboardRecentActivityCard({
  activity,
  onActivityClick,
  onViewAll,
}: {
  activity: DashboardActivity[];
  onActivityClick: (event: DashboardActivity) => void;
  onViewAll: () => void;
}) {
  return (
    <Paper sx={{ ...panelSx, p: { xs: 2.25, md: 3 } }}>
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 2 }}>
        <FavoriteBorderIcon sx={{ color: dashboardColors.violet, fontSize: 25 }} />
        <Typography component="h2" sx={{ color: dashboardColors.ink, fontWeight: 850, fontSize: { xs: 18, md: 20 } }}>
          Recent Activity
        </Typography>
      </Stack>
      <Stack divider={<Box sx={{ height: 1, bgcolor: dashboardColors.line }} />}>
        {activity.length === 0 ? (
          <Typography variant="body2" sx={{ color: dashboardColors.muted, py: 1.5 }}>No recent activity yet.</Typography>
        ) : activity.map((event, index) => {
          const actionUrl = event.actionUrl || event.action_url;
          return (
            <ButtonBase
              key={String(event.kind || "activity") + "-" + String(event.targetId || event.target_id || event.title) + "-" + String(event.time) + "-" + index}
              type="button"
              onClick={() => onActivityClick(event)}
              disabled={!actionUrl}
              aria-label={event.title}
              sx={{
                width: "100%",
                textAlign: "left",
                borderRadius: 1,
                cursor: actionUrl ? "pointer" : "default",
                "&.Mui-focusVisible": { outline: "2px solid " + dashboardColors.violet, outlineOffset: 2 },
                "&:hover": actionUrl ? { bgcolor: alpha(dashboardColors.violet, 0.05) } : undefined,
                "&.Mui-disabled": { opacity: 1 },
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ width: "100%", py: 1.3, px: 0.5, minWidth: 0 }}>
                <Box aria-hidden="true" sx={{ color: dashboardActivityColor(event), width: 23, flexShrink: 0, pt: 0.15, "& svg": { fontSize: 21 } }}>
                  {dashboardActivityIcon(event)}
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ color: dashboardColors.ink, fontWeight: 750, fontSize: 13, lineHeight: 1.4, overflowWrap: "anywhere" }}>{event.title}</Typography>
                  <Typography sx={{ color: dashboardColors.muted, fontWeight: 500, fontSize: 12, lineHeight: 1.5, overflowWrap: "anywhere" }}>{event.description}</Typography>
                </Box>
                <Typography sx={{ color: "#7A86A3", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>{event.time}</Typography>
              </Stack>
            </ButtonBase>
          );
        })}
      </Stack>
      <Button onClick={onViewAll} endIcon={<ArrowForwardIcon />} sx={{ mt: 1.5, px: 0, color: dashboardColors.violet, fontWeight: 750 }}>
        View all activity
      </Button>
    </Paper>
  );
}

export function DashboardMetricsGrid({ metrics }: { metrics: DashboardMetric[] }) {
  return (
    <Box
      data-ct-dashboard-metrics
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))", xl: "repeat(4, minmax(0, 1fr))" },
        gap: { xs: 1.5, md: 2 },
        minWidth: 0,
      }}
    >
      {metrics.map((item) => {
        const tone = dashboardToneStyles[item.tone];
        const card = (
          <Paper
            sx={{
              ...panelSx,
              display: "flex",
              width: "100%",
              minWidth: 0,
              minHeight: { xs: 104, md: 118 },
              alignItems: "center",
              gap: 1.75,
              p: { xs: 2, md: 2.25 },
              textAlign: "left",
            }}
          >
            <Box aria-hidden="true" sx={{ width: 48, height: 48, borderRadius: "14px", bgcolor: tone.bg, color: tone.color, flexShrink: 0, display: "flex", justifyContent: "center", alignItems: "center", "& svg": { fontSize: 26 } }}>
              {item.icon}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ color: dashboardColors.muted, fontWeight: 650, fontSize: 12, lineHeight: 1.35, overflowWrap: "anywhere" }}>{item.label}</Typography>
              <Typography sx={{ color: dashboardColors.ink, fontWeight: 850, fontSize: 23, lineHeight: 1.2, overflowWrap: "anywhere", my: 0.3 }}>{item.value}</Typography>
              <Typography sx={{ color: dashboardColors.muted, fontWeight: 500, fontSize: 11, lineHeight: 1.4, overflowWrap: "anywhere" }}>{item.helper}</Typography>
            </Box>
          </Paper>
        );
        return item.onClick ? (
          <ButtonBase
            key={item.label}
            type="button"
            onClick={item.onClick}
            aria-label={item.label}
            sx={{
              borderRadius: { xs: "16px", md: "20px" },
              width: "100%",
              minWidth: 0,
              textAlign: "left",
              "&.Mui-focusVisible": { outline: "3px solid " + tone.color, outlineOffset: 3 },
              "&:hover .MuiPaper-root": { borderColor: alpha(tone.color, 0.4), boxShadow: "0 14px 30px rgba(6, 18, 58, 0.10)" },
            }}
          >
            {card}
          </ButtonBase>
        ) : <Box key={item.label} sx={{ minWidth: 0 }}>{card}</Box>;
      })}
    </Box>
  );
}
