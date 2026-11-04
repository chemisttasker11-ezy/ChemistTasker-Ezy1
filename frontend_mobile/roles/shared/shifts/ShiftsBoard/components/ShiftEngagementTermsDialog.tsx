import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Square, SquareCheck } from 'lucide-react-native';
import type {
  ShiftEngagementTerms,
  ShiftOffer,
  ShiftOfferAcceptancePayload,
} from '@chemisttasker/shared-core';
import { BottomSheet, Button, Pill, ScalePressable } from '@/components/ui';
import { colors, font, radius, space, touch, type } from '@/constants/tokens';
import type { TermsAcceptanceStatus } from '../../workerShiftDetailLogic';

type Props = {
  visible: boolean;
  offers: ShiftOffer[];
  loading?: boolean;
  status?: TermsAcceptanceStatus;
  error?: string | null;
  onDismiss: () => void;
  onConfirm: (payload: ShiftOfferAcceptancePayload) => Promise<void> | void;
  onOpenPaymentProfile?: () => void;
  onRetry?: () => void;
};

const termsFor = (offer: ShiftOffer): ShiftEngagementTerms | null =>
  (offer.engagementTermsPreview as ShiftEngagementTerms | null | undefined) ?? null;

export default function ShiftEngagementTermsDialog({
  visible,
  offers,
  loading = false,
  status,
  error = null,
  onDismiss,
  onConfirm,
  onOpenPaymentProfile,
  onRetry,
}: Props) {
  const [accepted, setAccepted] = useState(false);
  const [contractorConfirmed, setContractorConfirmed] = useState(false);

  useEffect(() => {
    if (visible) {
      setAccepted(false);
      setContractorConfirmed(false);
    }
  }, [visible, offers, error]);

  const terms = useMemo(
    () => offers.map(termsFor).filter(Boolean) as ShiftEngagementTerms[],
    [offers],
  );
  const primary = terms[0] ?? null;
  const blocked = terms.some((item) => item.blocked);
  const requiresAcceptance = terms.some((item) => item.acceptanceRequired);
  const contractor = terms.some((item) => item.engagementKind === 'INDEPENDENT_CONTRACTOR');
  const occurrences = terms.flatMap((item) => item.occurrences ?? []);
  const isReloading = loading || status === 'reloading';
  const isFresh = !status || status === 'fresh';
  const showRetry = (!primary || status === 'failed' || status === 'reloading' || status === 'stale') && Boolean(onRetry);
  const canConfirm =
    Boolean(primary)
    && isFresh
    && !blocked
    && (!requiresAcceptance || accepted)
    && (!contractor || contractorConfirmed)
    && !isReloading;

  return (
    <BottomSheet
      open={visible}
      onClose={loading ? () => {} : onDismiss}
      dismissable={!loading}
      title="Review shift engagement terms"
      footer={
        <View style={styles.footerRow}>
          <Button label="Cancel" variant="outlined" onPress={onDismiss} disabled={loading} style={styles.actionBtn} />
          {showRetry ? (
            <Button
              label={isReloading ? 'Reloading...' : 'Retry reload'}
              onPress={onRetry ?? (() => {})}
              disabled={isReloading}
              style={styles.actionBtn}
            />
          ) : (
            <Button
              label={loading ? 'Confirming...' : 'Accept & confirm'}
              disabled={!canConfirm}
              onPress={() => onConfirm({
                engagementTermsAccepted: requiresAcceptance ? accepted : undefined,
                independentContractorStatusConfirmed: contractor ? contractorConfirmed : undefined,
              })}
              style={styles.actionBtn}
            />
          )}
        </View>
      }
    >
      <View style={styles.content}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {showRetry ? (
              <View style={styles.callout}>
                <Text style={styles.warning}>
                  Updated terms could not be loaded. Please retry to load the latest terms.
                </Text>
                <Button label="Retry reload" variant="outlined" onPress={onRetry ?? (() => {})} disabled={isReloading} />
              </View>
            ) : null}
            {blocked ? (
              <View style={styles.callout}>
                <Text style={styles.error}>
                  These terms cannot be accepted yet. Complete the required payment/onboarding details first.
                </Text>
                {onOpenPaymentProfile ? (
                  <Button label="Open private payment profile" variant="outlined" onPress={onOpenPaymentProfile} />
                ) : null}
              </View>
            ) : primary ? (
              <>
                <View style={styles.chips}>
                  {primary.paymentPreference ? <Pill label={`Payment: ${primary.paymentPreference}`} outlined /> : null}
                  {primary.settlementChannel ? <Pill label={`Settlement: ${primary.settlementChannel}`} outlined /> : null}
                  {primary.awardClassification ? <Pill label={`Award: ${primary.awardClassification}`} tone="violet" /> : null}
                  {primary.payBasis ? <Pill label={`Basis: ${primary.payBasis}`} outlined /> : null}
                </View>

                {primary.facilitatorNotice ? <Text style={styles.notice}>{primary.facilitatorNotice}</Text> : null}
                {primary.relationshipNotice ? <Text style={styles.notice}>{primary.relationshipNotice}</Text> : null}
                {primary.payrollSetupStatus === 'DEFERRED' ? (
                  <View style={styles.callout}>
                    <Text style={styles.warning}>
                      {primary.payrollSetupNotice || 'ChemistTasker Payroll setup is deferred. Assignment and timesheets can continue.'}
                      {primary.payrollMissingFields?.length
                        ? ` Complete later: ${primary.payrollMissingFields.map((field) => field.replaceAll('_', ' ')).join(', ')}.`
                        : ''}
                      {' Your TFN and super identifiers remain private and are not shared with the pharmacy.'}
                    </Text>
                    {onOpenPaymentProfile ? (
                      <Button label="Complete private payment profile" variant="outlined" onPress={onOpenPaymentProfile} />
                    ) : null}
                  </View>
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
                      {item.date} · {item.startTime}-{item.endTime}
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
                  <ScalePressable
                    static
                    pressBg
                    haptic="selection"
                    onPress={() => setAccepted((value) => !value)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: accepted }}
                    accessibilityLabel="I have reviewed and accept these shift engagement terms, dates and agreed rates."
                    style={styles.checkboxRow}
                  >
                    {accepted ? <SquareCheck size={22} color={colors.accentStrong} strokeWidth={2} /> : <Square size={22} color={colors.textSecondary} strokeWidth={2} />}
                    <Text style={styles.checkboxLabel}>I have reviewed and accept these shift engagement terms, dates and agreed rates.</Text>
                  </ScalePressable>
                ) : null}

                {contractor ? (
                  <ScalePressable
                    static
                    pressBg
                    haptic="selection"
                    onPress={() => setContractorConfirmed((value) => !value)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: contractorConfirmed }}
                    accessibilityLabel="I confirm the parties intend the independent-services arrangement described above. I understand an ABN alone does not determine legal contractor status."
                    style={styles.checkboxRow}
                  >
                    {contractorConfirmed ? <SquareCheck size={22} color={colors.accentStrong} strokeWidth={2} /> : <Square size={22} color={colors.textSecondary} strokeWidth={2} />}
                    <Text style={styles.checkboxLabel}>I confirm the parties intend the independent-services arrangement described above. I understand an ABN alone does not determine legal contractor status.</Text>
                  </ScalePressable>
                ) : null}
              </>
            ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: space.md, gap: space.md },
  callout: { padding: space.md, borderRadius: radius.nested, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.subtleBg, gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  heading: { fontFamily: font.outfit.medium, fontSize: type.titleSmall.fontSize, lineHeight: type.titleSmall.lineHeight, color: colors.textPrimary, marginTop: space.xs },
  row: { fontFamily: font.inter.medium, fontSize: type.bodyMedium.fontSize, lineHeight: type.bodyMedium.lineHeight, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  notice: { fontFamily: font.inter.regular, fontSize: type.bodyMedium.fontSize, lineHeight: 21, color: colors.textSecondary },
  warning: { fontFamily: font.inter.regular, fontSize: type.bodyMedium.fontSize, lineHeight: 21, color: colors.status.amber.fg },
  error: { fontFamily: font.inter.medium, fontSize: type.bodyMedium.fontSize, lineHeight: 21, color: colors.status.red.fg },
  caption: { fontFamily: font.inter.regular, fontSize: type.bodySmall.fontSize, lineHeight: 18, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, minHeight: touch.min, paddingVertical: space.xs },
  checkboxLabel: { flex: 1, fontFamily: font.inter.regular, fontSize: type.bodySmall.fontSize, lineHeight: 20, color: colors.textPrimary },
  footerRow: { flexDirection: 'row', gap: space.sm },
  actionBtn: { flex: 1 },
});
