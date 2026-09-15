// ShiftsBoard Constants
// Exact replication from web version

import { TravelLocation } from './types';

export const SAVED_STORAGE_KEY = 'saved_shift_ids';
export const APPLIED_STORAGE_KEY = 'applied_shift_ids';
export const APPLIED_SLOT_STORAGE_KEY = 'applied_slot_ids';
export const REJECTED_SHIFT_STORAGE_KEY = 'rejected_shift_ids';
export const REJECTED_SLOT_STORAGE_KEY = 'rejected_slot_ids';
export const COUNTER_OFFER_STORAGE_KEY = 'counter_offer_map';

export const EMPTY_TRAVEL_LOCATION: TravelLocation = {
    streetAddress: '',
    suburb: '',
    state: '',
    postcode: '',
    googlePlaceId: '',
    latitude: null,
    longitude: null,
};

export const GOOGLE_LIBRARIES = ['places'] as Array<'places'>;
export const COUNTER_OFFER_TRAVEL_AUTOCOMPLETE_ID = 'counter-offer-travel-autocomplete';

export const FILTER_SECTIONS = {
    roles: 'Job Role',
    dateRange: 'Date Range',
    perks: 'Perks & Benefits',
    locations: 'Locations',
    timeOfDay: 'Time of Day',
    minRate: 'Min Rate',
    employment: 'Employment Type',
};
