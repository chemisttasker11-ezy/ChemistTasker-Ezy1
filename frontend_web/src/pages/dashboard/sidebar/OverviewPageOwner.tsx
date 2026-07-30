import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Grid,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { Link as RouterLink } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import { getOwnerDashboard } from "@chemisttasker/shared-core";
import { dashboardGreetingName } from "../../../utils/displayName";

const formatShiftDate = (value?: string | null) => {
  if (!value) return "No date provided";
  return value.replace("T", " ").replace("Z", "");
};

type User = {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type ShiftSummary = {
  id: number;
  pharmacy_name: string;
  date: string;
};

type DashboardData = {
  upcoming_shifts_count: number;
  confirmed_shifts_count: number;
  shifts?: ShiftSummary[];
  bills_summary?: Record<string, string>;
};

export default function OverviewPageOwner() {
  const { user } = useAuth() as { user: User };
  const primary = "var(--ct-dashboard-accent, #4A16B8)";

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    getOwnerDashboard({ workspace: "platform" })
      .then((dashboard) => {
        if (!active) {
          return;
        }

        setData(dashboard as any);
        setError(null);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setData(null);
        setError("Error loading dashboard.");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const shifts = useMemo(() => data?.shifts ?? [], [data?.shifts]);

  if (loading) {
    return (
      <Box
        sx={{
          maxWidth: 1200,
          mx: "auto",
          px: { xs: 2, md: 4 },
          py: { xs: 2, md: 4 },
          display: "flex",
          flexDirection: "column",
          gap: { xs: 2, md: 3 },
        }}
      >
        <Skeleton variant="rounded" height={220} />
        <Grid container spacing={2}>
          {Array.from({ length: 4 }).map((_, idx) => (
            <Grid size={{ xs: 12, sm: 6, md: 3 }} key={idx}>
              <Skeleton variant="rounded" height={120} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={280} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ maxWidth: 900, mx: "auto", px: { xs: 2, md: 4 }, py: { xs: 3, md: 6 } }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  const statCards = [
    { label: "Upcoming Shifts", value: data?.upcoming_shifts_count ?? 0 },
    { label: "Confirmed Shifts", value: data?.confirmed_shifts_count ?? 0 },
    { label: "Total Billed", value: data?.bills_summary?.total_billed ?? "--" },
    { label: "Reward Points", value: data?.bills_summary?.points ?? "--" },
  ];

  const welcomeName = dashboardGreetingName(user);

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: 1200,
        mx: "auto",
        px: { xs: 2, md: 4 },
        py: { xs: 2, md: 4 },
        display: "flex",
        flexDirection: "column",
        gap: { xs: 2.5, md: 3 },
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: { xs: 3, md: 4 },
          borderRadius: { xs: 3, md: 4 },
          backgroundImage: "var(--ct-dashboard-gradient, linear-gradient(135deg, #063BDA 0%, #6D28D9 52%, #EA0A8E 100%))",
          color: "#fff",
          overflow: "hidden",
          boxShadow: "0 18px 44px rgba(6, 26, 61, 0.10)",
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={{ xs: 3, md: 4 }}
          alignItems={{ xs: "flex-start", md: "center" }}
          justifyContent="space-between"
        >
          <Box>
            <Typography variant="h4" fontWeight={800} gutterBottom>
              Hello, {welcomeName}!
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.92, maxWidth: 560, mb: 3 }}>
              Track your pharmacy network, manage shifts, and keep everything on schedule. Use the
              quick actions below to jump back into your workflow.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <Button
                variant="contained"
                color="inherit"
                component={RouterLink}
                to="/dashboard/owner/post-shift"
                sx={{ color: primary, borderRadius: "14px", fontWeight: 900 }}
              >
                Post a shift
              </Button>
              <Button
                variant="outlined"
                color="inherit"
                component={RouterLink}
                to="/dashboard/owner/manage-pharmacies/my-pharmacies"
                sx={{ borderColor: alpha("#ffffff", 0.45), color: "#fff", borderRadius: "14px", fontWeight: 900 }}
              >
                Manage pharmacies
              </Button>
            </Stack>
          </Box>

          <Stack direction="column" spacing={1} alignItems={{ xs: "flex-start", md: "flex-end" }}>
            <Typography
              variant="body2"
              sx={{ letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.7 }}
            >
              Health snapshot
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Chip
                label={`Active shifts: ${data?.upcoming_shifts_count ?? 0}`}
                sx={{ bgcolor: alpha("#ffffff", 0.2), color: "#fff" }}
              />
              <Chip
                label={`Network billed: ${data?.bills_summary?.total_billed ?? "--"}`}
                sx={{ bgcolor: alpha("#ffffff", 0.2), color: "#fff" }}
              />
            </Stack>
          </Stack>
        </Stack>
      </Paper>

      <Grid container spacing={2.5}>
        {statCards.map((card) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={card.label}>
            <Paper
              sx={{
                p: 2.5,
                borderRadius: { xs: "20px", md: "28px" },
                bgcolor: "var(--ct-dashboard-card-bg, #FFFFFF)",
                border: "1px solid var(--ct-dashboard-card-border, #E5ECF7)",
                boxShadow: "var(--ct-dashboard-card-shadow, 0 8px 24px rgba(6, 18, 58, 0.04))",
                display: "flex",
                flexDirection: "column",
                gap: 1,
                height: "100%",
              }}
            >
              <Typography variant="subtitle2" color="var(--ct-dashboard-muted, #5E6B8D)">
                {card.label}
              </Typography>
              <Typography variant="h4" fontWeight={900} color="var(--ct-dashboard-title, #06123A)">
                {card.value}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper
        sx={{
          borderRadius: { xs: "20px", md: "28px" },
          bgcolor: "var(--ct-dashboard-card-bg, #FFFFFF)",
          border: "1px solid var(--ct-dashboard-card-border, #E5ECF7)",
          boxShadow: "var(--ct-dashboard-card-shadow, 0 8px 24px rgba(6, 18, 58, 0.04))",
          p: { xs: 2, md: 3 },
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          alignItems={{ xs: "flex-start", sm: "center" }}
          spacing={2}
        >
          <Box flex={1}>
            <Typography variant="h6" fontWeight={900} color="var(--ct-dashboard-title, #06123A)">
              Upcoming shifts
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Stay ahead of staffing and keep your roster flowing.
            </Typography>
          </Box>
          <Button
            component={RouterLink}
            to="/dashboard/owner/shift-center/active"
            endIcon={<ArrowForwardIcon />}
          >
            Manage shifts
          </Button>
        </Stack>

        <Divider sx={{ my: 2 }} />

        <Stack spacing={1.5}>
          {shifts.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No shifts scheduled yet. Start by posting a shift to fill availability.
            </Typography>
          )}

          {shifts.map((shift) => (
            <Stack
              direction={{ xs: "column", sm: "row" }}
              key={shift.id}
              spacing={1}
              alignItems={{ xs: "flex-start", sm: "center" }}
              sx={{
                p: 1.5,
                borderRadius: 2,
                transition: "all 0.2s",
                bgcolor: "var(--ct-dashboard-soft, #EFE7FF)",
                "&:hover": { bgcolor: "var(--ct-dashboard-icon-bg, #EFE7FF)" },
              }}
            >
              <Box flex={1}>
                <Typography fontWeight={600}>{shift.pharmacy_name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatShiftDate(shift.date)}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="text"
                component={RouterLink}
                to={`/dashboard/owner/shifts/${shift.id}`}
                endIcon={<ArrowForwardIcon fontSize="small" />}
                sx={{ color: primary, fontWeight: 800 }}
              >
                View shift
              </Button>
            </Stack>
          ))}
        </Stack>
      </Paper>
    </Box>
  );
}
