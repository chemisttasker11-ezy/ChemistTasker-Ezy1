import { Fragment, type ReactNode } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import type { ChatMessage } from '@chemisttasker/shared-core';

dayjs.extend(utc);

/** Messages from the same sender closer than this read as one group (one avatar, one name, one time). */
const GROUP_GAP_MINUTES = 5;

export const localTime = (iso: string) => dayjs.utc(iso).local();

/** "Today", "Yesterday", "Monday 6 Oct", or "6 Oct 2025" for older years. */
export const dayLabel = (iso: string) => {
  const d = localTime(iso);
  const today = dayjs().startOf('day');
  const diff = today.diff(d.startOf('day'), 'day');
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.format('dddd D MMM');
  return d.year() === today.year() ? d.format('ddd D MMM') : d.format('D MMM YYYY');
};

export const timeLabel = (iso: string) => localTime(iso).format('h:mm A');

export const fullTimestamp = (iso: string) => localTime(iso).format('dddd D MMMM YYYY, h:mm A');

/** Feed stamp like Facebook/LinkedIn: "Just now", "5m", "2h", "Yesterday", "Mon", "6 Oct", "6 Oct 2025". */
export const relativeTime = (iso?: string | null) => {
  if (!iso) return '';
  const d = localTime(iso);
  const minutes = dayjs().diff(d, 'minute');
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = dayjs().diff(d, 'hour');
  if (hours < 24 && d.isSame(dayjs(), 'day')) return `${hours}h`;
  const days = dayjs().startOf('day').diff(d.startOf('day'), 'day');
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.format('ddd');
  return d.year() === dayjs().year() ? d.format('D MMM') : d.format('D MMM YYYY');
};

/** Role names as the backend labels them (memberships ROLE_CHOICES), in sentence case. */
export const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  PHARMACIST: 'Pharmacist',
  INTERN: 'Intern pharmacist',
  TECHNICIAN: 'Dispensary technician',
  ASSISTANT: 'Pharmacy assistant',
  PHARMACY_ASSISTANT: 'Pharmacy assistant',
  STUDENT: 'Pharmacy student',
  CONTACT: 'Contact',
  OTHER_STAFF: 'Pharmacy staff',
  EXPLORER: 'New to pharmacy',
  ORG_ADMIN: 'Organisation admin',
  ORG_OWNER: 'Organisation owner',
  ORG_STAFF: 'Organisation staff',
};
export const EMPLOYMENT_LABELS: Record<string, string> = {
  FULL_TIME: 'Full time',
  PART_TIME: 'Part time',
  CASUAL: 'Casual',
  LOCUM: 'Locum',
  SHIFT_HERO: 'Shift Hero',
};
export const roleLabel = (role?: string | null) => {
  const key = (role || '').trim().toUpperCase();
  if (!key) return '';
  if (ROLE_LABELS[key]) return ROLE_LABELS[key];
  const words = key.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** Conversation list stamp: "9:14 AM" today, "Yesterday", weekday this week, else "6 Oct". */
export const listTimeLabel = (iso?: string | null) => {
  if (!iso) return '';
  const d = localTime(iso);
  const diff = dayjs().startOf('day').diff(d.startOf('day'), 'day');
  if (diff === 0) return d.format('h:mm A');
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.format('ddd');
  return d.year() === dayjs().year() ? d.format('D MMM') : d.format('D MMM YY');
};

export type GroupPosition = 'single' | 'first' | 'middle' | 'last';

export type MessageLayout = {
  message: ChatMessage;
  showDay: boolean;
  position: GroupPosition;
};

/** Adds day separators and Messenger-style grouping of consecutive messages from one sender. */
export const layoutMessages = (messages: ChatMessage[]): MessageLayout[] => {
  const sameGroup = (a?: ChatMessage, b?: ChatMessage) => {
    if (!a || !b || a.is_deleted || b.is_deleted) return false;
    if (a.sender?.id !== b.sender?.id) return false;
    if (!localTime(a.created_at).isSame(localTime(b.created_at), 'day')) return false;
    return Math.abs(localTime(b.created_at).diff(localTime(a.created_at), 'minute')) < GROUP_GAP_MINUTES;
  };
  return messages.map((message, index) => {
    const prev = messages[index - 1];
    const next = messages[index + 1];
    const showDay = !prev || !localTime(prev.created_at).isSame(localTime(message.created_at), 'day');
    const joinsPrev = !showDay && sameGroup(prev, message);
    const joinsNext = sameGroup(message, next);
    const position: GroupPosition = joinsPrev && joinsNext ? 'middle' : joinsPrev ? 'last' : joinsNext ? 'first' : 'single';
    return { message, showDay, position };
  });
};

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*\s*){1,3}$/u;

/** One to three emoji and nothing else: shown large without a bubble. */
export const isEmojiOnly = (body?: string | null) => Boolean(body && body.trim() && EMOJI_ONLY.test(body.trim()));

const TOKEN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])|(@[\p{L}\p{N}._-]+(?:\s[\p{Lu}][\p{L}'-]+)?)/gu;

/** Only plain web links become anchors; anything else stays text. */
export const safeWebHref = (raw: string): string | null => {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
};

/** Message text with clickable links and highlighted @mentions. */
export const renderRichText = (body: string, tone: 'me' | 'them'): ReactNode => {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of body.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(body.slice(last, start));
    const href = match[1] ? safeWebHref(match[1]) : null;
    if (match[1] && !href) {
      parts.push(match[1]);
    } else if (href) {
      parts.push(
        <a
          key={start}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2, overflowWrap: 'anywhere' }}
        >
          {match[1]}
        </a>,
      );
    } else {
      parts.push(
        <span key={start} style={{ fontWeight: 600, color: tone === 'me' ? '#FFFFFF' : 'var(--ct-accent-strong)' }}>
          {match[2]}
        </span>,
      );
    }
    last = start + match[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts.map((part, i) => <Fragment key={i}>{part}</Fragment>);
};

export const initialsOf = (first?: string | null, last?: string | null, fallback?: string) => {
  const f = (first || '').trim();
  const l = (last || '').trim();
  if (f || l) return `${f.charAt(0)}${l.charAt(0) || f.charAt(1) || ''}`.toUpperCase();
  const parts = (fallback || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

/**
 * Colour-emoji fonts first. Inter/Outfit carry a plain text glyph for U+2764 (heart), so without this the
 * red heart renders as a black text heart in the current text colour.
 */
export const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", "EmojiOne Color", sans-serif';

/** Reactions the chat API accepts (backend/chat/models.py REACTION_CHOICES). */
export const REACTIONS = ['👍', '❤️', '🔥', '💩'] as const;

/** Composer quick emoji. */
export const COMPOSER_EMOJI = ['😀', '😂', '😊', '😍', '🙏', '👍', '👏', '🙌', '🎉', '❤️', '🔥', '✅', '👀', '🤔', '😅', '😢', '😮', '💊', '🩺', '📅', '⏰', '☕', '👋', '💪'];
