import { useState, useCallback } from 'react';
import { Shift, generateShiftShareLinkService } from '@chemisttasker/shared-core';
import apiClient from '../../../../../utils/apiClient';

export function useShareShift(showSnackbar: (msg: string) => void) {
    const [sharingShiftId, setSharingShiftId] = useState<number | null>(null);

    const handleShare = useCallback(
        async (shift: Shift) => {
            if ((shift as any).visibility !== 'PLATFORM') {
                showSnackbar('Escalate to Chemisttasker to get a shareable link.');
                return;
            }
            setSharingShiftId(shift.id);
            try {
                const link = await generateShiftShareLinkService(shift.id);
                const token = (link as any).shareToken ?? (link as any).token;
                if (!token && !(link as any).url) {
                    throw new Error('Missing share token');
                }
                const publicUrl = (link as any).url ?? `${window.location.origin}/shifts/link?token=${token}`;
                const { data: referral } = await apiClient.post('/client-profile/pill-rewards/refer-shift/', {
                    shift_id: shift.id,
                });
                const referralCode = referral?.referral_code;
                if (!referralCode || !referral?.id) {
                    throw new Error('Missing shift referral details');
                }
                const url = new URL(publicUrl);
                url.searchParams.set('referral_code', referralCode);
                url.searchParams.set('referral_event_id', String(referral.id));
                const referralUrl = url.toString();
                await navigator.clipboard.writeText(referralUrl);
                showSnackbar('Referral shift link copied to clipboard!');
            } catch (error) {
                console.error('Share Error:', error);
                showSnackbar('Error: Could not generate share link.');
            } finally {
                setSharingShiftId(null);
            }
        },
        [showSnackbar]
    );

    return {
        sharingShiftId,
        handleShare,
    };
}
