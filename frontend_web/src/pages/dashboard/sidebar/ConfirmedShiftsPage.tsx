import { useEffect, useState } from 'react';
import {
  Alert,
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
  Stack,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useAuth } from '../../../contexts/AuthContext';
import {
  activateShiftOfferPayrollService,
  fetchConfirmedShifts,
  fetchShiftOffersService,
  type Shift,
  type ShiftUser,
  viewAssignedShiftProfileService,
} from '@chemisttasker/shared-core';
import OwnerAssignedShiftBoard from './OwnerAssignedShiftBoard';

type DeferredPayrollOffer = {
  id: number;
  shift?: number;
  paymentPreferenceSnapshot?: string;
  settlementChannel?: string;
  engagementKind?: string;
  payrollActivatedAt?: string | null;
  engagementTermsSnapshot?: {
    payrollActivationRequired?: boolean;
    pharmacyId?: number;
    pharmacyName?: string;
    workerName?: string;
    awardClassification?: string;
    payBasis?: string;
  };
};

export default function ConfirmedShiftsPage() {
  const { activePersona, activeAdminPharmacyId } = useAuth();
  const scopedPharmacyId =
    activePersona === 'admin' && typeof activeAdminPharmacyId === 'number'
      ? activeAdminPharmacyId
      : null;

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(true);
  const [deferredPayrollOffers, setDeferredPayrollOffers] = useState<DeferredPayrollOffer[]>([]);
  const [activatingPayrollOfferId, setActivatingPayrollOfferId] = useState<number | null>(null);
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

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchShiftOffersService({ status: 'ACCEPTED' }),
      fetchShiftOffersService({ status: 'ACCEPTED_AWAITING_PAYMENT' }),
    ])
      .then(([accepted, awaiting]) => {
        if (!active) return;
        const rows = [...accepted, ...awaiting] as DeferredPayrollOffer[];
        const filtered = rows.filter((offer) => {
          const terms = offer.engagementTermsSnapshot;
          const pharmacyMatches =
            scopedPharmacyId == null || Number(terms?.pharmacyId ?? NaN) === scopedPharmacyId;
          return (
            pharmacyMatches &&
            offer.paymentPreferenceSnapshot === 'TFN' &&
            offer.engagementKind === 'SHIFT_EMPLOYMENT' &&
            offer.settlementChannel === 'TIMESHEET_ONLY' &&
            terms?.payrollActivationRequired === true &&
            !offer.payrollActivatedAt
          );
        });
        setDeferredPayrollOffers(filtered);
      })
      .catch(() => {
        if (active) setSnackbar({ open: true, msg: 'Failed to load deferred payroll setup' });
      });
    return () => {
      active = false;
    };
  }, [scopedPharmacyId]);

  const activateDeferredPayroll = async (offer: DeferredPayrollOffer) => {
    setActivatingPayrollOfferId(offer.id);
    try {
      await activateShiftOfferPayrollService(offer.id);
      setDeferredPayrollOffers((rows) => rows.filter((row) => row.id !== offer.id));
      setSnackbar({ open: true, msg: 'ChemistTasker Payroll activated for this accepted shift.' });
    } catch (err: any) {
      setSnackbar({
        open: true,
        msg: err?.message || 'Complete the worker TFN/super details before activating payroll.',
      });
    } finally {
      setActivatingPayrollOfferId(null);
    }
  };

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

      {deferredPayrollOffers.length > 0 && (
        <Stack spacing={1.5} sx={{ mb: 3 }}>
          <Alert severity="warning">
            These accepted TFN shifts are rostered and timesheet-only because ChemistTasker Payroll setup was deferred.
            Assignment is preserved; activate payroll after the worker completes TFN and super details.
          </Alert>
          {deferredPayrollOffers.map((offer) => {
            const terms = offer.engagementTermsSnapshot;
            return (
              <Box
                key={offer.id}
                sx={{
                  display: 'flex',
                  gap: 2,
                  alignItems: { xs: 'stretch', sm: 'center' },
                  flexDirection: { xs: 'column', sm: 'row' },
                  p: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                }}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography fontWeight={800}>
                    {terms?.workerName || `Accepted worker · Offer #${offer.id}`}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {terms?.pharmacyName || 'Pharmacy'} · {terms?.awardClassification || 'Casual TFN'}
                    {terms?.payBasis ? ` · ${terms.payBasis}` : ''}
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  disabled={activatingPayrollOfferId === offer.id}
                  onClick={() => void activateDeferredPayroll(offer)}
                >
                  {activatingPayrollOfferId === offer.id ? 'Checking…' : 'Activate payroll'}
                </Button>
              </Box>
            );
          })}
        </Stack>
      )}

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
