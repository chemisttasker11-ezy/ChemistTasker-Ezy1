import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Image } from 'react-native';
import { Text, Button, Surface, Divider, List } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ProgressStepper from '../../../components/ProgressStepper';
import { useOnboarding } from './_context';
import { updateOnboarding } from '@chemisttasker/shared-core';

const ONBOARDING_STEPS = ['Basic Info', 'Role Details', 'Profile Photo', 'Review'];

export default function OwnerOnboardingReview() {
    const router = useRouter();
    const { data } = useOnboarding();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        setLoading(true);
        setError('');

        try {
            const submitData = new FormData();
            submitData.append('phone_number', data.phone_number);
            submitData.append('role', data.role);
            submitData.append('chain_pharmacy', String(data.chain_pharmacy));

            if (data.ahpra_number) {
                submitData.append('ahpra_number', data.ahpra_number);
            }

            if (data.profile_photo) {
                const filename = data.profile_photo.split('/').pop();
                const match = /\.(\w+)$/.exec(filename as string);
                const type = match ? `image/${match[1]}` : 'image/jpeg';

                submitData.append('profile_photo', {
                    uri: data.profile_photo,
                    name: filename,
                    type,
                } as any);
            }

            await updateOnboarding('owner', submitData);

            // Navigate to dashboard on success
            router.replace('/owner/dashboard');
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.detail || 'Failed to submit onboarding. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={['left', 'right']}>
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                <ProgressStepper
                    currentStep={4}
                    totalSteps={4}
                    steps={ONBOARDING_STEPS}
                />

                <Surface style={styles.content} elevation={1}>
                    <Text variant="headlineSmall" style={styles.title}>
                        Review & Submit
                    </Text>
                    <Text variant="bodyMedium" style={styles.subtitle}>
                        Please review your information before submitting
                    </Text>

                    {error ? (
                        <Surface style={styles.errorContainer} elevation={0}>
                            <Text style={styles.errorText}>{error}</Text>
                        </Surface>
                    ) : null}

                    {/* Profile Photo */}
                    {data.profile_photo && (
                        <>
                            <View style={styles.photoSection}>
                                <Image
                                    source={{ uri: data.profile_photo }}
                                    style={styles.profilePhoto}
                                />
                            </View>
                            <Divider style={styles.divider} />
                        </>
                    )}

                    {/* Basic Info */}
                    <List.Section>
                        <List.Subheader>Basic Information</List.Subheader>

                        <List.Item
                            title="Phone Number"
                            description={data.phone_number}
                            left={props => <List.Icon {...props} icon="phone" />}
                            right={props => (
                                <Button onPress={() => router.push('/owner/onboarding/step1')}>
                                    Edit
                                </Button>
                            )}
                        />
                    </List.Section>

                    <Divider style={styles.divider} />

                    {/* Role Details */}
                    <List.Section>
                        <List.Subheader>Role & Registration</List.Subheader>

                        <List.Item
                            title="Role"
                            description={data.role === 'MANAGER' ? 'Pharmacy Manager' : 'Pharmacist'}
                            left={props => <List.Icon {...props} icon="briefcase" />}
                        />

                        {data.role === 'PHARMACIST' && data.ahpra_number && (
                            <List.Item
                                title="AHPRA Number"
                                description={data.ahpra_number}
                                left={props => <List.Icon {...props} icon="certificate" />}
                            />
                        )}

                        <List.Item
                            title="Pharmacy Type"
                            description={data.chain_pharmacy ? 'Part of Chain/Group' : 'Independent Pharmacy'}
                            left={props => <List.Icon {...props} icon="store" />}
                            right={props => (
                                <Button onPress={() => router.push('/owner/onboarding/step2')}>
                                    Edit
                                </Button>
                            )}
                        />
                    </List.Section>

                    <Surface style={styles.infoBox} elevation={0}>
                        <Text variant="bodySmall" style={styles.infoText}>
                            ℹ️ After submitting, you can add your pharmacy details and start posting shifts!
                        </Text>
                    </Surface>
                </Surface>

                <View style={styles.buttonContainer}>
                    <Button
                        mode="outlined"
                        onPress={() => router.back()}
                        disabled={loading}
                        style={styles.button}
                    >
                        Back
                    </Button>

                    <Button
                        mode="contained"
                        onPress={handleSubmit}
                        loading={loading}
                        disabled={loading}
                        style={[styles.button, styles.submitButton]}
                    >
                        Submit & Continue
                    </Button>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
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
    photoSection: {
        alignItems: 'center',
        marginBottom: 16,
    },
    profilePhoto: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: '#f0f0f0',
    },
    divider: {
        marginVertical: 16,
    },
    infoBox: {
        backgroundColor: '#e3f2fd',
        padding: 16,
        borderRadius: 8,
        marginTop: 16,
    },
    infoText: {
        color: '#1976d2',
        lineHeight: 20,
    },
    buttonContainer: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
    button: {
        flex: 1,
    },
    submitButton: {
        flex: 2,
    },
});
