// src/pages/dashboard/sidebar/MyConfirmedShiftsPage.tsx

import React, { useEffect, useState } from 'react';
import {
  Container,
  Typography,
  Paper,
  Box,
  Button,
  Snackbar,
  IconButton,
  Pagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Skeleton,
  Rating,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import {
  Shift,
  ShiftRatingComment,
  ShiftRatingSummary,
  fetchMyConfirmedShifts,
  fetchRatingsSummaryService,
  fetchRatingsPageService,
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

export default function MyConfirmedShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState<{ open: boolean; msg: string }>({ open: false, msg: '' });
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentPharm, setCurrentPharm] = useState<Shift['pharmacyDetail'] | null>(null);
  const [ratingSummary, setRatingSummary] = useState<ShiftRatingSummary | null>(null);
  const [ratingComments, setRatingComments] = useState<ShiftRatingComment[]>([]);
  const [commentsPage, setCommentsPage] = useState(1);
  const [commentsPageCount, setCommentsPageCount] = useState(1);
  const [loadingRatings, setLoadingRatings] = useState(false);

  const itemsPerPage = 5;
  const pageCount = Math.ceil(shifts.length / itemsPerPage);
  const displayed = shifts.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  useEffect(() => {
    setLoading(true);
    fetchMyConfirmedShifts()
      .then(setShifts)
      .catch(() => setSnackbar({ open: true, msg: 'Failed to load shifts' }))
      .finally(() => setLoading(false));
  }, []);

  const closeSnackbar = () => setSnackbar(s => ({ ...s, open: false }));

  const openDialog = async (pharmacy: Shift['pharmacyDetail']) => {
    setCurrentPharm(pharmacy);
    setDialogOpen(true);
    setRatingSummary(null);
    setRatingComments([]);
    setCommentsPage(1);
    setCommentsPageCount(1);

    if (!pharmacy?.id) {
      return;
    }

    setLoadingRatings(true);
    try {
      const summary = await fetchRatingsSummaryService({
        targetType: 'pharmacy',
        targetId: pharmacy.id,
      });
      setRatingSummary(summary);

      const firstPage = await fetchRatingsPageService({
        targetType: 'pharmacy',
        targetId: pharmacy.id,
        page: 1,
      });
      setRatingComments(firstPage.results);
      const pageSize = firstPage.results.length || 1;
      setCommentsPageCount(Math.max(1, Math.ceil(firstPage.count / pageSize)));
    } catch {
      setRatingSummary(null);
      setRatingComments([]);
    } finally {
      setLoadingRatings(false);
    }
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setCurrentPharm(null);
    setRatingSummary(null);
    setRatingComments([]);
    setCommentsPage(1);
    setCommentsPageCount(1);
  };

  const handleCommentsPageChange = async (_: React.ChangeEvent<unknown>, value: number) => {
    setCommentsPage(value);
    if (!currentPharm?.id) return;
    setLoadingRatings(true);
    try {
      const pageData = await fetchRatingsPageService({
        targetType: 'pharmacy',
        targetId: currentPharm.id,
        page: value,
      });
      setRatingComments(pageData.results);
      const pageSize = pageData.results.length || 1;
      setCommentsPageCount(Math.max(1, Math.ceil(pageData.count / pageSize)));
    } finally {
      setLoadingRatings(false);
      const dlg = document.querySelector('[role="dialog"]');
      dlg?.scrollTo?.({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePageChange = (_: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <Container sx={{ textAlign: 'center', py: 4 }}>
        {[...Array(3)].map((_, index) => (
          <Paper key={index} sx={{ p: 2, mb: 2, ...curvedPaperSx }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Skeleton variant="text" width="60%" height={30} />
              <Skeleton variant="rectangular" width={120} height={36} />
            </Box>
            <Skeleton variant="text" width="40%" height={20} sx={{ mt: 1 }} />
            <Skeleton variant="text" width="50%" height={20} />
            <Box sx={{ mt: 2 }}>
              {[...Array(2)].map((__, slotIndex) => (
                <Skeleton key={slotIndex} variant="text" width="80%" height={20} />
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
        <Typography>No upcoming confirmed shifts.</Typography>
      </Container>
    );
  }

  return (
    <Container sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        My Confirmed Shifts
      </Typography>

      {displayed.map(shift => {
        const isPharmacist = shift.roleNeeded === 'PHARMACIST';
        const showBonus = !!shift.ownerAdjustedRate && !isPharmacist;
        const workloadTags = shift.workloadTags ?? [];
        const slots = shift.slots ?? [];

        let rateLabel = '';
        if (isPharmacist) {
          if (shift.rateType === 'FIXED') {
            rateLabel = `Fixed — ${shift.fixedRate} AUD/hr`;
          } else if (shift.rateType === 'FLEXIBLE') {
            rateLabel = 'Flexible';
          } else if (shift.rateType === 'PHARMACIST_PROVIDED') {
            rateLabel = 'Pharmacist Provided';
          } else {
            rateLabel = 'Flexible (Fair Work)';
          }
        } else {
          rateLabel = 'Award Rate (Fair Work Commission, July 2025)';
        }

        const pharmacyName = shift.pharmacyDetail?.name ?? 'Pharmacy';
        const pharmacyAddress = buildFullAddress(shift.pharmacyDetail);

        return (
          <Paper key={shift.id} sx={{ p: 2, mb: 2, ...curvedPaperSx }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h6">{pharmacyName}</Typography>
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
              <Button
                size="small"
                variant="contained"
                onClick={() => openDialog(shift.pharmacyDetail)}
                sx={gradientButtonSx}
              >
                Pharmacy Details
              </Button>
            </Box>

            <Box sx={{ mt: 1, display: 'grid', gap: 1 }}>
              <Typography>
                <strong>Role:</strong> {shift.roleNeeded}
              </Typography>
              <Typography>
                <strong>Rate:</strong> {rateLabel}
              </Typography>

              {showBonus && (
                <Typography sx={{ color: 'green', fontWeight: 'bold', mt: 1 }}>
                  Bonus: +{shift.ownerAdjustedRate} AUD/hr on top of Award Rate
                </Typography>
              )}

              {workloadTags.length > 0 && (
                <Typography>
                  <strong>Workload Tags:</strong> {workloadTags.join(', ')}
                </Typography>
              )}
            </Box>

            <Box sx={{ mt: 2 }}>
              {slots.map(slot => (
                <Typography key={slot.id} variant="body2">
                  {slot.date} {slot.startTime}–{slot.endTime}
                </Typography>
              ))}
            </Box>
          </Paper>
        );
      })}

      {pageCount > 1 && (
        <Box display="flex" justifyContent="center" mt={4}>
          <Pagination count={pageCount} page={page} onChange={handlePageChange} color="primary" />
        </Box>
      )}

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>Pharmacy Details</DialogTitle>
        <DialogContent dividers>
          {currentPharm && (
            <>
              <Typography>
                <strong>Name:</strong> {currentPharm.name}
              </Typography>
              {currentPharm.streetAddress && (
                <Typography>
                  <strong>Address:</strong> {currentPharm.streetAddress}
                </Typography>
              )}
              {currentPharm.methadoneS8Protocols && (
                <Typography>
                  <strong>Methadone S8 Protocols:</strong>{' '}
                  <Button href={currentPharm.methadoneS8Protocols} target="_blank">
                    Download
                  </Button>
                </Typography>
              )}
              {currentPharm.qldSumpDocs && (
                <Typography>
                  <strong>QLD Sump Docs:</strong>{' '}
                  <Button href={currentPharm.qldSumpDocs} target="_blank">
                    Download
                  </Button>
                </Typography>
              )}
              {currentPharm.sops && (
                <Typography>
                  <strong>SOPs:</strong>{' '}
                  <Button href={currentPharm.sops} target="_blank">
                    Download
                  </Button>
                </Typography>
              )}
              {currentPharm.inductionGuides && (
                <Typography>
                  <strong>Induction Guides:</strong>{' '}
                  <Button href={currentPharm.inductionGuides} target="_blank">
                    Download
                  </Button>
                </Typography>
              )}

              {currentPharm.id && (
                <Box sx={{ mt: 1, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  {ratingSummary ? (
                    <>
                      <Rating value={ratingSummary.average} precision={0.5} readOnly size="small" />
                      <Typography variant="body2" color="text.secondary">
                        ({ratingSummary.count})
                      </Typography>
                    </>
                  ) : (
                    <Skeleton variant="rectangular" width={140} height={24} />
                  )}
                </Box>
              )}

              {currentPharm.id && (
                <Box sx={{ mt: 1, mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ mb: 1 }}>
                    Reviews
                  </Typography>

                  {loadingRatings && ratingComments.length === 0 ? (
                    <>
                      <Skeleton variant="text" width="80%" height={22} />
                      <Skeleton variant="text" width="70%" height={22} />
                      <Skeleton variant="text" width="60%" height={22} />
                    </>
                  ) : ratingComments.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No comments yet.
                    </Typography>
                  ) : (
                    <Box sx={{ display: 'grid', gap: 1.5 }}>
                      {ratingComments.map(rc => (
                        <Box key={rc.id} sx={{ p: 1.2, borderRadius: 1, bgcolor: 'action.hover' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Rating value={rc.stars} readOnly size="small" />
                            {rc.createdAt && (
                              <Typography variant="caption" color="text.secondary">
                                {new Date(rc.createdAt).toLocaleDateString()}
                              </Typography>
                            )}
                          </Box>
                          {rc.comment && (
                            <Typography variant="body2" sx={{ mt: 0.5 }}>
                              {rc.comment}
                            </Typography>
                          )}
                        </Box>
                      ))}

                      {commentsPageCount > 1 && (
                        <Box display="flex" justifyContent="center" mt={1}>
                          <Pagination
                            count={commentsPageCount}
                            page={commentsPage}
                            onChange={handleCommentsPageChange}
                            color="primary"
                            size="small"
                          />
                        </Box>
                      )}
                    </Box>
                  )}
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Close</Button>
        </DialogActions>
      </Dialog>

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
    </Container>
  );
}
