import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput, Button, RadioButton, Surface, Divider } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ProgressStepper from '../../../components/ProgressStepper';
import { useOnboarding } from './_context';
import { AHPRA_CONSENT_TEXT } from '../../../constants/ahpraConsent';

const ONBOARDING_STEPS = ['Basic Info', 'Role Details', 'Profile Photo', 'Review'];

const ROLE_OPTIONS = [
    { label: 'Pharmacy Manager', value: 'MANAGER' },
    { label: 'Pharmacist', value: 'PHARMACIST' },
];

export default function OwnerOnboardingStep2() {
    const router = useRouter();
    const { data, updateData } = useOnboarding();

    const [formData, setFormData] = useState({
        role: data.role || 'MANAGER',
        ahpra_number: data.ahpra_number || '',
        chain_pharmacy: data.chain_pharmacy || false,
    });

    const loading = false;
    const [error, setError] = useState('');

    const isPharmacist = formData.role === 'PHARMACIST';

    const handleNext = async () => {
        setError('');

        // Validate AHPRA if pharmacist
        if (isPharmacist && !formData.ahpra_number) {
            setError('Please enter your AHPRA registration number');
            return;
        }

        if (isPharmacist && formData.ahpra_number.length < 10) {
            setError('Please enter a valid AHPRA number');
            return;
        }

        // Save to context and navigate
        updateData({
            role: formData.role,
            ahpra_number: formData.ahpra_number,
            chain_pharmacy: formData.chain_pharmacy,
        });
        router.push('/owner/onboarding/step3');
    };

    return (
        <SafeAreaView style={styles.container} edges={['left', 'right']}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                    <ProgressStepper
                        currentStep={2}
                        totalSteps={4}
                        steps={ONBOARDING_STEPS}
                    />

                    <Surface style={styles.content} elevation={1}>
                        <Text variant="headlineSmall" style={styles.title}>
                            Role & Registration
                        </Text>
                        <Text variant="bodyMedium" style={styles.subtitle}>
                            Tell us about your professional role
                        </Text>

                        {error ? (
                            <Surface style={styles.errorContainer} elevation={0}>
                                <Text style={styles.errorText}>{error}</Text>
                            </Surface>
                        ) : null}

                        <View style={styles.form}>
                            <Text variant="titleSmall" style={styles.sectionTitle}>
                                What is your role?
                            </Text>

                            <RadioButton.Group
                                onValueChange={(value) => setFormData({ ...formData, role: value })}
                                value={formData.role}
                            >
                                {ROLE_OPTIONS.map((option) => (
                                    <View key={option.value} style={styles.radioItem}>
                                        <RadioButton value={option.value} />
                                        <Text style={styles.radioLabel}>{option.label}</Text>
                                    </View>
                                ))}
                            </RadioButton.Group>

                            <Divider style={styles.divider} />

                            {isPharmacist && (
                                <>
                                    <Text variant="titleSmall" style={styles.sectionTitle}>
                                        AHPRA Registration
                                    </Text>

                                    <TextInput
                                        label="AHPRA Number *"
                                        value={formData.ahpra_number}
                                        onChangeText={(text) => setFormData({ ...formData, ahpra_number: text })}
                                        mode="outlined"
                                        style={styles.input}
                                        placeholder="e.g., PHA0001234567"
                                        left={<TextInput.Icon icon="certificate" />}
                                    />

                                    <Text variant="bodySmall" style={styles.helperText}>
                                        {AHPRA_CONSENT_TEXT}
                                    </Text>

                                    <Divider style={styles.divider} />
                                </>
                            )}

                            <Text variant="titleSmall" style={styles.sectionTitle}>
                                Pharmacy Type
                            </Text>

                            <RadioButton.Group
                                onValueChange={(value) => setFormData({ ...formData, chain_pharmacy: value === 'yes' })}
                                value={formData.chain_pharmacy ? 'yes' : 'no'}
                            >
                                <View style={styles.radioItem}>
                                    <RadioButton value="no" />
                                    <Text style={styles.radioLabel}>Independent Pharmacy</Text>
                                </View>
                                <View style={styles.radioItem}>
                                    <RadioButton value="yes" />
                                    <Text style={styles.radioLabel}>Part of a Chain/Group</Text>
                                </View>
                            </RadioButton.Group>
                        </View>
                    </Surface>

                    <View style={styles.buttonContainer}>
                        <Button
                            mode="outlined"
                            onPress={() => router.back()}
                            style={styles.button}
                        >
                            Back
                        </Button>

                        <Button
                            mode="contained"
                            onPress={handleNext}
                            loading={loading}
                            disabled={loading}
                            style={[styles.button, styles.nextButton]}
                        >
                            Next
                        </Button>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    keyboardView: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
    },
    content: {
        padding: 20,
        borderRadius: 8,
        backgroundColor: '#fff',
        marginBottom: 16,
    },
    title: {
        fontWeight: 'bold',
        marginBottom: 8,
    },
    subtitle: {
        color: '#666',
        marginBottom: 24,
    },
    errorContainer: {
        backgroundColor: '#ffebee',
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
    },
    errorText: {
        color: '#c62828',
    },
    form: {
        gap: 12,
    },
    sectionTitle: {
        marginTop: 8,
        marginBottom: 8,
        fontWeight: '600',
    },
    radioItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
    },
    radioLabel: {
        marginLeft: 8,
        flex: 1,
    },
    divider: {
        marginVertical: 16,
    },
    input: {
        backgroundColor: '#fff',
    },
    helperText: {
        color: '#666',
        marginTop: -4,
    },
    buttonContainer: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
    button: {
        flex: 1,
    },
    nextButton: {
        flex: 2,
    },
});
