import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";
import { deleteAccount } from "@chemisttasker/shared-core";
import { useAuth } from "../contexts/AuthContext";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

const CONFIRM_TEXT = "DELETE";

export default function AccountDeletionSection() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmValue, setConfirmValue] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const canConfirm = confirmValue.trim().toUpperCase() === CONFIRM_TEXT;

  const handleCloseDialog = () => {
    if (isDeleting) return;
    setDialogOpen(false);
    setConfirmValue("");
    setError("");
  };

  const handleDelete = async () => {
    if (!canConfirm || isDeleting) return;
    setIsDeleting(true);
    setError("");

    try {
      await deleteAccount();
      logout();
      setSnackbarOpen(true);
      setDialogOpen(false);
      navigate("/login", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Failed to delete account.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Box
      sx={(theme) => ({
        border: "1px solid",
        borderColor: theme.palette.divider,
        borderRadius: 2,
        bgcolor: alpha(theme.palette.primary.main, 0.03),
      })}
    >
      <Button
        fullWidth
        type="button"
        onClick={() => setExpanded((value) => !value)}
        endIcon={
          <KeyboardArrowDownIcon
            sx={{
              transform: expanded ? "rotate(180deg)" : "none",
              transition: "transform .18s",
            }}
          />
        }
        sx={{
          justifyContent: "space-between",
          px: 2,
          py: 1.25,
          color: "text.primary",
          textTransform: "none",
          fontWeight: 700,
        }}
      >
        Other options
      </Button>
      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ px: 2, pb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Deleting your account is permanent. Your account will be deactivated immediately, and
            verification documents are removed within 7 days.
          </Typography>
          <Button
            variant="outlined"
            color="error"
            onClick={() => setDialogOpen(true)}
          >
            Delete my account
          </Button>
        </Box>
      </Collapse>

      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Confirm Account Deletion</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            This action cannot be undone. Type DELETE to confirm.
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            fullWidth
            label="Type DELETE to confirm"
            value={confirmValue}
            onChange={(e) => setConfirmValue(e.target.value)}
            disabled={isDeleting}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseDialog} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={!canConfirm || isDeleting}
          >
            {isDeleting ? "Deleting..." : "Confirm Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Alert severity="success" sx={{ width: "100%" }}>
          Account deletion requested/completed.
        </Alert>
      </Snackbar>
    </Box>
  );
}
