import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Checkbox, Chip, Dialog, Portal, Text } from 'react-native-paper';
import type {
  ShiftEngagementTerms,
  ShiftOffer,
  ShiftOfferAcceptancePayload,
} from '@chemisttasker/shared-core';

type Props = {
  visible: boolean;
  offers: ShiftOffer[];
  loading?: boolean;
  onDismiss: () => void;
  onConfirm: (payload: ShiftOfferAcceptancePayload) => Promise<void> | void;
};

const termsFor = (offer: ShiftOffer): ShiftEngagementTerms | null =>
  (offer.engagementTermsPreview as ShiftEngagementTerms | null | undefined) ?? null;

export default function ShiftEngagementTermsDialog({
  visible,
  offers,
  loading = false,
  onDismiss,
  onConfirm,
}: Props) {
  const [accepted, setAccepted] = useState(false);
  const [contractorConfirmed, setContractorConfirmed] = useState(false);

  useEffect(() => {
    if (visible) {
      setAccepted(false);
      setContractorConfirmed(false);
    }
  }, [visible, offers]);

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
    <Portal>
      <Dialog visible={visible} onDismiss={loading ? undefined : onDismiss}>
        <Dialog.Title>Review shift engagement terms</Dialog.Title>
        <Dialog.ScrollArea style={styles.scrollArea}>
          <ScrollView contentContainerStyle={styles.content}>
            {blocked ? (
              <Text style={styles.error}>
                These terms cannot be accepted yet. Complete the required payment/onboarding details first.
              </Text>
            ) : primary ? (
              <>
                <View style={styles.chips}>
                  {primary.paymentPreference ? <Chip compact>Payment: {primary.paymentPreference}</Chip> : null}
                  {primary.settlementChannel ? <Chip compact>Settlement: {primary.settlementChannel}</Chip> : null}
                  {primary.awardClassification ? <Chip compact>Award: {primary.awardClassification}</Chip> : null}
                  {primary.payBasis ? <Chip compact>Basis: {primary.payBasis}</Chip> : null}
                </View>

                {primary.facilitatorNotice ? <Text style={styles.notice}>{primary.facilitatorNotice}</Text> : null}
                {primary.relationshipNotice ? <Text style={styles.notice}>{primary.relationshipNotice}</Text> : null}
                {primary.payrollSetupStatus === 'DEFERRED' ? (
                  <Text style={styles.warning}>
                    {primary.payrollSetupNotice || 'ChemistTasker Payroll setup is deferred. Assignment and timesheets can continue.'}
                    {primary.payrollMissingFields?.length ? ` Complete later: ${primary.payrollMissingFields.join(', ')}.` : ''}
                  </Text>
                ) : null}
                {primary.awardPayrollReviewRequired ? (
                  <Text style={styles.warning}>
                    Assignment can proceed, but ChemistTasker Payroll needs an Award/overtime review before activation.
                    {primary.awardPayrollReviewReasons?.length ? ` ${primary.awardPayrollReviewReasons.join(' ')}` : ''}
                  </Text>
                ) : null}

                <Text style={styles.heading}>Agreed shift details</Text>
                {occurrences.map((item, index) => (
                  <View key={`${item.slotId ?? 'shift'}-${item.date}-${index}`}>
                    <Text style={styles.row}>
                      {item.date} · {item.startTime}–{item.endTime}
                      {item.agreedRate ? ` · Final ${item.agreedRate}/hr` : ''}
                    </Text>
                    {item.awardFloorRate || item.ownerBonus || item.postedRate ? (
                      <Text style={styles.caption}>
                        {item.awardFloorRate ? `Award floor ${item.awardFloorRate}/hr` : ''}
                        {item.ownerBonus && Number(item.ownerBonus) > 0 ? ` + bonus ${item.ownerBonus}/hr` : ''}
                        {item.postedRate ? ` · posted/agreed input ${item.postedRate}/hr` : ''}
                      </Text>
                    ) : null}
                  </View>
                ))}

                {primary.invoiceNotice ? <Text style={styles.notice}>{primary.invoiceNotice}</Text> : null}
                {primary.superNotice ? <Text style={styles.warning}>{primary.superNotice}</Text> : null}
                {primary.legalReviewNotice ? <Text style={styles.caption}>{primary.legalReviewNotice}</Text> : null}

                {requiresAcceptance ? (
                  <Checkbox.Item
                    label="I have reviewed and accept these shift engagement terms, dates and agreed rates."
                    status={accepted ? 'checked' : 'unchecked'}
                    onPress={() => setAccepted((value) => !value)}
                    position="leading"
                    labelStyle={styles.checkboxLabel}
                  />
                ) : null}

                {contractor ? (
                  <Checkbox.Item
                    label="I confirm the parties intend the independent-services arrangement described above. I understand an ABN alone does not determine legal contractor status."
                    status={contractorConfirmed ? 'checked' : 'unchecked'}
                    onPress={() => setContractorConfirmed((value) => !value)}
                    position="leading"
                    labelStyle={styles.checkboxLabel}
                  />
                ) : null}
              </>
            ) : null}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss} disabled={loading}>Cancel</Button>
          <Button
            mode="contained"
            disabled={!canConfirm}
            loading={loading}
            onPress={() => onConfirm({
              engagementTermsAccepted: requiresAcceptance ? accepted : undefined,
              independentContractorStatusConfirmed: contractor ? contractorConfirmed : undefined,
            })}
          >
            Accept & confirm
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  scrollArea: { maxHeight: 520 },
  content: { paddingVertical: 16, gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  heading: { fontWeight: '700', marginTop: 4 },
  row: { color: '#334155' },
  notice: { color: '#334155', lineHeight: 20 },
  warning: { color: '#92400E', lineHeight: 20 },
  error: { color: '#B91C1C', lineHeight: 20 },
  caption: { color: '#64748B', fontSize: 12, lineHeight: 17 },
  checkboxLabel: { fontSize: 13, lineHeight: 18 },
});
