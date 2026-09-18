/**
 * Shift-marketplace domain facade.
 * This is intentionally a compatibility layer while api.ts is decomposed safely.
 */
export {
  calculateShiftRates,
  getCommunityShifts,
  getPublicShifts,
  getActiveShifts,
  getConfirmedShifts,
  getHistoryShifts,
  getShiftCounterOffers,
  getShiftCounterOffersBatch,
  createShiftCounterOffer,
  acceptShiftCounterOffer,
  rejectShiftCounterOffer,
  fetchActiveShifts,
  fetchCommunityShifts,
  fetchPublicShifts,
  fetchConfirmedShifts,
  fetchShiftCounterOffersService,
  fetchShiftCounterOffersBatchService,
  submitShiftCounterOfferService,
  acceptShiftCounterOfferService,
  rejectShiftCounterOfferService,
  escalateShiftService,
  deleteActiveShiftService,
  acceptShiftCandidateService,
  expressInterestInShiftService,
  claimShiftService,
} from '../../api';
