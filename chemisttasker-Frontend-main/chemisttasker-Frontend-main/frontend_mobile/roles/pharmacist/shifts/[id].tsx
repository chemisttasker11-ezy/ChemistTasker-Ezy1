import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Snackbar, Text } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    Shift,
    expressInterestInShiftService,
    submitShiftCounterOfferService,
    fetchShiftInterests,
    fetchShiftRejections,
    fetchWorkerShiftDetailService,
    rejectShiftService,
} from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import ShiftsBoard from '@/roles/shared/shifts/ShiftsBoard';

const getErrorMessage = (error: unknown, fallback: string) => {
    const detail = (error as any)?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (error instanceof Error && error.message) return error.message;
    return fallback;
};

const isSlotIdRequiredError = (error: unknown) => {
    const detail = (error as any)?.response?.data?.detail;
    const message = error instanceof Error ? error.message : null;
    return [detail, message].some((value) => typeof value === 'string' && value.includes('slot_id is required'));
};

const rejectSlotIdsWithBatchFallback = async (shiftId: number, slotIds: number[]) => {
    try {
        await rejectShiftService({ shiftId, slotIds } as any);
    } catch (err) {
        if (!isSlotIdRequiredError(err)) throw err;
        await Promise.all(slotIds.map((slotId) => rejectShiftService({ shiftId, slotId })));
    }
};

const coerceId = (value: unknown) => {
    return typeof value === 'number' ? value : null;
};

const coerceSlotId = (value: unknown) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
        return Number(value);
    }
    return null;
};

export default function WorkerShiftDetailPage() {
    const { id } = useLocalSearchParams<{ id?: string }>();
    const { user } = useAuth();
    const [shift, setShift] = useState<Shift | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [appliedShiftIds, setAppliedShiftIds] = useState<number[]>([]);
    const [appliedSlotIds, setAppliedSlotIds] = useState<number[]>([]);
    const [rejectedShiftIds, setRejectedShiftIds] = useState<number[]>([]);
    const [rejectedSlotIds, setRejectedSlotIds] = useState<number[]>([]);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string | null }>(
        { open: false, message: null }
    );

    const loadShift = useCallback(async () => {
        if (!id || !user) {
            setLoading(false);
            return;
        }
        const shiftId = Number(id);
        if (!Number.isFinite(shiftId)) {
            setError('Invalid shift identifier.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const [detail, interests, rejections] = await Promise.all([
                fetchWorkerShiftDetailService(shiftId),
                fetchShiftInterests({ userId: user.id }),
                fetchShiftRejections({ userId: user.id }),
            ]);

            setShift(detail as Shift);

            const nextAppliedSlots = new Set<number>();
            const nextAppliedShifts = new Set<number>();
            (interests || []).forEach((interest: any) => {
                const slotId = coerceSlotId(interest?.slotId ?? interest?.slot_id ?? interest?.slot);
                if (slotId != null) {
                    nextAppliedSlots.add(slotId);
                    return;
                }
                const shiftIdValue = coerceId(interest?.shift) ?? coerceId(interest?.shift_id);
                if (shiftIdValue != null) {
                    nextAppliedShifts.add(shiftIdValue);
                }
            });

            const nextRejectedSlots = new Set<number>();
            const nextRejectedShifts = new Set<number>();
            (rejections || []).forEach((rejection: any) => {
                const slotId = coerceSlotId(rejection?.slotId ?? rejection?.slot_id ?? rejection?.slot);
                if (slotId != null) {
                    nextRejectedSlots.add(slotId);
                    return;
                }
                const shiftIdValue = coerceId(rejection?.shift) ?? coerceId(rejection?.shift_id);
                if (shiftIdValue != null) {
                    nextRejectedShifts.add(shiftIdValue);
                }
            });

            setAppliedSlotIds(Array.from(nextAppliedSlots));
            setAppliedShiftIds(Array.from(nextAppliedShifts));
            setRejectedSlotIds(Array.from(nextRejectedSlots));
            setRejectedShiftIds(Array.from(nextRejectedShifts));
        } catch (err) {
            setError(getErrorMessage(err, 'Failed to load shift details. It may no longer be available.'));
        } finally {
            setLoading(false);
        }
    }, [id, user]);

    useEffect(() => {
        void loadShift();
    }, [loadShift]);

    const handleApplyAll = async (targetShift: Shift) => {
        try {
            const shiftSlots = targetShift.slots ?? [];
            if (targetShift.singleUserOnly || shiftSlots.length === 0) {
                await expressInterestInShiftService({ shiftId: targetShift.id, slotId: null });
                setAppliedShiftIds((prev) => Array.from(new Set([...prev, targetShift.id])));
                return;
            }
            await expressInterestInShiftService({ shiftId: targetShift.id, slotIds: shiftSlots.map((slot) => slot.id) } as any);
            setAppliedSlotIds((prev) => Array.from(new Set([...prev, ...shiftSlots.map((s) => s.id)])));
        } catch (err) {
            setSnackbar({
                open: true,
                message: getErrorMessage(err, 'Failed to express interest.'),
            });
            throw err;
        }
    };

    const handleApplySlot = async (targetShift: Shift, slotId: number) => {
        try {
            await expressInterestInShiftService({ shiftId: targetShift.id, slotId });
            setAppliedSlotIds((prev) => Array.from(new Set([...prev, slotId])));
        } catch (err) {
            setSnackbar({
                open: true,
                message: getErrorMessage(err, 'Failed to express interest.'),
            });
            throw err;
        }
    };

    const handleRejectShift = async (targetShift: Shift) => {
        try {
            await rejectShiftService({ shiftId: targetShift.id, slotId: null });
            setRejectedShiftIds((prev) => Array.from(new Set([...prev, targetShift.id])));
        } catch (err) {
            setSnackbar({
                open: true,
                message: getErrorMessage(err, 'Failed to reject shift.'),
            });
            throw err;
        }
    };

    const handleRejectSlot = async (targetShift: Shift, slotId: number) => {
        try {
            await rejectShiftService({ shiftId: targetShift.id, slotId });
            setRejectedSlotIds((prev) => Array.from(new Set([...prev, slotId])));
        } catch (err) {
            setSnackbar({
                open: true,
                message: getErrorMessage(err, 'Failed to reject slot.'),
            });
            throw err;
        }
    };

    const handleApplySlots = async (targetShift: Shift, slotIds: number[]) => {
        try {
            const uniqueSlotIds = Array.from(new Set(slotIds)).filter((slotId) => Number.isFinite(slotId));
            if (uniqueSlotIds.length === 0) return;
            await expressInterestInShiftService({ shiftId: targetShift.id, slotIds: uniqueSlotIds } as any);
            setAppliedSlotIds((prev) => Array.from(new Set([...prev, ...uniqueSlotIds])));
        } catch (err) {
            setSnackbar({
                open: true,
                message: getErrorMessage(err, 'Failed to express interest in selected slots.'),
            });
            throw err;
        }
    };

    const handleRejectSlots = async (targetShift: Shift, slotIds: number[]) => {
        try {
            await rejectSlotIdsWithBatchFallback(targetShift.id, slotIds);
            setRejectedSlotIds((prev) => Array.from(new Set([...prev, ...slotIds])));
        } catch (err) {
            setSnackbar({
                open: true,
                message: getErrorMessage(err, 'Failed to reject selected slots.'),
            });
            throw err;
        }
    };

    const handleSubmitCounterOffer = async (payload: any) => {
        try {
            await submitShiftCounterOfferService(payload);
        } catch (err) {
            setSnackbar({
                open: true,
                message: getErrorMessage(err, 'Failed to submit counter offer.'),
            });
            throw err;
        }
    };

    if (error) {
        return (
            <SafeAreaView style={styles.container} edges={['left', 'right']}>
                <View style={styles.messageContainer}>
                    <Text variant="bodyMedium">{error}</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['left', 'right']}>
            <ShiftsBoard
                title="Shift Details"
                shifts={shift ? [shift] : []}
                loading={loading}
                onApplyAll={handleApplyAll}
                onApplySlot={handleApplySlot}
                onApplySlots={handleApplySlots}
                onSubmitCounterOffer={handleSubmitCounterOffer}
                onRejectShift={handleRejectShift}
                onRejectSlot={handleRejectSlot}
                onRejectSlots={handleRejectSlots}
                initialAppliedShiftIds={appliedShiftIds}
                initialAppliedSlotIds={appliedSlotIds}
                initialRejectedShiftIds={rejectedShiftIds}
                initialRejectedSlotIds={rejectedSlotIds}
                enableSaved={false}
                hideSaveToggle
                hideFiltersAndSort
                hideTabs
                onRefresh={loadShift}
            />
            <Snackbar
                visible={snackbar.open}
                onDismiss={() => setSnackbar({ open: false, message: null })}
                duration={4000}
            >
                {snackbar.message}
            </Snackbar>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f6fa',
    },
    messageContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
});
