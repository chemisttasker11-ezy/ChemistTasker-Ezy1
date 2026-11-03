import { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, type Text } from 'react-native';

/**
 * Moves the screen reader into a just-opened Modal: pass `onShow` to the Modal and `target` to its
 * heading. Focusing the heading reads it out, so there is no separate announcement to double it.
 * `open` cancels a pending focus as soon as the overlay starts closing, so an exiting overlay is never focused.
 */
export function useOverlayFocus(open: boolean) {
  const target = useRef<Text>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isOpen = useRef(open);

  useEffect(() => {
    isOpen.current = open;
    if (!open) clearTimeout(timer.current);
  }, [open]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onShow = useCallback(() => {
    clearTimeout(timer.current);
    if (!isOpen.current) return;
    // Android ignores focus sent before the Modal window is attached; a short delay lands it.
    timer.current = setTimeout(() => {
      const node = isOpen.current && target.current ? findNodeHandle(target.current) : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 100);
  }, []);

  return { target, onShow };
}
