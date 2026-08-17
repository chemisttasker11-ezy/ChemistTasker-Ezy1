import { useState, useCallback } from 'react';
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

    const handleEscalate = useCallback(
        async (shiftId: number, targetVisibility?: string) => {
            setActionLoading(prev => ({ ...prev, [`escalate_${shiftId}`]: true }));
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
                setActionLoading(prev => ({ ...prev, [`escalate_${shiftId}`]: false }));
            }
        },
        [setShifts, showSnackbar]
    );

    const handleDelete = useCallback(
        async (shiftId: number) => {
            setActionLoading(prev => ({ ...prev, [`delete_${shiftId}`]: true }));
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
                setActionLoading(prev => ({ ...prev, [`delete_${shiftId}`]: false }));
            }
        },
        [setShifts, showSnackbar]
    );

    const handleAccept = useCallback(
        async (shiftId: number, userId: number, slotId: number | null) => {
            setActionLoading(prev => ({ ...prev, [`accept_${shiftId}_${userId}`]: true }));
            try {
                const result = await acceptShiftCandidateService(shiftId, { userId, slotId });
                showSnackbar('Offer sent. Waiting for candidate confirmation.');
                return result || true;
            } catch (error) {
                console.error('Failed to accept candidate', error);
                showSnackbar('Failed to assign candidate');
                return false;
            } finally {
                setActionLoading(prev => ({ ...prev, [`accept_${shiftId}_${userId}`]: false }));
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
