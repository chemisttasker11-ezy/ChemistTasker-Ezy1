// DeleteConfirmDialog Component
// Confirmation dialog for shift deletion

import React from 'react';
import { Portal, Dialog, Button, Text } from 'react-native-paper';
import { customTheme } from '../../theme';

interface DeleteConfirmDialogProps {
    visible: boolean;
    onDismiss: () => void;
    onConfirm: () => void;
    loading?: boolean;
}

export default function DeleteConfirmDialog({
    visible,
    onDismiss,
    onConfirm,
    loading = false
}: DeleteConfirmDialogProps) {
    return (
        <Portal>
            <Dialog visible={visible} onDismiss={onDismiss}>
                <Dialog.Title>Delete Shift</Dialog.Title>
                <Dialog.Content>
                    <Text>Are you sure you want to delete this shift? This action cannot be undone.</Text>
                </Dialog.Content>
                <Dialog.Actions>
                    <Button onPress={onDismiss} disabled={loading}>Cancel</Button>
                    <Button
                        onPress={onConfirm}
                        loading={loading}
                        disabled={loading}
                        textColor={customTheme.colors.error}
                    >
                        Delete
                    </Button>
                </Dialog.Actions>
            </Dialog>
        </Portal>
    );
}
