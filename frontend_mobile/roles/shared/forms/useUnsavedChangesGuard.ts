import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useIsFocused } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useUnsavedChangesDialog } from './UnsavedChangesDialogProvider';
import { useUnsavedChangesRegistry } from './UnsavedChangesRegistryProvider';

type Options = {
  enabled?: boolean;
  saving?: boolean;
  title?: string;
  message?: string;
  onDiscard?: () => void | Promise<void>;
  onSave?: () => boolean | void | Promise<boolean | void>;
  saveLabel?: string;
};

const defaultTitle = 'Discard changes?';
const defaultMessage = 'You have unsaved changes. If you leave now, your edits will be discarded.';

const normalizeValue = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return value ?? null;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, normalizeValue(nested)]);
    return Object.fromEntries(sortedEntries);
  }
  return value;
};

const serializeValue = (value: unknown) => JSON.stringify(normalizeValue(value));

// Baseline marker after a discard: take the value the next render shows (onDiscard's reset), never the old snapshot.
const REBASELINE = '<rebaseline>';

export function useUnsavedChangesGuard<T>(value: T, options: Options = {}) {
  const {
    enabled = true,
    saving = false,
    title = defaultTitle,
    message = defaultMessage,
    onDiscard,
    onSave,
    saveLabel = 'Save changes',
  } = options;
  const isFocused = useIsFocused();
  const dialog = useUnsavedChangesDialog();
  const registry = useUnsavedChangesRegistry();
  const handlingBlockedNavigationRef = useRef(false);
  // Refs, not state: a save's own success navigation runs in the same tick the save ends, before a re-render.
  const savingRef = useRef(saving);
  const savedRef = useRef(false);
  // Set the moment the user confirms leaving, so the removal that follows does not prompt again before a re-render.
  const approvedLeaveRef = useRef(false);
  const [baseline, setBaseline] = useState<string | null>(null);

  const serializedValue = useMemo(() => serializeValue(value), [value]);
  const isDirty = enabled && baseline !== null && baseline !== REBASELINE && baseline !== serializedValue;

  useEffect(() => {
    if (baseline === REBASELINE) setBaseline(serializedValue);
  }, [baseline, serializedValue]);

  // The approved removal runs in the same tick as the confirmation; any later render (an edit, a new baseline) ends it.
  useEffect(() => {
    approvedLeaveRef.current = false;
  }, [baseline, serializedValue]);

  // Save: onSave already set the clean baseline via markClean. Discard: baseline whatever the reset leaves.
  const approveLeave = useCallback((decision: 'discard' | 'save') => {
    approvedLeaveRef.current = true;
    if (decision === 'discard') setBaseline(REBASELINE);
  }, []);

  useEffect(() => {
    savingRef.current = saving;
    if (!saving) savedRef.current = false;
  }, [saving]);

  // Leaving is blocked while a save runs, until that save marks the form clean.
  const isSaveInFlight = useCallback(() => savingRef.current && !savedRef.current, []);

  const markClean = useCallback((nextValue?: T) => {
    if (savingRef.current) savedRef.current = true;
    setBaseline(serializeValue(nextValue === undefined ? value : nextValue));
  }, [value]);

  const requestConfirmation = useCallback(async () => {
    if (dialog) {
      return dialog.confirmAction({ title, message, onSave, saveLabel });
    }

    return new Promise<'keep' | 'discard'>((resolve) => {
      Alert.alert(title, message, [
        {
          text: 'Keep editing',
          style: 'cancel',
          onPress: () => resolve('keep'),
        },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => resolve('discard'),
        },
      ]);
    });
  }, [dialog, message, onSave, saveLabel, title]);

  const discardChanges = useCallback(async () => {
    if (isSaveInFlight()) {
      return false;
    }
    if (!isDirty || saving) {
      if (onDiscard) {
        await onDiscard();
      }
      return true;
    }

    const decision = await requestConfirmation();
    if (decision === 'keep') {
      return false;
    }

    if (decision === 'discard' && onDiscard) {
      await onDiscard();
    }
    approveLeave(decision);
    return true;
  }, [approveLeave, isDirty, isSaveInFlight, onDiscard, requestConfirmation, saving]);

  const guard = useMemo(
    () => ({ discardChanges, isBlocking: () => isDirty || isSaveInFlight() }),
    [discardChanges, isDirty, isSaveInFlight]
  );

  // Every leave attempt from this form (Cancel, native removal, web back) joins the registry's one transaction.
  const leave = useCallback((action: () => void) => {
    if (registry) {
      void registry.requestNavigation(action, guard);
      return;
    }
    if (handlingBlockedNavigationRef.current) {
      return;
    }
    handlingBlockedNavigationRef.current = true;
    void (async () => {
      try {
        if (await discardChanges()) action();
      } finally {
        handlingBlockedNavigationRef.current = false;
      }
    })();
  }, [discardChanges, guard, registry]);

  const confirmDiscard = useCallback((onDiscardAction: () => void) => {
    if (isSaveInFlight()) {
      return;
    }
    if (!isDirty || saving) {
      onDiscardAction();
      return;
    }
    leave(onDiscardAction);
  }, [isDirty, isSaveInFlight, leave, saving]);

  // Stays on while saving so native gestures (iOS swipe) and web back cannot dismiss a saving form; that removal is refused silently.
  // expo-router 58 has no beforeRemove event and keeps blocking a re-dispatch, so an allowed removal goes through repeat().
  usePreventRemove(isDirty || saving, ({ repeat }) => {
    if (isSaveInFlight()) {
      return;
    }
    if (approvedLeaveRef.current || savedRef.current) {
      approvedLeaveRef.current = false;
      repeat();
      return;
    }
    leave(repeat);
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || !isDirty || saving || typeof window === 'undefined') {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, saving]);

  useEffect(() => {
    if (!registry || !isFocused) {
      return;
    }

    return registry.registerGuard(guard);
  }, [guard, isFocused, registry]);

  return {
    discardChanges,
    isDirty,
    markClean,
    confirmDiscard,
  };
}
