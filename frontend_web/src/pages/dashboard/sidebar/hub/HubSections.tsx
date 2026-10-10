import { useCallback, useEffect, useState } from 'react';
import { Box, IconButton, Menu, MenuItem, Typography } from '@mui/material';
import { MoreHorizontal } from 'lucide-react';
import { getCurrentUser } from '@chemisttasker/shared-core';

import { fetchHubGroup, fetchHubGroupMembers } from '../../../../api/hub';
import type {
  HubChemistTaskerHub,
  HubGroup,
  HubGroupMemberOption,
  HubPharmacy,
  HubScopeSelection,
} from '../../../../types/hub';
import { Pill } from '../../../../components/ui/Pill';
import { ScopeFeed } from './HubFeed';
import HubSpace, { type HubPerson } from './HubSpace';
import { getMemberDisplayName } from './hubUtils';

/** Group members with the admin flag the group API already returns. */
const loadGroupPeople = async (groupId: number): Promise<HubPerson[]> => {
  const group = await fetchHubGroup(groupId, { includeMembers: true });
  return (group.members ?? []).map((entry) => ({
    membershipId: entry.membershipId,
    userId: entry.member?.userDetails?.id ?? null,
    fullName: getMemberDisplayName({ firstName: entry.member?.userDetails?.firstName, lastName: entry.member?.userDetails?.lastName, username: entry.member?.userDetails?.username }),
    email: null,
    role: entry.member?.role ?? 'MEMBER',
    employmentType: entry.member?.employmentType ?? null,
    pharmacyId: entry.pharmacyId ?? group.pharmacyId ?? null,
    pharmacyName: entry.pharmacyName ?? group.pharmacyName ?? null,
    jobTitle: entry.jobTitle ?? null,
    profilePhotoUrl: entry.member?.userDetails?.profilePhotoUrl ?? null,
    isAdmin: Boolean(entry.isAdmin),
  }));
};

const STAFF_EMPLOYMENT_TYPES = new Set(['FULL_TIME', 'PART_TIME', 'CASUAL']);
/** A pharmacy's members are its team (full time, part time and casual). */
const filterPharmacyStaffMembers = (members: HubGroupMemberOption[]) =>
  members.filter((member) => STAFF_EMPLOYMENT_TYPES.has(member.employmentType || ''));

interface HomePageContentProps {
  onMemberCount?: (count: number) => void;
  details: {
    id: number;
    coverImage: string;
    about: string;
    name: string;
    canManageProfile: boolean;
    canCreatePost: boolean;
    profilePhotoUrl?: string | null;
  };
  onOpenSettings?: () => void;
  canCreatePost: boolean;
  scope: HubScopeSelection;
  membersLoader: () => Promise<HubGroupMemberOption[]>;
  targetPostId?: number | null;
  onTargetPostHandled?: () => void;
}

export function HomePageContent({
  details,
  onOpenSettings,
  canCreatePost,
  scope,
  membersLoader,
  targetPostId,
  onTargetPostHandled,
  onMemberCount,
}: HomePageContentProps) {
  return (
    <HubSpace
      kind="pharmacy"
      name={details.name}
      eyebrow="Pharmacy hub"
      privacy="Private to your pharmacy team"
      coverImage={details.coverImage}
      about={details.about}
      aboutFallback={`Add a short introduction so new team members know what ${details.name} uses this hub for.`}
      membersLoader={membersLoader}
      memberFilter={filterPharmacyStaffMembers}
      onOpenSettings={details.canManageProfile ? onOpenSettings : undefined}
      settingsLabel="Edit pharmacy profile"
      onMemberCount={onMemberCount}
    >
      <ScopeFeed
        key={`${scope.type}:${scope.id}`}
        scope={scope}
        canCreatePost={canCreatePost}
        membersLoader={membersLoader}
        audienceName={details.name}
        emptyTitle="No posts yet"
        emptyDescription="Share the first update with your pharmacy team."
        targetPostId={targetPostId}
        onTargetPostHandled={onTargetPostHandled}
      />
    </HubSpace>
  );
}

interface OrgHomePageContentProps {
  onMemberCount?: (count: number) => void;
  details: {
    id: number;
    name: string;
    coverImage: string;
    about: string;
    canManageProfile: boolean;
    canCreatePost: boolean;
    profilePhotoUrl?: string | null;
  };
  onOpenSettings?: () => void;
  canCreatePost?: boolean;
  scope: HubScopeSelection;
  membersLoader: () => Promise<HubGroupMemberOption[]>;
  targetPostId?: number | null;
  onTargetPostHandled?: () => void;
}

export function OrgHomePageContent({
  details,
  onOpenSettings,
  canCreatePost = false,
  scope,
  membersLoader,
  targetPostId,
  onTargetPostHandled,
  onMemberCount,
}: OrgHomePageContentProps) {
  return (
    <HubSpace
      kind="organization"
      name={details.name}
      eyebrow="Organisation hub"
      privacy="Private to your organisation"
      coverImage={details.coverImage}
      about={details.about}
      aboutFallback={`Add a short introduction so everyone across ${details.name} knows what this hub is for.`}
      membersLoader={membersLoader}
      onOpenSettings={details.canManageProfile ? onOpenSettings : undefined}
      settingsLabel="Edit organisation profile"
      onMemberCount={onMemberCount}
    >
      <ScopeFeed
        key={`${scope.type}:${scope.id}`}
        scope={scope}
        canCreatePost={canCreatePost}
        membersLoader={membersLoader}
        audienceName={details.name}
        emptyTitle="No posts yet"
        emptyDescription="Share the first announcement with your organisation."
        targetPostId={targetPostId}
        onTargetPostHandled={onTargetPostHandled}
      />
    </HubSpace>
  );
}

interface ChemistTaskerHubContentProps {
  hub: HubChemistTaskerHub;
  scope: HubScopeSelection;
  targetPostId?: number | null;
  onTargetPostHandled?: () => void;
}

const AUDIENCE_ABOUT: Record<string, string> = {
  PUBLIC: 'Platform-wide discussion open to everyone on ChemistTasker.',
  OWNER: 'A hub for pharmacy owners across ChemistTasker.',
  PHARMACIST: 'A shared space for pharmacists across the platform.',
  INTERN: 'A shared space for intern pharmacists across the platform.',
  STAFF: 'A shared space for pharmacy staff across the platform.',
};

export function ChemistTaskerHubContent({ hub, scope, targetPostId, onTargetPostHandled }: ChemistTaskerHubContentProps) {
  const [opening, setOpening] = useState(true);
  useEffect(() => {
    let active = true;
    setOpening(true);
    getCurrentUser()
      .then((user: { public_community_enabled?: boolean }) => {
        if (!active) return;
        if (user.public_community_enabled && ['public', 'pharmacist', 'intern', 'staff', 'explorer', 'owner'].includes(hub.key)) {
          window.location.assign(targetPostId ? `/hubs/posts/${targetPostId}` : `/hubs/${hub.key}`);
        } else {
          setOpening(false);
        }
      })
      .catch(() => { if (active) setOpening(false); });
    return () => { active = false; };
  }, [hub.key, targetPostId]);
  if (opening) return <Box role="status" sx={{ p: 3, color: 'var(--ct-text-secondary)' }}>Opening your community…</Box>;

  const isEveryone = hub.audienceType === 'PUBLIC' || hub.audienceType === 'ALL';
  return (
    <HubSpace
      kind="platform"
      name={hub.label}
      eyebrow="ChemistTasker community"
      privacy={isEveryone ? 'Everyone on ChemistTasker' : `${hub.label.replace(/ Hub$/, '')}s on ChemistTasker`}
      isPublic={isEveryone}
      about={AUDIENCE_ABOUT[hub.audienceType] ?? 'Platform-wide discussion on ChemistTasker.'}
      aboutFallback="Platform-wide discussion on ChemistTasker."
    >
      <ScopeFeed
        key={`${scope.type}:${scope.id}`}
        scope={scope}
        canCreatePost
        audienceName={hub.label}
        emptyTitle="No posts yet"
        emptyDescription={`Start the first conversation in ${hub.label}.`}
        targetPostId={targetPostId}
        onTargetPostHandled={onTargetPostHandled}
      />
    </HubSpace>
  );
}

function GroupMenu({ group, onEditGroup, onDeleteGroup }: { group: HubGroup; onEditGroup: (group: HubGroup) => void; onDeleteGroup: (group: HubGroup) => void }) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  if (!(group.isAdmin || group.isCreator)) return null;
  return (
    <>
      <IconButton aria-label={`Options for ${group.name}`} aria-haspopup="menu" onClick={(event) => setAnchor(event.currentTarget)} sx={{ width: 40, height: 40, border: '1px solid var(--ct-border-color)' }}>
        <MoreHorizontal size={18} />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { setAnchor(null); onEditGroup(group); }}>Edit group</MenuItem>
        <MenuItem onClick={() => { setAnchor(null); onDeleteGroup(group); }} sx={{ color: 'error.main' }}>Delete group</MenuItem>
      </Menu>
    </>
  );
}

function GroupNotFound({ label }: { label: string }) {
  return (
    <Box sx={{ display: 'flex', minHeight: 240, alignItems: 'center', justifyContent: 'center' }}>
      <Typography color="text.secondary">{label}</Typography>
    </Box>
  );
}

interface GroupContentProps {
  pharmacy: HubPharmacy | undefined | null;
  group: HubGroup | undefined;
  scope: HubScopeSelection;
  onEditGroup: (group: HubGroup) => void;
  onDeleteGroup: (group: HubGroup) => void;
  targetPostId?: number | null;
  onTargetPostHandled?: () => void;
}

export function GroupContent({ pharmacy, group, scope, onEditGroup, onDeleteGroup, targetPostId, onTargetPostHandled }: GroupContentProps) {
  const groupId = group?.id;
  const membersLoader = useCallback(() => fetchHubGroupMembers(groupId as number), [groupId]);
  const peopleLoader = useCallback(() => loadGroupPeople(groupId as number), [groupId]);
  if (!group) return <GroupNotFound label="This group isn't available any more." />;
  return (
    <HubSpace
      kind="group"
      name={group.name}
      eyebrow={pharmacy ? `Group in ${pharmacy.name}` : 'Community group'}
      privacy="Private to group members"
      about={group.description}
      aboutFallback="No description yet."
      membersLoader={peopleLoader}
      badges={group.isCreator ? <Pill tone="violet" label="Created by you" /> : undefined}
      actions={<GroupMenu group={group} onEditGroup={onEditGroup} onDeleteGroup={onDeleteGroup} />}
      aboutFacts={pharmacy ? [{ label: 'Pharmacy', value: pharmacy.name }] : []}
    >
      <ScopeFeed
        key={`${scope.type}:${scope.id}`}
        scope={scope}
        canCreatePost
        membersLoader={membersLoader}
        audienceName={group.name}
        emptyTitle="No posts yet"
        emptyDescription="Start the conversation with your group."
        targetPostId={targetPostId}
        onTargetPostHandled={onTargetPostHandled}
      />
    </HubSpace>
  );
}

interface OrgGroupContentProps {
  group: HubGroup | undefined;
  scope: HubScopeSelection;
  onEditGroup: (group: HubGroup) => void;
  onDeleteGroup: (group: HubGroup) => void;
  targetPostId?: number | null;
  onTargetPostHandled?: () => void;
}

export function OrgGroupContent({ group, scope, onEditGroup, onDeleteGroup, targetPostId, onTargetPostHandled }: OrgGroupContentProps) {
  const groupId = group?.id;
  const membersLoader = useCallback(() => fetchHubGroupMembers(groupId as number), [groupId]);
  const peopleLoader = useCallback(() => loadGroupPeople(groupId as number), [groupId]);
  if (!group) return <GroupNotFound label="This organisation group isn't available any more." />;
  return (
    <HubSpace
      kind="group"
      name={group.name}
      eyebrow="Organisation group"
      privacy="Private to group members"
      about={group.description}
      aboutFallback="No description yet."
      membersLoader={peopleLoader}
      badges={group.isCreator ? <Pill tone="violet" label="Created by you" /> : undefined}
      actions={<GroupMenu group={group} onEditGroup={onEditGroup} onDeleteGroup={onDeleteGroup} />}
    >
      <ScopeFeed
        key={`${scope.type}:${scope.id}`}
        scope={scope}
        canCreatePost
        membersLoader={membersLoader}
        audienceName={group.name}
        emptyTitle="No posts yet"
        emptyDescription="Start the conversation with your group."
        targetPostId={targetPostId}
        onTargetPostHandled={onTargetPostHandled}
      />
    </HubSpace>
  );
}

export interface GroupModalFormValues {
  name: string;
  description: string;
  memberIds: number[];
}
