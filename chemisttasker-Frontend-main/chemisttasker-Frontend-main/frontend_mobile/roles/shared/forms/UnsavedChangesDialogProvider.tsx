import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Button, Dialog, Portal, Text } from 'react-native-paper';

type ConfirmOptions = {
  message: string;
  onSave?: () => Promise<void> | void;
  saveLabel?: string;
  title: string;
};

export type UnsavedChangesDecision = 'keep' | 'discard' | 'save';

type ContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  confirmAction: (options: ConfirmOptions) => Promise<UnsavedChangesDecision>;
};

const UnsavedChangesDialogContext = createContext<ContextValue | null>(null);

export function UnsavedChangesDialogProvider({ children }: { children: React.ReactNode }) {
  const pendingConfirmationRef = useRef<Promise<UnsavedChangesDecision> | null>(null);
  const resolverRef = useRef<((decision: UnsavedChangesDecision) => void) | null>(null);
  const [dialogState, setDialogState] = useState<ConfirmOptions & { open: boolean; saving: boolean }>({
    message: '',
    open: false,
    saving: false,
    title: '',
  });

  const closeDialog = useCallback((decision: UnsavedChangesDecision) => {
    setDialogState((prev) => ({ ...prev, open: false, saving: false }));
    resolverRef.current?.(decision);
    resolverRef.current = null;
    pendingConfirmationRef.current = null;
  }, []);

  const saveAndClose = useCallback(() => {
    const onSave = dialogState.onSave;
    if (!onSave || dialogState.saving) return;

    setDialogState((prev) => ({ ...prev, saving: true }));
    void (async () => {
      try {
        await onSave();
      } finally {
        setDialogState((prev) => ({ ...prev, open: false, saving: false }));
        setTimeout(() => {
          resolverRef.current?.('save');
          resolverRef.current = null;
          pendingConfirmationRef.current = null;
        }, 0);
      }
    })();
  }, [dialogState.onSave, dialogState.saving]);

  const confirmAction = useCallback((options: ConfirmOptions) => {
    if (pendingConfirmationRef.current) {
      return pendingConfirmationRef.current;
    }

    const pending = new Promise<UnsavedChangesDecision>((resolve) => {
      resolverRef.current = resolve;
    });
    pendingConfirmationRef.current = pending;
    setDialogState({
      ...options,
      open: true,
      saveLabel: options.saveLabel || 'Save Changes',
      saving: false,
    });
    return pending;
  }, []);

  const confirm = useCallback(async (options: ConfirmOptions) => {
    const decision = await confirmAction(options);
    return decision === 'discard' || decision === 'save';
  }, [confirmAction]);

  const value = useMemo(() => ({ confirm, confirmAction }), [confirm, confirmAction]);

  return (
    <UnsavedChangesDialogContext.Provider value={value}>
      {children}
      <Portal>
        <Dialog visible={dialogState.open} dismissable={false}>
          <Dialog.Title>{dialogState.title}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">{dialogState.message}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button disabled={dialogState.saving} onPress={() => closeDialog('keep')}>Keep Editing</Button>
            {dialogState.onSave ? (
              <Button disabled={dialogState.saving} onPress={saveAndClose}>
                {dialogState.saveLabel || 'Save Changes'}
              </Button>
            ) : null}
            <Button disabled={dialogState.saving} onPress={() => closeDialog('discard')}>Discard Changes</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </UnsavedChangesDialogContext.Provider>
  );
}

export function useUnsavedChangesDialog() {
  return useContext(UnsavedChangesDialogContext);
}
