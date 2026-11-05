import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ContentState } from '@/components/ui/ContentState';
import { colors, space } from '@/constants/tokens';
import ActiveShiftsPage from '@/roles/shared/shifts/ActiveShiftsPage';
import { useShiftSurface } from '@/roles/shared/shifts/useShiftSurface';
import { buildActiveShiftsScopeKey } from '@/roles/shared/shifts/ActiveShiftsPage/utils/activeShiftRuntime';

export default function ShiftDetailsScreen() {
    const { id } = useLocalSearchParams<{ id?: string }>();
    const shiftId = id ? Number(id) : null;
    const surface = useShiftSurface();

    if (!shiftId || Number.isNaN(shiftId)) {
        return (
            <SafeAreaView style={styles.container} edges={['left', 'right']}>
                <View style={styles.messageContainer}>
                    <ContentState
                        kind="empty"
                        title="Shift not found"
                        description="The requested shift ID is invalid or missing."
                    />
                </View>
            </SafeAreaView>
        );
    }

    const scopeKey = buildActiveShiftsScopeKey(surface.scopeKey, shiftId);
    return <ActiveShiftsPage key={scopeKey} shiftId={shiftId} title="Shift Details" />;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.surfaceBg,
    },
    messageContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: space.xl,
    },
});
