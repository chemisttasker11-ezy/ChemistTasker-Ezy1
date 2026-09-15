import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ActiveShiftsPage from '@/roles/shared/shifts/ActiveShiftsPage';

export default function ShiftDetailsScreen() {
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

    return <ActiveShiftsPage shiftId={shiftId} title="Shift Details" />;
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
