import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Card,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  IconButton,
  LinearProgress,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import TagIcon from '@mui/icons-material/Tag';

import { fetchHubGroupMembers } from '../../../../api/hub';
import type {
  HubChemistTaskerHub,
  HubGroup,
  HubGroupMemberOption,
  HubPharmacy,
  HubScopeSelection,
} from '../../../../types/hub';
import { ScopeFeed } from './HubFeed';
import { formatMemberLabel, getMemberDisplayName } from './hubUtils';

const STAFF_EMPLOYMENT_TYPES = new Set(['FULL_TIME', 'PART_TIME', 'CASUAL']);
const filterPharmacyStaffMembers = (members: HubGroupMemberOption[]) =>
  members.filter((member) => STAFF_EMPLOYMENT_TYPES.has(member.employmentType || ''));
interface HomePageContentProps {
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
}: HomePageContentProps) {
  return (
    <Box sx={{ width: '100%', mx: 'auto' }}>
      <Card sx={{ borderRadius: 2, boxShadow: 3, width: '100%', position: 'relative' }}>
        {details.canManageProfile && onOpenSettings && (
          <Tooltip title="Edit pharmacy profile">
            <IconButton
              onClick={onOpenSettings}
              size="small"
              sx={{ position: 'absolute', top: 16, right: 16, bgcolor: 'white', boxShadow: 2, zIndex: 2 }}
            >
              <SettingsOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Box sx={{ position: 'relative', height: { xs: 220, md: 260 }, overflow: 'hidden', borderRadius: '16px 16px 0 0' }}>
          <CardMedia
            component="img"
            height="100%"
            image={details.coverImage}
            alt="Pharmacy cover"
            sx={{ objectFit: 'cover', width: '100%', filter: 'brightness(0.85)' }}
          />
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background: 'linear-gradient(180deg, rgba(15,23,42,0.15) 0%, rgba(15,23,42,0.8) 100%)',
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              bottom: 24,
              left: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
              color: 'common.white',
              pointerEvents: 'none',
            }}
          >
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              {details.name}
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>
              Pharmacy Hub Overview
            </Typography>
          </Box>
        </Box>
        <CardContent sx={{ p: { xs: 3, md: 4 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold', color: 'text.primary' }}>
            {details.name}
          </Typography>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 'semibold', color: 'text.secondary' }}>
            About Us
          </Typography>
          <Typography variant="body1" sx={{ lineHeight: 1.75, color: 'text.secondary' }}>
            {details.about}
          </Typography>
        </CardContent>
      </Card>
      <MembersPreviewPanel
        loadMembers={membersLoader}
        title="Pharmacy Members"
        emptyMessage={`Invite teammates to ${details.name} to start collaborating.`}
      />
      <Box sx={{ mt: 3 }}>
        <ScopeFeed
          key={`${scope.type}:${scope.id}`}
          scope={scope}
          canCreatePost={canCreatePost}
          membersLoader={membersLoader}
          emptyTitle="No updates yet."
          emptyDescription="Share the first update with your pharmacy."
          targetPostId={targetPostId}
          onTargetPostHandled={onTargetPostHandled}
        />
      </Box>
    </Box>
  );
}

interface MembersPreviewPanelProps {
  loadMembers?: () => Promise<HubGroupMemberOption[]>;
  title: string;
  emptyMessage: string;
}

function MembersPreviewPanel({ loadMembers, title, emptyMessage }: MembersPreviewPanelProps) {
  const [members, setMembers] = useState<HubGroupMemberOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loadMembers) {
      setMembers([]);
      setLoading(false);
      setError(null);
      return;
    }
    let isMounted = true;
    setLoading(true);
    setError(null);
    loadMembers()
      .then((list) => {
        if (isMounted) {
          setMembers(filterPharmacyStaffMembers(list));
        }
      })
      .catch((err) => {
        console.error('Failed to load member preview', err);
        if (isMounted) {
          setMembers([]);
          setError('Unable to load members right now.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [loadMembers]);

  if (!loadMembers) {
    return null;
  }

  const preview = members.slice(0, 12);
  const remaining = members.length - preview.length;
  const initialsFor = (label: string) => {
    const parts = label.trim().split(/\s+/);
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase() || 'U';
  };

  return (
    <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'grey.200', boxShadow: 0, mt: 3 }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">{title}</Typography>
          {loading ? (
            <CircularProgress size={16} />
          ) : (
            <Chip
              label={`${members.length} member${members.length === 1 ? '' : 's'}`}
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
        </Stack>
        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : loading && !members.length ? (
          <LinearProgress />
        ) : members.length ? (
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {preview.map((member) => {
              const baseName = getMemberDisplayName(member);
              return (
                <Chip
                  key={member.membershipId}
                  avatar={
                    <Avatar
                      src={member.profilePhotoUrl || undefined}
                      sx={{ width: 28, height: 28, fontSize: '0.75rem' }}
                    >
                      {initialsFor(baseName)}
                    </Avatar>
                  }
                  label={formatMemberLabel(baseName, member.role, member.jobTitle)}
                  size="small"
                  variant="outlined"
                />
              );
            })}
            {remaining > 0 && (
              <Chip label={`+${remaining} more`} size="small" color="primary" variant="outlined" />
            )}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {emptyMessage}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

// --- Org Home Page Content ---
interface OrgHomePageContentProps {
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
}: OrgHomePageContentProps) {
  return (
    <Box sx={{ width: '100%', mx: 'auto' }}>
      <Card sx={{ borderRadius: 2, boxShadow: 3, width: '100%', position: 'relative' }}>
        {details.canManageProfile && onOpenSettings && (
          <Tooltip title="Edit organization profile">
            <IconButton
              onClick={onOpenSettings}
              size="small"
              sx={{ position: 'absolute', top: 16, right: 16, bgcolor: 'white', boxShadow: 2, zIndex: 2 }}
            >
              <SettingsOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Box sx={{ position: 'relative', height: { xs: 220, md: 260 }, overflow: 'hidden', borderRadius: '16px 16px 0 0' }}>
          <CardMedia
            component="img"
            height="100%"
            image={details.coverImage}
            alt="Organization cover"
            sx={{ objectFit: 'cover', width: '100%', filter: 'brightness(0.85)' }}
          />
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background: 'linear-gradient(180deg, rgba(2,6,23,0.2) 0%, rgba(2,6,23,0.85) 100%)',
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              bottom: 24,
              left: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
              color: 'common.white',
              pointerEvents: 'none',
            }}
          >
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              {details.name}
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>
              Organization Workspace
            </Typography>
          </Box>
        </Box>
        <CardContent sx={{ p: { xs: 3, md: 4 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h3" component="h1" sx={{ fontWeight: 'bold', color: 'text.primary' }}>
            {details.name}
          </Typography>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 'semibold', color: 'text.secondary' }}>
            About Our Organization
          </Typography>
          <Typography variant="body1" sx={{ lineHeight: 1.75, color: 'text.secondary' }}>
            {details.about}
          </Typography>
        </CardContent>
      </Card>
      <MembersPreviewPanel
        loadMembers={membersLoader}
        title="Organization Members"
        emptyMessage={`Invite members to ${details.name} to collaborate across pharmacies.`}
      />
      <Box sx={{ mt: 3 }}>
        <ScopeFeed
          key={`${scope.type}:${scope.id}`}
          scope={scope}
          canCreatePost={canCreatePost}
          membersLoader={membersLoader}
          emptyTitle="No updates yet."
          emptyDescription="Share the first announcement with your organization."
          targetPostId={targetPostId}
          onTargetPostHandled={onTargetPostHandled}
        />
      </Box>
    </Box>
  );
}

interface ChemistTaskerHubContentProps {
  hub: HubChemistTaskerHub;
  scope: HubScopeSelection;
  targetPostId?: number | null;
  onTargetPostHandled?: () => void;
}

export function ChemistTaskerHubContent({ hub, scope, targetPostId, onTargetPostHandled }: ChemistTaskerHubContentProps) {
  const subtitleByAudience: Record<string, string> = {
    PUBLIC: "Platform-wide discussion open to everyone on ChemistTasker.",
    OWNER: "A hub for pharmacy owners across ChemistTasker.",
    PHARMACIST: "A shared space for pharmacists across the platform.",
    INTERN: "A shared space for intern pharmacists across the platform.",
    STAFF: "A shared space for non-intern staff across the platform.",
  };

  return (
    <Box sx={{ width: '100%', mx: 'auto' }}>
      <Card sx={{ borderRadius: 2, boxShadow: 3, width: '100%' }}>
        <Box sx={{ position: 'relative', height: { xs: 220, md: 260 }, overflow: 'hidden', borderRadius: '16px 16px 0 0' }}>
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(135deg, #111827 0%, #1d4ed8 55%, #0f766e 100%)',
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background: 'linear-gradient(180deg, rgba(15,23,42,0.1) 0%, rgba(15,23,42,0.78) 100%)',
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              bottom: 24,
              left: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
              color: 'common.white',
            }}
          >
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              {hub.label}
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>
              ChemistTasker Hub
            </Typography>
          </Box>
        </Box>
        <CardContent sx={{ p: { xs: 3, md: 4 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold', color: 'text.primary' }}>
            {hub.label}
          </Typography>
          <Typography variant="body1" sx={{ lineHeight: 1.75, color: 'text.secondary' }}>
            {subtitleByAudience[hub.audienceType] ?? "Platform-wide discussion on ChemistTasker."}
          </Typography>
        </CardContent>
      </Card>
      <Box sx={{ mt: 3 }}>
        <ScopeFeed
          key={`${scope.type}:${scope.id}`}
          scope={scope}
          canCreatePost
          emptyTitle="No updates yet."
          emptyDescription={`Share the first update in ${hub.label}.`}
          targetPostId={targetPostId}
          onTargetPostHandled={onTargetPostHandled}
        />
      </Box>
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
  const [actionsAnchorEl, setActionsAnchorEl] = useState<null | HTMLElement>(null);
  const actionsOpen = Boolean(actionsAnchorEl);

  if (!group) {
    return (
      <Box sx={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="text.secondary">Group not found.</Typography>
      </Box>
    );
  }

  const membersLoader = useCallback(() => fetchHubGroupMembers(group.id), [group.id]);

  return (
    <Stack sx={{ width: '100%' }} spacing={3}>
      <Card sx={{ borderRadius: 2, boxShadow: 3, background: 'linear-gradient(to right, #6D28D9, #4C1D95)', color: 'white', p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <TagIcon sx={{ fontSize: 32, opacity: 0.8 }} />
            <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold' }}>{group.name}</Typography>
            {group.isCreator && (
              <Chip
                label="Created by you"
                size="small"
                sx={{
                  bgcolor: 'rgba(255,255,255,0.15)',
                  color: 'common.white',
                  fontWeight: 600,
                }}
              />
            )}
          </Box>
          {(group.isAdmin || group.isCreator) && (
            <>
              <IconButton onClick={(event) => setActionsAnchorEl(event.currentTarget)} sx={{ color: 'white' }}>
                <MoreVertIcon />
              </IconButton>
              <Menu
                anchorEl={actionsAnchorEl}
                open={actionsOpen}
                onClose={() => setActionsAnchorEl(null)}
              >
                <MenuItem onClick={() => { setActionsAnchorEl(null); onEditGroup(group); }}>Edit group</MenuItem>
                <MenuItem onClick={() => { setActionsAnchorEl(null); onDeleteGroup(group); }}>Delete group</MenuItem>
              </Menu>
            </>
          )}
        </Box>
        {pharmacy && (
          <Typography variant="body2" sx={{ mt: 1, color: 'primary.light' }}>
            This group is part of the <Typography component="span" sx={{ fontWeight: 'semibold' }}>{pharmacy.name}</Typography> hub.
          </Typography>
        )}
      </Card>

      <ScopeFeed
        key={`${scope.type}:${scope.id}`}
        scope={scope}
        canCreatePost
        membersLoader={membersLoader}
        emptyTitle="No updates yet."
        emptyDescription="Start the conversation with your team above."
        targetPostId={targetPostId}
        onTargetPostHandled={onTargetPostHandled}
      />
    </Stack>
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
  const [actionsAnchorEl, setActionsAnchorEl] = useState<null | HTMLElement>(null);
  const actionsOpen = Boolean(actionsAnchorEl);

  if (!group) {
    return (
      <Box sx={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="text.secondary">Organization Group not found.</Typography>
      </Box>
    );
  }

  const membersLoader = useCallback(() => fetchHubGroupMembers(group.id), [group.id]);

  return (
    <Stack sx={{ width: '100%' }} spacing={3}>
      <Card sx={{ borderRadius: 2, boxShadow: 3, background: 'linear-gradient(to right, #1976D2, #0D47A1)', color: 'white', p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <TagIcon sx={{ fontSize: 32, opacity: 0.8 }} />
            <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold' }}>{group.name} </Typography>
            {group.isCreator && (
              <Chip
                label="Created by you"
                size="small"
                sx={{
                  bgcolor: 'rgba(255,255,255,0.15)',
                  color: 'common.white',
                  fontWeight: 600,
                }}
              />
            )}
          </Box>
          {(group.isAdmin || group.isCreator) && (
            <>
              <IconButton onClick={(event) => setActionsAnchorEl(event.currentTarget)} sx={{ color: 'white' }}>
                <MoreVertIcon />
              </IconButton>
              <Menu
                anchorEl={actionsAnchorEl}
                open={actionsOpen}
                onClose={() => setActionsAnchorEl(null)}
              >
                <MenuItem onClick={() => { setActionsAnchorEl(null); onEditGroup(group); }}>Edit group</MenuItem>
                <MenuItem onClick={() => { setActionsAnchorEl(null); onDeleteGroup(group); }}>Delete group</MenuItem>
              </Menu>
            </>
          )}
        </Box>
        <Typography variant="body2" sx={{ mt: 1, color: 'info.light' }}>
          This is an organization-wide group.
        </Typography>
      </Card>

      <ScopeFeed
        key={`${scope.type}:${scope.id}`}
        scope={scope}
        canCreatePost
        membersLoader={membersLoader}
        emptyTitle="No updates yet."
        emptyDescription="Start the conversation with your team."
        targetPostId={targetPostId}
        onTargetPostHandled={onTargetPostHandled}
      />
    </Stack>
  );
}
export interface GroupModalFormValues {
  name: string;
  description: string;
  memberIds: number[];
}


