import React, { useEffect, useState } from 'react';
import {
  Container,
  Typography,
  Paper,
  Box,
  Snackbar,
  IconButton,
  Pagination,
  Rating,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Skeleton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import {
  Shift,
  ShiftRatingSummary,
  fetchMyHistoryShifts,
  fetchRatingsSummaryService,
  fetchMyRatingForTargetService,
  createRatingService,
} from '@chemisttasker/shared-core';

const curvedPaperSx = {
  borderRadius: 3,
  boxShadow: '0 20px 45px rgba(109, 40, 217, 0.08)',
};

const gradientButtonSx = {
  borderRadius: 2,
  background: 'linear-gradient(90deg, #8B5CF6 0%, #6D28D9 100%)',
  color: '#fff',
  '&:hover': { background: 'linear-gradient(90deg, #A78BFA 0%, #8B5CF6 100%)' },
};

const buildFullAddress = (pharmacy?: Shift['pharmacyDetail'] | null) => {
  if (!pharmacy) return '';
  const parts = [
    pharmacy.streetAddress,
    pharmacy.suburb,
    pharmacy.state,
    pharmacy.postcode,
  ].filter(Boolean);
  return parts.join(', ');
};

const openMapWindow = (address: string) => {
  if (!address) return;
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
};

export default function MyHistoryShiftsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const base =
    user?.role === 'PHARMACIST'
      ? '/dashboard/pharmacist'
      : user?.role === 'OTHER_STAFF'
      ? '/dashboard/otherstaff'
      : '/dashboard/pharmacist';

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState<{ open: boolean; msg: string }>({ open: false, msg: '' });
  const [page, setPage] = useState(1);
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  const [pharmacySummaries, setPharmacySummaries] = useState<Record<number, ShiftRatingSummary>>({});
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [selectedPharmacy, setSelectedPharmacy] = useState<{ id: number; name: string } | null>(null);
  const [currentStars, setCurrentStars] = useState(0);
  const [currentComment, setCurrentComment] = useState('');
  const [loadingRating, setLoadingRating] = useState(false);
  const [loadingExistingRating, setLoadingExistingRating] = useState(false);

  const itemsPerPage = 5;
  const pageCount = Math.ceil(shifts.length / itemsPerPage);
  const displayed = shifts.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  useEffect(() => {
    setLoading(true);
    fetchMyHistoryShifts()
      .then(data => {
        setShifts(data);
        const uniquePharmacyIds: number[] = Array.from(
          new Set(
            data
              .map((shift: Shift) => shift.pharmacyDetail?.id)
              .filter((id: number | undefined): id is number => typeof id === 'number')
          )
        );
        uniquePharmacyIds.forEach((id: number) => {
          fetchRatingsSummaryService({ targetType: 'pharmacy', targetId: id })
            .then(summary =>
              setPharmacySummaries(prev => ({
                ...prev,
                [id]: summary,
              }))
            )
            .catch(() => {
              // ignore summary errors
            });
        });
      })
      .catch(() => setSnackbar({ open: true, msg: 'Failed to load history shifts' }))
      .finally(() => setLoading(false));
  }, []);

  const closeSnackbar = () => setSnackbar(s => ({ ...s, open: false }));

  const handlePageChange = (_: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGenerateInvoice = (shift: Shift) => {
    setGeneratingId(shift.id);
    navigate(`${base}/invoice/new?shiftId=${shift.id}&pharmacyId=${shift.pharmacyDetail?.id ?? ''}`);
    setTimeout(() => setGeneratingId(null), 0);
  };

  const fetchSummaryForPharmacy = async (pharmacyId: number) => {
    try {
      const summary = await fetchRatingsSummaryService({
        targetType: 'pharmacy',
        targetId: pharmacyId,
      });
      setPharmacySummaries(prev => ({
        ...prev,
        [pharmacyId]: summary,
      }));
    } catch {
      // ignore summary errors
    }
  };

  const handleOpenRatingModal = async (pharmacyId: number, pharmacyName: string) => {
    setSelectedPharmacy({ id: pharmacyId, name: pharmacyName });
    setLoadingExistingRating(true);
    setRatingModalOpen(true);

    try {
      const existing = await fetchMyRatingForTargetService({
        targetType: 'pharmacy',
        targetId: pharmacyId,
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
      setLoadingExistingRating(false);
    }
  };

  const handleSaveRating = async () => {
    if (!selectedPharmacy) return;
    setLoadingRating(true);
    try {
      await createRatingService({
        direction: 'WORKER_TO_PHARMACY',
        ratee_pharmacy: selectedPharmacy.id,
        stars: currentStars,
        comment: currentComment,
      });
      await fetchSummaryForPharmacy(selectedPharmacy.id);
      setSnackbar({ open: true, msg: 'Rating saved successfully!' });
      setRatingModalOpen(false);
    } catch {
      setSnackbar({ open: true, msg: 'Failed to save rating' });
    } finally {
      setLoadingRating(false);
    }
  };

  if (loading) {
    return (
      <Container sx={{ textAlign: 'center', py: 4 }}>
        {[...Array(3)].map((_, index) => (
          <Paper key={index} sx={{ p: 2, mb: 2, ...curvedPaperSx }}>
            <Skeleton variant="text" width="70%" height={30} sx={{ mb: 1 }} />
            <Skeleton variant="text" width="50%" height={20} sx={{ mb: 2 }} />
            <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {[...Array(2)].map(slotIndex => (
                <Skeleton key={slotIndex} variant="text" width="70%" height={20} />
              ))}
            </Box>
          </Paper>
        ))}
      </Container>
    );
  }

  if (!shifts.length) {
    return (
      <Container sx={{ py: 4 }}>
        <Typography>No past shifts to rate.</Typography>
      </Container>
    );
  }

  return (
    <Container sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        My Shift History
      </Typography>

      {displayed.map(shift => {
        const slots = shift.slots ?? [];
        const pharmacyAddress = buildFullAddress(shift.pharmacyDetail);

        return (
        <Paper key={shift.id} sx={{ p: 2, mb: 2, ...curvedPaperSx }}>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6">{shift.pharmacyDetail?.name ?? 'Unknown Pharmacy'}</Typography>
              {pharmacyAddress && (
                <IconButton
                  aria-label="Open pharmacy location"
                  size="small"
                  onClick={() => openMapWindow(pharmacyAddress)}
                >
                  <LocationOnIcon fontSize="small" />
                </IconButton>
              )}
            </Box>

            {shift.pharmacyDetail?.id && pharmacySummaries[shift.pharmacyDetail.id] && (
              <Box display="flex" alignItems="center" gap={1}>
                <Rating value={pharmacySummaries[shift.pharmacyDetail.id].average} precision={0.5} readOnly size="small" />
                <Typography variant="body2" color="textSecondary">
                  ({pharmacySummaries[shift.pharmacyDetail.id].count})
                </Typography>
              </Box>
            )}
          </Box>

          <Typography>Role: {shift.roleNeeded}</Typography>

          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {slots.map(slot => (
              <Box
                key={slot.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Typography variant="body2">
                  {slot.date} {slot.startTime}–{slot.endTime}
                </Typography>
              </Box>
            ))}
          </Box>

          <Box mt={2} textAlign="right">
            <Button
              variant="contained"
              color="primary"
              size="small"
              onClick={() => handleGenerateInvoice(shift)}
              disabled={generatingId === shift.id}
              sx={gradientButtonSx}
            >
              {generatingId === shift.id ? 'Generating...' : 'Generate Invoice'}
            </Button>
          </Box>
          <Box mt={1} textAlign="right">
            <Button
              variant="outlined"
              color="secondary"
              size="small"
              onClick={() =>
                shift.pharmacyDetail?.id &&
                handleOpenRatingModal(shift.pharmacyDetail.id, shift.pharmacyDetail.name ?? 'Pharmacy')
              }
            >
              Rate Pharmacy
            </Button>
          </Box>
        </Paper>
      );
      })}

      {pageCount > 1 && (
        <Box display="flex" justifyContent="center" mt={4}>
          <Pagination count={pageCount} page={page} onChange={handlePageChange} color="primary" />
        </Box>
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={closeSnackbar}
        message={snackbar.msg}
        action={
          <IconButton size="small" color="inherit" onClick={closeSnackbar}>
            <CloseIcon fontSize="small" />
          </IconButton>
        }
      />

      <Dialog open={ratingModalOpen} onClose={() => setRatingModalOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{selectedPharmacy ? `Rate ${selectedPharmacy.name}` : 'Rate Pharmacy'}</DialogTitle>
        <DialogContent>
          {loadingExistingRating ? (
            <Box display="flex" justifyContent="center" py={3}>
              <Skeleton variant="rectangular" width="100%" height={100} />
            </Box>
          ) : (
            <Box display="flex" flexDirection="column" gap={2} mt={1}>
              <Typography>Select a star rating:</Typography>
              <Rating
                name="pharmacy-rating"
                value={currentStars}
                size="large"
                onChange={(_, value) => setCurrentStars(value || 0)}
              />
              <TextField
                label="Comment (optional)"
                multiline
                minRows={3}
                value={currentComment}
                onChange={e => setCurrentComment(e.target.value)}
                fullWidth
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRatingModalOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSaveRating}
            variant="contained"
            color="primary"
            disabled={loadingRating || currentStars === 0}
            sx={gradientButtonSx}
          >
            {loadingRating ? 'Saving...' : 'Save Rating'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
