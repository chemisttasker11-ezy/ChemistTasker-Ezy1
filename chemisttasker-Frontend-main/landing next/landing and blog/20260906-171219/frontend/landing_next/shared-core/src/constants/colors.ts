/**
 * Centralized color definitions for the roster calendars
 */
export const ROSTER_COLORS: { [key: string]: string } = {
    // Roles
    PHARMACIST: '#1976d2',   // Material UI Primary Blue
    ASSISTANT: '#2e7d32',    // Material UI Success Green
    INTERN: '#ed6c02',       // Material UI Warning Orange
    TECHNICIAN: '#9c27b0',   // Material UI Purple

    // Statuses
    OPEN_SHIFT: '#66bb6a',       // A lighter, distinct green for available shifts
    SWAP_PENDING: '#ffa726',     // A vibrant orange for pending cover requests
    SWAP_APPROVED: '#81c784',    // A soft green for approved cover
    LEAVE_PENDING: '#78909c',    // A neutral blue-grey for pending leave
    LEAVE_APPROVED: '#d32f2f',   // Material UI Error Red for approved leave (day is blocked)

    // Default
    DEFAULT: '#757575',      // Grey
};
