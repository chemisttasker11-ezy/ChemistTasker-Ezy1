/**
 * Shift-marketplace domain facade.
 * This is intentionally a compatibility layer while api.ts is decomposed safely.
 */
export {
  calculateShiftRates,
  getCommunityShifts,
  getPublicShifts,
  getActiveShifts,
  getActiveShiftsPage,
  getConfirmedShifts,
  getConfirmedShiftsPage,
  getHistoryShifts,
  getShiftCounterOffers,
  getShiftCounterOffersBatch,
  createShiftCounterOffer,
  acceptShiftCounterOffer,
  rejectShiftCounterOffer,
  fetchActiveShifts,
  fetchAllActiveShifts,
  fetchCommunityShifts,
  fetchPublicShifts,
  fetchConfirmedShifts,
  fetchAllConfirmedShifts,
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
} from './api';

export * from './context';
export * from './visibility';
export * from './workProfile';
export * from './draftSlots';
export * from './postingDraft';
export * from './descriptionTemplates';
export * from './skillPresets';
// Draft previews (post shift review) render an unsaved payload through the same mapping as API responses.
export { mapShift } from './mappers';

export * from './bookedRate';
