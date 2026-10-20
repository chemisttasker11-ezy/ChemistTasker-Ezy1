import type { ReactNode } from 'react';
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';

/** Confirm a consequential action: names it, explains it, shows progress and locks while working. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  busyLabel,
  busy,
  destructive = true,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="xs" fullWidth aria-labelledby="ct-confirm-title">
      <DialogTitle id="ct-confirm-title" sx={{ fontWeight: 600 }}>{title}</DialogTitle>
      <DialogContent>
        <Typography component="div" sx={{ color: "var(--ct-text-secondary)", fontSize: 15, lineHeight: 1.55 }}>{body}</Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={busy} sx={{ minHeight: 44 }}>Cancel</Button>
        <Button
          variant="contained"
          color={destructive ? "error" : "primary"}
          onClick={onConfirm}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ minHeight: 44 }}
        >
          {busy ? busyLabel : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
