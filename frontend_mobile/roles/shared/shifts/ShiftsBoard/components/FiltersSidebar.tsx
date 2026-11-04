// FiltersSidebar - Mobile React Native version
// Complete filter UI with exact web logic adapted for mobile

import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { ChevronDown, ChevronUp, MinusSquare, Square, SquareCheck } from 'lucide-react-native';
import Slider from '@react-native-community/slider';
import { Pill, ScalePressable, TextField } from '@/components/ui';
import { colors, font, space, touch, type } from '@/constants/tokens';
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

const CheckItem = ({ label, checked, indeterminate = false, onPress }: { label: string; checked: boolean; indeterminate?: boolean; onPress: () => void }) => (
    <ScalePressable static pressBg haptic="selection" onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: indeterminate ? 'mixed' : checked }} accessibilityLabel={label} style={styles.checkboxRow}>
        {checked ? <SquareCheck size={20} color={colors.accentStrong} strokeWidth={2} /> : indeterminate ? <MinusSquare size={20} color={colors.accentStrong} strokeWidth={2} /> : <Square size={20} color={colors.textSecondary} strokeWidth={2} />}
        <Text style={styles.checkboxLabel}>{label}</Text>
    </ScalePressable>
);

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
            <Text style={styles.sectionTitle}>{title}</Text>
            {content}
        </View>
    );

    return (
        // The filter sheet (BottomSheet) scrolls; a nested ScrollView here would fight it.
        <View style={styles.content}>
            <TextField
                label="Search"
                placeholder="Search pharmacy, role..."
                value={filterConfig.search}
                onChangeText={(value) => setFilterConfig((prev) => ({ ...prev, search: value }))}
            />

            <CheckItem label="Urgent only" checked={filterConfig.onlyUrgent} onPress={() => toggleBooleanFilter('onlyUrgent')} />

            {renderSection(
                FILTER_SECTIONS.roles,
                <View style={styles.checkboxList}>
                    {roleOptions.map((role) => (
                        <CheckItem key={role} label={role} checked={filterConfig.roles.includes(role)} onPress={() => toggleFilter('roles', role)} />
                    ))}
                </View>
            )}

            {renderSection(
                FILTER_SECTIONS.dateRange,
                <View style={styles.dateRange}>
                    <TextField
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
                    />
                    <TextField
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
                    />
                </View>
            )}

            {renderSection(
                FILTER_SECTIONS.perks,
                <View style={styles.checkboxList}>
                    <CheckItem label="Bulk shifts (1 week+)" checked={filterConfig.bulkShiftsOnly} onPress={() => toggleBooleanFilter('bulkShiftsOnly')} />
                    <CheckItem label="Negotiable rate" checked={filterConfig.negotiableOnly} onPress={() => toggleBooleanFilter('negotiableOnly')} />
                    <CheckItem label="Flexible hours" checked={filterConfig.flexibleOnly} onPress={() => toggleBooleanFilter('flexibleOnly')} />
                    <CheckItem label="Travel paid" checked={filterConfig.travelProvided} onPress={() => toggleBooleanFilter('travelProvided')} />
                    <CheckItem label="Accommodation" checked={filterConfig.accommodationProvided} onPress={() => toggleBooleanFilter('accommodationProvided')} />
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
                        <CheckItem key={item.id} label={item.label} checked={filterConfig.employmentTypes.includes(item.id)} onPress={() => toggleFilter('employmentTypes', item.id)} />
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
                                    <CheckItem label={state} checked={allSelected} indeterminate={!allSelected && someSelected} onPress={() => toggleStateSelection(cities)} />
                                    <ScalePressable static pressBg haptic="selection" onPress={() => toggleStateExpand(state)} accessibilityRole="button" accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} ${state}`} style={styles.expandBtn}>
                                        {isExpanded ? <ChevronUp size={20} color={colors.textSecondary} strokeWidth={2} /> : <ChevronDown size={20} color={colors.textSecondary} strokeWidth={2} />}
                                    </ScalePressable>
                                </View>
                                {isExpanded && (
                                    <View style={styles.citiesList}>
                                        {cities.map((city) => (
                                            <CheckItem key={city} label={city} checked={filterConfig.city.includes(city)} onPress={() => toggleFilter('city', city)} />
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
                            <Pill key={entry.id} label={entry.label} selected={active} tone="violet" onPress={() => toggleFilter('timeOfDay', entry.id)} />
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
                        minimumTrackTintColor={colors.primary}
                        maximumTrackTintColor={colors.border}
                        thumbTintColor={colors.primary}
                    />
                    <View style={styles.sliderLabels}>
                        <Text style={styles.sliderLabel}>Any</Text>
                        <Text style={styles.sliderLabel}>$100+</Text>
                    </View>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    content: { paddingVertical: space.md, gap: space.md },
    section: { paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.border, gap: space.sm },
    sectionTitle: { fontFamily: font.outfit.medium, fontSize: type.titleSmall.fontSize, lineHeight: type.titleSmall.lineHeight, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
    checkboxList: { gap: space.xxs },
    checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: touch.min, paddingVertical: space.xxs },
    checkboxLabel: { fontFamily: font.inter.regular, fontSize: type.bodyMedium.fontSize, lineHeight: type.bodyMedium.lineHeight, color: colors.textPrimary },
    dateRange: { flexDirection: 'row', gap: space.sm },
    dateInput: { flex: 1 },
    stateSection: { paddingBottom: space.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
    stateHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    expandBtn: { width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center' },
    citiesList: { paddingLeft: space.xl, gap: space.xxs },
    chipRow: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
    sliderContainer: { paddingHorizontal: space.xxs },
    slider: { width: '100%', height: touch.min },
    sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -space.xs },
    sliderLabel: { fontFamily: font.inter.regular, fontSize: type.bodySmall.fontSize, lineHeight: type.bodySmall.lineHeight, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
});

export default FiltersSidebar;
