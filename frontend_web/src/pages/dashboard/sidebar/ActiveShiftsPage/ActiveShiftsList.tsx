import React, { useCallback, useMemo, useState, type ComponentProps } from 'react';
import { Box, Pagination, Skeleton, Stack, Typography } from '@mui/material';
import { CalendarDays } from 'lucide-react';
import type { Shift } from '@chemisttasker/shared-core';
import DashboardContentState from '../../../../components/dashboard/DashboardContentState';
import ActiveShiftCard from './ActiveShiftCard';

type CardProps = ComponentProps<typeof ActiveShiftCard>;
export default function ActiveShiftsList({ shifts, shiftsLoading, shiftsError, loadShifts, handlePostShift, isDarkMode, data, state, actions }: {
    shifts: Shift[];
    shiftsLoading: boolean;
    shiftsError: string | null;
    loadShifts: () => Promise<void>;
    handlePostShift: () => void;
    isDarkMode: boolean;
    data: CardProps['data'];
    state: CardProps['state'];
    actions: CardProps['actions'];
}) {
    const itemsPerPage = 6;
    const [page, setPage] = useState(1);
    const isDedicatedShift = useCallback((shift: Shift) => {
        const shiftAny = shift as any;
        return Boolean(shiftAny.dedicatedUser ?? shiftAny.dedicated_user);
    }, []);

    // Load counter offers for summary counts and expanded slot activity.
    const orderedShifts = useMemo(() => {
        const list = [...shifts];
        list.sort((a, b) => {
            const aDedicated = isDedicatedShift(a) ? 1 : 0;
            const bDedicated = isDedicatedShift(b) ? 1 : 0;
            return bDedicated - aDedicated;
        });
        return list;
    }, [shifts, isDedicatedShift]);
    const pageCount = Math.ceil(orderedShifts.length / itemsPerPage);
    const visibleShifts = useMemo(
        () => orderedShifts.slice((page - 1) * itemsPerPage, page * itemsPerPage),
        [orderedShifts, page]
    );

    React.useEffect(() => {
        if (pageCount > 0 && page > pageCount) {
            setPage(pageCount);
        }
    }, [page, pageCount]);

    return (<>
                {shiftsLoading && shifts.length === 0 ? (
                    <Stack spacing={2.5} role="status" aria-label="Loading active shifts">
                        {[0, 1, 2].map((index) => (
                            <Skeleton key={index} variant="rounded" height={196} sx={{ borderRadius: 'var(--ct-card-radius)' }} />
                        ))}
                    </Stack>
                ) : shiftsError ? (
                    <DashboardContentState
                        kind="error"
                        title="Active shifts did not load"
                        description={`${shiftsError} Check your connection and try again.`}
                        actionLabel="Try again"
                        onAction={() => { void loadShifts(); }}
                    />
                ) : shifts.length === 0 ? (
                    <DashboardContentState
                        kind="empty"
                        icon={<CalendarDays />}
                        title="No active shifts"
                        description="Shifts you post appear here while they are being filled."
                        actionLabel="Post a shift"
                        onAction={handlePostShift}
                    />
                ) : (
                    <Stack spacing={2.5}>
                        {visibleShifts.map((shift, idx) => {
                            const absoluteIdx = (page - 1) * itemsPerPage + idx;
                            const isDedicated = isDedicatedShift(shift);
                            const prev = absoluteIdx > 0 ? orderedShifts[absoluteIdx - 1] : null;
                            const showSectionHeader =
                                isDedicated && (idx === 0 || (prev && isDedicatedShift(prev) !== isDedicated));
                            return (
                                <React.Fragment key={shift.id}>
                                    {showSectionHeader && (
                                        <Box sx={{ px: 1, pt: idx === 0 ? 0 : 2 }}>
                                            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 900, letterSpacing: 1 }}>
                                                {isDedicated ? 'Direct / Private Offers' : 'Active Shifts'}
                                            </Typography>
                                        </Box>
                                    )}
                                    <ActiveShiftCard key={shift.id} shift={shift} dedicated={isDedicated}
                                        isDarkMode={isDarkMode} data={data} state={state} actions={actions} />
                                </React.Fragment>
                            );
                        })}
                        {pageCount > 1 && (
                            <Box display="flex" justifyContent="center" mt={1}>
                                <Pagination
                                    count={pageCount}
                                    page={page}
                                    onChange={(_, value) => {
                                        setPage(value);
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                    color="primary"
                                />
                            </Box>
                        )}
                    </Stack>
                )}

    </>);
}
