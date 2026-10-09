import React from 'react';
import SkillIcon, { skillLabel } from '@/public/skill-icon';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  IconButton,
  Paper,
  Rating,
  Stack,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  AccessTime as AccessTimeIcon,
  AttachMoney as AttachMoneyIcon,
  Bolt as BoltIcon,
  CalendarToday as CalendarTodayIcon,
  ChatBubbleOutline as ChatBubbleOutlineIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Favorite as FavoriteIcon,
  FilterList as FilterListIcon,
  Flight as FlightIcon,
  Hotel as HotelIcon,
  Layers as LayersIcon,
  Paid as PaidIcon,
  Place as PlaceIcon,
  WorkOutline as WorkOutlineIcon,
} from '@mui/icons-material';
import dayjs from 'dayjs';
import { Shift, ShiftCounterOfferPayload } from '@chemisttasker/shared-core';
import { CounterOfferTrack, RatePreference, ShiftSlot, SlotFilterMode } from '../types';
import { formatDateLong, formatDateShort, formatTime } from '../utils/date';
import { getRateSummary, getSlotRate } from '../utils/rates';
import {
  getEmploymentLabel,
  getUpcomingSlotsForDisplay,
  getShiftAddress,
  getShiftAllowPartial,
  getShiftCity,
  getShiftFlexibleTime,
  getShiftNegotiable,
  getShiftPharmacyId,
  getShiftPharmacyName,
  getShiftRoleLabel,
  getShiftState,
  getShiftUrgent,
} from '../utils/shift';

const buildMapAddress = (shift: Shift) => {
  const addressLine = getShiftAddress(shift);
  const city = getShiftCity(shift);
  const state = getShiftState(shift);
  const parts = [addressLine, city, state].filter(Boolean);
  if (parts.length > 0) return parts.join(', ');
  const pharmacy = shift.pharmacyDetail;
  const fallbackParts = [
    pharmacy?.streetAddress,
    pharmacy?.suburb,
    pharmacy?.state,
    pharmacy?.postcode,
  ].filter(Boolean);
  return fallbackParts.join(', ');
};

const openMapWindow = (address: string) => {
  if (!address) return;
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
};

type ShiftListProps = {
  loading?: boolean;
  publicPresentation?: boolean;
  processedShifts: Shift[];
  clearAllFilters: () => void;
  hideCounterOffer?: boolean;
  onSubmitCounterOffer?: (payload: ShiftCounterOfferPayload) => Promise<void> | void;
  onRejectShift?: (shift: Shift) => Promise<void> | void;
  onRejectSlot?: (shift: Shift, slotId: number) => Promise<void> | void;
  onRejectSlots?: (shift: Shift, slotIds: number[]) => Promise<void> | void;
  handleApplyAll: (shift: Shift) => Promise<void> | void;
  handleApplySlot: (shift: Shift, slotId: number) => Promise<void> | void;
  handleApplySlots: (shift: Shift, slotIds: number[]) => Promise<void> | void;
  handleRejectShift: (shift: Shift) => Promise<void> | void;
  handleRejectSlot: (shift: Shift, slotId: number) => Promise<void> | void;
  handleRejectSlots: (shift: Shift, slotIds: number[]) => Promise<void> | void;
  toggleExpandedCard: (shiftId: number) => void;
  expandedCards: Record<number, boolean>;
  selectedSlotIds: Record<number, Set<number>>;
  toggleSlotSelection: (shiftId: number, slotId: number) => void;
  clearSelection: (shiftId: number) => void;
  appliedShiftIds: Set<number>;
  appliedSlotIds: Set<number>;
  rejectedShiftIds: Set<number>;
  rejectedSlotIds: Set<number>;
  savedShiftIds: Set<number>;
  savedFeatureEnabled: boolean;
  hideSaveToggle?: boolean;
  toggleSaveShift: (shiftId: number) => void;
  counterOffers: Record<number, CounterOfferTrack>;
  onReviewOffers: (shiftId: number) => void;
  openCounterOffer: (shift: Shift, selectedSlots?: Set<number>) => void;
  rejectActionGuard?: (shift: Shift) => boolean;
  actionDisabledGuard?: (shift: Shift) => boolean;
  userRatePreference?: RatePreference;
  pharmacyRatings: Record<number, { average: number; count: number }>;
  slotFilterMode?: SlotFilterMode;
  showAllSlots?: boolean;
  applyLabel?: string;
  disableSlotActions?: boolean;
  disableActionGuards?: boolean;
};

const ShiftList: React.FC<ShiftListProps> = ({
  loading,
  publicPresentation = false,
  processedShifts,
  clearAllFilters,
  hideCounterOffer,
  onSubmitCounterOffer,
  onRejectShift,
  onRejectSlot,
  onRejectSlots,
  handleApplyAll,
  handleApplySlot,
  handleApplySlots,
  handleRejectShift,
  handleRejectSlot,
  handleRejectSlots,
  toggleExpandedCard,
  expandedCards,
  selectedSlotIds,
  toggleSlotSelection,
  clearSelection,
  appliedShiftIds,
  appliedSlotIds,
  rejectedShiftIds,
  rejectedSlotIds,
  savedShiftIds,
  savedFeatureEnabled,
  hideSaveToggle,
  toggleSaveShift,
  counterOffers,
  onReviewOffers,
  openCounterOffer,
  rejectActionGuard,
  actionDisabledGuard,
  userRatePreference,
  pharmacyRatings,
  slotFilterMode,
  showAllSlots,
  applyLabel,
  disableSlotActions,
  disableActionGuards,
}) => (
  <Stack spacing={2}>
    {loading && (
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, borderColor: 'grey.200' }}>
        <Typography>Loading shifts...</Typography>
      </Paper>
    )}
    {!loading && processedShifts.length === 0 && (
      <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, textAlign: 'center', borderColor: 'grey.200' }}>
        <FilterListIcon sx={{ fontSize: 48, color: 'grey.300' }} />
        <Typography variant="h6" sx={{ mt: 1 }}>No jobs found</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          We couldn't find any positions matching your criteria.
        </Typography>
        <Button variant="contained" sx={{ mt: 2 }} onClick={clearAllFilters}>
          Reset filters
        </Button>
      </Paper>
    )}

    {processedShifts.map((shift) => {
      const rawSlots = shift.slots ?? [];
      const allSlots = showAllSlots ? (rawSlots as ShiftSlot[]) : getUpcomingSlotsForDisplay(rawSlots as ShiftSlot[]);
      const mode = slotFilterMode ?? 'all';
      const actionsDisabled = actionDisabledGuard ? actionDisabledGuard(shift) : false;
      const isShiftApplied = appliedShiftIds.has(shift.id);
      const isShiftRejected = rejectedShiftIds.has(shift.id);
      const counterInfo = counterOffers[shift.id];
      const counterSlotIds = new Set<number>(
        Object.keys(counterInfo?.slots ?? {})
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
      );
      const hasVisibleCounterOffer = Boolean(counterInfo) && counterSlotIds.size > 0;
      const hasShiftLevelCounter = false;
      const hasShiftLevelInterest = isShiftApplied || hasShiftLevelCounter;
      const hasSlotActions = allSlots.some((slot) => {
        if (slot.id == null) return false;
        return appliedSlotIds.has(slot.id) || rejectedSlotIds.has(slot.id) || counterSlotIds.has(slot.id);
      });
      let slots = allSlots;
      if (mode === 'interested') {
        if (allSlots.length > 0) {
          slots = allSlots.filter((slot) => {
            if (slot.id == null) return false;
            if (rejectedSlotIds.has(slot.id)) return false;
            return appliedSlotIds.has(slot.id) || counterSlotIds.has(slot.id);
          });
          if (slots.length === 0) {
            return null;
          }
        } else if (!hasShiftLevelInterest) {
          return null;
        }
      } else if (mode === 'rejected') {
        if (!isShiftRejected) {
          slots = allSlots.filter((slot) => slot.id != null && rejectedSlotIds.has(slot.id));
        }
        if (slots.length === 0 && !isShiftRejected) {
          return null;
        }
      }

      const isMulti = slots.length > 1;
      const isExpanded = Boolean(expandedCards[shift.id]);
      const selection = disableSlotActions ? new Set<number>() : (selectedSlotIds[shift.id] ?? new Set<number>());
      const isRejectedShift = isShiftRejected;
      const isFullOrPartTime = ['FULL_TIME', 'PART_TIME'].includes(shift.employmentType ?? '');
      const isPharmacistProvided = shift.rateType === 'PHARMACIST_PROVIDED';
      const offerStatusBySlot = ((shift as any).__offerStatusBySlot ?? {}) as Record<number, string>;
      const shiftOfferStatus = String((shift as any).__shiftOfferStatus ?? '').toUpperCase();
      const isOffersMode = applyLabel === 'Confirm';
      const hasPendingOffer = !isOffersMode || shiftOfferStatus === 'PENDING' || Object.values(offerStatusBySlot).some(
        (status) => String(status).toUpperCase() === 'PENDING'
      );
      const awaitingPaymentSlotIds = new Set(
        Object.entries(offerStatusBySlot)
          .filter(([, status]) => String(status).toUpperCase() === 'ACCEPTED_AWAITING_PAYMENT')
          .map(([slotId]) => Number(slotId))
          .filter((slotId) => Number.isFinite(slotId))
      );
      const hasAwaitingPaymentSlots = awaitingPaymentSlotIds.size > 0 || shiftOfferStatus === 'ACCEPTED_AWAITING_PAYMENT';
      const hasSlots = slots.length > 0;
      const firstSlot = slots[0];
      const uniformSlotTimes =
        hasSlots &&
        slots.every(
          (slot) =>
            slot.startTime === firstSlot?.startTime &&
            slot.endTime === firstSlot?.endTime &&
            slot.startTime &&
            slot.endTime
        );
      const flexibleTime = getShiftFlexibleTime(shift);
      const showTimeText = (() => {
        if (!hasSlots) {
          return isFullOrPartTime ? getEmploymentLabel(shift) : 'Time not set';
        }
        if (uniformSlotTimes && firstSlot?.startTime && firstSlot?.endTime) {
          return `${formatTime(firstSlot.startTime)} - ${formatTime(firstSlot.endTime)}`;
        }
        // Non-uniform times:
        // - If flexible: show tag only (no time text)
        // - If not flexible: hide the time row
        return '';
      })();
      const shouldShowTimeRow = Boolean(showTimeText) || flexibleTime;
      // Counter offer is allowed when either time is flexible or rate is negotiable.
      // Rate negotiation is only enabled in the modal when rate is flexible; time negotiation follows flexible_timing even for FT/PT.
      const showCounter = !hideCounterOffer && (getShiftFlexibleTime(shift) || getShiftNegotiable(shift)) && !isRejectedShift;
      const showNegotiable = getShiftNegotiable(shift) && !isRejectedShift;
      const superValue = Number(shift.superPercent);
      const showSuperChip = !isFullOrPartTime && Number.isFinite(superValue) && superValue > 0;
      const paymentType =
        shift.paymentPreference ||
        (shift.employmentType === 'LOCUM'
          ? 'ABN'
          : shift.employmentType
          ? 'TFN'
          : null);
      const isSaved = savedShiftIds.has(shift.id);
      const allSlotsApplied = allSlots.length > 0 && allSlots.every((slot) => appliedSlotIds.has(slot.id));
      const isApplied = isShiftApplied || allSlotsApplied;
      const hasRejectedSlots = allSlots.some((slot) => rejectedSlotIds.has(slot.id));
      const slotRejected = (slotId: number) => rejectedSlotIds.has(slotId) || isRejectedShift;
      const allowPartial = getShiftAllowPartial(shift);
      const canSelectSlots = !shift.singleUserOnly && isMulti && (allowPartial || isOffersMode) && !disableSlotActions;
      const hasActiveSlotSelection = canSelectSlots && selection.size > 0;
      const shiftLevelLocked = isShiftApplied || isRejectedShift || hasShiftLevelCounter;
      const slotLevelLocked = isShiftApplied || isRejectedShift;
      const interactionLocked = shiftLevelLocked || hasSlotActions;
      const shiftActionsDisabled = actionsDisabled || (!disableActionGuards && interactionLocked);
      const slotActionsDisabled = actionsDisabled || (!disableActionGuards && slotLevelLocked);
      const urgent = getShiftUrgent(shift);
      const rateSummary = getRateSummary(shift);
      const rejectAllowed = rejectActionGuard ? rejectActionGuard(shift) : true;
      const pharmacyId = getShiftPharmacyId(shift);
      const ratingSummary = pharmacyId != null ? pharmacyRatings[pharmacyId] : undefined;
      const isAnonymous = Boolean((shift as any).post_anonymously ?? shift.postAnonymously);
      const mapAddress = isAnonymous ? '' : buildMapAddress(shift);
      const requiredLabels = Array.from(new Set((shift.mustHave || []).map(skill => skillLabel(skill))));
      const preferredLabels = Array.from(new Set((shift.niceToHave || []).map(skill => skillLabel(skill))));

      return (
        <Paper
          key={shift.id}
          variant="outlined"
          sx={{
            p: { xs: 2, md: publicPresentation ? 2.75 : 2.5 },
            borderRadius: publicPresentation ? '14px' : 3,
            borderColor: urgent ? '#B76A12' : publicPresentation ? '#DEE5EF' : 'grey.200',
            borderLeftWidth: urgent && !publicPresentation ? 4 : 1,
            position: 'relative',
            bgcolor: 'background.paper',
            boxShadow: publicPresentation ? 'none' : urgent ? 4 : 2,
            transition: publicPresentation ? 'border-color 180ms ease, box-shadow 180ms ease' : undefined,
            '&:hover': publicPresentation ? { borderColor: '#B8A8DE', boxShadow: '0 12px 32px rgba(6,18,58,.085)' } : undefined,
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        >
          {urgent && !publicPresentation && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                px: 1.5,
                py: 0.5,
                bgcolor: 'warning.main',
                color: 'common.white',
                borderBottomRightRadius: 8,
                fontSize: 10,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              <BoltIcon sx={{ fontSize: 12 }} />
              Urgent
            </Box>
          )}
          <Stack spacing={publicPresentation ? 1.25 : 2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={publicPresentation ? 2.5 : 2} justifyContent="space-between">
              <Box sx={{ flex: 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Typography component={publicPresentation ? 'h3' : 'div'} variant="h6" sx={{ color: '#06123A', fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: publicPresentation ? { xs: 21, md: 23 } : undefined, lineHeight: 1.25, cursor: publicPresentation ? 'default' : 'pointer' }} onClick={publicPresentation ? undefined : () => toggleExpandedCard(shift.id)}>
                      {getShiftPharmacyName(shift)}
                    </Typography>
                    {ratingSummary && ratingSummary.count > 0 && (
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5 }}>
                        <Rating value={ratingSummary.average} precision={0.5} readOnly size="small" />
                        <Typography variant="caption" color="text.secondary">
                          ({ratingSummary.count})
                        </Typography>
                      </Stack>
                    )}
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center" sx={{ mt: 1 }}>
                      <Chip icon={<WorkOutlineIcon />} label={getShiftRoleLabel(shift)} size="small" sx={publicPresentation ? { bgcolor: '#F0ECFC', color: '#5222B8', fontWeight: 800, borderRadius: '7px' } : undefined} />
                      {publicPresentation && urgent && <Chip label="Urgent" size="small" sx={{ bgcolor: '#FFF0DB', color: '#805000', fontWeight: 800, borderRadius: '7px' }} />}
                      {!publicPresentation && (shift.mustHave || []).map(skill => <Chip key={`required-${skill}`} icon={<SkillIcon skill={skill}/>} label={`Required: ${skillLabel(skill)}`} size="small" />)}
                      {!publicPresentation && (shift.niceToHave || []).map(skill => <Chip key={`preferred-${skill}`} icon={<SkillIcon skill={skill}/>} label={`Preferred: ${skillLabel(skill)}`} size="small" variant="outlined" />)}
                      {(shift.hasTravel || shift.hasAccommodation) && (
                        <Stack direction="row" spacing={0.5}>
                          {shift.hasTravel && <Chip icon={<FlightIcon />} label="Travel" size="small" />}
                          {shift.hasAccommodation && <Chip icon={<HotelIcon />} label="Accomm." size="small" />}
                        </Stack>
                      )}
                      {paymentType && !publicPresentation && (
                        <Chip label={`Payment: ${paymentType}`} size="small" variant="outlined" />
                      )}
                      {isRejectedShift && <Chip label="Rejected" size="small" color="error" />}
                      {hasVisibleCounterOffer && (
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => onReviewOffers(shift.id)}
                          sx={{ textTransform: 'none' }}
                        >
                          Review counter offer(s)
                        </Button>
                      )}
                    </Stack>
                    {shift.createdAt && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                        Posted {dayjs(shift.createdAt).format('D MMM YYYY')}
                      </Typography>
                    )}
                  </Box>
                  {savedFeatureEnabled && !hideSaveToggle && (
                    <IconButton onClick={() => toggleSaveShift(shift.id)}>
                      <FavoriteIcon color={isSaved ? 'error' : 'disabled'} />
                    </IconButton>
                  )}
                </Stack>

                <Stack spacing={publicPresentation ? 0.8 : 1} sx={{ mt: publicPresentation ? 1.5 : 2 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CalendarTodayIcon fontSize="small" color="action" />
                    <Typography variant="body2">
                      {firstSlot
                        ? formatDateShort(firstSlot?.date)
                        : isFullOrPartTime
                          ? getEmploymentLabel(shift)
                          : 'No dates provided'}
                      {isMulti && <span style={{ color: '#94A3B8', marginLeft: 6 }}>+ {slots.length - 1} more</span>}
                    </Typography>
                  </Stack>
                  {shouldShowTimeRow && (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <AccessTimeIcon fontSize="small" color="action" />
                      {showTimeText && <Typography variant="body2">{showTimeText}</Typography>}
                      {flexibleTime && (
                        <Chip label="Flex" size="small" color="success" />
                      )}
                    </Stack>
                  )}
                  <Stack direction="row" spacing={1} alignItems="center">
                    {mapAddress ? (
                      <IconButton
                        size="small"
                        onClick={() => openMapWindow(mapAddress)}
                        sx={{ ml: -0.5 }}
                      >
                        <PlaceIcon fontSize="small" color="action" />
                      </IconButton>
                    ) : (
                      <PlaceIcon fontSize="small" color="action" />
                    )}
                    <Typography variant="body2">{getShiftCity(shift)} ({getShiftState(shift)})</Typography>
                  </Stack>
                </Stack>
                {publicPresentation && (requiredLabels.length > 0 || preferredLabels.length > 0) && (
                  <Stack spacing={0.75} sx={{ mt: 1.6, pt: 1.5, borderTop: '1px solid #E9EFF6' }}>
                    {requiredLabels.length > 0 && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.75} alignItems={{ sm: 'baseline' }}>
                      <Typography component="span" sx={{ color: '#5222B8', fontWeight: 850, fontSize: 13, minWidth: 76 }}>Required</Typography>
                      <Typography component="span" sx={{ color: '#344563', fontSize: 13.5, lineHeight: 1.6, overflowWrap: 'anywhere' }}>{requiredLabels.join('  ·  ')}</Typography>
                    </Stack>}
                    {preferredLabels.length > 0 && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.75} alignItems={{ sm: 'baseline' }}>
                      <Typography component="span" sx={{ color: '#52617C', fontWeight: 800, fontSize: 13, minWidth: 76 }}>Preferred</Typography>
                      <Typography component="span" sx={{ color: '#445474', fontSize: 13.5, lineHeight: 1.6, overflowWrap: 'anywhere' }}>{preferredLabels.join('  ·  ')}</Typography>
                    </Stack>}
                  </Stack>
                )}
              </Box>

              <Box sx={{ minWidth: { xs: 0, md: 180 }, textAlign: { xs: 'left', md: 'right' }, borderTop: { xs: publicPresentation ? '1px solid #E4E9F2' : 'none', md: 'none' }, pt: { xs: publicPresentation ? 2 : 0, md: 0 } }}>
                <Stack spacing={1} alignItems={{ xs: 'flex-start', md: 'flex-end' }}>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <AttachMoneyIcon fontSize="small" color="success" />
                    <Typography variant="h6" sx={publicPresentation ? { color: '#06123A', fontSize: 24, fontWeight: 800 } : undefined}>
                      {rateSummary.display}
                      <Typography component="span" variant="caption" color="text.secondary">
                        {rateSummary.unitLabel}
                      </Typography>
                    </Typography>
                  </Stack>
                  {isFullOrPartTime && shift.superPercent && (
                    <Chip label={`+ Superannuation (${shift.superPercent}%)`} size="small" />
                  )}
                  {showSuperChip && (
                    <Chip
                      label="+Super"
                      size="small"
                      sx={{ bgcolor: '#D7ECFF', color: '#0B4D8C' }}
                    />
                  )}
                  {showNegotiable && (
                    <Chip icon={<PaidIcon />} label="Negotiable" size="small" color="info" />
                  )}
                  {publicPresentation && paymentType && <Typography sx={{ color: '#52617C', fontSize: 12.5, fontWeight: 750 }}>Payment: {paymentType}</Typography>}
                  {isPharmacistProvided && (
                    <Typography variant="caption" color="text.secondary">
                      Rate set by pharmacist, update your profile rates to improve matches.
                    </Typography>
                  )}
                  <Stack spacing={1} sx={{ mt: 1 }}>
                    <Button
                      variant="contained"
                      sx={publicPresentation ? { minHeight: 46, minWidth: { md: 144 }, bgcolor: '#5222B8', borderRadius: '9px', fontWeight: 800, textTransform: 'none', '&:hover': { bgcolor: '#40168F' } } : undefined}
                      disabled={shiftActionsDisabled || (!shift.singleUserOnly && hasRejectedSlots) || (isOffersMode && (!hasPendingOffer || hasAwaitingPaymentSlots))}
                      onClick={() => handleApplyAll(shift)}
                    >
                      {isApplied && !isOffersMode ? 'Applied' : (applyLabel ?? 'Apply Now')}
                    </Button>
                    {showCounter && onSubmitCounterOffer && (
                      <Button
                        variant="outlined"
                        onClick={() => openCounterOffer(shift)}
                        startIcon={<ChatBubbleOutlineIcon fontSize="small" />}
                        disabled={shiftActionsDisabled}
                      >
                        Counter Offer
                      </Button>
                    )}
                    {onRejectShift && shift.singleUserOnly && rejectAllowed && (
                      <Button
                        variant="outlined"
                        color="error"
                        onClick={() => handleRejectShift(shift)}
                        disabled={shiftActionsDisabled}
                      >
                        {isRejectedShift ? 'Rejected' : 'Reject Shift'}
                      </Button>
                    )}
                    {onRejectShift && !shift.singleUserOnly && !allowPartial && rejectAllowed && (
                      <Button
                        variant="outlined"
                        color="error"
                        onClick={() => handleRejectShift(shift)}
                        disabled={shiftActionsDisabled}
                      >
                        {isRejectedShift ? 'Rejected' : 'Reject Shift'}
                      </Button>
                    )}
                    {onRejectShift && !shift.singleUserOnly && allowPartial && rejectAllowed && (
                      <Button
                        variant="outlined"
                        color="error"
                        onClick={() => handleRejectShift(shift)}
                        disabled={shiftActionsDisabled || isRejectedShift}
                      >
                        {isRejectedShift ? 'Rejected' : 'Reject Entire Shift'}
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </Box>
            </Stack>

            {publicPresentation && (
              <Button variant='text' onClick={() => toggleExpandedCard(shift.id)} endIcon={isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />} aria-expanded={isExpanded} aria-label={(isExpanded ? 'Hide details for ' : 'Show details for ') + getShiftPharmacyName(shift)} sx={{ alignSelf: 'flex-start', px: 0, color: '#5222B8', textTransform: 'none', fontWeight: 800, minHeight: 44 }}>
                {isExpanded ? 'Hide details' : 'View details and dates'}
              </Button>
            )}
            {isExpanded && (
              <Paper id={publicPresentation ? `shift-detail-${shift.id}` : undefined} variant="outlined" sx={{ p: 2, borderRadius: 2, borderColor: 'grey.100' }}>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, lg: 6 }}>
                    <Stack spacing={1.5}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <CalendarTodayIcon fontSize="small" />
                        <Typography variant="subtitle2">Shift Breakdown</Typography>
                        {isMulti && !allowPartial && (
                          <Chip icon={<LayersIcon />} label="Bundle only" size="small" color="error" />
                        )}
                        {isMulti && allowPartial && !disableSlotActions && (
                          <Chip icon={<CheckCircleOutlineIcon />} label="Select shifts" size="small" color="success" />
                        )}
                        {hasShiftLevelCounter && (
                          <Chip label="Shift offer sent" size="small" variant="outlined" color="info" />
                        )}
                      </Stack>

                      <Stack spacing={1}>
                        {slots.length === 0 ? (
                          <Paper variant="outlined" sx={{ p: 2, borderColor: 'grey.200' }}>
                            <Stack spacing={1}>
                              <Typography variant="body2" fontWeight={600}>
                                {isFullOrPartTime ? getEmploymentLabel(shift) : 'No time slots'}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {isFullOrPartTime ? 'This is a non-slot based role.' : 'Slots will be announced.'}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Rate: {rateSummary.display} {rateSummary.unitLabel === '/hr' ? '/hr' : rateSummary.unitLabel}
                              </Typography>
                            </Stack>
                          </Paper>
                        ) : (
                          slots.map((slot, idx) => {
                            const slotKey = (slot as any).__displayKey ?? slot.id ?? idx;
                            const slotId = slot.id as number;
                            const isSelected = selection.has(slotId);
                            const isSlotApplied = appliedSlotIds.has(slotId);
                            const isSlotRejected = slotRejected(slotId);
                            const offerSlot = counterInfo?.slots?.[slotId];
                            const isCountered = !!offerSlot;
                            const offerStatus = String(offerStatusBySlot[slotId] ?? shiftOfferStatus).toUpperCase();
                            const isPendingOfferSlot = offerStatus === 'PENDING';
                            const isAwaitingPaymentSlot = offerStatus === 'ACCEPTED_AWAITING_PAYMENT';
                            return (
                              <Paper
                                key={slotKey}
                                variant="outlined"
                                sx={{
                                  p: 1.5,
                                  borderColor: isSelected ? 'primary.main' : 'grey.200',
                                  bgcolor: isSelected
                                    ? 'primary.50'
                                    : isSlotRejected
                                      ? 'error.50'
                                      : isSlotApplied
                                        ? 'success.50'
                                        : 'transparent',
                                  overflow: 'hidden',
                                }}
                              >
                                <Stack
                                  direction={{ xs: 'column', sm: 'row' }}
                                  spacing={1}
                                  justifyContent="space-between"
                                  alignItems={{ xs: 'stretch', sm: 'center' }}
                                >
                                  <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                                    {canSelectSlots && (!isOffersMode || isPendingOfferSlot) && (
                                      <Checkbox
                                        checked={isSelected || (!isOffersMode && (isSlotApplied || isCountered))}
                                        onChange={() => toggleSlotSelection(shift.id, slotId)}
                                        disabled={
                                          slotActionsDisabled ||
                                          (!isOffersMode && (isSlotRejected || isSlotApplied || isCountered))
                                        }
                                      />
                                    )}
                                    <Box sx={{ minWidth: 0 }}>
                                      <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>
                                        {formatDateLong(slot.date)}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                                      </Typography>
                                    </Box>
                                  </Stack>
                                  <Stack
                                    direction="row"
                                    spacing={1}
                                    alignItems="center"
                                    justifyContent={{ xs: 'flex-start', sm: 'flex-end' }}
                                    flexWrap="wrap"
                                    useFlexGap
                                    sx={{ rowGap: 0.75, minWidth: 0 }}
                                  >
                                    {isSlotRejected ? (
                                      <Chip label="Rejected" color="error" size="small" />
                                    ) : isAwaitingPaymentSlot ? (
                                      <Chip label="Waiting for owner payment" color="warning" size="small" />
                                    ) : (
                                      <Chip
                                        label={isSlotApplied ? 'Applied' : `$${getSlotRate(slot, shift, userRatePreference)}/hr`}
                                        color={isSlotApplied ? 'info' : 'success'}
                                        size="small"
                                      />
                                    )}
                                    {offerSlot && (
                                      <Chip
                                        label="Offer sent"
                                        size="small"
                                        variant="outlined"
                                      />
                                    )}
                                    {isOffersMode && !shift.singleUserOnly && isPendingOfferSlot && (
                                      <Button
                                        size="small"
                                        variant="contained"
                                        onClick={() => handleApplySlot(shift, slotId)}
                                        disabled={slotActionsDisabled}
                                      >
                                        Confirm
                                      </Button>
                                    )}
                                    {!disableSlotActions && !shift.singleUserOnly && onRejectSlot && rejectAllowed && !isSlotRejected && (
                                      <Button
                                        size="small"
                                        variant="outlined"
                                        color="error"
                                        onClick={() => handleRejectSlot(shift, slotId)}
                                        disabled={slotActionsDisabled}
                                      >
                                        Reject
                                      </Button>
                                    )}
                                  </Stack>
                                </Stack>
                              </Paper>
                            );
                          })
                        )}
                      </Stack>

                      {hasActiveSlotSelection && (
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          {showCounter && onSubmitCounterOffer && (
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<ChatBubbleOutlineIcon fontSize="small" />}
                              onClick={() => openCounterOffer(shift, selection)}
                              disabled={slotActionsDisabled}
                            >
                              {isOffersMode ? 'Counter Selected' : 'Send counter offer for selected'}
                            </Button>
                          )}
                          <Button
                            variant="contained"
                            size="small"
                            disabled={slotActionsDisabled || isRejectedShift}
                            onClick={async () => {
                              const selectedIds = Array.from(selection);
                              await handleApplySlots(shift, selectedIds);
                              clearSelection(shift.id);
                            }}
                          >
                            {isOffersMode ? `Confirm ${selection.size} Selected` : 'Apply for selected slots'}
                          </Button>
                          {(onRejectSlots || onRejectSlot) && rejectAllowed && (
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              disabled={slotActionsDisabled || isRejectedShift}
                              onClick={() => handleRejectSlots(shift, Array.from(selection))}
                            >
                              {isOffersMode ? `Reject ${selection.size} Selected` : 'Reject selected'}
                            </Button>
                          )}
                        </Stack>
                      )}
                    </Stack>
                  </Grid>

                  <Grid size={{ xs: 12, lg: 6 }}>
                    <Stack spacing={1.5}>
                      <Typography variant="subtitle2">About the Role</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {shift.description || 'No description provided.'}
                      </Typography>
                      {(shift.mustHave && shift.mustHave.length > 0) && (
                        <Stack spacing={0.5}>
                          <Typography variant="caption" color="text.secondary">Must have</Typography>
                          <Stack direction="row" spacing={0.5} flexWrap="wrap">
                            {shift.mustHave.map((item, idx) => (
                              <Chip key={idx} label={item} size="small" />
                            ))}
                          </Stack>
                        </Stack>
                      )}
                      {(shift.niceToHave && shift.niceToHave.length > 0) && (
                        <Stack spacing={0.5}>
                          <Typography variant="caption" color="text.secondary">Nice to have</Typography>
                          <Stack direction="row" spacing={0.5} flexWrap="wrap">
                            {shift.niceToHave.map((item, idx) => (
                              <Chip key={idx} label={item} size="small" variant="outlined" />
                            ))}
                          </Stack>
                        </Stack>
                      )}
                      {(shift.workloadTags && shift.workloadTags.length > 0) && (
                        <Stack spacing={0.5}>
                          <Typography variant="caption" color="text.secondary">Workload</Typography>
                          <Stack direction="row" spacing={0.5} flexWrap="wrap">
                            {shift.workloadTags.map((tag, idx) => (
                              <Chip key={idx} label={tag} size="small" color="default" />
                            ))}
                          </Stack>
                        </Stack>
                      )}
                      {shift.createdAt && (
                        <Typography variant="caption" color="text.secondary">
                          Posted {dayjs(shift.createdAt).format('D MMM YYYY')}
                        </Typography>
                      )}
                      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, borderColor: 'grey.200' }}>
                        <Typography variant="caption" color="text.secondary">Full Address</Typography>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <PlaceIcon fontSize="small" color="action" />
                          <Typography variant="body2">{getShiftAddress(shift) || 'N/A'}</Typography>
                        </Stack>
                      </Paper>
                    </Stack>
                  </Grid>
                </Grid>
              </Paper>
            )}

            {!publicPresentation && <Button
              onClick={() => toggleExpandedCard(shift.id)}
              endIcon={isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              sx={{ textTransform: 'none' }}
            >
              {isExpanded ? 'Hide Details' : 'Read More & Shift Breakdown'}
            </Button>}
          </Stack>
        </Paper>
      );
    })}
  </Stack>
);

export default ShiftList;
