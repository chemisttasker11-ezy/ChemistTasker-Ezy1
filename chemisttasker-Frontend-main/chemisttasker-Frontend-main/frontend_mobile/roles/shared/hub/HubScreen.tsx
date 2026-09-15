import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Button,
  Chip,
  Card,
  Divider,
  HelperText,
  Modal,
  Portal,
  Snackbar,
  Text,
  TextInput,
  Checkbox,
  IconButton,
  Menu,
} from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  createHubGroup,
  deleteHubGroup,
  fetchHubContext,
  fetchOrganizationGroupMembers,
  fetchOrganizationMembers,
  fetchHubGroup,
  fetchPharmacyGroupMembers,
  updateHubGroup,
  updatePharmacyHubProfile,
  updateOrganizationHubProfile,
} from './api';
import type {
  HubChemistTaskerHub,
  HubContext,
  HubGroup,
  HubGroupMemberOption,
  HubGroupPayload,
  HubOrganization,
  HubPharmacy,
} from './types';
import HubPlaceholder from './HubPlaceholder';
import { HubFeed } from './HubFeed';
import { useAuth } from '@/context/AuthContext';

type Scope =
  | { type: 'pharmacy'; id: number }
  | { type: 'organization'; id: number }
  | { type: 'group'; id: number }
  | { type: 'orgGroup'; id: number }
  | { type: 'platform'; id: string };

type ViewSelection =
  | { type: 'pharmacy'; id: number } // Pharmacy home
  | { type: 'organization'; id: number } // Organization home
  | { type: 'group'; id: number } // Community group (cross pharmacies)
  | { type: 'orgGroup'; id: number } // Org community group
  | { type: 'platform'; id: string } // ChemistTasker hub
  | null;

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="titleSmall" style={styles.sectionTitle}>
        {title}
      </Text>
    </View>
  );
}

function PillButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
    >
      <Text style={active ? styles.pillActiveText : styles.pillInactiveText}>{label}</Text>
    </TouchableOpacity>
  );
}

type GroupFormState = {
  id?: number;
  name: string;
  description: string;
  memberIds: number[];
};

const STAFF_EMPLOYMENT_TYPES = new Set(['FULL_TIME', 'PART_TIME', 'CASUAL']);
const filterPharmacyStaffMembers = (members: HubGroupMemberOption[]) =>
  members.filter((member: any) => STAFF_EMPLOYMENT_TYPES.has(member?.employmentType || member?.employment_type || ''));
const isEmailLike = (value?: string | null) => Boolean(value && value.includes('@'));
const getMemberDisplayName = (member: any, fallback = 'Member') => {
  const firstLast = `${member?.firstName ?? member?.first_name ?? ''} ${member?.lastName ?? member?.last_name ?? ''}`.trim();
  const candidates = [
    member?.fullName,
    member?.full_name,
    firstLast,
    member?.invitedName,
    member?.invited_name,
    member?.username,
  ];
  for (const candidate of candidates) {
    const value = typeof candidate === 'string' ? candidate.trim() : '';
    if (value && !isEmailLike(value)) {
      return value;
    }
  }
  const id = member?.membershipId ?? member?.membership_id ?? member?.id;
  return id ? `${fallback} ${id}` : fallback;
};

export default function HubScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const pathname = usePathname();
  const searchParams = useLocalSearchParams<{
    scope?: string;
    pharmacy_id?: string;
    organization_id?: string;
    group_id?: string;
    platform_hub?: string;
    post?: string;
  }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hub, setHub] = useState<HubContext | null>(null);
  const [selection, setSelection] = useState<ViewSelection>(null);
  const [activePharmacyId, setActivePharmacyId] = useState<number | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<number | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [groupModalScope, setGroupModalScope] = useState<ViewSelection>(null);
  const [groupForm, setGroupForm] = useState<GroupFormState>({
    name: '',
    description: '',
    memberIds: [],
  });
  const [memberOptions, setMemberOptions] = useState<HubGroupMemberOption[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [roleMenuVisible, setRoleMenuVisible] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [groupMenu, setGroupMenu] = useState<{ id: number; type: 'group' | 'orgGroup' } | null>(null);
  const [pharmacyProfileVisible, setPharmacyProfileVisible] = useState(false);
  const [organizationProfileVisible, setOrganizationProfileVisible] = useState(false);
  const [profileInitialAbout, setProfileInitialAbout] = useState('');
  const [profileInitialCover, setProfileInitialCover] = useState<string | null>(null);
  const [profileAbout, setProfileAbout] = useState('');
  const [profileCover, setProfileCover] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [profilecoverImage, setProfilecoverImage] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const defaultPharmacyCover = 'https://placehold.co/1200x400/4F46E5/FFFFFF?text=Pharmacy+Hub';
  const defaultOrgCover = 'https://placehold.co/1200x400/0EA5E9/FFFFFF?text=Organization+Hub';
  const defaultPlatformCover = 'https://placehold.co/1200x400/111827/FFFFFF?text=ChemistTasker+Hub';
  const imageMediaTypes = (ImagePicker as any).MediaType?.Images ?? ImagePicker.MediaTypeOptions.Images;
  const targetPostId = useMemo(() => {
    const raw = searchParams.post;
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }, [searchParams.post]);

  const clearDeepLinkParams = useCallback(() => {
    router.replace(pathname as any);
  }, [pathname, router]);

  const pickDefaultSelection = useCallback((data: any): { pharmacyId: number | null; orgId: number | null; selection: ViewSelection } | null => {
    const pharmacies = data?.pharmacies || [];
    const organizations = data?.organizations || [];
    // Prefer default pharmacy
    if (data?.defaultPharmacyId && pharmacies.some((p: any) => p.id === data.defaultPharmacyId)) {
      const pid = data.defaultPharmacyId;
      const orgId = pharmacies.find((p: any) => p.id === pid)?.organizationId || null;
      return { pharmacyId: pid, orgId, selection: { type: 'pharmacy', id: pid } };
    }
    // Otherwise first pharmacy
    if (pharmacies.length) {
      const pid = pharmacies[0].id;
      const orgId = pharmacies[0].organizationId || null;
      return { pharmacyId: pid, orgId, selection: { type: 'pharmacy', id: pid } };
    }
    // Fall back to default org
    if (data?.defaultOrganizationId && organizations.some((o: any) => o.id === data.defaultOrganizationId)) {
      const oid = data.defaultOrganizationId;
      return { pharmacyId: null, orgId: oid, selection: { type: 'organization', id: oid } };
    }
    // Or first org
    if (organizations.length) {
      const oid = organizations[0].id;
      return { pharmacyId: null, orgId: oid, selection: { type: 'organization', id: oid } };
    }
    return null;
  }, []);

  const loadContext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHubContext();
      setHub(data as HubContext);
      const requestedScope = searchParams.scope;
      const requestedPharmacyId = Number(searchParams.pharmacy_id);
      const requestedOrganizationId = Number(searchParams.organization_id);
      const requestedGroupId = Number(searchParams.group_id);
      const requestedPlatformHub = searchParams.platform_hub ? String(searchParams.platform_hub) : null;
      let deepLinkedSelection: ViewSelection = null;
      let deepLinkedPharmacyId: number | null = null;
      let deepLinkedOrgId: number | null = null;

      if (requestedScope === 'pharmacy' && Number.isFinite(requestedPharmacyId)) {
        const pharmacy = data?.pharmacies?.find((p: any) => p.id === requestedPharmacyId);
        if (pharmacy) {
          deepLinkedSelection = { type: 'pharmacy', id: requestedPharmacyId };
          deepLinkedPharmacyId = requestedPharmacyId;
          deepLinkedOrgId = pharmacy.organizationId || null;
        }
      } else if (requestedScope === 'organization' && Number.isFinite(requestedOrganizationId)) {
        const organization = data?.organizations?.find((o: any) => o.id === requestedOrganizationId);
        if (organization) {
          deepLinkedSelection = { type: 'organization', id: requestedOrganizationId };
          deepLinkedOrgId = requestedOrganizationId;
        }
      } else if (requestedScope === 'group' && Number.isFinite(requestedGroupId)) {
        const communityGroup = (data?.communityGroups || []).find((g: any) => g.id === requestedGroupId);
        if (communityGroup) {
          deepLinkedSelection = { type: 'group', id: requestedGroupId };
          deepLinkedPharmacyId = communityGroup.pharmacyId || null;
        } else {
          const orgGroup = (data?.organizationGroups || []).find((g: any) => g.id === requestedGroupId);
          if (orgGroup) {
            deepLinkedSelection = { type: 'orgGroup', id: requestedGroupId };
            deepLinkedOrgId = orgGroup.organizationId || null;
          }
        }
      } else if (requestedScope === 'platform' && requestedPlatformHub) {
        const platformHub = (data?.chemisttaskerHubs || []).find((h: any) => h.key === requestedPlatformHub);
        if (platformHub) {
          deepLinkedSelection = { type: 'platform', id: requestedPlatformHub };
        }
      }

      if (deepLinkedSelection) {
        setActivePharmacyId(deepLinkedPharmacyId);
        setActiveOrgId(deepLinkedOrgId);
        setSelection(deepLinkedSelection);
        return;
      }
      const picked = pickDefaultSelection(data);
      if (picked) {
        setActivePharmacyId(picked.pharmacyId);
        setActiveOrgId(picked.orgId);
        // keep selection null so the hub list renders; selection happens on user tap
        setSelection(null);
      } else {
        setActivePharmacyId(null);
        setActiveOrgId(null);
        setSelection(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load hub');
    } finally {
      setLoading(false);
    }
  }, [pickDefaultSelection, searchParams.group_id, searchParams.organization_id, searchParams.pharmacy_id, searchParams.platform_hub, searchParams.scope]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  // Check permissions for group creation/editing (defined before usage)
  const scopeAllowsGroupCreate = useCallback(
    (scope: ViewSelection | null) => {
      if (!scope) return false;
      if (scope.type === 'pharmacy') {
        const p = hub?.pharmacies?.find((ph) => ph.id === scope.id);
        return Boolean(p?.canCreateGroup);
      }
      if (scope.type === 'organization') {
        const org = hub?.organizations?.find((o) => o.id === scope.id);
        return Boolean(org?.canManageProfile);
      }
      return false;
    },
    [hub],
  );

  const openGroupModal = useCallback(
    async (scope: ViewSelection, group?: HubGroup) => {
      if (!scope) return;
      if (!scopeAllowsGroupCreate(scope)) {
        setSnackbar('You do not have permission to manage groups for this scope.');
        return;
      }
      let hydrated: any = group;
      if (group && !(group as any).members) {
        try {
          hydrated = await fetchHubGroup(group.id, { includeMembers: true });
        } catch {
          hydrated = group;
        }
      }
      const memberIdsFromGroup = hydrated?.members
        ? (hydrated.members as any[]).map((m: any) => m.membershipId ?? m.membership_id).filter(Boolean)
        : (hydrated as any)?.memberIds || (hydrated as any)?.member_ids || [];
      setGroupModalScope(scope);
      setGroupForm({
        id: hydrated?.id,
        name: hydrated?.name || '',
        description: (hydrated as any)?.description || '',
        memberIds: memberIdsFromGroup,
      });
      setGroupModalVisible(true);
      setMembersLoading(true);
      try {
        let options: HubGroupMemberOption[] = [];
        if (scope.type === 'pharmacy') {
          // Mirror web: pull members across all pharmacies the user can manage, annotating with pharmacy info, then de-dupe.
          const pharmMap = new Map<number, string>(
            (hub?.pharmacies || []).map((p) => [p.id, p.name]),
          );
          const ids = (hub?.pharmacies || []).map((p) => p.id).filter(Boolean);
          const memberLists = await Promise.all(
            ids.map(async (pid) => {
              try {
                const list = (await fetchPharmacyGroupMembers(pid)) as any[];
                return list.map((m) => ({
                  ...m,
                  pharmacyId: (m as any).pharmacyId ?? pid,
                  pharmacyName:
                    (m as any).pharmacyName ||
                    (m as any).pharmacy_name ||
                    pharmMap.get(pid) ||
                    'Pharmacy',
                }));
              } catch {
                return [];
              }
            }),
          );
          const merged: Record<number, HubGroupMemberOption> = {};
          memberLists.flat().forEach((m: any) => {
            const key = (m as any).membershipId ?? (m as any).membership_id ?? (m as any).id;
            if (key && !merged[key]) merged[key] = m;
          });
          options = Object.values(merged);
        } else {
          options = (await fetchOrganizationGroupMembers(scope.id)) as any;
        }
        setMemberOptions(
          filterPharmacyStaffMembers(options || []).filter((member: any) => user?.id == null || member?.userId !== user.id),
        );
      } catch (err: any) {
        setSnackbar(err?.message || 'Failed to load members');
      } finally {
        setMembersLoading(false);
      }
    },
    [scopeAllowsGroupCreate, user?.id],
  );

  const closeGroupModal = useCallback(() => {
    setGroupModalVisible(false);
    setGroupModalScope(null);
    setGroupForm({ name: '', description: '', memberIds: [] });
    setMemberOptions([]);
    setSavingGroup(false);
    setRoleFilter('all');
  }, []);

  const pickCoverImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: imageMediaTypes,
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.9,
    });
    if (result.canceled) return null;
    const asset = result.assets?.[0];
    if (!asset?.uri) return null;
    // Normalize size/quality after picker crop
    const manip = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
    );
    const filename = manip.uri.split('/').pop() || asset.fileName || 'cover.jpg';
    const type = 'image/jpeg';
    return { uri: manip.uri, name: filename, type };
  }, []);

  const toggleMember = useCallback(
    (id: number) => {
      setGroupForm((prev) => {
        const has = prev.memberIds.includes(id);
        return {
          ...prev,
          memberIds: has ? prev.memberIds.filter((m) => m !== id) : [...prev.memberIds, id],
        };
      });
    },
    [],
  );

  const handleSaveGroup = useCallback(async () => {
    if (!groupModalScope || !hub) {
      setSnackbar('Missing group scope');
      return;
    }
    if (!scopeAllowsGroupCreate(groupModalScope)) {
      setSnackbar('You do not have permission to manage groups here.');
      return;
    }
    const payload: HubGroupPayload = {
      name: groupForm.name.trim(),
      description: groupForm.description.trim() || undefined,
      memberIds: groupForm.memberIds,
      pharmacyId:
        groupModalScope.type === 'pharmacy'
          ? groupModalScope.id
          : // org groups must also host under a pharmacy; pick first pharmacy of org if present
            (hub.pharmacies || []).find((p) => p.organizationId === groupModalScope.id)?.id,
      organizationId: groupModalScope.type === 'organization' ? groupModalScope.id : undefined,
    } as any;
    if (!payload.name || !payload.pharmacyId) {
      setSnackbar('Please provide a name and valid scope');
      return;
    }
    setSavingGroup(true);
    try {
      if (groupForm.id) {
        await updateHubGroup(groupForm.id, payload as any, {});
        setSnackbar('Group updated');
      } else {
        await createHubGroup(payload as any);
        setSnackbar('Group created');
      }
      closeGroupModal();
      await loadContext();
    } catch (err: any) {
      setSnackbar(err?.message || 'Save failed');
    } finally {
      setSavingGroup(false);
    }
  }, [closeGroupModal, groupForm.description, groupForm.id, groupForm.memberIds, groupForm.name, groupModalScope, hub, loadContext]);

  const handleDeleteGroup = useCallback(
    (group: HubGroup) => {
      Alert.alert(
        'Delete group',
        `Delete "${group.name}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteHubGroup(group.id);
                setSnackbar('Group deleted');
                await loadContext();
              } catch (err: any) {
                setSnackbar(err?.message || 'Delete failed');
              }
            },
          },
        ],
        { cancelable: true },
      );
    },
    [loadContext],
  );

  const selectedPharmacy = useMemo<HubPharmacy | null>(() => {
    if (!hub) return null;
    const pid = selection?.type === 'pharmacy' ? selection.id : activePharmacyId;
    if (!pid) return null;
    return (hub.pharmacies || []).find((p) => p.id === pid) || null;
  }, [hub, selection, activePharmacyId]);

  const selectedOrganization = useMemo<HubOrganization | null>(() => {
    if (!hub) return null;
    const oid = selection?.type === 'organization' ? selection.id : activeOrgId;
    if (!oid) return null;
    return (hub.organizations || []).find((o) => o.id === oid) || null;
  }, [hub, selection, activeOrgId]);

  const communityGroups = useMemo<HubGroup[]>(() => {
    if (!hub) return [];
    return hub.communityGroups || [];
  }, [hub]);

  const chemisttaskerHubs = useMemo<HubChemistTaskerHub[]>(() => {
    if (!hub) return [];
    return hub.chemisttaskerHubs || [];
  }, [hub]);

  const defaultOrg = useMemo(() => {
    if (!hub) return null;
    if (selectedPharmacy?.organizationId) {
      return (hub.organizations || []).find((o) => o.id === selectedPharmacy.organizationId) || null;
    }
    return hub.organizations?.[0] || null;
  }, [hub, selectedPharmacy]);

  const effectiveOrg = selectedOrganization || defaultOrg;

  const orgGroups = useMemo<HubGroup[]>(() => {
    if (!hub || !effectiveOrg) return [];
    return (hub.organizationGroups || []).filter(
      (g: any) => g.organizationId === effectiveOrg.id,
    );
  }, [hub, effectiveOrg]);

  // Re-validate selection when hub data changes (e.g., removed/added items)
  useEffect(() => {
    if (!hub) return;
    const pharmacies = hub.pharmacies || [];
    const organizations = hub.organizations || [];

    const isValidPharmacy = (id: number) => pharmacies.some((p) => p.id === id);
    const isValidOrg = (id: number) => organizations.some((o) => o.id === id);
    const isValidGroup = (id: number) => (hub.communityGroups || []).some((g) => g.id === id);
    const isValidOrgGroup = (id: number) => (hub.organizationGroups || []).some((g) => g.id === id);
    const isValidPlatform = (id: string) => (hub.chemisttaskerHubs || []).some((item) => item.key === id);

    if (selection) {
      if (
        (selection.type === 'pharmacy' && !isValidPharmacy(selection.id)) ||
        (selection.type === 'organization' && !isValidOrg(selection.id)) ||
        (selection.type === 'group' && !isValidGroup(selection.id)) ||
        (selection.type === 'orgGroup' && !isValidOrgGroup(selection.id)) ||
        (selection.type === 'platform' && !isValidPlatform(selection.id))
      ) {
        setSelection(null);
      }
    }
  }, [hub, selection, pickDefaultSelection]);

  const selectedGroup = useMemo<HubGroup | null>(() => {
    if (!selection || selection.type !== 'group') return null;
    return communityGroups.find((g) => g.id === selection.id) || null;
  }, [selection, communityGroups]);

  const selectedOrgGroup = useMemo<HubGroup | null>(() => {
    if (!selection || selection.type !== 'orgGroup') return null;
    return orgGroups.find((g) => g.id === selection.id) || null;
  }, [selection, orgGroups]);

  const selectedChemistTaskerHub = useMemo<HubChemistTaskerHub | null>(() => {
    if (!selection || selection.type !== 'platform') return null;
    return chemisttaskerHubs.find((hubItem) => hubItem.key === selection.id) || null;
  }, [chemisttaskerHubs, selection]);

  const filteredMembers = useMemo(() => {
    if (!memberOptions) return [];
    const query = memberSearch.trim().toLowerCase();
    const base = roleFilter === 'all' ? memberOptions : memberOptions.filter((m) => String(m.role) === roleFilter);
    if (!query) return base;
    return base.filter((m) => {
      const name = getMemberDisplayName(m).toLowerCase();
      const email = (m.email || '').toLowerCase();
      return name.includes(query) || email.includes(query);
    });
  }, [memberOptions, roleFilter, memberSearch]);

  const groupedMembers = useMemo(() => {
    const groups: Record<string, HubGroupMemberOption[]> = {};
    filteredMembers.forEach((m) => {
      const pharm =
        (m as any).pharmacyName ||
        (m as any).pharmacy_name ||
        (m as any).pharmacy?.name ||
        (m as any).pharmacy_names?.[0] ||
        (m as any).pharmacyNames?.[0] ||
        'Pharmacy';
      if (!groups[pharm]) groups[pharm] = [];
      groups[pharm].push(m);
    });
    return groups;
  }, [filteredMembers]);

  const selectedMemberDetails = useMemo(() => {
    const ids = new Set(groupForm.memberIds);
    return (memberOptions || []).filter((m) => ids.has((m as any).membershipId ?? (m as any).id));
  }, [memberOptions, groupForm.memberIds]);

  const groupedEntries = useMemo(() => Object.entries(groupedMembers), [groupedMembers]);

  const firstPharmacyId = useMemo(() => hub?.pharmacies?.[0]?.id ?? null, [hub]);

  const canManageGroup = useCallback(
    (group: HubGroup, kind: 'group' | 'orgGroup') => {
      const flags = (group as any);
      if (flags.isAdmin || flags.isCreator) return true;
      if (kind === 'group') {
        return Boolean(selectedPharmacy?.canCreateGroup);
      }
      if (kind === 'orgGroup') {
        return Boolean(effectiveOrg?.canManageProfile);
      }
      return false;
    },
    [selectedPharmacy?.canCreateGroup, effectiveOrg?.canManageProfile],
  );

  const openPharmacyProfile = useCallback(() => {
    if (!selectedPharmacy) return;
    const initialAbout = selectedPharmacy.about || '';
    const initialCover = (selectedPharmacy as any).coverImageUrl || null;
    setProfileInitialAbout(initialAbout);
    setProfileInitialCover(initialCover);
    setProfileError(null);
    setProfileAbout(initialAbout);
    setProfileCover(null);
    setProfilecoverImage(initialCover);
    setPharmacyProfileVisible(true);
  }, [selectedPharmacy]);

  const openOrganizationProfile = useCallback(() => {
    if (!effectiveOrg) return;
    const initialAbout = (effectiveOrg as any).about || '';
    const initialCover = (effectiveOrg as any).coverImageUrl || null;
    setProfileInitialAbout(initialAbout);
    setProfileInitialCover(initialCover);
    setProfileError(null);
    setProfileAbout(initialAbout);
    setProfileCover(null);
    setProfilecoverImage(initialCover);
    setOrganizationProfileVisible(true);
  }, [effectiveOrg]);

  const profileDirty = useMemo(() => {
    const aboutChanged = (profileAbout || '').trim() !== (profileInitialAbout || '').trim();
    const coverChanged = profileCover !== null || profilecoverImage !== profileInitialCover;
    return aboutChanged || coverChanged;
  }, [profileAbout, profileCover, profilecoverImage, profileInitialAbout, profileInitialCover]);

  const handleSavePharmacyProfile = useCallback(async () => {
    if (!selectedPharmacy) return;
    setProfileSaving(true);
    setProfileError(null);
    try {
      await updatePharmacyHubProfile(selectedPharmacy.id, {
        about: profileAbout,
        coverImage: profileCover ?? undefined,
      } as any);
      setSnackbar('Pharmacy profile updated');
      setPharmacyProfileVisible(false);
      await loadContext();
    } catch (err: any) {
      setProfileError(err?.message || 'Update failed');
    } finally {
      setProfileSaving(false);
      setProfileCover(null);
    }
  }, [selectedPharmacy, profileAbout, profileCover, loadContext]);

  const handleSaveOrganizationProfile = useCallback(async () => {
    if (!effectiveOrg) return;
    setProfileSaving(true);
    setProfileError(null);
    try {
      await updateOrganizationHubProfile(effectiveOrg.id, {
        about: profileAbout,
        coverImage: profileCover ?? undefined,
      } as any);
      setSnackbar('Organization profile updated');
      setOrganizationProfileVisible(false);
      await loadContext();
    } catch (err: any) {
      setProfileError(err?.message || 'Update failed');
    } finally {
      setProfileSaving(false);
      setProfileCover(null);
    }
  }, [effectiveOrg, profileAbout, profileCover, loadContext]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.muted}>Loading hub...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Button mode="contained" onPress={loadContext} style={{ marginTop: 12 }}>
            Retry
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  if (!hub) {
    return <HubPlaceholder />;
  }

  const canCreatePharmacyGroup = Boolean(selectedPharmacy?.canCreateGroup || hub.pharmacies?.some((p: any) => p.canCreateGroup));
  const canCreateOrgGroup = Boolean(effectiveOrg?.canManageProfile || hub.organizations?.some((o: any) => o.canManageProfile));

  // Detail view for a selected space
  const renderSpaceDetail = () => {
    if (!selection) return null;
    let scope: Scope | null = null;
    if (selection) {
      if (selection.type === 'pharmacy') scope = { type: 'pharmacy', id: selection.id };
      else if (selection.type === 'organization') scope = { type: 'organization', id: selection.id };
      else if (selection.type === 'group') scope = { type: 'group', id: selection.id };
      else if (selection.type === 'orgGroup') scope = { type: 'orgGroup', id: selection.id };
      else if (selection.type === 'platform') scope = { type: 'platform', id: selection.id };
    }

    const title =
      selection.type === 'pharmacy'
        ? selectedPharmacy?.name || 'Pharmacy'
        : selection.type === 'organization'
          ? selectedOrganization?.name || 'Organization'
          : selection.type === 'group'
            ? selectedGroup?.name || 'Group'
            : selection.type === 'orgGroup'
              ? selectedOrgGroup?.name || 'Org Group'
              : selection.type === 'platform'
                ? selectedChemistTaskerHub?.label || 'ChemistTasker Hub'
              : 'Hub';

    const aboutText =
      selection.type === 'pharmacy'
        ? selectedPharmacy?.about
        : selection.type === 'organization'
          ? selectedOrganization?.about
          : selection.type === 'group'
            ? selectedGroup?.description
            : selection.type === 'orgGroup'
              ? selectedOrgGroup?.description
              : selection.type === 'platform'
                ? 'ChemistTasker community space for platform-wide updates and discussion.'
              : '';

    const cover =
      selection.type === 'pharmacy'
        ? (selectedPharmacy as any)?.coverImageUrl || defaultPharmacyCover
        : selection.type === 'organization'
          ? (selectedOrganization as any)?.coverImageUrl || defaultOrgCover
          : selection.type === 'platform'
            ? defaultPlatformCover
          : null;

    const canEditProfile =
      (selection.type === 'pharmacy' && selectedPharmacy?.canManageProfile) ||
      (selection.type === 'organization' && selectedOrganization?.canManageProfile);
    const manageableGroup =
      selection.type === 'group' && selectedGroup && canManageGroup(selectedGroup, 'group')
        ? selectedGroup
        : selection.type === 'orgGroup' && selectedOrgGroup && canManageGroup(selectedOrgGroup, 'orgGroup')
          ? selectedOrgGroup
          : null;

    if (!scope) return null;

    const headerData = {
      title,
      subtitle: aboutText || '',
      cover,
      canEditProfile,
      onEditProfile: canEditProfile
        ? () => (selection.type === 'pharmacy' ? openPharmacyProfile() : openOrganizationProfile())
        : undefined,
      actions: manageableGroup
        ? [
            {
              title: 'Edit group',
              icon: 'pencil',
              onPress: () => {
                if (selection.type === 'orgGroup') {
                  const orgId = selectedOrgGroup?.organizationId || effectiveOrg?.id;
                  if (orgId) {
                    openGroupModal({ type: 'organization', id: orgId }, manageableGroup);
                  }
                  return;
                }
                openGroupModal({ type: 'pharmacy', id: manageableGroup.pharmacyId }, manageableGroup);
              },
            },
            {
              title: 'Delete group',
              icon: 'trash-can-outline',
              destructive: true,
              onPress: () => handleDeleteGroup(manageableGroup),
            },
          ]
        : undefined,
    };

    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <HubFeed
          scope={scope}
          onBack={() => setSelection(null)}
          targetPostId={targetPostId}
          onTargetPostHandled={clearDeepLinkParams}
          header={headerData}
        />
      </SafeAreaView>
    );
  };

  const listContent = (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text variant="titleLarge">Hub</Text>
          <Text style={styles.muted}>Switch hubs and jump into spaces to post updates and polls.</Text>
        </View>

        <Card style={styles.sidebarCard} mode="elevated">
          <Card.Content>
            <Text style={styles.sectionLabel}>PHARMACY HOMES</Text>
            {(hub.pharmacies || []).map((pharm) => (
              <TouchableOpacity
                key={pharm.id}
                style={styles.tile}
                onPress={() => setSelection({ type: 'pharmacy', id: pharm.id })}
              >
                <Text style={styles.tileTitle}>{pharm.name}</Text>
                {(pharm as any).organizationName ? (
                  <Text style={styles.meta}>Org: {(pharm as any).organizationName}</Text>
                ) : null}
              </TouchableOpacity>
            ))}
            {!hub.pharmacies?.length && <Text style={styles.muted}>No pharmacies available.</Text>}

            {/* Community groups */}
            <View style={styles.sectionRow}>
              <Text style={styles.sectionLabel}>COMMUNITY GROUPS</Text>
              <IconButton
                icon="plus"
                size={18}
                onPress={() => {
                  const pid = firstPharmacyId;
                  if (pid) openGroupModal({ type: 'pharmacy', id: pid });
                  else setSnackbar('Select or add a pharmacy to create groups');
                }}
                disabled={!canCreatePharmacyGroup}
              />
            </View>
            {communityGroups.length ? (
              communityGroups.map((group: HubGroup) => {
                const selType = (selection as any)?.type;
                const selId = (selection as any)?.id;
                const isActive = selType === 'group' && selId === group.id;
                const manage = canManageGroup(group, 'group');
                return (
                  <View key={group.id} style={[styles.tile, isActive ? styles.tileActive : null, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                    <TouchableOpacity onPress={() => setSelection({ type: 'group', id: group.id })} style={{ flex: 1 }}>
                      <Text style={styles.tileTitle}>{group.name}</Text>
                    </TouchableOpacity>
                    {manage ? (
                      <Menu
                        visible={groupMenu?.id === group.id && groupMenu?.type === 'group'}
                        onDismiss={() => setGroupMenu(null)}
                        anchor={
                          <IconButton icon="dots-vertical" size={20} onPress={() => setGroupMenu({ id: group.id, type: 'group' })} />
                        }
                      >
                        <Menu.Item
                          onPress={() => {
                            setGroupMenu(null);
                            openGroupModal({ type: 'pharmacy', id: selectedPharmacy?.id || firstPharmacyId || group.pharmacyId }, group);
                          }}
                          title="Edit"
                          leadingIcon="pencil"
                        />
                        <Menu.Item
                          onPress={() => {
                            setGroupMenu(null);
                            handleDeleteGroup(group);
                          }}
                          title="Delete"
                          leadingIcon="trash-can-outline"
                        />
                      </Menu>
                    ) : null}
                  </View>
                );
              })
            ) : (
              <Text style={styles.muted}>No community groups.</Text>
            )}

            {/* Organization section (if claimed) */}
            {effectiveOrg ? (
              <>
                <Divider style={{ marginVertical: 8 }} />
                <TouchableOpacity
                  style={[styles.tile, styles.orgTile]}
                  onPress={() => setSelection({ type: 'organization', id: effectiveOrg.id })}
                >
                  <Text style={styles.tileTitle}>Organization Home</Text>
                  <Text style={styles.meta}>{effectiveOrg.name}</Text>
                </TouchableOpacity>
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionLabel}>ORGANIZATION GROUPS</Text>
                  <IconButton
                    icon="plus"
                    size={18}
                    onPress={() => openGroupModal({ type: 'organization', id: effectiveOrg.id })}
                    disabled={!canCreateOrgGroup}
                  />
                </View>
                {(hub.organizationGroups || []).filter((g: any) => g.organizationId === effectiveOrg.id).length ? (
                    (hub.organizationGroups || [])
                      .filter((g: any) => g.organizationId === effectiveOrg.id)
                      .map((group: HubGroup) => {
                        const selType = (selection as any)?.type;
                        const selId = (selection as any)?.id;
                        const isActive = selType === 'orgGroup' && selId === group.id;
                        const manage = canManageGroup(group, 'orgGroup');
                        return (
                          <View key={group.id} style={[styles.tile, isActive ? styles.tileActive : null, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                            <TouchableOpacity onPress={() => setSelection({ type: 'orgGroup', id: group.id })} style={{ flex: 1 }}>
                              <Text style={styles.tileTitle}>{group.name}</Text>
                            </TouchableOpacity>
                            {manage ? (
                              <Menu
                                visible={groupMenu?.id === group.id && groupMenu?.type === 'orgGroup'}
                                onDismiss={() => setGroupMenu(null)}
                                anchor={
                                  <IconButton icon="dots-vertical" size={20} onPress={() => setGroupMenu({ id: group.id, type: 'orgGroup' })} />
                                }
                              >
                                <Menu.Item
                                  onPress={() => {
                                    setGroupMenu(null);
                                    openGroupModal({ type: 'organization', id: effectiveOrg.id }, group);
                                  }}
                                  title="Edit"
                                  leadingIcon="pencil"
                                />
                                <Menu.Item
                                onPress={() => {
                                  setGroupMenu(null);
                                  handleDeleteGroup(group);
                                }}
                                title="Delete"
                                leadingIcon="trash-can-outline"
                              />
                            </Menu>
                            ) : null}
                          </View>
                        );
                      })
                ) : (
                  <Text style={styles.muted}>No organization groups.</Text>
                )}
              </>
            ) : null}

            {chemisttaskerHubs.length ? (
              <>
                <Divider style={{ marginVertical: 8 }} />
                <Text style={styles.sectionLabel}>CHEMISTTASKER HUB</Text>
                {chemisttaskerHubs.map((hubItem) => (
                  <TouchableOpacity
                    key={hubItem.key}
                    style={styles.tile}
                    onPress={() => setSelection({ type: 'platform', id: hubItem.key })}
                  >
                    <Text style={styles.tileTitle}>{hubItem.label}</Text>
                    <Text style={styles.meta}>{hubItem.audienceType.replace(/_/g, ' ')}</Text>
                  </TouchableOpacity>
                ))}
              </>
            ) : null}
          </Card.Content>
        </Card>

        <Divider style={{ marginVertical: 12 }} />
        <Card style={styles.spaceCard} mode="outlined">
          <Card.Content>
            <Text variant="titleMedium">Select a space</Text>
            <Text style={styles.muted}>Choose a ChemistTasker hub, Pharmacy Home, Organization Home, or any group to view and post.</Text>
          </Card.Content>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );

  const content = selection ? renderSpaceDetail() : listContent;

  return (
    <>
      {content}

      <Portal>
        <Modal visible={groupModalVisible} onDismiss={closeGroupModal} contentContainerStyle={styles.modal}>
          <View style={styles.modalHeader}>
            <Text variant="titleMedium">{groupForm.id ? 'Edit group' : 'Create group'}</Text>
            <IconButton icon="close" onPress={closeGroupModal} />
          </View>
          <TextInput
            label="Group name"
            value={groupForm.name}
            onChangeText={(text) => setGroupForm((prev) => ({ ...prev, name: text }))}
            mode="outlined"
            style={{ marginBottom: 8 }}
          />
          <TextInput
            label="Description"
            value={groupForm.description}
            onChangeText={(text) => setGroupForm((prev) => ({ ...prev, description: text }))}
            mode="outlined"
            multiline
            numberOfLines={3}
            style={{ marginBottom: 8 }}
          />
            <Text style={{ marginBottom: 4, fontWeight: '600' }}>Members</Text>
            <TextInput
              mode="outlined"
              placeholder="Search members by name or email"
              value={memberSearch}
              onChangeText={setMemberSearch}
              left={<TextInput.Icon icon="magnify" />}
              style={{ marginBottom: 6 }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Menu
                visible={roleMenuVisible}
                onDismiss={() => setRoleMenuVisible(false)}
                anchor={
                  <Button
                    mode="outlined"
                    compact
                    onPress={() => setRoleMenuVisible(true)}
                    style={{ borderRadius: 20 }}
                  >
                    Role: {roleFilter === 'all' ? 'All' : roleFilter}
                  </Button>
                }
              >
                <Menu.Item onPress={() => { setRoleFilter('all'); setRoleMenuVisible(false); }} title="All roles" />
                {[...new Set(memberOptions.map((m) => m.role).filter(Boolean))].map((role) => (
                  <Menu.Item key={role as any} onPress={() => { setRoleFilter(String(role)); setRoleMenuVisible(false); }} title={String(role)} />
                ))}
              </Menu>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button compact mode="text" onPress={() => {
                  const ids = filteredMembers.map((m) => (m as any).membershipId ?? (m as any).id).filter(Boolean);
                  setGroupForm((prev) => ({ ...prev, memberIds: Array.from(new Set([...prev.memberIds, ...ids])) }));
                }}>
                  Select all
                </Button>
                <Button compact mode="text" onPress={() => {
                  const ids = new Set(filteredMembers.map((m) => (m as any).membershipId ?? (m as any).id).filter(Boolean));
                  setGroupForm((prev) => ({ ...prev, memberIds: prev.memberIds.filter((id) => !ids.has(id)) }));
                }}>
                  Clear
                </Button>
              </View>
            </View>
            {selectedMemberDetails.length ? (
              <View style={styles.selectedChips}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {selectedMemberDetails.map((m) => {
                    const label = getMemberDisplayName(m) + (m.pharmacyName ? ` — ${m.pharmacyName}` : '');
                    const id = (m as any).membershipId ?? (m as any).id;
                    return (
                      <Chip
                        key={id}
                        onClose={() => toggleMember(id)}
                        style={{ marginRight: 6, marginVertical: 4 }}
                        compact
                      >
                        {label}
                      </Chip>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
            <View style={[styles.memberList, { paddingBottom: 8 }]}>
              {membersLoading ? (
                <View style={[styles.center, { paddingVertical: 12 }]}>
                  <ActivityIndicator />
                </View>
              ) : groupedEntries.length ? (
                <ScrollView contentContainerStyle={{ paddingVertical: 4 }}>
                  {groupedEntries.map(([pharm, members], idx) => (
                    <View key={pharm}>
                      <View style={styles.memberGroupHeaderRow}>
                        <Text style={styles.memberGroupHeader}>{pharm}</Text>
                      </View>
                      {members.map((m) => (
                        <TouchableOpacity
                          key={(m as any).membershipId || (m as any).id}
                          style={styles.memberRow}
                          onPress={() => toggleMember((m as any).membershipId ?? (m as any).id)}
                        >
                          <Checkbox
                            status={
                              groupForm.memberIds.includes((m as any).membershipId ?? (m as any).id)
                                ? 'checked'
                                : 'unchecked'
                            }
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: '600' }}>{getMemberDisplayName(m)}</Text>
                            <Text style={styles.meta}>
                              {[m.role, m.jobTitle].filter(Boolean).join(' | ')}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                      {idx < groupedEntries.length - 1 ? <Divider style={styles.memberDivider} /> : null}
                    </View>
                  ))}
                  <View style={{ height: 8 }} />
                </ScrollView>
              ) : (
                <Text style={styles.muted}>No members to select.</Text>
              )}
            </View>
          <HelperText type="info">
            Only members from the selected scope can be added. Group creation requires proper permissions.
          </HelperText>
          <Button
            mode="contained"
            onPress={handleSaveGroup}
            disabled={!groupForm.name.trim() || savingGroup || !groupModalScope || !scopeAllowsGroupCreate(groupModalScope)}
            loading={savingGroup}
            style={{ marginTop: 8 }}
          >
            {groupForm.id ? 'Save changes' : 'Create group'}
          </Button>
        </Modal>

        <Modal
          visible={pharmacyProfileVisible}
          onDismiss={() => {
            setPharmacyProfileVisible(false);
            setProfileCover(null);
            setProfileError(null);
            setProfilecoverImage(profileInitialCover);
            setProfileAbout(profileInitialAbout);
          }}
          contentContainerStyle={[styles.modal, styles.profileModal]}
        >
          <ScrollView contentContainerStyle={styles.profileContent} showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <Text variant="titleMedium">Edit Pharmacy Profile</Text>
              <IconButton icon="close" onPress={() => { setPharmacyProfileVisible(false); setProfileCover(null); }} />
            </View>
            {profilecoverImage ? (
              <Image source={{ uri: profilecoverImage }} style={styles.coverPreview} />
            ) : null}
            <View style={styles.coverActions}>
              <Button
                mode="outlined"
                onPress={async () => {
                  const picked = await pickCoverImage();
                  if (picked) {
                    setProfileCover(picked);
                    setProfilecoverImage(picked.uri);
                  }
                }}
              >
                Pick cover
              </Button>
              <Button
                mode="text"
                onPress={() => {
                  setProfileCover(null);
                  setProfilecoverImage(null);
                }}
              >
                Remove cover
              </Button>
            </View>
            <TextInput
              label="About"
              value={profileAbout}
              onChangeText={setProfileAbout}
              mode="outlined"
              multiline
              numberOfLines={4}
              style={{ marginBottom: 12 }}
            />
            <Button
              mode="contained"
              onPress={handleSavePharmacyProfile}
              loading={profileSaving}
              disabled={profileSaving || !profileDirty}
            >
              Save
            </Button>
            {profileError ? <HelperText type="error">{profileError}</HelperText> : null}
          </ScrollView>
        </Modal>

        <Modal
          visible={organizationProfileVisible}
          onDismiss={() => {
            setOrganizationProfileVisible(false);
            setProfileCover(null);
            setProfileError(null);
            setProfilecoverImage(profileInitialCover);
            setProfileAbout(profileInitialAbout);
          }}
          contentContainerStyle={[styles.modal, styles.profileModal]}
        >
          <ScrollView contentContainerStyle={styles.profileContent} showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <Text variant="titleMedium">Edit Organization Profile</Text>
              <IconButton icon="close" onPress={() => { setOrganizationProfileVisible(false); setProfileCover(null); }} />
            </View>
            {profilecoverImage ? (
              <Image source={{ uri: profilecoverImage }} style={styles.coverPreview} />
            ) : null}
            <View style={styles.coverActions}>
              <Button
                mode="outlined"
                onPress={async () => {
                  const picked = await pickCoverImage();
                  if (picked) {
                    setProfileCover(picked);
                    setProfilecoverImage(picked.uri);
                  }
                }}
              >
                Pick cover
              </Button>
              <Button
                mode="text"
                onPress={() => {
                  setProfileCover(null);
                  setProfilecoverImage(null);
                }}
              >
                Remove cover
              </Button>
            </View>
            <TextInput
              label="About"
              value={profileAbout}
              onChangeText={setProfileAbout}
              mode="outlined"
              multiline
              numberOfLines={4}
              style={{ marginBottom: 12 }}
            />
            <Button
              mode="contained"
              onPress={handleSaveOrganizationProfile}
              loading={profileSaving}
              disabled={profileSaving || !profileDirty}
            >
              Save
            </Button>
            {profileError ? <HelperText type="error">{profileError}</HelperText> : null}
          </ScrollView>
        </Modal>
      </Portal>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar(null)}
        duration={2500}
      >
        {snackbar}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scroll: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  muted: { color: '#6B7280' },
  errorText: { color: '#DC2626', textAlign: 'center' },
  header: { gap: 4, marginBottom: 8 },
  sectionHeader: { marginTop: 8, marginBottom: 6 },
  sectionTitle: { fontWeight: '700', color: '#111827' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  pillActive: { backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#6366F1' },
  pillInactive: { backgroundColor: '#E5E7EB' },
  pillActiveText: { color: '#4338CA', fontWeight: '700' },
  pillInactiveText: { color: '#374151', fontWeight: '600' },
  card: { marginTop: 8, borderRadius: 12 },
  meta: { color: '#4B5563', marginTop: 4, fontSize: 12 },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sidebarCard: { borderRadius: 16, marginBottom: 12, backgroundColor: '#FFFFFF', elevation: 2 },
  sidebarLabel: { color: '#6B7280', marginBottom: 8, fontWeight: '600' },
  sidebarItem: { paddingVertical: 10 },
  sidebarItemText: { fontWeight: '700', color: '#111827' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  sectionLabel: { color: '#6B7280', fontWeight: '700', letterSpacing: 0.5 },
  groupItem: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 6,
  },
  groupItemActive: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
  groupName: { fontWeight: '600', color: '#111827' },
  tile: {
    padding: 12,
    borderRadius: 12,
    borderColor: '#E5E7EB',
    borderWidth: 1,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  tileActive: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
  tileTitle: { fontWeight: '700', color: '#111827', fontSize: 15 },
  orgTile: { backgroundColor: '#F8FAFF', borderColor: '#DDE3FF' },
  spaceCard: { borderRadius: 12 },
  collapsingHeader: { width: '100%', backgroundColor: '#111827', overflow: 'hidden' },
  coverImage: { width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 },
  coverMenu: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  collapsingOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    gap: 6,
  },
  heroTitle: { color: 'white', fontSize: 22, fontWeight: '800' },
  heroSubtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 14 },
  barTitleContainer: {
    position: 'absolute',
    bottom: 10,
    left: 16,
    right: 16,
  },
  barTitle: { color: 'white', fontWeight: '700', fontSize: 16 },
  modal: {
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    maxHeight: '85%',
  },
  profileModal: {
    width: '92%',
    alignSelf: 'center',
  },
  profileContent: {
    paddingBottom: 8,
    gap: 10,
  },
  coverPreview: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#F3F4F6',
  },
  coverActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  memberList: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    maxHeight: 260,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 12,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  memberGroupHeaderRow: { paddingVertical: 6, backgroundColor: '#F3F4F6', paddingHorizontal: 4, borderRadius: 6 },
  memberGroupHeader: { fontWeight: '700', color: '#374151' },
  memberDivider: { marginVertical: 6 },
  selectedChips: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginBottom: 6,
  },
});

