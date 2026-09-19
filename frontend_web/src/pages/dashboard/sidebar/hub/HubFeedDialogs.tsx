import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CloseIcon from '@mui/icons-material/Close';
import type { HubPoll } from '../../../../types/hub';
import { SubmissionStatusNotice } from './HubFeed.helpers';

interface EditPostDialogProps {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  error?: string | null;
}

export function EditPostDialog({
  open,
  value,
  onChange,
  onClose,
  onSave,
  saving,
  error,
}: EditPostDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Edit Post</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          multiline
          minRows={4}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoFocus
          placeholder="Update your post..."
        />
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={onSave}
          variant="contained"
          disabled={saving || !value.trim()}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface StartPollModalProps {
  onClose: () => void;
  onCreate: (pollData: { question: string; options: string[] }) => Promise<void> | void;
  submitting?: boolean;
  error?: string | null;
  editingPoll?: HubPoll | null;
}

export function StartPollModal({
  onClose,
  onCreate,
  submitting = false,
  error,
  editingPoll,
}: StartPollModalProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);

  useEffect(() => {
    if (editingPoll) {
      setQuestion(editingPoll.question || '');
      const sortedOptions = editingPoll.options
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((option) => option.label);
      setOptions(sortedOptions.length ? sortedOptions : ['', '']);
    } else {
      setQuestion('');
      setOptions(['', '']);
    }
  }, [editingPoll]);

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const addOption = () => {
    if (options.length < 5) {
      setOptions([...options, '']);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const pollData = {
      question,
      options: options.filter((option) => option.trim() !== ''),
    };
    if (pollData.question.trim() && pollData.options.length >= 2) {
      await onCreate(pollData);
      setQuestion('');
      setOptions(['', '']);
    }
  };

  return (
    <Dialog open onClose={submitting ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">{editingPoll ? 'Edit Poll' : 'Start a New Poll'}</Typography>
          <IconButton onClick={onClose} size="small" disabled={submitting}>
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {submitting ? (
          <SubmissionStatusNotice
            message={
              editingPoll
                ? 'Updating your poll. Please wait and keep this window open.'
                : 'Creating your poll. Please wait and keep this window open.'
            }
          />
        ) : null}
        <TextField
          autoFocus
          margin="dense"
          id="pollQuestion"
          label="Poll Question"
          type="text"
          fullWidth
          variant="outlined"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="e.g., What's for lunch?"
          sx={{ mb: 3, '& .MuiOutlinedInput-root': { borderRadius: 1 } }}
          disabled={submitting}
        />

        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'medium' }}>
          Options
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {options.map((option, index) => (
            <TextField
              key={index}
              fullWidth
              variant="outlined"
              value={option}
              onChange={(event) => handleOptionChange(index, event.target.value)}
              placeholder={`Option ${index + 1}`}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1 } }}
              disabled={submitting}
            />
          ))}
        </Box>
        {options.length < 5 && (
          <Button
            onClick={addOption}
            startIcon={<AddCircleOutlineIcon sx={{ fontSize: 16 }} />}
            sx={{ mt: 2, textTransform: 'none', color: 'primary.main', '&:hover': { bgcolor: 'primary.light' } }}
            disabled={submitting}
          >
            Add Option
          </Button>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} variant="outlined" sx={{ textTransform: 'none' }} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={
            submitting ||
            !question.trim() ||
            options.filter((option) => option.trim() !== '').length < 2
          }
          sx={{ textTransform: 'none', bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }}
        >
          {submitting ? (editingPoll ? 'Updating...' : 'Creating...') : editingPoll ? 'Update Poll' : 'Create Poll'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
