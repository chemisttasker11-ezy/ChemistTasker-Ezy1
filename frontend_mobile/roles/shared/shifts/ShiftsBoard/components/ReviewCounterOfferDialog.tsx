// ReviewCounterOfferDialog - Mobile React Native version
// Dialog for reviewing counter offer details

import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Portal, Dialog, Button, ActivityIndicator, Text } from 'react-native-paper';
import { Shift } from '@chemisttasker/shared-core';
import { ContentState } from '@/components/ui/ContentState';
import ReviewOfferSlotList from './ReviewOfferSlotList';
import { useReviewOfferDisplay } from '../hooks/useReviewOfferDisplay';

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
        <Portal>
            <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
                <Dialog.Title>Counter Offer Details</Dialog.Title>
                <Dialog.ScrollArea>
                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        {reviewLoading && (
                            <View style={styles.loading}>
                                <ActivityIndicator size="small" />
                                <Text variant="bodyMedium" style={styles.loadingText}>
                                    Loading offers...
                                </Text>
                            </View>
                        )}
                        {reviewOfferShiftId != null && !reviewLoading ? (
                            reviewError ? (
                                <ContentState
                                    kind="error"
                                    compact
                                    title="Counter offers could not load"
                                    description="Check your connection, then try again."
                                    onAction={onRetry}
                                />
                            ) : hasOffers ? (
                                <ReviewOfferSlotList offers={offers} shift={shift} />
                            ) : (
                                <ContentState kind="empty" compact title="No counter offers on this shift" />
                            )
                        ) : null}
                    </ScrollView>
                </Dialog.ScrollArea>
                <Dialog.Actions>
                    <Button onPress={onDismiss}>Close</Button>
                </Dialog.Actions>
            </Dialog>
        </Portal>
    );
};

const styles = StyleSheet.create({
    dialog: {
        maxHeight: '80%',
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingVertical: 16,
    },
    loading: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    loadingText: {
        color: '#666',
    },
});

export default ReviewCounterOfferDialog;
