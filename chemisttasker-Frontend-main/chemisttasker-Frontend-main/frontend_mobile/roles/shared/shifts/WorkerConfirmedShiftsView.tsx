import React, { useEffect, useState } from 'react';
import { View, ScrollView, Linking, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import {
    ActivityIndicator,
    Button,
    Card,
    Dialog,
    Divider,
    IconButton,
    List,
    Portal,
    Text,
    Title,
    Paragraph,
    Snackbar,
    Avatar,
    Chip,
    useTheme
} from 'react-native-paper';
import {
    fetchMyConfirmedShifts,
    fetchRatingsSummaryService,
    fetchRatingsPageService,
    type Shift,
    type ShiftRatingSummary,
    type ShiftRatingComment,
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

export default function WorkerConfirmedShiftsView() {
    const theme = useTheme();
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);
    const [snackbar, setSnackbar] = useState<string>('');

    // Dialog State
    const [dialogVisible, setDialogVisible] = useState(false);
    const [currentPharm, setCurrentPharm] = useState<Shift['pharmacyDetail'] | null>(null);
    const [ratingSummary, setRatingSummary] = useState<ShiftRatingSummary | null>(null);
    const [ratingComments, setRatingComments] = useState<ShiftRatingComment[]>([]);
    const [loadingRatings, setLoadingRatings] = useState(false);

    useEffect(() => {
        loadShifts();
    }, []);

    const loadShifts = async () => {
        setLoading(true);
        try {
            const data = await fetchMyConfirmedShifts();
            setShifts(Array.isArray(data) ? data : []);
        } catch (err: any) {
            setSnackbar('Failed to load confirmed shifts');
        } finally {
            setLoading(false);
        }
    };

    const openMap = (address: string) => {
        const query = encodeURIComponent(address);
        const url = Platform.select({
            ios: `maps:0,0?q=${query}`,
            android: `geo:0,0?q=${query}`,
            default: `https://www.google.com/maps/search/?api=1&query=${query}`
        });
        Linking.openURL(url!).catch(() => setSnackbar('Could not open map'));
    };

    const openDialog = async (pharmacy: Shift['pharmacyDetail']) => {
        setCurrentPharm(pharmacy);
        setDialogVisible(true);
        setRatingSummary(null);
        setRatingComments([]);

        if (!pharmacy?.id) return;

        setLoadingRatings(true);
        try {
            const summary = await fetchRatingsSummaryService({
                targetType: 'pharmacy',
                targetId: pharmacy.id,
            });
            setRatingSummary(summary);

            const pageData = await fetchRatingsPageService({
                targetType: 'pharmacy',
                targetId: pharmacy.id,
                page: 1,
            });
            setRatingComments(pageData?.results || []);
        } catch (err) {
            // ignore
        } finally {
            setLoadingRatings(false);
        }
    };

    const closeDialog = () => {
        setDialogVisible(false);
        setCurrentPharm(null);
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
                <Text style={{ color: theme.colors.outline }}>No upcoming confirmed shifts.</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.scroll}>
                {shifts.map((shift) => {
                    const isPharmacist = shift.roleNeeded === 'PHARMACIST';
                    const showBonus = !!shift.ownerAdjustedRate && !isPharmacist;
                    const workloadTags = shift.workloadTags ?? [];
                    const slots = shift.slots ?? [];
                    const pharmacyName = shift.pharmacyDetail?.name ?? 'Pharmacy';
                    const pharmacyAddress = buildFullAddress(shift.pharmacyDetail);

                    let rateLabel = '';
                    if (isPharmacist) {
                        if (shift.rateType === 'FIXED') rateLabel = `Fixed — $${shift.fixedRate}/hr`;
                        else if (shift.rateType === 'FLEXIBLE') rateLabel = 'Flexible';
                        else if (shift.rateType === 'PHARMACIST_PROVIDED') rateLabel = 'Pharmacist Provided';
                        else rateLabel = 'Flexible (Fair Work)';
                    } else {
                        rateLabel = 'Award Rate';
                    }

                    return (
                        <Card key={shift.id} style={styles.card} mode="outlined">
                            <Card.Content>
                                <View style={styles.headerRow}>
                                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                        <Title>{pharmacyName}</Title>
                                        {pharmacyAddress ? (
                                            <IconButton
                                                icon="map-marker"
                                                size={18}
                                                onPress={() => openMap(pharmacyAddress)}
                                                style={{ marginLeft: 4 }}
                                            />
                                        ) : null}
                                        <Paragraph style={{ color: theme.colors.secondary }}>{shift.roleNeeded}</Paragraph>
                                    </View>
                                    <Button
                                        mode="contained"
                                        compact
                                        onPress={() => openDialog(shift.pharmacyDetail)}
                                        style={{ backgroundColor: '#7C3AED' }}
                                    >
                                        Details
                                    </Button>
                                </View>

                                <Divider style={styles.divider} />

                                <View style={styles.infoRow}>
                                    <Text style={{ fontWeight: 'bold' }}>Rate: </Text>
                                    <Text>{rateLabel}</Text>
                                </View>
                                {showBonus && (
                                    <Text style={{ color: 'green', fontWeight: 'bold', marginTop: 4 }}>
                                        Bonus: +${shift.ownerAdjustedRate}/hr
                                    </Text>
                                )}

                                {workloadTags.length > 0 && (
                                    <View style={styles.tagsRow}>
                                        {workloadTags.map(tag => (
                                            <Chip key={tag} style={styles.chip} textStyle={{ fontSize: 10, height: 12, lineHeight: 12 }}>{tag}</Chip>
                                        ))}
                                    </View>
                                )}

                                <View style={styles.slotsContainer}>
                                    {slots.map(slot => (
                                        <View key={slot.id} style={styles.slotRow}>
                                            <IconButton icon="calendar-clock" size={16} />
                                            <Text variant="bodyMedium">
                                                {slot.date} {slot.startTime} – {slot.endTime}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            </Card.Content>
                        </Card>
                    );
                })}
            </ScrollView>

            <Portal>
                <Dialog visible={dialogVisible} onDismiss={closeDialog} style={{ maxHeight: '80%' }}>
                    <Dialog.Title>{currentPharm?.name || 'Pharmacy Details'}</Dialog.Title>
                    <Dialog.ScrollArea>
                        <ScrollView contentContainerStyle={{ paddingVertical: 16 }}>
                            {currentPharm?.streetAddress ? (
                                <View style={{ marginBottom: 16 }}>
                                    <Text style={styles.label}>Address</Text>
                                    <TouchableOpacity onPress={() => openMap(`${currentPharm.streetAddress}, ${currentPharm.suburb || ''}`)}>
                                        <Text style={{ color: theme.colors.primary, textDecorationLine: 'underline' }}>
                                            {currentPharm.streetAddress}
                                            {currentPharm.suburb ? `, ${currentPharm.suburb}` : ''}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            ) : null}

                            {/* Documents */}
                            {[
                                { label: 'Methadone S8 Protocols', url: currentPharm?.methadoneS8Protocols },
                                { label: 'QLD Sump Docs', url: currentPharm?.qldSumpDocs },
                                { label: 'SOPs', url: currentPharm?.sops },
                                { label: 'Induction Guides', url: currentPharm?.inductionGuides },
                            ].map((doc) => doc.url ? (
                                <View key={doc.label} style={{ marginBottom: 8 }}>
                                    <Text style={styles.label}>{doc.label}</Text>
                                    <TouchableOpacity onPress={() => Linking.openURL(doc.url!)}>
                                        <Text style={{ color: theme.colors.primary }}>Download</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : null)}

                            <Divider style={{ marginVertical: 16 }} />

                            <Title style={{ fontSize: 18 }}>Reviews</Title>
                            {loadingRatings ? (
                                <ActivityIndicator style={{ marginTop: 10 }} />
                            ) : (
                                <>
                                    {ratingSummary && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                                            <IconButton icon="star" iconColor="#F59E0B" size={20} />
                                            <Text style={{ fontWeight: 'bold', fontSize: 16 }}>
                                                {ratingSummary.average?.toFixed(1) ?? 'N/A'}
                                            </Text>
                                            <Text style={{ color: '#6B7280', marginLeft: 4 }}>
                                                ({ratingSummary.count} reviews)
                                            </Text>
                                        </View>
                                    )}

                                    {ratingComments.length === 0 ? (
                                        <Text style={{ color: '#6B7280', fontStyle: 'italic' }}>No comments yet.</Text>
                                    ) : (
                                        ratingComments.map(c => (
                                            <View key={c.id} style={styles.commentBox}>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <View style={{ flexDirection: 'row' }}>
                                                        {[1, 2, 3, 4, 5].map(s => (
                                                            <Text key={s} style={{ color: s <= (c.stars || 0) ? '#F59E0B' : '#E5E7EB' }}>★</Text>
                                                        ))}
                                                    </View>
                                                    <Text style={{ fontSize: 10, color: '#9CA3AF' }}>
                                                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ''}
                                                    </Text>
                                                </View>
                                                {c.comment ? <Text style={{ marginTop: 4 }}>{c.comment}</Text> : null}
                                            </View>
                                        ))
                                    )}
                                </>
                            )}
                        </ScrollView>
                    </Dialog.ScrollArea>
                    <Dialog.Actions>
                        <Button onPress={closeDialog}>Close</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>

            <Snackbar
                visible={!!snackbar}
                onDismiss={() => setSnackbar('')}
                duration={3000}
            >
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
    divider: { marginVertical: 12 },
    infoRow: { flexDirection: 'row', marginBottom: 4 },
    tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    chip: { backgroundColor: '#EDE9FE' },
    slotsContainer: { marginTop: 12, backgroundColor: '#F9FAFB', padding: 8, borderRadius: 8 },
    slotRow: { flexDirection: 'row', alignItems: 'center' },
    label: { fontWeight: '700', fontSize: 12, color: '#6B7280', marginBottom: 2 },
    commentBox: { padding: 10, backgroundColor: '#F3F4F6', borderRadius: 8, marginBottom: 8 }
});
