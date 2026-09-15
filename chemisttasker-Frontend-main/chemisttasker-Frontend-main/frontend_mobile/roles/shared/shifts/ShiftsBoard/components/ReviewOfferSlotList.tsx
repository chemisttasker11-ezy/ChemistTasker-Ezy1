// ReviewOfferSlotList - Mobile React Native version
// Displays list of counter offer slots with exact web logic

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { Shift } from '@chemisttasker/shared-core';
import { formatDateLong } from '../utils/date';
import { expandOfferSlotsForDisplay } from '../utils/shift';

type ReviewOfferSlotListProps = {
    offers: any[];
    shift: Shift | null;
};

const ReviewOfferSlotList: React.FC<ReviewOfferSlotListProps> = ({ offers, shift }) => {
    if (!offers || offers.length === 0) {
        return null;
    }

    return (
        <View style={styles.container}>
            {offers.map((offer, idx) => {
                const slotsRaw = Array.isArray(offer.slots) ? offer.slots : [];
                const slots = expandOfferSlotsForDisplay(slotsRaw, shift?.slots ?? []);
                return (
                    <Card key={offer.id ?? idx} style={styles.offerCard} mode="outlined">
                        <Card.Content>
                            {slots.length > 0 ? (
                                slots.map((slot: any, slotIdx: number) => {
                                    const slotId = slot.slotId ?? slot.id;
                                    return (
                                        <Card
                                            key={slot.__displayKey ?? slotId ?? slotIdx}
                                            style={styles.slotCard}
                                            mode="outlined"
                                        >
                                            <Card.Content style={styles.slotContent}>
                                                <Text variant="bodyMedium" style={styles.slotDate}>
                                                    {slot.date ? formatDateLong(slot.date) : `Slot ${slotId ?? ''}`}
                                                </Text>
                                                <Text variant="bodySmall" style={styles.slotTime}>
                                                    {(slot.proposedStartTime || slot.startTime || '').toString().slice(0, 5)} - {(slot.proposedEndTime || slot.endTime || '').toString().slice(0, 5)}
                                                </Text>
                                                <Text variant="bodySmall" style={styles.slotRate}>
                                                    Rate: {slot.proposedRate ?? slot.rate ?? 'N/A'}
                                                </Text>
                                            </Card.Content>
                                        </Card>
                                    );
                                })
                            ) : (
                                <Text variant="bodyMedium">No slot details recorded.</Text>
                            )}
                        </Card.Content>
                    </Card>
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        gap: 16,
    },
    offerCard: {
        marginBottom: 12,
    },
    slotCard: {
        marginTop: 8,
    },
    slotContent: {
        gap: 4,
    },
    slotDate: {
        fontWeight: '600',
    },
    slotTime: {
        color: '#666',
    },
    slotRate: {
        color: '#666',
    },
});

export default ReviewOfferSlotList;
