import { Shift } from '@chemisttasker/shared-core';

export function getCardBorderColor(visibility: string): string {
    return visibility === 'PLATFORM' ? '#6EE7B7' : '#8B5CF6';
}

export function getLocationText(shift: Shift): string {
    const pharmacyDetail = (shift as any).pharmacyDetail;
    const location = [
        pharmacyDetail?.streetAddress,
        pharmacyDetail?.suburb,
        pharmacyDetail?.state,
        pharmacyDetail?.postcode,
    ].filter(Boolean).join(', ');
    return location || 'Address not available';
}
