import { useState } from "react";
import { VerificationBadges } from "@chemisttasker/shared-ui/VerificationBadges";
import { WorkerSkillRows } from "@chemisttasker/shared-ui/WorkerSkills";
import {
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  Stack,
  Typography,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
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
  ExpandMore as ExpandMoreIcon,
  AccessTime as AccessTimeIcon,
} from "@mui/icons-material";
import { RoleTile } from "../../../../../../landing_next/shared-ui/talent/RoleTile";
import dayjs from "dayjs";
import { Candidate } from "../types";

import { ReportButton } from '@chemisttasker/shared-ui/ReportButton';
const formatAuSlotDate = (date: string) => {
  const parsed = dayjs(date);
  return parsed.isValid() ? parsed.format("ddd, D MMM YYYY") : date;
};

const formatAuSlotTime = (time?: string | null) => {
  if (!time) return "";
  const parsed = dayjs(`2000-01-01T${String(time).slice(0, 5)}`);
  return parsed.isValid() ? parsed.format("h:mm A") : String(time);
};

const formatSlotTimeRange = (slot: { startTime?: string | null; endTime?: string | null; isAllDay?: boolean }) => {
  if (slot.isAllDay) return "All day";
  const start = formatAuSlotTime(slot.startTime);
  const end = formatAuSlotTime(slot.endTime);
  return start && end ? `${start} - ${end}` : "Time not set";
};

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
  const availabilitySlots = (candidate.availableSlots || [])
    .filter((slot) => slot?.date)
    .sort((a, b) => `${a.date}T${a.startTime || ""}`.localeCompare(`${b.date}T${b.startTime || ""}`));
  const [availabilityExpanded, setAvailabilityExpanded] = useState(false);
  const displayedAvailabilitySlots = availabilityExpanded ? availabilitySlots : availabilitySlots.slice(0, 2);
  const remainingSlots = Math.max(availabilitySlots.length - 2, 0);
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
      component="article"
      variant="outlined"
      aria-label={candidate.role + " talent profile"}
      sx={{
        borderRadius: "var(--ct-card-radius)",
        overflow: "hidden",
        position: "relative",
        bgcolor: "var(--ct-surface-bg)",
        borderColor: "var(--ct-border-color)",
        boxShadow: "none",
        transition: "border-color 160ms ease, box-shadow 160ms ease",
        "&:hover": { borderColor: "var(--ct-accent-strong)", boxShadow: "0 10px 28px rgba(6, 18, 58, 0.08)" },
        "@media (prefers-reduced-motion: reduce)": { transition: "none" },
      }}
    >
      <CardContent sx={{ pt: 2.5 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ xs: "flex-start", md: "stretch" }}>
          <Stack alignItems="center" spacing={1} sx={{ minWidth: 80 }}>
            <RoleTile role={candidate.role} size={56} />
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
                  <Typography component="h3" sx={{ fontFamily: "var(--ct-font-display)", fontWeight: 500, fontSize: { xs: 19, md: 21 }, lineHeight: 1.25, color: "var(--ct-text-primary)" }}>
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
                <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 14, mt: 0.5 }}>
                  {candidate.headline}
                </Typography>
                {candidate.verification && (
                  <Box sx={{ mt: 1 }}>
                    <VerificationBadges summary={candidate.verification} role={candidate.role} compact />
                  </Box>
                )}
                <Stack direction="row" spacing={0} useFlexGap flexWrap="wrap" gap={1.5} sx={{ mt: 1.25, color: "var(--ct-text-secondary)", "& svg": { fontSize: 18 } }}>
                  {(candidate.city || candidate.state) && (
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <LocationOnOutlinedIcon aria-hidden />
                      <Typography sx={{ fontSize: 13.5, color: "inherit" }}>{[candidate.city, candidate.state].filter((part, index, all) => part && all.indexOf(part) === index).join(", ")}</Typography>
                    </Stack>
                  )}
                  {travelStateLabel && (
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <FlightTakeoffOutlinedIcon aria-hidden />
                      <Typography sx={{ fontSize: 13.5, color: "inherit" }}>{travelStateLabel}</Typography>
                    </Stack>
                  )}
                </Stack>
                {candidate.pitch ? (
                  <Typography sx={{ mt: 1.25, fontSize: 14, lineHeight: 1.6, color: "var(--ct-text-primary)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {candidate.pitch}
                  </Typography>
                ) : null}
                {(candidate.workTypes.length > 0 || (candidate.refId && candidate.refId !== "REF-0000")) && (
                  <Stack direction="row" useFlexGap flexWrap="wrap" alignItems="center" gap={0.75} sx={{ mt: 1.25 }}>
                    {candidate.workTypes.map((type) => (
                      <Chip key={type} size="small" label={type} sx={{ bgcolor: "var(--ct-subtle-bg)", color: "var(--ct-text-primary)", fontWeight: 600 }} />
                    ))}
                    {candidate.refId && candidate.refId !== "REF-0000" && (
                      <Typography sx={{ fontSize: 11.5, color: "var(--ct-text-muted)", ml: 0.5 }}>{candidate.refId}</Typography>
                    )}
                  </Stack>
                )}
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
              {!isFullTimeApplication && availabilitySlots.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Accordion
                    disableGutters
                    elevation={0}
                    expanded={availabilityExpanded}
                    onChange={(_, expanded) => setAvailabilityExpanded(expanded)}
                    sx={{
                      bgcolor: "transparent",
                      border: 0,
                      "&:before": { display: "none" },
                      "& .MuiAccordionSummary-root": { minHeight: 34, px: 0 },
                      "& .MuiAccordionSummary-content": { my: 0.5 },
                      "& .MuiAccordionDetails-root": { px: 0, pt: 0.5, pb: 0 },
                    }}
                  >
                    <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />}>
                      <Typography variant="caption" color="text.secondary" fontWeight={700}>
                        {availabilitySlots.length} available slot{availabilitySlots.length === 1 ? "" : "s"}
                        {remainingSlots > 0 ? ` (${remainingSlots} more)` : ""}
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Stack spacing={0.75}>
                        {displayedAvailabilitySlots.map((slot, index) => (
                          <Stack key={`${slot.date}-${slot.startTime}-${index}`} direction="row" spacing={1} alignItems="flex-start">
                            <LocationOnOutlinedIcon sx={{ fontSize: 16, color: "primary.main", mt: 0.15 }} />
                            <Box>
                              <Typography variant="caption" fontWeight={700} color="text.primary" display="block">
                                {formatAuSlotDate(slot.date)}
                              </Typography>
                              <Stack direction="row" spacing={0.5} alignItems="center">
                                <AccessTimeIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                                <Typography variant="caption" color="text.secondary">
                                  {formatSlotTimeRange(slot)}
                                </Typography>
                              </Stack>
                            </Box>
                          </Stack>
                        ))}
                      </Stack>
                    </AccordionDetails>
                  </Accordion>
                </Box>
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
          <Box sx={{ mt: 2, pt: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
            <WorkerSkillRows compact skills={[...candidate.clinicalServices, ...candidate.dispenseSoftware, ...candidate.expandedScope]}
              verification={candidate.verification ?? null} />
          </Box>
        )}

      </CardContent>

      {/* Phones: under the card content (an absolute row would cover the booking button). */}
      <Box sx={{ position: { xs: "static", md: "absolute" }, right: 16, bottom: 16, display: "flex", alignItems: "center", justifyContent: "flex-end", px: { xs: 2, md: 0 }, pb: { xs: 1.5, md: 0 } }}>
        <ReportButton kind="talent" id={candidate.id} />
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
