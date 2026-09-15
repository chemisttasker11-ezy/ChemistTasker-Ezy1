import { FC, useState, useMemo, useEffect, MouseEvent } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, TextField, Button,
  Box, ToggleButtonGroup, ToggleButton, Checkbox,
  InputAdornment, List, ListItem, ListItemAvatar, Avatar, ListItemText, CircularProgress,
  ListItemButton, Typography, Accordion, AccordionSummary, AccordionDetails, Chip
} from '@mui/material';
import { AlertColor } from '@mui/material/Alert';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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
  onNotify: (severity: AlertColor, message: string) => void;
}

const formatRole = (role: string) => {
    if (!role) return '';
    return role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const FAVOURITE_STAFF_TYPES = ['CASUAL', 'SHIFT_HERO'];
const MY_STAFF_TYPES = ['FULL_TIME', 'PART_TIME', 'LOCUM'];


type ExtendedMember = CachedMember & {
    membershipId: number;
    pharmacyId: number;
    pharmacyName: string;
};

type PharmacyStaffGroup = {
    [pharmacyId: string]: {
        name: string;
        members: ExtendedMember[];
    };
};

type FilteredMembers = {
    favouriteStaff: ExtendedMember[];
    myStaffByPharmacy: PharmacyStaffGroup;
};

export const NewChatModal: FC<NewChatModalProps> = ({ open, onClose, onSave, pharmacies, memberCache, currentUserId, editingRoom, onDmSelect, onNotify }) => {
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
        map.set(userId, member.invited_name || member.details.email || 'Unknown User');
      }
    }
    return map;
  }, [allMembers]);

  const { favouriteStaff, myStaffByPharmacy } = useMemo<FilteredMembers>(() => {
    const filtered = allMembers.filter(member => {
        // **FIX: Use the consistent name from our map for searching**
        const bestName = userBestNameMap.get(member.details.id) || '';
        const nameMatch = `${bestName} ${member.details.email || ''}`.toLowerCase().includes(searchQuery.toLowerCase());
        const roleMatch = selectedRole === 'All Positions' || formatRole(member.role) === selectedRole;
        return nameMatch && roleMatch;
    });

    const favourites = filtered.filter(m => FAVOURITE_STAFF_TYPES.includes(m.employment_type));
    
    const staffByPharmacy = filtered
      .filter(m => MY_STAFF_TYPES.includes(m.employment_type))
      .reduce((acc, member) => {
          if (!acc[member.pharmacyId]) {
              acc[member.pharmacyId] = { name: member.pharmacyName, members: [] };
          }
          acc[member.pharmacyId].members.push(member);
          return acc;
      }, {} as PharmacyStaffGroup);

    return { favouriteStaff: favourites, myStaffByPharmacy: staffByPharmacy };
  }, [allMembers, searchQuery, selectedRole, userBestNameMap]); // <-- Add userBestNameMap dependency


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
      .map(member => userBestNameMap.get(member.details.id) || member.details.email || 'Member');
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
        onNotify('success', isEditMode ? "Group updated successfully" : "Group chat created");
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

  const renderMemberList = (members: ExtendedMember[]) => (
    <List dense sx={{p: 0}}>
        {members.map(member => {
            // **FIX: Use the consistent name from our map for rendering**
            const fullName = userBestNameMap.get(member.details.id) || 'Unknown User';
            
            const primaryText = (
                <Box component="span" sx={{ display: 'flex', alignItems: 'center' }}>
                    <Typography component="span" variant="body2" sx={{ fontWeight: 500 }}>{fullName}</Typography>
                    <Typography component="span" variant="body2" color="text.secondary" sx={{ mx: 0.5 }}>|</Typography>
                    <Typography component="span" variant="body2" color="text.secondary">{formatRole(member.role)}</Typography>
                </Box>
            );
            const secondaryText = (
                <Typography variant="caption" color="text.secondary">
                    {member.details.email}
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
                        /> : null
                    }
                >
                    <ListItemButton onClick={() => handleUserSelect(member.membershipId, member.pharmacyId)}>
                        <ListItemAvatar>
                            <Avatar>{initials(fullName)}</Avatar>
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
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {isEditMode ? 'Edit Group' : 'New Conversation'}
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <ToggleButtonGroup
            value={mode} exclusive
            onChange={handleModeChange}
            fullWidth
            disabled={isEditMode}
            aria-label="Conversation type"
          >
            <ToggleButton value="dm">Direct Message</ToggleButton>
            <ToggleButton value="group">Group Chat</ToggleButton>
          </ToggleButtonGroup>

          {mode === 'group' && (
             <Box>
                <TextField
                    label="Group Name"
                    value={groupName}
                    onChange={(e) => {
                        setGroupName(e.target.value);
                        setGroupNameTouched(true);
                    }}
                    fullWidth
                />
                {selectedUserDetails.length > 0 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1, p: 1, border: '1px solid #ddd', borderRadius: 1 }}>
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

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              placeholder="Search by name or email..."
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
              sx={{ minWidth: 180 }}
            >
              {allRoles.map(role => <option key={role} value={role}>{role}</option>)}
            </TextField>
          </Box>

          <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
            {favouriteStaff.length > 0 && (
                <Box>
                    <Typography variant="caption" sx={{ pl: 2, fontWeight: 'bold', color: 'text.secondary' }}>FAVOURITE STAFF</Typography>
                    {renderMemberList(favouriteStaff)}
                </Box>
            )}
             {Object.keys(myStaffByPharmacy).length > 0 && (
                <Box sx={{mt: favouriteStaff.length > 0 ? 2 : 0}}>
                    <Typography variant="caption" sx={{ pl: 2, fontWeight: 'bold', color: 'text.secondary' }}>MY STAFF</Typography>
                    {Object.entries(myStaffByPharmacy).map(([pharmacyId, data]) => (
                        <Accordion key={pharmacyId} defaultExpanded elevation={0} disableGutters>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                <Typography variant="subtitle2">{data.name}</Typography>
                            </AccordionSummary>
                            <AccordionDetails sx={{p: 0}}>
                                {renderMemberList(data.members)}
                            </AccordionDetails>
                        </Accordion>
                    ))}
                </Box>
             )}
          </Box>
        </Box>
      </DialogContent>
      {mode === 'group' && (
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleCreateOrUpdateChat}
            variant="contained"
            disabled={isGroupActionDisabled || isSubmitting}
          >
            {isSubmitting ? <CircularProgress size={24} /> : (isEditMode ? 'Save Changes' : 'Start Chat')}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
};
