import { useState, useCallback, useRef } from 'react';
import {
    Shift,
    escalateShiftService,
    deleteActiveShiftService,
    acceptShiftCandidateService,
} from '@chemisttasker/shared-core';

export function useShiftActions(
    setShifts: React.Dispatch<React.SetStateAction<Shift[]>>,
    showSnackbar: (msg: string) => void
) {
    const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
    // State updates are asynchronous; use a synchronous lock for same-render taps.
    const pendingActions = useRef<Set<string>>(new Set());

    const handleEscalate = useCallback(
        async (shiftId: number, targetVisibility?: string) => {
            const key = `escalate_${shiftId}`;
            if (pendingActions.current.has(key)) return false;
            pendingActions.current.add(key);
            setActionLoading(prev => ({ ...prev, [key]: true }));
            try {
                await escalateShiftService(shiftId, { targetVisibility });
                if (targetVisibility) {
                    setShifts(prev => prev.map(shift => (
                        shift.id === shiftId
                            ? { ...shift, visibility: targetVisibility, visibilityLevel: targetVisibility } as Shift
                            : shift
                    )));
                }
                showSnackbar('Shift escalated successfully');
                return true;
            } catch (error) {
                console.error('Failed to escalate shift', error);
                showSnackbar('Failed to escalate shift');
                return false;
            } finally {
                pendingActions.current.delete(key);
                setActionLoading(prev => ({ ...prev, [key]: false }));
            }
        },
        [setShifts, showSnackbar]
    );

    const handleDelete = useCallback(
        async (shiftId: number) => {
            const key = `delete_${shiftId}`;
            if (pendingActions.current.has(key)) return false;
            pendingActions.current.add(key);
            setActionLoading(prev => ({ ...prev, [key]: true }));
            try {
                await deleteActiveShiftService(shiftId);
                setShifts(prev => prev.filter(s => s.id !== shiftId));
                showSnackbar('Shift deleted successfully');
                return true;
            } catch (error) {
                console.error('Failed to delete shift', error);
                showSnackbar('Failed to delete shift');
                return false;
            } finally {
                pendingActions.current.delete(key);
                setActionLoading(prev => ({ ...prev, [key]: false }));
            }
        },
        [setShifts, showSnackbar]
    );

    const handleAccept = useCallback(
        async (shiftId: number, userId: number, slotId: number | null) => {
            // The server offers distinct slots independently; only duplicate taps for the same slot share a lock.
            const key = `accept_${shiftId}_${userId}_${slotId ?? 'all'}`;
            if (pendingActions.current.has(key)) return false;
            pendingActions.current.add(key);
            setActionLoading(prev => ({ ...prev, [key]: true }));
            try {
                const result = await acceptShiftCandidateService(shiftId, { userId, slotId });
                showSnackbar('Offer sent. Waiting for candidate confirmation.');
                return result || true;
            } catch (error) {
                console.error('Failed to accept candidate', error);
                showSnackbar('Failed to assign candidate');
                return false;
            } finally {
                pendingActions.current.delete(key);
                setActionLoading(prev => ({ ...prev, [key]: false }));
            }
        },
        [showSnackbar]
    );

    return {
        actionLoading,
        handleEscalate,
        handleDelete,
        handleAccept,
    };
}
