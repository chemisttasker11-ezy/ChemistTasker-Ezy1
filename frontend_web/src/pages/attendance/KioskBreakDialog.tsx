import type { Dispatch, SetStateAction } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import BackspaceIcon from "@mui/icons-material/Backspace";
import CoffeeIcon from "@mui/icons-material/Coffee";
import PersonIcon from "@mui/icons-material/Person";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import RestaurantIcon from "@mui/icons-material/Restaurant";

export type KioskBreakActionType = "LUNCH_30" | "TEA_10" | "END";

export type KioskActiveStaff = {
  worker_id: number;
  worker_name: string;
  email: string;
  role: string;
  session_id: number;
  started_at: string;
  is_on_break: boolean;
  break_started_at: string | null;
  break_elapsed_seconds: number;
  has_pin: boolean;
};

export type KioskBreakStaff = {
  worker_id: number;
  worker_name: string;
  is_on_break: boolean;
  has_pin: boolean;
};

type Props = {
  breakDialogOpen: boolean;
  setBreakDialogOpen: Dispatch<SetStateAction<boolean>>;
  breakActionType: KioskBreakActionType;
  setBreakActionType: Dispatch<SetStateAction<KioskBreakActionType>>;
  setBreakError: Dispatch<SetStateAction<string | null>>;
  breakError: string | null;
  loadingActiveStaff: boolean;
  activeStaffList: KioskActiveStaff[];
  selectedStaffForBreak: KioskBreakStaff | null;
  setSelectedStaffForBreak: Dispatch<SetStateAction<KioskBreakStaff | null>>;
  handleSelectStaffForBreak: (staff: KioskActiveStaff) => void;
  breakConfirmPin: string;
  setBreakConfirmPin: Dispatch<SetStateAction<string>>;
  breakSubmitting: boolean;
  handleConfirmBreakAction: () => void | Promise<void>;
};

export default function KioskBreakDialog({
  breakDialogOpen,
  setBreakDialogOpen,
  breakActionType,
  setBreakActionType,
  setBreakError,
  breakError,
  loadingActiveStaff,
  activeStaffList,
  selectedStaffForBreak,
  setSelectedStaffForBreak,
  handleSelectStaffForBreak,
  breakConfirmPin,
  setBreakConfirmPin,
  breakSubmitting,
  handleConfirmBreakAction,
}: Props) {
  return (
    <>
{/* Break Station Dialog */}
      <Dialog
        open={breakDialogOpen}
        onClose={() => {
          setBreakDialogOpen(false);
          setSelectedStaffForBreak(null);
        }}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: "#1e293b",
            color: "white",
            borderRadius: 3,
            border: "1px solid rgba(255,255,255,0.1)",
          },
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            {breakActionType === "LUNCH_30" ? (
              <RestaurantIcon sx={{ color: "#f59e0b", fontSize: 28 }} />
            ) : breakActionType === "TEA_10" ? (
              <CoffeeIcon sx={{ color: "#06b6d4", fontSize: 28 }} />
            ) : (
              <PlayCircleOutlineIcon sx={{ color: "#10b981", fontSize: 28 }} />
            )}
            <Box>
              <Typography variant="h6" fontWeight={700} sx={{ color: "white" }}>
                {breakActionType === "LUNCH_30"
                  ? "Start Lunch Break (30 Mins)"
                  : breakActionType === "TEA_10"
                  ? "Start Tea Break (10 Mins)"
                  : "End Break & Resume Shift"}
              </Typography>
              <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                Select your name from the clocked-in staff below
              </Typography>
            </Box>
          </Stack>
        </DialogTitle>

        {/* Break Type Tabs */}
        <Box sx={{ px: 3, pt: 1, pb: 2 }}>
          <Grid container spacing={1}>
            <Grid size={{ xs: 4 }}>
              <Button
                fullWidth
                size="small"
                variant={breakActionType === "LUNCH_30" ? "contained" : "outlined"}
                startIcon={<RestaurantIcon />}
                onClick={() => {
                  setBreakActionType("LUNCH_30");
                  setSelectedStaffForBreak(null);
                  setBreakError(null);
                }}
                sx={{
                  textTransform: "none",
                  fontWeight: 700,
                  fontSize: 12,
                  bgcolor: breakActionType === "LUNCH_30" ? "#f59e0b" : "transparent",
                  color: breakActionType === "LUNCH_30" ? "#0f172a" : "#f59e0b",
                  borderColor: "#f59e0b",
                  "&:hover": { bgcolor: breakActionType === "LUNCH_30" ? "#d97706" : "rgba(245, 158, 11, 0.1)" },
                }}
              >
                Lunch (30m)
              </Button>
            </Grid>
            <Grid size={{ xs: 4 }}>
              <Button
                fullWidth
                size="small"
                variant={breakActionType === "TEA_10" ? "contained" : "outlined"}
                startIcon={<CoffeeIcon />}
                onClick={() => {
                  setBreakActionType("TEA_10");
                  setSelectedStaffForBreak(null);
                  setBreakError(null);
                }}
                sx={{
                  textTransform: "none",
                  fontWeight: 700,
                  fontSize: 12,
                  bgcolor: breakActionType === "TEA_10" ? "#06b6d4" : "transparent",
                  color: breakActionType === "TEA_10" ? "#0f172a" : "#06b6d4",
                  borderColor: "#06b6d4",
                  "&:hover": { bgcolor: breakActionType === "TEA_10" ? "#0891b2" : "rgba(6, 182, 212, 0.1)" },
                }}
              >
                Tea Break (10m)
              </Button>
            </Grid>
            <Grid size={{ xs: 4 }}>
              <Button
                fullWidth
                size="small"
                variant={breakActionType === "END" ? "contained" : "outlined"}
                startIcon={<PlayCircleOutlineIcon />}
                onClick={() => {
                  setBreakActionType("END");
                  setSelectedStaffForBreak(null);
                  setBreakError(null);
                }}
                sx={{
                  textTransform: "none",
                  fontWeight: 700,
                  fontSize: 12,
                  bgcolor: breakActionType === "END" ? "#10b981" : "transparent",
                  color: breakActionType === "END" ? "white" : "#10b981",
                  borderColor: "#10b981",
                  "&:hover": { bgcolor: breakActionType === "END" ? "#059669" : "rgba(16, 185, 129, 0.1)" },
                }}
              >
                End Break
              </Button>
            </Grid>
          </Grid>
        </Box>

        <Divider sx={{ borderColor: "rgba(255,255,255,0.1)" }} />

        <DialogContent sx={{ py: 2 }}>
          {breakError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {breakError}
            </Alert>
          )}

          {loadingActiveStaff ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : activeStaffList.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <Typography variant="body1" sx={{ color: "#94a3b8" }}>
                No staff members are currently clocked in at this pharmacy.
              </Typography>
              <Typography variant="caption" sx={{ color: "#64748b", mt: 1, display: "block" }}>
                Clock in with your Staff ID or QR code first.
              </Typography>
            </Box>
          ) : (
            <Stack spacing={1.5}>
              {activeStaffList.map((staff) => {
                const isSelected = selectedStaffForBreak?.worker_id === staff.worker_id;
                const isActionStart = breakActionType !== "END";
                const cannotStart = isActionStart && staff.is_on_break;
                const cannotEnd = !isActionStart && !staff.is_on_break;

                return (
                  <Paper
                    key={staff.worker_id}
                    onClick={() => {
                      if (cannotStart || cannotEnd) return;
                      handleSelectStaffForBreak(staff);
                    }}
                    sx={{
                      p: 2,
                      bgcolor: isSelected
                        ? "rgba(56, 189, 248, 0.15)"
                        : "rgba(255,255,255,0.04)",
                      border: isSelected
                        ? "2px solid #38bdf8"
                        : "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 2.5,
                      cursor: cannotStart || cannotEnd ? "not-allowed" : "pointer",
                      opacity: cannotStart || cannotEnd ? 0.5 : 1,
                      transition: "all 0.2s ease",
                      "&:hover": {
                        bgcolor: cannotStart || cannotEnd
                          ? undefined
                          : "rgba(255,255,255,0.08)",
                      },
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: "50%",
                            bgcolor: staff.is_on_break ? "rgba(245, 158, 11, 0.2)" : "rgba(34, 197, 94, 0.2)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <PersonIcon sx={{ color: staff.is_on_break ? "#f59e0b" : "#22c55e" }} />
                        </Box>
                        <Box>
                          <Typography variant="subtitle1" fontWeight={700} sx={{ color: "white" }}>
                            {staff.worker_name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                            {staff.role} • Clocked in at{" "}
                            {new Date(staff.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </Typography>
                        </Box>
                      </Stack>

                      <Stack direction="row" spacing={1} alignItems="center">
                        {staff.is_on_break ? (
                          <Chip
                            label="ON BREAK"
                            size="small"
                            sx={{
                              bgcolor: "rgba(245, 158, 11, 0.2)",
                              color: "#f59e0b",
                              fontWeight: 700,
                              fontSize: 11,
                            }}
                          />
                        ) : (
                          <Chip
                            label="WORKING"
                            size="small"
                            sx={{
                              bgcolor: "rgba(34, 197, 94, 0.2)",
                              color: "#22c55e",
                              fontWeight: 700,
                              fontSize: 11,
                            }}
                          />
                        )}

                        <Button
                          size="small"
                          variant={isSelected ? "contained" : "outlined"}
                          disabled={cannotStart || cannotEnd}
                          sx={{
                            textTransform: "none",
                            fontWeight: 700,
                            fontSize: 12,
                            minWidth: 100,
                          }}
                        >
                          {isActionStart
                            ? breakActionType === "LUNCH_30"
                              ? "Start Lunch"
                              : "Start Tea"
                            : "End Break"}
                        </Button>
                      </Stack>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}

          {/* PIN Confirmation Section for Selected Staff */}
          {selectedStaffForBreak && (
            <Paper
              elevation={6}
              sx={{
                mt: 2.5,
                p: 2.5,
                bgcolor: "rgba(15, 23, 42, 0.9)",
                borderRadius: 2.5,
                border: "1px solid rgba(56, 189, 248, 0.3)",
              }}
            >
              <Typography variant="subtitle2" fontWeight={700} sx={{ color: "#38bdf8", mb: 1 }}>
                Confirm {breakActionType === "LUNCH_30" ? "30 min Lunch Break" : breakActionType === "TEA_10" ? "10 min Tea Break" : "End of Break"} for {selectedStaffForBreak.worker_name}
              </Typography>

              {selectedStaffForBreak.has_pin ? (
                <Stack spacing={1.5}>
                  <Typography variant="caption" sx={{ color: "#cbd5e1", fontSize: 13, fontWeight: 500 }}>
                    Enter your 4–6 digit PIN to verify:
                  </Typography>
                  <TextField
                    type="password"
                    placeholder="Enter PIN"
                    value={breakConfirmPin ? "•".repeat(breakConfirmPin.length) : ""}
                    disabled
                    sx={{
                      bgcolor: "rgba(255,255,255,0.08)",
                      borderRadius: 2,
                      "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(56, 189, 248, 0.4)" },
                      "& .MuiInputBase-input.Mui-disabled": {
                        WebkitTextFillColor: "#ffffff !important",
                        color: "#ffffff !important",
                        textAlign: "center",
                        letterSpacing: 8,
                        fontSize: 22,
                        fontWeight: 700,
                      },
                      "& input::placeholder": {
                        WebkitTextFillColor: "#cbd5e1 !important",
                        color: "#cbd5e1 !important",
                        opacity: 0.85,
                        textAlign: "center",
                      },
                    }}
                  />

                  {/* Quick Touch Keypad for Break PIN */}
                  <Grid container spacing={0.8}>
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                      <Grid size={{ xs: 4 }} key={digit}>
                        <Button
                          fullWidth
                          variant="outlined"
                          onClick={() => {
                            if (breakConfirmPin.length < 6) {
                              setBreakConfirmPin((prev) => prev + digit);
                            }
                          }}
                          sx={{
                            height: 44,
                            fontSize: 18,
                            fontWeight: 700,
                            color: "#ffffff",
                            bgcolor: "rgba(255,255,255,0.05)",
                            borderColor: "rgba(255,255,255,0.25)",
                            "&:hover": { bgcolor: "rgba(255,255,255,0.15)", borderColor: "#ffffff" },
                          }}
                        >
                          {digit}
                        </Button>
                      </Grid>
                    ))}
                    <Grid size={{ xs: 4 }}>
                      <Button
                        fullWidth
                        variant="outlined"
                        onClick={() => setBreakConfirmPin("")}
                        sx={{
                          height: 44,
                          fontWeight: 700,
                          fontSize: 14,
                          color: "#fbbf24",
                          borderColor: "#f59e0b",
                          bgcolor: "rgba(245, 158, 11, 0.1)",
                          "&:hover": { bgcolor: "rgba(245, 158, 11, 0.2)", borderColor: "#fbbf24" },
                        }}
                      >
                        Clear
                      </Button>
                    </Grid>
                    <Grid size={{ xs: 4 }}>
                      <Button
                        fullWidth
                        variant="outlined"
                        onClick={() => {
                          if (breakConfirmPin.length < 6) {
                            setBreakConfirmPin((prev) => prev + "0");
                          }
                        }}
                        sx={{
                          height: 44,
                          fontSize: 18,
                          fontWeight: 700,
                          color: "#ffffff",
                          bgcolor: "rgba(255,255,255,0.05)",
                          borderColor: "rgba(255,255,255,0.25)",
                          "&:hover": { bgcolor: "rgba(255,255,255,0.15)", borderColor: "#ffffff" },
                        }}
                      >
                        0
                      </Button>
                    </Grid>
                    <Grid size={{ xs: 4 }}>
                      <Button
                        fullWidth
                        variant="outlined"
                        onClick={() => setBreakConfirmPin((prev) => prev.slice(0, -1))}
                        sx={{
                          height: 44,
                          color: "#ffffff",
                          bgcolor: "rgba(255,255,255,0.05)",
                          borderColor: "rgba(255,255,255,0.25)",
                          "&:hover": { bgcolor: "rgba(255,255,255,0.15)", borderColor: "#ffffff" },
                        }}
                      >
                        <BackspaceIcon fontSize="small" sx={{ color: "#ffffff" }} />
                      </Button>
                    </Grid>
                  </Grid>
                </Stack>
              ) : (
                <Typography variant="body2" sx={{ color: "#cbd5e1", my: 1 }}>
                  No PIN set on your account. Tap confirm below to record your break.
                </Typography>
              )}
            </Paper>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2.5, pt: 1 }}>
          <Button
            onClick={() => {
              setBreakDialogOpen(false);
              setSelectedStaffForBreak(null);
            }}
            sx={{ color: "#cbd5e1", fontWeight: 600, "&:hover": { color: "#ffffff" } }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmBreakAction}
            disabled={
              breakSubmitting ||
              !selectedStaffForBreak ||
              (selectedStaffForBreak.has_pin && breakConfirmPin.length < 4)
            }
            sx={{
              bgcolor: breakActionType === "END" ? "#10b981" : breakActionType === "LUNCH_30" ? "#f59e0b" : "#06b6d4",
              color: breakActionType === "END" ? "white" : "#0f172a",
              fontWeight: 700,
              px: 3,
              "&:hover": {
                bgcolor: breakActionType === "END" ? "#059669" : breakActionType === "LUNCH_30" ? "#d97706" : "#0891b2",
              },
              "&.Mui-disabled": {
                bgcolor: "rgba(255, 255, 255, 0.12)",
                color: "rgba(255, 255, 255, 0.5) !important",
                WebkitTextFillColor: "rgba(255, 255, 255, 0.5) !important",
                border: "1px solid rgba(255, 255, 255, 0.15)",
              },
            }}
          >
            {breakSubmitting ? (
              <CircularProgress size={24} color="inherit" />
            ) : breakActionType === "END" ? (
              "Confirm End Break"
            ) : breakActionType === "LUNCH_30" ? (
              "Confirm Lunch Break (30m)"
            ) : (
              "Confirm Tea Break (10m)"
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
