// Membership Applications Panel - Mobile
// Displays and manages pending membership applications

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import {
    Card,
    Text,
    Button,
    ActivityIndicator,
    Menu,
} from 'react-native-paper';
import {
    fetchMembershipApplicationsService,
    approveMembershipApplicationService,
    rejectMembershipApplicationService,
    type MembershipApplication,
} from '@chemisttasker/shared-core';
import { surfaceTokens } from './types';

const getFirstErrorMessage = (value: unknown): string | null => {
    if (Array.isArray(value)) {
        return typeof value[0] === 'string' ? value[0] : null;
    }
    return null;
};

type ApplicationCategory = 'FULL_PART_TIME' | 'LOCUM_CASUAL';

interface MembershipApplicationsPanelProps {
    pharmacyId: string;
    category: ApplicationCategory;
    title?: string;
    allowedEmploymentTypes?: string[];
    defaultEmploymentType?: string;
    onApproved?: () => void;
    onNotification?: (message: string, severity: 'success' | 'error') => void;
}

export default function MembershipApplicationsPanel({
    pharmacyId,
    category,
    title = 'Pending Applications',
    allowedEmploymentTypes = ['FULL_TIME', 'PART_TIME', 'CASUAL'],
    defaultEmploymentType = 'CASUAL',
    onApproved,
    onNotification,
}: MembershipApplicationsPanelProps) {
    const [applications, setApplications] = useState<MembershipApplication[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [processingId, setProcessingId] = useState<string | number | null>(null);
    const [employmentMenuVisible, setEmploymentMenuVisible] = useState<string | number | null>(null);
    const [selectedEmployment, setSelectedEmployment] = useState<Record<string | number, string>>({});

    const readValue = (app: MembershipApplication, camelKey: string, snakeKey: string) =>
        (app as any)?.[camelKey] ?? (app as any)?.[snakeKey] ?? '';

    const loadApplications = async () => {
        setLoading(true);
        setLoadError('');
        try {
            const results = await fetchMembershipApplicationsService({ status: 'PENDING' });
            const filtered = results.filter(
                (app: MembershipApplication) =>
                    String(app.pharmacy) === String(pharmacyId) && app.category === category
            );
            setApplications(filtered);
        } catch (error: any) {
            console.error('Failed to load applications', error);
            const detail = error?.response?.data?.detail || error?.message || 'Failed to load pending applications.';
            setLoadError(detail);
            onNotification?.(detail, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadApplications();
    }, [pharmacyId, category]);

    const handleApprove = async (applicationId: string | number, employment?: string) => {
        setProcessingId(applicationId);
        try {
            const employmentType = employment || selectedEmployment[applicationId] || defaultEmploymentType;

            await approveMembershipApplicationService(String(applicationId), {
                employment_type: employmentType,
            });

            onNotification?.('Application approved', 'success');
            onApproved?.();
            await loadApplications();
        } catch (error: any) {
            const data = error?.response?.data;
            const firstFieldError =
                data && typeof data === 'object'
                    ? Object.values(data as Record<string, unknown>)
                        .map(getFirstErrorMessage)
                        .find((value): value is string => Boolean(value))
                    : null;
            const detail = data?.detail || firstFieldError || error?.message;
            onNotification?.(detail || 'Failed to approve application', 'error');
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (applicationId: string | number) => {
        setProcessingId(applicationId);
        try {
            await rejectMembershipApplicationService(String(applicationId));
            onNotification?.('Application rejected', 'success');
            await loadApplications();
        } catch (error: any) {
            const data = error?.response?.data;
            const detail = data?.detail || error?.message;
            onNotification?.(detail || 'Failed to reject application', 'error');
        } finally {
            setProcessingId(null);
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={surfaceTokens.primary} />
                <Text>Loading applications...</Text>
            </View>
        );
    }

    if (loadError) {
        return (
            <View style={styles.container}>
                <Text style={styles.errorText}>{loadError}</Text>
            </View>
        );
    }

    if (applications.length === 0) {
        return null; // Don't show panel if no applications
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>{title}</Text>
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                {applications.map((app) => {
                    const applicantName =
                        [app.firstName, app.lastName].filter(Boolean).join(' ') || 'Applicant';
                    const jobTitle = readValue(app, 'jobTitle', 'job_title');
                    const mobileNumber = readValue(app, 'mobileNumber', 'mobile_number');
                    const classification =
                        readValue(app, 'pharmacistAwardLevel', 'pharmacist_award_level') ||
                        readValue(app, 'otherstaffClassificationLevel', 'otherstaff_classification_level') ||
                        readValue(app, 'internHalf', 'intern_half') ||
                        readValue(app, 'studentYear', 'student_year');

                    return (
                        <Card key={app.id} style={styles.card}>
                            <Card.Content>
                                <View style={styles.cardHeader}>
                                    <View style={styles.applicantInfo}>
                                        <Text style={styles.applicantName}>{applicantName}</Text>
                                        <Text style={styles.applicantEmail}>{app.email}</Text>
                                    </View>
                                </View>

                                <View style={styles.details}>
                                    <Text style={styles.detailText}>Role: {app.role || 'N/A'}</Text>
                                    {jobTitle ? <Text style={styles.detailText}>Job title: {jobTitle}</Text> : null}
                                    {mobileNumber ? <Text style={styles.detailText}>Mobile: {mobileNumber}</Text> : null}
                                    {classification ? <Text style={styles.detailText}>Classification: {classification}</Text> : null}
                                </View>

                                {category === 'FULL_PART_TIME' && (
                                    <View style={styles.employmentSelector}>
                                        <Text style={styles.label}>Employment Type:</Text>
                                        <Menu
                                            visible={employmentMenuVisible === app.id}
                                            onDismiss={() => setEmploymentMenuVisible(null)}
                                            anchor={
                                                <Button
                                                    mode="outlined"
                                                    onPress={() => setEmploymentMenuVisible(app.id)}
                                                    compact
                                                >
                                                    {selectedEmployment[app.id] || defaultEmploymentType}
                                                </Button>
                                            }
                                        >
                                            {allowedEmploymentTypes.map((type) => (
                                                <Menu.Item
                                                    key={type}
                                                    onPress={() => {
                                                        setSelectedEmployment((prev) => ({ ...prev, [app.id]: type }));
                                                        setEmploymentMenuVisible(null);
                                                    }}
                                                    title={type.replace('_', ' ')}
                                                />
                                            ))}
                                        </Menu>
                                    </View>
                                )}

                                <View style={styles.actions}>
                                    <Button
                                        mode="contained"
                                        onPress={() => handleApprove(app.id)}
                                        loading={processingId === app.id}
                                        disabled={!!processingId}
                                        compact
                                    >
                                        Approve
                                    </Button>
                                    <Button
                                        mode="outlined"
                                        onPress={() => handleReject(app.id)}
                                        disabled={!!processingId}
                                        compact
                                        textColor={surfaceTokens.error}
                                    >
                                        Reject
                                    </Button>
                                </View>
                            </Card.Content>
                        </Card>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginTop: 24,
        padding: 16,
        backgroundColor: surfaceTokens.bgDark,
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 16,
    },
    loadingContainer: {
        padding: 32,
        alignItems: 'center',
        gap: 12,
    },
    list: {
        maxHeight: 400,
    },
    listContent: {
        paddingBottom: 16,
    },
    card: {
        marginBottom: 12,
        backgroundColor: surfaceTokens.bg,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    applicantInfo: {
        flex: 1,
    },
    applicantName: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    applicantEmail: {
        fontSize: 14,
        color: surfaceTokens.textMuted,
    },
    statusChip: {
        height: 28,
    },
    details: {
        marginBottom: 12,
    },
    detailText: {
        fontSize: 14,
        marginBottom: 4,
    },
    employmentSelector: {
        marginBottom: 12,
    },
    label: {
        fontSize: 14,
        marginBottom: 8,
        color: surfaceTokens.textMuted,
    },
    actions: {
        flexDirection: 'row',
        gap: 8,
    },
    errorText: {
        color: surfaceTokens.error,
        fontSize: 14,
    },
});
