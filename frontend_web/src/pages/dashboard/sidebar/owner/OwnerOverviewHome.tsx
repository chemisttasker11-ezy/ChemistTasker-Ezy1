import { fetchPillBalanceService } from '@chemisttasker/shared-core';
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import {
  ArrowRight,
  Banknote,
  Briefcase,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  Pill,
  ReceiptText,
  Settings,
  ShieldCheck,
  SquarePlus,
  Store,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../contexts/AuthContext";
import { dashboardGreetingName } from "../../../../utils/displayName";
import type { PharmacyDTO } from "./types";

import { formatShiftDate } from "../../../../utils/shiftDisplay";
import ActivityList from "../../../../components/ui/ActivityList";
import BrandBanner from "../../../../components/ui/BrandBanner";
import IconTile, { type Tone } from "../../../../components/ui/IconTile";
import MetricStrip from "../../../../components/ui/MetricStrip";
import SectionCard, { ViewAllLink } from "../../../../components/ui/SectionCard";
import StatList from "../../../../components/ui/StatList";
type ShiftRecord = {
  id: number;
  pharmacy_name?: string | null;
  date?: string | null;
};
type ActivityRecord = {
  title: string;
  description?: string;
  time?: string;
  kind?: string;
  action_url?: string;
  actionUrl?: string;
};
type OwnerData = {
  shift_summary?: {
    open_count?: number;
    confirmed_count?: number;
    upcoming_confirmed_count?: number;
    all_count?: number;
  };
  upcoming_stats?: { today?: number; week?: number; month?: number };
  workspace_upcoming_stats?: { today?: number; week?: number; month?: number };
  invoice_summary?: {
    unpaid_count?: number;
    unpaid_total?: string;
    total_billed?: string;
  };
  shifts?: ShiftRecord[];
  activity?: ActivityRecord[];
};
type Metric = {
  label: string;
  value: number | undefined;
  description: string;
  icon: ReactNode;
  action: () => void;
  tone: Tone;
};

const ink = "var(--ct-text-primary)";
const muted = "var(--ct-text-secondary)";
const line = "var(--ct-border-color)";

function readableCount(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("en-AU") : "—";
}

function readableDate(raw?: string | null): string {
  return formatShiftDate(raw) ?? "Date not provided";
}

function safeActivityUrl(record: ActivityRecord): string | null {
  const path = record.actionUrl || record.action_url || "";
  return path.startsWith("/dashboard/") && !path.startsWith("//") ? path : null;
}

export default function OwnerOverviewHome({
  totalPharmacies,
  pharmacies,
  selectedPharmacyId,
  workspace,
  dashboardData,
  dashboardLoading,
  dashboardError,
  onRetryDashboard,
  onOpenManage,
  onOpenRoster,
  onOpenShifts,
  onPostShift,
  onOpenSettings,
  onOpenPills,
}: {
  totalPharmacies: number;
  pharmacies: PharmacyDTO[];
  selectedPharmacyId: number | null;
  workspace: "internal" | "platform";
  dashboardData?: OwnerData | null;
  dashboardLoading: boolean;
  dashboardError: string | null;
  onRetryDashboard: () => void;
  onOpenManage: () => void;
  onOpenRoster: () => void;
  onOpenShifts: () => void;
  onPostShift: () => void;
  onOpenSettings: () => void;
  onOpenPills: () => void;
}) {
  const { user, activePersona } = useAuth();
  const navigate = useNavigate();
  const canSeeOwnerFinance = activePersona !== "admin";
  const [pillBalance, setPillBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!canSeeOwnerFinance) return;
    let mounted = true;
    setPillBalance(null);
    fetchPillBalanceService()
      .then((data) => {
        const amount = Number(data?.balance);
        if (mounted) setPillBalance(Number.isFinite(amount) ? amount : null);
      })
      .catch(() => {
        if (mounted) setPillBalance(null);
      });
    return () => { mounted = false; };
  }, [canSeeOwnerFinance]);

  const selectedPharmacy = useMemo(
    () => pharmacies.find((pharmacy) => Number(pharmacy.id) === Number(selectedPharmacyId)) ?? null,
    [pharmacies, selectedPharmacyId],
  );
  const scopeName = selectedPharmacy?.name || (workspace === "platform" ? "Public platform" : "All pharmacies");
  const shiftSummary = dashboardData?.shift_summary;
  const upcoming = workspace === "internal" ? dashboardData?.workspace_upcoming_stats ?? dashboardData?.upcoming_stats : dashboardData?.upcoming_stats;
  const invoiceSummary = dashboardData?.invoice_summary;
  const upcomingShifts = Array.isArray(dashboardData?.shifts) ? dashboardData.shifts.slice(0, 5) : [];
  const activity = Array.isArray(dashboardData?.activity) ? dashboardData.activity.slice(0, 5) : [];
  const ready = !dashboardLoading && !dashboardError && Boolean(dashboardData);

  const metrics: Metric[] = [
    {
      label: "Open shifts",
      value: shiftSummary?.open_count,
      description: "Review staffing requests",
      icon: <CalendarDays />,
      action: onOpenShifts,
      tone: "blue",
    },
    {
      label: "Confirmed cover",
      value: workspace === "internal" ? shiftSummary?.upcoming_confirmed_count : shiftSummary?.confirmed_count,
      description: "Upcoming confirmed shifts",
      icon: <ShieldCheck />,
      action: onOpenShifts,
      tone: "violet",
    },
    {
      label: "Due today",
      value: upcoming?.today,
      description: "Upcoming shift commitments",
      icon: <Briefcase />,
      action: onOpenRoster,
      tone: "cyan",
    },
    canSeeOwnerFinance
      ? {
          label: "Unpaid invoices",
          value: invoiceSummary?.unpaid_count,
          description: "Review outstanding invoices",
          icon: <Banknote />,
          action: () => navigate("/dashboard/owner/invoice"),
          tone: "magenta",
        }
      : {
          label: "Active shifts",
          value: shiftSummary?.all_count,
          description: "View current shift work",
          icon: <ClipboardList />,
          action: onOpenShifts,
          tone: "magenta",
        },
  ];

  const shortcuts = [
    { label: "Manage pharmacy", icon: <Store />, action: onOpenManage },
    { label: "Internal Roster", icon: <CalendarCheck />, action: onOpenRoster },
    { label: "Shift Centre", icon: <Briefcase />, action: onOpenShifts },
    ...(canSeeOwnerFinance
      ? [{ label: "Workforce Settings", icon: <Settings />, action: onOpenSettings }]
      : []),
  ];
  const pharmacyCount = workspace === "internal" && !selectedPharmacy ? totalPharmacies : 0;

  return (
    <Stack spacing={{ xs: 2, md: 2.5 }} sx={{ maxWidth: 1600, mx: "auto", minWidth: 0 }}>
      <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap gap={1.25}>
        <Chip
          size="small"
          label={workspace === "platform" ? "Platform shifts" : selectedPharmacy ? "Selected pharmacy" : "Your pharmacy network"}
          sx={{ height: 26, bgcolor: "var(--ct-tone-blue-bg)", color: "var(--ct-tone-blue-fg)", fontSize: 10.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" }}
        />
        <Typography sx={{ color: muted, fontSize: 15 }}>
          {pharmacyCount > 1
            ? `Manage ${pharmacyCount} active pharmacies, teams and operations`
            : `Here is what needs attention at ${scopeName}.`}
        </Typography>
      </Stack>

      {dashboardError && (
        <Alert
          severity="error"
          action={<Button color="inherit" onClick={onRetryDashboard} sx={{ minHeight: 44, fontWeight: 600 }}>Retry</Button>}
        >
          {dashboardError} You can still use your workspace actions below.
        </Alert>
      )}

      <BrandBanner
        title={`Welcome back, ${dashboardGreetingName(user)}!`}
        subtitle={workspace === "platform" ? "Here is your public platform activity today." : "Here's what's happening across your pharmacies today."}
        primary={{ label: "Post a shift", icon: <SquarePlus />, onClick: onPostShift }}
        secondary={{ label: "Manage pharmacies", icon: <Store />, onClick: onOpenManage }}
        aside={canSeeOwnerFinance ? (
          <Stack direction="row" spacing={2} alignItems="center">
            <Box sx={{ width: 56, height: 56, borderRadius: "16px", bgcolor: "rgba(255,255,255,0.14)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, "& svg": { width: 26, height: 26, strokeWidth: 1.75 } }}>
              <Pill aria-hidden="true" />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ color: "#D9D0FA", fontSize: 10.5, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>Pill balance</Typography>
              <Typography sx={{ fontFamily: "var(--ct-font-display)", fontWeight: 500, fontSize: 40, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
                {pillBalance === null ? "—" : readableCount(pillBalance)}
                <Box component="span" sx={{ fontFamily: "var(--ct-font-body)", fontSize: 14, fontWeight: 600, color: "#ECE8FC", ml: 0.75 }}>pills</Box>
              </Typography>
              <ButtonBase
                onClick={onOpenPills}
                sx={{ mt: 0.75, minHeight: 32, px: 1.25, borderRadius: "999px", bgcolor: "rgba(255,255,255,0.16)", color: "#FFFFFF", fontSize: 11.5, fontWeight: 600, "&:hover": { bgcolor: "rgba(255,255,255,0.24)" }, "&:focus-visible": { outline: "2px solid #FFFFFF", outlineOffset: 2 } }}
              >
                View activity
              </ButtonBase>
            </Box>
          </Stack>
        ) : undefined}
      />

      <MetricStrip
        label="Operational overview"
        loading={dashboardLoading}
        items={metrics.map((metric) => ({
          label: metric.label,
          value: ready ? readableCount(metric.value) : "—",
          caption: metric.description,
          icon: metric.icon,
          tone: metric.tone,
          onClick: metric.action,
        }))}
      />

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", lg: "minmax(0,1.45fr) minmax(310px,1fr)" }, gap: 2.5, alignItems: "start" }}>
        <Stack spacing={2.5} sx={{ minWidth: 0 }}>
          <SectionCard
            title="Upcoming shifts"
            icon={<CalendarDays />}
            subtitle="The next commitments in your selected workspace."
            action={<ViewAllLink onClick={onOpenShifts}>View all</ViewAllLink>}
          >
            {dashboardLoading && <Stack spacing={1.2}>{[1, 2, 3].map((n) => <Skeleton key={n} height={58} />)}</Stack>}
            {!dashboardLoading && !ready && <Typography sx={{ color: muted, fontSize: 14 }}>Shift details are unavailable. Retry the overview to see current work.</Typography>}
            {ready && upcomingShifts.length === 0 && (
              <Box sx={{ bgcolor: "var(--ct-page-bg)", px: 2, py: 2.5, borderRadius: "14px" }}>
                <Typography sx={{ color: ink, fontWeight: 600 }}>No upcoming shifts in this view.</Typography>
                <Typography sx={{ color: muted, fontSize: 14, mt: 0.5 }}>Use Shift Centre to check other staffing activity.</Typography>
              </Box>
            )}
            {ready && upcomingShifts.map((shift) => (
              <ButtonBase
                key={shift.id}
                onClick={onOpenShifts}
                sx={{ display: "flex", width: "100%", textAlign: "left", alignItems: "center", gap: 1.5, py: 1.4, px: 0.5, borderTop: "1px solid " + line, borderRadius: "10px", "&:hover": { bgcolor: "var(--ct-hover-bg)" }, "&:focus-visible": { outline: "2px solid var(--ct-accent-strong)" } }}
              >
                <IconTile icon={<CalendarDays />} tone="violet" size={36} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ color: ink, fontSize: 14, fontWeight: 600, overflowWrap: "anywhere" }}>{shift.pharmacy_name || "Pharmacy shift"}</Typography>
                  <Typography sx={{ color: "var(--ct-text-muted)", fontSize: 12.5 }}>{readableDate(shift.date)}</Typography>
                </Box>
                <Box component="span" aria-hidden="true" sx={{ color: "var(--ct-accent-strong)", display: "inline-flex", "& svg": { width: 18, height: 18 } }}><ArrowRight /></Box>
              </ButtonBase>
            ))}
          </SectionCard>

          <SectionCard title="Recent Activity" icon={<ClipboardList />}>
            {dashboardLoading && <Stack spacing={1.2}>{[1, 2].map((n) => <Skeleton key={n} height={52} />)}</Stack>}
            {!dashboardLoading && !ready && <Typography sx={{ color: muted, fontSize: 14 }}>Activity could not be loaded.</Typography>}
            {ready && activity.length === 0 && <Typography sx={{ color: muted, fontSize: 14 }}>No recent activity to show in this workspace.</Typography>}
            {ready && activity.length > 0 && (
              <ActivityList
                entries={activity.map((record) => {
                  const url = safeActivityUrl(record);
                  return {
                    title: record.title,
                    description: record.description,
                    time: record.time,
                    kind: record.kind,
                    onOpen: url ? () => navigate(url) : null,
                  };
                })}
              />
            )}
          </SectionCard>
        </Stack>

        <Stack spacing={2.5} sx={{ minWidth: 0 }}>
          <SectionCard title="Shift calendar snapshot" icon={<CalendarCheck />}>
            <StatList
              loading={dashboardLoading}
              rows={[
                { label: "Today", value: ready ? readableCount(upcoming?.today) : "—" },
                { label: "Next 7 days", value: ready ? readableCount(upcoming?.week) : "—" },
                { label: "Next 30 days", value: ready ? readableCount(upcoming?.month) : "—" },
              ]}
            />
            <Box sx={{ mt: 1 }}><ViewAllLink onClick={onOpenRoster}>Open roster</ViewAllLink></Box>
          </SectionCard>

          {canSeeOwnerFinance && (
            <SectionCard title="Invoices" icon={<ReceiptText />}>
              <Typography sx={{ color: muted, fontSize: 13 }}>Outstanding total</Typography>
              <Typography sx={{ color: ink, fontFamily: "var(--ct-font-display)", fontWeight: 500, fontSize: 30, lineHeight: 1.2, fontVariantNumeric: "tabular-nums", mb: 0.75 }}>
                {dashboardLoading ? <Skeleton width={120} /> : ready ? invoiceSummary?.unpaid_total ?? "—" : "—"}
              </Typography>
              <Typography sx={{ color: "var(--ct-text-muted)", fontSize: 13 }}>
                {ready ? readableCount(invoiceSummary?.unpaid_count) : "—"} unpaid invoices in this workspace
              </Typography>
              <Box sx={{ mt: 1 }}><ViewAllLink onClick={() => navigate("/dashboard/owner/invoice")}>Review invoices</ViewAllLink></Box>
            </SectionCard>
          )}
        </Stack>
      </Box>

      <SectionCard title="Workspace tools" icon={<Settings />} dense>
        <Stack direction="row" flexWrap="wrap" useFlexGap gap={1}>
          {shortcuts.map((link) => (
            <Button
              key={link.label}
              variant="outlined"
              onClick={link.action}
              startIcon={link.icon}
              sx={{ minHeight: 44, borderRadius: "12px", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-color)", fontWeight: 600, fontSize: 13, "& svg": { width: 18, height: 18, color: "var(--ct-accent-strong)" } }}
            >
              {link.label}
            </Button>
          ))}
        </Stack>
      </SectionCard>
      {totalPharmacies === 0 && workspace === "internal" && !dashboardLoading && (
        <Alert severity="info">No pharmacies are linked to this workspace yet. Add a pharmacy to begin managing its staffing.</Alert>
      )}
    </Stack>
  );
}
