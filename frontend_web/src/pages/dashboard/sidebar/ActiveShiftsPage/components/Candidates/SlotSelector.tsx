import React from 'react';
import { Stack, Box, Button, Typography } from '@mui/material';
import { Groups } from '@mui/icons-material';

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

export const SlotSelector: React.FC<SlotSelectorProps> = ({
    slots,
    selectedSlotId,
    onSelectSlot,
    slotHasUpdates,
    slotCandidateCounts,
    slotStatusCounts,
}) => {
    const formatTime = (time?: string | null) => (time ? time.slice(0, 5) : '');

    const formatParts = (slot: any) => {
        const date = new Date(slot.date);
        return {
            day: date.toLocaleDateString(undefined, { weekday: 'short' }),
            date: date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
            time: `${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}`,
        };
    };
    const getSlotCandidateCount = (slot: any) => {
        const computedCount = slot?.id != null ? slotCandidateCounts?.[slot.id] : undefined;
        return computedCount ?? slot?.candidateCount ?? slot?.candidate_count ?? slot?.assignedCount ?? slot?.assigned_count ?? 0;
    };

    return (
        <Box sx={{ mb: 2.5 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                <Box>
                    <Typography sx={{ fontWeight: 900, color: '#111827' }}>Upcoming Shift Dates</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                        {slots.length} upcoming shifts
                    </Typography>
                </Box>
            </Stack>
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: { xs: 1, sm: 1.5 },
                    width: '100%',
                    px: 0,
                }}
            >
                {slots.map((slot) => (
                    <Button
                        key={slot.id}
                        variant="outlined"
                        onClick={() => onSelectSlot(slot.id!)}
                        sx={{
                            position: 'relative',
                            justifyContent: 'flex-start',
                            alignItems: 'stretch',
                            minHeight: { xs: 108, sm: 118 },
                            minWidth: 0,
                            p: { xs: 0.9, sm: 1.5 },
                            borderRadius: 2,
                            borderColor: slot.id === selectedSlotId ? '#8B5CF6' : '#E5E7EB',
                            bgcolor: slot.id === selectedSlotId ? '#FAF5FF' : '#fff',
                            color: '#111827',
                            boxShadow: slot.id === selectedSlotId ? '0 10px 24px rgba(124,58,237,.12)' : '0 8px 20px rgba(15,23,42,.04)',
                            textTransform: 'none',
                        }}
                    >
                        <Box component="span" sx={{ display: 'flex', width: '100%', flexDirection: 'column', alignItems: 'flex-start' }}>
                            {(() => {
                                const parts = formatParts(slot);
                                return (
                                    <>
                                        <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 700 }}>{parts.day}</Typography>
                                        <Typography sx={{ color: '#111827', fontWeight: 900, lineHeight: 1.15, fontSize: { xs: 13, sm: 16 } }}>{parts.date}</Typography>
                                        <Box component="span" sx={{ mt: 1, px: { xs: 0.6, sm: 1 }, py: 0.25, borderRadius: 999, bgcolor: '#F3E8FF', color: '#7C3AED', fontSize: { xs: 9.5, sm: 12 }, fontWeight: 800, maxWidth: '100%', whiteSpace: 'normal', lineHeight: 1.2 }}>
                                            {parts.time}
                                        </Box>
                                        <Typography variant="caption" sx={{ mt: 0.75, color: '#475569', fontWeight: 700 }}>
                                            <Box component="span" sx={{ display: 'inline-block', width: 7, height: 7, mr: 0.75, borderRadius: '50%', bgcolor: '#16A34A' }} />
                                            Open
                                        </Typography>
                                        <Typography variant="caption" sx={{ position: 'absolute', right: 12, bottom: 10, color: '#64748B', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 0.4 }}>
                                            <Groups sx={{ fontSize: 14 }} />
                                            {getSlotCandidateCount(slot)}
                                        </Typography>
                                        {slot.id != null && (
                                            <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.8, pr: 5 }}>
                                                {[
                                                    ['Int', slotStatusCounts?.[slot.id]?.interested ?? 0, '#047857'],
                                                    ['Asg', slotStatusCounts?.[slot.id]?.assigned ?? 0, '#0284C7'],
                                                    ['Rej', slotStatusCounts?.[slot.id]?.rejected ?? 0, '#B91C1C'],
                                                    ['No', slotStatusCounts?.[slot.id]?.noResponse ?? 0, '#B45309'],
                                                ].map(([label, value, bg]) => (
                                                    <Box key={String(label)} component="span" sx={{ px: 0.65, py: 0.2, borderRadius: 999, bgcolor: bg, color: '#fff', fontSize: { xs: 9, sm: 10 }, fontWeight: 900, lineHeight: 1.35 }}>
                                                        {label} {value}
                                                    </Box>
                                                ))}
                                            </Box>
                                        )}
                                    </>
                                );
                            })()}
                            {Boolean(slotHasUpdates?.[slot.id]) && (
                                <Box
                                    component="span"
                                    sx={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        bgcolor: 'error.main',
                                        position: 'absolute',
                                        top: 10,
                                        right: 10,
                                        flexShrink: 0,
                                    }}
                                />
                            )}
                        </Box>
                    </Button>
                ))}
            </Box>
        </Box>
    );
};
