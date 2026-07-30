import * as React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { useBeforeUnload, useBlocker } from 'react-router-dom';

const DEFAULT_MESSAGE =
  'You have unsaved changes. If you leave now, your edits will be discarded.';
const DEFAULT_TITLE = 'Discard changes?';

type BoundaryGuard = {
  isDirty: boolean;
  message: string;
  onSave?: () => Promise<void> | void;
  saveLabel: string;
  title: string;
};

type UnsavedDecision = 'keep' | 'discard' | 'save';

type BoundaryContextValue = {
  setGuard: (guard: BoundaryGuard | null) => void;
  confirmIfNeeded: () => Promise<boolean>;
  requestConfirmation: (options?: { message?: string; onSave?: () => Promise<void> | void; saveLabel?: string; title?: string }) => Promise<UnsavedDecision>;
};

const UnsavedChangesBoundaryContext = React.createContext<BoundaryContextValue | null>(null);

function normalizeForDirtyCheck(value: unknown): unknown {
  if (value instanceof File) {
    return {
      lastModified: value.lastModified,
      name: value.name,
      size: value.size,
      type: value.type,
    };
  }

  if (Array.isArray(value)) {
    return value.map(normalizeForDirtyCheck);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const normalized = normalizeForDirtyCheck((value as Record<string, unknown>)[key]);
        if (normalized !== undefined) {
          result[key] = normalized;
        }
        return result;
      }, {});
  }

  return value;
}

function serializeForDirtyCheck(value: unknown): string {
  return JSON.stringify(normalizeForDirtyCheck(value));
}

export function UnsavedChangesBoundary({
  children,
}: {
  children: (tools: { confirmIfNeeded: () => Promise<boolean> }) => React.ReactNode;
}) {
  const guardRef = React.useRef<BoundaryGuard | null>(null);
  const pendingConfirmationRef = React.useRef<Promise<UnsavedDecision> | null>(null);
  const resolverRef = React.useRef<((decision: UnsavedDecision) => void) | null>(null);
  const [dialogState, setDialogState] = React.useState<{
    message: string;
    onSave?: () => Promise<void> | void;
    open: boolean;
    saveLabel: string;
    saving: boolean;
    title: string;
  }>({
    message: DEFAULT_MESSAGE,
    onSave: undefined,
    open: false,
    saveLabel: 'Save Changes',
    saving: false,
    title: DEFAULT_TITLE,
  });

  const setGuard = React.useCallback((guard: BoundaryGuard | null) => {
    guardRef.current = guard;
  }, []);

  const closeDialog = React.useCallback((decision: UnsavedDecision) => {
    setDialogState((prev) => ({ ...prev, open: false, saving: false }));
    resolverRef.current?.(decision);
    resolverRef.current = null;
    pendingConfirmationRef.current = null;
  }, []);

  const saveAndClose = React.useCallback(() => {
    const onSave = dialogState.onSave;
    if (!onSave || dialogState.saving) {
      return;
    }

    setDialogState((prev) => ({ ...prev, saving: true }));
    void (async () => {
      try {
        await onSave();
      } catch (error) {
        console.error('Failed to save unsaved changes before navigation.', error);
      } finally {
        setDialogState((prev) => ({ ...prev, open: false, saving: false }));
        window.setTimeout(() => {
          resolverRef.current?.('save');
          resolverRef.current = null;
          pendingConfirmationRef.current = null;
        }, 0);
      }
    })();
  }, [dialogState.onSave, dialogState.saving]);

  const requestConfirmation = React.useCallback(
    ({
      message = DEFAULT_MESSAGE,
      onSave,
      saveLabel = 'Save Changes',
      title = DEFAULT_TITLE,
    }: { message?: string; onSave?: () => Promise<void> | void; saveLabel?: string; title?: string } = {}) =>
      {
        if (pendingConfirmationRef.current) {
          return pendingConfirmationRef.current;
        }

        const pending = new Promise<UnsavedDecision>((resolve) => {
          resolverRef.current = resolve;
        });
        pendingConfirmationRef.current = pending;
        setDialogState({
          message,
          onSave,
          open: true,
          saveLabel,
          saving: false,
          title,
        });
        return pending;
      },
    []
  );

  const confirmIfNeeded = React.useCallback(async () => {
    const guard = guardRef.current;
    if (!guard?.isDirty) {
      return true;
    }
    const decision = await requestConfirmation({
      message: guard.message,
      onSave: guard.onSave,
      saveLabel: guard.saveLabel,
      title: guard.title,
    });
    return decision === 'discard' || decision === 'save';
  }, [requestConfirmation]);

  const contextValue = React.useMemo(
    () => ({
      confirmIfNeeded,
      requestConfirmation,
      setGuard,
    }),
    [confirmIfNeeded, requestConfirmation, setGuard]
  );

  return (
    <UnsavedChangesBoundaryContext.Provider value={contextValue}>
      {children({ confirmIfNeeded })}
      <Dialog
        open={dialogState.open}
        onClose={() => closeDialog('keep')}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            p: 1,
          },
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>{dialogState.title}</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">
              {dialogState.message}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Save your changes first if you want to keep them.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button disabled={dialogState.saving} onClick={() => closeDialog('keep')} variant="outlined">
            Keep Editing
          </Button>
          {dialogState.onSave && (
            <Button disabled={dialogState.saving} onClick={saveAndClose} variant="contained">
              {dialogState.saveLabel}
            </Button>
          )}
          <Button color="error" disabled={dialogState.saving} onClick={() => closeDialog('discard')} variant="contained">
            Discard Changes
          </Button>
        </DialogActions>
      </Dialog>
    </UnsavedChangesBoundaryContext.Provider>
  );
}

export function useUnsavedChangesGuard<T>({
  disabled = false,
  message = DEFAULT_MESSAGE,
  onSave,
  saveLabel = 'Save Changes',
  title = DEFAULT_TITLE,
  value,
}: {
  disabled?: boolean;
  message?: string;
  onSave?: () => Promise<void> | void;
  saveLabel?: string;
  title?: string;
  value: T;
}) {
  const boundary = React.useContext(UnsavedChangesBoundaryContext);
  const baselineRef = React.useRef(serializeForDirtyCheck(value));
  const handlingBlockedNavigationRef = React.useRef(false);
  const currentSerialized = React.useMemo(() => serializeForDirtyCheck(value), [value]);
  const isDirty = !disabled && currentSerialized !== baselineRef.current;

  const blocker = useBlocker(isDirty);

  React.useEffect(() => {
    if (blocker.state !== 'blocked') {
      handlingBlockedNavigationRef.current = false;
      return;
    }

    if (handlingBlockedNavigationRef.current) {
      return;
    }

    handlingBlockedNavigationRef.current = true;

    void (async () => {
      const decision = boundary
        ? await boundary.requestConfirmation({ message, onSave, saveLabel, title })
        : window.confirm(message)
          ? 'discard'
          : 'keep';

      if (decision === 'discard' || decision === 'save') {
        baselineRef.current = currentSerialized;
        handlingBlockedNavigationRef.current = false;
        blocker.proceed();
        return;
      }

      handlingBlockedNavigationRef.current = false;
      blocker.reset();
    })();
  }, [blocker, blocker.state, boundary, currentSerialized, message, onSave, saveLabel, title]);

  useBeforeUnload(
    React.useCallback(
      (event) => {
        if (!isDirty) {
          return;
        }
        event.preventDefault();
        event.returnValue = '';
      },
      [isDirty]
    ),
    { capture: true }
  );

  React.useEffect(() => {
    if (!boundary) {
      return;
    }

    boundary.setGuard({ isDirty, message, onSave, saveLabel, title });
    return () => {
      boundary.setGuard(null);
    };
  }, [boundary, isDirty, message, onSave, saveLabel, title]);

  const markClean = React.useCallback((nextValue: T) => {
    baselineRef.current = serializeForDirtyCheck(nextValue);
  }, []);

  const confirmDiscard = React.useCallback(
    async (onDiscard?: () => void) => {
      const decision = isDirty
        ? boundary
          ? await boundary.requestConfirmation({ message, onSave, saveLabel, title })
          : window.confirm(message)
            ? 'discard'
            : 'keep'
        : 'discard';

      if (decision === 'keep') {
        return false;
      }

      baselineRef.current = currentSerialized;
      onDiscard?.();
      return true;
    },
    [boundary, currentSerialized, isDirty, message, onSave, saveLabel, title]
  );

  return {
    confirmDiscard,
    isDirty,
    markClean,
  };
}
