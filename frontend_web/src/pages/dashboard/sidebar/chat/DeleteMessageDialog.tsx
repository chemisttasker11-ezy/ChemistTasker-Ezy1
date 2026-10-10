import { useState } from 'react';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import type { ChatMessage } from './types';

/** Confirms deleting a message; stays open with the error reported if the delete fails. */
export function DeleteMessageDialog({ message, onClose, onDelete, onError }: {
  message: ChatMessage | null;
  onClose: () => void;
  onDelete: (messageId: number) => void | Promise<void>;
  onError: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (!message) return;
    setBusy(true);
    try {
      await onDelete(message.id);
      onClose();
    } catch {
      onError("We couldn't delete that message. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ConfirmDialog
      open={Boolean(message)}
      title="Delete this message?"
      body="Everyone in this conversation will see “This message was deleted”. You can't undo this."
      confirmLabel="Delete"
      busyLabel="Deleting…"
      busy={busy}
      onConfirm={() => void confirm()}
      onClose={onClose}
    />
  );
}
