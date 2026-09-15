import { useState, useCallback } from 'react';
import { Share } from 'react-native';
import { Shift, generateShiftShareLinkService } from '@chemisttasker/shared-core';
import apiClient from '@/utils/apiClient';

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
                const link: any = await generateShiftShareLinkService(shift.id);
                const token = link?.shareToken ?? link?.token ?? null;
                if (!token && !link?.url) {
                    throw new Error('Missing share token');
                }
                const baseUrl = process.env.EXPO_PUBLIC_WEB_URL?.trim() || 'https://app.chemisttasker.com';
                const publicUrl = link?.url ?? `${baseUrl}/shifts/link?token=${token}`;
                const { data: referral } = await apiClient.post('/client-profile/pill-rewards/refer-shift/', {
                    shift_id: shift.id,
                });
                const referralCode = referral?.referral_code;
                if (!referralCode || !referral?.id) {
                    throw new Error('Missing shift referral details');
                }
                const separator = publicUrl.includes('?') ? '&' : '?';
                const referralUrl = `${publicUrl}${separator}referral_code=${encodeURIComponent(referralCode)}&referral_event_id=${encodeURIComponent(String(referral.id))}`;
                await Share.share({ message: referralUrl, url: referralUrl });
                showSnackbar('Share sheet opened.');
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
