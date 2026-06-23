import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, StyleSheet, View, Alert } from 'react-native';
import { Text, Card, TextInput, Button, ActivityIndicator, Chip, SegmentedButtons, IconButton, HelperText } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
    getMyHistoryShifts,
    getOnboarding,
    generateInvoice,
} from '@chemisttasker/shared-core';
import { useAuth } from '../../../context/AuthContext';

type Shift = {
    id: number;
    pharmacy_name?: string;
    pharmacyName?: string;
    pharmacy_detail?: {
        id: number;
        name: string;
        abn?: string;
    };
    start_datetime?: string;
    end_datetime?: string;
    fixed_rate?: string | number;
};

export default function NewInvoiceScreen() {
    const router = useRouter();
    const { user } = useAuth();

    const [mode, setMode] = useState<'internal' | 'external'>('internal');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Shifts
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null);
    const [loadingShifts, setLoadingShifts] = useState(false);

    // Invoice details
    const today = new Date().toISOString().split('T')[0];
    const [invoiceDate, setInvoiceDate] = useState(today);
    const [dueDate, setDueDate] = useState(today);

    // Issuer details
    const [issuerFirstName, setIssuerFirstName] = useState('');
    const [issuerLastName, setIssuerLastName] = useState('');
    const [issuerAbn, setIssuerAbn] = useState('');

    // Banking details
    const [bankAccountName, setBankAccountName] = useState('');
    const [bsb, setBsb] = useState('');
    const [accountNumber, setAccountNumber] = useState('');

    // Super details
    const [superFundName, setSuperFundName] = useState('');
    const [superUsi, setSuperUsi] = useState('');
    const [superMemberNumber, setSuperMemberNumber] = useState('');

    // External recipient
    const [externalName, setExternalName] = useState('');
    const [externalEmail, setExternalEmail] = useState('');
    const [externalAddress, setExternalAddress] = useState('');

    // Load issuer details
    useEffect(() => {
        if (!user) return;
        const role = user.role?.toLowerCase() || 'pharmacist';
        getOnboarding(role)
            .then((res: any) => {
                setIssuerFirstName(res.first_name || '');
                setIssuerLastName(res.last_name || '');
                setIssuerAbn(res.abn || '');
            })
            .catch(err => console.error('Failed to load onboarding:', err));
    }, [user]);

    // Load shifts for internal mode
    useEffect(() => {
        if (mode !== 'internal') return;

        setLoadingShifts(true);
        getMyHistoryShifts({ payment_preference: 'ABN' })
            .then((res: any) => {
                const arr = Array.isArray(res?.results) ? res.results : Array.isArray(res) ? res : [];
                setShifts(arr);
            })
            .catch(err => {
                console.error('Failed to load shifts:', err);
                Alert.alert('Error', 'Failed to load completed shifts');
            })
            .finally(() => setLoadingShifts(false));
    }, [mode]);

    const selectedShift = shifts.find(s => s.id === selectedShiftId);

    const handleGenerate = async () => {
        // Validation
        if (mode === 'internal' && !selectedShiftId) {
            Alert.alert('Missing Information', 'Please select a shift');
            return;
        }

        if (!issuerFirstName || !issuerLastName || !issuerAbn) {
            Alert.alert('Missing Information', 'Please complete your profile details');
            return;
        }

        if (!bankAccountName || !bsb || !accountNumber) {
            Alert.alert('Missing Information', 'Please provide banking details');
            return;
        }

        if (mode === 'external' && (!externalName || !externalEmail)) {
            Alert.alert('Missing Information', 'Please provide recipient details');
            return;
        }

        setSubmitting(true);

        try {
            const formData: any = {
                issuer_first_name: issuerFirstName,
                issuer_last_name: issuerLastName,
                issuer_email: user?.email || '',
                issuer_abn: issuerAbn,
                gst_registered: '1',
                super_fund_name: superFundName,
                super_usi: superUsi,
                super_member_number: superMemberNumber,
                bank_account_name: bankAccountName,
                bsb: bsb,
                account_number: accountNumber,
                invoice_date: invoiceDate,
                due_date: dueDate,
            };

            if (mode === 'internal' && selectedShift) {
                formData.pharmacy = String(selectedShift.pharmacy_detail?.id || '');
                formData.shift_ids = JSON.stringify([selectedShiftId]);
            } else {
                formData.external = 'true';
                formData.custom_bill_to_name = externalName;
                formData.custom_bill_to_address = externalAddress;
                formData.bill_to_email = externalEmail;
            }

            // Note: The mobile implementation is simplified. The web version has
            // complex line item management. Here we let the backend auto-generate
            // line items from the shift.

            await generateInvoice(formData as any);
            Alert.alert('Success', 'Invoice generated successfully', [
                { text: 'OK', onPress: () => router.back() }
            ]);
        } catch (err: any) {
            console.error('Failed to generate invoice:', err);
            Alert.alert('Error', err?.message || 'Failed to generate invoice');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={['left', 'right']}>
            <View style={styles.header}>
                <IconButton icon="arrow-left" onPress={() => router.back()} />
                <Text variant="titleLarge" style={styles.headerTitle}>Generate Invoice</Text>
                <View style={{ width: 48 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Mode Selector */}
                <Card style={styles.card}>
                    <Card.Content>
                        <Text variant="titleMedium" style={styles.sectionTitle}>Invoice Type</Text>
                        <SegmentedButtons
                            value={mode}
                            onValueChange={(value) => setMode(value as 'internal' | 'external')}
                            buttons={[
                                { value: 'internal', label: 'Internal (From Shift)' },
                                { value: 'external', label: 'External' },
                            ]}
                            style={styles.segmentButtons}
                            theme={{ colors: { secondaryContainer: '#EEF2FF', onSecondaryContainer: '#6366F1' } }}
                        />
                    </Card.Content>
                </Card>

                {/* Dates */}
                <Card style={styles.card}>
                    <Card.Content>
                        <Text variant="titleMedium" style={styles.sectionTitle}>Invoice Dates</Text>
                        <TextInput
                            label="Invoice Date"
                            value={invoiceDate}
                            onChangeText={setInvoiceDate}
                            mode="outlined"
                            style={styles.input}
                            placeholder="YYYY-MM-DD"
                        />
                        <TextInput
                            label="Due Date"
                            value={dueDate}
                            onChangeText={setDueDate}
                            mode="outlined"
                            style={styles.input}
                            placeholder="YYYY-MM-DD"
                        />
                    </Card.Content>
                </Card>

                {/* Shift Selection (Internal Mode) */}
                {mode === 'internal' && (
                    <Card style={styles.card}>
                        <Card.Content>
                            <Text variant="titleMedium" style={styles.sectionTitle}>Select Completed Shift</Text>
                            {loadingShifts ? (
                                <ActivityIndicator size="small" color="#6366F1" style={{ marginVertical: 16 }} />
                            ) : shifts.length === 0 ? (
                                <Text style={styles.muted}>No completed shifts found</Text>
                            ) : (
                                shifts.map(shift => (
                                    <Card
                                        key={shift.id}
                                        style={[
                                            styles.shiftCard,
                                            selectedShiftId === shift.id && styles.shiftCardSelected
                                        ]}
                                        onPress={() => setSelectedShiftId(shift.id)}
                                    >
                                        <Card.Content style={styles.shiftCardContent}>
                                            <View style={styles.shiftCardHeader}>
                                                <Text variant="titleSmall">{shift.pharmacy_name || shift.pharmacyName || 'Pharmacy'}</Text>
                                                {selectedShiftId === shift.id && (
                                                    <Chip mode="flat" compact textStyle={{ color: '#6366F1', fontSize: 11 }}>Selected</Chip>
                                                )}
                                            </View>
                                            <Text variant="bodySmall" style={styles.muted}>
                                                {shift.start_datetime ? new Date(shift.start_datetime).toLocaleDateString() : 'N/A'}
                                            </Text>
                                        </Card.Content>
                                    </Card>
                                ))
                            )}
                        </Card.Content>
                    </Card>
                )}

                {/* External Recipient (External Mode) */}
                {mode === 'external' && (
                    <Card style={styles.card}>
                        <Card.Content>
                            <Text variant="titleMedium" style={styles.sectionTitle}>Bill To</Text>
                            <TextInput
                                label="Recipient Name *"
                                value={externalName}
                                onChangeText={setExternalName}
                                mode="outlined"
                                style={styles.input}
                            />
                            <TextInput
                                label="Recipient Email *"
                                value={externalEmail}
                                onChangeText={setExternalEmail}
                                mode="outlined"
                                style={styles.input}
                                keyboardType="email-address"
                                autoCapitalize="none"
                            />
                            <TextInput
                                label="Recipient Address"
                                value={externalAddress}
                                onChangeText={setExternalAddress}
                                mode="outlined"
                                style={styles.input}
                                multiline
                                numberOfLines={2}
                            />
                        </Card.Content>
                    </Card>
                )}

                {/* Banking Details */}
                <Card style={styles.card}>
                    <Card.Content>
                        <Text variant="titleMedium" style={styles.sectionTitle}>Banking Details</Text>
                        <TextInput
                            label="Account Name *"
                            value={bankAccountName}
                            onChangeText={setBankAccountName}
                            mode="outlined"
                            style={styles.input}
                        />
                        <TextInput
                            label="BSB *"
                            value={bsb}
                            onChangeText={setBsb}
                            mode="outlined"
                            style={styles.input}
                            keyboardType="numeric"
                            maxLength={6}
                        />
                        <TextInput
                            label="Account Number *"
                            value={accountNumber}
                            onChangeText={setAccountNumber}
                            mode="outlined"
                            style={styles.input}
                            keyboardType="numeric"
                        />
                    </Card.Content>
                </Card>

                {/* Superannuation */}
                <Card style={styles.card}>
                    <Card.Content>
                        <Text variant="titleMedium" style={styles.sectionTitle}>Superannuation (Optional)</Text>
                        <TextInput
                            label="Super Fund Name"
                            value={superFundName}
                            onChangeText={setSuperFundName}
                            mode="outlined"
                            style={styles.input}
                        />
                        <TextInput
                            label="USI"
                            value={superUsi}
                            onChangeText={setSuperUsi}
                            mode="outlined"
                            style={styles.input}
                        />
                        <TextInput
                            label="Member Number"
                            value={superMemberNumber}
                            onChangeText={setSuperMemberNumber}
                            mode="outlined"
                            style={styles.input}
                        />
                    </Card.Content>
                </Card>

                {/* Generate Button */}
                <Button
                    mode="contained"
                    onPress={handleGenerate}
                    loading={submitting}
                    disabled={submitting}
                    buttonColor="#6366F1"
                    style={styles.generateButton}
                    contentStyle={styles.generateButtonContent}
                >
                    Generate Invoice
                </Button>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingVertical: 8,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    headerTitle: {
        fontWeight: 'bold',
        color: '#111827',
    },
    content: {
        padding: 16,
    },
    card: {
        marginBottom: 16,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        elevation: 2,
    },
    sectionTitle: {
        fontWeight: 'bold',
        marginBottom: 12,
        color: '#111827',
    },
    input: {
        marginBottom: 12,
        backgroundColor: '#FFFFFF',
    },
    segmentButtons: {
        marginTop: 8,
    },
    shiftCard: {
        marginBottom: 8,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: '#E5E7EB',
        elevation: 0,
    },
    shiftCardSelected: {
        borderColor: '#6366F1',
        backgroundColor: '#EEF2FF',
    },
    shiftCardContent: {
        paddingVertical: 12,
    },
    shiftCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    muted: {
        color: '#6B7280',
    },
    generateButton: {
        marginTop: 8,
        marginBottom: 24,
        borderRadius: 12,
    },
    generateButtonContent: {
        paddingVertical: 8,
    },
});
