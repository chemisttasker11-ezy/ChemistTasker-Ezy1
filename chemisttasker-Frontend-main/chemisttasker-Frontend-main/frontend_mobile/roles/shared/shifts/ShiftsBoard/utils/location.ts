// Location utilities for ShiftsBoard
// Exact replication from web version

import { TravelLocation } from '../types';

export const parseLocationNumber = (value: any) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

export const normalizeOnboardingLocation = (raw: any): TravelLocation => {
    const source = raw?.data ?? raw ?? {};
    return {
        streetAddress: source.street_address ?? source.streetAddress ?? '',
        suburb: source.suburb ?? '',
        state: source.state ?? '',
        postcode: source.postcode ?? '',
        googlePlaceId: source.google_place_id ?? source.googlePlaceId ?? '',
        latitude: parseLocationNumber(source.latitude),
        longitude: parseLocationNumber(source.longitude),
    };
};

export const formatTravelLocation = (location: TravelLocation) => {
    const street = location.streetAddress.trim();
    const suburb = location.suburb.trim();
    const state = location.state.trim();
    const postcode = location.postcode.trim();
    const cityLine = [suburb, state, postcode].filter(Boolean).join(' ');
    const parts = [street, cityLine].filter(Boolean);
    return parts.join(', ');
};

export const formatTravelSuburbOnly = (location: TravelLocation) => {
    return location.suburb.trim();
};
