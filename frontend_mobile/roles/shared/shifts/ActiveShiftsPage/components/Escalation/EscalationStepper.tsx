import React, { useState } from 'react';
import { Image, View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Surface, ActivityIndicator } from 'react-native-paper';
import {
    Users,
    Heart,
    Store,
    Building2,
    TrendingUp,
    Lock,
} from 'lucide-react-native';
import { EscalationLevelKey, Shift } from '@chemisttasker/shared-core';
import { colors as tokenColors, font, radius, space, touch } from '@/constants/tokens';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { customTheme, levelColors } from '../../theme';
import { getLevelLabel } from '../../utils/displayHelpers';

const ESCALATION_LEVELS: EscalationLevelKey[] = [
    'FULL_PART_TIME',
    'LOCUM_CASUAL',
    'OWNER_CHAIN',
    'ORG_CHAIN',
    'PLATFORM',
];

const chemisttaskerBadge = require('../../../../../../assets/images/chemisttasker-platform.png');

interface EscalationStepperProps {
    shift: Shift;
    currentLevel: EscalationLevelKey;
    selectedLevel: EscalationLevelKey;
    onSelectLevel: (level: EscalationLevelKey) => void;
    onEscalate: (shift: Shift, levelKey: EscalationLevelKey) => void;
    escalating?: boolean;
    labelOverrides?: Partial<Record<EscalationLevelKey, string>>;
    showPrivateFirst?: boolean;
}

function renderLevelIcon(level: EscalationLevelKey, isPlatform: boolean, isPlatformEscalated: boolean) {
    if (isPlatform) {
        return (
            <Image
                source={chemisttaskerBadge}
                style={[
                    styles.platformBadge,
                    !isPlatformEscalated && styles.platformBadgeDisabled,
                ]}
                resizeMode="contain"
            />
        );
    }
    switch (level) {
        case 'FULL_PART_TIME':
            return <Users size={18} color="#FFFFFF" />;
        case 'LOCUM_CASUAL':
            return <Heart size={18} color="#FFFFFF" />;
        case 'OWNER_CHAIN':
            return <Store size={18} color="#FFFFFF" />;
        case 'ORG_CHAIN':
            return <Building2 size={18} color="#FFFFFF" />;
        default:
            return <Users size={18} color="#FFFFFF" />;
    }
}

export default function EscalationStepper({
    shift,
    currentLevel,
    selectedLevel,
    onSelectLevel,
    onEscalate,
    escalating,
    labelOverrides,
    showPrivateFirst,
}: EscalationStepperProps) {
    const [confirmTargetLevel, setConfirmTargetLevel] = useState<EscalationLevelKey | null>(null);

    const allowedKeys = new Set<string>((shift as any).allowedEscalationLevels || []);
    if (!allowedKeys.size) {
        ESCALATION_LEVELS.forEach((level) => allowedKeys.add(level));
    }

    // Filter to only show available escalation levels (matching web behavior)
    const levelSequence = ESCALATION_LEVELS.filter((level) => allowedKeys.has(level));
    const currentIndex = Math.max(0, levelSequence.indexOf(currentLevel));
    const selectedIndex = levelSequence.indexOf(selectedLevel);
    const uiCurrentIndex = showPrivateFirst ? -1 : currentIndex;
    const resolveLabel = (level: EscalationLevelKey) =>
        level === 'PLATFORM' ? 'Chemisttasker' : labelOverrides?.[level] ?? getLevelLabel(level);

    // Check if can escalate to selected level
    const canEscalateToSelected =
        selectedIndex > uiCurrentIndex &&
        selectedIndex !== -1 &&
        allowedKeys.has(levelSequence[selectedIndex]);

    // Fallback: check next available level for escalation suggestion
    const nextLevelIndex = currentIndex + 1;
    const hasNextLevel = nextLevelIndex < levelSequence.length && allowedKeys.has(levelSequence[nextLevelIndex]);

    const targetEscalateLevel = canEscalateToSelected
        ? levelSequence[selectedIndex]
        : hasNextLevel
            ? levelSequence[nextLevelIndex]
            : null;

    return (
        <View style={styles.wrapper}>
            <View style={styles.container}>
                {/* Background Track */}
                <View style={[styles.track, { left: 20, right: 20 }]} />

                {/* Progress Track */}
                <View
                    style={[
                        styles.progressTrack,
                        {
                            width: `${Math.min(
                                100,
                                Math.max(
                                    0,
                                    ((Math.max(selectedIndex, uiCurrentIndex) + (showPrivateFirst ? 1 : 0)) /
                                        Math.max(1, levelSequence.length - 1)) *
                                        100
                                )
                            )}%`,
                            left: 20,
                        },
                    ]}
                />

                {showPrivateFirst && (
                    <Surface style={[styles.stepWrap, styles.stepItem]} elevation={0}>
                        <View style={[styles.stepConnector, styles.stepConnectorReached]} />
                        <View style={[styles.stepCircle, styles.stepCircleReached]}>
                            <Lock size={16} color="#FFFFFF" />
                        </View>
                        <View style={styles.stepDot} />
                        <Text style={[styles.stepText, styles.privateStepText]} numberOfLines={2}>
                            Direct / Private
                        </Text>
                    </Surface>
                )}
                {levelSequence.map((level, index) => {
                    const isActive = index === uiCurrentIndex;
                    const isSelected = level === selectedLevel;
                    const isCompleted = index < uiCurrentIndex;
                    const color = levelColors[level] || customTheme.colors.grey;
                    const isPlatform = level === 'PLATFORM';
                    const isPlatformEscalated = isPlatform && (index <= uiCurrentIndex || isSelected);
                    const isReached = isActive || isCompleted || isSelected;
                    const selectable = index <= uiCurrentIndex + 1 && allowedKeys.has(level);
                    const connectorReached =
                        index < Math.max(selectedIndex, uiCurrentIndex) ||
                        (showPrivateFirst && index === 0);
                    const showConnector = index < levelSequence.length - 1;

                    const label = resolveLabel(level);
                    return (
                        <TouchableOpacity
                            key={level}
                            style={styles.stepTouch}
                            activeOpacity={0.8}
                            disabled={!selectable}
                            onPress={() => onSelectLevel(level)}
                            accessible
                            accessibilityRole="button"
                            accessibilityLabel={`Escalation level ${label}.${isReached ? ' Reached.' : ''}${isSelected ? ' Selected.' : ''}`}
                        >
                            <Surface
                                style={[
                                    styles.stepWrap,
                                    !selectable && styles.stepDisabled,
                                ]}
                                elevation={0}
                            >
                                {showConnector && (
                                    <View
                                        style={[
                                            styles.stepConnector,
                                            connectorReached ? styles.stepConnectorReached : styles.stepConnectorMuted,
                                        ]}
                                    />
                                )}
                                <View
                                    style={[
                                        styles.stepCircle,
                                        isReached ? styles.stepCircleReached : styles.stepCircleMuted,
                                        isSelected && !isPlatform && { borderColor: color },
                                    ]}
                                >
                                    {renderLevelIcon(level, isPlatform, isPlatformEscalated)}
                                </View>
                                <View
                                    style={[
                                        styles.stepDot,
                                        {
                                            backgroundColor: isPlatform
                                                ? isPlatformEscalated || isSelected
                                                    ? color
                                                    : '#CBD5E1'
                                                : isReached
                                                    ? color
                                                    : '#CBD5E1',
                                        },
                                    ]}
                                />
                                <Text
                                    style={[
                                        styles.stepText,
                                        {
                                            color: isPlatform
                                                ? isPlatformEscalated
                                                    ? tokenColors.textPrimary
                                                    : tokenColors.textMuted
                                                : isSelected
                                                    ? color
                                                    : isActive || isCompleted
                                                        ? tokenColors.textPrimary
                                                        : tokenColors.textMuted,
                                        },
                                    ]}
                                    numberOfLines={2}
                                >
                                    {label}
                                </Text>
                            </Surface>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {escalating ? (
                <View style={styles.escalateBox}>
                    <View style={styles.escalateIcon}>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                    </View>
                    <View style={styles.escalateCopy}>
                        <Text style={styles.escalateTitle}>Escalating...</Text>
                        <Text style={styles.escalateText}>Escalating to widen candidate audience.</Text>
                    </View>
                </View>
            ) : targetEscalateLevel ? (
                <View style={styles.escalateBox}>
                    <View style={styles.escalateIcon}>
                        <TrendingUp size={22} color="#FFFFFF" />
                    </View>
                    <View style={styles.escalateCopy}>
                        <Text style={styles.escalateTitle}>Ready to widen your search?</Text>
                        <Text style={styles.escalateText}>Escalate to the next audience to find the right candidate.</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.escalateBtn}
                        activeOpacity={0.8}
                        onPress={() => setConfirmTargetLevel(targetEscalateLevel)}
                        accessible
                        accessibilityRole="button"
                        accessibilityLabel={`Escalate to ${resolveLabel(targetEscalateLevel)}`}
                    >
                        <Text style={styles.escalateBtnLabel}>
                            Escalate to {resolveLabel(targetEscalateLevel)}
                        </Text>
                    </TouchableOpacity>
                </View>
            ) : null}

            <ConfirmDialog
                open={confirmTargetLevel != null}
                title={`Escalate to ${confirmTargetLevel ? resolveLabel(confirmTargetLevel) : ''}?`}
                body="This will expand shift visibility to candidates at this level. Once escalated, candidates will be notified."
                confirmLabel="Escalate"
                busyLabel="Escalating..."
                busy={Boolean(escalating)}
                destructive={false}
                onConfirm={() => {
                    if (confirmTargetLevel) {
                        const target = confirmTargetLevel;
                        setConfirmTargetLevel(null);
                        onEscalate(shift, target);
                    }
                }}
                onClose={() => setConfirmTargetLevel(null)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        gap: space.sm,
    },
    container: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'center',
        flexWrap: 'nowrap',
        position: 'relative',
        paddingVertical: space.sm,
        paddingHorizontal: 0,
        gap: 2,
    },
    track: {
        position: 'absolute',
        left: 20,
        right: 20,
        top: 26,
        height: 4,
        borderRadius: radius.pill,
        backgroundColor: tokenColors.border,
    },
    progressTrack: {
        position: 'absolute',
        left: 20,
        top: 26,
        height: 4,
        borderRadius: radius.pill,
        backgroundColor: tokenColors.primary,
    },
    stepWrap: {
        width: '100%',
        alignItems: 'center',
        backgroundColor: 'transparent',
        position: 'relative',
    },
    stepItem: {
        flex: 1,
        minWidth: 0,
    },
    stepTouch: {
        flex: 1,
        minWidth: 0,
        minHeight: touch.min,
    },
    stepCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 2,
        borderColor: '#E9D5FF',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: tokenColors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
        elevation: 3,
        zIndex: 2,
    },
    stepConnector: {
        position: 'absolute',
        top: 18,
        left: '50%',
        right: '-50%',
        height: 4,
        borderRadius: radius.pill,
        zIndex: 0,
    },
    stepConnectorReached: {
        backgroundColor: tokenColors.primary,
    },
    stepConnectorMuted: {
        backgroundColor: tokenColors.border,
    },
    stepCircleReached: {
        backgroundColor: tokenColors.primary,
    },
    stepCircleMuted: {
        backgroundColor: '#CBD5E1',
        borderColor: tokenColors.border,
        shadowOpacity: 0.04,
    },
    platformBadge: {
        width: 24,
        height: 24,
    },
    platformBadgeDisabled: {
        opacity: 0.42,
        tintColor: '#94A3B8',
    },
    stepDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginTop: -2,
        marginBottom: 3,
        backgroundColor: tokenColors.primary,
        borderWidth: 1.5,
        borderColor: '#FFFFFF',
    },
    stepText: {
        fontSize: 9,
        lineHeight: 12,
        fontWeight: '700',
        fontFamily: font.inter.semiBold,
        textAlign: 'center',
        maxWidth: 72,
    },
    privateStepText: {
        color: '#0369A1',
    },
    stepDisabled: {
        opacity: 0.6,
    },
    escalateBox: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        padding: space.md,
        gap: space.md,
        backgroundColor: '#FAF5FF',
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: '#E9D5FF',
    },
    escalateIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: tokenColors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: tokenColors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
    },
    escalateCopy: {
        flex: 1,
        minWidth: 180,
    },
    escalateTitle: {
        color: tokenColors.textPrimary,
        fontWeight: '800',
        fontFamily: font.inter.semiBold,
        fontSize: 14,
    },
    escalateText: {
        color: tokenColors.textSecondary,
        fontSize: 12,
        fontFamily: font.inter.regular,
        marginTop: 2,
    },
    escalateBtn: {
        minHeight: touch.min,
        paddingHorizontal: space.md,
        backgroundColor: tokenColors.primary,
        borderRadius: radius.control,
        alignItems: 'center',
        justifyContent: 'center',
    },
    escalateBtnLabel: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
        fontFamily: font.inter.semiBold,
    },
});
