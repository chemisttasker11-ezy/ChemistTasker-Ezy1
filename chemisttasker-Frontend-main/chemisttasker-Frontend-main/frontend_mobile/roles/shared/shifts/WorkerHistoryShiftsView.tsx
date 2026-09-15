import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Linking, Platform } from 'react-native';
import {
    ActivityIndicator,
    Button,
    Card,
    Dialog,
    Divider,
    IconButton,
    Portal,
    Text,
    Title,
    Paragraph,
    Snackbar,
    TextInput,
    useTheme
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import {
    fetchMyHistoryShifts,
    fetchRatingsSummaryService,
    fetchMyRatingForTargetService,
    createRatingService,
    type Shift,
    type ShiftRatingSummary,
} from '@chemisttasker/shared-core';

const buildFullAddress = (pharmacy?: Shift['pharmacyDetail'] | null) => {
    if (!pharmacy) return '';
    const parts = [
        pharmacy.streetAddress,
        pharmacy.suburb,
        pharmacy.state,
        pharmacy.postcode,
    ].filter(Boolean);
    return parts.join(', ');
};

type Props = {
    invoiceRoute?: string;
};

export default function WorkerHistoryShiftsView({ invoiceRoute }: Props) {
    const theme = useTheme();
    const router = useRouter();
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);
    const [snackbar, setSnackbar] = useState<string>('');
    const [pharmacySummaries, setPharmacySummaries] = useState<Record<number, ShiftRatingSummary>>({});
    const [generatingId, setGeneratingId] = useState<number | null>(null);

    // Rating Modal
    const [ratingDialogVisible, setRatingDialogVisible] = useState(false);
    const [selectedPharmacy, setSelectedPharmacy] = useState<{ id: number; name: string } | null>(null);
    const [currentStars, setCurrentStars] = useState(0);
    const [currentComment, setCurrentComment] = useState('');
    const [loadingRatingAction, setLoadingRatingAction] = useState(false);
    const [loadingExistingRating, setLoadingExistingRating] = useState(false);

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        setLoading(true);
        try {
            const data = await fetchMyHistoryShifts();
            setShifts(Array.isArray(data) ? data : []);

            // Load summaries for unique pharmacies
            const uniqueIds = Array.from(new Set(data.map((s: Shift) => s.pharmacyDetail?.id).filter((id: any) => typeof id === 'number'))) as number[];

            uniqueIds.forEach(id => {
                fetchRatingsSummaryService({ targetType: 'pharmacy', targetId: id })
                    .then(summary => setPharmacySummaries(prev => ({ ...prev, [id]: summary })))
                    .catch(() => { });
            });

        } catch (err: any) {
            setSnackbar('Failed to load history shifts');
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateInvoice = (shift: Shift) => {
        setGeneratingId(shift.id);
        const pharmId = shift.pharmacyDetail?.id ?? '';
        // Assuming there's a route for invoice creation. Adjust path as needed based on mobile router structure.
        // If route doesn't exist yet, we might need to create it or stub it. 
        // Based on analysis, 'roles/pharmacist/invoice/new' might be the path? 
        // Or simply '/invoice/new' if shared? 
        // Let's try to navigate to a generic location that we can fix if broken.
        // Use the passed route or default to a safe fallback
        const route = invoiceRoute || '/pharmacist/invoice/new';
        router.push({ pathname: route as any, params: { shiftId: shift.id, pharmacyId: pharmId } });
        setGeneratingId(null);
    };

    const openRatingDialog = async (pharmId: number, name: string) => {
        setSelectedPharmacy({ id: pharmId, name });
        setRatingDialogVisible(true);
        setLoadingExistingRating(true);
        try {
            const existing = await fetchMyRatingForTargetService({ targetType: 'pharmacy', targetId: pharmId });
            if (existing) {
                setCurrentStars(existing.stars || 0);
                setCurrentComment(existing.comment || '');
            } else {
                setCurrentStars(0);
                setCurrentComment('');
            }
        } catch {
            setCurrentStars(0);
            setCurrentComment('');
        } finally {
            setLoadingExistingRating(false);
        }
    };

    const saveRating = async () => {
        if (!selectedPharmacy) return;
        setLoadingRatingAction(true);
        try {
            await createRatingService({
                direction: 'WORKER_TO_PHARMACY',
                ratee_pharmacy: selectedPharmacy.id,
                stars: currentStars,
                comment: currentComment,
            });
            setSnackbar('Rating saved!');
            setRatingDialogVisible(false);

            // Refresh summary
            const summary = await fetchRatingsSummaryService({ targetType: 'pharmacy', targetId: selectedPharmacy.id });
            setPharmacySummaries(prev => ({ ...prev, [selectedPharmacy.id]: summary }));

        } catch (err) {
            setSnackbar('Failed to save rating');
        } finally {
            setLoadingRatingAction(false);
        }
    };

    const openMap = (address: string) => {
        const query = encodeURIComponent(address);
        const url = Platform.select({
            ios: `maps:0,0?q=${query}`,
            android: `geo:0,0?q=${query}`,
            default: `https://www.google.com/maps/search/?api=1&query=${query}`,
        });
        Linking.openURL(url!).catch(() => setSnackbar('Could not open map'));
    };

    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    if (shifts.length === 0) {
        return (
            <View style={styles.centered}>
                <Text style={{ color: theme.colors.outline }}>No past shifts found.</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.scroll}>
                {shifts.map((shift) => {
                    const slots = shift.slots ?? [];
                    const pharmId = shift.pharmacyDetail?.id;
                    const pharmacyAddress = buildFullAddress(shift.pharmacyDetail);
                    const summary = pharmId ? pharmacySummaries[pharmId] : null;

                    return (
                        <Card key={shift.id} style={styles.card} mode="outlined">
                            <Card.Content>
                                <View style={styles.headerRow}>
                                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                        <Title>{shift.pharmacyDetail?.name ?? 'Unknown Pharmacy'}</Title>
                                        {pharmacyAddress ? (
                                            <IconButton
                                                icon="map-marker"
                                                size={18}
                                                onPress={() => openMap(pharmacyAddress)}
                                                style={{ marginLeft: 4 }}
                                            />
                                        ) : null}
                                        {summary && (
                                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                <IconButton icon="star" iconColor="#F59E0B" size={14} style={{ margin: 0 }} />
                                                <Text style={{ fontSize: 12, color: '#6B7280' }}>
                                                    {summary.average?.toFixed(1)} ({summary.count})
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                </View>

                                <Text style={{ marginBottom: 8 }}>Role: {shift.roleNeeded}</Text>

                                <View style={styles.slotsContainer}>
                                    {slots.map(slot => (
                                        <Text key={slot.id} variant="bodySmall" style={{ marginBottom: 2 }}>
                                            • {slot.date} {slot.startTime}–{slot.endTime}
                                        </Text>
                                    ))}
                                </View>

                                <View style={styles.actionsRow}>
                                    <Button
                                        mode="contained"
                                        compact
                                        onPress={() => handleGenerateInvoice(shift)}
                                        loading={generatingId === shift.id}
                                        style={{ backgroundColor: '#7C3AED', flex: 1, marginRight: 8 }}
                                    >
                                        Generate Invoice
                                    </Button>
                                    <Button
                                        mode="outlined"
                                        compact
                                        onPress={() => pharmId && openRatingDialog(pharmId, shift.pharmacyDetail?.name || 'Pharmacy')}
                                        style={{ flex: 1 }}
                                    >
                                        Rate Pharmacy
                                    </Button>
                                </View>
                            </Card.Content>
                        </Card>
                    );
                })}
            </ScrollView>

            <Portal>
                <Dialog visible={ratingDialogVisible} onDismiss={() => setRatingDialogVisible(false)}>
                    <Dialog.Title>Rate {selectedPharmacy?.name}</Dialog.Title>
                    <Dialog.Content>
                        {loadingExistingRating ? (
                            <ActivityIndicator />
                        ) : (
                            <View>
                                <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 16 }}>
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <IconButton
                                            key={star}
                                            icon={star <= currentStars ? "star" : "star-outline"}
                                            iconColor="#F59E0B"
                                            size={32}
                                            onPress={() => setCurrentStars(star)}
                                        />
                                    ))}
                                </View>
                                <TextInput
                                    label="Comment (Optional)"
                                    value={currentComment}
                                    onChangeText={setCurrentComment}
                                    mode="outlined"
                                    multiline
                                    numberOfLines={3}
                                />
                            </View>
                        )}
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setRatingDialogVisible(false)}>Cancel</Button>
                        <Button onPress={saveRating} loading={loadingRatingAction} disabled={currentStars === 0}>Save</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>

            <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar('')} duration={3000}>
                {snackbar}
            </Snackbar>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scroll: { padding: 16 },
    card: { marginBottom: 16, borderRadius: 12, backgroundColor: '#fff', elevation: 2 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    slotsContainer: { marginVertical: 8, padding: 8, backgroundColor: '#F9FAFB', borderRadius: 8 },
    actionsRow: { flexDirection: 'row', marginTop: 12 }
});
