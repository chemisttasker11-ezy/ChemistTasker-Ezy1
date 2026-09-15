// CounterOfferList Component
// Displays list of counter offers with reveal/review actions

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Surface, Text, Button } from 'react-native-paper';
import { customTheme } from '../../theme';

interface CounterOfferListProps {
    offers: any[];
    slotId: number | null;
    onOpenOffer?: (offer: any) => void;
    labelResolver?: (offer: any) => string;
    titleResolver?: (offer: any) => string;
}

export default function CounterOfferList({
    offers,
    slotId,
    onOpenOffer,
    labelResolver,
    titleResolver,
}: CounterOfferListProps) {
    const filteredOffers = slotId
        ? offers.filter(o => {
            const offerSlots = o.slots || o.offer_slots || [];
            return offerSlots.some((s: any) => (s.slot_id ?? s.slotId ?? s.slot?.id) === slotId);
        })
        : offers;

    if (filteredOffers.length === 0) {
        return (
            <Text style={styles.emptyText}>No counter offers yet.</Text>
        );
    }

    return (
        <View style={styles.container}>
            {filteredOffers.map(offer => {
                const label = labelResolver ? labelResolver(offer) : 'Review offer';
                const title = titleResolver ? titleResolver(offer) : 'Counter Offer';
                const isRevealLabel = label.toLowerCase().includes('reveal');

                return (
                    <Surface key={offer.id} style={styles.offerCard} elevation={1}>
                        <View style={styles.offerRow}>
                            <Text style={styles.offerTitle}>{title}</Text>
                            <Button
                                mode={isRevealLabel ? 'contained' : 'outlined'}
                                compact
                                onPress={() => onOpenOffer && onOpenOffer(offer)}
                                style={styles.offerButton}
                            >
                                {label}
                            </Button>
                        </View>
                    </Surface>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        gap: customTheme.spacing.sm,
        marginTop: customTheme.spacing.sm,
    },
    offerCard: {
        padding: customTheme.spacing.md,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: customTheme.colors.border,
        backgroundColor: '#fff',
    },
    offerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: customTheme.spacing.sm,
    },
    offerTitle: {
        fontSize: 14,
        color: customTheme.colors.text,
        flex: 1,
        flexShrink: 1,
    },
    offerButton: {
        alignSelf: 'flex-start',
    },
    emptyText: {
        textAlign: 'center',
        color: customTheme.colors.textMuted,
        paddingVertical: customTheme.spacing.md,
    },
});
