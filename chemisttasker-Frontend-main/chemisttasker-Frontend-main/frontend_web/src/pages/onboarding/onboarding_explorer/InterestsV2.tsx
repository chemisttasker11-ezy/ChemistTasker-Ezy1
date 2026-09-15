import * as React from 'react';
import { Box, Typography, Checkbox, FormControlLabel, Button, Alert, Snackbar } from '@mui/material';
import { getOnboardingDetail, updateOnboardingForm } from '@chemisttasker/shared-core';
import { useUnsavedChangesGuard } from '../../../hooks/useUnsavedChangesGuard';

const INTEREST_CHOICES: Array<{ value: string; label: string }> = [
  { value: 'SHADOWING',    label: 'Shadowing' },
  { value: 'VOLUNTEERING', label: 'Volunteering' },
  { value: 'PLACEMENT',    label: 'Placement' },
  { value: 'JUNIOR_ASSIST',label: 'Junior assistant role' },
];

type ApiData = {
  interests?: string[];
};

export default function InterestsV2() {
  const roleKey = 'explorer';

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [snack, setSnack] = React.useState('');
  const [error, setError] = React.useState('');
  const [selected, setSelected] = React.useState<string[]>([]);
  const unsaved = useUnsavedChangesGuard({
    disabled: loading || saving,
    value: selected,
  });

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true); setError('');
      try {
        const res = await getOnboardingDetail(roleKey);
        if (!mounted) return;
        const d: ApiData = (res as any) || {};
        setSelected(d.interests || []);
        unsaved.markClean(d.interests || []);
      } catch (e: any) {
        setError(e?.response?.data?.detail || e.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [roleKey]);

  const toggle = (code: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setSelected(prev => checked ? [...new Set([...prev, code])] : prev.filter(x => x !== code));
  };

  const save = async () => {
    setSaving(true); setSnack(''); setError('');
    try {
      const fd = new FormData();
      fd.append('tab', 'interests');
      fd.append('interests', JSON.stringify(selected));
      const res = await updateOnboardingForm(roleKey, fd);
      const d: ApiData = (res as any) || {};
      setSelected(d.interests || []);
      unsaved.markClean(d.interests || []);
      setSnack('Interests saved.');
    } catch (e: any) {
      const resp = e?.response?.data;
      setError(
        resp && typeof resp === 'object'
          ? Object.entries(resp).map(([k, v]) => `${k}: ${(v as any[]).join(', ')}`).join('\n')
          : e.message || 'Failed to save'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Typography>Loading…</Typography>;

  return (
    <Box sx={{ width: '100%', maxWidth: 960, px: { xs: 2, md: 3 }, pb: 3 }}>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
        Interests
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2, whiteSpace: 'pre-line' }}>{error}</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.25, mb: 2 }}>
        {INTEREST_CHOICES.map(opt => (
          <FormControlLabel
            key={opt.value}
            control={<Checkbox checked={selected.includes(opt.value)} onChange={toggle(opt.value)} />}
            label={opt.label}
          />
        ))}
      </Box>

      <Button variant="contained" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>

      <Snackbar open={!!snack} autoHideDuration={2400} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
}
