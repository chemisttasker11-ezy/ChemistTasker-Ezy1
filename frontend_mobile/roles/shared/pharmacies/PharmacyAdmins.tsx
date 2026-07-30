// Pharmacy Admins - Mobile
// Manages pharmacy administrators with capability-based permissions

import React, { useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import {
    Card,
    Text,
    Button,
    Chip,
    Portal,
    Modal,
    TextInput,
    ActivityIndicator,
    Snackbar,
    IconButton,
    Menu,
} from 'react-native-paper';
import {
    MembershipDTO,
    PharmacyAdminDTO,
    createPharmacyAdminService,
    deletePharmacyAdminService,
} from '@chemisttasker/shared-core';
import {
    fetchUserRoleByEmail,
    formatExistingUserRole,
    normalizeEmail,
} from './inviteUtils';
import { surfaceTokens } from './types';
import { useAuth } from '../../../context/AuthContext';
import { PendingDirectInvitationsPanel } from './MembershipApplicationsPanel';

type AdminLevel = 'MANAGER' | 'SUPERVISOR' | 'COORDINATOR';
type AdminStaffRole = 'PHARMACIST' | 'TECHNICIAN' | 'ASSISTANT';

const ADMIN_LEVEL_OPTIONS: { value: AdminLevel; label: string }[] = [
    { value: 'MANAGER', label: 'Manager' },
    { value: 'SUPERVISOR', label: 'Supervisor' },
    { value: 'COORDINATOR', label: 'Coordinator' },
];

const STAFF_ROLE_OPTIONS: { value: AdminStaffRole; label: string }[] = [
    { value: 'PHARMACIST', label: 'Pharmacist' },
    { value: 'TECHNICIAN', label: 'Technician' },
    { value: 'ASSISTANT', label: 'Assistant' },
];

type InviteFormState = {
    invited_name: string;
    email: string;
    staff_role: AdminStaffRole;
    admin_level: AdminLevel;
    job_title: string;
};

const DEFAULT_INVITE_FORM: InviteFormState = {
    invited_name: '',
    email: '',
    staff_role: 'PHARMACIST',
    admin_level: 'MANAGER',
    job_title: '',
};

interface PharmacyAdminsProps {
    pharmacyId: string;
    admins: PharmacyAdminDTO[];
    pendingAdminMemberships?: MembershipDTO[];
    onAdminsChanged: () => void;
    loading?: boolean;
    pharmacyName?: string;
}

export default function PharmacyAdmins({
    pharmacyId,
    admins,
    pendingAdminMemberships = [],
    onAdminsChanged,
    loading = false,
    pharmacyName,
}: PharmacyAdminsProps) {
    const { user } = useAuth();

    const [inviteOpen, setInviteOpen] = useState(false);
    const [form, setForm] = useState<InviteFormState>(DEFAULT_INVITE_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [loadingId, setLoadingId] = useState<string | number | null>(null);
    const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' } | null>(
        null
    );
    const [confirmRemove, setConfirmRemove] = useState<PharmacyAdminDTO | null>(null);
    const [existingUserRole, setExistingUserRole] = useState<string | null | undefined>(undefined);
    const [checkingUserRole, setCheckingUserRole] = useState(false);
    const [roleMenuVisible, setRoleMenuVisible] = useState(false);
    const [levelMenuVisible, setLevelMenuVisible] = useState(false);

    const numericPharmacyId = useMemo(() => Number(pharmacyId), [pharmacyId]);

    // Filter out OWNER level admins
    const filteredAdmins = useMemo(() => {
        return (admins || []).filter((admin: any) => admin.admin_level !== 'OWNER' && admin.is_active !== false);
    }, [admins]);

    const showSkeleton = loading && admins.length === 0;

    const resetForm = () => {
        setForm(DEFAULT_INVITE_FORM);
        setExistingUserRole(undefined);
    };

    const handleEmailBlur = useCallback(async () => {
        const email = normalizeEmail(form.email);
        if (!email || !email.includes('@')) {
            setExistingUserRole(null);
            return;
        }

        setCheckingUserRole(true);
        try {
            const role = await fetchUserRoleByEmail(email);
            setExistingUserRole(role);
        } catch {
            setExistingUserRole(null);
        } finally {
            setCheckingUserRole(false);
        }
    }, [form.email]);

    const handleInviteAdmin = async () => {
        if (!form.email || !form.email.includes('@')) {
            setToast({ message: 'Please enter a valid email address.', severity: 'error' });
            return;
        }

        if (!form.invited_name.trim()) {
            setToast({ message: 'Please enter a name.', severity: 'error' });
            return;
        }

        setSubmitting(true);
        try {
            await createPharmacyAdminService({
                pharmacy: numericPharmacyId,
                email: form.email.trim(),
                invited_name: form.invited_name.trim(),
                staff_role: form.staff_role,
                admin_level: form.admin_level,
                job_title: form.job_title.trim() || undefined,
            });

            setToast({ message: 'Admin invited successfully', severity: 'success' });
            setInviteOpen(false);
            resetForm();
            onAdminsChanged();
        } catch (error: any) {
            const detail = error?.response?.data?.detail || error?.message;
            setToast({ message: detail || 'Failed to invite admin', severity: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleRemoveAdmin = async (adminId: string | number) => {
        if (!adminId) return;
        setLoadingId(adminId);
        try {
            await deletePharmacyAdminService(String(adminId));
            setToast({ message: 'Admin removed', severity: 'success' });
            onAdminsChanged();
        } catch (error: any) {
            setToast({
                message: error?.response?.data?.detail || 'Failed to remove admin',
                severity: 'error',
            });
        } finally {
            setLoadingId(null);
            setConfirmRemove(null);
        }
    };

    const getCapabilitiesText = (capabilities: string[] | undefined) => {
        if (!capabilities || capabilities.length === 0) return 'No capabilities';
        return capabilities.join(', ');
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Pharmacy Administrators</Text>
                <Button mode="contained" onPress={() => setInviteOpen(true)} icon="plus" compact>
                    Invite Admin
                </Button>
            </View>

            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                {showSkeleton ? (
                    <View style={styles.skeletonContainer}>
                        {[1, 2].map((i) => (
                            <Card key={i} style={styles.card}>
                                <Card.Content>
                                    <ActivityIndicator />
                                </Card.Content>
                            </Card>
                        ))}
                    </View>
                ) : filteredAdmins.length === 0 ? (
                    <Text style={styles.emptyText}>
                        No administrators yet. Use "Invite Admin" to add administrators.
                    </Text>
                ) : (
                    filteredAdmins.map((admin) => (
                        <Card key={admin.id} style={styles.card}>
                            <Card.Content>
                                <View style={styles.cardHeader}>
                                    <View style={styles.adminInfo}>
                                        <Text style={styles.adminName}>
                                            {admin.invited_name || admin.user_details?.email || 'Admin'}
                                        </Text>
                                        <Text style={styles.adminEmail}>{admin.user_details?.email || admin.email}</Text>
                                    </View>
                                    <IconButton
                                        icon="delete"
                                        iconColor={surfaceTokens.error}
                                        size={20}
                                        onPress={() => setConfirmRemove(admin)}
                                        disabled={loadingId === admin.id}
                                    />
                                </View>
                                <View style={styles.chips}>
                                    <Chip style={styles.chip} mode="outlined" textStyle={styles.chipText}>
                                        {admin.staff_role || 'N/A'}
                                    </Chip>
                                    <Chip style={[styles.chip, styles.levelChip]} textStyle={styles.chipText}>
                                        {admin.admin_level || 'N/A'}
                                    </Chip>
                                </View>
                                {admin.job_title && <Text style={styles.jobTitle}>{admin.job_title}</Text>}
                                <Text style={styles.capabilities}>
                                    {getCapabilitiesText(admin.capabilities)}
                                </Text>
                            </Card.Content>
                        </Card>
                    ))
                )}
            </ScrollView>
            <PendingDirectInvitationsPanel
                memberships={pendingAdminMemberships}
                title="Pending Admin Invitations"
            />

            <Portal>
                <Modal
                    visible={inviteOpen}
                    onDismiss={() => setInviteOpen(false)}
                    contentContainerStyle={styles.modal}
                >
                    <ScrollView>
                        <Text style={styles.modalTitle}>Invite Admin to {pharmacyName || pharmacyId}</Text>

                        <TextInput
                            label="Full Name *"
                            value={form.invited_name}
                            onChangeText={(v) => setForm((prev) => ({ ...prev, invited_name: v }))}
                            mode="outlined"
                            style={styles.input}
                        />

                        <TextInput
                            label="Email *"
                            value={form.email}
                            onChangeText={(v) => setForm((prev) => ({ ...prev, email: v }))}
                            onBlur={handleEmailBlur}
                            mode="outlined"
                            keyboardType="email-address"
                            style={styles.input}
                        />

                        {checkingUserRole && <Text style={styles.helperText}>Checking existing account...</Text>}
                        {!checkingUserRole && existingUserRole && (
                            <Text style={styles.helperText}>{formatExistingUserRole(existingUserRole as any)}</Text>
                        )}

                        <Text style={styles.label}>Staff Role *</Text>
                        <Menu
                            visible={roleMenuVisible}
                            onDismiss={() => setRoleMenuVisible(false)}
                            anchor={
                                <Button
                                    mode="outlined"
                                    onPress={() => setRoleMenuVisible(true)}
                                    style={styles.menuButton}
                                >
                                    {STAFF_ROLE_OPTIONS.find((o) => o.value === form.staff_role)?.label ||
                                        'Select Role'}
                                </Button>
                            }
                        >
                            {STAFF_ROLE_OPTIONS.map((opt) => (
                                <Menu.Item
                                    key={opt.value}
                                    onPress={() => {
                                        setForm((prev) => ({ ...prev, staff_role: opt.value }));
                                        setRoleMenuVisible(false);
                                    }}
                                    title={opt.label}
                                />
                            ))}
                        </Menu>

                        <Text style={styles.label}>Admin Level *</Text>
                        <Menu
                            visible={levelMenuVisible}
                            onDismiss={() => setLevelMenuVisible(false)}
                            anchor={
                                <Button
                                    mode="outlined"
                                    onPress={() => setLevelMenuVisible(true)}
                                    style={styles.menuButton}
                                >
                                    {ADMIN_LEVEL_OPTIONS.find((o) => o.value === form.admin_level)?.label ||
                                        'Select Level'}
                                </Button>
                            }
                        >
                            {ADMIN_LEVEL_OPTIONS.map((opt) => (
                                <Menu.Item
                                    key={opt.value}
                                    onPress={() => {
                                        setForm((prev) => ({ ...prev, admin_level: opt.value }));
                                        setLevelMenuVisible(false);
                                    }}
                                    title={opt.label}
                                />
                            ))}
                        </Menu>

                        <TextInput
                            label="Job Title"
                            value={form.job_title}
                            onChangeText={(v) => setForm((prev) => ({ ...prev, job_title: v }))}
                            mode="outlined"
                            style={styles.input}
                        />

                        <View style={styles.modalActions}>
                            <Button mode="outlined" onPress={() => setInviteOpen(false)} style={styles.modalActionButton}>
                                Cancel
                            </Button>
                            <Button
                                mode="contained"
                                onPress={handleInviteAdmin}
                                loading={submitting}
                                disabled={submitting}
                                style={styles.modalActionButton}
                            >
                                {submitting ? 'Inviting...' : 'Invite Admin'}
                            </Button>
                        </View>
                    </ScrollView>
                </Modal>

                <Modal
                    visible={!!confirmRemove}
                    onDismiss={() => !loadingId && setConfirmRemove(null)}
                    contentContainerStyle={styles.modal}
                >
                    <Text style={styles.modalTitle}>Remove Administrator</Text>
                    <Text>
                        {confirmRemove
                            ? `Remove ${confirmRemove.invited_name || 'this admin'} from this pharmacy? This action can't be undone.`
                            : "This action can't be undone."}
                    </Text>
                    <View style={styles.modalActions}>
                        <Button
                            mode="outlined"
                            onPress={() => setConfirmRemove(null)}
                            disabled={!!loadingId}
                            style={styles.modalActionButton}
                        >
                            Cancel
                        </Button>
                        <Button
                            mode="contained"
                            buttonColor={surfaceTokens.error}
                            onPress={() => confirmRemove && handleRemoveAdmin(confirmRemove.id)}
                            loading={loadingId === confirmRemove?.id}
                            disabled={!!loadingId}
                            style={styles.modalActionButton}
                        >
                            {loadingId === confirmRemove?.id ? 'Removing...' : 'Delete'}
                        </Button>
                    </View>
                </Modal>
            </Portal>

            <Snackbar
                visible={!!toast}
                onDismiss={() => setToast(null)}
                duration={4000}
                action={{ label: 'Dismiss', onPress: () => setToast(null) }}
            >
                {toast?.message}
            </Snackbar>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 16, backgroundColor: surfaceTokens.bgDark },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    headerTitle: { fontSize: 18, fontWeight: '600' },
    list: { flex: 1 },
    listContent: { paddingBottom: 16 },
    skeletonContainer: { gap: 12 },
    card: { marginBottom: 12, backgroundColor: surfaceTokens.bg },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    adminInfo: { flex: 1 },
    adminName: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
    adminEmail: { fontSize: 14, color: surfaceTokens.textMuted, marginBottom: 8 },
    chips: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    chip: { minHeight: 28, paddingHorizontal: 6, justifyContent: 'center' },
    chipText: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
    levelChip: { backgroundColor: surfaceTokens.primary },
    jobTitle: { fontSize: 14, marginBottom: 4 },
    capabilities: { fontSize: 12, color: surfaceTokens.textMuted },
    emptyText: { textAlign: 'center', padding: 32, color: surfaceTokens.textMuted },
    modal: {
        backgroundColor: surfaceTokens.bg,
        padding: 20,
        margin: 20,
        borderRadius: 8,
        maxHeight: '80%',
    },
    modalTitle: { fontSize: 20, fontWeight: '600', marginBottom: 16 },
    input: { marginBottom: 12, backgroundColor: surfaceTokens.bg },
    label: { fontSize: 14, marginBottom: 8, color: surfaceTokens.textMuted },
    menuButton: { marginBottom: 12 },
    helperText: { fontSize: 12, color: surfaceTokens.textMuted, marginBottom: 8 },
    modalActions: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 16,
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
    },
    modalActionButton: {
        flexGrow: 1,
        minWidth: 120,
    },
});
