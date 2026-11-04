import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Text, TextInput, Button, Surface, SegmentedButtons, Menu } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DatePickerModal } from 'react-native-paper-dates';
import { Calendar, Store, Clock, DollarSign, Plus } from 'lucide-react-native';
import { getPharmacies, createShift } from '@chemisttasker/shared-core';
import { colors, radius, space, touch, type } from '@/constants/tokens';
import { ContentState } from '@/components/ui';
import { useShiftSurface } from '@/roles/shared/shifts/useShiftSurface';
import { pickScopedPharmacyId } from '@/roles/shared/shifts/PostShiftScreen.helpers';

interface Pharmacy {
    id: number;
    name: string;
}

export default function CreateShiftScreen() {
    const router = useRouter();
    const { pharmacy_id } = useLocalSearchParams<{ pharmacy_id?: string }>();

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
    const [pharmacyLoadError, setPharmacyLoadError] = useState(false);
    const [showPharmacyMenu, setShowPharmacyMenu] = useState(false);

    const surface = useShiftSurface();
    const fetchGenRef = React.useRef(0);

    const fetchPharmacies = useCallback(async () => {
        const gen = ++fetchGenRef.current;
        setLoadingPharmacies(true);
        setPharmacyLoadError(false);
        try {
            const response = await getPharmacies({});
            if (gen !== fetchGenRef.current) return;
            const list = Array.isArray((response as any)?.results)
                ? (response as any).results
                : Array.isArray(response)
                    ? (response as any)
                    : [];
            setPharmacies(list as Pharmacy[]);
            setFormData((prev) => {
                const picked = pickScopedPharmacyId({
                    routePharmacyId: pharmacy_id,
                    scopedPharmacyId: surface.scopedPharmacyId,
                    currentPharmacyId: prev.pharmacy,
                    pharmacies: list,
                });
                return picked !== '' ? { ...prev, pharmacy: String(picked) } : prev;
            });
        } catch {
            if (gen === fetchGenRef.current) {
                setPharmacyLoadError(true);
            }
        } finally {
            if (gen === fetchGenRef.current) {
                setLoadingPharmacies(false);
            }
        }
    }, [pharmacy_id, surface.scopedPharmacyId]);

    useEffect(() => {
        void fetchPharmacies();
    }, [fetchPharmacies]);

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
            year: 'numeric',
        });
    };

    const selectedPharmacy = pharmacies.find(p => p.id.toString() === formData.pharmacy);

    if (loadingPharmacies) {
        return (
            <SafeAreaView style={styles.container} edges={['left', 'right']}>
                <ContentState kind="loading" title="Loading pharmacies…" />
            </SafeAreaView>
        );
    }

    if (pharmacyLoadError) {
        return (
            <SafeAreaView style={styles.container} edges={['left', 'right']}>
                <ContentState
                    kind="error"
                    title="Could not load pharmacies"
                    description="Check your network and try again."
                    actionLabel="Try again"
                    onAction={fetchPharmacies}
                />
            </SafeAreaView>
        );
    }

    if (pharmacies.length === 0) {
        return (
            <SafeAreaView style={styles.container} edges={['left', 'right']}>
                <ContentState
                    kind="empty"
                    title="You need to add a pharmacy first"
                    description="Before posting a shift, add at least one pharmacy to your account."
                    actionLabel="Add Pharmacy"
                    onAction={() => router.push('/owner/pharmacies/add' as any)}
                />
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
                    <View style={styles.header}>
                        <Text style={styles.title} accessibilityRole="header">
                            Post a New Shift
                        </Text>
                        <Text style={styles.subtitle}>
                            Fill in the shift details to notify matching candidates.
                        </Text>
                    </View>

                    {error ? (
                        <Surface style={styles.errorContainer} elevation={0}>
                            <Text style={styles.errorText}>{error}</Text>
                        </Surface>
                    ) : null}

                    <Surface style={styles.formContainer} elevation={0}>
                        <View style={styles.form}>
                            {/* Pharmacy */}
                            <View style={styles.fieldGroup}>
                                <Text style={styles.label}>Pharmacy *</Text>
                                <Menu
                                    visible={showPharmacyMenu}
                                    onDismiss={() => setShowPharmacyMenu(false)}
                                    anchor={
                                        <Button
                                            mode="outlined"
                                            onPress={() => setShowPharmacyMenu(true)}
                                            icon={({ size, color }) => <Store size={size} color={color} />}
                                            style={styles.menuButton}
                                            contentStyle={styles.buttonContent}
                                            textColor={colors.textPrimary}
                                        >
                                            {selectedPharmacy?.name || 'Select pharmacy'}
                                        </Button>
                                    }
                                >
                                    {pharmacies.map((pharmacy) => (
                                        <Menu.Item
                                            key={pharmacy.id}
                                            onPress={() => {
                                                setFormData((prev) => ({ ...prev, pharmacy: pharmacy.id.toString() }));
                                                setShowPharmacyMenu(false);
                                            }}
                                            title={pharmacy.name}
                                        />
                                    ))}
                                </Menu>
                            </View>

                            {/* Date */}
                            <View style={styles.fieldGroup}>
                                <Text style={styles.label}>Shift Date *</Text>
                                <Button
                                    mode="outlined"
                                    onPress={() => setShowDatePicker(true)}
                                    icon={({ size, color }) => <Calendar size={size} color={color} />}
                                    style={styles.dateButton}
                                    contentStyle={styles.buttonContent}
                                    textColor={colors.textPrimary}
                                >
                                    {formatDate(formData.shift_date)}
                                </Button>
                            </View>

                            {/* Time */}
                            <View style={styles.timeRow}>
                                <View style={styles.timeField}>
                                    <Text style={styles.label}>Start Time *</Text>
                                    <TextInput
                                        value={formData.start_time}
                                        onChangeText={(text) => setFormData((prev) => ({ ...prev, start_time: text }))}
                                        mode="outlined"
                                        placeholder="09:00"
                                        style={styles.input}
                                        outlineColor={colors.border}
                                        activeOutlineColor={colors.primary}
                                        left={<TextInput.Icon icon={({ size, color }) => <Clock size={size} color={color} />} />}
                                    />
                                </View>

                                <View style={styles.timeField}>
                                    <Text style={styles.label}>End Time *</Text>
                                    <TextInput
                                        value={formData.end_time}
                                        onChangeText={(text) => setFormData((prev) => ({ ...prev, end_time: text }))}
                                        mode="outlined"
                                        placeholder="17:00"
                                        style={styles.input}
                                        outlineColor={colors.border}
                                        activeOutlineColor={colors.primary}
                                        left={<TextInput.Icon icon={({ size, color }) => <Clock size={size} color={color} />} />}
                                    />
                                </View>
                            </View>

                            {/* Role */}
                            <View style={styles.fieldGroup}>
                                <Text style={styles.label}>Role Required *</Text>
                                <SegmentedButtons
                                    value={formData.role}
                                    onValueChange={(value) => setFormData((prev) => ({ ...prev, role: value }))}
                                    style={{ minHeight: touch.min }}
                                    buttons={[
                                        {
                                            value: 'PHARMACIST',
                                            label: 'Pharmacist',
                                            style: { minHeight: touch.min },
                                            labelStyle: { minHeight: touch.min, textAlignVertical: 'center', lineHeight: touch.min },
                                        },
                                        {
                                            value: 'INTERN',
                                            label: 'Intern',
                                            style: { minHeight: touch.min },
                                            labelStyle: { minHeight: touch.min, textAlignVertical: 'center', lineHeight: touch.min },
                                        },
                                        {
                                            value: 'TECHNICIAN',
                                            label: 'Technician',
                                            style: { minHeight: touch.min },
                                            labelStyle: { minHeight: touch.min, textAlignVertical: 'center', lineHeight: touch.min },
                                        },
                                    ]}
                                />
                            </View>

                            {/* Rate */}
                            <View style={styles.fieldGroup}>
                                <Text style={styles.label}>Hourly Rate (AUD) *</Text>
                                <TextInput
                                    value={formData.hourly_rate}
                                    onChangeText={(text) => setFormData((prev) => ({ ...prev, hourly_rate: text }))}
                                    mode="outlined"
                                    style={styles.input}
                                    outlineColor={colors.border}
                                    activeOutlineColor={colors.primary}
                                    keyboardType="decimal-pad"
                                    placeholder="45.00"
                                    left={<TextInput.Icon icon={({ size, color }) => <DollarSign size={size} color={color} />} />}
                                />
                            </View>

                            {/* Description */}
                            <View style={styles.fieldGroup}>
                                <Text style={styles.label}>Description / Requirements</Text>
                                <TextInput
                                    value={formData.description}
                                    onChangeText={(text) => setFormData((prev) => ({ ...prev, description: text }))}
                                    mode="outlined"
                                    style={styles.input}
                                    outlineColor={colors.border}
                                    activeOutlineColor={colors.primary}
                                    multiline
                                    numberOfLines={4}
                                    placeholder="E.g., Looking for experienced pharmacist for weekend shift..."
                                />
                            </View>

                            <Surface style={styles.infoBox} elevation={0}>
                                <Text style={styles.infoText}>
                                    Your shift will be visible to all verified candidates matching your criteria.
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
                            contentStyle={styles.actionContent}
                            textColor={colors.textPrimary}
                        >
                            Cancel
                        </Button>

                        <Button
                            mode="contained"
                            onPress={handleSubmit}
                            loading={loading}
                            disabled={loading}
                            icon={({ size, color }) => <Plus size={size} color={color} />}
                            style={[styles.button, styles.submitButton]}
                            contentStyle={styles.actionContent}
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
                        setFormData((prev) => ({ ...prev, shift_date: params.date as Date }));
                    }
                }}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.pageBg,
    },
    keyboardView: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: space.md,
        paddingBottom: space['2xl'],
    },
    header: {
        paddingVertical: space.md,
        marginBottom: space.sm,
    },
    title: {
        fontSize: type.titleMedium.fontSize,
        lineHeight: type.titleMedium.lineHeight,
        fontFamily: type.titleMedium.fontFamily,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: space.xxs,
    },
    subtitle: {
        fontSize: type.bodySmall.fontSize,
        lineHeight: type.bodySmall.lineHeight,
        fontFamily: type.bodySmall.fontFamily,
        color: colors.textSecondary,
    },
    errorContainer: {
        backgroundColor: colors.status.red.bg,
        borderColor: colors.status.red.fg,
        borderWidth: 1,
        padding: space.md,
        borderRadius: radius.control,
        marginBottom: space.md,
        alignItems: 'center',
    },
    errorText: {
        color: colors.status.red.fg,
        fontSize: type.bodySmall.fontSize,
        textAlign: 'center',
        fontWeight: '600',
    },
    formContainer: {
        padding: space.lg,
        borderRadius: radius.card,
        backgroundColor: colors.surfaceBg,
        borderColor: colors.border,
        borderWidth: 1,
        marginBottom: space.md,
    },
    form: {
        gap: space.md,
    },
    fieldGroup: {
        gap: space.xxs,
    },
    label: {
        fontSize: type.labelSmall.fontSize,
        fontWeight: '600',
        color: colors.textSecondary,
        marginBottom: space.xxs,
    },
    menuButton: {
        justifyContent: 'flex-start',
        borderColor: colors.border,
        borderRadius: radius.control,
    },
    dateButton: {
        justifyContent: 'flex-start',
        borderColor: colors.border,
        borderRadius: radius.control,
    },
    buttonContent: {
        minHeight: touch.min,
        justifyContent: 'flex-start',
    },
    timeRow: {
        flexDirection: 'row',
        gap: space.md,
    },
    timeField: {
        flex: 1,
        gap: space.xxs,
    },
    input: {
        backgroundColor: colors.surfaceBg,
    },
    infoBox: {
        backgroundColor: colors.tone.cyan.bg,
        borderColor: colors.tone.cyan.fg,
        borderWidth: 1,
        padding: space.md,
        borderRadius: radius.control,
    },
    infoText: {
        color: colors.tone.cyan.fg,
        fontSize: type.bodySmall.fontSize,
        lineHeight: 20,
    },
    buttonContainer: {
        flexDirection: 'row',
        gap: space.md,
        marginTop: space.sm,
    },
    button: {
        flex: 1,
        borderRadius: radius.control,
    },
    submitButton: {
        flex: 2,
        backgroundColor: colors.primary,
    },
    actionContent: {
        minHeight: touch.min,
    },
});
