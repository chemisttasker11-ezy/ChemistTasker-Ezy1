import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    CircularProgress,
} from '@mui/material';

interface DeleteConfirmDialogProps {
    open: boolean;
    loading: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
    open,
    loading,
    onClose,
    onConfirm,
}) => {
    return (
        <Dialog open={open} onClose={loading ? undefined : onClose}>
            <DialogTitle>Delete Shift</DialogTitle>
            <DialogContent>
                <Typography>Are you sure you want to delete this shift? This action cannot be undone.</Typography>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={loading}>Cancel</Button>
                <Button
                    variant="contained"
                    color="error"
                    onClick={onConfirm}
                    disabled={loading}
                    startIcon={loading ? <CircularProgress size={16} /> : undefined}
                >
                    Delete
                </Button>
            </DialogActions>
        </Dialog>
    );
};
