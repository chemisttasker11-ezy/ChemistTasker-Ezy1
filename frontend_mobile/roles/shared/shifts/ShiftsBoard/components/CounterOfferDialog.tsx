// CounterOfferDialog - Mobile React Native version
// Complex counter offer form with exact web logic adapted for mobile

import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Calendar, Info, Square, SquareCheck } from 'lucide-react-native';
import { Shift } from '@chemisttasker/shared-core';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { BottomSheet, Button, ScalePressable, TextField } from '@/components/ui';
import { colors, font, radius, space, touch, type } from '@/constants/tokens';
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
    <BottomSheet
        open={visible}
        onClose={counterSubmitting ? () => {} : onDismiss}
        dismissable={!counterSubmitting}
        title="Submit Counter Offer"
        footer={
            <View style={styles.footerRow}>
                <Button label="Cancel" variant="outlined" onPress={onDismiss} disabled={counterSubmitting} style={styles.footerBtn} />
                <Button label={counterSubmitting ? 'Sending...' : 'Send Offer'} onPress={onSubmit} disabled={!counterOfferShift || counterSubmitting} haptic="light" style={styles.footerBtn} />
            </View>
        }
    >
                <View style={styles.content}>
                    {counterOfferShift && (
                        <Text style={styles.pharmacy}>
                            {getShiftPharmacyName(counterOfferShift)}
                        </Text>
                    )}
                    {counterOfferError && (
                        <View style={styles.errorBox}>
                            <Text style={styles.error}>
                                {counterOfferError}
                            </Text>
                        </View>
                    )}
                    {counterOfferShift && (
                        <View style={styles.formContainer}>
                            <View style={styles.infoCard}>
                                <Info size={18} color={colors.accentStrong} strokeWidth={2} />
                                <Text style={styles.infoText}>
                                    Negotiation options:{' '}
                                    {getShiftNegotiable(counterOfferShift) ? 'Rate negotiable.' : 'Rate fixed.'}{' '}
                                    {getShiftFlexibleTime(counterOfferShift) ? 'Time flexible.' : 'Time fixed.'}
                                </Text>
                            </View>

                            {counterOfferSlots.map((slot, idx) => (
                                <View
                                    key={slot.slotId != null ? `${slot.slotId}-${slot.dateLabel || idx}` : `new-${idx}`}
                                    style={styles.slotCard}
                                >
                                    <View style={styles.dateCell}>
                                        <Calendar size={16} color={colors.accentStrong} strokeWidth={2} />
                                        <Text style={styles.slotTitle} numberOfLines={2}>
                                            {slot.dateLabel}
                                        </Text>
                                    </View>
                                    <View style={styles.slotGrid}>
                                        <TextField
                                            label="Start time"
                                            value={slot.startTime}
                                            onChangeText={(value) => onCounterSlotChange(idx, 'startTime', value)}
                                            disabled={!getShiftFlexibleTime(counterOfferShift)}
                                            style={styles.timeInput}
                                        />
                                        <TextField
                                            label="End time"
                                            value={slot.endTime}
                                            onChangeText={(value) => onCounterSlotChange(idx, 'endTime', value)}
                                            disabled={!getShiftFlexibleTime(counterOfferShift)}
                                            style={styles.timeInput}
                                        />
                                    </View>
                                    <TextField
                                        label="Rate ($/hr)"
                                        value={slot.rate}
                                        onChangeText={(value) => onCounterSlotChange(idx, 'rate', value)}
                                        disabled={!getShiftNegotiable(counterOfferShift)}
                                        keyboardType="numeric"
                                        style={styles.rateInput}
                                    />
                                </View>
                            ))}

                            {getShiftNegotiable(counterOfferShift) && (
                                <ScalePressable
                                    static
                                    pressBg
                                    haptic="selection"
                                    onPress={() => onCounterOfferTravelChange(!counterOfferTravel)}
                                    accessibilityRole="checkbox"
                                    accessibilityState={{ checked: counterOfferTravel }}
                                    accessibilityLabel="Request travel allowance"
                                    style={styles.checkboxRow}
                                >
                                    {counterOfferTravel ? <SquareCheck size={20} color={colors.accentStrong} strokeWidth={2} /> : <Square size={20} color={colors.textSecondary} strokeWidth={2} />}
                                    <Text style={styles.checkboxLabel}>
                                        Request travel allowance
                                    </Text>
                                </ScalePressable>
                            )}

                            {counterOfferTravel && (
                                <View style={styles.slotCard}>
                                    <Text style={styles.travelTitle}>
                                        Traveling from
                                    </Text>
                                        {!hasCounterOfferTravelLocation ? (
                                            <GooglePlacesAutocomplete
                                                placeholder="Search Address"
                                                disableScroll
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
                                                <TextField
                                                    label="Street Address"
                                                    value={counterOfferTravelLocation.streetAddress}
                                                    onChangeText={(value) =>
                                                        setCounterOfferTravelLocation((prev) => ({
                                                            ...prev,
                                                            streetAddress: value,
                                                        }))
                                                    }
                                                />
                                                <TextField
                                                    label="Suburb"
                                                    value={counterOfferTravelLocation.suburb}
                                                    onChangeText={(value) =>
                                                        setCounterOfferTravelLocation((prev) => ({
                                                            ...prev,
                                                            suburb: value,
                                                        }))
                                                    }
                                                />
                                                <TextField
                                                    label="State"
                                                    value={counterOfferTravelLocation.state}
                                                    onChangeText={(value) =>
                                                        setCounterOfferTravelLocation((prev) => ({
                                                            ...prev,
                                                            state: value,
                                                        }))
                                                    }
                                                />
                                                <TextField
                                                    label="Postcode"
                                                    value={counterOfferTravelLocation.postcode}
                                                    onChangeText={(value) =>
                                                        setCounterOfferTravelLocation((prev) => ({
                                                            ...prev,
                                                            postcode: value,
                                                        }))
                                                    }
                                                />
                                                <Button label="Clear Address & Search Again" variant="outlined" onPress={onClearTravelLocation} style={styles.clearButton} />
                                            </View>
                                        )}
                                </View>
                            )}

                        </View>
                    )}
                </View>
    </BottomSheet>
);

const styles = StyleSheet.create({
    pharmacy: { fontFamily: font.inter.regular, fontSize: type.bodySmall.fontSize, lineHeight: type.bodySmall.lineHeight, color: colors.textSecondary },
    content: { paddingVertical: space.md, gap: space.md },
    errorBox: { borderWidth: 1, borderColor: colors.status.red.fg, backgroundColor: colors.status.red.bg, borderRadius: radius.nested, borderCurve: 'continuous', padding: space.md },
    error: { fontFamily: font.inter.medium, fontSize: type.bodySmall.fontSize, lineHeight: type.bodySmall.lineHeight, color: colors.status.red.fg },
    formContainer: { gap: space.md },
    infoCard: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.tone.cyan.bg, borderRadius: radius.nested, borderCurve: 'continuous', padding: space.md },
    infoText: { flex: 1, fontFamily: font.inter.regular, fontSize: type.bodySmall.fontSize, lineHeight: type.bodySmall.lineHeight, color: colors.textPrimary },
    slotCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, borderCurve: 'continuous', backgroundColor: colors.surfaceBg, padding: space.md, gap: space.sm },
    slotGrid: { flexDirection: 'row', gap: space.sm },
    dateCell: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.subtleBg, borderRadius: radius.nested, borderCurve: 'continuous', paddingHorizontal: space.md, paddingVertical: space.sm },
    slotTitle: { flex: 1, fontFamily: font.inter.semiBold, fontSize: type.labelLarge.fontSize, lineHeight: type.labelLarge.lineHeight, color: colors.textPrimary },
    timeInput: { flex: 1 },
    rateInput: { flex: 1 },
    checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: touch.min, borderWidth: 1, borderColor: colors.border, borderRadius: radius.control, borderCurve: 'continuous', paddingHorizontal: space.md, paddingVertical: space.xs, backgroundColor: colors.surfaceBg },
    checkboxLabel: { flex: 1, fontFamily: font.inter.semiBold, fontSize: type.bodyMedium.fontSize, lineHeight: type.bodyMedium.lineHeight, color: colors.textPrimary },
    travelTitle: { fontFamily: font.outfit.medium, fontSize: type.titleSmall.fontSize, lineHeight: type.titleSmall.lineHeight, color: colors.textPrimary },
    placesInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.control, padding: space.md, fontFamily: font.inter.regular, fontSize: type.bodyMedium.fontSize, color: colors.textPrimary, backgroundColor: colors.surfaceBg },
    addressForm: { gap: space.sm },
    clearButton: { marginTop: space.xs },
    footerRow: { flexDirection: 'row', gap: space.sm },
    footerBtn: { flex: 1 },
});

export default CounterOfferDialog;
