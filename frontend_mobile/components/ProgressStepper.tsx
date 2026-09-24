import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ProgressBar, Text, Surface } from 'react-native-paper';
import { brandColors } from '@/constants/theme';

interface ProgressStepperProps {
    currentStep: number;
    totalSteps: number;
    steps: string[];
}

export default function ProgressStepper({ currentStep, totalSteps, steps }: ProgressStepperProps) {
    const progress = currentStep / totalSteps;

    return (
        <Surface style={styles.container} elevation={0}>
            <View style={styles.header}>
                <Text variant="titleMedium" style={styles.title}>
                    Step {currentStep} of {totalSteps}
                </Text>
                <Text variant="bodyMedium" style={styles.stepLabel}>
                    {steps[currentStep - 1]}
                </Text>
            </View>

            <ProgressBar progress={progress} style={styles.progressBar} />

            <View style={styles.stepsContainer}>
                {steps.map((step, index) => (
                    <View key={index} style={styles.stepItem}>
                        <View
                            style={[
                                styles.stepCircle,
                                index + 1 === currentStep && styles.stepCircleActive,
                                index + 1 < currentStep && styles.stepCircleComplete,
                            ]}
                        >
                            <Text
                                style={[
                                    styles.stepNumber,
                                    (index + 1 === currentStep || index + 1 < currentStep) && styles.stepNumberActive,
                                ]}
                            >
                                {index + 1}
                            </Text>
                        </View>
                        <Text
                            variant="bodySmall"
                            style={[
                                styles.stepText,
                                index + 1 === currentStep && styles.stepTextActive,
                            ]}
                            numberOfLines={2}
                        >
                            {step}
                        </Text>
                    </View>
                ))}
            </View>
        </Surface>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 16,
        backgroundColor: brandColors.surfaceMuted,
        borderRadius: 8,
        marginBottom: 16,
    },
    header: {
        marginBottom: 12,
    },
    title: {
        fontWeight: 'bold',
        marginBottom: 4,
    },
    stepLabel: {
        color: brandColors.body,
    },
    progressBar: {
        height: 8,
        borderRadius: 4,
        marginBottom: 16,
    },
    stepsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 8,
    },
    stepItem: {
        flex: 1,
        alignItems: 'center',
        gap: 8,
    },
    stepCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#E6EAF2',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#E6EAF2',
    },
    stepCircleActive: {
        backgroundColor: brandColors.purple,
        borderColor: brandColors.purple,
    },
    stepCircleComplete: {
        backgroundColor: brandColors.success,
        borderColor: brandColors.success,
    },
    stepNumber: {
        color: '#718096',
        fontWeight: 'bold',
    },
    stepNumberActive: {
        color: '#fff',
    },
    stepText: {
        textAlign: 'center',
        color: '#718096',
        fontSize: 11,
    },
    stepTextActive: {
        color: brandColors.purple,
        fontWeight: '600',
    },
});
