import {
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  Stack,
  Typography,
  Button,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  LocationOnOutlined as LocationOnOutlinedIcon,
  FlightTakeoffOutlined as FlightTakeoffOutlinedIcon,
  Star as StarIcon,
  FavoriteBorderOutlined as FavoriteBorderOutlinedIcon,
  FavoriteRounded as FavoriteRoundedIcon,
  CalendarTodayOutlined as CalendarTodayOutlinedIcon,
  WorkOutline as WorkOutlineIcon,
  SchoolOutlined as SchoolOutlinedIcon,
  LocalPharmacyOutlined as LocalPharmacyOutlinedIcon,
  PersonOutline as PersonOutlineIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import { Candidate } from "../types";

export default function TalentCard({
  candidate,
  onViewCalendar,
  onRequestBooking,
  onToggleLike,
  canViewAvailability,
  canRequestBooking,
}: {
  candidate: Candidate;
  onViewCalendar: (candidate: Candidate) => void;
  onRequestBooking: (candidate: Candidate) => void;
  onToggleLike: (candidate: Candidate) => void;
  canViewAvailability?: boolean;
  canRequestBooking?: boolean;
}) {
  let roleColor: "primary" | "success" | "warning" = "primary";
  let RoleIcon = WorkOutlineIcon;

  if (candidate.role.includes("Student") || candidate.role.includes("Intern")) {
    roleColor = "success";
    RoleIcon = SchoolOutlinedIcon;
  } else if (candidate.role.includes("Pharmacist")) {
    roleColor = "primary";
    RoleIcon = LocalPharmacyOutlinedIcon;
  } else if (candidate.role.includes("Junior")) {
    roleColor = "warning";
    RoleIcon = PersonOutlineIcon;
  }

  const availableDateLabels = (candidate.availableDates || [])
    .map((date) => dayjs(date).format("D MMM"))
    .filter(Boolean);
  const visibleDateLabels = availableDateLabels.slice(0, 3);
  const remainingDates = Math.max(availableDateLabels.length - visibleDateLabels.length, 0);
  const showCalendarButton = (candidate.availableDates || []).length > 0;
  const isFullTimeApplication = Boolean(candidate.isFullTimeApplication || candidate.postKind === "FULL_TIME_APPLICATION");
  const travelStateLabel =
    candidate.willingToTravel && (candidate.travelStates || []).length > 0
      ? `Open to Travel: ${(candidate.travelStates || []).join(", ")}`
      : candidate.willingToTravel
        ? "Open to Travel"
        : candidate.coverageRadius;

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 3,
        overflow: "hidden",
        position: "relative",
        bgcolor: "background.paper",
        borderColor: "divider",
      }}
    >
      <Box
        sx={(theme) => ({
          px: 2.5,
          py: 1.5,
          bgcolor: theme.palette.mode === "dark"
            ? alpha(theme.palette.common.white, 0.04)
            : theme.palette.action.hover,
          borderBottom: 1,
          borderColor: "divider",
        })}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <LocationOnOutlinedIcon fontSize="small" />
            <Typography variant="body2" fontWeight={600} color="text.primary">
              {candidate.city || candidate.state}
            </Typography>
            <Chip
              size="small"
              icon={<FlightTakeoffOutlinedIcon fontSize="inherit" />}
              label={travelStateLabel}
              variant="outlined"
              sx={{ borderColor: "divider", color: "text.secondary" }}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
            {candidate.refId}
          </Typography>
        </Stack>
      </Box>

      <CardContent sx={{ pt: 2.5 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ xs: "flex-start", md: "stretch" }}>
          <Stack alignItems="center" spacing={1} sx={{ minWidth: 80 }}>
            <Box
              sx={(theme) => ({
                width: 56,
                height: 56,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: alpha(theme.palette[roleColor].main, theme.palette.mode === "dark" ? 0.2 : 0.12),
                border: 1,
                borderColor: alpha(theme.palette[roleColor].main, 0.35),
              })}
            >
              <RoleIcon color={roleColor} />
            </Box>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <StarIcon fontSize="small" color="warning" />
              <Typography variant="caption" fontWeight={700}>
                {candidate.ratingAverage.toFixed(1)} ({candidate.ratingCount})
              </Typography>
            </Stack>
          </Stack>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={2} alignItems={{ xs: "flex-start", sm: "flex-start" }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography variant="h6" fontWeight={700}>
                    {candidate.role}
                  </Typography>
                  {candidate.experienceBadge && (
                    <Chip
                      size="small"
                      label={candidate.experienceBadge}
                      variant="outlined"
                      sx={{ borderColor: "divider" }}
                    />
                  )}
                </Stack>
                <Typography variant="subtitle2" color="text.secondary">
                  {candidate.headline}
                </Typography>
                {candidate.pitch ? (
                  <Typography variant="body2" sx={{ mt: 1, fontStyle: "italic" }} color="text.secondary">
                    "{candidate.pitch}"
                  </Typography>
                ) : null}
              </Box>
              <Box sx={{ width: { xs: "100%", sm: 320 }, display: "flex", justifyContent: { xs: "flex-start", sm: "flex-end" } }}>
                <Chip
                  size="small"
                  label={`Engagement: ${candidate.workTypes.length ? candidate.workTypes.join(", ") : "-"}`}
                  variant="outlined"
                  sx={{ maxWidth: "100%", borderColor: "divider" }}
                />
              </Box>
            </Stack>

            <Box
              sx={(theme) => ({
                mt: 2,
                p: 1.5,
                bgcolor: theme.palette.mode === "dark"
                  ? alpha(theme.palette.common.white, 0.04)
                  : theme.palette.action.hover,
                borderRadius: 2,
                border: 1,
                borderColor: "divider",
              })}
            >
              <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                {isFullTimeApplication ? (
                  <>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <WorkOutlineIcon fontSize="small" color="action" />
                      <Typography variant="body2">
                        Open to Opportunities
                      </Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      Open anytime
                    </Typography>
                  </>
                ) : (
                  <>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CalendarTodayOutlinedIcon fontSize="small" color="action" />
                      <Typography variant="body2">
                        Availability
                      </Typography>
                    </Stack>
                    {showCalendarButton && canViewAvailability !== false ? (
                      <Button size="small" onClick={() => onViewCalendar(candidate)}>
                        View Calendar
                      </Button>
                    ) : null}
                    {!showCalendarButton && (
                      <Typography variant="caption" color="text.secondary">
                        No dates shared yet
                      </Typography>
                    )}
                  </>
                )}
              </Stack>
              {!isFullTimeApplication && visibleDateLabels.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                  Dates: {visibleDateLabels.join(", ")}
                  {remainingDates > 0 ? ` +${remainingDates}` : ""}
                </Typography>
              )}
            </Box>
          </Box>

          <Stack spacing={1} sx={{ minWidth: 180, alignSelf: { xs: "stretch", md: "center" } }}>
            {isFullTimeApplication && canRequestBooking ? (
              <Button
                variant="contained"
                startIcon={<CalendarTodayOutlinedIcon />}
                onClick={() => onRequestBooking(candidate)}
              >
                Propose Shift
              </Button>
            ) : null}
          {!isFullTimeApplication && showCalendarButton && canRequestBooking && (
            <Stack spacing={1} sx={{ minWidth: 160 }}>
              <Button
                variant="contained"
                startIcon={<CalendarTodayOutlinedIcon />}
                onClick={() => onViewCalendar(candidate)}
              >
                Request Booking
              </Button>
            </Stack>
          )}
          </Stack>
        </Stack>

        {!candidate.isExplorer && (
          <Stack spacing={1} sx={{ mt: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Typography variant="caption" fontWeight={700} color="text.secondary">
                Clinical Services:
              </Typography>
              {candidate.clinicalServices.length > 0 ? (
                candidate.clinicalServices.map((skill) => <Chip key={skill} size="small" label={skill} />)
              ) : (
                <Typography variant="caption" color="text.secondary">
                  --
                </Typography>
              )}
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Typography variant="caption" fontWeight={700} color="text.secondary">
                Dispense Software:
              </Typography>
              {candidate.dispenseSoftware.length > 0 ? (
                candidate.dispenseSoftware.map((skill) => <Chip key={skill} size="small" label={skill} />)
              ) : (
                <Typography variant="caption" color="text.secondary">
                  --
                </Typography>
              )}
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Typography variant="caption" fontWeight={700} color="text.secondary">
                Expanded Scope:
              </Typography>
              {candidate.expandedScope.length > 0 ? (
                candidate.expandedScope.map((skill) => <Chip key={skill} size="small" label={skill} />)
              ) : (
                <Typography variant="caption" color="text.secondary">
                  --
                </Typography>
              )}
            </Stack>
          </Stack>
        )}

      </CardContent>

      <Box sx={{ position: "absolute", right: 16, bottom: 16 }}>
        <IconButton
          onClick={() => onToggleLike(candidate)}
          color={candidate.isLikedByMe ? "error" : "default"}
          size="small"
        >
          {candidate.isLikedByMe ? <FavoriteRoundedIcon /> : <FavoriteBorderOutlinedIcon />}
        </IconButton>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
          {candidate.likeCount}
        </Typography>
      </Box>
    </Card>
  );
}
