import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  ButtonBase,
  Paper,
  Stack,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HistoryIcon from "@mui/icons-material/History";
import ActiveShiftsPage from "../sidebar/ActiveShiftsPage";
import ConfirmedShiftsPage from "../sidebar/ConfirmedShiftsPage";
import HistoryShiftsPage from "../sidebar/HistoryShiftsPage";
import AdminActiveShiftsPage from "../admin/AdminActiveShiftsPage";
import AdminConfirmedShiftsPage from "../admin/AdminConfirmedShiftsPage";
import AdminHistoryShiftsPage from "../admin/AdminHistoryShiftsPage";

type Section = "active" | "confirmed" | "history";
const ALL_SECTIONS: Section[] = ["active", "confirmed", "history"];

type Scope = "owner" | "organization" | "admin";

type BaseProps = {
  scope: Scope;
  basePath: string;
  title: string;
  subtitle: string;
};

function ShiftCenterLayout({ scope, basePath, title, subtitle }: BaseProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const navigate = useNavigate();
  const params = useParams<{ section?: string }>();

  const currentSection: Section = useMemo(() => {
    if (params.section && ALL_SECTIONS.includes(params.section as Section)) {
      return params.section as Section;
    }
    return "active";
  }, [params.section]);

  useEffect(() => {
    if (!params.section || !ALL_SECTIONS.includes(params.section as Section)) {
      navigate(`${basePath}/active`, { replace: true });
    }
  }, [params.section, basePath, navigate]);

  const handleTabChange = (value: Section) => {
    if (value === currentSection) {
      return;
    }
    navigate(`${basePath}/${value}`);
  };

  const heroGradient = useMemo(
    () =>
      `linear-gradient(135deg, ${alpha(
        theme.palette.primary.main,
        0.94
      )}, ${alpha(theme.palette.primary.dark, 0.74)})`,
    [theme.palette.primary.dark, theme.palette.primary.main]
  );

  const SectionComponent = useMemo(() => {
    if (scope === "admin") {
      switch (currentSection) {
        case "confirmed":
          return AdminConfirmedShiftsPage;
        case "history":
          return AdminHistoryShiftsPage;
        case "active":
        default:
          return AdminActiveShiftsPage;
      }
    }
    switch (currentSection) {
      case "confirmed":
        return ConfirmedShiftsPage;
      case "history":
        return HistoryShiftsPage;
      case "active":
      default:
        return ActiveShiftsPage;
    }
  }, [scope, currentSection]);

  const tabItems = useMemo(() => [
    {
      value: "active" as Section,
      label: "Active Shifts",
      icon: <PlayArrowIcon fontSize="small" />,
    },
    {
      value: "confirmed" as Section,
      label: "Confirmed Shifts",
      icon: <CheckCircleIcon fontSize="small" />,
    },
    {
      value: "history" as Section,
      label: "Shifts History",
      icon: <HistoryIcon fontSize="small" />,
    },
  ], []);

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: 1440,
        minWidth: 0,
        mx: "auto",
        px: { xs: 1, sm: 1.5, md: 3.5 },
        py: { xs: 1.5, md: 4 },
        display: "flex",
        flexDirection: "column",
        gap: { xs: 2.5, md: 3 },
        overflowX: "hidden",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 3, md: 4 },
          borderRadius: { xs: 3, md: 4 },
          backgroundImage: heroGradient,
          color: "#fff",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={{ xs: 2, md: 3 }}
          alignItems={{ xs: "flex-start", md: "center" }}
          justifyContent="space-between"
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" sx={{ opacity: 0.72, letterSpacing: ".1em" }}>
              Shift Centre
            </Typography>
            <Typography
              variant="h4"
              fontWeight={800}
              gutterBottom
              sx={{ fontSize: { xs: 30, sm: 34, md: 42 }, lineHeight: 1.08, overflowWrap: "anywhere" }}
            >
              {title}
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.92, maxWidth: 560, fontSize: { xs: 15, sm: 16 } }}>
              {subtitle}
            </Typography>
          </Box>
        </Stack>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          borderRadius: { xs: 3, md: 4 },
          border: `1px solid ${isDark ? alpha(theme.palette.common.white, 0.12) : alpha(theme.palette.divider, 0.7)}`,
          backgroundColor: isDark ? alpha(theme.palette.common.white, 0.035) : theme.palette.background.paper,
          boxShadow: isDark ? `0 24px 80px ${alpha(theme.palette.common.black, 0.22)}` : "none",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: { xs: 0.75, sm: 1.5 },
            px: { xs: 1.5, md: 2.5 },
            pt: { xs: 1.5, md: 2 },
            maxWidth: "100%",
            minWidth: 0,
          }}
        >
          {tabItems.map((tab) => {
            const selected = currentSection === tab.value;
            return (
              <ButtonBase
                key={tab.value}
                onClick={() => handleTabChange(tab.value)}
                disableRipple
                sx={{
                  minWidth: 0,
                  width: "100%",
                  minHeight: { xs: 44, sm: 52 },
                  borderRadius: 999,
                  px: { xs: 0.75, sm: 2.25, md: 3.5 },
                  py: { xs: 0.85, sm: 1.3 },
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: { xs: 0.5, sm: 1 },
                  color: selected
                    ? isDark
                      ? "#C4B5FD"
                      : theme.palette.primary.main
                    : isDark
                      ? alpha(theme.palette.common.white, 0.78)
                      : alpha(theme.palette.text.primary, 0.72),
                  border: `1px solid ${
                    selected
                      ? alpha(theme.palette.primary.main, isDark ? 0.55 : 0.38)
                      : isDark
                        ? alpha(theme.palette.common.white, 0.12)
                        : alpha(theme.palette.divider, 0.6)
                  }`,
                  backgroundColor: selected
                    ? alpha(theme.palette.primary.main, isDark ? 0.24 : 0.12)
                    : isDark
                      ? alpha(theme.palette.common.white, 0.06)
                      : "#fff",
                  boxShadow: selected ? `0 10px 24px ${alpha(theme.palette.primary.main, isDark ? 0.25 : 0.18)}` : "none",
                  transition: theme.transitions.create(["color", "background-color", "border-color", "box-shadow"]),
                  "&:hover": {
                    backgroundColor: selected
                      ? alpha(theme.palette.primary.main, isDark ? 0.3 : 0.16)
                      : alpha(theme.palette.primary.main, isDark ? 0.16 : 0.08),
                    borderColor: alpha(theme.palette.primary.main, selected ? 0.55 : 0.3),
                    color: selected
                      ? isDark
                        ? "#DDD6FE"
                        : theme.palette.primary.main
                      : isDark
                        ? theme.palette.common.white
                        : theme.palette.primary.main,
                  },
                  "&:focus-visible": {
                    outline: `3px solid ${alpha(theme.palette.primary.main, isDark ? 0.35 : 0.22)}`,
                    outlineOffset: 2,
                  },
                  "& svg": {
                    fontSize: { xs: 16, sm: 20 },
                    flexShrink: 0,
                  },
                }}
              >
                {tab.icon}
                <Typography
                  component="span"
                  sx={{
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "clip",
                    whiteSpace: "nowrap",
                    textTransform: "none",
                    fontWeight: 800,
                    fontSize: { xs: 10.5, sm: 14, md: 16 },
                    lineHeight: 1.1,
                  }}
                >
                  {tab.label}
                </Typography>
              </ButtonBase>
            );
          })}
        </Box>
        <Box
          sx={{
            px: { xs: 0.75, sm: 1.5, md: 2.5 },
            pb: { xs: 2, md: 3 },
            pt: { xs: 1.5, md: 3 },
            minWidth: 0,
            maxWidth: "100%",
            overflowX: "hidden",
          }}
        >
          <SectionComponent />
        </Box>
      </Paper>
    </Box>
  );
}

export function OwnerShiftCenterPage() {
  return (
    <ShiftCenterLayout
      scope="owner"
      basePath="/dashboard/owner/shift-center"
      title="Manage your pharmacy shifts"
      subtitle="Review upcoming, confirmed, and past shifts across your pharmacies."
    />
  );
}

export function OrganizationShiftCenterPage() {
  return (
    <ShiftCenterLayout
      scope="organization"
      basePath="/dashboard/organization/shift-center"
      title="Organization shift operations"
      subtitle="Track staffing progress and coverage across your claimed pharmacies."
    />
  );
}

export function AdminShiftCenterPage() {
  const params = useParams<{ pharmacyId: string; section?: string }>();
  const pharmacyId = params.pharmacyId;

  if (!pharmacyId) {
    return null;
  }

  const basePath = `/dashboard/admin/${pharmacyId}/shift-center`;

  return (
    <ShiftCenterLayout
      scope="admin"
      basePath={basePath}
      title="Admin pharmacy shifts"
      subtitle="Monitor shift activity and confirmations for your selected pharmacy."
    />
  );
}

