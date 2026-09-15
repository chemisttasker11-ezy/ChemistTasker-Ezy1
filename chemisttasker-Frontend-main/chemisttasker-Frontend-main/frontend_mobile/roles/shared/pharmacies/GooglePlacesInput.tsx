// Google Places Autocomplete Input - Mobile
// Uses Google Places API for address autocomplete

import React, { useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { TextInput, HelperText } from 'react-native-paper';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { Autocomplete as WebAutocomplete, useJsApiLoader } from '@react-google-maps/api';
import { surfaceTokens } from './types';
import { LogBox } from 'react-native';

LogBox.ignoreLogs(['VirtualizedLists should never be nested']);

interface GooglePlacesInputProps {
    label: string;
    value: string;
    onPlaceSelected: (place: {
        address: string;
        name?: string;
        place_id?: string;
        street_address: string;
        suburb: string;
        state: string;
        postcode: string;
        latitude?: number;
        longitude?: number;
    }) => void;
    error?: string;
}

export default function GooglePlacesInput({
    label,
    value,
    onPlaceSelected,
    error,
}: GooglePlacesInputProps) {
    const [focused, setFocused] = useState(false);
    const ref = React.useRef<any>(null);
    const isWeb = Platform.OS === 'web';

    React.useEffect(() => {
        if (value && ref.current) {
            ref.current.setAddressText(value);
        }
    }, [value]);

    // Get API key from environment
    const apiKey = Platform.select({
        ios: process.env.EXPO_PUBLIC_IOS_PLACES,
        android: process.env.EXPO_PUBLIC_ANDROID_PLACES,
        web: process.env.EXPO_PUBLIC_WEB_PLACES,
    }) || process.env.EXPO_PUBLIC_PLACES_KEY;

    if (!apiKey) {
        console.warn('Google Places API key not found in environment variables');
        return (
            <View>
                <TextInput
                    label={label}
                    value={value}
                    mode="outlined"
                    style={styles.input}
                    editable={false}
                />
                <HelperText type="error" visible>
                    Google Places API key not configured
                </HelperText>
            </View>
        );
    }

    if (isWeb) {
        return <WebPlacesInput label={label} value={value} onPlaceSelected={onPlaceSelected} error={error} apiKey={apiKey} />;
    }

    return (
        <View style={styles.container}>
            <GooglePlacesAutocomplete
                ref={ref}
                placeholder={label}
                fetchDetails
                onFail={(error) => {
                    console.error('Google Places Error:', error);
                    // Alert the user so they know something failed
                    const msg = typeof error === 'object' ? JSON.stringify(error) : String(error);
                    alert(`Google Places API Error: ${msg}`);
                }}
                onPress={(data, details = null) => {
                    if (__DEV__) {
                        console.log('GooglePlaceSelected Data:', data);
                        console.log('GooglePlaceSelected Details:', details);
                    }

                    if (!details) {
                        alert('Error: No details fetched for this place. Check API permissions.');
                        return;
                    }

                    // Extract address components
                    const components = details.address_components || [];

                    if (components.length === 0) {
                        console.warn('No address components found in details');
                    }

                    const getComponent = (type: string) => {
                        const comp = components.find((c: any) => c.types.includes(type));
                        return comp?.long_name || '';
                    };

                    const streetNumber = getComponent('street_number');
                    const route = getComponent('route');
                    const street_address = [streetNumber, route].filter(Boolean).join(' ');
                    const suburb = getComponent('locality') || getComponent('sublocality');
                    const state = getComponent('administrative_area_level_1');
                    const postcode = getComponent('postal_code');

                    const place = {
                        address: details.formatted_address || '',
                        name: details.name,
                        place_id: details.place_id,
                        street_address,
                        suburb,
                        state,
                        postcode,
                        latitude: details.geometry?.location.lat,
                        longitude: details.geometry?.location.lng,
                    };

                    if (__DEV__) {
                        console.log('Extracted Place:', place);
                    }
                    onPlaceSelected(place);
                }}
                query={{
                    key: apiKey,
                    language: 'en',
                    components: 'country:au', // Restrict to Australia
                }}
                styles={{
                    container: styles.autocompleteContainer,
                    textInputContainer: styles.textInputContainer,
                    textInput: {
                        ...styles.textInput,
                        borderColor: focused ? surfaceTokens.primary : surfaceTokens.border,
                        borderWidth: focused ? 2 : 1,
                    },
                    listView: styles.listView,
                    row: styles.row,
                    description: styles.description,
                }}
                textInputProps={{
                    onFocus: () => setFocused(true),
                    onBlur: () => setFocused(false),
                    placeholderTextColor: surfaceTokens.textMuted,
                }}
                enablePoweredByContainer={false}
                debounce={300}
                // @ts-ignore
                flatListProps={{
                    nestedScrollEnabled: true,
                    keyboardShouldPersistTaps: 'handled',
                }}
            />
            {error && (
                <HelperText type="error" visible>
                    {error}
                </HelperText>
            )}
        </View>
    );
}

function WebPlacesInput({
    label,
    value,
    onPlaceSelected,
    error,
    apiKey,
}: GooglePlacesInputProps & { apiKey: string }) {
    const autocompleteRef = React.useRef<any>(null);
    const [inputValue, setInputValue] = useState(value);
    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: apiKey,
        libraries: ['places'],
    });

    React.useEffect(() => {
        setInputValue(value);
    }, [value]);

    const handlePlaceChanged = () => {
        const place = autocompleteRef.current?.getPlace?.();
        if (!place) {
            return;
        }

        const components = place.address_components || [];
        const getComponent = (type: string) => {
            const comp = components.find((c: any) => c.types.includes(type));
            return comp?.long_name || '';
        };

        const streetNumber = getComponent('street_number');
        const route = getComponent('route');
        const street_address = [streetNumber, route].filter(Boolean).join(' ');
        const suburb = getComponent('locality') || getComponent('sublocality');
        const state = getComponent('administrative_area_level_1');
        const postcode = getComponent('postal_code');

        const selected = {
            address: place.formatted_address || '',
            name: place.name,
            place_id: place.place_id,
            street_address,
            suburb,
            state,
            postcode,
            latitude: place.geometry?.location?.lat?.(),
            longitude: place.geometry?.location?.lng?.(),
        };

        onPlaceSelected(selected);
    };

    return (
        <View style={styles.container}>
            {!isLoaded && !loadError && (
                <TextInput
                    label={label}
                    value={inputValue}
                    mode="outlined"
                    style={styles.input}
                    editable={false}
                />
            )}
            {loadError && (
                <HelperText type="error" visible>
                    Google Maps failed to load. Check your API key and restrictions.
                </HelperText>
            )}
            {isLoaded && !loadError && (
                <WebAutocomplete
                    onLoad={(ref) => (autocompleteRef.current = ref)}
                    onPlaceChanged={handlePlaceChanged}
                    options={{ componentRestrictions: { country: 'au' }, fields: ['address_components', 'geometry', 'place_id', 'name', 'formatted_address'] }}
                >
                    <input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={label}
                        style={{
                            width: '100%',
                            height: 56,
                            borderRadius: 4,
                            border: `1px solid ${surfaceTokens.border}`,
                            padding: '0 12px',
                            fontSize: 16,
                            color: '#111827',
                            backgroundColor: surfaceTokens.bg,
                        }}
                    />
                </WebAutocomplete>
            )}
            {error && (
                <HelperText type="error" visible>
                    {error}
                </HelperText>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 10,
        zIndex: 9999,
        flex: 1,
    },
    input: {
        backgroundColor: surfaceTokens.bg,
    },
    autocompleteContainer: {
        flex: 0,
        zIndex: 9999,
    },
    textInputContainer: {
        backgroundColor: 'transparent',
    },
    textInput: {
        height: 56,
        backgroundColor: surfaceTokens.bg,
        borderRadius: 4,
        paddingHorizontal: 12,
        fontSize: 16,
        color: '#111827',
    },
    listView: {
        backgroundColor: surfaceTokens.bg,
        borderRadius: 4,
        marginTop: 4,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        position: 'absolute',
        top: 60,
        left: 0,
        right: 0,
        zIndex: 10000,
    },
    row: {
        backgroundColor: surfaceTokens.bg,
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: surfaceTokens.border,
    },
    description: {
        fontSize: 14,
        color: '#111827',
    },
});
