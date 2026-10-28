import { FC, useState } from 'react';
import { Avatar, Box, Typography, Tooltip, Menu, MenuItem, IconButton, ListItemIcon, ListItemText } from '@mui/material';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PushPinIcon from '@mui/icons-material/PushPin';
import { ChatRoom } from './types';
import { listTimeLabel } from './chatFormat';

interface ChatListItemProps {
  room: ChatRoom;
  isActive: boolean;
  onSelect: (roomId: number) => void;
  previewOverride?: string;
  displayName: string;
  avatarUrl?: string | null;
  avatarLabel: string;
  isCollapsed: boolean;
  currentUserId?: number | null;
  onEdit: (room: ChatRoom) => void;
  onDelete: (roomId: number, roomName: string) => void;
  canEditDelete?: boolean;
  onTogglePin: (roomId: number) => void;
}



export const ChatListItem: FC<ChatListItemProps> = ({
  room,
  isActive,
  onSelect,
  previewOverride,
  displayName,
  avatarUrl,
  avatarLabel,
  isCollapsed,
  currentUserId,
  onEdit,
  onDelete,
  canEditDelete,
  onTogglePin,

}) => {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
  };

  const handleCloseMenu = () => {
    setMenuAnchor(null);
  };

  const isGroup = room.type === 'GROUP';
  const resolveCreatorId = (r: any): number | undefined => {
    const candidates = [
      r?.created_by_user_id,
      r?.createdByUserId,
      r?.created_by,
      r?.createdBy,
      r?.created_by_user,
      r?.createdByUser,
      r?.created_by_membership_id,
      r?.createdByMembershipId,
      r?.created_by_membership,
      r?.createdByMembership,
      r?.creator,
      r?.creator_id,
      r?.creatorId,
      r?.owner,
      r?.owner_id,
      r?.ownerId,
    ];
    const dynamicMatches =
      r && typeof r === 'object'
        ? Object.entries(r)
            .filter(([k]) => {
              const key = k.toLowerCase();
              return key.includes('creator') || key.includes('owner') || key.includes('created_by');
            })
            .map(([, v]) => v)
        : [];

    for (const c of [...candidates, ...dynamicMatches]) {
      if (typeof c === 'number') return c;
      if (typeof c === 'string' && c.trim() && !Number.isNaN(Number(c))) {
        return Number(c);
      }
      if (c && typeof c === 'object' && 'id' in c && typeof (c as any).id === 'number') {
        return (c as any).id;
      }
      if (c && typeof c === 'object' && 'id' in c && typeof (c as any).id === 'string') {
        const parsed = Number((c as any).id);
        if (!Number.isNaN(parsed)) return parsed;
      }
    }
    return undefined;
  };
  const creatorUserId = resolveCreatorId(room as any);
  const isCreator =
    currentUserId !== null &&
    currentUserId !== undefined &&
    creatorUserId !== undefined &&
    Number(creatorUserId) === Number(currentUserId);
  const effectiveCanEditDelete = !!(canEditDelete || isCreator);


  // Show Edit for any GROUP when I'm allowed (admin/creator).
  const canShowEdit = isGroup && effectiveCanEditDelete;

  // Show Delete for:
  //   - DMs (always),
  //   - any GROUP when I'm allowed (admin/creator).
  const canShowDelete = isGroup ? effectiveCanEditDelete : room.type === 'DM';




  const isPinnable = true;
  const lastMessage = room.last_message;
  const preview =
    lastMessage?.is_deleted ? 'This message was deleted' :
    (previewOverride && previewOverride.trim()) ||
    (lastMessage?.body?.trim()) ||
    (lastMessage ? '📎 Attachment' : 'No messages yet');

  const unread = room.unread_count || 0;
  const fromMe = Boolean(lastMessage && room.my_membership_id && lastMessage.sender === room.my_membership_id);
  const stamp = listTimeLabel(lastMessage?.created_at || room.updated_at);
  const label = `${displayName}${unread ? `, ${unread} unread` : ''}${room.is_pinned ? ', pinned' : ''}`;

  const listItemContent = (
    <Box
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-current={isActive ? 'true' : undefined}
      onClick={() => onSelect(room.id)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(room.id); }
      }}
      sx={{
        display: 'flex',
        gap: 1.5,
        alignItems: 'center',
        px: 1.25,
        py: 1.1,
        borderRadius: '14px',
        cursor: 'pointer',
        bgcolor: isActive ? 'var(--chat-selected)' : 'transparent',
        '&:hover': { bgcolor: isActive ? 'var(--chat-selected)' : 'var(--chat-hover)' },
        '&:focus-visible': { outline: '2px solid var(--ct-accent-strong)', outlineOffset: -2 },
        width: isCollapsed ? 'fit-content' : '100%',
        margin: isCollapsed ? '0 auto' : '0',
        '&:hover .options-button, &:focus-within .options-button': { opacity: 1 },
      }}
      className="sidebar-item"
    >
      <Box sx={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
        <Avatar
          src={avatarUrl || undefined}
          alt={displayName}
          sx={{
            width: 44,
            height: 44,
            fontSize: 15,
            fontWeight: 600,
            bgcolor: avatarUrl ? 'transparent' : 'var(--ct-tone-violet-bg)',
            color: avatarUrl ? 'inherit' : 'var(--ct-tone-violet-fg)',
          }}
        >
          {!avatarUrl ? avatarLabel : null}
        </Avatar>
        {isCollapsed && unread > 0 && (
          <Box
            aria-hidden
            sx={{
              position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, px: 0.5, borderRadius: '999px',
              bgcolor: '#C000B4', color: '#fff', fontSize: 10.5, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--chat-surface)',
            }}
          >
            {unread > 99 ? '99+' : unread}
          </Box>
        )}
      </Box>

      {!isCollapsed && (
        <Box sx={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 0.5 }} className="meta">
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography noWrap className="name" sx={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: unread ? 600 : 500, color: 'var(--chat-text)' }}>
                {displayName}
              </Typography>
              {stamp && (
                <Typography component="span" sx={{ flexShrink: 0, fontSize: 12, color: unread ? 'var(--ct-accent-strong)' : 'var(--chat-muted)', fontWeight: unread ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>
                  {stamp}
                </Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
              <Typography
                noWrap
                className="preview"
                sx={{ flex: 1, minWidth: 0, fontSize: 13, color: unread ? 'var(--chat-text)' : 'var(--chat-muted)', fontWeight: unread ? 600 : 400 }}
              >
                {room.is_pinned && <PushPinIcon sx={{ fontSize: 13, mr: 0.5, verticalAlign: '-2px', color: 'var(--chat-muted)' }} aria-hidden />}
                {fromMe && preview === lastMessage?.body?.trim() ? `You: ${preview}` : preview}
              </Typography>
              {unread > 0 && (
                <Box
                  aria-hidden
                  sx={{
                    minWidth: 20, height: 20, px: 0.75, borderRadius: '999px', bgcolor: '#C000B4', color: '#fff',
                    fontSize: 11.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  {unread > 99 ? '99+' : unread}
                </Box>
              )}
            </Box>
          </Box>

          <IconButton
            className="options-button"
            onClick={handleOpenMenu}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label={`Options for ${displayName}`}
            aria-haspopup="menu"
            sx={{ opacity: isActive ? 1 : 0, transition: 'opacity 0.15s', width: 32, height: 32, color: 'var(--chat-muted)' }}
          >
            <MoreHorizIcon fontSize="small" />
          </IconButton>
        </Box>
      )}
    </Box>
  );

  return (
    <>
      {isCollapsed ? (
        <Tooltip title={displayName} placement="right" arrow>
          {listItemContent}
        </Tooltip>
      ) : (
        listItemContent
      )}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleCloseMenu}>
        {isPinnable && (
            <MenuItem onClick={(e) => {
                e.stopPropagation();
                onTogglePin(room.id);
                handleCloseMenu();
            }}>
                <ListItemIcon><PushPinIcon fontSize="small" /></ListItemIcon>
                <ListItemText>{room.is_pinned ? 'Unpin conversation' : 'Pin conversation'}</ListItemText>
            </MenuItem>
        )}
        {canShowEdit && (
          <MenuItem onClick={() => { onEdit(room); handleCloseMenu(); }}>
            <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Edit group</ListItemText>
          </MenuItem>
        )}
        {canShowDelete && (
          <MenuItem onClick={() => { onDelete(room.id, displayName); handleCloseMenu(); }} sx={{ color: 'error.main' }}>
            <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Delete conversation</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </>
  );
};
