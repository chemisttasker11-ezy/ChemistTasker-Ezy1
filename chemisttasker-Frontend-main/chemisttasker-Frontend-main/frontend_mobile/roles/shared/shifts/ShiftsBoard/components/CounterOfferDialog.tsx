// CounterOfferDialog - Mobile React Native version
// Complex counter offer form with exact web logic adapted for mobile

import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Portal, Dialog, Button, Text, TextInput, Checkbox, Card, Icon } from 'react-native-paper';
import { Shift } from '@chemisttasker/shared-core';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { CounterOfferFormSlot, TravelLocation } from '../types';
import { getShiftFlexibleTime, getShiftNegotiable, getShiftPharmacyName } from '../utils/shift';

type CounterOfferDialogProps = {
    visible: boolean;
    onDismiss: () => void;
    counterOfferShift: Shift | null;
    counterOfferError: string | null;
    counterOfferSlots: CounterOfferFormSlot[];
    counterOfferTravel: boolean;
    counterOfferTravelLocation: TravelLocation;
    hasCounterOfferTravelLocation: boolean;
    counterSubmitting: boolean;
    onCounterSlotChange: (index: number, key: keyof CounterOfferFormSlot, value: string) => void;
    onCounterOfferTravelChange: (checked: boolean) => void;
    setCounterOfferTravelLocation: React.Dispatch<React.SetStateAction<TravelLocation>>;
    onClearTravelLocation: () => void;
    onSubmit: () => void;
};

const CounterOfferDialog: React.FC<CounterOfferDialogProps> = ({
    visible,
    onDismiss,
    counterOfferShift,
    counterOfferError,
    counterOfferSlots,
    counterOfferTravel,
    counterOfferTravelLocation,
    hasCounterOfferTravelLocation,
    counterSubmitting,
    onCounterSlotChange,
    onCounterOfferTravelChange,
    setCounterOfferTravelLocation,
    onClearTravelLocation,
    onSubmit,
}) => (
    <Portal>
        <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
            <Dialog.Title>
                Submit Counter Offer
                {counterOfferShift && (
                    <Text variant="bodySmall" style={styles.pharmacy}>
                        {getShiftPharmacyName(counterOfferShift)}
                    </Text>
                )}
            </Dialog.Title>
            <Dialog.ScrollArea>
                <ScrollView contentContainerStyle={styles.content}>
                    {counterOfferError && (
                        <View style={styles.errorBox}>
                            <Text variant="bodyMedium" style={styles.error}>
                                {counterOfferError}
                            </Text>
                        </View>
                    )}
                    {counterOfferShift && (
                        <View style={styles.formContainer}>
                            <Card style={styles.infoCard} mode="outlined">
                                <Card.Content style={styles.infoContent}>
                                    <Icon source="information-outline" size={20} color="#167B87" />
                                    <Text variant="bodyMedium" style={styles.infoText}>
                                        Negotiation options:{' '}
                                        {getShiftNegotiable(counterOfferShift) ? 'Rate negotiable.' : 'Rate fixed.'}{' '}
                                        {getShiftFlexibleTime(counterOfferShift) ? 'Time flexible.' : 'Time fixed.'}
                                    </Text>
                                </Card.Content>
                            </Card>

                            {counterOfferSlots.map((slot, idx) => (
                                <Card
                                    key={slot.slotId != null ? `${slot.slotId}-${slot.dateLabel || idx}` : `new-${idx}`}
                                    style={styles.slotCard}
                                    mode="outlined"
                                >
                                    <Card.Content>
                                        <View style={styles.slotGrid}>
                                            <View style={styles.dateCell}>
                                                <Icon source="calendar-month-outline" size={18} color="#167B87" />
                                                <Text variant="titleSmall" style={styles.slotTitle} numberOfLines={2}>
                                                    {slot.dateLabel}
                                                </Text>
                                            </View>
                                            <TextInput
                                                label="Start time"
                                                value={slot.startTime}
                                                onChangeText={(value) => onCounterSlotChange(idx, 'startTime', value)}
                                                disabled={!getShiftFlexibleTime(counterOfferShift)}
                                                style={styles.timeInput}
                                                mode="outlined"
                                                outlineColor="#D7E5EA"
                                                activeOutlineColor="#167B87"
                                                dense
                                            />
                                            <TextInput
                                                label="End time"
                                                value={slot.endTime}
                                                onChangeText={(value) => onCounterSlotChange(idx, 'endTime', value)}
                                                disabled={!getShiftFlexibleTime(counterOfferShift)}
                                                style={styles.timeInput}
                                                mode="outlined"
                                                outlineColor="#D7E5EA"
                                                activeOutlineColor="#167B87"
                                                dense
                                            />
                                            <TextInput
                                                label="Rate"
                                                value={slot.rate}
                                                onChangeText={(value) => onCounterSlotChange(idx, 'rate', value)}
                                                disabled={!getShiftNegotiable(counterOfferShift)}
                                                keyboardType="numeric"
                                                style={styles.rateInput}
                                                mode="outlined"
                                                outlineColor="#D7E5EA"
                                                activeOutlineColor="#167B87"
                                                dense
                                                left={<TextInput.Affix text="$" />}
                                                right={<TextInput.Affix text="/hr" />}
                                            />
                                        </View>
                                    </Card.Content>
                                </Card>
                            ))}

                            {getShiftNegotiable(counterOfferShift) && (
                                <View style={styles.checkboxRow}>
                                    <Checkbox
                                        status={counterOfferTravel ? 'checked' : 'unchecked'}
                                        onPress={() => onCounterOfferTravelChange(!counterOfferTravel)}
                                        color="#167B87"
                                    />
                                    <Text variant="bodyMedium" style={styles.checkboxLabel}>
                                        Request travel allowance
                                    </Text>
                                </View>
                            )}

                            {counterOfferTravel && (
                                <Card style={styles.travelCard} mode="outlined">
                                    <Card.Content>
                                        <Text variant="titleSmall" style={styles.travelTitle}>
                                            Traveling from
                                        </Text>
                                        {!hasCounterOfferTravelLocation ? (
                                            <GooglePlacesAutocomplete
                                                placeholder="Search Address"
                                                onPress={(data, details = null) => {
                                                    if (details) {
                                                        let streetNumber = '';
                                                        let route = '';
                                                        let locality = '';
                                                        let postalCode = '';
                                                        let stateShort = '';

                                                        details.address_components?.forEach((component) => {
                                                            const types = component.types;
                                                            if (types.includes('street_number')) streetNumber = component.long_name;
                                                            if (types.includes('route')) route = component.short_name;
                                                            if (types.includes('locality')) locality = component.long_name;
                                                            if (types.includes('postal_code')) postalCode = component.long_name;
                                                            if (types.includes('administrative_area_level_1'))
                                                                stateShort = component.short_name;
                                                        });

                                                        setCounterOfferTravelLocation({
                                                            streetAddress: `${streetNumber} ${route}`.trim(),
                                                            suburb: locality,
                                                            postcode: postalCode,
                                                            state: stateShort,
                                                            googlePlaceId: details.place_id || '',
                                                            latitude: details.geometry?.location.lat ?? null,
                                                            longitude: details.geometry?.location.lng ?? null,
                                                        });
                                                    }
                                                }}
                                                query={{
                                                    key: process.env.EXPO_PUBLIC_ANDROID_PLACES || '',
                                                    language: 'en',
                                                    components: 'country:au',
                                                }}
                                                styles={{
                                                    container: { flex: 0 },
                                                    textInput: styles.placesInput,
                                                }}
                                                fetchDetails
                                            />
                                        ) : (
                                            <View style={styles.addressForm}>
                                                <TextInput
                                                    label="Street Address"
                                                    value={counterOfferTravelLocation.streetAddress}
                                                    onChangeText={(value) =>
                                                        setCounterOfferTravelLocation((prev) => ({
                                                            ...prev,
                                                            streetAddress: value,
                                                        }))
                                                    }
                                                    style={styles.addressInput}
                                                    mode="outlined"
                                                    outlineColor="#D7E5EA"
                                                    activeOutlineColor="#167B87"
                                                    dense
                                                />
                                                <TextInput
                                                    label="Suburb"
                                                    value={counterOfferTravelLocation.suburb}
                                                    onChangeText={(value) =>
                                                        setCounterOfferTravelLocation((prev) => ({
                                                            ...prev,
                                                            suburb: value,
                                                        }))
                                                    }
                                                    style={styles.addressInput}
                                                    mode="outlined"
                                                    outlineColor="#D7E5EA"
                                                    activeOutlineColor="#167B87"
                                                    dense
                                                />
                                                <TextInput
                                                    label="State"
                                                    value={counterOfferTravelLocation.state}
                                                    onChangeText={(value) =>
                                                        setCounterOfferTravelLocation((prev) => ({
                                                            ...prev,
                                                            state: value,
                                                        }))
                                                    }
                                                    style={styles.addressInput}
                                                    mode="outlined"
                                                    outlineColor="#D7E5EA"
                                                    activeOutlineColor="#167B87"
                                                    dense
                                                />
                                                <TextInput
                                                    label="Postcode"
                                                    value={counterOfferTravelLocation.postcode}
                                                    onChangeText={(value) =>
                                                        setCounterOfferTravelLocation((prev) => ({
                                                            ...prev,
                                                            postcode: value,
                                                        }))
                                                    }
                                                    style={styles.addressInput}
                                                    mode="outlined"
                                                    outlineColor="#D7E5EA"
                                                    activeOutlineColor="#167B87"
                                                    dense
                                                />
                                                <Button mode="text" onPress={onClearTravelLocation} style={styles.clearButton}>
                                                    Clear Address & Search Again
                                                </Button>
                                            </View>
                                        )}
                                    </Card.Content>
                                </Card>
                            )}

                        </View>
                    )}
                </ScrollView>
            </Dialog.ScrollArea>
            <Dialog.Actions>
                <Button onPress={onDismiss}>Cancel</Button>
                <Button
                    mode="contained"
                    onPress={onSubmit}
                    disabled={!counterOfferShift || counterSubmitting}
                    loading={counterSubmitting}
                >
                    {counterSubmitting ? 'Sending...' : 'Send Offer'}
                </Button>
            </Dialog.Actions>
        </Dialog>
    </Portal>
);

const styles = StyleSheet.create({
    dialog: {
        maxHeight: '90%',
        borderRadius: 14,
    },
    pharmacy: {
        marginTop: 4,
        color: '#516178',
    },
    content: {
        paddingHorizontal: 18,
        paddingVertical: 16,
    },
    errorBox: {
        borderWidth: 1,
        borderColor: '#F5C2C7',
        backgroundColor: '#FFF5F5',
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
    },
    error: {
        color: '#B42318',
    },
    formContainer: {
        gap: 16,
    },
    infoCard: {
        backgroundColor: '#F3FCFD',
        borderColor: '#C7ECEF',
        borderRadius: 12,
    },
    infoContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    infoText: {
        flex: 1,
        color: '#0F2A43',
    },
    slotCard: {
        marginVertical: 4,
        borderColor: '#D7E5EA',
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
    },
    slotGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'center',
    },
    dateCell: {
        minWidth: 132,
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#EEF7F8',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    slotTitle: {
        flex: 1,
        color: '#111827',
        fontWeight: '800',
    },
    timeInput: {
        minWidth: 116,
        flex: 1,
    },
    rateInput: {
        minWidth: 120,
        flex: 1,
    },
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D7E5EA',
        borderRadius: 12,
        paddingVertical: 6,
        paddingHorizontal: 4,
        backgroundColor: '#FFFFFF',
    },
    checkboxLabel: {
        marginLeft: 8,
        fontWeight: '700',
        color: '#111827',
    },
    travelCard: {
        marginVertical: 8,
        borderColor: '#D7E5EA',
        borderRadius: 12,
    },
    travelTitle: {
        marginBottom: 12,
    },
    placesInput: {
        borderWidth: 1,
        borderColor: '#D7E5EA',
        borderRadius: 10,
        padding: 12,
    },
    addressForm: {
        gap: 12,
        marginTop: 12,
    },
    addressInput: {
        marginVertical: 4,
    },
    clearButton: {
        marginTop: 8,
    },
});

export default CounterOfferDialog;
