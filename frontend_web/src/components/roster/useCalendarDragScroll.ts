import { useCallback, useEffect, useRef } from 'react';

// Own the drag loop and its document/window listeners together.
export function useCalendarDragScroll() {
  const calendarDragScrollFrameRef = useRef<number | null>(null);
  const calendarDragPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const isCalendarDragScrollingRef = useRef(false);
  const stopCalendarDragScroll = useCallback(() => {
    isCalendarDragScrollingRef.current = false;
    calendarDragPointerRef.current = null;
    if (calendarDragScrollFrameRef.current != null) {
      window.cancelAnimationFrame(calendarDragScrollFrameRef.current);
      calendarDragScrollFrameRef.current = null;
    }
  }, []);
  const runCalendarDragScroll = useCallback(() => {
    if (!isCalendarDragScrollingRef.current) {
      calendarDragScrollFrameRef.current = null;
      return;
    }

    const pointer = calendarDragPointerRef.current;
    if (pointer) {
      const edgeSize = 120;
      const maxStep = 28;
      const viewportHeight = window.innerHeight;
      let deltaY = 0;

      if (pointer.clientY < edgeSize) {
        deltaY = -Math.ceil(((edgeSize - pointer.clientY) / edgeSize) * maxStep);
      } else if (pointer.clientY > viewportHeight - edgeSize) {
        deltaY = Math.ceil(((pointer.clientY - (viewportHeight - edgeSize)) / edgeSize) * maxStep);
      }

      if (deltaY !== 0) {
        window.scrollBy({ top: deltaY, behavior: 'auto' });
        document.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          clientX: pointer.clientX,
          clientY: pointer.clientY,
          buttons: 1,
        }));
      }
    }

    calendarDragScrollFrameRef.current = window.requestAnimationFrame(runCalendarDragScroll);
  }, []);
  const startCalendarDragScroll = useCallback((target: EventTarget | null, clientX: number, clientY: number) => {
    if (!(target instanceof Element) || !target.closest('.rbc-time-content')) {
      return;
    }
    calendarDragPointerRef.current = { clientX, clientY };
    isCalendarDragScrollingRef.current = true;
    if (calendarDragScrollFrameRef.current == null) {
      calendarDragScrollFrameRef.current = window.requestAnimationFrame(runCalendarDragScroll);
    }
  }, [runCalendarDragScroll]);
  const updateCalendarDragPointer = useCallback((event: MouseEvent) => {
    if (!isCalendarDragScrollingRef.current) {
      return;
    }
    calendarDragPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
  }, []);
  useEffect(() => {
    window.addEventListener('mousemove', updateCalendarDragPointer);
    window.addEventListener('mouseup', stopCalendarDragScroll);
    return () => {
      window.removeEventListener('mousemove', updateCalendarDragPointer);
      window.removeEventListener('mouseup', stopCalendarDragScroll);
      stopCalendarDragScroll();
    };
  }, [stopCalendarDragScroll, updateCalendarDragPointer]);

  return startCalendarDragScroll;
}
