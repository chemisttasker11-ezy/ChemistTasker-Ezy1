import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormHelperText,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  ListSubheader,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';

import {
  fetchOrganizationMembers,
  fetchPharmacyGroupMembers,
} from '../../../../api/hub';
import type {
  HubGroup,
  HubGroupMemberOption,
  HubPharmacy,
} from '../../../../types/hub';
import { getMemberDisplayName, formatMemberLabel } from './hubUtils';

export type GroupModalScope =
  | { type: 'pharmacy'; pharmacyId: number }
  | { type: 'organization'; organizationId: number };

export type GroupModalMode = 'create' | 'edit';

export interface GroupModalFormValues {
  name: string;
  description: string;
  memberIds: number[];
}

interface CreateGroupModalProps {
  title: string;
  scope: GroupModalScope;
  mode: GroupModalMode;
  onClose: () => void;
  onSubmit: (values: GroupModalFormValues) => void;
  pharmacies: HubPharmacy[];
  initialGroup?: HubGroup;
  currentUserId?: number | null;
}

export function CreateGroupModal({
  title,
  scope,
  mode,
  onClose,
  onSubmit,
  pharmacies,
  initialGroup,
  currentUserId,
}: CreateGroupModalProps) {
  const [groupName, setGroupName] = useState(initialGroup?.name ?? '');
  const [description, setDescription] = useState(initialGroup?.description ?? '');
  const [members, setMembers] = useState<HubGroupMemberOption[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<number>>(new Set());
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  useEffect(() => {
    setGroupName(initialGroup?.name ?? '');
    setDescription(initialGroup?.description ?? '');
    if (initialGroup?.members) {
      setSelectedMembers(
        new Set(
          initialGroup.members
            .filter((member) => currentUserId == null || member.member?.userDetails?.id !== currentUserId)
            .map((member) => member.membershipId),
        ),
      );
    } else if (mode === 'create') {
      setSelectedMembers(new Set());
    }
  }, [currentUserId, initialGroup, mode]);

  useEffect(() => {
    let isMounted = true;
    const loadMembers = async () => {
      setLoadingMembers(true);
      setMembersError(null);
      try {
        let results: HubGroupMemberOption[] = [];
        if (scope.type === 'pharmacy') {
          const pharmacyIds = (pharmacies.length ? pharmacies : [{ id: scope.pharmacyId }])
            .map((pharmacy) => pharmacy.id)
            .filter((id): id is number => typeof id === 'number');
          const uniqueIds = Array.from(new Set(pharmacyIds));
          const responses = await Promise.all(
            uniqueIds.map((id) => fetchPharmacyGroupMembers(id))
          );
          results = responses.flat();
        } else {
          // For organization groups, load the full org roster (org staff + all pharmacy members under the org).
          results = await fetchOrganizationMembers(scope.organizationId);
        }
        if (isMounted) {
          setMembers(results.filter((member) => currentUserId == null || member.userId !== currentUserId));
        }
      } catch (err) {
        console.error('Failed to load members for group', err);
        if (isMounted) {
          setMembersError('Unable to load members for selection. Please try again.');
        }
      } finally {
        if (isMounted) {
          setLoadingMembers(false);
        }
      }
    };
    loadMembers();
    return () => {
      isMounted = false;
    };
  }, [currentUserId, scope, pharmacies]);

  const uniqueRoles = useMemo(() => {
    const roles = new Set<string>();
    members.forEach(member => {
      if (member.role) {
        roles.add(member.role);
      }
    });
    return Array.from(roles).sort();
  }, [members]);

  const filteredMembers = useMemo(() => {
    return members.filter(member => {
      const matchesRole = roleFilter === 'ALL' || member.role === roleFilter;
      const matchesQuery =
        getMemberDisplayName(member).toLowerCase().includes(searchQuery.toLowerCase()) ||
        (member.email?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
      return matchesRole && matchesQuery;
    });
  }, [members, roleFilter, searchQuery]);

  const selectedMemberDetails = useMemo(
    () =>
      members.filter((member) => selectedMembers.has(member.membershipId)),
    [members, selectedMembers],
  );

  const groupedMembers = useMemo(() => {
    const groups: Array<{
      label: string;
      members: HubGroupMemberOption[];
      pharmacyId: number | null;
    }> = [];
    const memberMap = new Map<number | 'unassigned', HubGroupMemberOption[]>();

    filteredMembers.forEach(member => {
      const key = typeof member.pharmacyId === 'number' ? member.pharmacyId : 'unassigned';
      if (!memberMap.has(key)) {
        memberMap.set(key, []);
      }
      memberMap.get(key)!.push(member);
    });

    const orderedKeys: Array<number | 'unassigned'> = [];
    pharmacies.forEach(pharmacy => {
      if (memberMap.has(pharmacy.id)) {
        orderedKeys.push(pharmacy.id);
      }
    });
    memberMap.forEach((_members, key) => {
      if (!orderedKeys.includes(key)) {
        orderedKeys.push(key);
      }
    });

    orderedKeys.forEach(key => {
      const list = memberMap.get(key);
      if (!list || !list.length) {
        return;
      }
      const label =
        typeof key === 'number'
          ? pharmacies.find((pharmacy) => pharmacy.id === key)?.name ?? `Pharmacy #${key}`
          : 'Other Members';
      groups.push({
        label,
        members: list,
        pharmacyId: typeof key === 'number' ? key : null,
      });
    });

    return groups;
  }, [filteredMembers, pharmacies]);

  const toggleMember = (membershipId: number) => {
    setSelectedMembers(prev => {
      const next = new Set(prev);
      if (next.has(membershipId)) {
        next.delete(membershipId);
      } else {
        next.add(membershipId);
      }
      return next;
    });
  };

  const renderMemberRow = (member: HubGroupMemberOption) => {
    const isChecked = selectedMembers.has(member.membershipId);
    const displayName = getMemberDisplayName(member);
    return (
      <ListItemButton
        key={member.membershipId}
        onClick={() => toggleMember(member.membershipId)}
        selected={isChecked}
        sx={{ alignItems: 'flex-start' }}
      >
        <Checkbox
          checked={isChecked}
          tabIndex={-1}
          disableRipple
          sx={{ mr: 1 }}
        />
        <ListItemText
          primary={
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="subtitle2">{displayName}</Typography>
              <Chip label={member.role.replace(/_/g, ' ')} size="small" />
            </Box>
          }
          secondary={
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary">
                {formatMemberLabel(displayName, member.role, member.jobTitle)}
              </Typography>
              {member.jobTitle && (
                <Typography variant="caption" color="text.secondary">
                  {member.jobTitle}
                </Typography>
              )}
              {member.pharmacyName ? (
                <Typography variant="caption" color="text.secondary">
                  {member.pharmacyName}
                </Typography>
              ) : null}
            </Stack>
          }
        />
      </ListItemButton>
    );
  };

  const selectMembersBatch = useCallback((targetMembers: HubGroupMemberOption[]) => {
    setSelectedMembers(prev => {
      const next = new Set(prev);
      targetMembers.forEach(member => {
        next.add(member.membershipId);
      });
      return next;
    });
  }, []);

  const handleSelectAllVisible = () => {
    selectMembersBatch(filteredMembers);
  };

  const handleClearAll = () => {
    setSelectedMembers(new Set());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = groupName.trim();
    if (!trimmedName) return;
    const hiddenCurrentMemberIds =
      mode === 'edit'
        ? initialGroup?.members
            ?.filter((member) => currentUserId != null && member.member?.userDetails?.id === currentUserId)
            .map((member) => member.membershipId) ?? []
        : [];
    onSubmit({
      name: trimmedName,
      description: description.trim(),
      memberIds: Array.from(new Set([...selectedMembers, ...hiddenCurrentMemberIds])),
    });
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth component="form" onSubmit={handleSubmit}>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">{title}</Typography>
          <IconButton onClick={onClose} size="small" aria-label="Close dialog">
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          autoFocus
          margin="dense"
          label="Group Name"
          type="text"
          fullWidth
          variant="outlined"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="e.g., QCPP Champions"
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 1,
              '& fieldset': { borderColor: 'grey.300' },
              '&.Mui-focused fieldset': { borderColor: 'primary.main' },
            },
          }}
        />
        <TextField
          margin="dense"
          label="Description"
          type="text"
          fullWidth
          variant="outlined"
          multiline
          minRows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the purpose of this group"
        />
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search members by name or email"
            fullWidth
            InputProps={{
              startAdornment: (
                <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />
              ),
            }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="role-filter-label">Filter by role</InputLabel>
            <Select
              labelId="role-filter-label"
              value={roleFilter}
              label="Filter by role"
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <MenuItem value="ALL">All roles</MenuItem>
              {uniqueRoles.map(role => (
                <MenuItem key={role} value={role}>
                  {role.replace(/_/g, ' ')}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        <Stack spacing={1}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {selectedMembers.size} member{selectedMembers.size === 1 ? '' : 's'} selected
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                size="small"
                variant="outlined"
                onClick={handleSelectAllVisible}
                disabled={filteredMembers.length === 0}
              >
                Select all visible
              </Button>
              <Button
                size="small"
                variant="text"
                onClick={handleClearAll}
                disabled={selectedMembers.size === 0}
              >
                Clear selection
              </Button>
            </Box>
          </Box>
          {selectedMemberDetails.length > 0 && (
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 0.5,
                p: 1,
                border: '1px solid',
                borderColor: 'grey.200',
                borderRadius: 1,
                maxHeight: 112,
                overflowY: 'auto',
              }}
            >
              {selectedMemberDetails.map(member => {
                const nameLabel = formatMemberLabel(
                  getMemberDisplayName(member),
                  member.role,
                  member.jobTitle,
                );
                const chipLabel = member.pharmacyName ? `${nameLabel} — ${member.pharmacyName}` : nameLabel;
                return (
                  <Chip
                    key={member.membershipId}
                    label={chipLabel}
                    onDelete={() => toggleMember(member.membershipId)}
                    size="small"
                  />
                );
              })}
            </Box>
          )}
        </Stack>
        {membersError && (
          <Alert severity="error">{membersError}</Alert>
        )}
        <Box sx={{ maxHeight: 360, overflowY: 'auto', border: '1px solid', borderColor: 'grey.200', borderRadius: 2 }}>
          {loadingMembers ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : filteredMembers.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No members match your filters.
              </Typography>
            </Box>
          ) : (
            <List dense disablePadding>
              {groupedMembers.map((group, index) => (
                <React.Fragment key={`${group.label}-${group.pharmacyId ?? 'other'}-${index}`}>
                  <ListSubheader
                    disableSticky
                    sx={{
                      bgcolor: 'grey.50',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      {group.label}
                    </Typography>
                </ListSubheader>
                  {group.members.map(renderMemberRow)}
                  {index < groupedMembers.length - 1 && (
                    <Divider component="li" sx={{ borderColor: 'grey.100' }} />
                  )}
                </React.Fragment>
              ))}
            </List>
          )}
        </Box>
        <FormHelperText sx={{ mx: 1 }}>
          {selectedMembers.size} member{selectedMembers.size === 1 ? '' : 's'} selected
        </FormHelperText>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} variant="outlined" sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={!groupName.trim()}
          sx={{ textTransform: 'none', bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }}
        >
          {mode === 'edit' ? 'Save Changes' : 'Create Group'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}




