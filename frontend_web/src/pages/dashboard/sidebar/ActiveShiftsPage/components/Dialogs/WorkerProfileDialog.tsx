// The booked worker's profile in Shift Centre Confirmed and History: the same CandidateProfile as Review and Reveal.
// Contact details and the CV come only with Confirmed (owner decision 2026-10-14); the backend leaves them out of History.
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { FileText, Mail, MessageCircle, Phone } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ShiftUser, ShiftWorkProfile } from '@chemisttasker/shared-core';
import { CandidateProfile } from './CandidateProfile';

const contactRow = { fontSize: 14, color: 'var(--ct-text-primary)', '& svg': { width: 16, height: 16, color: 'var(--ct-text-muted)', flexShrink: 0 } } as const;

export function WorkerProfileDialog({ open, loading, profile, onClose, canMessage = false }: {
  open: boolean;
  loading: boolean;
  profile: ShiftUser | null;
  onClose: () => void;
  /** Confirmed bookings: a direct chat with the worker (opened by the chat page's startDmWithUser). */
  canMessage?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  // Stay in the current workspace (/dashboard/owner, /dashboard/organization, /dashboard/admin/12).
  const base = /^\/dashboard\/(admin\/\d+|[a-z-]+)/.exec(location.pathname)?.[0] ?? '/dashboard/owner';
  const p = profile as (ShiftUser & Partial<ShiftWorkProfile>) | null;
  const name = [p?.firstName, p?.lastName].filter(Boolean).join(' ') || 'Booked worker';
  const hasContact = Boolean(p?.email || p?.phoneNumber || p?.resume);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="worker-profile-title">
      <DialogTitle id="worker-profile-title">Worker profile</DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress aria-label="Loading profile" /></Box>
        ) : p ? (
          <Stack spacing={2.5}>
            <CandidateProfile name={name} bio={p.shortBio || undefined} profile={p as unknown as ShiftWorkProfile} />
            {hasContact && (
              <Box component="section" aria-labelledby="worker-contact" sx={{ pt: 2, borderTop: '1px solid var(--ct-border-color)' }}>
                <Typography id="worker-contact" component="h4" sx={{ fontSize: 13, fontWeight: 600, color: 'var(--ct-text-primary)', mb: 1 }}>
                  Contact for this booking
                </Typography>
                <Stack spacing={0.75}>
                  {p.email && <Stack direction="row" spacing={1} alignItems="center" sx={contactRow}><Mail aria-hidden /><a href={`mailto:${p.email}`}>{p.email}</a></Stack>}
                  {p.phoneNumber && <Stack direction="row" spacing={1} alignItems="center" sx={contactRow}><Phone aria-hidden /><a href={`tel:${p.phoneNumber}`}>{p.phoneNumber}</a></Stack>}
                  {p.resume && (
                    <Box><Button size="small" variant="outlined" startIcon={<FileText size={16} />} href={p.resume} target="_blank" rel="noopener noreferrer">Open CV</Button></Box>
                  )}
                </Stack>
              </Box>
            )}
          </Stack>
        ) : (
          <Typography sx={{ color: 'var(--ct-text-secondary)' }}>This profile could not be loaded.</Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {canMessage && p?.id != null && !loading && (
          <Button variant="contained" startIcon={<MessageCircle size={16} />} onClick={() => navigate(`${base}/chat?startDmWithUser=${p.id}`)}>
            Message now
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
