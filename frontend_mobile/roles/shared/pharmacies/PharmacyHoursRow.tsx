import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { styles } from './PharmacyForm.styles';

/** Visual-only extraction: callback and closed-hours behavior unchanged. */
const HoursRow = ({ label, startKey, endKey, closedKey, form, setForm, setActiveTimeField }: any) => {
    const isClosed = Boolean(closedKey && form[closedKey]);
    const toggleClosed = () => {
        if (!closedKey || !setForm) return;
        setForm((prev: any) => ({
            ...prev,
            [closedKey]: !Boolean(prev[closedKey]),
            [startKey]: !Boolean(prev[closedKey]) ? '' : prev[startKey],
            [endKey]: !Boolean(prev[closedKey]) ? '' : prev[endKey],
        }));
    };

    return (
    <View style={{ marginBottom: 16 }}>
        <View style={styles.hoursRowHeader}>
            <Text style={{ fontWeight: '600', marginBottom: 4 }}>{label}</Text>
            {closedKey ? (
                <TouchableOpacity
                    style={[styles.closedToggle, isClosed ? styles.closedToggleActive : null]}
                    onPress={toggleClosed}
                    activeOpacity={0.8}
                >
                    <MaterialCommunityIcons
                        name="block-helper"
                        size={16}
                        color={isClosed ? '#B91C1C' : '#64748B'}
                    />
                    <Text style={[styles.closedToggleText, isClosed ? styles.closedToggleTextActive : null]}>
                        Closed
                    </Text>
                </TouchableOpacity>
            ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
                style={styles.timeField}
                activeOpacity={0.85}
                disabled={isClosed}
                onPress={() => setActiveTimeField({ key: startKey, label: `${label} start time` })}
            >
                <TextInput
                    label="Start"
                    value={isClosed ? '' : form[startKey]}
                    mode="outlined"
                    style={styles.timeInput}
                    placeholder="09:00"
                    disabled={isClosed}
                    editable={false}
                    pointerEvents="none"
                    right={<TextInput.Icon icon="clock-outline" />}
                />
            </TouchableOpacity>
            <TouchableOpacity
                style={styles.timeField}
                activeOpacity={0.85}
                disabled={isClosed}
                onPress={() => setActiveTimeField({ key: endKey, label: `${label} end time` })}
            >
                <TextInput
                    label="End"
                    value={isClosed ? '' : form[endKey]}
                    mode="outlined"
                    style={styles.timeInput}
                    placeholder="17:00"
                    disabled={isClosed}
                    editable={false}
                    pointerEvents="none"
                    right={<TextInput.Icon icon="clock-outline" />}
                />
            </TouchableOpacity>
        </View>
    </View>
    );
};

export default HoursRow;
