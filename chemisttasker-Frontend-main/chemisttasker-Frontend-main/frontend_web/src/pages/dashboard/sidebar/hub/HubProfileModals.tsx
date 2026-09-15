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
import CloseIcon from '@mui/icons-material/Close';

import {
  updateOrganizationHubProfile,
  updatePharmacyHubProfile,
} from '../../../../api/hub';
import CoverPhotoUploader from '../../../../components/coverPhoto/CoverPhotoUploader';
import type { HubOrganization, HubPharmacy } from '../../../../types/hub';
interface PharmacyProfileModalProps {
  open: boolean;
  pharmacy: HubPharmacy;
  onClose: () => void;
  onSaved: (pharmacy: HubPharmacy) => void;
}

export function PharmacyProfileModal({ open, pharmacy, onClose, onSaved }: PharmacyProfileModalProps) {
  const [about, setAbout] = useState(pharmacy.about ?? '');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(pharmacy.coverImageUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAbout(pharmacy.about ?? '');
      setCoverFile(null);
      setCoverPreview(pharmacy.coverImageUrl ?? null);
      setError(null);
    }
  }, [open, pharmacy]);

  const handleCoverChange = (file: File | null, previewUrl: string | null) => {
    setCoverFile(file);
    setCoverPreview(previewUrl);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await updatePharmacyHubProfile(pharmacy.id, {
        about,
        coverImage: coverFile ?? undefined,
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      console.error('Failed to update pharmacy profile', err);
      setError('Unable to update pharmacy profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth component="form" onSubmit={handleSubmit}>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Edit Pharmacy Profile</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          label="About"
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          multiline
          minRows={4}
          fullWidth
        />
        <CoverPhotoUploader
          value={coverPreview}
          onChange={handleCoverChange}
          disabled={saving}
          title="Cover photo"
          helperText="Use a wide image (recommended 1200 x 400 px). Drag to reposition before saving."
        />
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface OrganizationProfileModalProps {
  open: boolean;
  organization: HubOrganization;
  onClose: () => void;
  onSaved: (organization: HubOrganization) => void;
}

export function OrganizationProfileModal({ open, organization, onClose, onSaved }: OrganizationProfileModalProps) {
  const [about, setAbout] = useState(organization.about ?? '');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(organization.coverImageUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAbout(organization.about ?? '');
      setCoverFile(null);
      setCoverPreview(organization.coverImageUrl ?? null);
      setError(null);
    }
  }, [open, organization]);

  const handleCoverChange = (file: File | null, previewUrl: string | null) => {
    setCoverFile(file);
    setCoverPreview(previewUrl);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await updateOrganizationHubProfile(organization.id, {
        about,
        coverImage: coverFile ?? undefined,
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      console.error('Failed to update organization profile', err);
      setError('Unable to update organization profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth component="form" onSubmit={handleSubmit}>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Edit Organization Profile</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          label="About"
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          multiline
          minRows={4}
          fullWidth
        />
        <CoverPhotoUploader
          value={coverPreview}
          onChange={handleCoverChange}
          disabled={saving}
          title="Cover photo"
          helperText="Use a wide image (recommended 1200 x 400 px). Drag to reposition before saving."
        />
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}


