import { useCallback, useEffect, useLayoutEffect, useRef, useState, type UIEvent } from 'react';
import type { ChatMessage } from './types';

/**
 * Scroll behaviour of a conversation: start at the latest message, keep the reader's position when older messages
 * load, follow new messages only when the reader is at the bottom (or sent them), and offer a jump button otherwise.
 */
export function useConversationScroll({
  roomId,
  messages,
  hasMore,
  isLoadingMore,
  onLoadMore,
  isMessageFromMe,
  typingCount,
}: {
  roomId: number;
  messages: ChatMessage[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  isMessageFromMe: (message: ChatMessage) => boolean;
  typingCount: number;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const paginationRef = useRef<{ height: number; top: number; messages: ChatMessage[]; started: boolean } | null>(null);
  const nearBottomRef = useRef(true);
  const lastMessageIdRef = useRef<number | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);

  const scrollToBottom = useCallback((smooth = false) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    nearBottomRef.current = true;
    setShowJump(false);
    setUnseenCount(0);
  }, []);

  // New room: start at the latest message.
  useEffect(() => {
    lastMessageIdRef.current = null;
    paginationRef.current = null;
    nearBottomRef.current = true;
    setShowJump(false);
    setUnseenCount(0);
  }, [roomId]);

  // Keep position when older messages load; follow new ones only if the reader is already at the bottom.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const pagination = paginationRef.current;
    if (pagination) {
      if (isLoadingMore) pagination.started = true;
      // Wait for the request to settle: the first rerender still has the old scroll height.
      if (isLoadingMore || (!pagination.started && messages === pagination.messages)) return;
      scroller.scrollTop = pagination.top + scroller.scrollHeight - pagination.height;
      paginationRef.current = null;
    }
    const latest = messages[messages.length - 1];
    const previousLatest = lastMessageIdRef.current;
    lastMessageIdRef.current = latest?.id ?? null;
    if (previousLatest === null) {
      scroller.scrollTop = scroller.scrollHeight;
      return;
    }
    if (!latest || latest.id === previousLatest) return;
    if (nearBottomRef.current || isMessageFromMe(latest)) {
      scrollToBottom(true);
    } else {
      setUnseenCount((count) => count + 1);
      setShowJump(true);
    }
  }, [messages, isLoadingMore, isMessageFromMe, scrollToBottom]);

  // Typing bubble appears at the bottom: keep it in view when the reader is there.
  useEffect(() => {
    if (typingCount && nearBottomRef.current) scrollToBottom(true);
  }, [typingCount, scrollToBottom]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottomRef.current = distance < 120;
    if (nearBottomRef.current) {
      if (showJump) setShowJump(false);
      if (unseenCount) setUnseenCount(0);
    } else if (distance > 400 && !showJump) {
      setShowJump(true);
    }
    if (el.scrollTop < 40 && hasMore && !isLoadingMore && !paginationRef.current) {
      paginationRef.current = { height: el.scrollHeight, top: el.scrollTop, messages, started: false };
      onLoadMore();
    }
  };

  return { scrollRef, handleScroll, showJump, unseenCount, scrollToBottom };
}
