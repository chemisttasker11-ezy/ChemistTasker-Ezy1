import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadTs(path) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const result = {};
  vm.runInNewContext(outputText, {
    exports: result,
    require: (name) => {
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return result;
}

const {
  resolveWorkerShiftOffer,
  canAcceptOffer,
  isCommunityShift,
  isExplorerShiftRestricted,
  createOfferMutationTracker,
  beginOfferMutation,
  endOfferMutation,
  releaseOfferMutation,
  resolveOfferAcceptanceResult,
  getErrorHttpStatus,
  isTermsChangedError,
  isTermsDialogVisible,
  narrowSelectedOffers,
  createTermsAcceptanceState,
  dropCachedOfferPreviews,
  canConfirmTermsAcceptance,
  isOfferSelectionStale,
  selectOffersForTerms,
  transitionTermsChanged,
  transitionReloadStart,
  transitionReloadSuccess,
  transitionReloadFailure,
  dismissTermsAcceptance,
} = loadTs('./workerShiftDetailLogic.ts');

const plain = (val) => JSON.parse(JSON.stringify(val));

test('resolveWorkerShiftOffer prefers direct offerId match over shift fallback and guards shift mismatch', () => {
  const offers = [
    { id: 101, shift: 12, status: 'PENDING' },
    { id: 102, shift: 12, status: 'PENDING' },
    { id: 103, shift: 12, status: 'DECLINED' },
    { id: 201, shift: 99, status: 'PENDING' },
  ];

  // Specific offer_id specified: returns that exact offer (102), NOT first shift match (101)
  const direct = resolveWorkerShiftOffer({ offers, offerId: 102, shiftId: 12 });
  assert.equal(direct?.id, 102);

  // If offerId belongs to a different shift (201 is for shift 99), falls back to shift 12's pending offer (101)
  const wrongShiftOffer = resolveWorkerShiftOffer({ offers, offerId: 201, shiftId: 12 });
  assert.equal(wrongShiftOffer?.id, 101);

  // Non-pending offerId (103 is DECLINED) is ignored and falls back to pending shift offer (101)
  const declinedOffer = resolveWorkerShiftOffer({ offers, offerId: 103, shiftId: 12 });
  assert.equal(declinedOffer?.id, 101);

  // Fallback to shift match when offerId not specified
  const fallback = resolveWorkerShiftOffer({ offers, offerId: null, shiftId: 12 });
  assert.equal(fallback?.id, 101);

  // Fallback to shiftDetail.id shape
  const objOffers = [{ id: 301, shiftDetail: { id: 77 }, status: 'PENDING' }];
  const matched = resolveWorkerShiftOffer({ offers: objOffers, shiftId: 77 });
  assert.equal(matched?.id, 301);

  // None match
  const miss = resolveWorkerShiftOffer({ offers, offerId: 999, shiftId: 555 });
  assert.equal(miss, null);
});

test('canAcceptOffer correctly checks blocked status and terms requirement', () => {
  assert.deepEqual(plain(canAcceptOffer(null)), { allowed: false, reason: 'Offer not found' });

  // Blocked offer (e.g. missing onboarding/payment profile)
  const blocked = { id: 1, engagementTermsPreview: { blocked: true, acceptanceRequired: true } };
  const blockedCheck = canAcceptOffer(blocked);
  assert.equal(blockedCheck.allowed, false);
  assert.equal(blockedCheck.requiresTerms, true);
  assert.match(blockedCheck.reason || '', /required onboarding\/payment details/);

  // Acceptance required
  const reqTerms = { id: 2, engagementTermsPreview: { blocked: false, acceptanceRequired: true } };
  assert.deepEqual(plain(canAcceptOffer(reqTerms)), { allowed: true, requiresTerms: true });

  // Ready to accept immediately
  const ready = { id: 3, engagementTermsPreview: { blocked: false, acceptanceRequired: false } };
  assert.deepEqual(plain(canAcceptOffer(ready)), { allowed: true, requiresTerms: false });
});

test('isCommunityShift detects all internal visibility tiers vs public platform shifts', () => {
  for (const tier of ['COMMUNITY', 'FULL_PART_TIME', 'LOCUM_CASUAL', 'OWNER_CHAIN', 'ORG_CHAIN']) {
    assert.equal(isCommunityShift({ visibility: tier }), true, `visibility=${tier}`);
    assert.equal(isCommunityShift({ visibilityLevel: tier.toLowerCase() }), true, `visibilityLevel=${tier}`);
  }
  assert.equal(isCommunityShift({ isCommunity: true }), true);

  assert.equal(isCommunityShift({ visibility: 'PLATFORM' }), false);
  assert.equal(isCommunityShift({ visibility: 'PUBLIC' }), false);
  assert.equal(isCommunityShift(null), false);
});

test('isExplorerShiftRestricted locks community shifts and 403 responses for public-only explorer persona', () => {
  const commShift = { visibility: 'FULL_PART_TIME' };
  const pubShift = { visibility: 'PLATFORM' };

  // Explorer on community shift: restricted
  assert.equal(isExplorerShiftRestricted(commShift, { publicOnly: true }), true);

  // Explorer receiving 403 from backend before shift payload loads: restricted
  assert.equal(isExplorerShiftRestricted(null, { publicOnly: true }, 403), true);

  // Explorer on public shift: allowed
  assert.equal(isExplorerShiftRestricted(pubShift, { publicOnly: true }), false);

  // Pharmacist or Staff (not public-only) on community shift or 403: not explorer-restricted
  assert.equal(isExplorerShiftRestricted(commShift, { publicOnly: false }), false);
  assert.equal(isExplorerShiftRestricted(null, { publicOnly: false }, 403), false);
});

test('resolveOfferAcceptanceResult distinguishes ACCEPTED_AWAITING_PAYMENT from confirmed states', () => {
  // Awaiting payment string
  const awaitingStr = resolveOfferAcceptanceResult('ACCEPTED_AWAITING_PAYMENT');
  assert.equal(awaitingStr.isAwaitingPayment, true);
  assert.equal(awaitingStr.isConfirmed, false);
  assert.match(awaitingStr.message, /reserved, waiting for payment/i);

  // Awaiting payment object
  const awaitingObj = resolveOfferAcceptanceResult({ status: 'ACCEPTED_AWAITING_PAYMENT' });
  assert.equal(awaitingObj.isAwaitingPayment, true);
  assert.equal(awaitingObj.isConfirmed, false);
  assert.match(awaitingObj.message, /reserved, waiting for payment/i);

  // Awaiting payment in nested offer
  const awaitingNested = resolveOfferAcceptanceResult({ offer: { status: 'ACCEPTED_AWAITING_PAYMENT' } });
  assert.equal(awaitingNested.isAwaitingPayment, true);
  assert.equal(awaitingNested.isConfirmed, false);
  assert.match(awaitingNested.message, /reserved, waiting for payment/i);

  // Awaiting payment in data payload
  const awaitingData = resolveOfferAcceptanceResult({ data: { status: 'ACCEPTED_AWAITING_PAYMENT' } });
  assert.equal(awaitingData.isAwaitingPayment, true);
  assert.equal(awaitingData.isConfirmed, false);
  assert.match(awaitingData.message, /reserved, waiting for payment/i);

  // Confirmed booking
  const confirmed = resolveOfferAcceptanceResult({ status: 'CONFIRMED' });
  assert.equal(confirmed.isAwaitingPayment, false);
  assert.equal(confirmed.isConfirmed, true);
  assert.match(confirmed.message, /booking confirmed/i);

  // Accepted booking
  const accepted = resolveOfferAcceptanceResult({ status: 'ACCEPTED' });
  assert.equal(accepted.isAwaitingPayment, false);
  assert.equal(accepted.isConfirmed, true);
  assert.match(accepted.message, /booking confirmed/i);

  // Empty or undefined response defaults to confirmed
  const emptyRes = resolveOfferAcceptanceResult(undefined);
  assert.equal(emptyRes.isAwaitingPayment, false);
  assert.equal(emptyRes.isConfirmed, true);
  assert.match(emptyRes.message, /booking confirmed/i);

  // Other non-confirmed state does not claim booking confirmed
  const pendingRes = resolveOfferAcceptanceResult({ status: 'PENDING_APPROVAL' });
  assert.equal(pendingRes.isConfirmed, false);
  assert.equal(pendingRes.isAwaitingPayment, false);
  assert.doesNotMatch(pendingRes.message, /booking confirmed/i);
});

test('OfferMutationTracker decouples mutation busy state from load generation and releases on all outcomes', () => {
  const tracker = createOfferMutationTracker();
  assert.equal(tracker.busy, false);
  assert.equal(tracker.currentGen, 0);

  // 1. Success lifecycle: begin -> simulated loadShift advancing external query -> endMutation releases busy
  let simulatedLoadGen = 0;
  const mut1 = beginOfferMutation(tracker);
  assert.equal(tracker.busy, true);
  assert.equal(mut1.gen, 1);
  assert.equal(mut1.isLatest(), true);

  // Simulating loadShift: query generation increments, mutation tracker remains unchanged
  simulatedLoadGen += 1;
  assert.equal(simulatedLoadGen, 1);
  assert.equal(mut1.isLatest(), true);

  const endResult1 = endOfferMutation(tracker, mut1.gen);
  assert.equal(endResult1.isLatest, true);
  assert.equal(endResult1.busy, false);
  assert.equal(tracker.busy, false);

  // 2. Error lifecycle: begin -> error occurs -> endMutation releases busy
  const mut2 = beginOfferMutation(tracker);
  assert.equal(tracker.busy, true);
  assert.equal(mut2.gen, 2);
  const endResult2 = endOfferMutation(tracker, mut2.gen);
  assert.equal(endResult2.busy, false);
  assert.equal(tracker.busy, false);

  // 3. Superseded lifecycle: mut3 starts, then mut4 starts before mut3 finishes
  const mut3 = beginOfferMutation(tracker);
  assert.equal(mut3.gen, 3);
  assert.equal(mut3.isLatest(), true);

  const mut4 = beginOfferMutation(tracker);
  assert.equal(mut4.gen, 4);
  assert.equal(mut3.isLatest(), false); // mut3 is superseded!
  assert.equal(mut4.isLatest(), true);

  // When superseded mut3 ends, busy is NOT cleared because mut4 is still in-flight
  const endResult3 = endOfferMutation(tracker, mut3.gen);
  assert.equal(endResult3.isLatest, false);
  assert.equal(endResult3.busy, true);
  assert.equal(tracker.busy, true);

  // When latest mut4 ends, busy is released
  const endResult4 = endOfferMutation(tracker, mut4.gen);
  assert.equal(endResult4.isLatest, true);
  assert.equal(endResult4.busy, false);
  assert.equal(tracker.busy, false);

  // 4. releaseOfferMutation unconditionally resets busy
  tracker.busy = true;
  releaseOfferMutation(tracker);
  assert.equal(tracker.busy, false);
});

test('getErrorHttpStatus extracts status from ApiError, response, or returns null', () => {
  // ApiError shape from shared-core
  assert.equal(getErrorHttpStatus({ status: 403, payload: { detail: 'Forbidden' } }), 403);
  // Transport / Axios response shape
  assert.equal(getErrorHttpStatus({ response: { status: 403 } }), 403);
  // Nested or status code
  assert.equal(getErrorHttpStatus({ statusCode: 404 }), 404);
  // Plain Error
  assert.equal(getErrorHttpStatus(new Error('Network failure')), null);
  assert.equal(getErrorHttpStatus(null), null);
});

test('isTermsChangedError detects TERMS_CHANGED across error payload variations', () => {
  assert.equal(isTermsChangedError({ code: 'TERMS_CHANGED' }), true);
  assert.equal(isTermsChangedError({ payload: { code: 'TERMS_CHANGED' } }), true);
  assert.equal(isTermsChangedError({ payload: { error: 'TERMS_CHANGED' } }), true);
  assert.equal(isTermsChangedError({ response: { data: { code: 'TERMS_CHANGED' } } }), true);
  assert.equal(isTermsChangedError({ response: { data: { detail: 'TERMS_CHANGED: terms revised' } } }), true);
  assert.equal(isTermsChangedError(new Error('TERMS_CHANGED')), true);

  assert.equal(isTermsChangedError({ payload: { code: 'NETWORK_ERROR' } }), false);
  assert.equal(isTermsChangedError(new Error('Random error')), false);
  assert.equal(isTermsChangedError(null), false);
});

test('narrowSelectedOffers keeps only matching fresh offers and never substitutes unselected pending offers', () => {
  const selected = [{ id: 10, engagementTermsPreview: { rate: 70 } }, { id: 11, engagementTermsPreview: { rate: 75 } }];
  const freshPending = [
    { id: 9, engagementTermsPreview: { rate: 65 } },
    { id: 10, engagementTermsPreview: { rate: 80 } },
    { id: 11, engagementTermsPreview: { rate: 85 } },
    { id: 12, engagementTermsPreview: { rate: 90 } },
  ];

  const narrowed = narrowSelectedOffers(selected, freshPending);
  assert.equal(narrowed.length, 2);
  assert.equal(narrowed[0].id, 10);
  assert.equal(narrowed[0].engagementTermsPreview.rate, 80);
  assert.equal(narrowed[1].id, 11);
  assert.equal(narrowed[1].engagementTermsPreview.rate, 85);

  const partialFresh = [
    { id: 10, engagementTermsPreview: { rate: 80 } },
    { id: 12, engagementTermsPreview: { rate: 90 } },
    { id: 13, engagementTermsPreview: { rate: 95 } },
  ];
  const partial = narrowSelectedOffers(selected, partialFresh);
  assert.equal(partial.length, 1);
  assert.equal(partial[0].id, 10);

  const noneMatch = narrowSelectedOffers(selected, [
    { id: 20, engagementTermsPreview: { rate: 100 } },
    { id: 21, engagementTermsPreview: { rate: 110 } },
  ]);
  assert.equal(noneMatch.length, 0);

  assert.equal(narrowSelectedOffers([], freshPending).length, 0);
  assert.equal(narrowSelectedOffers(selected, []).length, 0);
});

test('TermsAcceptanceState transitions and guards confirm only in fresh state', () => {
  const initial = createTermsAcceptanceState();
  assert.equal(initial.status, 'fresh');
  assert.equal(canConfirmTermsAcceptance(initial), false);

  const freshOffer = { id: 101, engagementTermsPreview: { rate: 75, blocked: false } };
  const freshSelection = selectOffersForTerms(initial, [freshOffer]);
  assert.equal(freshSelection.needsReload, false);
  assert.equal(freshSelection.state.status, 'fresh');
  assert.equal(canConfirmTermsAcceptance(freshSelection.state), true);

  const blockedOffer = { id: 102, engagementTermsPreview: { rate: 75, blocked: true } };
  const blockedSelection = selectOffersForTerms(initial, [blockedOffer]);
  assert.equal(canConfirmTermsAcceptance(blockedSelection.state), false);

  const staleState = transitionTermsChanged(freshSelection.state, [freshOffer], 'Terms changed');
  assert.equal(staleState.status, 'stale');
  assert.equal(staleState.offers[0].engagementTermsPreview, null);
  assert.deepEqual(plain(staleState.staleOfferIds), [101]);
  assert.equal(canConfirmTermsAcceptance(staleState), false);

  const reloadingState = transitionReloadStart(staleState);
  assert.equal(reloadingState.status, 'reloading');
  assert.equal(reloadingState.offers[0].engagementTermsPreview, null);
  assert.equal(canConfirmTermsAcceptance(reloadingState), false);

  const failedState = transitionReloadFailure(reloadingState, 'Network error');
  assert.equal(failedState.status, 'failed');
  assert.equal(failedState.offers[0].engagementTermsPreview, null);
  assert.equal(failedState.error, 'Network error');
  assert.equal(canConfirmTermsAcceptance(failedState), false);

  const freshReloadedOffer = { id: 101, engagementTermsPreview: { rate: 85, blocked: false } };
  const reloadedSuccessState = transitionReloadSuccess(failedState, [freshReloadedOffer]);
  assert.equal(reloadedSuccessState.status, 'fresh');
  assert.equal(reloadedSuccessState.offers.length, 1);
  assert.equal(reloadedSuccessState.offers[0].engagementTermsPreview.rate, 85);
  assert.deepEqual(plain(reloadedSuccessState.staleOfferIds), []);
  assert.equal(canConfirmTermsAcceptance(reloadedSuccessState), true);

  const unavailableState = transitionReloadSuccess(failedState, [{ id: 999, engagementTermsPreview: { rate: 90 } }]);
  assert.equal(unavailableState.status, 'failed');
  assert.equal(unavailableState.offers.length, 0);
  assert.equal(canConfirmTermsAcceptance(unavailableState), false);
});

test('Cancel and reopen after reload failure prevents restoring stale previews and requires reload', () => {
  const initialOffer = { id: 201, engagementTermsPreview: { rate: 70, blocked: false } };
  let state = selectOffersForTerms(createTermsAcceptanceState(), [initialOffer]).state;
  assert.equal(canConfirmTermsAcceptance(state), true);

  state = transitionTermsChanged(state, [initialOffer]);
  assert.equal(state.status, 'stale');
  assert.equal(state.offers[0].engagementTermsPreview, null);

  state = transitionReloadStart(state);
  assert.equal(state.status, 'reloading');

  state = transitionReloadFailure(state, 'Failed to fetch updated terms');
  assert.equal(state.status, 'failed');
  assert.equal(canConfirmTermsAcceptance(state), false);

  const dismissedState = dismissTermsAcceptance(state);
  assert.equal(dismissedState.offers.length, 0);
  assert.deepEqual(plain(dismissedState.staleOfferIds), [201]);
  assert.equal(dismissedState.visible, false);
  assert.equal(isTermsDialogVisible(dismissedState), false);

  const reopened = selectOffersForTerms(dismissedState, [initialOffer]);
  assert.equal(reopened.needsReload, true);
  assert.equal(reopened.state.status, 'reloading');
  assert.equal(reopened.state.visible, true);
  assert.equal(isTermsDialogVisible(reopened.state), true);
  assert.equal(reopened.state.offers[0].engagementTermsPreview, null);
  assert.equal(canConfirmTermsAcceptance(reopened.state), false);

  const updatedOffer = { id: 201, engagementTermsPreview: { rate: 80, blocked: false } };
  const recoveredState = transitionReloadSuccess(transitionReloadStart(reopened.state), [updatedOffer]);
  assert.equal(recoveredState.status, 'fresh');
  assert.equal(recoveredState.offers[0].engagementTermsPreview.rate, 80);
  assert.equal(canConfirmTermsAcceptance(recoveredState), true);
});

test('Try again while loading blocks confirmation and hides stale terms until reload succeeds', () => {
  const initialOffer = { id: 301, engagementTermsPreview: { rate: 65, blocked: false } };
  let state = selectOffersForTerms(createTermsAcceptanceState(), [initialOffer]).state;

  state = transitionTermsChanged(state, [initialOffer]);
  state = transitionReloadStart(state);
  state = transitionReloadFailure(state, 'Shift detail load failed');
  assert.equal(state.status, 'failed');

  const tryAgainLoadingState = transitionReloadStart(state);
  assert.equal(tryAgainLoadingState.status, 'reloading');
  assert.equal(tryAgainLoadingState.offers[0].engagementTermsPreview, null);
  assert.equal(canConfirmTermsAcceptance(tryAgainLoadingState), false);

  const freshLoadedOffer = { id: 301, engagementTermsPreview: { rate: 75, blocked: false } };
  const completedState = transitionReloadSuccess(tryAgainLoadingState, [freshLoadedOffer]);
  assert.equal(completedState.status, 'fresh');
  assert.equal(completedState.offers[0].engagementTermsPreview.rate, 75);
  assert.equal(canConfirmTermsAcceptance(completedState), true);
});

test('dropCachedOfferPreviews strips previews only from target IDs or all if omitted', () => {
  const offers = [
    { id: 1, engagementTermsPreview: { rate: 50 } },
    { id: 2, engagementTermsPreview: { rate: 60 } },
    { id: 3, engagementTermsPreview: { rate: 70 } },
  ];

  const partialDropped = dropCachedOfferPreviews(offers, [2]);
  assert.notEqual(partialDropped[0].engagementTermsPreview, null);
  assert.equal(partialDropped[1].engagementTermsPreview, null);
  assert.notEqual(partialDropped[2].engagementTermsPreview, null);

  const allDropped = dropCachedOfferPreviews(offers);
  assert.equal(allDropped[0].engagementTermsPreview, null);
  assert.equal(allDropped[1].engagementTermsPreview, null);
  assert.equal(allDropped[2].engagementTermsPreview, null);
});


test('Terms dialog visibility separated from freshness: failed -> Cancel closes, reopen -> reloading, empty selection closes', () => {
  const offer = { id: 401, engagementTermsPreview: { rate: 90, blocked: false } };

  // 1. Failed -> Cancel closes dialog while stale IDs remain marked stale
  let state = selectOffersForTerms(createTermsAcceptanceState(), [offer]).state;
  state = transitionReloadFailure(state, 'Reload error');
  assert.equal(state.status, 'failed');
  assert.equal(isTermsDialogVisible(state), true);

  // Cancel closes the dialog
  const cancelledState = dismissTermsAcceptance(state);
  assert.equal(cancelledState.visible, false);
  assert.equal(isTermsDialogVisible(cancelledState), false);
  assert.equal(cancelledState.status, 'failed');
  assert.deepEqual(plain(cancelledState.staleOfferIds), [401]);

  // 2. Reopen -> reloading
  const reopened = selectOffersForTerms(cancelledState, [offer]);
  assert.equal(reopened.needsReload, true);
  assert.equal(reopened.state.status, 'reloading');
  assert.equal(reopened.state.visible, true);
  assert.equal(isTermsDialogVisible(reopened.state), true);
  assert.deepEqual(plain(reopened.state.staleOfferIds), [401]);

  // 3. Empty selection closes
  // 3a. Selecting empty array closes
  const emptySelect = selectOffersForTerms(createTermsAcceptanceState([offer], true), []);
  assert.equal(emptySelect.needsReload, false);
  assert.equal(emptySelect.state.visible, false);
  assert.equal(isTermsDialogVisible(emptySelect.state), false);

  // 3b. Reload success when offers are no longer available closes dialog
  const reloadState = transitionReloadStart(createTermsAcceptanceState([offer], true), [offer]);
  const unavailableState = transitionReloadSuccess(reloadState, []);
  assert.equal(unavailableState.status, 'failed');
  assert.equal(unavailableState.visible, false);
  assert.equal(isTermsDialogVisible(unavailableState), false);
  assert.equal(unavailableState.offers.length, 0);
});

test('background terms reload stays dismissed until explicit worker selection', () => {
  const offer = { id: 501, engagementTermsPreview: { rate: 75 } };
  const selected = selectOffersForTerms(createTermsAcceptanceState(), [offer]).state;
  const cancelled = dismissTermsAcceptance(selected);
  const reload = transitionReloadStart(cancelled, [offer]);
  assert.equal(reload.visible, false);
  assert.equal(isTermsDialogVisible(reload), false);
  const updated = transitionReloadSuccess(reload, [offer]);
  assert.equal(updated.visible, false);
  assert.equal(selectOffersForTerms(updated, [offer]).state.visible, true);
});
