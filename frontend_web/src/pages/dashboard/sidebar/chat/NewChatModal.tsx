import { FC, useState, useMemo, useEffect, MouseEvent } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, TextField, Button,
  Box, ToggleButtonGroup, ToggleButton, Checkbox,
  InputAdornment, List, ListItem, ListItemAvatar, Avatar, ListItemText, CircularProgress,
  ListItemButton, Typography, Chip
} from '@mui/material';
import { AlertColor } from '@mui/material/Alert';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import { ChevronRight, User, Users } from 'lucide-react';
import type { ChatRoom, MemberCache, PharmacyRef, CachedMember } from './types';
import { createOrUpdateGroupRoom } from '@chemisttasker/shared-core';

const initials = (text: string) => {
  const parts = (text || '').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
};

interface NewChatModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (room: ChatRoom) => void;
  pharmacies: PharmacyRef[];
  memberCache: MemberCache;
  currentUserId?: number;
  editingRoom?: ChatRoom | null;
  onDmSelect: (partnerMembershipId: number, partnerPharmacyId: number) => void;
  /** Pharmacy selected in the top bar; its staff are listed first. */
  homePharmacyId?: number | null;
  onNotify: (severity: AlertColor, message: string) => void;
}

// Labels and groupings follow backend/memberships/models.py (ROLE_CHOICES, EMPLOYMENT_TYPE_CHOICES).
const ROLE_LABELS: Record<string, string> = {
    PHARMACIST: 'Pharmacist',
    INTERN: 'Intern pharmacist',
    TECHNICIAN: 'Dispensary technician',
    ASSISTANT: 'Pharmacy assistant',
    STUDENT: 'Pharmacy student',
    CONTACT: 'Contact',
};
const EMPLOYMENT_LABELS: Record<string, string> = {
    FULL_TIME: 'Full time',
    PART_TIME: 'Part time',
    CASUAL: 'Casual',
    LOCUM: 'Locum',
    SHIFT_HERO: 'Shift Hero',
};
const formatRole = (role: string) => {
    if (!role) return '';
    if (ROLE_LABELS[role]) return ROLE_LABELS[role];
    const words = role.toLowerCase().replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
};

/** The pharmacy's own team, whatever the contract (PHARMACY_STAFF_EMPLOYMENT_TYPES). Casual staff are team members. */
const TEAM_TYPES = ['FULL_TIME', 'PART_TIME', 'CASUAL'];
/** Locums and Shift Heroes the pharmacy keeps as favourites (FAVORITE_STAFF_EMPLOYMENT_TYPES). */
const FAVOURITE_TYPES = ['LOCUM', 'SHIFT_HERO'];

type SectionKey = 'pharmacy' | 'chain' | 'favourites' | 'organisation' | 'other';
const SECTION_META: Record<SectionKey, { title: string; hint: string }> = {
    pharmacy: { title: 'My pharmacy', hint: 'Your team at the pharmacy selected in the top bar.' },
    chain: { title: 'My chain', hint: 'Teams at your other pharmacies.' },
    favourites: { title: 'My favourites', hint: 'Locums and Shift Heroes you work with.' },
    organisation: { title: 'My organisation', hint: 'Teams at other pharmacies in your organisation.' },
    other: { title: 'Other pharmacies', hint: 'Other pharmacies you belong to.' },
};
const SECTION_ORDER: SectionKey[] = ['pharmacy', 'chain', 'favourites', 'organisation', 'other'];


type ExtendedMember = CachedMember & {
    membershipId: number;
    pharmacyId: number;
    pharmacyName: string;
};

type Section = {
    key: SectionKey;
    groups: Array<{ pharmacyId: number | null; name: string | null; members: ExtendedMember[] }>;
    count: number;
};

export const NewChatModal: FC<NewChatModalProps> = ({ open, onClose, onSave, pharmacies, memberCache, currentUserId, editingRoom, onDmSelect, homePharmacyId, onNotify }) => {
  const isEditMode = !!editingRoom;
  const [mode, setMode] = useState<'dm' | 'group'>('dm');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('All Positions');
  const [selectedUsers, setSelectedUsers] = useState<Map<number, number>>(new Map());
  const [groupName, setGroupName] = useState('');
  const [groupNameTouched, setGroupNameTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (isEditMode && editingRoom) {
        setMode('group');
        setGroupName(editingRoom.title);
        setGroupNameTouched(true);
        const initialSelected = new Map<number, number>();

        const allPharmacyIds = Object.keys(memberCache).map(n => Number(n));
        const participants = editingRoom.participant_ids ?? [];

        participants.forEach((membershipId: number) => {
          // Find which pharmacy cache actually holds this membership
          for (const pid of allPharmacyIds) {
            const rec = memberCache[pid]?.[membershipId];
            if (rec?.details && rec.details.id !== currentUserId) {
              initialSelected.set(membershipId, pid);
              break; // stop at the first match
            }
          }
        });

        setSelectedUsers(initialSelected);
      } else {
        setMode('dm');
        setSearchQuery('');
        setSelectedRole('All Positions');
        setSelectedUsers(new Map());
        setGroupName('');
        setGroupNameTouched(false);
      }
      setIsSubmitting(false);
    }
  }, [open, isEditMode, editingRoom, memberCache, currentUserId]);

  const { allRoles, allMembers } = useMemo(() => {
    const roles = new Set<string>();
    const members: ExtendedMember[] = [];
    pharmacies.forEach(pharmacy => {
      const pharmacyMembers = memberCache[pharmacy.id] || {};
      Object.entries(pharmacyMembers).forEach(([membershipId, cachedMember]) => {
        if (cachedMember.details.id !== currentUserId) {
          roles.add(cachedMember.role);
          members.push({
            membershipId: Number(membershipId),
            pharmacyId: pharmacy.id,
            pharmacyName: pharmacy.name,
            ...cachedMember,
          });
        }
      });
    });
    const formattedRoles = Array.from(roles).map(formatRole);
    const uniqueFormattedRoles = ['All Positions', ...Array.from(new Set(formattedRoles)).sort()];
    return { allRoles: uniqueFormattedRoles, allMembers: members };
  }, [memberCache, pharmacies, currentUserId]);

  // **FIX STARTS HERE: Create a consistent name mapping for each user**
  const userBestNameMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const member of allMembers) {
      const userId = member.details.id;
      const realName = `${member.details.first_name || ''} ${member.details.last_name || ''}`.trim();

      // The user's actual name from their profile is always the highest priority.
      if (realName) {
        map.set(userId, realName);
      } else if (!map.has(userId)) {
        // If no real name is found, use the first `invited_name` we encounter as a consistent fallback.
        map.set(userId, member.invited_name || 'Team member');
      }
    }
    return map;
  }, [allMembers]);

  const home = useMemo(() => {
    const id = homePharmacyId && pharmacies.some(p => p.id === homePharmacyId) ? homePharmacyId : pharmacies[0]?.id ?? null;
    return pharmacies.find(p => p.id === id) ?? null;
  }, [homePharmacyId, pharmacies]);

  const sections = useMemo<Section[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = allMembers.filter(member => {
        const bestName = userBestNameMap.get(member.details.id) || '';
        // Name only: emails are never shown in the picker, so they are not searchable either.
        const nameMatch = !query || bestName.toLowerCase().includes(query);
        const roleMatch = selectedRole === 'All Positions' || formatRole(member.role) === selectedRole;
        return nameMatch && roleMatch;
    });

    const pharmacyById = new Map(pharmacies.map(p => [p.id, p]));
    const placeTeam = (pharmacyId: number): SectionKey => {
      if (!home || pharmacyId === home.id) return 'pharmacy';
      const pharmacy = pharmacyById.get(pharmacyId);
      if (home.ownerId != null && pharmacy?.ownerId === home.ownerId) return 'chain';
      if (home.organizationId != null && pharmacy?.organizationId === home.organizationId) return 'organisation';
      return 'other';
    };

    const buckets: Record<SectionKey, ExtendedMember[]> = { pharmacy: [], chain: [], favourites: [], organisation: [], other: [] };
    filtered.forEach(member => {
      if (TEAM_TYPES.includes(member.employment_type)) buckets[placeTeam(member.pharmacyId)].push(member);
      else if (FAVOURITE_TYPES.includes(member.employment_type)) buckets.favourites.push(member);
    });

    // Each person is listed once, in the first group that applies.
    const seen = new Set<number>();
    return SECTION_ORDER.map((key) => {
      const unique = buckets[key].filter(m => {
        if (seen.has(m.details.id)) return false;
        seen.add(m.details.id);
        return true;
      });
      const byName = (a: ExtendedMember, b: ExtendedMember) =>
        (userBestNameMap.get(a.details.id) || '').localeCompare(userBestNameMap.get(b.details.id) || '');
      let groups: Section['groups'];
      if (key === 'chain' || key === 'organisation' || key === 'other') {
        const map = new Map<number, ExtendedMember[]>();
        unique.forEach(m => map.set(m.pharmacyId, [...(map.get(m.pharmacyId) || []), m]));
        groups = Array.from(map.entries())
          .map(([pharmacyId, members]) => ({ pharmacyId, name: pharmacyById.get(pharmacyId)?.name ?? null, members: members.sort(byName) }))
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      } else {
        groups = [{ pharmacyId: key === 'pharmacy' ? home?.id ?? null : null, name: null, members: unique.sort(byName) }];
      }
      return { key, groups, count: unique.length };
    }).filter(section => section.count > 0);
  }, [allMembers, searchQuery, selectedRole, userBestNameMap, pharmacies, home]);


  const selectedUserDetails = useMemo(() => {
    return Array.from(selectedUsers.keys()).map(membershipId => {
        return allMembers.find(m => m.membershipId === membershipId);
    }).filter((m): m is ExtendedMember => !!m);
  }, [selectedUsers, allMembers]);

  useEffect(() => {
    if (mode !== 'group' || isEditMode || groupNameTouched) return;
    if (selectedUserDetails.length === 0) {
      setGroupName('');
      return;
    }
    const names = selectedUserDetails
      .slice(0, 3)
      .map(member => userBestNameMap.get(member.details.id) || 'Member');
    let suggestion = names.join(', ');
    if (selectedUserDetails.length > 3) {
      suggestion += ` +${selectedUserDetails.length - 3}`;
    }
    setGroupName(suggestion);
  }, [mode, selectedUserDetails, userBestNameMap, isEditMode, groupNameTouched]);


const handleUserSelect = (membershipId: number, pharmacyId: number) => {
    if (mode === 'dm') {
      onClose();
      onDmSelect(membershipId, pharmacyId);
    } else {
      setSelectedUsers(prev => {
        const newMap = new Map(prev);
        if (newMap.has(membershipId)) {
          newMap.delete(membershipId);
        } else {
          newMap.set(membershipId, pharmacyId);
        }
        return newMap;
      });
    }
  };

  const handleModeChange = (_event: MouseEvent<HTMLElement>, newMode: 'dm' | 'group' | null) => {
    if (!newMode) return;
    setMode(newMode);
    setSelectedUsers(new Map());
    setGroupName('');
    setGroupNameTouched(false);
  };

  const handleCreateOrUpdateChat = async () => {
      if (mode !== 'group') return;
      setIsSubmitting(true);
      try {
        const participants = Array.from(selectedUsers.keys());
        const room = await createOrUpdateGroupRoom({
          roomId: isEditMode && editingRoom ? editingRoom.id : undefined,
          title: groupName,
          participants,
        });
        onSave(room);
        onNotify('success', isEditMode ? "Group updated" : "Group chat created");
        onClose();
      } catch (error) {
        console.error("Failed to save group chat", error);
        const alertMessage =
          error instanceof Error
            ? `Failed to save group chat. ${error.message}`
            : "Failed to save group chat. Please check your selections.";
        onNotify('error', alertMessage);
      } finally {
        setIsSubmitting(false);
      }
  };
  
  const isGroupActionDisabled = mode === 'group' && (groupName.trim() === '' || selectedUsers.size === 0);

  const toggleMany = (members: ExtendedMember[]) => {
    setSelectedUsers(prev => {
      const next = new Map(prev);
      const allSelected = members.every(m => next.has(m.membershipId));
      members.forEach(m => (allSelected ? next.delete(m.membershipId) : next.set(m.membershipId, m.pharmacyId)));
      return next;
    });
  };

  const renderMemberList = (members: ExtendedMember[], showPharmacy = false) => (
    <List dense sx={{p: 0}}>
        {members.map(member => {
            // **FIX: Use the consistent name from our map for rendering**
            const fullName = userBestNameMap.get(member.details.id) || 'Unknown User';
            
            const picked = mode === 'group' && selectedUsers.has(member.membershipId);
            const subtle = picked ? 'var(--ct-tone-violet-fg)' : 'var(--ct-text-secondary)';
            const primaryText = (
                <Box component="span" sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, flexWrap: 'wrap' }}>
                    <Typography component="span" variant="body2" sx={{ fontWeight: 600, color: 'var(--ct-text-primary)' }}>{fullName}</Typography>
                    <Typography component="span" variant="body2" sx={{ color: subtle, fontSize: 13 }}>{formatRole(member.role)}</Typography>
                </Box>
            );
            const contract = EMPLOYMENT_LABELS[member.employment_type];
            const secondaryText = (
                <Typography variant="caption" sx={{ display: 'block', color: subtle }}>
                    {[contract, showPharmacy ? member.pharmacyName : null].filter(Boolean).join(' · ')}
                </Typography>
            );

            return (
                <ListItem
                    key={member.membershipId}
                    disablePadding
                    secondaryAction={mode === 'group' ?
                        <Checkbox
                            edge="end"
                            checked={selectedUsers.has(member.membershipId)}
                            onChange={() => handleUserSelect(member.membershipId, member.pharmacyId)}
                            onClick={(e) => e.stopPropagation()}
                            inputProps={{ 'aria-label': `Add ${fullName} to the group` }}
                        /> : <Box sx={{ color: 'var(--ct-text-muted)', display: 'flex', pr: 1 }} aria-hidden><ChevronRight size={18} /></Box>
                    }
                >
                    <ListItemButton
                      onClick={() => handleUserSelect(member.membershipId, member.pharmacyId)}
                      aria-label={mode === 'dm' ? `Message ${fullName}` : undefined}
                      selected={mode === 'group' && selectedUsers.has(member.membershipId)}
                      sx={{ py: 1, borderRadius: 0, '&.Mui-selected, &.Mui-selected:hover': { bgcolor: 'var(--ct-tone-violet-bg)', outline: 'none', border: 0, boxShadow: 'none' } }}
                    >
                        <ListItemAvatar sx={{ minWidth: 52 }}>
                            <Avatar src={member.details.profile_photo_url || undefined} sx={{ width: 38, height: 38, fontSize: 13, fontWeight: 600, bgcolor: 'var(--ct-tone-violet-bg)', color: 'var(--ct-tone-violet-fg)' }}>{initials(fullName)}</Avatar>
                        </ListItemAvatar>
                        <ListItemText
                            primary={primaryText}
                            secondary={secondaryText}
                        />
                    </ListItemButton>
                </ListItem>
            );
        })}
    </List>
  );

  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {isEditMode ? 'Edit group' : 'New conversation'}
        <IconButton onClick={onClose} aria-label="Close"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <ToggleButtonGroup
            value={mode} exclusive
            onChange={handleModeChange}
            fullWidth
            sx={{
              p: 0.5, gap: 0.5, borderRadius: '14px', border: '1px solid var(--ct-border-color)', bgcolor: 'var(--ct-subtle-bg)',
              '& .MuiToggleButton-root': { border: 0, borderRadius: '10px !important', textTransform: 'none', fontWeight: 600, minHeight: 40, whiteSpace: 'nowrap', fontSize: { xs: 14, sm: 15 }, color: 'var(--ct-text-secondary)', '& svg': { display: { xs: 'none', sm: 'block' } } },
              '& .Mui-selected': { bgcolor: 'var(--ct-surface-bg) !important', color: 'var(--ct-accent-strong) !important', boxShadow: '0 1px 3px rgba(6,18,58,0.10)' },
            }}
            disabled={isEditMode}
            aria-label="Conversation type"
          >
            <ToggleButton value="dm" sx={{ gap: 1 }}><User size={16} /> Direct message</ToggleButton>
            <ToggleButton value="group" sx={{ gap: 1 }}><Users size={16} /> Group chat</ToggleButton>
          </ToggleButtonGroup>

          {mode === 'group' && (
             <Box>
                <TextField
                    label="Group name"
                    helperText={groupNameTouched ? undefined : 'Suggested from the people you pick. You can change it.'}
                    value={groupName}
                    onChange={(e) => {
                        setGroupName(e.target.value);
                        setGroupNameTouched(true);
                    }}
                    fullWidth
                />
                {selectedUserDetails.length > 0 && (
                    <Box aria-label={`${selectedUserDetails.length} selected`} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1.25, p: 1, border: '1px solid var(--ct-border-color)', borderRadius: '12px', bgcolor: 'var(--ct-subtle-bg)' }}>
                        {selectedUserDetails.map(member => {
                            // **FIX: Use the consistent name from our map for chips**
                            const chipLabel = userBestNameMap.get(member.details.id) || 'Unknown User';
                            return member && (
                                <Chip
                                    key={member.membershipId}
                                    label={chipLabel}
                                    onDelete={() => handleUserSelect(member.membershipId, member.pharmacyId)}
                                    size="small"
                                />
                            )
                        })}
                    </Box>
                )}
             </Box>
          )}

          <Box sx={{ display: 'flex', gap: 1.5, flexDirection: { xs: 'column', sm: 'row' } }}>
            <TextField
              placeholder="Search by name"
              inputProps={{ 'aria-label': 'Search people' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              fullWidth
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
              }}
            />
            <TextField
              select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              SelectProps={{ native: true }}
              inputProps={{ 'aria-label': 'Filter by position' }}
              sx={{ minWidth: { sm: 180 } }}
            >
              {allRoles.map(role => <option key={role} value={role}>{role}</option>)}
            </TextField>
          </Box>

          <Box sx={{ maxHeight: { xs: '48vh', sm: 360 }, overflowY: 'auto', border: '1px solid var(--ct-border-color)', borderRadius: '14px' }}>
            {sections.length === 0 && (
              <Box sx={{ px: 2.5, py: 4, textAlign: 'center' }}>
                <Typography sx={{ fontWeight: 600, color: 'var(--ct-text-primary)' }}>
                  {allMembers.length === 0 ? 'No team members to message yet' : 'No one matches'}
                </Typography>
                <Typography variant="body2" sx={{ color: 'var(--ct-text-secondary)', mt: 0.5 }}>
                  {allMembers.length === 0
                    ? 'Staff you invite to your pharmacies appear here.'
                    : 'Try another name, or choose All Positions.'}
                </Typography>
              </Box>
            )}
            {sections.map((section, index) => {
              const everyone = section.groups.flatMap(g => g.members);
              const allPicked = everyone.every(m => selectedUsers.has(m.membershipId));
              return (
                <Box key={section.key} component="section" aria-label={SECTION_META[section.key].title} sx={{ borderTop: index ? '1px solid var(--ct-border-color)' : 'none' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 1.5, pb: 0.75, position: 'sticky', top: 0, zIndex: 1, bgcolor: 'var(--ct-surface-bg)' }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography component="h3" sx={{ fontSize: 14, fontWeight: 600, color: 'var(--ct-text-primary)' }}>
                        {SECTION_META[section.key].title}
                        {section.key === 'pharmacy' && home ? ` · ${home.name}` : ''}
                        <Box component="span" sx={{ ml: 0.75, fontWeight: 500, color: 'var(--ct-text-secondary)' }}>{section.count}</Box>
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'var(--ct-text-secondary)' }}>{SECTION_META[section.key].hint}</Typography>
                    </Box>
                    {mode === 'group' && (
                      <Button size="small" onClick={() => toggleMany(everyone)} sx={{ minHeight: 32, flexShrink: 0 }}>
                        {allPicked ? 'Clear' : 'Select all'}
                      </Button>
                    )}
                  </Box>
                  {section.groups.map(group => (
                    <Box key={`${section.key}-${group.pharmacyId ?? 'all'}`}>
                      {group.name && (
                        <Typography variant="caption" sx={{ display: 'block', px: 2, pt: 0.75, fontWeight: 600, color: 'var(--ct-accent-strong)' }}>
                          {group.name}
                        </Typography>
                      )}
                      {renderMemberList(group.members, section.key === 'favourites')}
                    </Box>
                  ))}
                </Box>
              );
            })}
          </Box>
        </Box>
      </DialogContent>
      {mode === 'group' && (
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button
            onClick={handleCreateOrUpdateChat}
            variant="contained"
            disabled={isGroupActionDisabled || isSubmitting}
            startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {isEditMode ? 'Save changes' : selectedUsers.size ? `Start group chat (${selectedUsers.size})` : 'Start group chat'}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
};
