import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { OwnerClaimDialogState, Pharmacy } from "./PharmacyPage.model";

const LIGHT_SURFACE = "#FFFFFF";
const LIGHT_BORDER = "#D9E2F2";
const HERO_GRADIENT_START = "#143EEA";

const pharmacyFormLightSx = {
  color: "#111827",
  "& .MuiTabs-root": {
    borderBottomColor: LIGHT_BORDER,
  },
  "& .MuiTab-root": {
    color: "#475569",
    fontWeight: 700,
    textTransform: "none",
  },
  "& .MuiTab-root.Mui-selected": {
    color: HERO_GRADIENT_START,
  },
  "& .MuiOutlinedInput-root": {
    bgcolor: LIGHT_SURFACE,
    color: "#111827",
    borderRadius: 2,
    "& .MuiInputBase-input": {
      color: "#111827",
      WebkitTextFillColor: "#111827",
    },
    "& .MuiSelect-select": {
      color: "#111827",
    },
    "& fieldset": {
      borderColor: LIGHT_BORDER,
    },
    "&:hover fieldset": {
      borderColor: "#B8C4DB",
    },
    "&.Mui-focused fieldset": {
      borderColor: HERO_GRADIENT_START,
      borderWidth: 1,
    },
  },
  "& .MuiInputLabel-root": {
    color: "#64748B",
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: HERO_GRADIENT_START,
  },
  "& .MuiFormHelperText-root": {
    color: "#64748B",
  },
  "& .MuiTypography-root": {
    color: "#111827",
  },
  "& .MuiTypography-body2": {
    color: "#64748B",
  },
  "& .MuiFormControlLabel-label": {
    color: "#111827",
  },
  "& .MuiCheckbox-root.Mui-checked": {
    color: HERO_GRADIENT_START,
  },
} as const;

type Props = {
  ownerDialog: OwnerClaimDialogState;
  setOwnerDialog: Dispatch<SetStateAction<OwnerClaimDialogState>>;
  closeOwnerDialog: () => void;
  handleOwnerRespond: () => void | Promise<void>;
  ownerResponding: boolean;
  canRespondToClaims: boolean;

  pendingDeletePharmacy: Pharmacy | null;
  handleCancelDeletePharmacy: () => void;
  confirmDeletePharmacy: () => void | Promise<void>;
  isDeletingPharmacy: boolean;

  additionalPharmacyPromptOpen: boolean;
  setAdditionalPharmacyPromptOpen: Dispatch<SetStateAction<boolean>>;
  onGoDashboard: () => void;
  onAddAnother: () => void;

  standalone: boolean;
  dialogOpen: boolean;
  closeDialog: () => void;
  editing: boolean;
  isSaving: boolean;
  tabIndex: number;
  lastTabIndex: number;
  handleSave: () => void | Promise<void>;
  handlePreviousTab: () => void;
  handleNextTab: () => void;
  formContent: ReactNode;
};

export default function PharmacyPageDialogs({
  ownerDialog,
  setOwnerDialog,
  closeOwnerDialog,
  handleOwnerRespond,
  ownerResponding,
  canRespondToClaims,
  pendingDeletePharmacy,
  handleCancelDeletePharmacy,
  confirmDeletePharmacy,
  isDeletingPharmacy,
  additionalPharmacyPromptOpen,
  setAdditionalPharmacyPromptOpen,
  onGoDashboard,
  onAddAnother,
  standalone,
  dialogOpen,
  closeDialog,
  editing,
  isSaving,
  tabIndex,
  lastTabIndex,
  handleSave,
  handlePreviousTab,
  handleNextTab,
  formContent,
}: Props) {
  return (
    <>
      <Dialog open={ownerDialog.open} onClose={closeOwnerDialog} fullWidth maxWidth="sm">
        <DialogTitle>
          {ownerDialog.action === "ACCEPTED" ? "Approve claim request" : "Reject claim request"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Organization: <strong>{ownerDialog.claim?.organization?.name ?? "Unknown organization"}</strong>
          </Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Pharmacy: <strong>{ownerDialog.claim?.pharmacy?.name ?? "Untitled pharmacy"}</strong>
          </Typography>
          <TextField
            label={ownerDialog.action === "ACCEPTED" ? "Optional note to the organization" : "Reason (optional)"}
            multiline
            minRows={3}
            fullWidth
            value={ownerDialog.note}
            onChange={(event) => setOwnerDialog((prev) => ({ ...prev, note: event.target.value }))}
            placeholder={
              ownerDialog.action === "ACCEPTED"
                ? "Add a short note (optional)."
                : "Explain why you are rejecting (optional)."
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeOwnerDialog} disabled={ownerResponding}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color={ownerDialog.action === "ACCEPTED" ? "success" : "error"}
            onClick={handleOwnerRespond}
            disabled={ownerResponding || !canRespondToClaims}
          >
            {ownerResponding ? (
              <CircularProgress size={18} color="inherit" />
            ) : ownerDialog.action === "ACCEPTED" ? (
              "Approve"
            ) : (
              "Reject"
            )}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(pendingDeletePharmacy)}
        onClose={handleCancelDeletePharmacy}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete Pharmacy</DialogTitle>
        <DialogContent>
          <Typography>
            {pendingDeletePharmacy
              ? `You are about to delete "${pendingDeletePharmacy.name}". This action can't be undone.`
              : "This action can't be undone."}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDeletePharmacy} disabled={isDeletingPharmacy}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={confirmDeletePharmacy}
            disabled={isDeletingPharmacy}
          >
            {isDeletingPharmacy ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={additionalPharmacyPromptOpen}
        onClose={() => setAdditionalPharmacyPromptOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Add another pharmacy?</DialogTitle>
        <DialogContent>
          <Typography>
            Do you want to add another pharmacy now, or go straight to your dashboard?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setAdditionalPharmacyPromptOpen(false);
              onGoDashboard();
            }}
          >
            Go to Dashboard
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setAdditionalPharmacyPromptOpen(false);
              onAddAnother();
            }}
          >
            Add Another
          </Button>
        </DialogActions>
      </Dialog>

      {!standalone && (
        <Dialog
          open={dialogOpen}
          onClose={closeDialog}
          fullWidth
          maxWidth="xl"
          disableEnforceFocus
          PaperProps={{
            sx: {
              width: "min(1320px, calc(100vw - 32px))",
              maxWidth: "1320px",
              minHeight: "min(860px, calc(100vh - 48px))",
              borderRadius: 4,
              bgcolor: LIGHT_SURFACE,
              border: `1px solid ${LIGHT_BORDER}`,
              boxShadow: "0 18px 42px rgba(99, 102, 241, 0.08)",
              overflow: "hidden",
            },
          }}
        >
          <DialogTitle>{editing ? "Edit Pharmacy" : "Add Pharmacy"}</DialogTitle>
          <DialogContent
            sx={{
              minHeight: 640,
              px: { xs: 2, md: 3 },
              pb: 2,
              ...pharmacyFormLightSx,
            }}
          >
            {formContent}
          </DialogContent>
          <DialogActions sx={{ px: { xs: 2, md: 3 }, pb: { xs: 2, md: 2.5 } }}>
            {editing ? (
              <Stack direction="row" justifyContent="space-between" sx={{ width: "100%" }}>
                <Button variant="outlined" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
                <Stack direction="row" spacing={1.5}>
                  <Button onClick={handlePreviousTab} disabled={isSaving || tabIndex === 0}>
                    Back
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleNextTab}
                    disabled={isSaving || tabIndex === lastTabIndex}
                    sx={{
                      bgcolor: "#7C8CF8",
                      color: "#FFFFFF",
                      boxShadow: "none",
                      "&:hover": { bgcolor: "#6978F5", boxShadow: "none" },
                    }}
                  >
                    Next
                  </Button>
                </Stack>
              </Stack>
            ) : (
              <Stack direction="row" justifyContent="space-between" sx={{ width: "100%" }}>
                <Button onClick={tabIndex > 0 ? handlePreviousTab : closeDialog} disabled={isSaving}>
                  {tabIndex > 0 ? "Back" : "Cancel"}
                </Button>
                <Button
                  variant="contained"
                  onClick={tabIndex === lastTabIndex ? handleSave : handleNextTab}
                  disabled={isSaving}
                  sx={{
                    bgcolor: "#7C8CF8",
                    color: "#FFFFFF",
                    boxShadow: "none",
                    "&:hover": { bgcolor: "#6978F5", boxShadow: "none" },
                  }}
                >
                  {tabIndex === lastTabIndex
                    ? isSaving
                      ? "Saving..."
                      : "Create Pharmacy"
                    : "Next"}
                </Button>
              </Stack>
            )}
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
