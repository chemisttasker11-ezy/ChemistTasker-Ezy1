import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { getPharmacyClaims, updatePharmacyClaim } from '@chemisttasker/shared-core';

dayjs.extend(utc);

const STATUS_COLORS: Record<'PENDING' | 'ACCEPTED' | 'REJECTED', 'warning' | 'success' | 'error'> = {
  PENDING: 'warning',
  ACCEPTED: 'success',
  REJECTED: 'error',
};

type ClaimStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

type UserSummary = {
  id: number;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

type OrganizationSummary = {
  id: number;
  name?: string | null;
};

type PharmacySummary = {
  id: number;
  name: string;
  email: string | null;
};

type PharmacyClaim = {
  id: number;
  status: ClaimStatus;
  status_display?: string;
  message?: string | null;
  response_message?: string | null;
  pharmacy: PharmacySummary;
  organization: OrganizationSummary;
  requested_by_user?: UserSummary | null;
  responded_by_user?: UserSummary | null;
  created_at: string;
  responded_at: string | null;
};

type DialogState = {
  open: boolean;
  claim: PharmacyClaim | null;
  action: ClaimStatus | null;
  note: string;
};

const initialDialog: DialogState = {
  open: false,
  claim: null,
  action: null,
  note: '',
};

export default function OwnerClaimRequestsPage() {
  const [claims, setClaims] = useState<PharmacyClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<DialogState>(initialDialog);
  const [responding, setResponding] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string }>({ open: false, message: '' });

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPharmacyClaims({ owned_by_me: true });
      const data = Array.isArray((res as any)?.results)
        ? (res as any).results
        : Array.isArray(res as any)
        ? (res as any)
        : [];
      setClaims(data);
      setError(null);
    } catch (err: any) {
      const message = err.response?.data?.detail ?? 'Failed to load claim requests.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchClaims();
  }, [fetchClaims]);

  const openDialog = (claim: PharmacyClaim, action: ClaimStatus) => {
    setDialogState({ open: true, claim, action, note: '' });
  };

  const closeDialog = () => {
    if (responding) return;
    setDialogState(initialDialog);
  };

  const handleRespond = async () => {
    if (!dialogState.claim || !dialogState.action) return;
    setResponding(true);
    try {
      await updatePharmacyClaim(dialogState.claim.id, {
        status: dialogState.action,
        response_message: dialogState.note.trim() || undefined,
      });
      setSnackbar({
        open: true,
        message: dialogState.action === 'ACCEPTED' ? 'Claim accepted.' : 'Claim rejected.',
      });
      setDialogState(initialDialog);
      await fetchClaims();
    } catch (err: any) {
      const message = err.response?.data?.detail ?? 'Failed to update the claim.';
      setError(message);
    } finally {
      setResponding(false);
    }
  };

  const statusLabel = (claim: PharmacyClaim) => claim.status_display ?? claim.status;

  return (
    <Container sx={{ mt: 4, pb: 6 }}>
      <Typography variant="h4" gutterBottom>
        Organization Claim Requests
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Organizations can request access to manage your pharmacies. Review the requests below and decide whether to
        approve or reject them.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : claims.length === 0 ? (
        <Alert severity="info">No claim activity yet.</Alert>
      ) : (
        <Stack spacing={2}>
          {claims.map(claim => (
            <Card key={claim.id} variant="outlined">
              <CardContent>
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography variant="h6">{claim.pharmacy?.name ?? 'Untitled Pharmacy'}</Typography>
                      {claim.pharmacy?.email && (
                        <Typography variant="body2" color="text.secondary">
                          {claim.pharmacy.email}
                        </Typography>
                      )}
                    </Box>
                    <Chip
                      label={statusLabel(claim)}
                      color={STATUS_COLORS[claim.status]}
                      variant={claim.status === 'PENDING' ? 'outlined' : 'filled'}
                    />
                  </Stack>

                  <Typography variant="body2" color="text.secondary">
                    Requested by <strong>{claim.organization?.name ?? 'Unknown organization'}</strong>
                    {' on '}
                    {dayjs.utc(claim.created_at).local().toDate().toLocaleString()}
                  </Typography>

                  {claim.message && (
                    <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'grey.100', fontStyle: 'italic' }}>
                      "{claim.message}"
                    </Box>
                  )}

                  {claim.status !== 'PENDING' && claim.response_message && (
                    <Typography variant="body2" color="text.secondary">
                      Your response: {claim.response_message}
                    </Typography>
                  )}

                  {claim.status === 'PENDING' && (
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                      <Button variant="contained" color="success" onClick={() => openDialog(claim, 'ACCEPTED')}>
                        Approve
                      </Button>
                      <Button variant="outlined" color="error" onClick={() => openDialog(claim, 'REJECTED')}>
                        Reject
                      </Button>
                    </Stack>
                  )}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <Dialog open={dialogState.open} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>
          {dialogState.action === 'ACCEPTED' ? 'Approve claim request' : 'Reject claim request'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Organization: <strong>{dialogState.claim?.organization?.name ?? 'Unknown organization'}</strong>
          </Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Pharmacy: <strong>{dialogState.claim?.pharmacy?.name ?? 'Untitled pharmacy'}</strong>
          </Typography>
          <TextField
            label={dialogState.action === 'ACCEPTED' ? 'Optional note to the organization' : 'Reason (optional)'}
            multiline
            minRows={3}
            fullWidth
            value={dialogState.note}
            onChange={event => setDialogState(prev => ({ ...prev, note: event.target.value }))}
            placeholder={dialogState.action === 'ACCEPTED' ? 'Add a short note (optional).' : 'Explain why you are rejecting (optional).'}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={responding}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color={dialogState.action === 'ACCEPTED' ? 'success' : 'error'}
            onClick={handleRespond}
            disabled={responding}
          >
            {responding ? <CircularProgress size={18} /> : dialogState.action === 'ACCEPTED' ? 'Approve' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ open: false, message: '' })}
        message={snackbar.message}
      />
    </Container>
  );
}
