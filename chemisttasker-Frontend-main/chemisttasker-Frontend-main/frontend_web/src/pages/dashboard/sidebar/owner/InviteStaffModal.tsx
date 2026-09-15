// src/pages/dashboard/sidebar/owner/InviteStaffModal.tsx test
import { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import LinkIcon from "@mui/icons-material/Link";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import PeopleIcon from "@mui/icons-material/People";
import { useTheme } from "@mui/material/styles";
import { surface } from "./types";

function uid() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
function generateGenericStaffInvite(pharmacyId: string, days: number) {
  const token = uid();
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  return `https://chemisttasker.com/invite/${token}?exp=${expiresAt}&generic=true&ownerApproval=true&scope=${encodeURIComponent(
    pharmacyId
  )}`;
}

export default function InviteStaffModal({ pharmacyId }: { pharmacyId: string }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState("7");
  const [link, setLink] = useState("");
  const t = useTheme();
  const s = surface(t);

  const generate = () => {
    const n = Number(days || "0");
    setLink(generateGenericStaffInvite(pharmacyId, Number.isNaN(n) ? 7 : n));
  };
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {}
  };

  return (
    <>
      <Button variant="contained" onClick={() => setOpen(true)} startIcon={<PeopleIcon />}>
        Invite Staff
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create generic invite link</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 2, color: s.textMuted }}>
            Share this link with anyone. After signup, the staff member still requires <b>owner approval</b>.
          </Typography>
          <TextField label="Expiry (days)" value={days} onChange={(e) => setDays(e.target.value)} fullWidth sx={{ mb: 2 }} />
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Button onClick={generate} startIcon={<LinkIcon />}>
              Generate
            </Button>
            <Button onClick={copy} startIcon={<ContentCopyIcon />} disabled={!link}>
              Copy
            </Button>
          </Stack>
          {link && <TextField label="Invite link" fullWidth value={link} InputProps={{ readOnly: true }} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Done</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
