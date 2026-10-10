import React from 'react';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { Clock, Users } from 'lucide-react';
import { Hint, InfoHint, NewActivityBadge, toneColors, type ShiftTone } from '../../../../shiftCenter/ShiftCentreParts';

type SlotStatusCounts = {
    interested: number;
    assigned: number;
    rejected: number;
    noResponse: number;
};

interface SlotSelectorProps {
    slots: any[];
    selectedSlotId: number | null;
    onSelectSlot: (slotId: number) => void;
    slotHasUpdates?: Record<number, boolean>;
    slotCandidateCounts?: Record<number, number>;
    slotStatusCounts?: Record<number, SlotStatusCounts>;
}

const STATUS_PARTS: Array<{ key: keyof SlotStatusCounts; label: string; tone: ShiftTone; title: string; body: string }> = [
    { key: 'interested', label: 'interested', tone: 'cyan', title: 'Interested', body: 'Said yes or sent an offer for this date. Waiting for you to review them.' },
    { key: 'assigned', label: 'assigned', tone: 'green', title: 'Assigned', body: 'Booked for this date.' },
    { key: 'noResponse', label: 'no reply', tone: 'amber', title: 'No reply yet', body: 'Notified about this date but have not answered.' },
    { key: 'rejected', label: 'rejected', tone: 'red', title: 'Rejected', body: 'Candidates you turned down for this date.' },
];

const formatTime = (time?: string | null) => (time ? time.slice(0, 5) : '');

const formatParts = (slot: any) => {
    const date = new Date(slot.date);
    return {
        day: date.toLocaleDateString('en-AU', { weekday: 'short' }),
        date: date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
        time: `${formatTime(slot.startTime ?? slot.start_time)} – ${formatTime(slot.endTime ?? slot.end_time)}`,
    };
};

export const SlotSelector: React.FC<SlotSelectorProps> = ({
    slots,
    selectedSlotId,
    onSelectSlot,
    slotHasUpdates,
    slotCandidateCounts,
    slotStatusCounts,
}) => {
    const getSlotCandidateCount = (slot: any) => {
        const computedCount = slot?.id != null ? slotCandidateCounts?.[slot.id] : undefined;
        return computedCount ?? slot?.candidateCount ?? slot?.candidate_count ?? slot?.assignedCount ?? slot?.assigned_count ?? 0;
    };
    const updatedCount = slots.filter((slot) => Boolean(slotHasUpdates?.[slot.id])).length;

    return (
        <Box component="section" aria-label="Shift dates">
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ mb: 1.5 }}>
                <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                        <Typography component="h3" sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 17, color: 'var(--ct-text-primary)' }}>
                            Shift dates
                        </Typography>
                        <InfoHint
                            title="One shift, several dates"
                            body="Each date (slot) is filled separately. Select a date to see who responded for it and to assign someone."
                        />
                    </Stack>
                    <Typography sx={{ fontSize: 13, color: 'var(--ct-text-secondary)' }}>
                        {slots.length} {slots.length === 1 ? 'date' : 'dates'} · select one to see its candidates
                    </Typography>
                </Box>
                {updatedCount > 0 && (
                    <NewActivityBadge label={`New activity on ${updatedCount} ${updatedCount === 1 ? 'date' : 'dates'}`} />
                )}
            </Stack>
            <Box
                role="group"
                aria-label="Choose a shift date"
                sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: 1.25,
                }}
            >
                {slots.map((slot) => {
                    const parts = formatParts(slot);
                    const selected = slot.id === selectedSlotId;
                    const counts = slot.id != null ? slotStatusCounts?.[slot.id] : undefined;
                    const visibleCounts = STATUS_PARTS.filter((part) => (counts?.[part.key] ?? 0) > 0);
                    const people = getSlotCandidateCount(slot);
                    const booked = (counts?.assigned ?? 0) > 0;
                    const hasUpdate = Boolean(slotHasUpdates?.[slot.id]);
                    return (
                        <ButtonBase
                            key={slot.id}
                            onClick={() => onSelectSlot(slot.id!)}
                            aria-pressed={selected}
                            aria-label={`${parts.day} ${parts.date}, ${parts.time}. ${visibleCounts.map((part) => `${counts?.[part.key]} ${part.label}`).join(', ') || 'No responses yet'}.${hasUpdate ? ' New activity since you last opened it.' : ''}`}
                            sx={{
                                display: 'block',
                                textAlign: 'left',
                                p: 1.5,
                                borderRadius: '14px',
                                border: '1px solid',
                                borderColor: selected ? 'var(--ct-accent-strong)' : 'var(--ct-border-color)',
                                boxShadow: selected ? 'inset 0 0 0 1px var(--ct-accent-strong)' : 'none',
                                bgcolor: selected ? 'var(--ct-tone-violet-bg)' : 'var(--ct-surface-bg)',
                                transition: 'border-color .15s, background-color .15s',
                                '&:hover': { borderColor: 'var(--ct-accent-strong)' },
                                '&.Mui-focusVisible': { outline: '2px solid var(--ct-accent-strong)', outlineOffset: 2 },
                            }}
                        >
                            <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                                <Box>
                                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--ct-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        {parts.day}
                                    </Typography>
                                    <Typography sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 18, color: 'var(--ct-text-primary)', lineHeight: 1.2 }}>
                                        {parts.date}
                                    </Typography>
                                </Box>
                                {hasUpdate ? (
                                    <NewActivityBadge label="New" focusable={false} />
                                ) : (
                                    <Box
                                        component="span"
                                        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 12, fontWeight: 600, color: booked ? 'var(--ct-status-green-fg)' : 'var(--ct-text-secondary)' }}
                                    >
                                        <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: booked ? 'var(--ct-status-green-fg)' : '#2E9E5B' }} />
                                        {booked ? 'Assigned' : 'Open'}
                                    </Box>
                                )}
                            </Stack>
                            <Box
                                component="span"
                                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 1, px: 1, py: 0.35, borderRadius: '999px', bgcolor: selected ? 'var(--ct-surface-bg)' : 'var(--ct-tone-violet-bg)', color: 'var(--ct-tone-violet-fg)', fontSize: 12, fontWeight: 600, '& svg': { width: 13, height: 13 } }}
                            >
                                <Clock />
                                {parts.time}
                            </Box>
                            <Stack direction="row" alignItems="flex-end" justifyContent="space-between" spacing={1} sx={{ mt: 1.25 }}>
                                <Stack direction="row" useFlexGap flexWrap="wrap" sx={{ columnGap: 1.25, rowGap: 0.25, minWidth: 0 }}>
                                    {visibleCounts.length > 0 ? visibleCounts.map((part) => (
                                        <Hint key={part.key} title={`${counts?.[part.key]} ${part.title.toLowerCase()}`} body={part.body}>
                                            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 12, color: 'var(--ct-text-secondary)', cursor: 'help' }}>
                                                <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: toneColors(part.tone).fg }} />
                                                <Box component="span" sx={{ fontWeight: 600, color: 'var(--ct-text-primary)' }}>{counts?.[part.key]}</Box>
                                                {part.label}
                                            </Box>
                                        </Hint>
                                    )) : (
                                        <Typography sx={{ fontSize: 12, color: 'var(--ct-text-muted)' }}>No responses yet</Typography>
                                    )}
                                </Stack>
                                <Hint title={`${people} ${people === 1 ? 'person' : 'people'} for this date`} body="Everyone who responded or was invited for this date, across all audiences.">
                                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, fontSize: 12, fontWeight: 600, color: 'var(--ct-text-secondary)', flexShrink: 0, '& svg': { width: 14, height: 14 } }}>
                                        <Users />
                                        {people}
                                    </Box>
                                </Hint>
                            </Stack>
                        </ButtonBase>
                    );
                })}
            </Box>
        </Box>
    );
};
