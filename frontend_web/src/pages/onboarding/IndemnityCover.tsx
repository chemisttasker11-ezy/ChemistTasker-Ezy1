import * as React from 'react';
import { Alert, Box, Button, Chip, Stack, TextField, Typography } from '@mui/material';
import { getOnboardingDetail, updateOnboardingForm, type OnboardingApi } from '@chemisttasker/shared-core';

export default function IndemnityCover({ role }: { role: 'pharmacist' | 'otherstaff' }) {
  const [data, setData] = React.useState<OnboardingApi>({});
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState('');
  const [loaded, setLoaded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { let active = true; getOnboardingDetail(role).then(d => { if (active) { setData(d); setLoaded(true); } }).catch(() => { if (active) setError('Could not load cover.'); }); return () => { active = false; }; }, [role]);
  const save = async () => {
    setSaving(true); setError('');
    try {
      const form = new FormData();
      form.append('tab', role === 'pharmacist' ? 'profile' : 'regulatory');
      form.append('indemnity_insurer', data.indemnity_insurer || '');
      form.append('indemnity_expiry', data.indemnity_expiry || '');
      if (file) form.append('indemnity_certificate', file);
      setData(await updateOnboardingForm(role, form) as OnboardingApi); setFile(null);
    } catch { setError('Could not save cover. Check the expiry date and try again.'); } finally { setSaving(false); }
  };
  const label = data.indemnity_status === 'shown' ? 'Cover shown' : data.indemnity_status === 'expired' ? 'Cover expired' : 'No cover added';
  return <Box component="section"><Stack spacing={1.5}>
    <Typography variant="subtitle1">Professional indemnity cover</Typography><Box><Chip size="small" label={label} /></Box>
    <Typography variant="body2">Optional. Managers can see whether you have shown cover.</Typography>
    <TextField label="Insurer" value={data.indemnity_insurer || ''} onChange={e => setData({ ...data, indemnity_insurer: e.target.value })} />
    <TextField label="Expiry date" type="date" InputLabelProps={{ shrink: true }} value={data.indemnity_expiry || ''} onChange={e => setData({ ...data, indemnity_expiry: e.target.value })} />
    <Button component="label" variant="outlined">{file ? file.name : data.indemnity_certificate ? 'Replace certificate' : 'Add certificate'}<input hidden type="file" accept="image/*,.pdf,.doc,.docx" onChange={e => setFile(e.target.files?.[0] || null)} /></Button>
    {error && <Alert severity="error">{error}</Alert>}<Box><Button variant="outlined" onClick={save} disabled={saving || !loaded}>Save cover</Button></Box>
  </Stack></Box>;
}
