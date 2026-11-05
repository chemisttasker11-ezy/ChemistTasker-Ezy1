/** The accepted TFN offer is actionable only when the server recorded deferred payroll. */
export type DeferredPayrollOffer = {
  id: number;
  paymentPreferenceSnapshot?: string;
  settlementChannel?: string;
  engagementKind?: string;
  payrollActivatedAt?: string | null;
  engagementTermsSnapshot?: {
    payrollActivationRequired?: boolean;
    pharmacyId?: number | string;
    pharmacyName?: string;
    workerName?: string;
    awardClassification?: string;
    payBasis?: string;
  };
};

/** Match the web rule and the backend's activation preconditions without broadening the action. */
export function filterDeferredPayrollOffers(
  offers: readonly DeferredPayrollOffer[],
  scopedPharmacyId: number | null,
): DeferredPayrollOffer[] {
  return offers.filter((offer) => {
    const terms = offer.engagementTermsSnapshot;
    if (
      offer.paymentPreferenceSnapshot !== 'TFN'
      || offer.engagementKind !== 'SHIFT_EMPLOYMENT'
      || offer.settlementChannel !== 'TIMESHEET_ONLY'
      || terms?.payrollActivationRequired !== true
      || Boolean(offer.payrollActivatedAt)
    ) return false;
    if (scopedPharmacyId == null) return true;
    const identity = terms.pharmacyId;
    const id = identity == null || identity === '' ? NaN : Number(identity);
    return Number.isSafeInteger(id) && id > 0 && id === scopedPharmacyId;
  });
}
