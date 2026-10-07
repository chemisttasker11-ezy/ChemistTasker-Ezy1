import type { ReactElement } from 'react';
import { Box, Button, Chip, CircularProgress, Divider, Stack, Typography, alpha } from '@mui/material';
import { Star } from '@mui/icons-material';
import type { ShiftMemberStatus } from '@chemisttasker/shared-core';

interface StatusCardProps {
  title: string;
  members: ShiftMemberStatus[];
  icon: ReactElement;
  color: 'success' | 'error' | 'warning' | 'info';
  shiftId: number;
  onReviewCandidate: (member: ShiftMemberStatus, shiftId: number, offer: any | null, slotId: number | null) => void;
  getOfferForMember?: (member: ShiftMemberStatus) => { offer: any | null; slotId: number | null };
  reviewLoadingId?: number | null;
  onBuzzWorker?: (offerId: number) => void;
  buzzLoadingOfferId?: number | null;
}

export function StatusCard({ title, members, icon, color, shiftId, onReviewCandidate, getOfferForMember, reviewLoadingId, onBuzzWorker, buzzLoadingOfferId }: StatusCardProps) {
  return <Box component="section" aria-label={`${title} candidates`} sx={{ minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
    <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 1.5, bgcolor: (theme) => alpha(theme.palette[color].main, 0.08) }}>
      <Box sx={{ color: `${color}.main`, display: 'flex' }}>{icon}</Box>
      <Typography component="h4" variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>{title}</Typography>
      <Chip size="small" label={members.length} aria-label={`${members.length} ${title.toLowerCase()}`} />
    </Stack>
    <Stack divider={<Divider />} sx={{ px: 1.5 }}>
      {members.map((member, index) => {
        const item = member as any;
        const match = getOfferForMember?.(member) ?? { offer: null, slotId: null };
        const awaitingPayment = Boolean(item.awaitingPayment ?? item.awaiting_payment);
        const isCounterOffer = Boolean(match.offer && (match.offer.counterOffer ?? match.offer.counter_offer ?? match.offer.slots));
        const pendingConfirmation = !awaitingPayment && !isCounterOffer && Boolean(
          item.pendingConfirmation ?? item.pending_confirmation ?? (String(match.offer?.status).toUpperCase() === 'PENDING'));
        const pendingOfferId = item.pendingOfferId ?? item.pending_offer_id ?? match.offer?.id;
        const rating = Number(item.averageRating ?? item.rating);
        const name = item.displayName || item.name || item.email || 'Candidate';
        return <Box key={`${item.userId ?? item.id ?? index}-${index}`} sx={{ py: 1.5, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>{name}</Typography>
          {item.employmentType && <Typography variant="body2" color="text.secondary">{String(item.employmentType).replace(/_/g, ' ')}</Typography>}
          <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.75} sx={{ mt: 1 }}>
            {rating > 0 && <Chip icon={<Star />} label={rating.toFixed(1)} size="small" variant="outlined" aria-label={`Rating ${rating.toFixed(1)} out of 5`} />}
            {pendingConfirmation && <Chip label="Awaiting confirmation" size="small" color="warning" variant="outlined" sx={{ height: 'auto', minHeight: 28, '& .MuiChip-label': { whiteSpace: 'normal' } }} />}
            {awaitingPayment && <Chip label="Payment required" size="small" color="warning" variant="outlined" />}
            {isCounterOffer && !pendingConfirmation && !awaitingPayment && <Chip label="Counter offer" size="small" color="info" variant="outlined" />}
            {item.sourceVisibility === 'ORG_CHAIN' && item.organizationName && <Typography variant="caption" color="text.secondary">{item.organizationName}</Typography>}
          </Stack>
          {title === 'Interested' && <Stack direction="row" useFlexGap flexWrap="wrap" gap={1} sx={{ mt: 1.5 }}>
            <Button variant="outlined" sx={{ minHeight: 44 }} disabled={reviewLoadingId === item.userId}
              startIcon={reviewLoadingId === item.userId ? <CircularProgress size={16} /> : undefined}
              aria-label={`${pendingConfirmation || awaitingPayment ? 'View' : 'Review'} ${name}`}
              onClick={() => onReviewCandidate(pendingConfirmation && match.offer?.id != null
                ? { ...item, pendingConfirmation: true, pendingOfferId: match.offer.id, pendingConfirmationCounterOffer: match.offer } : member,
                shiftId, pendingConfirmation || awaitingPayment ? null : match.offer, match.slotId)}>
              {pendingConfirmation || awaitingPayment ? 'View offer' : 'Review'}
            </Button>
            {pendingConfirmation && pendingOfferId != null && onBuzzWorker && <Button sx={{ minHeight: 44 }}
              disabled={buzzLoadingOfferId === Number(pendingOfferId)} onClick={() => onBuzzWorker(Number(pendingOfferId))}>
              {buzzLoadingOfferId === Number(pendingOfferId) ? 'Sending…' : 'Send reminder'}
            </Button>}
          </Stack>}
        </Box>;
      })}
      {!members.length && <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
        {title === 'Interested' ? 'Interested candidates will appear here.' : title === 'Assigned' ? 'No candidates assigned yet.' : title === 'Rejected' ? 'No rejected candidates.' : 'Everyone in this group has responded, or no candidates are available.'}
      </Typography>}
    </Stack>
  </Box>;
}
