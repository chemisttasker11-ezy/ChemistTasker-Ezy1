import React, { useState } from "react";
import { Box, ButtonBase, Chip, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { ArrowRight, CalendarDays, Heart, Pill } from "lucide-react";
import { useNavigate } from "react-router-dom";
import RecentActivityDialog from "./RecentActivityDialog";
import { formatShiftDate, formatShiftTimeRange } from "../../utils/shiftDisplay";
import ActivityList from "../ui/ActivityList";
import BrandBanner from "../ui/BrandBanner";
import IconTile, { type Tone } from "../ui/IconTile";
import MetricStrip from "../ui/MetricStrip";
import SectionCard, { ViewAllLink } from "../ui/SectionCard";
import StatList from "../ui/StatList";

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

export type DashboardShiftPreview = {
  id: number;
  pharmacy_name?: string;
  suburb?: string | null;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: string;
  reason?: string | null;
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

// The public tone names predate the Figma system; map them onto its four tile tones.
const tone: Record<DashboardTone, Tone> = { blue: "blue", purple: "violet", pink: "magenta", cyan: "cyan" };

// Figma invoice card: blue -> violet -> navy.
const invoiceBackground = [
  "radial-gradient(circle at 96% 4%, rgba(196, 128, 240, 0.36) 0 90px, transparent 91px)",
  "linear-gradient(140deg, #0A6FD6 0%, #2A2FB8 42%, #2A1590 70%, #02184B 100%)",
].join(", ");

function ShiftRow({ shift, onOpen, trailing }: { shift: DashboardShiftPreview; onOpen?: () => void; trailing: React.ReactNode }) {
  return (
    <ButtonBase
      onClick={onOpen}
      sx={{
        width: "100%", display: "flex", alignItems: "center", gap: 1.5, textAlign: "left", py: 1.4, px: 0.5, borderRadius: "10px",
        "&:hover": { bgcolor: "var(--ct-hover-bg)" },
        "&:focus-visible": { outline: "2px solid var(--ct-accent-strong)", outlineOffset: 1 },
      }}
    >
      <IconTile icon={<CalendarDays />} tone="violet" size={36} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography noWrap sx={{ color: "var(--ct-text-primary)", fontWeight: 600, fontSize: 14 }}>{shift.pharmacy_name || "Pharmacy shift"}</Typography>
        <Typography noWrap sx={{ color: "var(--ct-text-muted)", fontSize: 12.5 }}>
          {[formatShiftDate(shift.date), formatShiftTimeRange(shift.start_time, shift.end_time), shift.suburb].filter(Boolean).join(" · ")}
        </Typography>
        {shift.reason && <Typography noWrap sx={{ color: "var(--ct-tone-cyan-fg)", fontWeight: 600, fontSize: 12, mt: 0.25 }}>{shift.reason}</Typography>}
      </Box>
      {trailing}
    </ButtonBase>
  );
}

function EmptyNote({ title, detail }: { title: string; detail: string }) {
  return (
    <Box sx={{ bgcolor: "var(--ct-page-bg)", borderRadius: "14px", px: 2, py: 2.25 }}>
      <Typography sx={{ color: "var(--ct-text-primary)", fontWeight: 600, fontSize: 14 }}>{title}</Typography>
      <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 13, mt: 0.5 }}>{detail}</Typography>
    </Box>
  );
}

export default function DashboardOverviewTemplate({
  badge,
  subtitle,
  heroTitle,
  heroSubtitle,
  primaryAction,
  secondaryAction,
  pillSummary,
  onOpenPills,
  actions,
  workerShifts,
  recommendedShifts,
  onOpenWorkerShift,
  onBrowseRecommendations,
  onUpdateAvailability,
  upcoming,
  upcomingTitle = "Upcoming Shifts",
  showUpcoming = true,
  activity = [],
  metrics,
  invoicePanel,
  onOpenShifts,
  onOpenActivity,
}: {
  /** Page name; the top bar already shows it, so the banner greeting is the page heading. */
  title: string;
  badge: string;
  subtitle: string;
  heroTitle: string;
  heroSubtitle: string;
  primaryAction: { label: string; icon?: React.ReactNode; onClick: () => void };
  secondaryAction?: { label: string; icon?: React.ReactNode; onClick: () => void };
  pillSummary?: PillSummary;
  onOpenPills?: () => void;
  actions: DashboardAction[];
  workerShifts?: DashboardShiftPreview[];
  recommendedShifts?: DashboardShiftPreview[];
  onOpenWorkerShift?: (shift: DashboardShiftPreview) => void;
  onBrowseRecommendations?: () => void;
  onUpdateAvailability?: () => void;
  upcoming: UpcomingStat;
  upcomingTitle?: string;
  showUpcoming?: boolean;
  activity?: DashboardActivity[];
  metrics: DashboardMetric[];
  invoicePanel?: DashboardInvoicePanel;
  onOpenShifts?: () => void;
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

  const pillPanel = pillSummary ? (
    <Stack
      component={onOpenPills ? ButtonBase : "div"}
      onClick={onOpenPills}
      direction="row"
      spacing={2}
      alignItems="center"
      sx={{ width: "100%", textAlign: "left", color: "inherit", borderRadius: "14px", "&:focus-visible": { outline: "2px solid #FFFFFF", outlineOffset: 4 } }}
    >
      <Box sx={{ width: 56, height: 56, borderRadius: "16px", bgcolor: "rgba(255,255,255,0.14)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, "& svg": { width: 26, height: 26, strokeWidth: 1.75 } }}>
        <Pill aria-hidden="true" />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ color: "#D9D0FA", fontSize: 10.5, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>Pill balance</Typography>
        <Stack direction="row" spacing={0.75} alignItems="baseline">
          {pillSummary.loading ? (
            <CircularProgress size={22} sx={{ color: "#fff" }} />
          ) : (
            <Typography sx={{ fontFamily: "var(--ct-font-display)", fontWeight: 500, fontSize: 40, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{pillSummary.balance}</Typography>
          )}
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: "#ECE8FC" }}>pills</Typography>
        </Stack>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
          {pillSummary.shiftPostCost != null && (
            <Chip size="small" label={`${pillSummary.shiftPostCost} pills per shift post`} sx={{ height: 24, bgcolor: "rgba(255,255,255,0.16)", color: "#fff", fontSize: 11, fontWeight: 600 }} />
          )}
          {onOpenPills && <Chip size="small" label="View activity" sx={{ height: 24, bgcolor: "rgba(255,255,255,0.16)", color: "#fff", fontSize: 11, fontWeight: 600 }} />}
        </Stack>
      </Box>
    </Stack>
  ) : undefined;

  return (
    <Box sx={{ width: "100%", mx: "auto", maxWidth: 1660, display: "flex", flexDirection: "column", gap: { xs: 2, md: 2.5 }, minWidth: 0 }}>
      <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap gap={1.25}>
        <Chip
          label={badge}
          size="small"
          sx={{ height: 26, bgcolor: "var(--ct-tone-blue-bg)", color: "var(--ct-tone-blue-fg)", fontSize: 10.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" }}
        />
        <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 15, lineHeight: 1.5, overflowWrap: "anywhere" }}>{subtitle}</Typography>
      </Stack>

      <BrandBanner
        title={heroTitle}
        subtitle={heroSubtitle}
        primary={primaryAction}
        secondary={secondaryAction}
        aside={pillPanel}
      />

      <MetricStrip
        items={metrics.map((item) => ({ label: item.label, value: item.value, caption: item.helper, icon: item.icon, tone: tone[item.tone] }))}
      />

      {(workerShifts || recommendedShifts) && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" }, gap: 2.5, minWidth: 0 }}>
          <SectionCard
            title="My next shifts"
            icon={<CalendarDays />}
            subtitle="Only shifts you applied to, showed interest in, committed to, or have confirmed."
          >
            {(workerShifts ?? []).length === 0 ? (
              <EmptyNote title="Nothing pending or committed yet." detail="Your matched opportunities stay separate so they are never mistaken for booked work." />
            ) : (
              <Stack divider={<Box sx={{ height: "1px", bgcolor: "var(--ct-border-color)" }} />}>
                {(workerShifts ?? []).slice(0, 4).map((shift) => {
                  const confirmed = shift.status === "Confirmed";
                  return (
                    <ShiftRow
                      key={shift.id}
                      shift={shift}
                      onOpen={() => onOpenWorkerShift?.(shift)}
                      trailing={(
                        <Chip
                          size="small"
                          label={shift.status || "In progress"}
                          sx={{ flexShrink: 0, height: 24, fontSize: 11.5, fontWeight: 600, bgcolor: confirmed ? "var(--ct-tone-cyan-bg)" : "var(--ct-tone-violet-bg)", color: confirmed ? "var(--ct-tone-cyan-fg)" : "var(--ct-tone-violet-fg)" }}
                        />
                      )}
                    />
                  );
                })}
              </Stack>
            )}
          </SectionCard>

          <SectionCard
            title="Recommended for you"
            icon={<Heart />}
            subtitle="Open shifts matching your declared availability and travel area."
          >
            {(recommendedShifts ?? []).length === 0 ? (
              <EmptyNote title="No current availability match." detail="Keep your availability and travel preferences current for better matches." />
            ) : (
              <Stack divider={<Box sx={{ height: "1px", bgcolor: "var(--ct-border-color)" }} />}>
                {(recommendedShifts ?? []).slice(0, 4).map((shift) => (
                  <ShiftRow
                    key={shift.id}
                    shift={shift}
                    onOpen={() => onOpenWorkerShift?.(shift)}
                    trailing={<Box component="span" aria-hidden="true" sx={{ display: "inline-flex", color: "var(--ct-accent-strong)", "& svg": { width: 18, height: 18 } }}><ArrowRight /></Box>}
                  />
                ))}
              </Stack>
            )}
            {(onBrowseRecommendations || onUpdateAvailability) && (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 0, sm: 2 }} sx={{ mt: 1 }}>
                {onBrowseRecommendations && <ViewAllLink onClick={onBrowseRecommendations}>Browse matching shifts</ViewAllLink>}
                {onUpdateAvailability && (
                  <ButtonBase
                    onClick={onUpdateAvailability}
                    sx={{ minHeight: 44, px: 0.25, borderRadius: "8px", alignSelf: "flex-start", color: "var(--ct-text-secondary)", fontSize: 13, fontWeight: 600, "&:hover": { color: "var(--ct-text-primary)" }, "&:focus-visible": { outline: "2px solid var(--ct-accent-strong)", outlineOffset: 2 } }}
                  >
                    Update availability
                  </ButtonBase>
                )}
              </Stack>
            )}
          </SectionCard>
        </Box>
      )}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 340px", xl: "minmax(0, 1fr) 380px" }, gap: 2.5, alignItems: "start", minWidth: 0 }}>
        <Stack spacing={2.5} sx={{ minWidth: 0 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" }, gap: 2, minWidth: 0 }}>
            {actions.map((action) => (
              <Paper
                key={action.title}
                component={ButtonBase}
                onClick={action.onClick}
                variant="outlined"
                sx={{
                  width: "100%",
                  minHeight: 108,
                  gridColumn: { lg: action.wide ? "span 2" : "span 1" },
                  borderRadius: "var(--ct-card-radius)",
                  borderColor: "var(--ct-border-color)",
                  bgcolor: "var(--ct-surface-bg)",
                  boxShadow: "none",
                  p: { xs: 2, md: 2.5 },
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "flex-start",
                  gap: 1.75,
                  textAlign: "left",
                  transition: "border-color 160ms ease, box-shadow 160ms ease",
                  "&:hover": { borderColor: "var(--ct-tone-violet-bg)", boxShadow: "0 10px 28px rgba(6, 18, 58, 0.07)" },
                  "&:focus-visible": { outline: "2px solid var(--ct-accent-strong)", outlineOffset: 2 },
                }}
              >
                <IconTile icon={action.icon} tone={tone[action.tone]} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ color: "var(--ct-text-primary)", fontFamily: "var(--ct-font-display)", fontWeight: 500, fontSize: 16, lineHeight: 1.3, overflowWrap: "anywhere" }}>{action.title}</Typography>
                  <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 12.5, lineHeight: 1.45, mt: 0.5, overflowWrap: "anywhere" }}>{action.description}</Typography>
                </Box>
              </Paper>
            ))}
          </Box>
        </Stack>

        <Stack spacing={2.5} sx={{ minWidth: 0 }}>
          {showUpcoming && (
            <SectionCard title={upcomingTitle} icon={<CalendarDays />}>
              <StatList rows={[{ label: "Today", value: upcoming.today }, { label: "This Week", value: upcoming.week }, { label: "This Month", value: upcoming.month }]} />
              {onOpenShifts && <Box sx={{ mt: 1 }}><ViewAllLink onClick={onOpenShifts}>View all shifts</ViewAllLink></Box>}
            </SectionCard>
          )}

          <SectionCard title="Recent Activity" icon={<Heart />}>
            {activity.length === 0 ? (
              <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 14 }}>No recent activity yet.</Typography>
            ) : (
              <ActivityList
                entries={activity.map((event) => {
                  const url = event.actionUrl || event.action_url;
                  return {
                    title: event.title,
                    description: event.description,
                    time: event.time,
                    kind: event.kind,
                    onOpen: url ? () => handleActivityClick(event) : null,
                  };
                })}
              />
            )}
            <Box sx={{ mt: 1 }}><ViewAllLink onClick={handleOpenActivity}>View all activity</ViewAllLink></Box>
          </SectionCard>

          {invoicePanel && (
            <Box component="section" sx={{ position: "relative", overflow: "hidden", borderRadius: "var(--ct-card-radius)", p: { xs: 2.5, md: 3 }, color: "#FFFFFF", background: invoiceBackground }}>
              <Typography sx={{ textTransform: "uppercase", letterSpacing: ".08em", color: "#D9D0FA", fontSize: 10.5, fontWeight: 600 }}>{invoicePanel.title}</Typography>
              <Typography sx={{ fontFamily: "var(--ct-font-display)", fontWeight: 500, fontSize: { xs: 30, md: 34 }, lineHeight: 1.15, mt: 0.75, fontVariantNumeric: "tabular-nums" }}>{invoicePanel.total}</Typography>
              <Typography sx={{ color: "#E0DAFA", fontSize: 13 }}>{invoicePanel.totalLabel}</Typography>
              <Stack direction="row" spacing={1.25} sx={{ mt: 2 }}>
                {[[invoicePanel.unpaidCount, "Unpaid invoices"], [invoicePanel.unpaidTotal, "Unpaid total"]].map(([value, label]) => (
                  <Box key={String(label)} sx={{ flex: 1, minWidth: 0, px: 1.5, py: 1.25, borderRadius: "14px", bgcolor: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)" }}>
                    <Typography sx={{ fontFamily: "var(--ct-font-display)", fontWeight: 500, fontSize: 22, lineHeight: 1.1, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>{value}</Typography>
                    <Typography sx={{ color: "#E0DAFA", fontSize: 11.5, mt: 0.4 }}>{label}</Typography>
                  </Box>
                ))}
              </Stack>
              <ButtonBase
                onClick={invoicePanel.onClick}
                sx={{ mt: 2, minHeight: 40, px: 2, borderRadius: "999px", bgcolor: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.28)", color: "#FFFFFF", fontSize: 13, fontWeight: 600, "&:hover": { bgcolor: "rgba(255,255,255,0.22)" }, "&:focus-visible": { outline: "2px solid #FFFFFF", outlineOffset: 2 } }}
              >
                {invoicePanel.buttonLabel}
              </ButtonBase>
            </Box>
          )}
        </Stack>
      </Box>

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
