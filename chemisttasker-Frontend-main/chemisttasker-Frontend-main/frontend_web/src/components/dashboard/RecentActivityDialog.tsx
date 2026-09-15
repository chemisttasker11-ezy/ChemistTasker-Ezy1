import {
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import ForumIcon from "@mui/icons-material/Forum";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import StoreIcon from "@mui/icons-material/Store";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { alpha } from "@mui/material/styles";
import type { DashboardActivity } from "./DashboardOverviewTemplate";

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

export default function RecentActivityDialog({
  open,
  onClose,
  activity,
  loading = false,
  onActivityClick,
}: {
  open: boolean;
  onClose: () => void;
  activity: DashboardActivity[];
  loading?: boolean;
  onActivityClick?: (event: DashboardActivity) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pr: 7 }}>
        Recent Activity
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 12, top: 10 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Box sx={{ maxHeight: { xs: "70vh", sm: 560 }, overflowY: "auto", p: 2 }}>
          {loading ? (
            <Stack spacing={1.5}>
              {Array.from({ length: 8 }).map((_, index) => (
                <Stack key={index} direction="row" spacing={1.5} alignItems="center">
                  <Skeleton variant="circular" width={40} height={40} />
                  <Box sx={{ flex: 1 }}>
                    <Skeleton width="62%" height={24} />
                    <Skeleton width="88%" height={18} />
                  </Box>
                </Stack>
              ))}
            </Stack>
          ) : activity.length === 0 ? (
            <Typography color="text.secondary" fontWeight={700}>
              No recent activity yet.
            </Typography>
          ) : (
            <Stack divider={<Divider />}>
              {activity.map((event, index) => {
                const clickable = Boolean(onActivityClick && (event.actionUrl || event.action_url));
                return (
                  <ButtonBase
                    key={`${event.kind || "activity"}-${event.targetId || event.target_id || event.title}-${event.time}-${index}`}
                    onClick={() => onActivityClick?.(event)}
                    disabled={!clickable}
                    sx={{
                      width: "100%",
                      display: "block",
                      textAlign: "left",
                      borderRadius: 1,
                      cursor: clickable ? "pointer" : "default",
                      "&:hover": clickable ? { bgcolor: alpha("#5B18E8", 0.05) } : undefined,
                    }}
                  >
                    <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ py: 1.6, px: 0.75 }}>
                      <Box sx={{ color: activityColor(event), width: 24, pt: 0.25, "& svg": { fontSize: 24 } }}>
                        {activityIcon(event)}
                      </Box>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontWeight: 900, fontSize: 14 }}>{event.title}</Typography>
                        <Typography sx={{ color: "#5E6B8D", fontWeight: 700, fontSize: 13 }}>
                          {event.description}
                        </Typography>
                      </Box>
                      <Typography sx={{ color: "#7A86A3", fontWeight: 800, fontSize: 12, whiteSpace: "nowrap" }}>
                        {event.time}
                      </Typography>
                    </Stack>
                  </ButtonBase>
                );
              })}
            </Stack>
          )}
          {!loading && activity.length > 0 && (
            <Button disabled fullWidth sx={{ mt: 2 }}>
              Older activity is not loaded yet
            </Button>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
