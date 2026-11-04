import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors as tokenColors, radius, space, touch } from '@/constants/tokens';

export default function CandidatesSkeleton() {
    return (
        <View style={styles.container}>
            {[0, 1].map((cardIndex) => (
                <View key={cardIndex} style={styles.card}>
                    <View style={styles.cardHeader}>
                        <View style={styles.headerLeft}>
                            <Skeleton width={32} height={32} borderRadius={radius.pill} />
                            <Skeleton width={120} height={16} borderRadius={radius.nested} />
                        </View>
                        <Skeleton width={32} height={20} borderRadius={radius.pill} />
                    </View>
                    <View style={styles.cardContent}>
                        <View style={styles.rowList}>
                            {[0, 1].map((rowIndex) => (
                                <View key={rowIndex} style={styles.rowCard}>
                                    <View style={styles.rowInner}>
                                        <View style={styles.infoCol}>
                                            <Skeleton width={130} height={14} borderRadius={radius.nested} />
                                            <Skeleton width={80} height={10} borderRadius={radius.nested} style={styles.mt4} />
                                        </View>
                                        <View style={styles.actionsCol}>
                                            <Skeleton width={54} height={touch.min} borderRadius={radius.control} />
                                        </View>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        gap: space.md,
        paddingVertical: space.sm,
    },
    card: {
        borderWidth: 1,
        borderColor: tokenColors.border,
        borderRadius: radius.card,
        backgroundColor: '#FFFFFF',
        elevation: 1,
        overflow: 'hidden',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: space.md,
        paddingTop: space.md,
        paddingBottom: space.xs,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
    },
    cardContent: {
        paddingHorizontal: space.md,
        paddingBottom: space.md,
        paddingTop: space.xs,
    },
    rowList: {
        gap: space.xs + 2,
    },
    rowCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: radius.nested,
        borderWidth: 1,
        borderColor: tokenColors.border,
        paddingHorizontal: space.sm,
        paddingVertical: space.xs + 2,
    },
    rowInner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: touch.min,
    },
    infoCol: {
        flex: 1,
    },
    mt4: {
        marginTop: 4,
    },
    actionsCol: {
        flexDirection: 'row',
        gap: space.xs,
    },
});
