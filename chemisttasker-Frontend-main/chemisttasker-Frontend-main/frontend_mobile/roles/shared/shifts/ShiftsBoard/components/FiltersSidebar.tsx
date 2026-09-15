// FiltersSidebar - Mobile React Native version
// Complete filter UI with exact web logic adapted for mobile

import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Checkbox, TextInput, Button, IconButton, Chip } from 'react-native-paper';
import Slider from '@react-native-community/slider';
import { FILTER_SECTIONS } from '../constants';
import { FilterConfig } from '../types';

type FiltersSidebarProps = {
    filterConfig: FilterConfig;
    setFilterConfig: React.Dispatch<React.SetStateAction<FilterConfig>>;
    roleOptions: string[];
    locationGroups: Record<string, Set<string>>;
    expandedStates: Record<string, boolean>;
    toggleStateExpand: (state: string) => void;
    toggleStateSelection: (cities: string[]) => void;
    toggleFilter: (key: keyof FilterConfig, value: string) => void;
    toggleBooleanFilter: (key: keyof FilterConfig) => void;
};

const FiltersSidebar: React.FC<FiltersSidebarProps> = ({
    filterConfig,
    setFilterConfig,
    roleOptions,
    locationGroups,
    expandedStates,
    toggleStateExpand,
    toggleStateSelection,
    toggleFilter,
    toggleBooleanFilter,
}) => {
    const renderSection = (title: string, content: React.ReactNode) => (
        <View style={styles.section}>
            <Text variant="labelLarge" style={styles.sectionTitle}>{title}</Text>
            {content}
        </View>
    );

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <TextInput
                mode="outlined"
                placeholder="Search pharmacy, role..."
                value={filterConfig.search}
                onChangeText={(value) => setFilterConfig((prev) => ({ ...prev, search: value }))}
                left={<TextInput.Icon icon="magnify" />}
                style={styles.searchInput}
                dense
            />

            <View style={styles.urgentRow}>
                <Checkbox
                    status={filterConfig.onlyUrgent ? 'checked' : 'unchecked'}
                    onPress={() => toggleBooleanFilter('onlyUrgent')}
                />
                <Text variant="bodyMedium">Urgent only</Text>
            </View>

            {renderSection(
                FILTER_SECTIONS.roles,
                <View style={styles.checkboxList}>
                    {roleOptions.map((role) => (
                        <View key={role} style={styles.checkboxRow}>
                            <Checkbox
                                status={filterConfig.roles.includes(role) ? 'checked' : 'unchecked'}
                                onPress={() => toggleFilter('roles', role)}
                            />
                            <Text variant="bodyMedium">{role}</Text>
                        </View>
                    ))}
                </View>
            )}

            {renderSection(
                FILTER_SECTIONS.dateRange,
                <View style={styles.dateRange}>
                    <TextInput
                        mode="outlined"
                        label="From"
                        value={filterConfig.dateRange.start}
                        onChangeText={(value) =>
                            setFilterConfig((prev) => ({
                                ...prev,
                                dateRange: { ...prev.dateRange, start: value },
                            }))
                        }
                        placeholder="YYYY-MM-DD"
                        style={styles.dateInput}
                        dense
                    />
                    <TextInput
                        mode="outlined"
                        label="To"
                        value={filterConfig.dateRange.end}
                        onChangeText={(value) =>
                            setFilterConfig((prev) => ({
                                ...prev,
                                dateRange: { ...prev.dateRange, end: value },
                            }))
                        }
                        placeholder="YYYY-MM-DD"
                        style={styles.dateInput}
                        dense
                    />
                </View>
            )}

            {renderSection(
                FILTER_SECTIONS.perks,
                <View style={styles.checkboxList}>
                    <View style={styles.checkboxRow}>
                        <Checkbox
                            status={filterConfig.bulkShiftsOnly ? 'checked' : 'unchecked'}
                            onPress={() => toggleBooleanFilter('bulkShiftsOnly')}
                        />
                        <Text variant="bodyMedium">Bulk shifts (1 week+)</Text>
                    </View>
                    <View style={styles.checkboxRow}>
                        <Checkbox
                            status={filterConfig.negotiableOnly ? 'checked' : 'unchecked'}
                            onPress={() => toggleBooleanFilter('negotiableOnly')}
                        />
                        <Text variant="bodyMedium">Negotiable rate</Text>
                    </View>
                    <View style={styles.checkboxRow}>
                        <Checkbox
                            status={filterConfig.flexibleOnly ? 'checked' : 'unchecked'}
                            onPress={() => toggleBooleanFilter('flexibleOnly')}
                        />
                        <Text variant="bodyMedium">Flexible hours</Text>
                    </View>
                    <View style={styles.checkboxRow}>
                        <Checkbox
                            status={filterConfig.travelProvided ? 'checked' : 'unchecked'}
                            onPress={() => toggleBooleanFilter('travelProvided')}
                        />
                        <Text variant="bodyMedium">Travel paid</Text>
                    </View>
                    <View style={styles.checkboxRow}>
                        <Checkbox
                            status={filterConfig.accommodationProvided ? 'checked' : 'unchecked'}
                            onPress={() => toggleBooleanFilter('accommodationProvided')}
                        />
                        <Text variant="bodyMedium">Accommodation</Text>
                    </View>
                </View>
            )}

            {renderSection(
                FILTER_SECTIONS.employment,
                <View style={styles.checkboxList}>
                    {[
                        { id: 'FULL_TIME', label: 'Full-time' },
                        { id: 'PART_TIME', label: 'Part-time' },
                        { id: 'LOCUM', label: 'Locum' },
                    ].map((item) => (
                        <View key={item.id} style={styles.checkboxRow}>
                            <Checkbox
                                status={filterConfig.employmentTypes.includes(item.id) ? 'checked' : 'unchecked'}
                                onPress={() => toggleFilter('employmentTypes', item.id)}
                            />
                            <Text variant="bodyMedium">{item.label}</Text>
                        </View>
                    ))}
                </View>
            )}

            {renderSection(
                FILTER_SECTIONS.locations,
                <View>
                    {Object.entries(locationGroups).map(([state, citiesSet]) => {
                        const cities = Array.from(citiesSet).sort();
                        const isExpanded = !!expandedStates[state];
                        const allSelected = cities.every((city) => filterConfig.city.includes(city));
                        const someSelected = cities.some((city) => filterConfig.city.includes(city));

                        return (
                            <View key={state} style={styles.stateSection}>
                                <View style={styles.stateHeader}>
                                    <View style={styles.checkboxRow}>
                                        <Checkbox
                                            status={allSelected ? 'checked' : someSelected ? 'indeterminate' : 'unchecked'}
                                            onPress={() => toggleStateSelection(cities)}
                                        />
                                        <Text variant="titleSmall">{state}</Text>
                                    </View>
                                    <IconButton
                                        icon={isExpanded ? 'chevron-up' : 'chevron-down'}
                                        size={20}
                                        onPress={() => toggleStateExpand(state)}
                                    />
                                </View>
                                {isExpanded && (
                                    <View style={styles.citiesList}>
                                        {cities.map((city) => (
                                            <View key={city} style={styles.checkboxRow}>
                                                <Checkbox
                                                    status={filterConfig.city.includes(city) ? 'checked' : 'unchecked'}
                                                    onPress={() => toggleFilter('city', city)}
                                                />
                                                <Text variant="bodyMedium">{city}</Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        );
                    })}
                </View>
            )}

            {renderSection(
                FILTER_SECTIONS.timeOfDay,
                <View style={styles.chipRow}>
                    {[
                        { id: 'morning', label: 'Morning' },
                        { id: 'afternoon', label: 'Afternoon' },
                        { id: 'evening', label: 'Evening' },
                    ].map((entry) => {
                        const active = filterConfig.timeOfDay.includes(entry.id as 'morning' | 'afternoon' | 'evening');
                        return (
                            <Chip
                                key={entry.id}
                                selected={active}
                                onPress={() => toggleFilter('timeOfDay', entry.id)}
                                style={styles.chip}
                            >
                                {entry.label}
                            </Chip>
                        );
                    })}
                </View>
            )}

            {renderSection(
                `${FILTER_SECTIONS.minRate}: $${filterConfig.minRate}/hr`,
                <View style={styles.sliderContainer}>
                    <Slider
                        style={styles.slider}
                        minimumValue={0}
                        maximumValue={100}
                        step={5}
                        value={filterConfig.minRate}
                        onValueChange={(value) => setFilterConfig((prev) => ({ ...prev, minRate: value }))}
                        minimumTrackTintColor="#6200ee"
                        maximumTrackTintColor="#ccc"
                    />
                    <View style={styles.sliderLabels}>
                        <Text variant="bodySmall" style={styles.sliderLabel}>Any</Text>
                        <Text variant="bodySmall" style={styles.sliderLabel}>$100+</Text>
                    </View>
                </View>
            )}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        padding: 16,
    },
    searchInput: {
        marginBottom: 16,
    },
    urgentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    section: {
        marginBottom: 20,
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    sectionTitle: {
        marginBottom: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
        color: '#666',
    },
    checkboxList: {
        gap: 8,
    },
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dateRange: {
        gap: 12,
    },
    dateInput: {
        marginBottom: 8,
    },
    stateSection: {
        marginBottom: 12,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    stateHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    citiesList: {
        paddingLeft: 24,
        gap: 8,
        marginTop: 8,
    },
    chipRow: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
    },
    chip: {
        marginRight: 4,
    },
    sliderContainer: {
        paddingHorizontal: 4,
    },
    slider: {
        width: '100%',
        height: 40,
    },
    sliderLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: -8,
    },
    sliderLabel: {
        color: '#666',
    },
});

export default FiltersSidebar;
