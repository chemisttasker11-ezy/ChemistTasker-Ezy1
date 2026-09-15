import { FC, useState, useMemo } from 'react';
import { Avatar, Box, Typography, Link, Chip, IconButton, Tooltip, Dialog, DialogTitle, DialogContent, TextField, DialogActions, Button, Paper } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import AddReactionOutlinedIcon from '@mui/icons-material/AddReactionOutlined';
import { ChatMessage, UserLite } from './types';
import PushPinIcon from '@mui/icons-material/PushPin';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

const initialsOf = (first?: string, last?: string, fallback?: string) => {
  const f = (first || '').trim();
  const l = (last || '').trim();
  if (f || l) {
    return `${f.charAt(0)}${l.charAt(0) || f.charAt(1) || ''}`.toUpperCase();
  }
  const alt = (fallback || '').trim();
  if (!alt) return '?';
  const parts = alt.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase() || '?';
  }
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
};

const isImage = (url: string) => {
  const extension = url.split('.').pop()?.toLowerCase() || '';
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension);
};

type Props = {
  msg: ChatMessage;
  isMe: boolean;
  onStartDm: (partnerMembershipId: number) => void;
  onEdit: (messageId: number, newBody: string) => void;
  onDelete: (messageId: number) => void;
  onReact: (messageId: number, reaction: string) => void;
  onTogglePin: (target: 'conversation' | 'message', messageId?: number) => void;
  innerRef?: (node: HTMLDivElement | null) => void;
  resolveMemberDetails?: (membershipId: number | null) => UserLite | null;
};

export const MessageBubble: FC<Props> = ({
  msg,
  isMe,
  onStartDm,
  onEdit,
  onDelete,
  onReact,
  onTogglePin,
  innerRef,
  resolveMemberDetails,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(msg.body);
  const [pickerOpen, setPickerOpen] = useState(false);
  const reactions = ['👍', '❤️', '🔥', '💩'];

  const user = msg.sender?.user_details;
  if (!user) {
    return null; 
  }
  const fallbackDetails = resolveMemberDetails
    ? resolveMemberDetails(msg.sender?.id ?? null)
    : null;

  const effectiveProfilePhoto =
    user.profile_photo_url || fallbackDetails?.profile_photo_url || null;
  const effectiveFirstName = user.first_name || fallbackDetails?.first_name;
  const effectiveLastName = user.last_name || fallbackDetails?.last_name;
  const effectiveFullName = ((effectiveFirstName || '') + (effectiveLastName ? ` ${effectiveLastName}` : '')).trim();
  
  const fullName = effectiveFullName || `Member ${msg.sender.id}`;
  const attachmentFilename = msg.attachment_filename || (msg.attachment_url ? msg.attachment_url.split('/').pop() : 'Download');

  const handleStartDmClick = () => {
    onStartDm(msg.sender.id);
  };

  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleDeleteClick = () => {
    onDelete(msg.id);
  };
  
  const handleSaveEdit = () => {
    onEdit(msg.id, editText);
    setIsEditing(false);
  };

  const aggregatedReactions = useMemo(() => {
    if (!msg.reactions) return [];
    const counts = msg.reactions.reduce((acc, r) => {
      acc[r.reaction] = (acc[r.reaction] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(counts);
  }, [msg.reactions]);

  return (
    <Box 
      ref={innerRef}
      className={`msg-row ${isMe ? 'me' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setPickerOpen(false); }}
      sx={{ mt: 2 }}
    >
      <Box sx={{ width: 36, flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
        <Avatar
          src={effectiveProfilePhoto || undefined}
          alt={fullName}
          sx={{
            width: 36,
            height: 36,
            fontSize: '0.85rem',
            fontWeight: 700,
            bgcolor: effectiveProfilePhoto ? 'transparent' : '#dfe3ec',
            color: effectiveProfilePhoto ? 'inherit' : '#4c5a78',
            border: effectiveProfilePhoto ? '1px solid rgba(15,23,42,0.08)' : 'none',
          }}
        >
          {!effectiveProfilePhoto
            ? initialsOf(effectiveFirstName, effectiveLastName, fullName)
            : null}
        </Avatar>
      </Box>

      <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
        <Box sx={{ position: 'relative', display: 'inline-block' }}>
          {msg.is_deleted ? (
            <Box className={`bubble ${isMe ? 'me' : ''}`}>
              <Typography variant="body2" sx={{ fontStyle: 'italic', color: isMe ? '#fff' : '#7a859e', opacity: 0.7 }}>
                This message was deleted
              </Typography>
            </Box>
          ) : (
            <Box className={`bubble ${isMe ? 'me' : ''}`}>
              <Typography
                variant="caption"
                sx={{ display: 'block', fontWeight: 700, mb: 0.5, color: isMe ? 'rgba(255,255,255,0.82)' : 'text.secondary' }}
              >
                {fullName}
              </Typography>
              {msg.attachment_url && (
                <Box sx={{ mb: msg.body ? 1 : 0, maxWidth: 320 }}>
                  {isImage(msg.attachment_url) ? (
                    <Link href={msg.attachment_url} target="_blank" rel="noopener noreferrer">
                      <img src={msg.attachment_url} alt="attachment" loading="lazy" style={{ maxWidth: '100%', borderRadius: '8px', display: 'block' }} />
                    </Link>
                  ) : (
                    <Link href={msg.attachment_url} target="_blank" rel="noopener noreferrer" underline="none">
                      <Chip
                        icon={<InsertDriveFileOutlinedIcon />} label={attachmentFilename} clickable
                        sx={{ bgcolor: isMe ? 'primary.dark' : 'action.hover', color: isMe ? 'white' : 'text.primary', '&:hover': { bgcolor: isMe ? '#004c8c' : 'action.disabledBackground' } }}
                      />
                    </Link>
                  )}
                </Box>
              )}
              {msg.body && (
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {msg.body}
                </Typography>
              )}
            </Box>
          )}

          {!msg.is_deleted && (
            <Box
              sx={{
                position: 'absolute',
                top: -16,
                right: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                opacity: isHovered ? 1 : 0,
                transition: 'opacity 0.2s',
              }}
            >
              <Tooltip title="Add reaction">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPickerOpen((open) => !open);
                  }}
                  sx={{ bgcolor: 'background.paper', boxShadow: 1, '&:hover': { bgcolor: 'background.default' } }}
                >
                  <AddReactionOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={msg.is_pinned ? 'Unpin message' : 'Pin message'}>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePin('message', msg.id);
                    setPickerOpen(false);
                  }}
                  sx={{ bgcolor: 'background.paper', boxShadow: 1, '&:hover': { bgcolor: 'background.default' } }}
                >
                  <PushPinIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {isMe && (
                <>
                  <Tooltip title="Edit message">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditClick();
                      }}
                      sx={{ bgcolor: 'background.paper', boxShadow: 1, '&:hover': { bgcolor: 'background.default' } }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete message">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick();
                      }}
                      sx={{ bgcolor: 'background.paper', boxShadow: 1, '&:hover': { bgcolor: 'background.default' } }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
              {!isMe && (
                <Tooltip title="Send a direct message">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartDmClick();
                      setPickerOpen(false);
                    }}
                    sx={{ bgcolor: 'background.paper', boxShadow: 1, '&:hover': { bgcolor: 'background.default' } }}
                  >
                    <ChatBubbleOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {pickerOpen && (
                <Paper sx={{ ml: 1, boxShadow: 3, zIndex: 10 }}>
                  <Box sx={{ p: 0.5, display: 'flex' }}>
                    {reactions.map(r => (
                      <IconButton key={r} size="small" onClick={() => { onReact(msg.id, r); setPickerOpen(false); }}>
                        <span style={{ fontSize: '20px' }}>{r}</span>
                      </IconButton>
                    ))}
                  </Box>
                </Paper>
              )}
            </Box>
          )}
        </Box>

        {aggregatedReactions.length > 0 && (
          <Paper sx={{ display: 'inline-flex', gap: 0.5, p: '2px 6px', mt: '4px', borderRadius: '12px' }}>
            {aggregatedReactions.map(([emoji, count]: [string, number]) => (
              <Box key={emoji} sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <span style={{ fontSize: '14px' }}>{emoji}</span>
                {count > 1 && <Typography variant="caption" sx={{ ml: 0.5, fontWeight: 'bold' }}>{count}</Typography>}
              </Box>
            ))}
          </Paper>
        )}

        <Box className="msg-meta">
          {dayjs.utc(msg.created_at).local().format('DD/MM/YYYY HH:mm')} {/* Australian format */}
          {msg.is_edited && (
            <Tooltip title={`Original: ${msg.original_body}`}>
              <Typography variant="caption" sx={{ fontStyle: 'italic', ml: 0.5 }}> · edited</Typography>
            </Tooltip>
          )}
        </Box>
      </Box>

      <Dialog open={isEditing} onClose={() => setIsEditing(false)} fullWidth maxWidth="sm">
        <DialogTitle>Edit Message</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            fullWidth
            multiline
            rows={4}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsEditing(false)}>Cancel</Button>
          <Button onClick={handleSaveEdit} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
