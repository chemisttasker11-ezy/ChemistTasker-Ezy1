// ReviewCounterOfferDialog - Mobile React Native version
// Dialog for reviewing counter offer details

import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Shift } from '@chemisttasker/shared-core';
import { BottomSheet, Button, ContentState } from '@/components/ui';
import { colors, font, radius, space, type } from '@/constants/tokens';
import { useReviewOfferDisplay } from '../hooks/useReviewOfferDisplay';
import { formatDateLong } from '../utils/date';
import { expandOfferSlotsForDisplay } from '../utils/shift';

type ReviewCounterOfferDialogProps = {
    visible: boolean;
    onDismiss: () => void;
    reviewLoading: boolean;
    reviewError: boolean;
    onRetry: () => void;
    reviewOfferShiftId: number | null;
    reviewOffers: any[];
    shifts: Shift[];
};

const ReviewCounterOfferDialog: React.FC<ReviewCounterOfferDialogProps> = ({
    visible,
    onDismiss,
    reviewLoading,
    reviewError,
    onRetry,
    reviewOfferShiftId,
    reviewOffers,
    shifts,
}) => {
    const { shift, offers, hasOffers } = useReviewOfferDisplay({
        reviewOfferShiftId,
        reviewOffers,
        shifts,
    });

    return (
        <BottomSheet
            open={visible}
            onClose={onDismiss}
            title="Counter Offer Details"
            footer={<Button label="Close" variant="outlined" onPress={onDismiss} />}
        >
            <View style={styles.content}>
                {reviewLoading ? (
                    <ContentState kind="loading" compact style={styles.state} />
                ) : reviewOfferShiftId != null ? (
                    reviewError ? (
                        <ContentState kind="error" compact title="Counter offers could not load" description="Check your connection, then try again." actionLabel="Try again" onAction={onRetry} />
                    ) : hasOffers ? (
                        <View style={styles.list}>
                            {offers.map((offer, idx) => {
                                const slots = expandOfferSlotsForDisplay(Array.isArray(offer.slots) ? offer.slots : [], shift?.slots ?? []);
                                return (
                                    <View key={offer.id ?? idx} style={styles.offerCard}>
                                        {slots.length > 0 ? slots.map((slot: any, slotIdx: number) => {
                                            const slotId = slot.slotId ?? slot.id;
                                            return (
                                                <View key={slot.__displayKey ?? slotId ?? slotIdx} style={styles.slotCard}>
                                                    <Text style={styles.slotDate}>{slot.date ? formatDateLong(slot.date) : `Slot ${slotId ?? ''}`}</Text>
                                                    <Text style={styles.slotMeta}>{(slot.proposedStartTime || slot.startTime || '').toString().slice(0, 5)} - {(slot.proposedEndTime || slot.endTime || '').toString().slice(0, 5)}</Text>
                                                    <Text style={styles.slotMeta}>Rate: {slot.proposedRate ?? slot.rate ?? 'N/A'}</Text>
                                                </View>
                                            );
                                        }) : <Text style={styles.slotMeta}>No slot details recorded.</Text>}
                                    </View>
                                );
                            })}
                        </View>
                    ) : (
                        <ContentState kind="empty" compact title="No counter offers on this shift" />
                    )
                ) : null}
            </View>
        </BottomSheet>
    );
};

const styles = StyleSheet.create({
    content: { paddingVertical: space.md, gap: space.md },
    state: { paddingVertical: space.md },
    list: { gap: space.md },
    offerCard: { borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceBg, padding: space.md, gap: space.sm },
    slotCard: { borderRadius: radius.nested, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.subtleBg, padding: space.md, gap: space.xxs },
    slotDate: { fontFamily: font.inter.semiBold, fontSize: type.bodyMedium.fontSize, lineHeight: type.bodyMedium.lineHeight, color: colors.textPrimary },
    slotMeta: { fontFamily: font.inter.regular, fontSize: type.bodySmall.fontSize, lineHeight: type.bodySmall.lineHeight, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
});

export default ReviewCounterOfferDialog;
