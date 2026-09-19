import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Typography,
} from '@mui/material';
import type {
  ShiftOffer,
  ShiftOfferAcceptancePayload,
  ShiftEngagementTerms,
} from '@chemisttasker/shared-core';

type Props = {
  open: boolean;
  offers: ShiftOffer[];
  loading?: boolean;
  onClose: () => void;
  onConfirm: (payload: ShiftOfferAcceptancePayload) => Promise<void> | void;
};

const termsFor = (offer: ShiftOffer): ShiftEngagementTerms | null =>
  (offer.engagementTermsPreview as ShiftEngagementTerms | null | undefined) ?? null;

export default function ShiftEngagementTermsDialog({
  open,
  offers,
  loading = false,
  onClose,
  onConfirm,
}: Props) {
  const [accepted, setAccepted] = useState(false);
  const [contractorConfirmed, setContractorConfirmed] = useState(false);

  useEffect(() => {
    if (open) {
      setAccepted(false);
      setContractorConfirmed(false);
    }
  }, [open, offers]);

  const terms = useMemo(
    () => offers.map(termsFor).filter(Boolean) as ShiftEngagementTerms[],
    [offers],
  );
  const primary = terms[0] ?? null;
  const blocked = terms.some((item) => item.blocked);
  const requiresAcceptance = terms.some((item) => item.acceptanceRequired);
  const contractor = terms.some((item) => item.engagementKind === 'INDEPENDENT_CONTRACTOR');
  const occurrences = terms.flatMap((item) => item.occurrences ?? []);

  const canConfirm =
    !blocked
    && (!requiresAcceptance || accepted)
    && (!contractor || contractorConfirmed)
    && !loading;

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Review shift engagement terms</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {blocked && (
            <Alert severity="error">
              These terms cannot be accepted yet. Complete the required payment/onboarding details first.
            </Alert>
          )}

          {primary && !blocked && (
            <>
              <Stack direction="row" gap={1} flexWrap="wrap">
                {primary.paymentPreference && <Chip label={`Payment: ${primary.paymentPreference}`} />}
                {primary.settlementChannel && <Chip label={`Settlement: ${primary.settlementChannel}`} />}
                <Chip
                  label={primary.engagementKind === 'INDEPENDENT_CONTRACTOR' ? 'Independent services' : 'Employee engagement'}
                  variant="outlined"
                />
              </Stack>

              {primary.facilitatorNotice && <Alert severity="info">{primary.facilitatorNotice}</Alert>}
              {primary.relationshipNotice && <Alert severity={contractor ? 'warning' : 'info'}>{primary.relationshipNotice}</Alert>}

              <Box>
                <Typography fontWeight={800} gutterBottom>Agreed shift details</Typography>
                <Stack spacing={0.75}>
                  {occurrences.map((item, index) => (
                    <Typography key={`${item.slotId ?? 'shift'}-${item.date}-${index}`} variant="body2">
                      {item.date} · {item.startTime}–{item.endTime}
                      {item.agreedRate ? ` · $${item.agreedRate}/hr` : ''}
                    </Typography>
                  ))}
                </Stack>
              </Box>

              {primary.invoiceNotice && <Alert severity="info">{primary.invoiceNotice}</Alert>}
              {primary.superNotice && <Alert severity="warning">{primary.superNotice}</Alert>}
              {primary.legalReviewNotice && (
                <Typography variant="caption" color="text.secondary">
                  {primary.legalReviewNotice}
                </Typography>
              )}

              {requiresAcceptance && (
                <FormControlLabel
                  control={<Checkbox checked={accepted} onChange={(_, value) => setAccepted(value)} />}
                  label="I have reviewed and accept the shift engagement terms, dates and agreed rates above."
                />
              )}

              {contractor && (
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={contractorConfirmed}
                      onChange={(_, value) => setContractorConfirmed(value)}
                    />
                  )}
                  label="I confirm the parties intend the independent-services arrangement described above. I understand an ABN alone does not determine legal contractor status."
                />
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!canConfirm}
          onClick={() => onConfirm({
            engagementTermsAccepted: requiresAcceptance ? accepted : undefined,
            independentContractorStatusConfirmed: contractor ? contractorConfirmed : undefined,
          })}
        >
          {loading ? 'Confirming…' : 'Accept & confirm shift'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
