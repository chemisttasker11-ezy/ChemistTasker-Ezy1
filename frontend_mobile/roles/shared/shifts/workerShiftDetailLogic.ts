import type { ShiftOffer } from '@chemisttasker/shared-core';

export type OfferAcceptanceCheck = {
  allowed: boolean;
  reason?: string;
  requiresTerms?: boolean;
};

export type ShiftVisibilityLike = {
  visibility?: string | null;
  visibilityLevel?: string | null;
  isCommunity?: boolean | null;
};

const INTERNAL_VISIBILITIES = new Set([
  'COMMUNITY',
  'FULL_PART_TIME',
  'LOCUM_CASUAL',
  'OWNER_CHAIN',
  'ORG_CHAIN',
]);

function getOfferShiftId(offer: ShiftOffer): number | null {
  const raw = offer.shift ?? offer.shiftDetail?.id ?? (offer as { shiftId?: number }).shiftId;
  return raw != null && Number.isFinite(Number(raw)) ? Number(raw) : null;
}

function isPendingOffer(offer: ShiftOffer): boolean {
  return !offer.status || String(offer.status).toUpperCase() === 'PENDING';
}

/**
 * Resolves the applicable pending offer for a worker viewing a shift.
 * A specific `offerId` from the route query takes precedence over a general shift match.
 */
export function resolveWorkerShiftOffer({
  offers,
  offerId,
  shiftId,
}: {
  offers: ShiftOffer[];
  offerId?: number | null;
  shiftId: number;
}): ShiftOffer | null {
  if (offerId != null && Number.isFinite(offerId)) {
    const direct = offers.find((o) => {
      if (o.id !== offerId || !isPendingOffer(o)) return false;
      const matchShiftId = getOfferShiftId(o);
      return matchShiftId == null || matchShiftId === shiftId;
    });
    if (direct) return direct;
  }
  return (
    offers.find((o) => isPendingOffer(o) && getOfferShiftId(o) === shiftId) ?? null
  );
}

/**
 * Checks whether an offer can be accepted immediately or requires additional terms / is blocked.
 */
export function canAcceptOffer(offer: ShiftOffer | null | undefined): OfferAcceptanceCheck {
  if (!offer) {
    return { allowed: false, reason: 'Offer not found' };
  }
  const preview = offer.engagementTermsPreview;
  if (preview?.blocked) {
    return {
      allowed: false,
      reason: 'This offer cannot be confirmed until the required onboarding/payment details are completed.',
      requiresTerms: Boolean(preview?.acceptanceRequired),
    };
  }
  return {
    allowed: true,
    requiresTerms: Boolean(preview?.acceptanceRequired),
  };
}

/**
 * Whether a shift is internal/community-scoped rather than open on the public marketplace.
 */
export function isCommunityShift(
  shift: ShiftVisibilityLike | null | undefined,
): boolean {
  if (!shift) return false;
  const vis = String(shift.visibility ?? shift.visibilityLevel ?? '').toUpperCase();
  return INTERNAL_VISIBILITIES.has(vis) || Boolean(shift.isCommunity);
}

/**
 * Explorer users are restricted to public shifts only; community shifts (or 403 responses) are locked.
 */
export function isExplorerShiftRestricted(
  shift: ShiftVisibilityLike | null | undefined,
  surface: { publicOnly?: boolean },
  statusCode?: number | null,
): boolean {
  if (!surface.publicOnly) return false;
  if (statusCode === 403) return true;
  return isCommunityShift(shift);
}

/**
 * Mutation tracker decoupling offer mutation busy state from query/load generation.
 * Mutation busy state must be released on success, error, or superseded.
 */
export type OfferMutationTracker = {
  currentGen: number;
  busy: boolean;
};

export function createOfferMutationTracker(): OfferMutationTracker {
  return { currentGen: 0, busy: false };
}

export function beginOfferMutation(tracker: OfferMutationTracker): {
  gen: number;
  isLatest: () => boolean;
} {
  tracker.currentGen += 1;
  tracker.busy = true;
  const gen = tracker.currentGen;
  return {
    gen,
    isLatest: () => tracker.currentGen === gen,
  };
}

export function endOfferMutation(
  tracker: OfferMutationTracker,
  mutationGen?: number,
): { busy: boolean; isLatest: boolean } {
  const isLatest = mutationGen == null || tracker.currentGen === mutationGen;
  if (isLatest) {
    tracker.busy = false;
  }
  return {
    busy: tracker.busy,
    isLatest,
  };
}

export function releaseOfferMutation(tracker: OfferMutationTracker): void {
  tracker.busy = false;
}

/**
 * Offer acceptance result mapping.
 * ACCEPTED_AWAITING_PAYMENT shows the "reserved, waiting for payment" state and copy;
 * only a confirmed result says confirmed.
 */
export type OfferAcceptanceResult = {
  status: string;
  isAwaitingPayment: boolean;
  isConfirmed: boolean;
  message: string;
};

export function resolveOfferAcceptanceResult(result: unknown): OfferAcceptanceResult {
  const rawStatus =
    (typeof result === 'string' ? result : null) ??
    (result as any)?.status ??
    (result as any)?.state ??
    (result as any)?.outcome ??
    (result as any)?.offer?.status ??
    (result as any)?.data?.status ??
    '';

  const status = String(rawStatus || '').trim().toUpperCase();
  const isAwaitingPayment =
    status === 'ACCEPTED_AWAITING_PAYMENT' || status.includes('AWAITING_PAYMENT');

  if (isAwaitingPayment) {
    return {
      status: 'ACCEPTED_AWAITING_PAYMENT',
      isAwaitingPayment: true,
      isConfirmed: false,
      message: 'Shift offer accepted! Shift reserved, waiting for payment.',
    };
  }

  const isConfirmed =
    status === 'CONFIRMED' ||
    status === 'ACCEPTED' ||
    status === 'BOOKED' ||
    status === 'SUCCESS' ||
    status === '';

  return {
    status: status || 'CONFIRMED',
    isAwaitingPayment: false,
    isConfirmed,
    message: isConfirmed
      ? 'Shift offer accepted! Booking confirmed.'
      : 'Shift offer accepted.',
  };
}

/**
 * Extracts HTTP status code from shared-core ApiError (.status) or transport response (.response.status).
 */
export function getErrorHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const anyErr = error as any;
  const raw = anyErr.status ?? anyErr.response?.status ?? anyErr.statusCode ?? null;
  if (raw == null) return null;
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * Detects TERMS_CHANGED response from the server when terms have updated.
 */
export function isTermsChangedError(error: unknown): boolean {
  if (!error) return false;
  const anyErr = error as any;
  const code =
    anyErr.code ??
    anyErr.payload?.code ??
    anyErr.payload?.error ??
    anyErr.response?.data?.code ??
    anyErr.response?.data?.error;
  if (typeof code === 'string' && code.toUpperCase() === 'TERMS_CHANGED') {
    return true;
  }
  const detail = anyErr.payload?.detail ?? anyErr.response?.data?.detail ?? anyErr.message;
  if (typeof detail === 'string' && detail.includes('TERMS_CHANGED')) {
    return true;
  }
  return false;
}

/**
 * Narrows fresh pending offers to exactly those previously selected by the user.
 * Guarantees that only matching offer IDs are kept, in their selected order.
 * If selected offers are no longer pending/available, returns an empty array.
 * Never substitutes unselected pending offers.
 */
export function narrowSelectedOffers<T extends { id: number }>(
  selected: T[],
  freshPending: ShiftOffer[],
): ShiftOffer[] {
  if (!selected.length || !freshPending.length) return [];
  const freshById = new Map<number, ShiftOffer>();
  for (const offer of freshPending) {
    freshById.set(offer.id, offer);
  }
  return selected
    .map((item) => freshById.get(item.id))
    .filter((offer): offer is ShiftOffer => Boolean(offer));
}

/**
 * Pure terms-acceptance state tracking for worker shifts.
 * Status: 'fresh' | 'stale' | 'reloading' | 'failed' per offer selection.
 * Transitions:
 *  - TERMS_CHANGED -> 'stale' (drop cached previews for those offers)
 *  - reload start -> 'reloading' (previews remain dropped)
 *  - reload ok -> 'fresh' (new previews from latest reload)
 *  - reload error -> 'failed' (previews stay dropped, retry shown)
 * Confirm is enabled ONLY in 'fresh' with previews from the latest successful reload.
 */

/**
 * Pure terms-acceptance state tracking for worker shifts.
 * Status: 'fresh' | 'stale' | 'reloading' | 'failed' per offer selection.
 * Transitions:
 *  - TERMS_CHANGED -> 'stale' (drop cached previews for those offers)
 *  - reload start -> 'reloading' (previews remain dropped)
 *  - reload ok -> 'fresh' (new previews from latest reload)
 *  - reload error -> 'failed' (previews stay dropped, retry shown)
 * Confirm is enabled ONLY in 'fresh' with previews from the latest successful reload.
 */
export type TermsAcceptanceStatus = 'fresh' | 'stale' | 'reloading' | 'failed';

export interface TermsAcceptanceState {
  status: TermsAcceptanceStatus;
  visible: boolean;
  selectedOfferIds: number[];
  offers: ShiftOffer[];
  error: string | null;
  staleOfferIds: number[];
}

export function createTermsAcceptanceState(
  initialOffers?: ShiftOffer[],
  initialVisible = false,
): TermsAcceptanceState {
  const offers = initialOffers ?? [];
  return {
    status: 'fresh',
    visible: Boolean(initialVisible),
    selectedOfferIds: offers.map((o) => o.id),
    offers,
    error: null,
    staleOfferIds: [],
  };
}

/**
 * Returns whether the terms acceptance dialog should be presented.
 * Decouples presentation visibility from underlying terms freshness.
 */
export function isTermsDialogVisible(state: TermsAcceptanceState): boolean {
  return Boolean(state.visible);
}

/**
 * Drops cached engagementTermsPreview from specified offers (or all if targetOfferIds omitted).
 * Ensures stale previews never leak in local collections or offer state.
 */
export function dropCachedOfferPreviews<T extends ShiftOffer>(
  offers: T[],
  targetOfferIds?: number[],
): T[] {
  if (!offers.length) return [];
  const targetSet = targetOfferIds && targetOfferIds.length > 0 ? new Set(targetOfferIds) : null;
  return offers.map((offer) => {
    if (!targetSet || targetSet.has(offer.id)) {
      if (offer.engagementTermsPreview === null) return offer;
      return { ...offer, engagementTermsPreview: null };
    }
    return offer;
  });
}

/**
 * Determines whether confirmation is permitted.
 * Confirm is enabled ONLY in 'fresh' with previews from the latest successful reload.
 */
export function canConfirmTermsAcceptance(state: TermsAcceptanceState): boolean {
  if (state.status !== 'fresh') return false;
  if (!state.offers || state.offers.length === 0) return false;
  const staleSet = new Set(state.staleOfferIds);
  for (const offer of state.offers) {
    if (staleSet.has(offer.id)) return false;
    const preview = offer.engagementTermsPreview;
    if (!preview || preview.blocked) return false;
  }
  return true;
}

/**
 * Checks whether an offer selection is stale or previously failed, requiring a reload.
 */
export function isOfferSelectionStale(
  state: TermsAcceptanceState,
  selectedOffers: ShiftOffer[],
): boolean {
  if (!selectedOffers || selectedOffers.length === 0) return false;
  const staleSet = new Set(state.staleOfferIds);
  for (const offer of selectedOffers) {
    if (staleSet.has(offer.id)) return true;
    if (
      state.selectedOfferIds.includes(offer.id) &&
      (state.status === 'stale' || state.status === 'failed' || state.status === 'reloading')
    ) {
      return true;
    }
    if (offer.engagementTermsPreview === null && state.selectedOfferIds.includes(offer.id)) {
      return true;
    }
  }
  return false;
}

/**
 * Prepares terms state for a user's selection of offers (e.g. tapping 'Confirm offer' / 'Accept offer').
 * If the selection contains any offers rejected by TERMS_CHANGED or previously failed,
 * marks them stale, drops previews, and flags needsReload: true.
 * If fresh, sets offers and needsReload: false.
 */
export function selectOffersForTerms(
  state: TermsAcceptanceState,
  selectedOffers: ShiftOffer[],
): { state: TermsAcceptanceState; needsReload: boolean } {
  if (!selectedOffers || selectedOffers.length === 0) {
    return {
      state: {
        ...state,
        visible: false,
        offers: [],
        selectedOfferIds: [],
      },
      needsReload: false,
    };
  }

  const ids = selectedOffers.map((o) => o.id);
  const isStale = isOfferSelectionStale(state, selectedOffers);

  if (isStale) {
    const nextStaleIds = Array.from(new Set([...state.staleOfferIds, ...ids]));
    return {
      state: {
        status: 'reloading',
        visible: true,
        selectedOfferIds: ids,
        offers: dropCachedOfferPreviews(selectedOffers, ids),
        error: state.error ?? 'Shift engagement terms have changed. Please review the updated terms and confirm again.',
        staleOfferIds: nextStaleIds,
      },
      needsReload: true,
    };
  }

  return {
    state: {
      status: 'fresh',
      visible: true,
      selectedOfferIds: ids,
      offers: selectedOffers,
      error: null,
      staleOfferIds: state.staleOfferIds,
    },
    needsReload: false,
  };
}

/**
 * Transition: TERMS_CHANGED -> stale (drop cached previews for those offers).
 */
export function transitionTermsChanged(
  state: TermsAcceptanceState,
  rejectedOffers: ShiftOffer[],
  message?: string,
): TermsAcceptanceState {
  const rejectedIds = rejectedOffers.map((o) => o.id);
  const nextStaleIds = Array.from(new Set([...state.staleOfferIds, ...rejectedIds]));
  return {
    status: 'stale',
    visible: true,
    selectedOfferIds: rejectedIds.length > 0 ? rejectedIds : state.selectedOfferIds,
    offers: dropCachedOfferPreviews(rejectedOffers.length > 0 ? rejectedOffers : state.offers),
    error: message ?? 'Shift engagement terms have changed. Please review the updated terms and confirm again.',
    staleOfferIds: nextStaleIds,
  };
}

/**
 * Transition: reload start -> reloading.
 * Drops cached previews to guarantee no stale terms can be confirmed while loading.
 */
export function transitionReloadStart(
  state: TermsAcceptanceState,
  selectedOffers?: ShiftOffer[],
): TermsAcceptanceState {
  const currentOffers = selectedOffers ?? state.offers;
  const ids = selectedOffers ? selectedOffers.map((o) => o.id) : state.selectedOfferIds;
  return {
    status: 'reloading',
    visible: ids.length > 0 ? true : state.visible,
    selectedOfferIds: ids,
    offers: dropCachedOfferPreviews(currentOffers),
    error: state.error,
    staleOfferIds: state.staleOfferIds,
  };
}

/**
 * Transition: reload ok -> fresh (new previews from the latest reload).
 * Only matching fresh pending offers are kept.
 * Offers that successfully received fresh previews are removed from staleOfferIds.
 */
export function transitionReloadSuccess(
  state: TermsAcceptanceState,
  freshPendingOffers: ShiftOffer[],
  noticeMessage?: string,
): TermsAcceptanceState {
  const targetIds = state.selectedOfferIds;
  const matching = narrowSelectedOffers(targetIds.map((id) => ({ id })), freshPendingOffers);

  if (matching.length === 0) {
    return {
      status: 'failed',
      visible: false,
      selectedOfferIds: targetIds,
      offers: [],
      error: 'The selected offers are no longer available.',
      staleOfferIds: Array.from(new Set([...state.staleOfferIds, ...targetIds])),
    };
  }

  const matchingIdSet = new Set(matching.map((o) => o.id));
  const remainingStaleIds = state.staleOfferIds.filter((id) => !matchingIdSet.has(id));

  return {
    status: 'fresh',
    visible: state.visible,
    selectedOfferIds: matching.map((o) => o.id),
    offers: matching,
    error: noticeMessage ?? (state.status === 'reloading' || state.status === 'stale' || state.status === 'failed'
      ? 'Shift engagement terms have changed. Please review the updated terms and confirm again.'
      : null),
    staleOfferIds: remainingStaleIds,
  };
}

/**
 * Transition: reload error -> failed (retry shown, previews stay dropped).
 */
export function transitionReloadFailure(
  state: TermsAcceptanceState,
  errorMessage?: string,
): TermsAcceptanceState {
  return {
    status: 'failed',
    visible: state.visible,
    selectedOfferIds: state.selectedOfferIds,
    offers: dropCachedOfferPreviews(state.offers),
    error: errorMessage ?? 'Shift engagement terms have changed. Failed to refresh terms. Please retry.',
    staleOfferIds: Array.from(new Set([...state.staleOfferIds, ...state.selectedOfferIds])),
  };
}

/**
 * Dismiss/cancel handler: closes dialog presentation while preserving staleOfferIds.
 * When dismissed after a failure, the offers remain recorded as stale so subsequent
 * reopening cannot restore stale previews without a successful reload.
 */
export function dismissTermsAcceptance(state: TermsAcceptanceState): TermsAcceptanceState {
  return {
    ...state,
    visible: false,
    offers: [],
    error: null,
  };
}
