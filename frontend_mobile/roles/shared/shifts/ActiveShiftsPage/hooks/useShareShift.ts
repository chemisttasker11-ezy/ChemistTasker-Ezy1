import { createShiftPillReferralService } from '@chemisttasker/shared-core';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Share } from 'react-native';
import { Shift, generateShiftShareLinkService } from '@chemisttasker/shared-core';
import apiClient from '@/utils/apiClient';
import { getSessionGeneration } from '@/utils/authSession';

export function useShareShift(showSnackbar: (msg: string) => void) {
    const { user } = useAuth();
    const accountRef = useRef(user?.id);
    accountRef.current = user?.id;
    const generation = useRef(0);
    useEffect(() => () => { generation.current += 1; }, [user?.id]);
    const [sharingShiftId, setSharingShiftId] = useState<number | null>(null);

    const handleShare = useCallback(
        async (shift: Shift) => {
            if ((shift as any).visibility !== 'PLATFORM') {
                showSnackbar('Escalate to Chemisttasker to get a shareable link.');
                return;
            }
            setSharingShiftId(shift.id);
            const account = user?.id;
            const attempt = generation.current;
            const sessionGeneration = getSessionGeneration();
            const current = () => account != null && accountRef.current === account && generation.current === attempt && sessionGeneration === getSessionGeneration();
            try {
                const link: any = await generateShiftShareLinkService(shift.id);
                if (!current()) return;
                const token = link?.shareToken ?? link?.token ?? null;
                if (!token && !link?.url) {
                    throw new Error('Missing share token');
                }
                const baseUrl = process.env.EXPO_PUBLIC_WEB_URL?.trim() || 'https://app.chemisttasker.com';
                const publicUrl = link?.url ?? `${baseUrl}/shifts/link?token=${token}`;
                const referral = await createShiftPillReferralService({ shift_id: shift.id });
                if (!current()) return;
                const referralCode = referral?.referral_code;
                if (!referralCode || !referral?.id) {
                    throw new Error('Missing shift referral details');
                }
                const separator = publicUrl.includes('?') ? '&' : '?';
                const referralUrl = `${publicUrl}${separator}referral_code=${encodeURIComponent(referralCode)}&referral_event_id=${encodeURIComponent(String(referral.id))}`;
                await Share.share({ message: referralUrl, url: referralUrl });
                if (current()) showSnackbar('Share sheet opened.');
            } catch (error) {
                if (current()) { console.error('Share Error:', error); showSnackbar('Error: Could not generate share link.'); }
            } finally {
                if (current()) setSharingShiftId(null);
            }
        },
        [showSnackbar, user?.id]
    );

    return {
        sharingShiftId,
        handleShare,
    };
}
