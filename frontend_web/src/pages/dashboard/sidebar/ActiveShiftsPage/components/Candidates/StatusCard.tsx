import React from 'react';
import {
    Card,
    CardHeader,
    CardContent,
    Avatar,
    Box,
    Typography,
    Chip,
    Stack,
    Paper,
    Button,
    CircularProgress,
} from '@mui/material';
import { Cancel, CheckCircle, Description, Favorite, HourglassEmpty, Person, Star } from '@mui/icons-material';
import { ShiftMemberStatus } from '@chemisttasker/shared-core';

interface StatusCardProps {
    title: string;
    members: ShiftMemberStatus[];
    icon: React.ReactElement;
    color: 'success' | 'error' | 'warning' | 'info';
    shiftId: number;
    onReviewCandidate: (member: ShiftMemberStatus, shiftId: number, offer: any | null, slotId: number | null) => void;
    getOfferForMember?: (member: ShiftMemberStatus) => { offer: any | null; slotId: number | null };
    reviewLoadingId?: number | null;
    onBuzzWorker?: (offerId: number) => void;
    buzzLoadingOfferId?: number | null;
}

const StatusIllustration = ({ title, color }: { title: string; color: StatusCardProps['color'] }) => {
    const isInterested = title === 'Interested';
    const isAssigned = title === 'Assigned';
    const isRejected = title === 'Rejected';
    const isHourglass = title === 'No Response';

    return (
        <Box sx={{ position: 'relative', width: 92, height: 66, flexShrink: 0 }}>
            <Box
                sx={{
                    position: 'absolute',
                    inset: 4,
                    borderRadius: '50%',
                    background: (theme) => `radial-gradient(circle, ${theme.palette[color].main}22 0%, transparent 68%)`,
                    filter: 'blur(1px)',
                }}
            />

            {isInterested && (
                <>
                    {[18, 48, 78].map((left, idx) => (
                        <Avatar
                            key={left}
                            sx={{
                                position: 'absolute',
                                left: left - 10,
                                top: idx === 1 ? 4 : 20,
                                width: idx === 1 ? 30 : 25,
                                height: idx === 1 ? 30 : 25,
                                bgcolor: '#EEF2FF',
                                color: '#64748B',
                                boxShadow: '0 10px 18px rgba(99,102,241,.18)',
                            }}
                        >
                            <Person fontSize="small" />
                        </Avatar>
                    ))}
                    <Avatar
                        sx={{
                            position: 'absolute',
                            left: 32,
                            bottom: 2,
                            width: 38,
                            height: 38,
                            bgcolor: '#EEF2FF',
                            color: '#7C3AED',
                            boxShadow: '0 12px 24px rgba(124,58,237,.22)',
                        }}
                    >
                        <Favorite />
                    </Avatar>
                </>
            )}

            {(isAssigned || isRejected) && (
                <>
                    <Box
                        sx={{
                            position: 'absolute',
                            left: 20,
                            top: 2,
                            width: 42,
                            height: 56,
                            borderRadius: 2,
                            bgcolor: '#fff',
                            color: isAssigned ? '#2563EB' : '#64748B',
                            display: 'grid',
                            placeItems: 'center',
                            boxShadow: '0 12px 24px rgba(15,23,42,.14)',
                        }}
                    >
                        <Description sx={{ fontSize: 30 }} />
                    </Box>
                    <Avatar
                        sx={{
                            position: 'absolute',
                            right: 12,
                            bottom: 2,
                            width: 32,
                            height: 32,
                            bgcolor: isAssigned ? '#0EA5E9' : '#EF4444',
                            color: '#fff',
                            boxShadow: '0 10px 20px rgba(15,23,42,.18)',
                        }}
                    >
                        {isAssigned ? <CheckCircle /> : <Cancel />}
                    </Avatar>
                </>
            )}

            {isHourglass && (
                <Avatar
                    sx={{
                        position: 'absolute',
                        left: 28,
                        top: 2,
                        width: 48,
                        height: 58,
                        bgcolor: '#fff',
                        color: '#F59E0B',
                        borderRadius: 4,
                        boxShadow: '0 14px 26px rgba(245,158,11,.20)',
                    }}
                >
                    <HourglassEmpty sx={{ fontSize: 34 }} />
                </Avatar>
            )}
        </Box>
    );
};

export const StatusCard: React.FC<StatusCardProps> = ({
    title,
    members,
    icon,
    color,
    shiftId,
    onReviewCandidate,
    getOfferForMember,
    reviewLoadingId,
    onBuzzWorker,
    buzzLoadingOfferId,
}) => {
    return (
        <Card
            sx={{
                background: (theme) => theme.palette[color].light,
                boxShadow: '0 12px 28px rgba(15,23,42,.06)',
                border: (theme) => `1px solid ${theme.palette[color].main}33`,
                borderRadius: { xs: 2, sm: 3 },
                height: '100%',
                minHeight: { xs: 168, sm: 190 },
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            <CardHeader
                sx={{
                    pb: 0,
                    pt: { xs: 1, sm: 1.5 },
                    px: { xs: 1, sm: 2 },
                    '& .MuiCardHeader-content': { minWidth: 0 },
                    '& .MuiCardHeader-action': { alignSelf: 'flex-start', mt: 0 },
                    '& .MuiCardHeader-avatar': { mr: { xs: 0.75, sm: 2 } },
                }}
                avatar={
                    <Avatar
                        sx={{
                            width: { xs: 32, sm: 40 },
                            height: { xs: 32, sm: 40 },
                            bgcolor: '#fff',
                            color: (theme) => theme.palette[color].dark,
                            boxShadow: '0 10px 20px rgba(15,23,42,.10)',
                            '& svg': { fontSize: { xs: 19, sm: 24 } },
                        }}
                    >
                        {icon}
                    </Avatar>
                }
                title={
                    <Typography
                        sx={{
                            fontSize: { xs: 14, sm: 18 },
                            fontWeight: 900,
                            color: (theme) => theme.palette[color].dark,
                            lineHeight: 1.12,
                            overflowWrap: 'anywhere',
                        }}
                    >
                        {title}
                    </Typography>
                }
                action={
                    <Chip
                        label={members.length}
                        size="small"
                        sx={{
                            backgroundColor: (theme) => theme.palette[color].dark,
                            color: 'white',
                            fontWeight: 'bold',
                            height: { xs: 22, sm: 24 },
                            minWidth: { xs: 24, sm: 28 },
                            '& .MuiChip-label': { px: { xs: 0.75, sm: 1 } },
                        }}
                    />
                }
            />
            <CardContent sx={{ pt: { xs: 0.75, sm: 1.25 }, pb: { xs: '12px !important', sm: '16px !important' }, px: { xs: 1, sm: 2 }, flex: 1, minHeight: 0 }}>
                <Stack spacing={{ xs: 1, sm: 1.5 }} sx={{ height: '100%', minHeight: 0, alignItems: 'center', textAlign: 'center' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'center', minHeight: { xs: 52, sm: 70 }, transform: { xs: 'scale(.78)', sm: 'none' }, transformOrigin: 'center' }}>
                        <StatusIllustration title={title} color={color} />
                    </Box>
                    {members.length > 0 ? (
                        <Stack
                            spacing={1}
                            sx={{
                                flex: 1,
                                width: '100%',
                                minWidth: 0,
                                minHeight: 0,
                                maxHeight: 245,
                                overflowY: 'auto',
                                pr: 0.25,
                                scrollbarWidth: 'none',
                                msOverflowStyle: 'none',
                                '&::-webkit-scrollbar': {
                                    display: 'none',
                                    width: 0,
                                    height: 0,
                                },
                                '&::-webkit-scrollbar-button': {
                                    display: 'none',
                                    width: 0,
                                    height: 0,
                                },
                            }}
                        >
                            {members.map((member) => {
                                const memberAny = member as any;
                                const ratingValue = memberAny.averageRating ?? memberAny.rating ?? null;
                                const match = getOfferForMember
                                    ? getOfferForMember(member)
                                    : { offer: null, slotId: null };
                                const hasOffer = Boolean(match.offer);
                                const pendingConfirmation = Boolean(
                                    memberAny.pendingConfirmation ?? memberAny.pending_confirmation
                                );
                                const awaitingPayment = Boolean(
                                    memberAny.awaitingPayment ?? memberAny.awaiting_payment
                                );
                                const isCounterOffer = hasOffer && Boolean(
                                    match.offer?.counterOffer ??
                                    match.offer?.counter_offer ??
                                    match.offer?.slots
                                );
                                const offerStatus = String(match.offer?.status ?? '').toUpperCase();
                                const isPendingConfirmation = !awaitingPayment && !isCounterOffer && (
                                    pendingConfirmation || (hasOffer && offerStatus === 'PENDING')
                                );
                                const pendingOfferId = memberAny.pendingOfferId ?? memberAny.pending_offer_id ?? match.offer?.id ?? null;
                                const sourceVisibility = memberAny.sourceVisibility ?? memberAny.visibilityLevel ?? memberAny.visibility_level;
                                const organizationName = memberAny.organizationName ?? memberAny.organization_name;
                                const showOrganizationLabel = sourceVisibility === 'ORG_CHAIN' && Boolean(organizationName);
                                return (
                                    <Paper
                                        key={memberAny.userId}
                                        variant="outlined"
                                        sx={{
                                            p: 1.25,
                                            borderRadius: 2,
                                            bgcolor: '#fff',
                                            width: '100%',
                                            boxSizing: 'border-box',
                                            minWidth: 0,
                                            boxShadow: '0 8px 18px rgba(15,23,42,.04)',
                                        }}
                                    >
                                        <Stack
                                            direction="column"
                                            spacing={0.75}
                                            alignItems="stretch"
                                            justifyContent="space-between"
                                            sx={{ width: '100%', minWidth: 0 }}
                                        >
                                            <Stack
                                                direction="column"
                                                spacing={0.5}
                                                sx={{ minWidth: 0, width: '100%' }}
                                            >
                                                <Stack sx={{ minWidth: 0, maxWidth: '100%', textAlign: 'left' }}>
                                                    <Typography
                                                        title={memberAny.name || `${memberAny.first_name} ${memberAny.last_name}`}
                                                        sx={{
                                                            fontWeight: 800,
                                                            lineHeight: 1.12,
                                                            fontSize: { xs: 11.5, sm: 12.5 },
                                                            maxWidth: '100%',
                                                            overflow: 'hidden',
                                                            display: '-webkit-box',
                                                            WebkitBoxOrient: 'vertical',
                                                            WebkitLineClamp: 2,
                                                            whiteSpace: 'normal',
                                                            overflowWrap: 'anywhere',
                                                        }}
                                                    >
                                                        {memberAny.name || `${memberAny.first_name} ${memberAny.last_name}`}
                                                    </Typography>
                                                    {memberAny.employmentType && (
                                                        <Typography
                                                            variant="caption"
                                                            color="text.secondary"
                                                            noWrap
                                                            sx={{
                                                                display: 'block',
                                                                fontWeight: 600,
                                                                fontSize: 10.5,
                                                                maxWidth: '100%',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                            }}
                                                        >
                                                            {memberAny.employmentType}
                                                        </Typography>
                                                    )}
                                                </Stack>
                                                {ratingValue ? (
                                                    <Chip
                                                        icon={<Star sx={{ fontSize: 14 }} />}
                                                        label={ratingValue.toFixed(1)}
                                                        size="small"
                                                        color="warning"
                                                        variant="outlined"
                                                        sx={{ flexShrink: 0 }}
                                                    />
                                                ) : null}
                                            </Stack>
                                            <Stack
                                                spacing={0.5}
                                                sx={{
                                                    display: 'grid',
                                                    gridTemplateColumns: title === 'Interested' && isPendingConfirmation
                                                        ? 'minmax(0, 1fr) auto auto'
                                                        : 'auto auto auto',
                                                    gap: 0.5,
                                                    alignItems: 'center',
                                                    justifyContent: 'flex-start',
                                                    flexShrink: 0,
                                                    minWidth: 0,
                                                    width: '100%',
                                                }}
                                            >
                                                {title === 'Interested' && isPendingConfirmation && (
                                                    <Chip
                                                        label="Pending"
                                                        size="small"
                                                        color="warning"
                                                        sx={{
                                                            maxWidth: '100%',
                                                            height: 22,
                                                            '& .MuiChip-label': {
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                                fontSize: 9.5,
                                                                fontWeight: 800,
                                                                px: 0.75,
                                                            },
                                                        }}
                                                    />
                                                )}
                                                {title === 'Interested' && awaitingPayment && (
                                                    <Chip
                                                        label="Awaiting payment"
                                                        size="small"
                                                        color="error"
                                                        sx={{
                                                            maxWidth: '100%',
                                                            height: 22,
                                                            '& .MuiChip-label': {
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                fontSize: 9.5,
                                                                fontWeight: 800,
                                                                px: 0.75,
                                                            },
                                                        }}
                                                    />
                                                )}
                                                {title === 'Interested' && isCounterOffer && !isPendingConfirmation && (
                                                    <Chip
                                                        label="Counter offer"
                                                        size="small"
                                                        color="info"
                                                        sx={{
                                                            maxWidth: 120,
                                                            height: 22,
                                                            '& .MuiChip-label': {
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                fontSize: 9.5,
                                                                fontWeight: 800,
                                                                px: 0.75,
                                                            },
                                                        }}
                                                    />
                                                )}
                                                {showOrganizationLabel && (
                                                    <Chip
                                                        label={organizationName}
                                                        size="small"
                                                        variant="outlined"
                                                        sx={{
                                                            maxWidth: 130,
                                                            bgcolor: '#fff',
                                                            height: 22,
                                                            '& .MuiChip-label': {
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                fontSize: 9.5,
                                                                px: 0.75,
                                                            },
                                                        }}
                                                    />
                                                )}
                                                {title === 'Interested' && (
                                                    <Button
                                                        size="small"
                                                        variant="contained"
                                                        color="secondary"
                                                        sx={{
                                                            minWidth: 52,
                                                            minHeight: 26,
                                                            px: 0.7,
                                                            borderRadius: 1.5,
                                                            fontWeight: 800,
                                                            whiteSpace: 'nowrap',
                                                            lineHeight: 1.2,
                                                            flexShrink: 0,
                                                            fontSize: 9.5,
                                                            '& .MuiButton-startIcon': { flexShrink: 0 },
                                                        }}
                                                        onClick={() => {
                                                            const reviewMember = isPendingConfirmation && match.offer?.id != null
                                                                ? {
                                                                    ...memberAny,
                                                                    pendingConfirmation: true,
                                                                    pendingOfferId: match.offer.id,
                                                                    pendingConfirmationCounterOffer: match.offer,
                                                                }
                                                                : member;
                                                            onReviewCandidate(
                                                                reviewMember,
                                                                shiftId,
                                                                isPendingConfirmation || awaitingPayment ? null : match.offer,
                                                                match.slotId
                                                            );
                                                        }}
                                                        disabled={reviewLoadingId === memberAny.userId}
                                                        startIcon={
                                                            reviewLoadingId === memberAny.userId ? (
                                                                <CircularProgress size={16} color="inherit" />
                                                            ) : undefined
                                                        }
                                                    >
                                                        {isPendingConfirmation || awaitingPayment ? 'View' : hasOffer ? 'Review' : 'Review'}
                                                    </Button>
                                                )}
                                                {title === 'Interested' && isPendingConfirmation && pendingOfferId != null && onBuzzWorker && (
                                                    <Button
                                                        size="small"
                                                        variant="contained"
                                                        color="warning"
                                                        sx={{
                                                            minWidth: 50,
                                                            minHeight: 26,
                                                            px: 0.7,
                                                            borderRadius: 1.5,
                                                            fontWeight: 800,
                                                            whiteSpace: 'nowrap',
                                                            lineHeight: 1.2,
                                                            flexShrink: 0,
                                                            fontSize: 9.5,
                                                            bgcolor: '#F9F295',
                                                            backgroundImage: 'linear-gradient(90deg, #F9F295 0%, #E0AA3E 55%, #B88A44 100%)',
                                                            color: '#111827',
                                                            boxShadow: '0 8px 16px rgba(184,138,68,.24)',
                                                            '&:hover': {
                                                                bgcolor: '#E0AA3E',
                                                                backgroundImage: 'linear-gradient(90deg, #FAF398 0%, #D2AC47 55%, #926F34 100%)',
                                                            },
                                                        }}
                                                        onClick={() => onBuzzWorker(Number(pendingOfferId))}
                                                        disabled={buzzLoadingOfferId === Number(pendingOfferId)}
                                                        startIcon={
                                                            buzzLoadingOfferId === Number(pendingOfferId) ? (
                                                                <CircularProgress size={16} color="inherit" />
                                                            ) : undefined
                                                        }
                                                    >
                                                        Buzz
                                                    </Button>
                                                )}
                                            </Stack>
                                        </Stack>
                                    </Paper>
                                );
                            })}
                        </Stack>
                    ) : (
                        <Box sx={{ maxWidth: { xs: 130, sm: 220 }, mx: 'auto', textAlign: 'center' }}>
                            <Typography color="text.secondary" sx={{ fontWeight: 800, lineHeight: 1.25, fontSize: { xs: 13, sm: 16 } }}>
                                No candidates yet.
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.35, fontSize: { xs: 10.5, sm: 12 } }}>
                                {title === 'Interested'
                                    ? "When candidates show interest, they'll appear here."
                                    : title === 'Assigned'
                                        ? 'Assigned candidates will appear here.'
                                        : title === 'Rejected'
                                            ? 'Candidates you reject will appear here.'
                                            : 'No responses will appear here.'}
                            </Typography>
                        </Box>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
};
