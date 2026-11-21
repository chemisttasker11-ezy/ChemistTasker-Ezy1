import React from 'react';
import { View, StyleSheet } from 'react-native';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { colors as tokenColors, radius, space } from '@/constants/tokens';

export default function CandidatesSkeleton() {
    return (
        <View style={styles.container}>
            <View style={styles.card}>
                <BrandLoader size={44} accessibilityLabel="Loading candidates…" />
            </View>
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
        minHeight: 140,
        alignItems: 'center',
        justifyContent: 'center',
        padding: space.xl,
    },
});
