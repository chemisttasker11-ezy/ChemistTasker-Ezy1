// useReviewOfferDisplay - Exact logic from web
// Simple hook for reviewing counter offers

import { useMemo } from 'react';
import { Shift } from '@chemisttasker/shared-core';

type UseReviewOfferDisplayParams = {
    reviewOfferShiftId: number | null;
    reviewOffers: any[];
    shifts: Shift[];
};

export const useReviewOfferDisplay = ({
    reviewOfferShiftId,
    reviewOffers,
    shifts,
}: UseReviewOfferDisplayParams) => {
    const shift = useMemo(() => {
        if (reviewOfferShiftId == null) return null;
        return shifts.find((current) => current.id === reviewOfferShiftId) ?? null;
    }, [reviewOfferShiftId, shifts]);

    const offers = useMemo(() => (Array.isArray(reviewOffers) ? reviewOffers : []), [reviewOffers]);
    const hasOffers = offers.length > 0;

    return {
        shift,
        offers,
        hasOffers,
    };
};
