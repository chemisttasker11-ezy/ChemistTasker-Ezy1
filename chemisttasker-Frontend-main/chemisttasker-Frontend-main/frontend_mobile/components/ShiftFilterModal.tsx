import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Modal } from 'react-native';
import { Button, Chip, TextInput, Divider, Text, IconButton } from 'react-native-paper';

export type ShiftFilters = {
    dateFrom?: string;
    dateTo?: string;
    minRate?: string;
    rateType?: 'all' | 'fixed' | 'hourly';
    suburb?: string;
    role?: 'all' | 'pharmacist' | 'intern' | 'technician';
    status?: 'all' | 'available' | 'filled';
};

type Props = {
    visible: boolean;
    filters: ShiftFilters;
    onClose: () => void;
    onApply: (filters: ShiftFilters) => void;
    onClear: () => void;
};

export function ShiftFilterModal({ visible, filters, onClose, onApply, onClear }: Props) {
    const [localFilters, setLocalFilters] = useState<ShiftFilters>(filters);

    const updateFilter = (key: keyof ShiftFilters, value: any) => {
        setLocalFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleApply = () => {
        onApply(localFilters);
        onClose();
    };

    const handleClear = () => {
        const clearedFilters: ShiftFilters = {
            rateType: 'all',
            role: 'all',
            status: 'all',
        };
        setLocalFilters(clearedFilters);
        onClear();
        onClose();
    };

    const activeFilterCount = Object.values(localFilters).filter(v =>
        v && v !== 'all' && v !== ''
    ).length;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContainer}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View>
                            <Text variant="titleLarge" style={styles.title}>Filter Shifts</Text>
                            {activeFilterCount > 0 && (
                                <Text variant="bodySmall" style={styles.subtitle}>
                                    {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
                                </Text>
                            )}
                        </View>
                        <IconButton icon="close" onPress={onClose} />
                    </View>

                    <ScrollView style={styles.content}>
                        {/* Date Range */}
                        <View style={styles.section}>
                            <Text variant="labelLarge" style={styles.sectionTitle}>📅 Date Range</Text>
                            <TextInput
                                label="From Date"
                                value={localFilters.dateFrom || ''}
                                onChangeText={(text) => updateFilter('dateFrom', text)}
                                placeholder="YYYY-MM-DD"
                                mode="outlined"
                                style={styles.input}
                                dense
                            />
                            <TextInput
                                label="To Date"
                                value={localFilters.dateTo || ''}
                                onChangeText={(text) => updateFilter('dateTo', text)}
                                placeholder="YYYY-MM-DD"
                                mode="outlined"
                                style={styles.input}
                                dense
                            />

                            {/* Quick Presets */}
                            <View style={styles.chipRow}>
                                <Chip
                                    mode={!localFilters.dateFrom ? 'flat' : 'outlined'}
                                    onPress={() => {
                                        const today = new Date().toISOString().split('T')[0];
                                        updateFilter('dateFrom', today);
                                        updateFilter('dateTo', today);
                                    }}
                                    style={styles.chip}
                                >
                                    Today
                                </Chip>
                                <Chip
                                    mode="outlined"
                                    onPress={() => {
                                        const today = new Date();
                                        const weekStart = new Date(today);
                                        weekStart.setDate(today.getDate() - today.getDay());
                                        const weekEnd = new Date(weekStart);
                                        weekEnd.setDate(weekStart.getDate() + 6);
                                        updateFilter('dateFrom', weekStart.toISOString().split('T')[0]);
                                        updateFilter('dateTo', weekEnd.toISOString().split('T')[0]);
                                    }}
                                    style={styles.chip}
                                >
                                    This Week
                                </Chip>
                            </View>
                        </View>

                        <Divider style={styles.divider} />

                        {/* Rate Filter */}
                        <View style={styles.section}>
                            <Text variant="labelLarge" style={styles.sectionTitle}>💰 Rate</Text>
                            <TextInput
                                label="Minimum Rate ($/hr)"
                                value={localFilters.minRate || ''}
                                onChangeText={(text) => updateFilter('minRate', text)}
                                placeholder="e.g., 45"
                                keyboardType="numeric"
                                mode="outlined"
                                style={styles.input}
                                dense
                            />

                            <Text variant="bodySmall" style={styles.label}>Rate Type</Text>
                            <View style={styles.chipRow}>
                                <Chip
                                    mode={localFilters.rateType === 'all' ? 'flat' : 'outlined'}
                                    selected={localFilters.rateType === 'all'}
                                    onPress={() => updateFilter('rateType', 'all')}
                                    style={styles.chip}
                                >
                                    All
                                </Chip>
                                <Chip
                                    mode={localFilters.rateType === 'fixed' ? 'flat' : 'outlined'}
                                    selected={localFilters.rateType === 'fixed'}
                                    onPress={() => updateFilter('rateType', 'fixed')}
                                    style={styles.chip}
                                >
                                    Fixed
                                </Chip>
                                <Chip
                                    mode={localFilters.rateType === 'hourly' ? 'flat' : 'outlined'}
                                    selected={localFilters.rateType === 'hourly'}
                                    onPress={() => updateFilter('rateType', 'hourly')}
                                    style={styles.chip}
                                >
                                    Hourly
                                </Chip>
                            </View>
                        </View>

                        <Divider style={styles.divider} />

                        {/* Location */}
                        <View style={styles.section}>
                            <Text variant="labelLarge" style={styles.sectionTitle}>📍 Location</Text>
                            <TextInput
                                label="Suburb"
                                value={localFilters.suburb || ''}
                                onChangeText={(text) => updateFilter('suburb', text)}
                                placeholder="e.g., Sydney, Melbourne"
                                mode="outlined"
                                style={styles.input}
                                dense
                            />
                        </View>

                        <Divider style={styles.divider} />

                        {/* Role Filter */}
                        <View style={styles.section}>
                            <Text variant="labelLarge" style={styles.sectionTitle}>👤 Role</Text>
                            <View style={styles.chipRow}>
                                <Chip
                                    mode={localFilters.role === 'all' ? 'flat' : 'outlined'}
                                    selected={localFilters.role === 'all'}
                                    onPress={() => updateFilter('role', 'all')}
                                    style={styles.chip}
                                >
                                    All
                                </Chip>
                                <Chip
                                    mode={localFilters.role === 'pharmacist' ? 'flat' : 'outlined'}
                                    selected={localFilters.role === 'pharmacist'}
                                    onPress={() => updateFilter('role', 'pharmacist')}
                                    style={styles.chip}
                                >
                                    Pharmacist
                                </Chip>
                                <Chip
                                    mode={localFilters.role === 'intern' ? 'flat' : 'outlined'}
                                    selected={localFilters.role === 'intern'}
                                    onPress={() => updateFilter('role', 'intern')}
                                    style={styles.chip}
                                >
                                    Intern
                                </Chip>
                            </View>
                        </View>

                        <Divider style={styles.divider} />

                        {/* Status Filter */}
                        <View style={styles.section}>
                            <Text variant="labelLarge" style={styles.sectionTitle}>✓ Status</Text>
                            <View style={styles.chipRow}>
                                <Chip
                                    mode={localFilters.status === 'all' ? 'flat' : 'outlined'}
                                    selected={localFilters.status === 'all'}
                                    onPress={() => updateFilter('status', 'all')}
                                    style={styles.chip}
                                >
                                    All
                                </Chip>
                                <Chip
                                    mode={localFilters.status === 'available' ? 'flat' : 'outlined'}
                                    selected={localFilters.status === 'available'}
                                    onPress={() => updateFilter('status', 'available')}
                                    style={styles.chip}
                                >
                                    Available
                                </Chip>
                                <Chip
                                    mode={localFilters.status === 'filled' ? 'flat' : 'outlined'}
                                    selected={localFilters.status === 'filled'}
                                    onPress={() => updateFilter('status', 'filled')}
                                    style={styles.chip}
                                >
                                    Filled
                                </Chip>
                            </View>
                        </View>
                    </ScrollView>

                    {/* Actions */}
                    <View style={styles.actions}>
                        <Button
                            mode="outlined"
                            onPress={handleClear}
                            style={styles.clearButton}
                        >
                            Clear All
                        </Button>
                        <Button
                            mode="contained"
                            onPress={handleApply}
                            buttonColor="#6366F1"
                            style={styles.applyButton}
                        >
                            Apply Filters
                        </Button>
                    </View>
                </View>
            </View >
        </Modal >
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '90%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    title: {
        fontWeight: 'bold',
        color: '#111827',
    },
    subtitle: {
        color: '#6366F1',
        marginTop: 4,
    },
    content: {
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    section: {
        marginBottom: 16,
    },
    sectionTitle: {
        fontWeight: '600',
        color: '#111827',
        marginBottom: 12,
    },
    label: {
        color: '#6B7280',
        marginBottom: 8,
        marginTop: 8,
    },
    input: {
        marginBottom: 8,
        backgroundColor: '#FFFFFF',
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        marginRight: 4,
        marginBottom: 4,
    },
    divider: {
        marginVertical: 16,
    },
    actions: {
        flexDirection: 'row',
        padding: 20,
        gap: 12,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
    },
    clearButton: {
        flex: 1,
        borderColor: '#6366F1',
    },
    applyButton: {
        flex: 1,
    },
});
