import { brandColors } from '@/constants/theme';

export const customTheme = {
    colors: {
        primary: brandColors.purple,
        primaryLight: '#F0EAFF',
        success: brandColors.success,
        successLight: brandColors.successSoft,
        warning: brandColors.warning,
        warningLight: brandColors.warningSoft,
        error: brandColors.danger,
        errorLight: brandColors.dangerSoft,
        info: brandColors.blue,
        infoLight: '#E8F5FB',
        grey: brandColors.body,
        greyLight: brandColors.surfaceMuted,
        border: brandColors.border,
        text: brandColors.navy,
        textMuted: '#718096',
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
