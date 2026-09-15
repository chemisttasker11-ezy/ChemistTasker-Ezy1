import React from 'react';
import { Paper, Stack, Typography } from '@mui/material';
import { Shift } from '@chemisttasker/shared-core';
import { formatDateLong } from '../utils/date';
import { expandOfferSlotsForDisplay } from '../utils/shift';

type ReviewOfferSlotListProps = {
  offers: any[];
  shift: Shift | null;
};

const ReviewOfferSlotList: React.FC<ReviewOfferSlotListProps> = ({ offers, shift }) => {
  if (!offers || offers.length === 0) {
    return null;
  }

  return (
    <Stack spacing={2}>
      {offers.map((offer, idx) => {
        const slotsRaw = Array.isArray(offer.slots) ? offer.slots : [];
        const slots = expandOfferSlotsForDisplay(slotsRaw, shift?.slots ?? []);
        return (
          <Paper key={offer.id ?? idx} variant="outlined" sx={{ p: 1.5, borderColor: 'grey.200' }}>
            <Stack spacing={1}>
              {slots.length > 0 ? (
                slots.map((slot: any, slotIdx: number) => {
                  const slotId = slot.slotId ?? slot.id;
                  return (
                    <Paper
                      key={slot.__displayKey ?? slotId ?? slotIdx}
                      variant="outlined"
                      sx={{ p: 1, borderColor: 'grey.200' }}
                    >
                      <Stack spacing={0.5}>
                        <Typography variant="body2" fontWeight={600}>
                          {slot.date ? formatDateLong(slot.date) : `Slot ${slotId ?? ''}`}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {(slot.proposedStartTime || slot.startTime || '').toString().slice(0, 5)} - {(slot.proposedEndTime || slot.endTime || '').toString().slice(0, 5)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Rate: {slot.proposedRate ?? slot.rate ?? 'N/A'}
                        </Typography>
                      </Stack>
                    </Paper>
                  );
                })
              ) : (
                <Typography variant="body2">No slot details recorded.</Typography>
              )}
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
};

export default ReviewOfferSlotList;
