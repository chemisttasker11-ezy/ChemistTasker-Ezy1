import { Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import {
  ArrowForwardRounded as ArrowForwardRoundedIcon,
  CalendarMonthOutlined as CalendarMonthOutlinedIcon,
  FavoriteBorderOutlined as FavoriteBorderOutlinedIcon,
  FlightTakeoffOutlined as FlightTakeoffOutlinedIcon,
  LocationOnOutlined as LocationOnOutlinedIcon,
  StarRounded as StarRoundedIcon,
  WorkOutlineRounded as WorkOutlineRoundedIcon,
} from "@mui/icons-material";
import type { Candidate } from "../types";
import skillsRegistry from "@chemisttasker/shared-core/skills_registry.json";
import { VerificationBadges } from "@chemisttasker/shared-ui/VerificationBadges";
import { splitSkillsAndSoftware } from "@chemisttasker/shared-core";
import SkillIcon, { skillLabel } from "@/public/skill-icon";
import { RoleTile } from "../../../../../../shared-ui/talent/RoleTile";

type PublicTalentCardProps = {
  candidate: Candidate;
  onViewCalendar: (candidate: Candidate) => void;
  onToggleLike: (candidate: Candidate) => void;
  onRequestBooking: (candidate: Candidate) => void;
  canViewAvailability: boolean;
  canRequestBooking: boolean;
};

const INK = "#06123A";
const MUTED = "#445474";
const PURPLE = "#5222B8";

export default function PublicTalentCard({
  candidate,
  onViewCalendar,
  onToggleLike,
  onRequestBooking,
  canViewAvailability,
  canRequestBooking,
}: PublicTalentCardProps) {
  const location = [candidate.city, candidate.state]
    .filter((part, index, all) => Boolean(part) && all.indexOf(part) === index)
    .join(", ");
  const isOpenToWork = Boolean(candidate.isFullTimeApplication || candidate.postKind === "FULL_TIME_APPLICATION");
  const datesPublished = candidate.availableDates?.length || 0;
  // Registry IDs: skills and named software shown apart, three of each on the compact card.
  const split = splitSkillsAndSoftware(skillsRegistry as any, [...(candidate.skills || []), ...(candidate.dispenseSoftware || [])].filter(Boolean));
  const skills = split.skills.slice(0, 3);
  const software = split.software.slice(0, 3);
  const roleLabel = candidate.role || "Pharmacy professional";
  const hasRating = Number.isFinite(candidate.ratingAverage) && candidate.ratingCount > 0;
  const canBook = canRequestBooking && !isOpenToWork && datesPublished > 0;
  const hasCalendarDates = !isOpenToWork && datesPublished > 0;
  const primaryAction = isOpenToWork && canRequestBooking ? () => onRequestBooking(candidate) : hasCalendarDates ? () => onViewCalendar(candidate) : () => onToggleLike(candidate);
  const primaryLabel = isOpenToWork && canRequestBooking ? "Propose shift" : hasCalendarDates ? (canViewAvailability ? "View availability" : "Sign in to view dates") : (canViewAvailability ? "Save profile" : "Sign in to save profile");

  return (
    <Paper
      component="article"
      variant="outlined"
      aria-label={roleLabel + " talent profile"}
      sx={{
        overflow: "hidden",
        p: { xs: 2, sm: 2.5, md: 3 },
        border: "1px solid #DEE5EF",
        borderRadius: "16px",
        bgcolor: "#FFFFFF",
        boxShadow: "0 5px 20px rgba(6,18,58,.035)",
        transition: "border-color 180ms ease, box-shadow 180ms ease",
        "&:hover": {
          borderColor: "#B8A8DE",
          boxShadow: "0 12px 32px rgba(6,18,58,.085)",
        },
        "@media (prefers-reduced-motion: reduce)": { transition: "none" },
      }}
    >
      <Stack direction={{ xs: "column", md: "row" }} spacing={{ xs: 2.25, md: 3 }} alignItems="stretch">
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <RoleTile role={candidate.role} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography component="h3" sx={{ color: INK, fontFamily: "Outfit, sans-serif", fontSize: { xs: 21, md: 24 }, fontWeight: 650, lineHeight: 1.2, overflowWrap: "anywhere" }}>
                {roleLabel}
              </Typography>
              {candidate.headline && (
                <Typography sx={{ color: MUTED, fontSize: 14, lineHeight: 1.45, mt: 0.55, overflowWrap: "anywhere" }}>
                  {candidate.headline}
                </Typography>
              )}
              {candidate.verification && (
                <Box sx={{ mt: 1 }}>
                  <VerificationBadges summary={candidate.verification} role={candidate.role} compact />
                </Box>
              )}
            </Box>
            {hasRating && (
              <Stack direction="row" alignItems="center" spacing={0.35} aria-label={"Rated " + candidate.ratingAverage.toFixed(1) + " from " + candidate.ratingCount + " reviews"} sx={{ flexShrink: 0, pt: 0.2 }}>
                <StarRoundedIcon aria-hidden="true" sx={{ fontSize: 18, color: "#966000" }} />
                <Typography sx={{ color: INK, fontSize: 13, fontWeight: 800 }}>{candidate.ratingAverage.toFixed(1)}</Typography>
                <Typography sx={{ color: MUTED, fontSize: 12 }}>({candidate.ratingCount})</Typography>
              </Stack>
            )}
          </Stack>

          <Stack direction="row" flexWrap="wrap" spacing={0} useFlexGap gap={{ xs: 1, md: 2 }} sx={{ mt: 2 }}>
            {location && (
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <LocationOnOutlinedIcon aria-hidden="true" sx={{ color: "#667592", fontSize: 18 }} />
                <Typography sx={{ color: MUTED, fontSize: 13.5 }}>{location}</Typography>
              </Stack>
            )}
            {(candidate.experienceBadge || candidate.experience != null) && (
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <WorkOutlineRoundedIcon aria-hidden="true" sx={{ color: "#667592", fontSize: 18 }} />
                <Typography sx={{ color: MUTED, fontSize: 13.5 }}>{candidate.experienceBadge || (candidate.experience + " years experience")}</Typography>
              </Stack>
            )}
            {candidate.willingToTravel && (
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <FlightTakeoffOutlinedIcon aria-hidden="true" sx={{ color: "#667592", fontSize: 18 }} />
                <Typography sx={{ color: MUTED, fontSize: 13.5 }}>Open to travel</Typography>
              </Stack>
            )}
          </Stack>

          {candidate.pitch && (
            <Typography sx={{
              color: "#344563", fontSize: 14, lineHeight: 1.65, mt: 2,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
              overflowWrap: "anywhere",
            }}>
              {candidate.pitch}
            </Typography>
          )}

          {candidate.workTypes.length > 0 && (
            <Stack direction="row" useFlexGap flexWrap="wrap" gap={0.65} sx={{ mt: 1.75 }}>
              {candidate.workTypes.slice(0, 3).map((type) => (
                <Chip key={type} size="small" label={type} sx={{
                  bgcolor: "#EFF2F8", color: "#334565", fontWeight: 750,
                  borderRadius: "7px", height: 27, "& .MuiChip-label": { px: 1.15, fontSize: 12 },
                }} />
              ))}
            </Stack>
          )}

          {(skills.length > 0 || software.length > 0) && (
            <Stack spacing={1} sx={{ mt: 2 }}>
              {skills.length > 0 && (
                <Stack direction="row" useFlexGap flexWrap="wrap" gap={0.75} alignItems="center">
                  <Typography sx={{ fontSize: 12, color: MUTED, fontWeight: 800, minWidth: 65 }}>Skills</Typography>
                  {skills.map((skill) => (
                    <Chip key={skill} size="small" icon={<SkillIcon skill={skill} size={16} />} label={skillLabel(skill)} variant="outlined" sx={{
                      maxWidth: "100%", height: "auto", minHeight: 28, bgcolor: "#FAFBFE",
                      borderColor: "#DCE3EF", borderRadius: "8px", color: "#344563",
                      "& .MuiChip-label": { whiteSpace: "normal", fontSize: 12, py: 0.45 },
                    }} />
                  ))}
                </Stack>
              )}
              {software.length > 0 && (
                <Stack direction="row" useFlexGap flexWrap="wrap" gap={0.75} alignItems="center">
                  <Typography sx={{ fontSize: 12, color: MUTED, fontWeight: 800, minWidth: 65 }}>Software</Typography>
                  {software.map((skill) => (
                    <Chip key={skill} size="small" icon={<SkillIcon skill={skill} size={16} />} label={skillLabel(skill)} variant="outlined" sx={{
                      maxWidth: "100%", minHeight: 28, height: "auto", borderColor: "#CBE5EB",
                      borderRadius: "8px", bgcolor: "#F1FAFB", color: "#075B71",
                      "& .MuiChip-label": { whiteSpace: "normal", fontSize: 12, py: 0.45 },
                    }} />
                  ))}
                </Stack>
              )}
            </Stack>
          )}
        </Box>

        <Box sx={{
          width: { xs: "100%", md: 205 }, flexShrink: 0,
          pt: { xs: 1.75, md: 0 }, pl: { xs: 0, md: 2.5 },
          borderTop: { xs: "1px solid #E4E9F2", md: "none" },
          borderLeft: { md: "1px solid #E4E9F2" },
          display: "flex", flexDirection: "column", justifyContent: "center",
        }}>
          <Stack direction="row" spacing={0.65} alignItems="center">
            <CalendarMonthOutlinedIcon aria-hidden="true" sx={{ color: PURPLE, fontSize: 19 }} />
            <Typography sx={{ color: MUTED, fontWeight: 800, fontSize: 12.5 }}>Availability</Typography>
          </Stack>
          <Typography sx={{ color: INK, mt: 0.9, fontWeight: 850, fontSize: 16, lineHeight: 1.4 }}>
            {isOpenToWork ? "Open to opportunities" : datesPublished ? "Dates published" : "Ask about availability"}
          </Typography>
          {datesPublished > 0 && !isOpenToWork && (
            <Typography sx={{ color: MUTED, fontSize: 12.5, mt: 0.3 }}>
              {datesPublished} {datesPublished === 1 ? "date" : "dates"} shared
            </Typography>
          )}
          <Button
            variant="contained"
            fullWidth
            endIcon={<ArrowForwardRoundedIcon />}
            onClick={primaryAction}
            sx={{
              mt: 2, minHeight: 46, fontSize: 13, borderRadius: "10px",
              bgcolor: PURPLE, color: "#FFFFFF", textTransform: "none", fontWeight: 800,
              "&:hover": { bgcolor: "#40168F" },
            }}
          >
            {primaryLabel}
          </Button>
          {canBook ? (
            <Button onClick={() => onRequestBooking(candidate)} variant="text" sx={{ minHeight: 44, mt: 0.5, fontSize: 12.5, fontWeight: 750, textTransform: "none" }}>
              Request booking
            </Button>
          ) : (
            <Button
              variant="text"
              startIcon={<FavoriteBorderOutlinedIcon />}
              onClick={() => onToggleLike(candidate)}
              sx={{ minHeight: 44, mt: 0.5, fontSize: 12.5, fontWeight: 750, textTransform: "none" }}
            >
              {candidate.isLikedByMe ? "Saved" : "Save profile"}
            </Button>
          )}
          {candidate.refId && candidate.refId !== "REF-0000" && (
            <Typography sx={{ color: "#63718B", fontSize: 11.5, mt: 1, textAlign: { md: "center" } }}>
              {candidate.refId}
            </Typography>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}
