import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../../contexts/AuthContext';

import {
  createHubGroup,
  deleteHubGroup,
  fetchHubContext,
  fetchHubGroup,
  fetchOrganizationMembers,
  fetchPharmacyGroupMembers,
  updateHubGroup,
} from '../../../../api/hub';
import type {
  HubChemistTaskerHub,
  HubContext,
  HubGroup,
  HubGroupMemberOption,
  HubGroupPayload,
  HubOrganization,
  HubPharmacy,
} from '../../../../types/hub';
import { CreateGroupModal, type GroupModalFormValues, type GroupModalScope } from './HubGroupModal';
import { PharmacyProfileModal, OrganizationProfileModal } from './HubProfileModals';
import { InternalSidebar } from './HubSidebar';
import {
  ChemistTaskerHubContent,
  GroupContent,
  HomePageContent,
  OrgGroupContent,
  OrgHomePageContent,
} from './HubSections';

type ActiveGroupModal = {
  title: string;
  scope: GroupModalScope;
  mode: 'create' | 'edit';
  group?: HubGroup;
};

type SelectedView =
  | { type: 'home'; id: number | string }
  | { type: 'orgHome'; id: number | string }
  | { type: 'group'; id: number | string }
  | { type: 'orgGroup'; id: number | string }
  | { type: 'platformHome'; id: number | string };

export default function HubPage() {
  const theme = useTheme();
  const { user } = useAuth();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [searchParams, setSearchParams] = useSearchParams();
  const [hubContext, setHubContext] = useState<HubContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPharmacyId, setSelectedPharmacyId] = useState<number | null>(null);
  const [selectedView, setSelectedView] = useState<SelectedView>({ type: 'home', id: 'home' });
  const [isInternalSidebarOpen, setIsInternalSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [groupModal, setGroupModal] = useState<ActiveGroupModal | null>(null);
  const [pharmacyProfileModalOpen, setPharmacyProfileModalOpen] = useState(false);
  const [organizationProfileModalOpen, setOrganizationProfileModalOpen] = useState(false);
  const [resolvedTargetPostId, setResolvedTargetPostId] = useState<number | null>(null);

  const targetPostId = useMemo(() => {
    const raw = searchParams.get('post');
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }, [searchParams]);

  useEffect(() => {
    setResolvedTargetPostId(targetPostId);
  }, [targetPostId]);

  const clearDeepLinkParams = useCallback(() => {
    if (!searchParams.get('post')) return;
    const nextParams = new URLSearchParams(searchParams);
    ['post', 'scope', 'pharmacy_id', 'organization_id', 'group_id', 'platform_hub'].forEach((key) =>
      nextParams.delete(key),
    );
    setSearchParams(nextParams, { replace: true });
    setResolvedTargetPostId(null);
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const getScopedViewFromSearch = (data: HubContext): SelectedView | null => {
      const scope = searchParams.get('scope');
      if (!scope) return null;

      if (scope === 'pharmacy') {
        const pharmacyId = Number(searchParams.get('pharmacy_id'));
        if (Number.isFinite(pharmacyId) && data.pharmacies.some((item) => item.id === pharmacyId)) {
          setSelectedPharmacyId(pharmacyId);
          return { type: 'home', id: pharmacyId };
        }
      }

      if (scope === 'organization') {
        const organizationId = Number(searchParams.get('organization_id'));
        if (Number.isFinite(organizationId) && data.organizations.some((item) => item.id === organizationId)) {
          return { type: 'orgHome', id: organizationId };
        }
      }

      if (scope === 'group') {
        const groupId = Number(searchParams.get('group_id'));
        if (!Number.isFinite(groupId)) return null;
        const communityGroup = data.communityGroups.find((item) => item.id === groupId);
        if (communityGroup) {
          setSelectedPharmacyId(communityGroup.pharmacyId);
          return { type: 'group', id: groupId };
        }
        const organizationGroup = data.organizationGroups.find((item) => item.id === groupId);
        if (organizationGroup) {
          return { type: 'orgGroup', id: groupId };
        }
      }

      if (scope === 'platform') {
        const platformHub = searchParams.get('platform_hub');
        if (platformHub && data.chemisttaskerHubs?.some((item) => item.key === platformHub)) {
          return { type: 'platformHome', id: platformHub };
        }
      }

      return null;
    };

    const getHubContext = async () => {
      try {
        setLoading(true);
        const data = await fetchHubContext();
        setHubContext(data);
        const scopedView = getScopedViewFromSearch(data);
        if (scopedView) {
          setSelectedView(scopedView);
        } else if (data.defaultPharmacyId) {
          setSelectedPharmacyId(data.defaultPharmacyId);
          setSelectedView({ type: 'home', id: data.defaultPharmacyId });
        } else if (data.pharmacies.length > 0) {
          setSelectedPharmacyId(data.pharmacies[0].id);
          setSelectedView({ type: 'home', id: data.pharmacies[0].id });
        } else if (data.defaultOrganizationId) {
          setSelectedView({ type: 'orgHome', id: data.defaultOrganizationId });
        } else if (data.organizations.length > 0) {
          setSelectedView({ type: 'orgHome', id: data.organizations[0].id });
        } else if (data.chemisttaskerHubs?.length) {
          setSelectedView({ type: 'platformHome', id: data.chemisttaskerHubs[0].key });
        }
      } catch (err) {
        console.error('Failed to fetch hub context:', err);
        setError('Failed to load hub data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    void getHubContext();
  }, [searchParams]);

  const pharmacies = useMemo(() => hubContext?.pharmacies || [], [hubContext]);
  const communityGroups = useMemo(() => hubContext?.communityGroups || [], [hubContext]);
  const organizationGroups = useMemo(() => hubContext?.organizationGroups || [], [hubContext]);
  const filteredCommunityGroups = useMemo(
    () => communityGroups.filter((group) => !group.organizationId),
    [communityGroups],
  );
  const organizations = useMemo(() => hubContext?.organizations || [], [hubContext]);
  const chemisttaskerHubs = useMemo(() => hubContext?.chemisttaskerHubs || [], [hubContext]);

  const selectedPharmacy = useMemo(
    () => pharmacies.find((p) => p.id === selectedPharmacyId),
    [selectedPharmacyId, pharmacies],
  );

  const selectedOrganization = useMemo(() => {
    if (!organizations.length) return null;
    if (selectedView.type === 'orgHome' || selectedView.type === 'orgGroup') {
      const targetId = typeof selectedView.id === 'number' ? selectedView.id : Number(selectedView.id);
      const match = organizations.find((org) => org.id === targetId);
      if (match) return match;
    }
    return organizations[0] ?? null;
  }, [organizations, selectedView]);

  const selectedChemistTaskerHub = useMemo(() => {
    if (selectedView.type !== 'platformHome') return null;
    return chemisttaskerHubs.find((hub) => hub.key === selectedView.id) ?? null;
  }, [chemisttaskerHubs, selectedView]);

  const selectedViewLabel = useMemo(() => {
    if (selectedView.type === 'home') {
      return selectedPharmacy?.name ?? 'Pharmacy Home';
    }
    if (selectedView.type === 'orgHome') {
      return selectedOrganization?.name ?? 'Organization Home';
    }
    if (selectedView.type === 'group') {
      return filteredCommunityGroups.find((group) => group.id === selectedView.id)?.name ?? 'Community Group';
    }
    if (selectedView.type === 'orgGroup') {
      return organizationGroups.find((group) => group.id === selectedView.id)?.name ?? 'Organization Group';
    }
    if (selectedView.type === 'platformHome') {
      return selectedChemistTaskerHub?.label ?? 'ChemistTasker Hub';
    }
    return 'Hub';
  }, [
    filteredCommunityGroups,
    organizationGroups,
    selectedChemistTaskerHub,
    selectedOrganization,
    selectedPharmacy,
    selectedView,
  ]);

  const isOrganizationContext = selectedView.type === 'orgHome' || selectedView.type === 'orgGroup';
  const filteredOrganizationGroups = useMemo(() => {
    if (!selectedOrganization) return organizationGroups;
    return organizationGroups.filter((group) => group.organizationId === selectedOrganization.id);
  }, [organizationGroups, selectedOrganization]);

  const currentPharmacyDetails = useMemo(() => {
    if (selectedView.type === 'home' && selectedPharmacy) {
      return {
        id: selectedPharmacy.id,
        coverImage: selectedPharmacy.coverImageUrl || 'https://placehold.co/1200x300/6D28D9/FFFFFF?text=Pharmacy+Cover',
        about: selectedPharmacy.about || 'No description available.',
        name: selectedPharmacy.name,
        canManageProfile: selectedPharmacy.canManageProfile,
        canCreatePost: selectedPharmacy.canCreatePost,
        profilePhotoUrl: null,
      };
    }
    return null;
  }, [selectedView, selectedPharmacy]);

  const currentOrganizationDetails = useMemo(() => {
    if (selectedView.type === 'orgHome' && organizations.length > 0) {
      const org = organizations.find((item) => item.id === selectedView.id) || organizations[0];
      return {
        name: org.name,
        coverImage: org.coverImageUrl || 'https://placehold.co/1200x300/16a34a/FFFFFF?text=Organization+Cover',
        about: org.about || 'No description available.',
        id: org.id,
        canManageProfile: org.canManageProfile,
        canCreatePost: true,
        profilePhotoUrl: null,
      };
    }
    return null;
  }, [selectedView, organizations]);

  const canCreateCommunityGroup = Boolean(selectedPharmacy?.canCreateGroup);
  const canCreateOrganizationGroup = Boolean(selectedOrganization?.canManageProfile);
  const canManagePharmacyProfile = Boolean(selectedPharmacy?.canManageProfile);
  const showOrgSettings = Boolean(
    selectedOrganization?.canManageProfile &&
      selectedOrganization?.isOrgAdmin &&
      isOrganizationContext,
  );
  const canPharmacyPost = Boolean(selectedPharmacy?.canCreatePost);

  const openPharmacyProfileModal = useCallback(() => {
    if (selectedPharmacy) setPharmacyProfileModalOpen(true);
  }, [selectedPharmacy]);

  const openOrganizationProfileModal = useCallback(() => {
    if (selectedOrganization) setOrganizationProfileModalOpen(true);
  }, [selectedOrganization]);

  const closePharmacyProfileModal = useCallback(() => setPharmacyProfileModalOpen(false), []);
  const closeOrganizationProfileModal = useCallback(() => setOrganizationProfileModalOpen(false), []);

  const handlePharmacyChange = useCallback((id: number) => {
    setSelectedPharmacyId(id);
    setSelectedView({ type: 'home', id });
    setIsMobileSidebarOpen(false);
  }, []);

  const handleSelectView = useCallback((view: SelectedView) => {
    setSelectedView(view);
    setIsMobileSidebarOpen(false);
  }, []);

  const pharmacyMembersLoader = useCallback(() => {
    if (!selectedPharmacyId) return Promise.resolve<HubGroupMemberOption[]>([]);
    return fetchPharmacyGroupMembers(selectedPharmacyId);
  }, [selectedPharmacyId]);

  const organizationMembersLoader = useCallback(() => {
    if (!selectedOrganization?.id) return Promise.resolve<HubGroupMemberOption[]>([]);
    return fetchOrganizationMembers(selectedOrganization.id);
  }, [selectedOrganization?.id]);

  const openCommunityGroupModal = useCallback(() => {
    if (!selectedPharmacyId || !canCreateCommunityGroup) return;
    setIsMobileSidebarOpen(false);
    setGroupModal({
      title: 'Create New Community Group',
      scope: { type: 'pharmacy', pharmacyId: selectedPharmacyId },
      mode: 'create',
    });
  }, [canCreateCommunityGroup, selectedPharmacyId]);

  const openOrganizationGroupModal = useCallback(() => {
    if (!selectedOrganization || !canCreateOrganizationGroup) return;
    setIsMobileSidebarOpen(false);
    setGroupModal({
      title: 'Create New Organization Group',
      scope: { type: 'organization', organizationId: selectedOrganization.id },
      mode: 'create',
    });
  }, [canCreateOrganizationGroup, selectedOrganization]);

  const closeGroupModal = useCallback(() => setGroupModal(null), []);

  const handleCreateGroupSubmit = useCallback(
    async (values: GroupModalFormValues, scope: GroupModalScope) => {
      const trimmedName = values.name.trim();
      if (!trimmedName) return;
      try {
        const payload: HubGroupPayload = {
          pharmacyId:
            scope.type === 'pharmacy'
              ? scope.pharmacyId
              : (() => {
                  const host = pharmacies.find((pharmacy) => pharmacy.organizationId === scope.organizationId);
                  if (!host) {
                    throw new Error('No pharmacy is linked to this organization yet.');
                  }
                  return host.id;
                })(),
          name: trimmedName,
        };
        if (scope.type === 'organization') {
          payload.organizationId = scope.organizationId;
        }
        const descriptionValue = values.description.trim();
        if (descriptionValue) payload.description = descriptionValue;
        if (values.memberIds.length) payload.memberIds = values.memberIds;

        const newGroup = await createHubGroup(payload);
        setHubContext((prev) => {
          if (!prev) return prev;
          if (scope.type === 'organization') {
            return { ...prev, organizationGroups: [...prev.organizationGroups, newGroup] };
          }
          return { ...prev, communityGroups: [...prev.communityGroups, newGroup] };
        });
        closeGroupModal();
        setSelectedView(scope.type === 'organization' ? { type: 'orgGroup', id: newGroup.id } : { type: 'group', id: newGroup.id });
      } catch (err) {
        console.error('Failed to create hub group:', err);
        setError(scope.type === 'organization' ? 'Failed to create organization group.' : 'Failed to create community group.');
      }
    },
    [pharmacies, closeGroupModal],
  );

  const handleRequestEditGroup = useCallback(async (group: HubGroup) => {
    try {
      const detailed = await fetchHubGroup(group.id, { includeMembers: true });
      const scope: GroupModalScope = detailed.organizationId
        ? { type: 'organization', organizationId: detailed.organizationId }
        : { type: 'pharmacy', pharmacyId: detailed.pharmacyId };
      setGroupModal({
        title: `Edit ${detailed.name}`,
        scope,
        mode: 'edit',
        group: detailed,
      });
    } catch (err) {
      console.error('Failed to load group details:', err);
      setError('Failed to load group details. Please try again.');
    }
  }, []);

  const handleEditGroupSubmit = useCallback(async (group: HubGroup, values: GroupModalFormValues) => {
    try {
      const payload: Partial<HubGroupPayload> = {
        name: values.name.trim(),
        description: values.description.trim() ? values.description.trim() : null,
        memberIds: values.memberIds,
      };
      const updatedGroup = await updateHubGroup(group.id, payload, { includeMembers: true });
      setHubContext((prev) =>
        prev
          ? {
              ...prev,
              communityGroups: prev.communityGroups.map((item) => (item.id === updatedGroup.id ? updatedGroup : item)),
              organizationGroups: prev.organizationGroups.map((item) => (item.id === updatedGroup.id ? updatedGroup : item)),
            }
          : prev,
      );
      closeGroupModal();
    } catch (err) {
      console.error('Failed to update group:', err);
      setError('Failed to update group. Please try again.');
    }
  }, [closeGroupModal]);

  const handleDeleteGroup = useCallback(async (group: HubGroup) => {
    const confirmed = window.confirm(`Delete the "${group.name}" group? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await deleteHubGroup(group.id);
      setHubContext((prev) =>
        prev
          ? {
              ...prev,
              communityGroups: prev.communityGroups.filter((item) => item.id !== group.id),
              organizationGroups: prev.organizationGroups.filter((item) => item.id !== group.id),
            }
          : prev,
      );
      if (groupModal?.group?.id === group.id) closeGroupModal();
      if (selectedView.type === 'group' && selectedView.id === group.id) {
        setSelectedView({ type: 'home', id: group.pharmacyId });
      } else if (selectedView.type === 'orgGroup' && selectedView.id === group.id) {
        setSelectedView({ type: 'orgHome', id: group.organizationId ?? (organizations[0]?.id ?? 'orgHome') });
      }
    } catch (err) {
      console.error('Failed to delete group:', err);
      setError('Failed to delete group. Please try again.');
    }
  }, [closeGroupModal, groupModal, organizations, selectedView]);

  const handlePharmacyProfileSaved = useCallback((updatedPharmacy: HubPharmacy) => {
    setHubContext((prev) =>
      prev
        ? {
            ...prev,
            pharmacies: prev.pharmacies.map((pharmacy) => (pharmacy.id === updatedPharmacy.id ? updatedPharmacy : pharmacy)),
          }
        : prev,
    );
  }, []);

  const handleOrganizationProfileSaved = useCallback((updatedOrg: HubOrganization) => {
    setHubContext((prev) =>
      prev
        ? {
            ...prev,
            organizations: prev.organizations.map((org) => (org.id === updatedOrg.id ? updatedOrg : org)),
          }
        : prev,
    );
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ ml: 2 }}>
          Loading Hub...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        width: '100%',
        minHeight: '100%',
        bgcolor: 'transparent',
        fontFamily: 'Inter',
        gap: { xs: 0, lg: 3 },
        alignItems: 'stretch',
      }}
    >
      <InternalSidebar
        isOpen={isInternalSidebarOpen}
        toggleSidebar={() => setIsInternalSidebarOpen(!isInternalSidebarOpen)}
        mobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
        chemisttaskerHubs={chemisttaskerHubs}
        pharmacies={pharmacies}
        selectedPharmacyId={selectedPharmacyId}
        onPharmacyChange={handlePharmacyChange}
        communityGroups={filteredCommunityGroups}
        organizationGroups={filteredOrganizationGroups}
        selectedViewId={selectedView.id}
        onSelectView={handleSelectView}
        canCreateCommunityGroup={canCreateCommunityGroup}
        canCreateOrganizationGroup={canCreateOrganizationGroup}
        onRequestCreateCommunityGroup={openCommunityGroupModal}
        onRequestCreateOrganizationGroup={openOrganizationGroupModal}
        organizations={organizations}
        activeOrganizationId={selectedOrganization?.id ?? null}
      />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          overflowY: 'auto',
          px: { xs: 0, md: 3 },
          py: { xs: 1, md: 3 },
          transition: 'all 300ms ease-in-out',
          bgcolor: 'transparent',
          display: 'flex',
          flexDirection: 'column',
          gap: { xs: 1.5, md: 3 },
        }}
      >
        {isMobile && (
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1.5}
            sx={{
              px: 1,
              py: 0.5,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" color="text.secondary">
                Hub View
              </Typography>
              <Typography variant="body1" fontWeight={700} noWrap>
                {selectedViewLabel}
              </Typography>
            </Box>
            <Button
              variant="outlined"
              startIcon={<TuneIcon />}
              onClick={() => setIsMobileSidebarOpen(true)}
              sx={{ flexShrink: 0, borderRadius: 999, textTransform: 'none' }}
            >
              Hub Menu
            </Button>
          </Stack>
        )}

        {selectedView.type === 'home' && currentPharmacyDetails ? (
          <HomePageContent
            details={currentPharmacyDetails}
            onOpenSettings={canManagePharmacyProfile ? openPharmacyProfileModal : undefined}
            canCreatePost={canPharmacyPost}
            scope={{ type: 'pharmacy', id: currentPharmacyDetails.id }}
            membersLoader={pharmacyMembersLoader}
            targetPostId={resolvedTargetPostId}
            onTargetPostHandled={clearDeepLinkParams}
          />
        ) : selectedView.type === 'orgHome' && currentOrganizationDetails ? (
          <OrgHomePageContent
            details={currentOrganizationDetails}
            onOpenSettings={showOrgSettings ? openOrganizationProfileModal : undefined}
            canCreatePost={currentOrganizationDetails.canCreatePost}
            scope={{ type: 'organization', id: currentOrganizationDetails.id }}
            membersLoader={organizationMembersLoader}
            targetPostId={resolvedTargetPostId}
            onTargetPostHandled={clearDeepLinkParams}
          />
        ) : selectedView.type === 'group' ? (
          <GroupContent
            pharmacy={selectedPharmacy}
            group={filteredCommunityGroups.find((g) => g.id === selectedView.id)}
            scope={{ type: 'group', id: selectedView.id as number }}
            onEditGroup={handleRequestEditGroup}
            onDeleteGroup={handleDeleteGroup}
            targetPostId={resolvedTargetPostId}
            onTargetPostHandled={clearDeepLinkParams}
          />
        ) : selectedView.type === 'orgGroup' ? (
          <OrgGroupContent
            group={organizationGroups.find((g) => g.id === selectedView.id)}
            scope={{ type: 'group', id: selectedView.id as number }}
            onEditGroup={handleRequestEditGroup}
            onDeleteGroup={handleDeleteGroup}
            targetPostId={resolvedTargetPostId}
            onTargetPostHandled={clearDeepLinkParams}
          />
        ) : selectedView.type === 'platformHome' && selectedChemistTaskerHub ? (
          <ChemistTaskerHubContent
            hub={selectedChemistTaskerHub as HubChemistTaskerHub}
            scope={{ type: 'platform', id: selectedChemistTaskerHub.key }}
            targetPostId={resolvedTargetPostId}
            onTargetPostHandled={clearDeepLinkParams}
          />
        ) : (
          <Typography variant="h6" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
            Please select a ChemistTasker hub, pharmacy, organization, or group from the sidebar.
          </Typography>
        )}
      </Box>

      {groupModal && (
        <CreateGroupModal
          title={groupModal.title}
          scope={groupModal.scope}
          mode={groupModal.mode}
          onClose={closeGroupModal}
          onSubmit={(values) => {
            if (groupModal.mode === 'edit' && groupModal.group) {
              void handleEditGroupSubmit(groupModal.group, values);
            } else {
              void handleCreateGroupSubmit(values, groupModal.scope);
            }
          }}
          pharmacies={pharmacies}
          initialGroup={groupModal.group}
          currentUserId={user?.id ?? null}
        />
      )}

      {pharmacyProfileModalOpen && selectedPharmacy && (
        <PharmacyProfileModal
          open={pharmacyProfileModalOpen}
          pharmacy={selectedPharmacy}
          onClose={closePharmacyProfileModal}
          onSaved={handlePharmacyProfileSaved}
        />
      )}

      {organizationProfileModalOpen && selectedOrganization && (
        <OrganizationProfileModal
          open={organizationProfileModalOpen}
          organization={selectedOrganization}
          onClose={closeOrganizationProfileModal}
          onSaved={handleOrganizationProfileSaved}
        />
      )}
    </Box>
  );
}
