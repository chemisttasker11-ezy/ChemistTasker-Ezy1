import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Image, Alert } from 'react-native';
import { Text, Button, Surface, IconButton } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import ProgressStepper from '../../../components/ProgressStepper';
import { useOnboarding } from './_context';

const ONBOARDING_STEPS = ['Basic Info', 'Role Details', 'Profile Photo', 'Review'];

export default function OwnerOnboardingStep3() {
    const router = useRouter();
    const { data, updateData } = useOnboarding();

    const [profilePhoto, setProfilePhoto] = useState<string | null>(data.profile_photo || null);
    const loading = false;
    const imageMediaTypes = (ImagePicker as any).MediaType?.Images ?? ImagePicker.MediaTypeOptions.Images;

    const pickImage = async () => {
        // Request permission
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (status !== 'granted') {
            Alert.alert(
                'Permission Required',
                'Sorry, we need camera roll permissions to upload a profile photo.',
                [{ text: 'OK' }]
            );
            return;
        }

        // Pick image
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: imageMediaTypes,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (!result.canceled) {
            setProfilePhoto(result.assets[0].uri);
        }
    };

    const takePhoto = async () => {
        // Request permission
        const { status } = await ImagePicker.requestCameraPermissionsAsync();

        if (status !== 'granted') {
            Alert.alert(
                'Permission Required',
                'Sorry, we need camera permissions to take a photo.',
                [{ text: 'OK' }]
            );
            return;
        }

        // Take photo
        const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (!result.canceled) {
            setProfilePhoto(result.assets[0].uri);
        }
    };

    const handleNext = async () => {
        // Save to context
        updateData({ profile_photo: profilePhoto });
        router.push('/owner/onboarding/review');
    };

    return (
        <SafeAreaView style={styles.container} edges={['left', 'right']}>
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                <ProgressStepper
                    currentStep={3}
                    totalSteps={4}
                    steps={ONBOARDING_STEPS}
                />

                <Surface style={styles.content} elevation={1}>
                    <Text variant="headlineSmall" style={styles.title}>
                        Profile Photo
                    </Text>
                    <Text variant="bodyMedium" style={styles.subtitle}>
                        Add a professional photo (optional but recommended)
                    </Text>

                    <View style={styles.photoContainer}>
                        {profilePhoto ? (
                            <View style={styles.photoPreview}>
                                <Image source={{ uri: profilePhoto }} style={styles.photo} />
                                <IconButton
                                    icon="close-circle"
                                    size={32}
                                    style={styles.removeButton}
                                    onPress={() => setProfilePhoto(null)}
                                />
                            </View>
                        ) : (
                            <View style={styles.placeholderContainer}>
                                <IconButton
                                    icon="account-circle"
                                    size={100}
                                    iconColor="#ccc"
                                />
                                <Text variant="bodyMedium" style={styles.placeholderText}>
                                    No photo selected
                                </Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.buttonGroup}>
                        <Button
                            mode="outlined"
                            onPress={takePhoto}
                            icon="camera"
                            style={styles.photoButton}
                        >
                            Take Photo
                        </Button>

                        <Button
                            mode="outlined"
                            onPress={pickImage}
                            icon="image"
                            style={styles.photoButton}
                        >
                            Choose from Gallery
                        </Button>
                    </View>

                    <Text variant="bodySmall" style={styles.helperText}>
                        A professional photo helps build trust with pharmacists. You can always update this later.
                    </Text>
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
                        {profilePhoto ? 'Next' : 'Skip for Now'}
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
    photoContainer: {
        alignItems: 'center',
        marginBottom: 24,
    },
    photoPreview: {
        position: 'relative',
    },
    photo: {
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: '#f0f0f0',
    },
    removeButton: {
        position: 'absolute',
        top: -8,
        right: -8,
        backgroundColor: '#fff',
        borderRadius: 16,
    },
    placeholderContainer: {
        alignItems: 'center',
        padding: 20,
    },
    placeholderText: {
        color: '#999',
        marginTop: 8,
    },
    buttonGroup: {
        gap: 12,
        marginBottom: 16,
    },
    photoButton: {
        borderRadius: 8,
    },
    helperText: {
        color: '#666',
        textAlign: 'center',
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
