import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput, Button, Surface } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ProgressStepper from '../../../components/ProgressStepper';
import { useOnboarding } from './_context';

const ONBOARDING_STEPS = ['Basic Info', 'Role Details', 'Profile Photo', 'Review'];

export default function OwnerOnboardingStep1() {
    const router = useRouter();
    const { data, updateData } = useOnboarding();

    const [formData, setFormData] = useState({
        phone_number: data.phone_number || '',
    });

    const loading = false;
    const [error, setError] = useState('');

    const handleNext = async () => {
        setError('');

        if (!formData.phone_number) {
            setError('Please enter your phone number');
            return;
        }

        // Validate phone format (basic validation)
        const phoneRegex = /^[\d\s\-\+\(\)]+$/;
        if (!phoneRegex.test(formData.phone_number)) {
            setError('Please enter a valid phone number');
            return;
        }

        // Save to context and navigate to next step
        updateData({ phone_number: formData.phone_number });
        router.push('/owner/onboarding/step2');
    };

    return (
        <SafeAreaView style={styles.container} edges={['left', 'right']}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                    <ProgressStepper
                        currentStep={1}
                        totalSteps={4}
                        steps={ONBOARDING_STEPS}
                    />

                    <Surface style={styles.content} elevation={1}>
                        <Text variant="headlineSmall" style={styles.title}>
                            Basic Information
                        </Text>
                        <Text variant="bodyMedium" style={styles.subtitle}>
                            Let&apos;s start with your contact details
                        </Text>

                        {error ? (
                            <Surface style={styles.errorContainer} elevation={0}>
                                <Text style={styles.errorText}>{error}</Text>
                            </Surface>
                        ) : null}

                        <View style={styles.form}>
                            <TextInput
                                label="Phone Number *"
                                value={formData.phone_number}
                                onChangeText={(text) => setFormData({ ...formData, phone_number: text })}
                                mode="outlined"
                                style={styles.input}
                                keyboardType="phone-pad"
                                placeholder="e.g., 041x xxx xxx"
                                left={<TextInput.Icon icon="phone" />}
                            />

                            <Text variant="bodySmall" style={styles.helperText}>
                                We&apos;ll use this to send you shift notifications and updates
                            </Text>
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
        gap: 16,
    },
    input: {
        backgroundColor: '#fff',
    },
    helperText: {
        color: '#666',
        marginTop: -8,
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
