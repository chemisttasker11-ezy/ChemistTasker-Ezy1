import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { Text, TextInput, Button, Surface, SegmentedButtons, Menu } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DatePickerModal } from 'react-native-paper-dates';
import { getPharmacies, createShift } from '@chemisttasker/shared-core';

interface Pharmacy {
    id: number;
    name: string;
}

export default function CreateShiftScreen() {
    const router = useRouter();
    const { pharmacy_id } = useLocalSearchParams();

    const [formData, setFormData] = useState({
        pharmacy: pharmacy_id || '',
        shift_date: new Date(),
        start_time: '09:00',
        end_time: '17:00',
        role: 'PHARMACIST',
        hourly_rate: '',
        description: '',
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
    const [loadingPharmacies, setLoadingPharmacies] = useState(true);
    const [showPharmacyMenu, setShowPharmacyMenu] = useState(false);

    useEffect(() => {
        fetchPharmacies();
    }, []);

    const fetchPharmacies = async () => {
        try {
            const response = await getPharmacies({});
            const list = Array.isArray((response as any)?.results)
                ? (response as any).results
                : Array.isArray(response)
                    ? (response as any)
                    : [];
            setPharmacies(list as Pharmacy[]);
        } catch (err: any) {
            console.error('Error fetching pharmacies:', err);
        } finally {
            setLoadingPharmacies(false);
        }
    };

    const handleSubmit = async () => {
        setError('');

        if (!formData.pharmacy || !formData.hourly_rate) {
            setError('Please fill in all required fields');
            return;
        }

        setLoading(true);
        try {
            const submitData = {
                pharmacy: formData.pharmacy,
                shift_date: formData.shift_date.toISOString().split('T')[0],
                start_time: formData.start_time,
                end_time: formData.end_time,
                role: formData.role,
                hourly_rate: parseFloat(formData.hourly_rate),
                description: formData.description,
            };

            await createShift(submitData as any);

            Alert.alert(
                'Success',
                'Shift posted successfully!',
                [{ text: 'OK', onPress: () => router.back() }]
            );
        } catch (err: any) {
            const errorMsg = err.response?.data?.detail ||
                err.response?.data?.shift_date?.[0] ||
                'Failed to create shift';
            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-AU', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    };

    const selectedPharmacy = pharmacies.find(p => p.id.toString() === formData.pharmacy);

    if (loadingPharmacies) {
        return (
            <SafeAreaView style={styles.container} edges={['left', 'right']}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#1976d2" />
                </View>
            </SafeAreaView>
        );
    }

    if (pharmacies.length === 0) {
        return (
            <SafeAreaView style={styles.container} edges={['left', 'right']}>
                <Surface style={styles.errorContainer} elevation={1}>
                    <Text style={styles.errorText}>You need to add a pharmacy first</Text>
                    <Button onPress={() => router.push('/owner/pharmacies/add')}>
                        Add Pharmacy
                    </Button>
                </Surface>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['left', 'right']}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                    <Surface style={styles.header} elevation={0}>
                        <Text variant="headlineSmall" style={styles.title}>
                            Post a New Shift
                        </Text>
                        <Text variant="bodyMedium" style={styles.subtitle}>
                            Fill in the shift details
                        </Text>
                    </Surface>

                    {error ? (
                        <Surface style={styles.errorContainer} elevation={1}>
                            <Text style={styles.errorText}>{error}</Text>
                        </Surface>
                    ) : null}

                    <Surface style={styles.formContainer} elevation={1}>
                        <View style={styles.form}>
                            {/* Pharmacy */}
                            <View>
                                <Text variant="bodySmall" style={styles.label}>Pharmacy *</Text>
                                <Menu
                                    visible={showPharmacyMenu}
                                    onDismiss={() => setShowPharmacyMenu(false)}
                                    anchor={
                                        <Button
                                            mode="outlined"
                                            onPress={() => setShowPharmacyMenu(true)}
                                            icon="store"
                                            style={styles.menuButton}
                                        >
                                            {selectedPharmacy?.name || 'Select pharmacy'}
                                        </Button>
                                    }
                                >
                                    {pharmacies.map((pharmacy) => (
                                        <Menu.Item
                                            key={pharmacy.id}
                                            onPress={() => {
                                                setFormData({ ...formData, pharmacy: pharmacy.id.toString() });
                                                setShowPharmacyMenu(false);
                                            }}
                                            title={pharmacy.name}
                                        />
                                    ))}
                                </Menu>
                            </View>

                            {/* Date */}
                            <View>
                                <Text variant="bodySmall" style={styles.label}>Shift Date *</Text>
                                <Button
                                    mode="outlined"
                                    onPress={() => setShowDatePicker(true)}
                                    icon="calendar"
                                    style={styles.dateButton}
                                >
                                    {formatDate(formData.shift_date)}
                                </Button>
                            </View>

                            {/* Time */}
                            <View style={styles.timeRow}>
                                <View style={styles.timeField}>
                                    <Text variant="bodySmall" style={styles.label}>Start Time *</Text>
                                    <TextInput
                                        value={formData.start_time}
                                        onChangeText={(text) => setFormData({ ...formData, start_time: text })}
                                        mode="outlined"
                                        placeholder="09:00"
                                        style={styles.input}
                                    />
                                </View>

                                <View style={styles.timeField}>
                                    <Text variant="bodySmall" style={styles.label}>End Time *</Text>
                                    <TextInput
                                        value={formData.end_time}
                                        onChangeText={(text) => setFormData({ ...formData, end_time: text })}
                                        mode="outlined"
                                        placeholder="17:00"
                                        style={styles.input}
                                    />
                                </View>
                            </View>

                            {/* Role */}
                            <View>
                                <Text variant="bodySmall" style={styles.label}>Role Required *</Text>
                                <SegmentedButtons
                                    value={formData.role}
                                    onValueChange={(value) => setFormData({ ...formData, role: value })}
                                    buttons={[
                                        { value: 'PHARMACIST', label: 'Pharmacist' },
                                        { value: 'INTERN', label: 'Intern' },
                                        { value: 'TECHNICIAN', label: 'Technician' },
                                    ]}
                                />
                            </View>

                            {/* Rate */}
                            <TextInput
                                label="Hourly Rate (AUD) *"
                                value={formData.hourly_rate}
                                onChangeText={(text) => setFormData({ ...formData, hourly_rate: text })}
                                mode="outlined"
                                style={styles.input}
                                keyboardType="decimal-pad"
                                placeholder="45.00"
                                left={<TextInput.Icon icon="currency-usd" />}
                            />

                            {/* Description */}
                            <TextInput
                                label="Description / Requirements"
                                value={formData.description}
                                onChangeText={(text) => setFormData({ ...formData, description: text })}
                                mode="outlined"
                                style={styles.input}
                                multiline
                                numberOfLines={4}
                                placeholder="E.g., Looking for experienced pharmacist for weekend shift..."
                            />

                            <Surface style={styles.infoBox} elevation={0}>
                                <Text variant="bodySmall" style={styles.infoText}>
                                    ℹ️ Your shift will be visible to all verified pharmacists in your area
                                </Text>
                            </Surface>
                        </View>
                    </Surface>

                    <View style={styles.buttonContainer}>
                        <Button
                            mode="outlined"
                            onPress={() => router.back()}
                            disabled={loading}
                            style={styles.button}
                        >
                            Cancel
                        </Button>

                        <Button
                            mode="contained"
                            onPress={handleSubmit}
                            loading={loading}
                            disabled={loading}
                            style={[styles.button, styles.submitButton]}
                        >
                            Post Shift
                        </Button>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Date Picker */}
            <DatePickerModal
                locale="en-AU"
                mode="single"
                visible={showDatePicker}
                onDismiss={() => setShowDatePicker(false)}
                date={formData.shift_date}
                onConfirm={(params) => {
                    setShowDatePicker(false);
                    if (params.date) {
                        setFormData({ ...formData, shift_date: params.date });
                    }
                }}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
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
    header: {
        padding: 20,
        borderRadius: 8,
        backgroundColor: 'transparent',
        marginBottom: 16,
    },
    title: {
        fontWeight: 'bold',
        marginBottom: 4,
    },
    subtitle: {
        color: '#666',
    },
    errorContainer: {
        backgroundColor: '#ffebee',
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
        alignItems: 'center',
        gap: 12,
    },
    errorText: {
        color: '#c62828',
        textAlign: 'center',
    },
    formContainer: {
        padding: 20,
        borderRadius: 8,
        backgroundColor: '#fff',
        marginBottom: 16,
    },
    form: {
        gap: 20,
    },
    label: {
        marginBottom: 8,
        color: '#666',
    },
    menuButton: {
        justifyContent: 'flex-start',
    },
    dateButton: {
        justifyContent: 'flex-start',
    },
    timeRow: {
        flexDirection: 'row',
        gap: 12,
    },
    timeField: {
        flex: 1,
    },
    input: {
        backgroundColor: '#fff',
    },
    infoBox: {
        backgroundColor: '#e3f2fd',
        padding: 16,
        borderRadius: 8,
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
