// Staff Manager - Mobile
// Complete staff management with filters, invite, and remove functionality
// Exact web parity with all hooks and API calls

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View, ScrollView } from 'react-native';
import * as Clipboard from 'expo-clipboard';
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
    Divider,
} from 'react-native-paper';
import {
    Role,
    WorkType,
    MembershipDTO,
    UserPortalRole,
    coerceRole,
    coerceWorkType,
    requiredUserRoleForMembership,
    createMembershipInviteLinkService,
    deleteMembershipService,
    bulkInviteMembersService,
} from '@chemisttasker/shared-core';
import {
    describeRoleMismatch,
    fetchUserRoleByEmail,
    formatExistingUserRole,
    normalizeEmail,
} from './inviteUtils';
import { surfaceTokens } from './types';
import MembershipApplicationsPanel, { PendingDirectInvitationsPanel } from './MembershipApplicationsPanel';
import { useAuth } from '../../../context/AuthContext';

const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CASUAL'] as const;
const employmentNeedsJobTitle = (value: string) =>
    value === 'FULL_TIME' || value === 'PART_TIME';

const ROLE_OPTIONS: { value: Role; label: string }[] = [
    { value: 'PHARMACIST', label: 'Pharmacist' },
    { value: 'INTERN', label: 'Intern Pharmacist' },
    { value: 'TECHNICIAN', label: 'Dispensary Technician' },
    { value: 'ASSISTANT', label: 'Pharmacy Assistant' },
    { value: 'STUDENT', label: 'Pharmacy Student' },
];

type InviteRowState = {
    email: string;
    invited_name: string;
    role: Role;
    employment_type: (typeof EMPLOYMENT_TYPES)[number];
    job_title: string;
    existingUserRole?: UserPortalRole | null;
    checking?: boolean;
    error?: string | null;
};

const createInviteRow = (): InviteRowState => ({
    email: '',
    invited_name: '',
    role: 'PHARMACIST',
    employment_type: 'FULL_TIME',
    job_title: '',
    existingUserRole: undefined,
    checking: false,
    error: null,
});

const getRoleChipColor = (role: Role): string => {
    switch (role) {
        case 'PHARMACIST':
            return surfaceTokens.success;
        case 'TECHNICIAN':
            return surfaceTokens.info;
        case 'ASSISTANT':
            return surfaceTokens.warning;
        case 'INTERN':
        case 'STUDENT':
        default:
            return surfaceTokens.textMuted;
    }
};

type Staff = {
    id: string | number;
    name: string;
    email?: string;
    role: Role;
    workType: WorkType;
    jobTitle?: string | null;
};

type StaffManagerProps = {
    pharmacyId: string;
    memberships: MembershipDTO[];
    onMembershipsChanged: () => void;
    loading?: boolean;
    pharmacyName?: string;
    category?: 'staff' | 'locum';
    onMessageMember?: (memberId: string | number) => void;
    messagingMemberId?: string | number | null;
};

const membershipStatus = (membership: MembershipDTO) =>
    String((membership as any).status || '').toUpperCase();

const membershipIsActive = (membership: MembershipDTO) =>
    ((membership as any).is_active ?? (membership as any).isActive) !== false;

const membershipIsAccepted = (membership: MembershipDTO) => {
    const status = membershipStatus(membership);
    return !['PENDING', 'REJECTED', 'LEFT'].includes(status) && membershipIsActive(membership);
};

export default function StaffManager({
    pharmacyId,
    memberships,
    onMembershipsChanged,
    loading = false,
    pharmacyName,
    category,
    onMessageMember,
    messagingMemberId = null,
}: StaffManagerProps) {
    const { user } = useAuth();
    const baseInviteUrl = process.env.EXPO_PUBLIC_WEB_URL?.trim() || 'https://www.chemisttasker.com';

    // Derive staff from memberships
    const derivedStaff: Staff[] = useMemo(() => {
        const currentUserId = typeof user?.id === 'number' ? user.id : null;
        const currentEmail = normalizeEmail(user?.email || '');
        return (memberships || [])
            .filter((m: any) => {
                // Runtime data might be camelCase, cast to any to access safely
                const isOwner = m.isPharmacyOwner ?? m.is_pharmacy_owner;
                if (isOwner) return false;
                if ((m.isPharmacyAdmin ?? m.is_pharmacy_admin) === true) return false;
                if (!membershipIsAccepted(m)) return false;

                // Exclude current user
                const uDetails = m.userDetails ?? m.user_details;
                const membershipUserId = typeof m.user === 'number' ? m.user : (uDetails?.id ?? null);
                const membershipEmail = normalizeEmail(uDetails?.email || m.email || '');
                const isSelf =
                    (currentUserId !== null && membershipUserId === currentUserId) ||
                    (!!currentEmail && currentEmail === membershipEmail);

                return !isSelf;
            })
            .map((inputM: any) => {
                // Cast to any to handle runtime camelCase vs compile-time snake_case mismatch
                const m = inputM;

                // Extract properties handling both snake_case (type def) and camelCase (runtime)
                const uDetails = m.userDetails ?? m.user_details;
                const invitedName = m.invitedName ?? m.invited_name;
                const employmentType = m.employmentType ?? m.employment_type;
                const mRole = m.role;



                const jobTitle = m.jobTitle ?? m.job_title;

                // Name extraction: Fallback to username if first/last missing
                const userFirst = uDetails?.firstName ?? uDetails?.first_name;
                const userLast = uDetails?.lastName ?? uDetails?.last_name;
                const username = uDetails?.username;

                const userFull = [userFirst, userLast].filter(Boolean).join(' ');

                const fullName =
                    invitedName ||
                    userFull ||
                    username ||
                    m.name ||
                    'Team Member';

                const email = uDetails?.email || m.email;

                // Robust coercion
                const rawType = String(employmentType || '').toUpperCase().trim();
                const safeType = (['FULL_TIME', 'PART_TIME', 'CASUAL', 'LOCUM', 'SHIFT_HERO'].includes(rawType)
                    ? rawType
                    : 'CASUAL') as WorkType;

                const rawRole = String(mRole || '').toUpperCase().trim();
                const safeRole = (['PHARMACIST', 'INTERN', 'TECHNICIAN', 'ASSISTANT', 'STUDENT'].includes(rawRole)
                    ? rawRole
                    : 'PHARMACIST') as Role;

                return {
                    id: m.id,
                    name: fullName,
                    email,
                    role: safeRole,
                    workType: safeType,
                    jobTitle: m.job_title ?? null,
                };
            });
    }, [memberships, user?.id, user?.email]);



    const [list, setList] = useState<Staff[]>(derivedStaff);
    useEffect(() => setList(derivedStaff), [derivedStaff]);

    // Filters and sorting
    const [sortBy, setSortBy] = useState<'role' | 'workType'>('role');
    const [filterRole, setFilterRole] = useState<Role | 'ALL'>('ALL');
    const [filterWork, setFilterWork] = useState<WorkType | 'ALL'>('ALL');
    const [sortMenuVisible, setSortMenuVisible] = useState(false);
    const [roleMenuVisible, setRoleMenuVisible] = useState(false);
    const [workMenuVisible, setWorkMenuVisible] = useState(false);

    const data = useMemo(() => {
        const copy = [...list];
        copy.sort((a, b) => (a[sortBy] > b[sortBy] ? 1 : -1));
        return copy.filter(
            (s) =>
                (filterRole === 'ALL' || s.role === filterRole) &&
                (filterWork === 'ALL' || s.workType === filterWork)
        );
    }, [list, sortBy, filterRole, filterWork]);

    // Invite state
    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteRows, setInviteRows] = useState<InviteRowState[]>([createInviteRow()]);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [activeMenu, setActiveMenu] = useState<{ idx: number; type: 'role' } | null>(null);
    const [inviteSubmitting, setInviteSubmitting] = useState(false);

    // Link generation
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkExpiry, setLinkExpiry] = useState('14');
    const [linkValue, setLinkValue] = useState('');
    const [linkSubmitting, setLinkSubmitting] = useState(false);

    // Delete state
    const [confirmRemove, setConfirmRemove] = useState<Staff | null>(null);
    const [deleteLoadingId, setDeleteLoadingId] = useState<string | number | null>(null);

    // Toast
    const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
    const handleApplicationsNotification = useCallback(
        (message: string, severity: 'success' | 'error') => {
            setToast({ message, severity });
        },
        []
    );

    const showSkeleton = loading && memberships.length === 0;

    // Invite handlers
    const resetInviteForm = () => {
        setInviteRows([createInviteRow()]);
        setInviteError(null);
    };

    const handleInviteFieldChange = (
        idx: number,
        field: keyof InviteRowState,
        value: string
    ) => {
        setInviteRows((prev) => {
            const next = [...prev];
            const current = next[idx];
            if (!current) return prev;
            let updated: InviteRowState = { ...current, [field]: value } as InviteRowState;
            if (field === 'email') {
                updated.existingUserRole = undefined;
                updated.error = null;
            }
            if (field === 'role') {
                updated.error = describeRoleMismatch(value as Role, updated.existingUserRole);
            }
            if (field === 'employment_type' && !employmentNeedsJobTitle(value)) {
                updated = { ...updated, job_title: '' };
            }
            next[idx] = updated;
            return next;
        });
    };

    const refreshInviteRowUserRole = useCallback(
        async (idx: number) => {
            const targetRow = inviteRows[idx];
            if (!targetRow) return;
            const email = normalizeEmail(targetRow.email);
            if (!email || !email.includes('@')) {
                setInviteRows((prev) => {
                    const next = [...prev];
                    if (!next[idx]) return prev;
                    next[idx] = { ...next[idx], existingUserRole: null, checking: false, error: null };
                    return next;
                });
                return;
            }

            setInviteRows((prev) => {
                const next = [...prev];
                const row = next[idx];
                if (!row) return prev;
                next[idx] = { ...row, checking: true, error: null };
                return next;
            });

            try {
                const fetchedRole = await fetchUserRoleByEmail(email);
                setInviteRows((prev) => {
                    const next = [...prev];
                    const row = next[idx];
                    if (!row || normalizeEmail(row.email) !== email) return prev;
                    next[idx] = {
                        ...row,
                        checking: false,
                        existingUserRole: fetchedRole,
                        error: describeRoleMismatch(row.role, fetchedRole),
                    };
                    return next;
                });
            } catch {
                setInviteRows((prev) => {
                    const next = [...prev];
                    const row = next[idx];
                    if (!row || normalizeEmail(row.email) !== email) return prev;
                    next[idx] = {
                        ...row,
                        checking: false,
                        existingUserRole: null,
                        error: null,
                    };
                    return next;
                });
            }
        },
        [inviteRows]
    );

    const addInviteRow = () => setInviteRows((rows) => [...rows, createInviteRow()]);
    const removeInviteRow = (idx: number) =>
        setInviteRows((rows) => {
            const next = rows.filter((_, i) => i !== idx);
            return next.length ? next : [createInviteRow()];
        });

    const openLinkDialog = () => {
        setLinkExpiry('14');
        setLinkValue('');
        setLinkOpen(true);
    };

    const handleSendInvites = async () => {
        let rows = inviteRows.map((row) => ({
            ...row,
            email: row.email.trim(),
        }));
        setInviteError(null);
        const rowsWithEmail = rows.filter((row) => row.email);
        if (!rowsWithEmail.length) {
            setInviteError('Please fill out at least one invite.');
            return;
        }

        setInviteSubmitting(true);
        let hasErrors = false;
        for (let idx = 0; idx < rows.length; idx += 1) {
            const row = rows[idx];
            if (!row.email) continue;

            const normalizedEmail = normalizeEmail(row.email);
            if (!normalizedEmail || !normalizedEmail.includes('@')) {
                rows[idx] = { ...row, error: 'Please enter a valid email address.', checking: false };
                hasErrors = true;
                continue;
            }

            let userRole = row.existingUserRole;
            if (typeof userRole === 'undefined') {
                try {
                    userRole = await fetchUserRoleByEmail(normalizedEmail);
                } catch {
                    userRole = null;
                }
            }

            const mismatch = describeRoleMismatch(row.role, userRole);
            if (mismatch) hasErrors = true;

            if (employmentNeedsJobTitle(row.employment_type) && !row.job_title.trim()) {
                rows[idx] = {
                    ...row,
                    checking: false,
                    existingUserRole: userRole ?? null,
                    error: 'Job title is required for full or part-time staff.',
                };
                hasErrors = true;
                continue;
            }

            rows[idx] = {
                ...row,
                checking: false,
                existingUserRole: userRole ?? null,
                error: mismatch,
            };
        }

        setInviteRows(rows);
        if (hasErrors) {
            setInviteError('One or more invitations need attention before sending.');
            setInviteSubmitting(false);
            return;
        }

        const payload = rows
            .filter((row) => row.email)
            .map((row) => ({
                email: row.email,
                invited_name: row.invited_name,
                role: row.role,
                employment_type: row.employment_type,
                pharmacy: pharmacyId,
                job_title: employmentNeedsJobTitle(row.employment_type)
                    ? row.job_title.trim()
                    : undefined,
            }));

        try {
            const response = await bulkInviteMembersService({ invitations: payload });
            const errors = (response as any)?.errors;
            if (Array.isArray(errors) && errors.length > 0) {
                const nextRows = [...rows];
                let fallbackError: string | null = null;

                errors.forEach((entry: any) => {
                    const message =
                        entry?.error ||
                        entry?.detail ||
                        (typeof entry === 'string' ? entry : 'Failed to send invitations.');
                    const lineIndex =
                        typeof entry?.line === 'number' && entry.line > 0 ? entry.line - 1 : -1;
                    if (lineIndex >= 0 && nextRows[lineIndex]) {
                        nextRows[lineIndex] = {
                            ...nextRows[lineIndex],
                            error: message,
                            checking: false,
                        };
                    } else if (!fallbackError) {
                        fallbackError = message;
                    }
                });

                setInviteRows(nextRows);
                setInviteError(fallbackError);
                if ((response as any)?.results?.length) {
                    setToast({ message: 'Some invitations were sent.', severity: 'success' });
                    onMembershipsChanged();
                }
            } else {
                setToast({ message: 'Invitations sent!', severity: 'success' });
                setInviteOpen(false);
                resetInviteForm();
                onMembershipsChanged();
            }
        } catch (error: any) {
            const detail =
                error?.response?.data?.detail ||
                error?.response?.data?.errors?.[0]?.error ||
                error?.message;
            setInviteError(detail || 'Failed to send invitations.');
        } finally {
            setInviteSubmitting(false);
        }
    };

    // Link generation
    const handleGenerateLink = async () => {
        setLinkSubmitting(true);
        try {
            const expires = Number(linkExpiry) || 14;
            const response = await createMembershipInviteLinkService({
                pharmacy: pharmacyId,
                category: 'FULL_PART_TIME',
                expires_in_days: expires,
            });
            const token = response?.token ?? response?.data?.token ?? response;
            const url = `${baseInviteUrl}/membership/apply/${token}`;
            setLinkValue(url);
            setToast({ message: 'Invite link generated', severity: 'success' });
        } catch (error: any) {
            setToast({ message: error?.response?.data?.detail || 'Failed to generate link.', severity: 'error' });
        } finally {
            setLinkSubmitting(false);
        }
    };

    const handleCopyLink = async () => {
        if (!linkValue) return;
        try {
            await Clipboard.setStringAsync(linkValue);
            setToast({ message: 'Link copied to clipboard', severity: 'success' });
        } catch {
            setToast({ message: 'Unable to copy link', severity: 'error' });
        }
        setLinkOpen(false);
    };

    // Remove staff
    const handleRemoveMembership = async (id: string | number) => {
        if (!id) return;
        setDeleteLoadingId(id);
        try {
            await deleteMembershipService(String(id));
            setToast({ message: 'Staff removed', severity: 'success' });
            onMembershipsChanged();
        } catch (error: any) {
            setToast({ message: error?.response?.data?.detail || 'Failed to remove', severity: 'error' });
        } finally {
            setDeleteLoadingId(null);
            setConfirmRemove(null);
        }
    };

    const renderStaffItem = useCallback(
        ({ item }: { item: Staff }) => (
            <Card key={item.id} style={styles.card}>
                <Card.Content style={styles.cardContent}>
                    <View style={styles.cardHeader}>
                        <View style={styles.chips}>
                            <Chip
                                style={[styles.chip, { backgroundColor: getRoleChipColor(item.role) }]}
                                textStyle={styles.chipText}
                            >
                                {item.role.replace('_', ' ')}
                            </Chip>
                            <Chip style={styles.chip} mode="outlined" textStyle={styles.chipText}>
                                {item.workType.replace('_', ' ')}
                            </Chip>
                        </View>
                        <View style={styles.staffInfo}>
                            <Text style={styles.staffName}>{item.name}</Text>
                            {(item.jobTitle || item.email) && (
                                <Text style={styles.staffDetails}>
                                    {[item.jobTitle, item.email].filter(Boolean).join(' | ')}
                                </Text>
                            )}
                        </View>
                    </View>
                    <IconButton
                        icon="delete"
                        iconColor={surfaceTokens.error}
                        size={20}
                        onPress={() => setConfirmRemove(item)}
                        disabled={deleteLoadingId === item.id}
                        style={styles.deleteButton}
                    />
                    <View style={styles.cardActions}>
                        {onMessageMember ? (
                            <Button
                                mode="text"
                                onPress={() => onMessageMember(item.id)}
                                loading={messagingMemberId === item.id}
                                disabled={messagingMemberId === item.id}
                                compact
                            >
                                Message
                            </Button>
                        ) : null}
                    </View>
                </Card.Content>
            </Card>
        ),
        [deleteLoadingId, messagingMemberId, onMessageMember]
    );

    return (
        <View style={styles.container}>
            {/* Filters and Actions */}
            <View style={styles.filtersRow}>
                <Menu
                    visible={sortMenuVisible}
                    onDismiss={() => setSortMenuVisible(false)}
                    anchor={
                        <Button mode="outlined" onPress={() => setSortMenuVisible(true)} compact>
                            Sort: {sortBy === 'role' ? 'Role' : 'Work Type'}
                        </Button>
                    }
                >
                    <Menu.Item onPress={() => { setSortBy('role'); setSortMenuVisible(false); }} title="Sort by Role" />
                    <Menu.Item onPress={() => { setSortBy('workType'); setSortMenuVisible(false); }} title="Sort by Work Type" />
                </Menu>

                <Menu
                    visible={roleMenuVisible}
                    onDismiss={() => setRoleMenuVisible(false)}
                    anchor={
                        <Button mode="outlined" onPress={() => setRoleMenuVisible(true)} compact>
                            Role: {filterRole === 'ALL' ? 'All' : filterRole}
                        </Button>
                    }
                >
                    <Menu.Item onPress={() => { setFilterRole('ALL'); setRoleMenuVisible(false); }} title="All Roles" />
                    {ROLE_OPTIONS.map((opt) => (
                        <Menu.Item
                            key={opt.value}
                            onPress={() => { setFilterRole(opt.value); setRoleMenuVisible(false); }}
                            title={opt.label}
                        />
                    ))}
                </Menu>

                <Menu
                    visible={workMenuVisible}
                    onDismiss={() => setWorkMenuVisible(false)}
                    anchor={
                        <Button mode="outlined" onPress={() => setWorkMenuVisible(true)} compact>
                            Work: {filterWork === 'ALL' ? 'All' : filterWork}
                        </Button>
                    }
                >
                    <Menu.Item onPress={() => { setFilterWork('ALL'); setWorkMenuVisible(false); }} title="All Types" />
                    {EMPLOYMENT_TYPES.map((type) => (
                        <Menu.Item
                            key={type}
                            onPress={() => { setFilterWork(type as WorkType); setWorkMenuVisible(false); }}
                            title={type.replace('_', ' ')}
                        />
                    ))}
                </Menu>
            </View>

            <View style={styles.actionsRow}>
                <Button mode="contained" onPress={() => { resetInviteForm(); setInviteOpen(true); }} icon="plus">
                    Invite Staff
                </Button>
                <Button mode="outlined" onPress={openLinkDialog} icon="link">
                    Generate Link
                </Button>
            </View>

            {showSkeleton ? (
                <View style={styles.skeletonContainer}>
                    {[1, 2, 3].map((i) => (
                        <Card key={i} style={styles.card}>
                            <Card.Content>
                                <ActivityIndicator />
                            </Card.Content>
                        </Card>
                    ))}
                </View>
            ) : (
                <FlatList
                    data={data}
                    renderItem={renderStaffItem}
                    keyExtractor={(item) => String(item.id)}
                    style={styles.list}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <Text style={styles.emptyText}>No staff yet. Use "Invite Staff" to add members.</Text>
                    }
                />
            )}

            {/* Invite Modal - Simplified for mobile */}
            <Portal>
                <Modal
                    visible={inviteOpen}
                    onDismiss={() => setInviteOpen(false)}
                    contentContainerStyle={styles.modal}
                >
                    <ScrollView>
                        <Text style={styles.modalTitle}>Invite Staff to {pharmacyName || pharmacyId}</Text>
                        {inviteError ? <Text style={styles.dialogErrorText}>{inviteError}</Text> : null}
                        {inviteRows.map((row, idx) => (
                            <View key={idx} style={styles.inviteRow}>
                                <TextInput
                                    label="Full Name"
                                    value={row.invited_name}
                                    onChangeText={(v) => handleInviteFieldChange(idx, 'invited_name', v)}
                                    mode="outlined"
                                    style={styles.inviteIdentityInput}
                                    outlineStyle={styles.inviteIdentityInputOutline}
                                />
                                <TextInput
                                    label="Email *"
                                    value={row.email}
                                    onChangeText={(v) => handleInviteFieldChange(idx, 'email', v)}
                                    onBlur={() => void refreshInviteRowUserRole(idx)}
                                    mode="outlined"
                                    keyboardType="email-address"
                                    style={styles.inviteIdentityInput}
                                    outlineStyle={styles.inviteIdentityInputOutline}
                                    error={!!row.error}
                                />

                                <View style={styles.rowInputs}>
                                    <View style={{ flex: 1 }}>
                                        <Menu
                                            visible={activeMenu?.idx === idx && activeMenu?.type === 'role'}
                                            onDismiss={() => setActiveMenu(null)}
                                            anchor={
                                                <Button
                                                    mode="outlined"
                                                    onPress={() => setActiveMenu({ idx, type: 'role' })}
                                                    style={{ marginBottom: 8 }}
                                                >
                                                    {ROLE_OPTIONS.find(r => r.value === row.role)?.label || row.role}
                                                </Button>
                                            }
                                        >
                                            {ROLE_OPTIONS.map((opt) => (
                                                <Menu.Item
                                                    key={opt.value}
                                                    onPress={() => {
                                                        handleInviteFieldChange(idx, 'role', opt.value);
                                                        setActiveMenu(null);
                                                    }}
                                                    title={opt.label}
                                                />
                                            ))}
                                        </Menu>
                                    </View>
                                </View>

                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                                    {EMPLOYMENT_TYPES.map((type) => (
                                        <Chip
                                            key={type}
                                            selected={row.employment_type === type}
                                            onPress={() => handleInviteFieldChange(idx, 'employment_type', type)}
                                            mode={row.employment_type === type ? 'flat' : 'outlined'}
                                            style={{ backgroundColor: row.employment_type === type ? surfaceTokens.primaryLight : undefined }}
                                        >
                                            {type.replace('_', ' ')}
                                        </Chip>
                                    ))}
                                </View>

                                {employmentNeedsJobTitle(row.employment_type) && (
                                    <TextInput
                                        label="Job Title *"
                                        value={row.job_title}
                                        onChangeText={(v) => handleInviteFieldChange(idx, 'job_title', v)}
                                        mode="outlined"
                                        style={styles.input}
                                    />
                                )}



                                {row.checking && <Text style={styles.helperText}>Checking existing account...</Text>}
                                {row.error && <Text style={styles.errorText}>{row.error}</Text>}
                                {!row.checking && !row.error && formatExistingUserRole(row.existingUserRole) && (
                                    <Text style={styles.helperText}>{formatExistingUserRole(row.existingUserRole)}</Text>
                                )}
                                {inviteRows.length > 1 && (
                                    <Button mode="text" onPress={() => removeInviteRow(idx)} textColor={surfaceTokens.error}>
                                        Remove
                                    </Button>
                                )}
                                <Divider style={styles.divider} />
                            </View>
                        ))}
                        <Button onPress={addInviteRow}>Add Another</Button>
                        <View style={styles.modalActions}>
                            <Button mode="outlined" onPress={() => setInviteOpen(false)} style={styles.modalActionButton}>
                                Cancel
                            </Button>
                            <Button
                                mode="contained"
                                onPress={handleSendInvites}
                                loading={inviteSubmitting}
                                disabled={inviteSubmitting}
                                style={styles.modalActionButton}
                            >
                                {inviteSubmitting ? 'Sending...' : 'Send Invitations'}
                            </Button>
                        </View>
                    </ScrollView>
                </Modal>

                {/* Link Modal */}
                <Modal
                    visible={linkOpen}
                    onDismiss={() => setLinkOpen(false)}
                    contentContainerStyle={styles.modal}
                >
                    <Text style={styles.modalTitle}>Generate Invite Link</Text>
                    <TextInput
                        label="Expiry (days)"
                        value={linkExpiry}
                        onChangeText={setLinkExpiry}
                        keyboardType="numeric"
                        mode="outlined"
                        style={styles.input}
                    />
                    {linkValue && (
                        <TextInput
                            label="Invite Link"
                            value={linkValue}
                            mode="outlined"
                            editable={false}
                            style={styles.input}
                        />
                    )}
                    <View style={styles.modalActions}>
                        <Button mode="outlined" onPress={() => setLinkOpen(false)} style={styles.modalActionButton}>
                            Close
                        </Button>
                        <Button
                            mode="contained"
                            onPress={handleGenerateLink}
                            loading={linkSubmitting}
                            disabled={linkSubmitting}
                            style={styles.modalActionButton}
                        >
                            {linkSubmitting ? 'Generating...' : 'Generate'}
                        </Button>
                        <Button mode="contained" onPress={handleCopyLink} disabled={!linkValue} style={styles.modalActionButton}>
                            Copy & Close
                        </Button>
                    </View>
                </Modal>

                {/* Delete Confirmation */}
                <Modal
                    visible={!!confirmRemove}
                    onDismiss={() => !deleteLoadingId && setConfirmRemove(null)}
                    contentContainerStyle={styles.modal}
                >
                    <Text style={styles.modalTitle}>Remove Member</Text>
                    <Text>
                        {confirmRemove
                            ? `Remove ${confirmRemove.name} from this pharmacy? This action can't be undone.`
                            : "This action can't be undone."}
                    </Text>
                    <View style={styles.modalActions}>
                        <Button
                            mode="outlined"
                            onPress={() => setConfirmRemove(null)}
                            disabled={!!deleteLoadingId}
                            style={styles.modalActionButton}
                        >
                            Cancel
                        </Button>
                        <Button
                            mode="contained"
                            buttonColor={surfaceTokens.error}
                            onPress={() => confirmRemove && handleRemoveMembership(confirmRemove.id)}
                            loading={deleteLoadingId === confirmRemove?.id}
                            disabled={!!deleteLoadingId}
                            style={styles.modalActionButton}
                        >
                            {deleteLoadingId === confirmRemove?.id ? 'Removing...' : 'Delete'}
                        </Button>
                    </View>
                </Modal>
            </Portal>

            {/* Snackbar */}
            <Snackbar
                visible={!!toast}
                onDismiss={() => setToast(null)}
                duration={4000}
                action={{ label: 'Dismiss', onPress: () => setToast(null) }}
            >
                {toast?.message}
            </Snackbar>

            <MembershipApplicationsPanel
                pharmacyId={pharmacyId}
                category="FULL_PART_TIME"
                title="Pending Staff Applications"
                allowedEmploymentTypes={Array.from(EMPLOYMENT_TYPES)}
                defaultEmploymentType="CASUAL"
                onApproved={onMembershipsChanged}
                onNotification={handleApplicationsNotification}
            />
            <PendingDirectInvitationsPanel
                memberships={memberships.filter((m: any) => !(m.isPharmacyAdmin ?? m.is_pharmacy_admin))}
                title="Pending Staff Invitations"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 16, backgroundColor: surfaceTokens.bgDark },
    filtersRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
    actionsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    list: { flex: 1 },
    listContent: { paddingBottom: 16 },
    skeletonContainer: { gap: 12 },
    card: { marginBottom: 12, backgroundColor: surfaceTokens.bg },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 12,
        paddingHorizontal: 8,
    },
    cardHeader: {
        flex: 1,
        justifyContent: 'center',
    },
    chips: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
        flexWrap: 'wrap',
    },
    chip: {
        minHeight: 28,
        paddingHorizontal: 6,
        justifyContent: 'center',
    },
    chipText: {
        fontSize: 11,
        lineHeight: 14,
        fontWeight: '600',
    },
    staffInfo: {
        justifyContent: 'center',
    },
    staffName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1F2937',
    },
    staffDetails: {
        fontSize: 12,
        color: surfaceTokens.textMuted,
        marginTop: 2,
    },
    deleteButton: {
        margin: 0,
        marginLeft: 8,
    },
    cardActions: {
        justifyContent: 'center',
        alignItems: 'flex-end',
    },
    emptyText: { textAlign: 'center', padding: 32, color: surfaceTokens.textMuted },
    modal: { backgroundColor: surfaceTokens.bg, padding: 20, margin: 20, borderRadius: 8, maxHeight: '80%' },
    modalTitle: { fontSize: 20, fontWeight: '600', marginBottom: 16 },
    inviteRow: { marginBottom: 16 },
    input: { marginBottom: 8, backgroundColor: surfaceTokens.bg },
    inviteIdentityInput: {
        marginTop: 6,
        marginBottom: 12,
        minHeight: 58,
        backgroundColor: surfaceTokens.bg,
    },
    inviteIdentityInputOutline: {
        borderRadius: 12,
    },
    rowInputs: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    helperText: { fontSize: 12, color: surfaceTokens.textMuted, marginBottom: 4 },
    errorText: { fontSize: 12, color: surfaceTokens.error, marginBottom: 4 },
    dialogErrorText: { fontSize: 13, color: surfaceTokens.error, marginBottom: 12 },
    divider: { marginVertical: 8 },
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

