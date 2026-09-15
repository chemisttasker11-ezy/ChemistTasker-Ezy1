// src/pages/onboardingV2/ProfileV2.tsx
import * as React from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  Snackbar,
  CircularProgress,
  Link,
  Stack,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DescriptionIcon from '@mui/icons-material/Description';

import { API_BASE_URL } from '../../../constants/api';
import { getOnboardingDetail, updateOnboardingForm } from '@chemisttasker/shared-core';
import { useUnsavedChangesGuard } from '../../../hooks/useUnsavedChangesGuard';

type ApiData = {
  short_bio?: string | null;
  resume?: string | null; // DRF usually returns absolute URL; if relative, we prefix
};

export default function ProfileV2() {
  const roleKey = 'explorer';

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [snack, setSnack] = React.useState('');

  const [shortBio, setShortBio] = React.useState('');
  const [resumeExistingUrl, setResumeExistingUrl] = React.useState<string>('');
  const [resumePending, setResumePending] = React.useState<File | null>(null);
  const unsaved = useUnsavedChangesGuard({
    disabled: loading || saving,
    value: { resumeExistingUrl, resumePending, shortBio },
  });

  const getFileUrl = (path?: string | null) =>
    path ? (path.startsWith('http') ? path : `${API_BASE_URL}${path}`) : '';

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await getOnboardingDetail(roleKey);
        if (!mounted) return;
        const d: ApiData = (res as any) || {};
        setShortBio(d.short_bio || '');
        const nextResumeUrl = getFileUrl(d.resume || '');
        setResumeExistingUrl(nextResumeUrl);
        unsaved.markClean({
          resumeExistingUrl: nextResumeUrl,
          resumePending: null,
          shortBio: d.short_bio || '',
        });
      } catch (e: any) {
        setError(e.response?.data?.detail || e.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [roleKey]);

  const onPickResume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setResumePending(f);
  };

  const pendingPreviewUrl = React.useMemo(
    () => (resumePending ? URL.createObjectURL(resumePending) : ''),
    [resumePending]
  );

  const save = async () => {
    setSaving(true);
    setError('');
    setSnack('');
    try {
      const fd = new FormData();
      fd.append('tab', 'profile');
      fd.append('short_bio', shortBio ?? '');
      if (resumePending) {
        fd.append('resume', resumePending);
      }
      const res = await updateOnboardingForm(roleKey, fd);

      const d: ApiData = (res as any) || {};
      setShortBio(d.short_bio || '');
      const nextResumeUrl = getFileUrl(d.resume || '');
      setResumeExistingUrl(nextResumeUrl);
      setResumePending(null);
      unsaved.markClean({
        resumeExistingUrl: nextResumeUrl,
        resumePending: null,
        shortBio: d.short_bio || '',
      });
      setSnack('Profile saved.');
    } catch (e: any) {
      const resp = e.response?.data;
      setError(
        resp && typeof resp === 'object'
          ? Object.entries(resp)
              .map(([k, v]) => `${k}: ${(v as any[]).join(', ')}`)
              .join('\n')
          : e.message
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Typography>Loading…</Typography>;

  return (
    <Box sx={{ width: '100%', maxWidth: 960, px: { xs: 2, md: 3 }, pb: 3 }}>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
        Profile
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2, whiteSpace: 'pre-line' }}>
          {error}
        </Alert>
      )}

      <Stack spacing={2}>
        {/* Short note */}
        <TextField
          label="Short note"
          placeholder="Add a short note about you…"
          multiline
          minRows={4}
          value={shortBio}
          onChange={(e) => setShortBio(e.target.value)}
          fullWidth
        />

        {/* Resume uploader */}
        <Box
          sx={{
            p: 2,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1.5,
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            Resume
          </Typography>

          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              size="small"
              component="label"
              startIcon={<UploadFileIcon />}
            >
              {resumePending ? 'Change file' : 'Upload resume'}
              <input
                hidden
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={onPickResume}
              />
            </Button>

            {/* View current (from storage) */}
            {resumeExistingUrl && !resumePending && (
              <Link href={resumeExistingUrl} target="_blank" rel="noopener noreferrer">
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <DescriptionIcon fontSize="small" />
                  <span>View current</span>
                </Stack>
              </Link>
            )}

            {/* Preview just-picked file */}
            {resumePending && (
              <Link href={pendingPreviewUrl} target="_blank" rel="noopener noreferrer">
                Preview selected
              </Link>
            )}
          </Stack>
        </Box>

        <Box>
          <Button variant="contained" onClick={save} disabled={saving}>
            {saving ? (
              <>
                <CircularProgress size={18} sx={{ mr: 1 }} />
                Saving…
              </>
            ) : (
              'Save Profile'
            )}
          </Button>
        </Box>
      </Stack>

      <Snackbar
        open={!!snack}
        autoHideDuration={2400}
        onClose={() => setSnack('')}
        message={snack}
      />
    </Box>
  );
}
