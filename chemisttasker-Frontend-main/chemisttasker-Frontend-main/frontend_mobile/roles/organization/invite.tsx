import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Checkbox,
  Chip,
  HelperText,
  IconButton,
  Menu,
  Modal,
  Portal,
  Snackbar,
  Text,
  TextInput,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  deleteOrganizationMembership,
  fetchPharmaciesService,
  getOrganizationMemberships,
  getOrganizationRoleDefinitions,
  inviteOrgUser,
  updateOrganizationMembership,
} from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import { surfaceTokens } from '@/roles/shared/pharmacies/types';

type RoleDefinition = {
  key: string;
  label: string;
  description?: string;
  default_admin_level: string;
  allowed_admin_levels: string[];
  requires_job_title: boolean;
  requires_region: boolean;
  requires_pharmacies: boolean;
  capabilities?: string[];
};

type AdminLevelDefinition = {
  key: string;
  label: string;
  description?: string;
  capabilities?: string[];
};

type PharmacyOption = {
  id: number;
  name: string;
};

type OrganizationMember = {
  id: number;
  role: string;
  role_label?: string;
  admin_level: string;
  admin_level_label?: string;
  job_title?: string | null;
  region?: string | null;
  user?: {
    id?: number;
    email?: string;
    name?: string;
    first_name?: string;
    last_name?: string;
  } | null;
  pharmacies?: PharmacyOption[];
};

type MemberForm = {
  id: number;
  role: string;
  admin_level: string;
  job_title: string;
  region: string;
  pharmacy_ids: number[];
};

const ORG_ROLES = ['ORG_ADMIN', 'ORG_OWNER', 'ORG_STAFF', 'CHIEF_ADMIN', 'REGION_ADMIN', 'ORGANIZATION'];

const normalizeList = (value: any) =>
  Array.isArray(value?.results) ? value.results : Array.isArray(value) ? value : [];

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/(^|\s)\S/g, (match) => match.toUpperCase());

const memberName = (member: OrganizationMember) => {
  const firstLast = [member.user?.first_name, member.user?.last_name].filter(Boolean).join(' ');
  return member.user?.name || firstLast || member.user?.email || 'Organization member';
};

export default function OrganizationInviteScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingMember, setSavingMember] = useState(false);
  const [deletingMember, setDeletingMember] = useState(false);
  const [roleDefinitions, setRoleDefinitions] = useState<RoleDefinition[]>([]);
  const [adminLevelMap, setAdminLevelMap] = useState<Record<string, AdminLevelDefinition>>({});
  const [pharmacies, setPharmacies] = useState<PharmacyOption[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedAdminLevel, setSelectedAdminLevel] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [region, setRegion] = useState('');
  const [selectedPharmacyIds, setSelectedPharmacyIds] = useState<number[]>([]);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(true);
  const [memberSearch, setMemberSearch] = useState('');
  const [editForm, setEditForm] = useState<MemberForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrganizationMember | null>(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  const orgMembership = useMemo(() => {
    const memberships = Array.isArray((user as any)?.memberships) ? (user as any).memberships : [];
    return memberships.find((membership: any) => {
      const role = String(membership?.role || '').toUpperCase();
      return Number.isFinite(Number(membership?.organization_id ?? membership?.organizationId)) && ORG_ROLES.includes(role);
    }) ?? null;
  }, [user]);

  const orgId = orgMembership?.organization_id ?? orgMembership?.organizationId ?? null;
  const inviterCapabilities = useMemo(
    () => new Set<string>(Array.isArray(orgMembership?.capabilities) ? orgMembership.capabilities : []),
    [orgMembership]
  );
  const canInvite = inviterCapabilities.has('invite_staff') || String(user?.role || '').toUpperCase() === 'ORGANIZATION';

  const eligibleRoles = useMemo(
    () =>
      roleDefinitions.filter((definition) => {
        if (definition.key === 'ORG_ADMIN') return inviterCapabilities.has('claim_pharmacy') || canInvite;
        return true;
      }),
    [canInvite, inviterCapabilities, roleDefinitions]
  );

  const selectedRoleDefinition = useMemo(
    () => eligibleRoles.find((definition) => definition.key === selectedRole) ?? null,
    [eligibleRoles, selectedRole]
  );

  const selectedAdminDefinition = selectedAdminLevel ? adminLevelMap[selectedAdminLevel] ?? null : null;

  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return members;
    return members.filter((member) =>
      [
        memberName(member),
        member.user?.email,
        member.role_label,
        member.admin_level_label,
        member.job_title,
        member.region,
      ].some((value) => value && value.toLowerCase().includes(query))
    );
  }, [memberSearch, members]);

  const loadMembers = useCallback(async () => {
    if (!orgId) return;
    setMembersLoading(true);
    try {
      const response = await getOrganizationMemberships({ organization: orgId, limit: 200 });
      setMembers(normalizeList(response));
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Unable to load organization members.');
    } finally {
      setMembersLoading(false);
    }
  }, [orgId]);

  const loadMetadata = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [roleResponse, pharmaciesResponse] = await Promise.all([
        getOrganizationRoleDefinitions(),
        fetchPharmaciesService({ organization: orgId, limit: 200 }),
      ]);
      const adminLevels: AdminLevelDefinition[] = (roleResponse as any)?.admin_levels ?? [];
      const roles: RoleDefinition[] = (roleResponse as any)?.roles ?? [];
      const levelMap = adminLevels.reduce<Record<string, AdminLevelDefinition>>((acc, level) => {
        acc[level.key] = level;
        return acc;
      }, {});
      const pharmacyList = normalizeList(pharmaciesResponse).map((item: any) => ({
        id: Number(item.id),
        name: item.name || `Pharmacy #${item.id}`,
      }));

      setRoleDefinitions(roles);
      setAdminLevelMap(levelMap);
      setPharmacies(pharmacyList);
      if (!selectedRole && roles.length) {
        setSelectedRole(roles[0].key);
      }
      await loadMembers();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Unable to load organization invite data.');
    } finally {
      setLoading(false);
    }
  }, [loadMembers, orgId, selectedRole]);

  useEffect(() => {
    void loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    if (!selectedRoleDefinition) return;
    if (!selectedRoleDefinition.allowed_admin_levels.includes(selectedAdminLevel)) {
      setSelectedAdminLevel(selectedRoleDefinition.default_admin_level);
    }
    if (!selectedRoleDefinition.requires_job_title) setJobTitle('');
    if (!selectedRoleDefinition.requires_region) setRegion('');
    if (!selectedRoleDefinition.requires_pharmacies) setSelectedPharmacyIds([]);
  }, [selectedAdminLevel, selectedRoleDefinition]);

  useEffect(() => {
    if (selectedRoleDefinition?.key === 'REGION_ADMIN' && selectedAdminLevel === 'ROSTER_MANAGER') {
      setWarning('Roster Managers can manage shifts but cannot invite or manage staff.');
      return;
    }
    setWarning('');
  }, [selectedAdminLevel, selectedRoleDefinition?.key]);

  const togglePharmacy = (id: number, setter: (ids: number[]) => void, currentIds: number[]) => {
    const next = currentIds.includes(id)
      ? currentIds.filter((item) => item !== id)
      : [...currentIds, id];
    setter(next);
  };

  const validateInvite = () => {
    if (!selectedRoleDefinition) return 'Select an organization role.';
    if (!email.trim()) return 'Email is required.';
    if (!selectedAdminLevel) return 'Select an admin level.';
    if (selectedRoleDefinition.requires_job_title && !jobTitle.trim()) return 'Job title is required for this role.';
    if (selectedRoleDefinition.requires_region && !region.trim()) return 'Region is required for this role.';
    if (selectedRoleDefinition.requires_pharmacies && selectedPharmacyIds.length === 0) {
      return 'Select at least one pharmacy for this role.';
    }
    return '';
  };

  const handleInvite = async () => {
    const validation = validateInvite();
    if (validation) {
      setError(validation);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        email: email.trim().toLowerCase(),
        organization: orgId,
        role: selectedRole,
        admin_level: selectedAdminLevel,
      };
      if (selectedRoleDefinition?.requires_job_title) payload.job_title = jobTitle.trim();
      if (selectedRoleDefinition?.requires_region) payload.region = region.trim();
      if (selectedRoleDefinition?.requires_pharmacies) payload.pharmacies = selectedPharmacyIds;
      await inviteOrgUser(payload);
      setToast('Invitation sent successfully.');
      setEmail('');
      setJobTitle('');
      setRegion('');
      setSelectedPharmacyIds([]);
      await loadMembers();
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        (typeof err?.response?.data === 'object' ? JSON.stringify(err.response.data) : null);
      setError(detail || 'Failed to send invite.');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (member: OrganizationMember) => {
    setEditForm({
      id: member.id,
      role: member.role,
      admin_level: member.admin_level,
      job_title: member.job_title ?? '',
      region: member.region ?? '',
      pharmacy_ids: (member.pharmacies ?? []).map((pharmacy) => pharmacy.id),
    });
  };

  const handleSaveMember = async () => {
    if (!editForm) return;
    const definition = roleDefinitions.find((role) => role.key === editForm.role);
    if (!definition) {
      setError('Invalid role selection.');
      return;
    }
    if (definition.requires_job_title && !editForm.job_title.trim()) {
      setError('Job title is required for this role.');
      return;
    }
    if (definition.requires_region && !editForm.region.trim()) {
      setError('Region is required for this role.');
      return;
    }
    if (definition.requires_pharmacies && editForm.pharmacy_ids.length === 0) {
      setError('Select at least one pharmacy.');
      return;
    }

    setSavingMember(true);
    setError('');
    try {
      await updateOrganizationMembership(editForm.id, {
        role: editForm.role,
        admin_level: editForm.admin_level,
        job_title: editForm.job_title.trim() || null,
        region: editForm.region.trim() || null,
        pharmacy_ids: editForm.pharmacy_ids,
      });
      setToast('Member updated.');
      setEditForm(null);
      await loadMembers();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to update member.');
    } finally {
      setSavingMember(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!deleteTarget) return;
    setDeletingMember(true);
    setError('');
    try {
      await deleteOrganizationMembership(deleteTarget.id);
      setToast('Member removed.');
      setDeleteTarget(null);
      await loadMembers();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to remove member.');
    } finally {
      setDeletingMember(false);
    }
  };

  const renderMember = ({ item }: { item: OrganizationMember }) => {
    const isSelf = item.user?.id != null && item.user.id === user?.id;
    return (
      <Card style={styles.memberCard}>
        <Card.Content>
          <View style={styles.memberHeader}>
            <View style={{ flex: 1 }}>
              <Text variant="titleSmall" style={styles.memberName}>
                {memberName(item)}
              </Text>
              {item.user?.email ? <Text style={styles.memberEmail}>{item.user.email}</Text> : null}
            </View>
            <View style={styles.memberActions}>
              <IconButton icon="pencil" size={20} onPress={() => openEdit(item)} />
              <IconButton
                icon="delete"
                size={20}
                iconColor={surfaceTokens.error}
                disabled={isSelf}
                onPress={() => setDeleteTarget(item)}
              />
            </View>
          </View>
          <View style={styles.chipRow}>
            <Chip compact style={styles.roleChip}>{item.role_label || titleCase(item.role)}</Chip>
            <Chip compact mode="outlined">{item.admin_level_label || titleCase(item.admin_level)}</Chip>
          </View>
          {[item.job_title, item.region].filter(Boolean).length ? (
            <Text style={styles.memberMeta}>{[item.job_title, item.region].filter(Boolean).join(' | ')}</Text>
          ) : null}
          {(item.pharmacies ?? []).length > 0 ? (
            <View style={styles.pharmacyChipRow}>
              {(item.pharmacies ?? []).map((pharmacy) => (
                <Chip key={pharmacy.id} compact mode="outlined" style={styles.pharmacyChip}>
                  {pharmacy.name}
                </Chip>
              ))}
            </View>
          ) : null}
        </Card.Content>
      </Card>
    );
  };

  if (!orgId) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No organization membership found for this account.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <FlatList
        data={filteredMembers}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderMember}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.headerStack}>
            <View style={styles.header}>
              <View style={styles.headerIcon}>
                <IconButton icon="account-plus" size={28} iconColor="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="headlineSmall" style={styles.title}>Invite Staff</Text>
                <Text style={styles.subtitle}>Manage organization roles, permissions, and pharmacy access.</Text>
              </View>
            </View>

            {!canInvite ? (
              <Card style={styles.warningCard}>
                <Card.Content>
                  <Text style={styles.warningText}>
                    You do not currently have permission to send invitations. Contact an organization admin for access.
                  </Text>
                </Card.Content>
              </Card>
            ) : null}
            {warning ? <HelperText type="info">{warning}</HelperText> : null}
            {error ? <HelperText type="error">{error}</HelperText> : null}

            <Card style={styles.card}>
              <TouchableOpacity style={styles.cardTitleRow} onPress={() => setFormOpen((open) => !open)}>
                <Text variant="titleMedium" style={styles.cardTitle}>Invite Organization Member</Text>
                <IconButton icon={formOpen ? 'chevron-up' : 'chevron-down'} size={22} />
              </TouchableOpacity>
              {formOpen ? (
                <Card.Content style={styles.formContent}>
                  {loading ? (
                    <ActivityIndicator />
                  ) : (
                    <>
                      <TextInput
                        label="Email"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        mode="outlined"
                        style={styles.input}
                      />

                      <Menu
                        visible={roleMenuOpen}
                        onDismiss={() => setRoleMenuOpen(false)}
                        anchor={
                          <Button mode="outlined" onPress={() => setRoleMenuOpen(true)} style={styles.selectorButton}>
                            {selectedRoleDefinition?.label || 'Select role'}
                          </Button>
                        }
                      >
                        {eligibleRoles.map((role) => (
                          <Menu.Item
                            key={role.key}
                            title={role.label}
                            onPress={() => {
                              setSelectedRole(role.key);
                              setRoleMenuOpen(false);
                            }}
                          />
                        ))}
                      </Menu>
                      {selectedRoleDefinition?.description ? (
                        <Text style={styles.helpText}>{selectedRoleDefinition.description}</Text>
                      ) : null}

                      <Menu
                        visible={adminMenuOpen}
                        onDismiss={() => setAdminMenuOpen(false)}
                        anchor={
                          <Button mode="outlined" onPress={() => setAdminMenuOpen(true)} style={styles.selectorButton}>
                            {selectedAdminDefinition?.label || 'Select admin level'}
                          </Button>
                        }
                      >
                        {(selectedRoleDefinition?.allowed_admin_levels ?? []).map((levelKey) => (
                          <Menu.Item
                            key={levelKey}
                            title={adminLevelMap[levelKey]?.label || titleCase(levelKey)}
                            onPress={() => {
                              setSelectedAdminLevel(levelKey);
                              setAdminMenuOpen(false);
                            }}
                          />
                        ))}
                      </Menu>
                      {selectedAdminDefinition?.description ? (
                        <Text style={styles.helpText}>{selectedAdminDefinition.description}</Text>
                      ) : null}

                      {selectedRoleDefinition?.requires_job_title ? (
                        <TextInput label="Job Title" value={jobTitle} onChangeText={setJobTitle} mode="outlined" style={styles.input} />
                      ) : null}
                      {selectedRoleDefinition?.requires_region ? (
                        <TextInput label="Region" value={region} onChangeText={setRegion} mode="outlined" style={styles.input} />
                      ) : null}
                      {selectedRoleDefinition?.requires_pharmacies ? (
                        <View style={styles.pharmacyPicker}>
                          <Text style={styles.sectionLabel}>Pharmacies</Text>
                          {pharmacies.map((pharmacy) => (
                            <Checkbox.Item
                              key={pharmacy.id}
                              label={pharmacy.name}
                              status={selectedPharmacyIds.includes(pharmacy.id) ? 'checked' : 'unchecked'}
                              onPress={() => togglePharmacy(pharmacy.id, setSelectedPharmacyIds, selectedPharmacyIds)}
                              style={styles.checkboxItem}
                            />
                          ))}
                        </View>
                      ) : null}

                      <Button mode="contained" onPress={handleInvite} loading={submitting} disabled={!canInvite || submitting} style={styles.primaryButton}>
                        Send Invite
                      </Button>
                    </>
                  )}
                </Card.Content>
              ) : null}
            </Card>

            <View style={styles.memberListHeader}>
              <Text variant="titleMedium" style={styles.cardTitle}>Organization Members</Text>
              <IconButton icon="refresh" onPress={loadMembers} disabled={membersLoading} />
            </View>
            <TextInput
              label="Search members"
              value={memberSearch}
              onChangeText={setMemberSearch}
              mode="outlined"
              left={<TextInput.Icon icon="filter" />}
              style={styles.input}
            />
            {membersLoading ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null}
          </View>
        }
        ListEmptyComponent={
          !membersLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No organization members found.</Text>
            </View>
          ) : null
        }
      />

      <Portal>
        <Modal visible={!!editForm} onDismiss={() => !savingMember && setEditForm(null)} contentContainerStyle={styles.modal}>
          <ScrollView>
            <Text variant="titleLarge" style={styles.modalTitle}>Edit Organization Member</Text>
            {editForm ? (
              <>
                <Text style={styles.sectionLabel}>Role</Text>
                <View style={styles.optionGrid}>
                  {roleDefinitions.map((role) => (
                    <Chip
                      key={role.key}
                      selected={editForm.role === role.key}
                      onPress={() => {
                        const nextDefinition = roleDefinitions.find((item) => item.key === role.key);
                        setEditForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                role: role.key,
                                admin_level: nextDefinition?.allowed_admin_levels.includes(prev.admin_level)
                                  ? prev.admin_level
                                  : nextDefinition?.default_admin_level || prev.admin_level,
                                job_title: nextDefinition?.requires_job_title ? prev.job_title : '',
                                region: nextDefinition?.requires_region ? prev.region : '',
                                pharmacy_ids: nextDefinition?.requires_pharmacies ? prev.pharmacy_ids : [],
                              }
                            : prev
                        );
                      }}
                      style={editForm.role === role.key ? styles.selectedChip : undefined}
                    >
                      {role.label}
                    </Chip>
                  ))}
                </View>

                <Text style={styles.sectionLabel}>Admin Level</Text>
                <View style={styles.optionGrid}>
                  {(roleDefinitions.find((role) => role.key === editForm.role)?.allowed_admin_levels ?? []).map((levelKey) => (
                    <Chip
                      key={levelKey}
                      selected={editForm.admin_level === levelKey}
                      onPress={() => setEditForm((prev) => (prev ? { ...prev, admin_level: levelKey } : prev))}
                      style={editForm.admin_level === levelKey ? styles.selectedChip : undefined}
                    >
                      {adminLevelMap[levelKey]?.label || titleCase(levelKey)}
                    </Chip>
                  ))}
                </View>

                {roleDefinitions.find((role) => role.key === editForm.role)?.requires_job_title ? (
                  <TextInput
                    label="Job Title"
                    value={editForm.job_title}
                    onChangeText={(value) => setEditForm((prev) => (prev ? { ...prev, job_title: value } : prev))}
                    mode="outlined"
                    style={styles.input}
                  />
                ) : null}
                {roleDefinitions.find((role) => role.key === editForm.role)?.requires_region ? (
                  <TextInput
                    label="Region"
                    value={editForm.region}
                    onChangeText={(value) => setEditForm((prev) => (prev ? { ...prev, region: value } : prev))}
                    mode="outlined"
                    style={styles.input}
                  />
                ) : null}
                {roleDefinitions.find((role) => role.key === editForm.role)?.requires_pharmacies ? (
                  <View style={styles.pharmacyPicker}>
                    <Text style={styles.sectionLabel}>Pharmacies</Text>
                    {pharmacies.map((pharmacy) => (
                      <Checkbox.Item
                        key={pharmacy.id}
                        label={pharmacy.name}
                        status={editForm.pharmacy_ids.includes(pharmacy.id) ? 'checked' : 'unchecked'}
                        onPress={() =>
                          setEditForm((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  pharmacy_ids: prev.pharmacy_ids.includes(pharmacy.id)
                                    ? prev.pharmacy_ids.filter((id) => id !== pharmacy.id)
                                    : [...prev.pharmacy_ids, pharmacy.id],
                                }
                              : prev
                          )
                        }
                        style={styles.checkboxItem}
                      />
                    ))}
                  </View>
                ) : null}
                <View style={styles.modalActions}>
                  <Button mode="outlined" onPress={() => setEditForm(null)} disabled={savingMember}>Cancel</Button>
                  <Button mode="contained" onPress={handleSaveMember} loading={savingMember} disabled={savingMember}>Save</Button>
                </View>
              </>
            ) : null}
          </ScrollView>
        </Modal>

        <Modal visible={!!deleteTarget} onDismiss={() => !deletingMember && setDeleteTarget(null)} contentContainerStyle={styles.modal}>
          <Text variant="titleLarge" style={styles.modalTitle}>Remove Organization Member</Text>
          <Text>
            {deleteTarget ? `Remove ${memberName(deleteTarget)} from the organization?` : 'Remove this member from the organization?'}
          </Text>
          <View style={styles.modalActions}>
            <Button mode="outlined" onPress={() => setDeleteTarget(null)} disabled={deletingMember}>Cancel</Button>
            <Button mode="contained" buttonColor={surfaceTokens.error} onPress={handleDeleteMember} loading={deletingMember} disabled={deletingMember}>
              Remove
            </Button>
          </View>
        </Modal>
      </Portal>

      <Snackbar visible={!!toast} onDismiss={() => setToast('')} duration={3000}>
        {toast}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16, paddingBottom: 40 },
  headerStack: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#111827', fontWeight: '800' },
  subtitle: { color: '#6B7280', marginTop: 3, lineHeight: 19 },
  warningCard: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1 },
  warningText: { color: '#92400E' },
  card: { borderRadius: 16, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16 },
  cardTitle: { color: '#111827', fontWeight: '700' },
  formContent: { gap: 10, paddingTop: 0 },
  input: { backgroundColor: '#FFFFFF' },
  selectorButton: { alignSelf: 'stretch', borderColor: '#D1D5DB' },
  helpText: { color: '#6B7280', fontSize: 12, lineHeight: 18 },
  sectionLabel: { color: '#374151', fontWeight: '700', marginBottom: 8, marginTop: 4 },
  pharmacyPicker: { gap: 4 },
  checkboxItem: { paddingHorizontal: 0, backgroundColor: '#FFFFFF' },
  primaryButton: { marginTop: 6, backgroundColor: '#6366F1' },
  memberListHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  memberCard: { marginTop: 12, borderRadius: 14, backgroundColor: '#FFFFFF' },
  memberHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  memberName: { color: '#111827', fontWeight: '700' },
  memberEmail: { color: '#6B7280', marginTop: 2, fontSize: 12 },
  memberActions: { flexDirection: 'row', alignItems: 'center' },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 10 },
  roleChip: { backgroundColor: '#EEF2FF' },
  memberMeta: { color: '#6B7280', marginTop: 8 },
  pharmacyChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  pharmacyChip: { backgroundColor: '#F9FAFB' },
  emptyState: { padding: 24, alignItems: 'center' },
  emptyText: { color: '#6B7280', textAlign: 'center' },
  modal: { backgroundColor: '#FFFFFF', margin: 20, padding: 20, borderRadius: 14, maxHeight: '86%' },
  modalTitle: { color: '#111827', fontWeight: '800', marginBottom: 16 },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  selectedChip: { backgroundColor: '#EEF2FF' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
});
