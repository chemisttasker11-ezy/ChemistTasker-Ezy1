import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import ListAltIcon from "@mui/icons-material/ListAlt";
import SettingsIcon from "@mui/icons-material/Settings";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import StoreIcon from "@mui/icons-material/Store";
import WorkOutlineIcon from "@mui/icons-material/WorkOutline";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../contexts/AuthContext";
import apiClient from "../../../../utils/apiClient";
import { dashboardGreetingName } from "../../../../utils/displayName";
import type { PharmacyDTO } from "./types";

import { formatShiftDate } from "../../../../utils/shiftDisplay";
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
  accent: string;
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
    apiClient.get("/pill-rewards/balance/")
      .then(({ data }) => {
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
      icon: <WorkOutlineIcon />,
      action: onOpenShifts,
      accent: "#5222B8",
    },
    {
      label: "Confirmed cover",
      value: workspace === "internal" ? shiftSummary?.upcoming_confirmed_count : shiftSummary?.confirmed_count,
      description: "Upcoming confirmed shifts",
      icon: <ShieldOutlinedIcon />,
      action: onOpenShifts,
      accent: "#036D82",
    },
    {
      label: "Due today",
      value: upcoming?.today,
      description: "Upcoming shift commitments",
      icon: <CalendarMonthIcon />,
      action: onOpenRoster,
      accent: "#1855B0",
    },
    canSeeOwnerFinance
      ? {
          label: "Unpaid invoices",
          value: invoiceSummary?.unpaid_count,
          description: "Review outstanding invoices",
          icon: <CreditCardIcon />,
          action: () => navigate("/dashboard/owner/invoice"),
          accent: "#9A227A",
        }
      : {
          label: "Active shifts",
          value: shiftSummary?.all_count,
          description: "View current shift work",
          icon: <ListAltIcon />,
          action: onOpenShifts,
          accent: "#9A227A",
        },
  ];

  const shortcuts = [
    { label: "Manage pharmacy", icon: <StoreIcon />, action: onOpenManage },
    { label: "Internal Roster", icon: <CalendarMonthIcon />, action: onOpenRoster },
    { label: "Shift Centre", icon: <WorkOutlineIcon />, action: onOpenShifts },
    ...(canSeeOwnerFinance
      ? [{ label: "Workforce Settings", icon: <SettingsIcon />, action: onOpenSettings }]
      : []),
  ];

  return (
    <Stack spacing={{ xs: 2, md: 2.5 }} sx={{ maxWidth: 1600, mx: "auto", minWidth: 0 }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        alignItems={{ xs: "stretch", md: "center" }}
        justifyContent="space-between"
        spacing={2}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h1" sx={{ color: ink, fontFamily: "var(--ct-font-display)", fontSize: { xs: 28, md: 32 }, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.13 }}>
            Owner Dashboard
          </Typography>
          <Typography sx={{ color: muted, fontSize: 15, lineHeight: 1.55, mt: 0.6 }}>
            Welcome back, {dashboardGreetingName(user)}. Here is what needs attention at {scopeName}.
          </Typography>
          <Chip
            size="small"
            label={workspace === "platform" ? "Platform shifts" : selectedPharmacy ? "Selected pharmacy" : "Your pharmacy network"}
            sx={{ mt: 1.5, bgcolor: "#EBEEFF", color: "#4220A0", fontWeight: 800 }}
          />
        </Box>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ flexShrink: 0 }}>
          <Button onClick={onPostShift} variant="contained" startIcon={<ListAltIcon />} sx={{ minHeight: 46, textTransform: "none", bgcolor: "#5222B8", "&:hover": { bgcolor: "#421A94" } }}>
            Post Shift
          </Button>
          <Button onClick={onOpenShifts} variant="outlined" endIcon={<ArrowForwardRoundedIcon />} sx={{ minHeight: 46, textTransform: "none", color: "#5222B8", borderColor: "#C8B5E9" }}>
            Shift Centre
          </Button>
        </Stack>
      </Stack>

      {dashboardError && (
        <Alert
          severity="error"
          action={<Button color="inherit" onClick={onRetryDashboard} sx={{ minHeight: 44, fontWeight: 800 }}>Retry</Button>}
        >
          {dashboardError} You can still use your workspace actions below.
        </Alert>
      )}

      <Paper
        component="section"
        aria-label="Operational overview"
        variant="outlined"
        sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(4,minmax(0,1fr))" }, bgcolor: "#FFFFFF", borderColor: line, borderRadius: 3, overflow: "hidden", boxShadow: "none" }}
      >
        {metrics.map((metric, index) => (
          <ButtonBase
            key={metric.label}
            onClick={metric.action}
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              width: "100%",
              minWidth: 0,
              textAlign: "left",
              gap: 0.7,
              p: { xs: 1.75, sm: 2.25, lg: 2.5 },
              borderRight: { xs: index % 2 === 0 ? "1px solid " + line : "none", lg: index < 3 ? "1px solid " + line : "none" },
              borderBottom: { xs: index < 2 ? "1px solid " + line : "none", lg: "none" },
              "&:hover": { bgcolor: "#F5F7FF" },
              "&:focus-visible": { outline: "3px solid #008DDB", outlineOffset: -3 },
            }}
          >
            <Stack direction="row" spacing={0.8} alignItems="center">
              <Box sx={{ color: metric.accent, display: "flex", "& svg": { fontSize: 20 } }}>{metric.icon}</Box>
              <Typography sx={{ color: muted, fontSize: { xs: 12, sm: 13 }, fontWeight: 800 }}>{metric.label}</Typography>
            </Stack>
            {dashboardLoading ? (
              <Skeleton variant="text" width={72} height={49} />
            ) : (
              <Typography sx={{ color: ink, fontSize: { xs: 30, md: 38 }, lineHeight: 1.12, fontWeight: 850, fontVariantNumeric: "tabular-nums" }}>
                {ready ? readableCount(metric.value) : "—"}
              </Typography>
            )}
            <Typography sx={{ color: muted, fontSize: 12.5, fontWeight: 600, lineHeight: 1.45 }}>
              {metric.description}
            </Typography>
          </ButtonBase>
        ))}
      </Paper>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", lg: "minmax(0,1.45fr) minmax(310px,1fr)" }, gap: 2.5, alignItems: "start" }}>
        <Stack spacing={2.5} sx={{ minWidth: 0 }}>
          <Paper component="section" variant="outlined" sx={{ p: { xs: 2, md: 2.75 }, borderRadius: 3, borderColor: line, boxShadow: "none" }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1.5} sx={{ mb: 2.25 }}>
              <Box>
                <Typography component="h2" sx={{ color: ink, fontFamily: "var(--ct-font-display)", fontSize: 21, fontWeight: 600, letterSpacing: "-0.02em" }}>Upcoming shifts</Typography>
                <Typography sx={{ color: muted, fontSize: 13.5 }}>The next commitments in your selected workspace.</Typography>
              </Box>
              <Button onClick={onOpenShifts} endIcon={<ArrowForwardRoundedIcon />} sx={{ color: "#5222B8", flexShrink: 0, fontWeight: 800 }}>View all</Button>
            </Stack>
            {dashboardLoading && <Stack spacing={1.2}>{[1,2,3].map((n) => <Skeleton key={n} height={61} />)}</Stack>}
            {!dashboardLoading && !ready && <Typography sx={{ color: muted, fontSize: 14 }}>Shift details are unavailable. Retry the overview to see current work.</Typography>}
            {ready && upcomingShifts.length === 0 && (
              <Box sx={{ bgcolor: "#F4F7FC", px: 2, py: 2.75, borderRadius: 2 }}>
                <Typography sx={{ color: ink, fontWeight: 800 }}>No upcoming shifts in this view.</Typography>
                <Typography sx={{ color: muted, fontSize: 14, mt: 0.5 }}>Use Shift Centre to check other staffing activity.</Typography>
              </Box>
            )}
            {ready && upcomingShifts.map((shift) => (
              <ButtonBase key={shift.id} onClick={onOpenShifts} sx={{ display: "flex", width: "100%", textAlign: "left", justifyContent: "space-between", gap: 2, py: 1.5, px: 0.75, borderTop: "1px solid " + line, "&:hover": { bgcolor: "#F5F7FF" }, "&:focus-visible": { outline: "3px solid #008DDB" } }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ color: ink, fontSize: 15, fontWeight: 800, overflowWrap: "anywhere" }}>{shift.pharmacy_name || "Pharmacy shift"}</Typography>
                  <Typography sx={{ color: muted, fontSize: 13.5 }}>{readableDate(shift.date)}</Typography>
                </Box>
                <ArrowForwardRoundedIcon sx={{ color: "#5222B8", flexShrink: 0 }} />
              </ButtonBase>
            ))}
          </Paper>

          <Paper component="section" variant="outlined" sx={{ p: { xs: 2, md: 2.75 }, borderRadius: 3, borderColor: line, boxShadow: "none" }}>
            <Typography component="h2" sx={{ color: ink, fontFamily: "var(--ct-font-display)", fontSize: 21, fontWeight: 600, letterSpacing: "-0.02em", mb: 1.5 }}>Recent Activity</Typography>
            {dashboardLoading && <Stack spacing={1.2}>{[1,2].map((n) => <Skeleton key={n} height={55} />)}</Stack>}
            {!dashboardLoading && !ready && <Typography sx={{ color: muted, fontSize: 14 }}>Activity could not be loaded.</Typography>}
            {ready && activity.length === 0 && <Typography sx={{ color: muted, fontSize: 14 }}>No recent activity to show in this workspace.</Typography>}
            {ready && activity.map((record, index) => {
              const url = safeActivityUrl(record);
              return (
                <ButtonBase
                  key={index}
                  disabled={!url}
                  onClick={url ? () => navigate(url) : undefined}
                  sx={{ display: "flex", gap: 1.5, width: "100%", textAlign: "left", alignItems: "flex-start", py: 1.4, borderTop: index > 0 ? "1px solid " + line : "none", cursor: url ? "pointer" : "default", "&:focus-visible": { outline: "3px solid #008DDB" } }}
                >
                  <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#5222B8", mt: 0.8, flexShrink: 0 }} />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ color: ink, fontSize: 14, fontWeight: 800 }}>{record.title}</Typography>
                    {record.description && <Typography sx={{ color: muted, fontSize: 13.5, mt: 0.35, overflowWrap: "anywhere" }}>{record.description}</Typography>}
                    {record.time && <Typography sx={{ color: muted, fontSize: 12, mt: 0.35 }}>{record.time}</Typography>}
                  </Box>
                  {url && <ArrowForwardRoundedIcon sx={{ color: "#5222B8", fontSize: 18 }} />}
                </ButtonBase>
              );
            })}
          </Paper>
        </Stack>

        <Stack spacing={2.5} sx={{ minWidth: 0 }}>
          <Paper component="section" variant="outlined" sx={{ p: { xs: 2, md: 2.75 }, borderRadius: 3, borderColor: line, boxShadow: "none" }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
              <CalendarMonthIcon sx={{ color: "#5222B8" }} />
              <Typography component="h2" sx={{ color: ink, fontFamily: "var(--ct-font-display)", fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>Shift calendar snapshot</Typography>
            </Stack>
            {[
              ["Today", upcoming?.today],
              ["Next 7 days", upcoming?.week],
              ["Next 30 days", upcoming?.month],
            ].map(([label, count]) => (
              <Stack key={String(label)} direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 1.15, borderBottom: "1px solid " + line }}>
                <Typography sx={{ color: muted, fontWeight: 700, fontSize: 14 }}>{label}</Typography>
                <Typography sx={{ color: ink, fontWeight: 850, fontSize: 20, fontVariantNumeric: "tabular-nums" }}>
                  {dashboardLoading ? <Skeleton width={42} /> : ready ? readableCount(typeof count === "number" ? count : undefined) : "—"}
                </Typography>
              </Stack>
            ))}
            <Button onClick={onOpenRoster} endIcon={<ArrowForwardRoundedIcon />} sx={{ mt: 1.5, px: 0, color: "#5222B8", fontWeight: 800 }}>Open roster</Button>
          </Paper>

          {canSeeOwnerFinance && (
            <Paper component="section" variant="outlined" sx={{ p: { xs: 2, md: 2.75 }, borderRadius: 3, borderColor: line, boxShadow: "none" }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.75 }}>
                <CreditCardIcon sx={{ color: "#5222B8" }} />
                <Typography component="h2" sx={{ color: ink, fontFamily: "var(--ct-font-display)", fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>Invoices</Typography>
              </Stack>
              <Typography sx={{ color: muted, fontSize: 13 }}>Outstanding total</Typography>
              <Typography sx={{ color: ink, fontWeight: 850, fontSize: 27, fontVariantNumeric: "tabular-nums", mb: 1 }}>
                {dashboardLoading ? <Skeleton width={120} /> : ready ? invoiceSummary?.unpaid_total ?? "—" : "—"}
              </Typography>
              <Typography sx={{ color: muted, fontSize: 13.5 }}>
                {ready ? readableCount(invoiceSummary?.unpaid_count) : "—"} unpaid invoices in this workspace
              </Typography>
              <Button onClick={() => navigate("/dashboard/owner/invoice")} endIcon={<ArrowForwardRoundedIcon />} sx={{ mt: 1.5, px: 0, color: "#5222B8", fontWeight: 800 }}>Review invoices</Button>
            </Paper>
          )}

          {canSeeOwnerFinance && (
            <Paper component="section" variant="outlined" sx={{ px: { xs: 2, md: 2.75 }, py: 2, borderRadius: 3, borderColor: line, boxShadow: "none" }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
                <Box>
                  <Typography sx={{ color: muted, fontSize: 13, fontWeight: 800 }}>Pill balance</Typography>
                  <Typography sx={{ color: ink, fontWeight: 850, fontSize: 24, fontVariantNumeric: "tabular-nums" }}>
                    {pillBalance === null ? "—" : readableCount(pillBalance)}
                  </Typography>
                </Box>
                <Button onClick={onOpenPills} sx={{ color: "#5222B8", fontWeight: 800 }}>View balance</Button>
              </Stack>
            </Paper>
          )}
        </Stack>
      </Box>

      <Paper component="section" variant="outlined" sx={{ px: { xs: 2, md: 2.75 }, py: 2, borderRadius: 3, borderColor: line, boxShadow: "none" }}>
        <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ xs: "flex-start", sm: "center" }} justifyContent="space-between" spacing={1.5}>
          <Typography component="h2" sx={{ color: ink, fontFamily: "var(--ct-font-display)", fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>Workspace tools</Typography>
          <Stack direction="row" flexWrap="wrap" useFlexGap gap={1}>
            {shortcuts.map((link) => (
              <Button key={link.label} size="small" variant="outlined" onClick={link.action} startIcon={link.icon} sx={{ minHeight: 44, textTransform: "none", color: "#32246B", borderColor: "#D2D9E6", fontWeight: 700 }}>
                {link.label}
              </Button>
            ))}
          </Stack>
        </Stack>
      </Paper>
      {totalPharmacies === 0 && workspace === "internal" && (
        <Alert severity="info">No pharmacies are linked to this workspace yet. Add a pharmacy to begin managing its staffing.</Alert>
      )}
    </Stack>
  );
}
