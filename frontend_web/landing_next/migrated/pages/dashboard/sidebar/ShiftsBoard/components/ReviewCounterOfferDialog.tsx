import React from 'react';
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { Shift } from '@chemisttasker/shared-core';
import ReviewOfferSlotList from './ReviewOfferSlotList';
import { useReviewOfferDisplay } from '../hooks/useReviewOfferDisplay';

type ReviewCounterOfferDialogProps = {
  open: boolean;
  onClose: () => void;
  reviewLoading: boolean;
  reviewOfferShiftId: number | null;
  reviewOffers: any[];
  shifts: Shift[];
};

const ReviewCounterOfferDialog: React.FC<ReviewCounterOfferDialogProps> = ({
  open,
  onClose,
  reviewLoading,
  reviewOfferShiftId,
  reviewOffers,
  shifts,
}) => {
  const { shift, offers, hasOffers } = useReviewOfferDisplay({
    reviewOfferShiftId,
    reviewOffers,
    shifts,
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Counter Offer Details</DialogTitle>
      <DialogContent dividers>
        {reviewLoading && (
          <Stack spacing={1} sx={{ mb: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">
                Loading offers...
              </Typography>
            </Stack>
          </Stack>
        )}
        {reviewOfferShiftId != null ? (
          hasOffers ? (
            <ReviewOfferSlotList offers={offers} shift={shift} />
          ) : null // Hide empty state to avoid a confusing "No counter offers" when the button was just clicked.
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReviewCounterOfferDialog;
