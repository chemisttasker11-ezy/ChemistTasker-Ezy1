import { forwardRef, useCallback, useEffect, useImperativeHandle, useReducer, useRef, useState, type ClipboardEvent } from 'react';
import { Avatar, Box, Button, CircularProgress, IconButton, InputBase, List, ListItemButton, ListItemText, Paper, Popover, Tooltip, Typography } from '@mui/material';
import type { AlertColor } from '@mui/material/Alert';
import { AlertCircle, FileText, Paperclip, Pencil, SendHorizontal, Smile, X } from 'lucide-react';
import type { ChatMessage } from './types';
import { COMPOSER_EMOJI, EMOJI_FONT, initialsOf } from './chatFormat';

export type MentionOption = { label: string; membershipId: number };
export const ALL_MENTION_ID = -1;
type MentionState = { options: MentionOption[]; triggerIndex: number; caretIndex: number; activeIndex: number };

/** What the conversation can ask of the composer: attach dropped files, or start editing a message. */
export type MessageComposerHandle = {
  dropFiles: (files: File[]) => void;
  startEdit: (message: ChatMessage) => void;
};

// The draft and an edit in progress change together: starting an edit parks the draft, cancelling or saving brings it back.
type Draft = { text: string; editing: ChatMessage | null; parked: string };
type DraftAction =
  | { type: 'type'; text: string }
  | { type: 'startEdit'; message: ChatMessage }
  | { type: 'endEdit' }
  | { type: 'sent' };
function draftReducer(state: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case 'type': return { ...state, text: action.text };
    case 'startEdit': return { text: action.message.body || '', editing: action.message, parked: state.editing ? state.parked : state.text };
    case 'endEdit': return { text: state.parked, editing: null, parked: '' };
    case 'sent': return { ...state, text: '' };
  }
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Message box with mentions, emoji, attachments, typing signals, edit mode and a retry for failed sends. */
export const MessageComposer = forwardRef<MessageComposerHandle, {
  roomId: number;
  title: string;
  isGroupRoom: boolean;
  memberCount: number;
  isMobile: boolean;
  mentionOptions: MentionOption[];
  onSendText: (body: string) => void | Promise<void>;
  onSendAttachment: (files: File[], body?: string) => void | Promise<void>;
  onEditMessage: (messageId: number, newBody: string) => void | Promise<void>;
  onTyping: (isTyping: boolean) => void;
  onNotify: (severity: AlertColor, message: string) => void;
}>(function MessageComposer({ roomId, title, isGroupRoom, memberCount, isMobile, mentionOptions, onSendText, onSendAttachment, onEditMessage, onTyping, onNotify }, ref) {
  const [{ text, editing }, dispatch] = useReducer(draftReducer, { text: '', editing: null, parked: '' });
  const setText = (value: string) => dispatch({ type: 'type', text: value });
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [mentionState, setMentionState] = useState<MentionState | null>(null);
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const typingActiveRef = useRef(false);
  const typingTimerRef = useRef<number | null>(null);

  const focusAt = (caret?: number) => window.setTimeout(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    if (caret !== undefined) input.setSelectionRange(caret, caret);
  }, 0);

  const stopTyping = useCallback(() => {
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (typingActiveRef.current) {
      onTyping(false);
      typingActiveRef.current = false;
    }
  }, [onTyping]);

  const scheduleTypingStop = useCallback(() => {
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      if (typingActiveRef.current) {
        onTyping(false);
        typingActiveRef.current = false;
      }
      typingTimerRef.current = null;
    }, 2000);
  }, [onTyping]);

  const startTyping = useCallback(() => {
    if (!typingActiveRef.current) {
      onTyping(true);
      typingActiveRef.current = true;
    }
    scheduleTypingStop();
  }, [onTyping, scheduleTypingStop]);

  useEffect(() => stopTyping, [stopTyping]);

  // New room: leave any edit and its error behind (the draft text stays, as before).
  useEffect(() => {
    if (editing) dispatch({ type: 'endEdit' });
    setSendError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const addFiles = (files: File[]) => {
    const accepted: File[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        onNotify('warning', `"${file.name}" is over the 10 MB limit.`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length) {
      setAttachments((prev) => [...prev, ...accepted.filter((f) => !prev.some((p) => p.name === f.name))]);
      setSendError(null);
      focusAt();
    }
  };

  useImperativeHandle(ref, () => ({
    dropFiles: (files) => { if (!editing) addFiles(files); },
    startEdit: (message) => {
      dispatch({ type: 'startEdit', message });
      setAttachments([]);
      setSendError(null);
      focusAt((message.body || '').length);
    },
  }));

  const updateMentionState = useCallback((value: string, caretIndex: number) => {
    const match = value.slice(0, caretIndex).match(/@([\p{L}\p{N}._-]*)$/u);
    if (!match) { setMentionState(null); return; }
    const triggerIndex = match.index ?? Math.max(0, caretIndex - match[0].length);
    const query = match[1].toLowerCase();
    const options = mentionOptions.filter((option) => option.label.toLowerCase().includes(query)).slice(0, 8);
    setMentionState(options.length ? { options, triggerIndex, caretIndex, activeIndex: 0 } : null);
  }, [mentionOptions]);

  const syncMentionState = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const value = input.value ?? '';
    updateMentionState(value, input.selectionStart ?? value.length);
  }, [updateMentionState]);

  const cancelEdit = () => { dispatch({ type: 'endEdit' }); setSendError(null); };

  const handleSend = useCallback(async () => {
    const body = text.trim();
    if (editing) {
      if (!body || sending) return;
      setSending(true);
      setSendError(null);
      try {
        if (body !== editing.body) await onEditMessage(editing.id, body);
        dispatch({ type: 'endEdit' });
      } catch {
        setSendError("Your edit wasn't saved. Check your connection and try again.");
      } finally {
        setSending(false);
      }
      return;
    }
    if ((!body && attachments.length === 0) || sending) return;
    setSending(true);
    setSendError(null);
    try {
      if (attachments.length > 0) await onSendAttachment(attachments, body || undefined);
      else await onSendText(body);
      dispatch({ type: 'sent' });
      setAttachments([]);
      setMentionState(null);
      stopTyping();
      focusAt();
    } catch (error) {
      // Text and attachments stay in place so the person can try again.
      console.error('Failed to send message', error);
      setSendError("Message not sent. It's still in the box below, so you can try again.");
    } finally {
      setSending(false);
    }
  }, [text, attachments, sending, editing, onEditMessage, onSendAttachment, onSendText, stopTyping]);

  const handleMentionPick = useCallback((option: MentionOption) => {
    if (!mentionState) return;
    const before = text.slice(0, mentionState.triggerIndex);
    const insertion = `@${option.label} `;
    setText(`${before}${insertion}${text.slice(mentionState.caretIndex)}`);
    setMentionState(null);
    startTyping();
    focusAt(before.length + insertion.length);
  }, [mentionState, text, startTyping]);

  const handleChange: React.ChangeEventHandler<HTMLTextAreaElement | HTMLInputElement> = (event) => {
    const { value } = event.target;
    setText(value);
    updateMentionState(value, event.target.selectionStart ?? value.length);
    if (value.trim().length > 0) startTyping();
    else stopTyping();
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement | HTMLInputElement> = (event) => {
    if (mentionState && mentionState.options.length > 0) {
      const count = mentionState.options.length;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setMentionState((state) => (state ? { ...state, activeIndex: (state.activeIndex + step + count) % count } : state));
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const option = mentionState.options[mentionState.activeIndex] || mentionState.options[0];
        if (option) handleMentionPick(option);
        return;
      }
    }
    if (mentionState && event.key === 'Escape') { event.preventDefault(); setMentionState(null); return; }
    if (editing && event.key === 'Escape') { event.preventDefault(); dispatch({ type: 'endEdit' }); return; }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      stopTyping();
      void handleSend();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData?.files || []);
    if (files.length) {
      event.preventDefault();
      addFiles(files);
    }
  };

  const insertEmoji = (emoji: string) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? text.length;
    const end = input?.selectionEnd ?? text.length;
    setText(`${text.slice(0, start)}${emoji}${text.slice(end)}`);
    setEmojiAnchor(null);
    focusAt(start + emoji.length);
  };

  const [previews, setPreviews] = useState<{ file: File; url: string | null }[]>([]);
  useEffect(() => {
    const next = attachments.map(file => ({ file, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null }));
    setPreviews(next);
    return () => next.forEach(preview => { if (preview.url) URL.revokeObjectURL(preview.url); });
  }, [attachments]);

  const canSend = !sending && (editing ? Boolean(text.trim()) : Boolean(text.trim() || attachments.length));
  const placeholder = editing ? 'Edit your message' : isMobile ? 'Message' : `Message ${isGroupRoom ? title : title.split(' ')[0]}`;

  return (
    <>
      {(editing || sendError) && (
        <Box sx={{ px: 1.5, pt: 1, bgcolor: 'var(--chat-surface)', borderTop: '1px solid var(--chat-border)' }}>
          {editing && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.75, borderRadius: '10px', bgcolor: 'var(--chat-canvas)', borderLeft: '3px solid var(--ct-accent-strong)' }}>
              <Pencil size={15} color="var(--ct-accent-strong)" aria-hidden />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--chat-text)', fontSize: 13 }}>Editing message</Typography>
                <Typography variant="body2" noWrap sx={{ color: 'var(--chat-muted)', fontSize: 12.5 }}>{editing.body}</Typography>
              </Box>
              <Typography variant="caption" sx={{ color: 'var(--chat-muted)', display: { xs: 'none', sm: 'block' } }}>Esc to cancel</Typography>
              <IconButton aria-label="Cancel editing" onClick={cancelEdit} sx={{ width: 32, height: 32 }}><X size={16} /></IconButton>
            </Box>
          )}
          {sendError && (
            <Box role="alert" sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: editing ? 1 : 0, px: 1.25, py: 0.75, borderRadius: '10px', bgcolor: 'var(--ct-status-red-bg)', color: 'var(--ct-status-red-fg)' }}>
              <AlertCircle size={16} aria-hidden />
              <Typography variant="body2" sx={{ flex: 1, fontSize: 13, color: 'inherit' }}>{sendError}</Typography>
              <Button size="small" color="inherit" onClick={() => void handleSend()} disabled={sending} sx={{ fontWeight: 600, minHeight: 32 }}>Try again</Button>
              <IconButton aria-label="Dismiss" onClick={() => setSendError(null)} sx={{ width: 32, height: 32, color: 'inherit' }}><X size={15} /></IconButton>
            </Box>
          )}
        </Box>
      )}

      {previews.length > 0 && (
        <Box sx={{ px: 1.5, pt: 1, display: 'flex', gap: 1, flexWrap: 'wrap', bgcolor: 'var(--chat-surface)', borderTop: editing || sendError ? 'none' : '1px solid var(--chat-border)' }} aria-label="Attachments to send">
          {previews.map(({ file, url }) => (
            <Box key={file.name} sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 1, height: 64, pr: url ? 0 : 1.25, pl: url ? 0 : 1, maxWidth: 240, borderRadius: '12px', border: '1px solid var(--chat-border)', bgcolor: 'var(--chat-canvas)', overflow: 'hidden' }}>
              {url ? (
                <img src={url} alt={file.name} style={{ width: 64, height: 64, objectFit: 'cover', display: 'block' }} />
              ) : (
                <>
                  <FileText size={20} color="var(--ct-accent-strong)" aria-hidden />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600, color: 'var(--chat-text)', fontSize: 13 }}>{file.name}</Typography>
                    <Typography variant="caption" sx={{ color: 'var(--chat-muted)' }}>{Math.max(1, Math.round(file.size / 1024))} KB</Typography>
                  </Box>
                </>
              )}
              <IconButton
                aria-label={`Remove ${file.name}`}
                onClick={() => setAttachments((prev) => prev.filter((f) => f.name !== file.name))}
                sx={{ position: url ? 'absolute' : 'static', top: 2, right: 2, width: 26, height: 26, bgcolor: 'rgba(6,18,58,0.72)', color: '#fff', '&:hover': { bgcolor: 'rgba(6,18,58,0.9)' } }}
              >
                <X size={14} />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}

      <Box className="conversation-footer" onPaste={handlePaste}>
        {mentionState && mentionState.options.length > 0 && (
          <Paper elevation={4} sx={{ position: 'absolute', bottom: '100%', left: 8, right: 8, mb: 1, maxHeight: 220, overflowY: 'auto', zIndex: 5, borderRadius: '12px' }}>
            <List dense id="mention-suggestions" role="listbox">
              {mentionState.options.map((option, idx) => (
                <ListItemButton
                  key={option.membershipId}
                  selected={idx === mentionState.activeIndex}
                  role="option"
                  aria-selected={idx === mentionState.activeIndex}
                  onMouseDown={(event) => { event.preventDefault(); handleMentionPick(option); }}
                >
                  <Avatar sx={{ width: 28, height: 28, mr: 1.25, fontSize: 11, fontWeight: 600, bgcolor: option.membershipId === ALL_MENTION_ID ? 'var(--ct-accent-strong)' : 'var(--ct-tone-violet-bg)', color: option.membershipId === ALL_MENTION_ID ? '#fff' : 'var(--ct-tone-violet-fg)' }}>
                    {option.membershipId === ALL_MENTION_ID ? '@' : initialsOf(null, null, option.label)}
                  </Avatar>
                  {option.membershipId === ALL_MENTION_ID ? (
                    <ListItemText primary="@all" secondary={`Everyone in ${title} (${Math.max(0, memberCount - 1)})`} />
                  ) : (
                    <ListItemText primary={option.label} />
                  )}
                </ListItemButton>
              ))}
            </List>
          </Paper>
        )}
        {!editing && (
          <Tooltip title="Attach files or photos">
            <span>
              <IconButton onClick={() => fileRef.current?.click()} disabled={sending} aria-label="Attach files or photos" sx={{ width: 40, height: 40, color: 'var(--ct-accent-strong)' }}>
                <Paperclip size={19} />
              </IconButton>
            </span>
          </Tooltip>
        )}
        <input ref={fileRef} type="file" hidden multiple onChange={(e) => { addFiles(Array.from(e.target.files || [])); if (e.target) e.target.value = ''; }} />
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-end', borderRadius: '20px', bgcolor: 'var(--chat-canvas)', border: '1px solid var(--chat-border)', '&:focus-within': { borderColor: 'var(--ct-accent-strong)', bgcolor: 'var(--chat-surface)' } }}>
          <InputBase
            value={text}
            onChange={handleChange}
            placeholder={placeholder}
            fullWidth
            multiline
            maxRows={6}
            sx={{ px: 1.75, py: 1.1, fontSize: 15, lineHeight: 1.4 }}
            disabled={sending && !editing}
            onKeyDown={handleKeyDown}
            onKeyUp={syncMentionState}
            onClick={syncMentionState}
            onBlur={() => { setMentionState(null); stopTyping(); }}
            onFocus={syncMentionState}
            inputRef={inputRef}
            inputProps={{
              'aria-label': editing ? 'Edit message' : 'Message',
              'aria-autocomplete': 'list',
              'aria-expanded': mentionState ? mentionState.options.length > 0 : undefined,
              'aria-controls': mentionState && mentionState.options.length > 0 ? 'mention-suggestions' : undefined,
            }}
          />
          <Tooltip title="Emoji">
            <IconButton aria-label="Insert emoji" onClick={(e) => setEmojiAnchor(e.currentTarget)} sx={{ width: 40, height: 40, mr: 0.25, mb: 0.1, color: 'var(--chat-muted)', '&:hover': { color: 'var(--ct-accent-strong)' } }}>
              <Smile size={19} />
            </IconButton>
          </Tooltip>
        </Box>
        <Tooltip title={editing ? 'Save edit (Enter)' : 'Send (Enter) · New line (Shift + Enter)'}>
          <span>
            <IconButton
              onClick={() => void handleSend()}
              disabled={!canSend}
              aria-label={sending ? 'Sending' : editing ? 'Save edit' : 'Send message'}
              sx={{ width: 44, height: 44, borderRadius: '14px', bgcolor: 'var(--chat-me)', color: '#fff', '&:hover': { bgcolor: '#2E1287' }, '&.Mui-disabled': { bgcolor: 'var(--chat-canvas)', color: 'var(--ct-text-muted)' } }}
            >
              {sending ? <CircularProgress size={18} color="inherit" /> : editing ? <Pencil size={18} /> : <SendHorizontal size={19} />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Popover
        open={Boolean(emojiAnchor)}
        anchorEl={emojiAnchor}
        onClose={() => setEmojiAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        slotProps={{ paper: { sx: { borderRadius: '16px', p: 1, mb: 1 } } }}
      >
        <Box role="group" aria-label="Emoji" sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 40px)', gap: 0.25 }}>
          {COMPOSER_EMOJI.map((emoji) => (
            <IconButton key={emoji} aria-label={`Insert ${emoji}`} onClick={() => insertEmoji(emoji)} sx={{ width: 40, height: 40, fontSize: 22, fontFamily: EMOJI_FONT }}>
              {emoji}
            </IconButton>
          ))}
        </Box>
      </Popover>
    </>
  );
});
