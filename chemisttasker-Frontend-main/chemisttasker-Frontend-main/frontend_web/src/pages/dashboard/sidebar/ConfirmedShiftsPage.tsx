import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Snackbar,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useAuth } from '../../../contexts/AuthContext';
import {
  fetchConfirmedShifts,
  type Shift,
  type ShiftUser,
  viewAssignedShiftProfileService,
} from '@chemisttasker/shared-core';
import OwnerAssignedShiftBoard from './OwnerAssignedShiftBoard';

export default function ConfirmedShiftsPage() {
  const { activePersona, activeAdminPharmacyId } = useAuth();
  const scopedPharmacyId =
    activePersona === 'admin' && typeof activeAdminPharmacyId === 'number'
      ? activeAdminPharmacyId
      : null;

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(true);
  const [profile, setProfile] = useState<ShiftUser | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; msg: string }>({
    open: false,
    msg: '',
  });

  useEffect(() => {
    setLoadingShifts(true);
    fetchConfirmedShifts()
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
      .catch(() => setSnackbar({ open: true, msg: 'Failed to load confirmed shifts' }))
      .finally(() => setLoadingShifts(false));
  }, [scopedPharmacyId]);

  const closeSnackbar = () => setSnackbar((s) => ({ ...s, open: false }));
  const closeDialog = () => {
    setDialogOpen(false);
    setProfile(null);
  };

  const openProfile = (shiftId: number, slotId: number | null, userId: number) => {
    setProfile(null);
    setLoadingProfile(true);
    setDialogOpen(true);

    viewAssignedShiftProfileService({
      type: 'confirmed',
      shiftId,
      slotId: slotId ?? undefined,
      userId,
    })
      .then((result) => {
        setProfile(result);
      })
      .catch((err: any) => {
        setSnackbar({ open: true, msg: err?.response?.data?.detail || 'Failed to load assigned profile' });
        setDialogOpen(false);
      })
      .finally(() => {
        setLoadingProfile(false);
      });
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={900} sx={{ color: '#111827', letterSpacing: '-0.03em' }}>
          Confirmed Shifts
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontWeight: 600 }}>
          Review booked shifts and assigned chemists
        </Typography>
      </Box>

      <OwnerAssignedShiftBoard
        title="Confirmed Shifts"
        shifts={shifts}
        loading={loadingShifts}
        emptyText="No confirmed shifts available."
        mode="confirmed"
        onViewAssigned={openProfile}
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

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>Assigned Profile</DialogTitle>
        <DialogContent>
          {loadingProfile ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress />
            </Box>
          ) : profile ? (
            <>
              <Typography>
                <strong>Name:</strong> {profile.firstName} {profile.lastName}
              </Typography>
              <Typography>
                <strong>Email:</strong> {profile.email}
              </Typography>
              {profile.phoneNumber && (
                <Typography>
                  <strong>Phone:</strong> {profile.phoneNumber}
                </Typography>
              )}
              {profile.shortBio && (
                <Typography>
                  <strong>Bio:</strong> {profile.shortBio}
                </Typography>
              )}
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
          ) : (
            <Typography>No profile data available.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
