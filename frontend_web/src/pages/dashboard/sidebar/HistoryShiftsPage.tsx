import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Rating,
  Skeleton,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useAuth } from '../../../contexts/AuthContext';
import {
  createRatingService,
  fetchHistoryShifts,
  fetchMyRatingForTargetService,
  type Shift,
  type ShiftUser,
  viewAssignedShiftProfileService,
} from '@chemisttasker/shared-core';
import OwnerAssignedShiftBoard from './OwnerAssignedShiftBoard';

const gradientButtonSx = {
  borderRadius: 999,
  background: 'linear-gradient(135deg, #8B5CF6 0%, #2563EB 100%)',
  color: '#fff',
  fontWeight: 800,
  textTransform: 'none',
  '&:hover': { background: 'linear-gradient(135deg, #7C3AED 0%, #1D4ED8 100%)' },
};

export default function HistoryShiftsPage() {
  const { activePersona, activeAdminPharmacyId } = useAuth();
  const scopedPharmacyId =
    activePersona === 'admin' && typeof activeAdminPharmacyId === 'number'
      ? activeAdminPharmacyId
      : null;

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState<{ open: boolean; msg: string }>({ open: false, msg: '' });
  const [profile, setProfile] = useState<ShiftUser | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);
  const [currentStars, setCurrentStars] = useState<number>(0);
  const [currentComment, setCurrentComment] = useState<string>('');
  const [loadingExistingWorkerRating, setLoadingExistingWorkerRating] = useState(false);
  const [savingWorkerRating, setSavingWorkerRating] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchHistoryShifts()
      .then((data) => {
        const filtered =
          scopedPharmacyId != null
            ? data.filter((shift: Shift) => {
                const targetId =
                  shift.pharmacyDetail?.id ?? (shift as any).pharmacyId ?? shift.pharmacy ?? null;
                return Number(targetId ?? NaN) === scopedPharmacyId;
              })
            : data;
        setShifts(filtered);
      })
      .catch(() => setSnackbar({ open: true, msg: 'Failed to load history shifts' }))
      .finally(() => setLoading(false));
  }, [scopedPharmacyId]);

  const closeSnackbar = () => setSnackbar((s) => ({ ...s, open: false }));
  const closeDialog = () => setDialogOpen(false);

  const openProfile = (shiftId: number, slotId: number | null, userId: number) => {
    viewAssignedShiftProfileService({
      type: 'history',
      shiftId,
      slotId: slotId ?? undefined,
      userId,
    })
      .then((result) => {
        setProfile(result);
        setDialogOpen(true);
      })
      .catch((err: any) => setSnackbar({ open: true, msg: err?.response?.data?.detail || 'Failed to load profile' }));
  };

  const openRateWorker = async (workerUserId: number) => {
    setSelectedWorkerId(workerUserId);
    setRateModalOpen(true);
    setLoadingExistingWorkerRating(true);
    try {
      const existing = await fetchMyRatingForTargetService({
        targetType: 'worker',
        targetId: workerUserId,
      });
      if (existing) {
        setCurrentStars(existing.stars || 0);
        setCurrentComment(existing.comment || '');
      } else {
        setCurrentStars(0);
        setCurrentComment('');
      }
    } catch {
      setSnackbar({ open: true, msg: 'Failed to load existing rating' });
      setCurrentStars(0);
      setCurrentComment('');
    } finally {
      setLoadingExistingWorkerRating(false);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={900} sx={{ color: '#111827', letterSpacing: '-0.03em' }}>
          Shift History
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontWeight: 600 }}>
          Review completed shifts and rate assigned team members
        </Typography>
      </Box>

      <OwnerAssignedShiftBoard
        title="Shift History"
        shifts={shifts}
        loading={loading}
        emptyText="No past shifts found."
        mode="history"
        onViewAssigned={openProfile}
        onRateAssigned={openRateWorker}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={closeSnackbar}
        message={snackbar.msg}
        action={
          <IconButton size="small" onClick={closeSnackbar} color="inherit">
            <CloseIcon fontSize="small" />
          </IconButton>
        }
      />

      <Dialog open={rateModalOpen} onClose={() => setRateModalOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Review Assigned Team Member</DialogTitle>
        <DialogContent>
          {loadingExistingWorkerRating ? (
            <Box display="flex" justifyContent="center" py={3}>
              <Skeleton variant="rectangular" width="100%" height={100} />
            </Box>
          ) : (
            <Box display="flex" flexDirection="column" gap={2} mt={1}>
              <Typography>Select a star rating:</Typography>
              <Rating
                name="assigned-team-member-rating"
                value={currentStars}
                size="large"
                onChange={(_, value) => setCurrentStars(value || 0)}
              />
              <TextField
                label="Comment (optional)"
                multiline
                minRows={3}
                value={currentComment}
                onChange={(e) => setCurrentComment(e.target.value)}
                fullWidth
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRateModalOpen(false)}>Cancel</Button>
          <Button
            onClick={async () => {
              if (!selectedWorkerId) return;
              setSavingWorkerRating(true);
              try {
                await createRatingService({
                  direction: 'OWNER_TO_WORKER',
                  ratee_user: selectedWorkerId,
                  stars: currentStars,
                  comment: currentComment,
                });
                setSnackbar({ open: true, msg: 'Rating saved successfully!' });
                setRateModalOpen(false);
              } catch {
                setSnackbar({ open: true, msg: 'Failed to save rating' });
              } finally {
                setSavingWorkerRating(false);
              }
            }}
            variant="contained"
            disabled={savingWorkerRating || currentStars === 0}
            sx={gradientButtonSx}
          >
            {savingWorkerRating ? 'Saving...' : 'Save Rating'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>Assigned Profile</DialogTitle>
        <DialogContent>
          {profile && (
            <>
              <Typography>
                <strong>Name:</strong> {profile.firstName} {profile.lastName}
              </Typography>
              <Typography><strong>Email:</strong> {profile.email}</Typography>
              <Typography><strong>Phone:</strong> {profile.phoneNumber}</Typography>
              <Typography><strong>Bio:</strong> {profile.shortBio}</Typography>
              {profile.resume && (
                <Button href={profile.resume} target="_blank">
                  Download CV
                </Button>
              )}
              {profile.ratePreference && (
                <Box mt={2}>
                  <Typography variant="subtitle2" gutterBottom>
                    <strong>Rate Preference</strong>
                  </Typography>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    <li>Weekday: {profile.ratePreference.weekday || 'N/A'}</li>
                    <li>Saturday: {profile.ratePreference.saturday || 'N/A'}</li>
                    <li>Sunday: {profile.ratePreference.sunday || 'N/A'}</li>
                    <li>Public Holiday: {profile.ratePreference.publicHoliday || 'N/A'}</li>
                    <li>Early Morning: {profile.ratePreference.earlyMorning || 'N/A'}</li>
                    <li>Late Night: {profile.ratePreference.lateNight || 'N/A'}</li>
                  </ul>
                </Box>
              )}

            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
