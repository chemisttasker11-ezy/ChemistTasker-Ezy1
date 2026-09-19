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
  onOpenPaymentProfile?: () => void;
};

const termsFor = (offer: ShiftOffer): ShiftEngagementTerms | null =>
  (offer.engagementTermsPreview as ShiftEngagementTerms | null | undefined) ?? null;

export default function ShiftEngagementTermsDialog({
  open,
  offers,
  loading = false,
  onClose,
  onConfirm,
  onOpenPaymentProfile,
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
            <Alert
              severity="error"
              action={onOpenPaymentProfile ? (
                <Button color="inherit" size="small" onClick={onOpenPaymentProfile}>
                  Open private profile
                </Button>
              ) : undefined}
            >
              These terms cannot be accepted yet. Complete the required payment/onboarding details first.
            </Alert>
          )}

          {primary && !blocked && (
            <>
              <Stack direction="row" gap={1} flexWrap="wrap">
                {primary.paymentPreference && <Chip label={`Payment: ${primary.paymentPreference}`} />}
                {primary.settlementChannel && <Chip label={`Settlement: ${primary.settlementChannel}`} />}
                {primary.awardClassification && <Chip label={`Award: ${primary.awardClassification}`} />}
                {primary.payBasis && <Chip label={`Basis: ${primary.payBasis}`} />}
                <Chip
                  label={primary.engagementKind === 'INDEPENDENT_CONTRACTOR' ? 'Independent services' : 'Employee engagement'}
                  variant="outlined"
                />
              </Stack>

              {primary.facilitatorNotice && <Alert severity="info">{primary.facilitatorNotice}</Alert>}
              {primary.relationshipNotice && <Alert severity={contractor ? 'warning' : 'info'}>{primary.relationshipNotice}</Alert>}
              {primary.payrollSetupStatus === 'DEFERRED' && (
                <Alert
                  severity="warning"
                  action={onOpenPaymentProfile ? (
                    <Button color="inherit" size="small" onClick={onOpenPaymentProfile}>
                      Complete private profile
                    </Button>
                  ) : undefined}
                >
                  {primary.payrollSetupNotice || 'ChemistTasker Payroll setup is deferred. The shift can still be assigned and timesheeted.'}
                  {primary.payrollMissingFields?.length
                    ? ` Complete later: ${primary.payrollMissingFields.map((field) => field.replaceAll('_', ' ')).join(', ')}.`
                    : ''}
                  {' Your TFN and super identifiers remain private and are not shared with the pharmacy.'}
                </Alert>
              )}
              {primary.awardPayrollReviewRequired && (
                <Alert severity="warning">
                  Assignment can proceed, but ChemistTasker Payroll needs an Award/overtime review before activation.
                  {primary.awardPayrollReviewReasons?.length
                    ? ` ${primary.awardPayrollReviewReasons.join(' ')}`
                    : ''}
                </Alert>
              )}

              <Box>
                <Typography fontWeight={800} gutterBottom>Agreed shift details</Typography>
                <Stack spacing={0.75}>
                  {occurrences.map((item, index) => (
                    <Box key={`${item.slotId ?? 'shift'}-${item.date}-${index}`}>
                      <Typography variant="body2">
                        {item.date} · {item.startTime}–{item.endTime}
                        {item.agreedRate ? ` · Final ${item.agreedRate}/hr` : ''}
                      </Typography>
                      {(item.awardFloorRate || item.ownerBonus || item.postedRate) && (
                        <Typography variant="caption" color="text.secondary">
                          {item.awardFloorRate ? `Award floor ${item.awardFloorRate}/hr` : ''}
                          {item.ownerBonus && Number(item.ownerBonus) > 0 ? ` + bonus ${item.ownerBonus}/hr` : ''}
                          {item.postedRate ? ` · posted/agreed input ${item.postedRate}/hr` : ''}
                        </Typography>
                      )}
                    </Box>
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
