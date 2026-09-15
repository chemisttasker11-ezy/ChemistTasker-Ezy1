import React from 'react';
import { Image, View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Surface, Button, ActivityIndicator, IconButton } from 'react-native-paper';
import { EscalationLevelKey, Shift } from '@chemisttasker/shared-core';
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

const levelIcons: Record<EscalationLevelKey, string> = {
    FULL_PART_TIME: 'account-group',
    LOCUM_CASUAL: 'heart',
    OWNER_CHAIN: 'storefront',
    ORG_CHAIN: 'office-building',
    PLATFORM: 'web',
};

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

    return (
        <View>
            <View style={styles.container}>
                {/* Background Track */}
                <View style={[styles.track, { left: 20, right: 20 }]} />
                
                {/* Progress Track */}
                <View 
                    style={[
                        styles.progressTrack, 
                        { 
                            width: `${Math.min(100, Math.max(0, ((Math.max(selectedIndex, uiCurrentIndex) + (showPrivateFirst ? 1 : 0)) / Math.max(1, levelSequence.length - 1)) * 100))}%`,
                            left: 20,
                        } 
                    ]} 
                />

                {showPrivateFirst && (
                    <Surface style={[styles.stepWrap, styles.stepItem]} elevation={0}>
                        <View style={[styles.stepConnector, styles.stepConnectorReached]} />
                        <View style={[styles.stepCircle, styles.stepCircleReached]}>
                            <IconButton icon="lock" size={20} iconColor="#fff" style={styles.stepIcon} />
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
                                <View style={[styles.stepCircle, isReached ? styles.stepCircleReached : styles.stepCircleMuted, isSelected && !isPlatform && { borderColor: color }]}>
                                    {isPlatform ? (
                                        <Image
                                            source={chemisttaskerBadge}
                                            style={[
                                                styles.platformBadge,
                                                !isPlatformEscalated && styles.platformBadgeDisabled,
                                            ]}
                                            resizeMode="contain"
                                        />
                                    ) : (
                                        <IconButton icon={levelIcons[level]} size={20} iconColor="#fff" style={styles.stepIcon} />
                                    )}
                                </View>
                                <View style={[styles.stepDot, { backgroundColor: isPlatform ? (isPlatformEscalated || isSelected ? color : '#CBD5E1') : isReached ? color : '#CBD5E1' }]} />
                                <Text
                                    style={[
                                        styles.stepText,
                                        { color: isPlatform ? (isPlatformEscalated ? '#111827' : customTheme.colors.textMuted) : isSelected ? color : isActive || isCompleted ? '#111827' : customTheme.colors.textMuted },
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
                    <View style={styles.escalateIcon}><ActivityIndicator size="small" color="#fff" /></View>
                    <View style={styles.escalateCopy}>
                        <Text style={styles.escalateTitle}>Escalating...</Text>
                        <Text style={styles.escalateText}>Escalate to the next audience to find the right candidate.</Text>
                    </View>
                </View>
            ) : canEscalateToSelected ? (
                <View style={styles.escalateBox}>
                    <View style={styles.escalateIcon}>
                        <IconButton icon="trending-up" size={24} iconColor="#fff" style={styles.stepIcon} />
                    </View>
                    <View style={styles.escalateCopy}>
                        <Text style={styles.escalateTitle}>Ready to widen your search?</Text>
                        <Text style={styles.escalateText}>Escalate to the next audience to find the right candidate.</Text>
                    </View>
                    <Button mode="contained" style={styles.escalateButton} onPress={() => onEscalate(shift, levelSequence[selectedIndex])}>
                        Escalate to {resolveLabel(levelSequence[selectedIndex])}
                    </Button>
                </View>
            ) : hasNextLevel ? (
                // Fallback: Show escalation suggestion for next available level
                <View style={styles.escalateBox}>
                    <View style={styles.escalateIcon}>
                        <IconButton icon="trending-up" size={24} iconColor="#fff" style={styles.stepIcon} />
                    </View>
                    <View style={styles.escalateCopy}>
                        <Text style={styles.escalateTitle}>Ready to widen your search?</Text>
                        <Text style={styles.escalateText}>Escalate to the next audience to find the right candidate.</Text>
                    </View>
                    <Button mode="contained" style={styles.escalateButton} onPress={() => onEscalate(shift, levelSequence[nextLevelIndex])}>
                        Escalate to {resolveLabel(levelSequence[nextLevelIndex])}
                    </Button>
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'center',
        flexWrap: 'nowrap',
        position: 'relative',
        paddingVertical: customTheme.spacing.sm,
        paddingHorizontal: 0,
        gap: 2,
    },
    track: {
        position: 'absolute',
        left: 20,
        right: 20,
        top: 28,
        height: 4,
        borderRadius: 999,
        backgroundColor: '#E5E7EB',
    },
    progressTrack: {
        position: 'absolute',
        left: 20,
        top: 28,
        height: 4,
        borderRadius: 999,
        backgroundColor: '#7C3AED',
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
    },
    stepCircle: {
        width: 38,
        height: 38,
        borderRadius: 19,
        borderWidth: 3,
        borderColor: '#E9D5FF',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.24,
        shadowRadius: 14,
        elevation: 5,
        zIndex: 2,
    },
    stepConnector: {
        position: 'absolute',
        top: 19,
        left: '50%',
        right: '-50%',
        height: 4,
        borderRadius: 999,
        zIndex: 0,
    },
    stepConnectorReached: {
        backgroundColor: '#7C3AED',
    },
    stepConnectorMuted: {
        backgroundColor: '#E5E7EB',
    },
    stepCircleReached: {
        backgroundColor: '#7C3AED',
    },
    stepCircleMuted: {
        backgroundColor: '#CBD5E1',
        borderColor: '#E5E7EB',
        shadowOpacity: 0.08,
    },
    stepIcon: {
        margin: 0,
        width: 30,
        height: 30,
    },
    platformBadge: {
        width: 28,
        height: 28,
    },
    platformBadgeDisabled: {
        opacity: 0.42,
        tintColor: '#94A3B8',
    },
    stepDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginTop: -3,
        marginBottom: 3,
        backgroundColor: '#7C3AED',
        borderWidth: 2,
        borderColor: '#fff',
    },
    stepText: {
        fontSize: 7.5,
        lineHeight: 8.5,
        fontWeight: '700',
        textAlign: 'center',
        maxWidth: 72,
    },
    privateStep: {
        backgroundColor: '#E0F2FE',
        borderColor: '#7DD3FC',
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
        padding: customTheme.spacing.md,
        gap: customTheme.spacing.md,
        backgroundColor: '#FAF5FF',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#E9D5FF',
    },
    escalateIcon: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: '#7C3AED',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.22,
        shadowRadius: 12,
    },
    escalateCopy: {
        flex: 1,
        minWidth: 180,
    },
    escalateTitle: {
        color: customTheme.colors.text,
        fontWeight: '900',
        fontSize: 15,
    },
    escalateText: {
        color: customTheme.colors.textMuted,
        fontSize: 12,
        marginTop: 2,
    },
    escalateButton: {
        borderRadius: 10,
    },
});
