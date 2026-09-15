// ActiveShiftsPage Theme
// Custom theme colors and styles

export const customTheme = {
    colors: {
        primary: '#7C3AED',
        primaryLight: '#F3E8FF',
        success: '#10B981',
        successLight: '#D1FAE5',
        warning: '#F59E0B',
        warningLight: '#FEF3C7',
        error: '#EF4444',
        errorLight: '#FEE2E2',
        info: '#3B82F6',
        infoLight: '#DBEAFE',
        grey: '#6B7280',
        greyLight: '#F3F4F6',
        border: '#E5E7EB',
        text: '#111827',
        textMuted: '#9CA3AF',
    },
    spacing: {
        xs: 4,
        sm: 8,
        md: 12,
        lg: 16,
        xl: 24,
    },
};

export const levelColors: Record<string, string> = {
    FULL_PART_TIME: customTheme.colors.success,
    LOCUM_CASUAL: customTheme.colors.info,
    OWNER_CHAIN: customTheme.colors.warning,
    ORG_CHAIN: customTheme.colors.primary,
    PLATFORM: customTheme.colors.grey,
};
