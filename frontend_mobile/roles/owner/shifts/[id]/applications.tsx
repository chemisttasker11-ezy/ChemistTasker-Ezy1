import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ActiveShiftsPage from '@/roles/shared/shifts/ActiveShiftsPage';

/**
 * Backward-compatible owner route.
 *
 * Candidate review is owned by ActiveShiftsPage, which is the mobile counterpart
 * of the web Active Shifts flow. Keeping this route as a thin alias prevents a
 * second candidate implementation from drifting away from the canonical
 * ShiftInterest/member-status/offer workflows.
 */
export default function ShiftApplicationsRoute() {
    const { id } = useLocalSearchParams<{ id?: string }>();
    const shiftId = id ? Number(id) : null;

    if (!shiftId || Number.isNaN(shiftId)) {
        return (
            <SafeAreaView style={styles.container} edges={['left', 'right']}>
                <View style={styles.messageContainer}>
                    <Text variant="bodyMedium">Shift not found.</Text>
                </View>
            </SafeAreaView>
        );
    }

    return <ActiveShiftsPage shiftId={shiftId} title="Candidate Responses" />;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f6fa',
    },
    messageContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
});
