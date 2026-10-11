// frontend_web/src/pages/onboarding_staff/SkillsV2.tsx
import * as React from 'react';
import {
  Box, Stack, Typography, Checkbox, FormControlLabel, Button, Link,
  Alert, Snackbar, Chip, Divider, CircularProgress, TextField, MenuItem, Tabs, Tab
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';

import { API_BASE_URL } from '../../../constants/api';
import { getOnboardingDetail, updateOnboardingForm } from '@chemisttasker/shared-core';
import skillsRegistry from '../../../../../shared-core/skills_registry.json';
import { roleSkillGroups, workerSkillRole, claimModeLabel, legacySkillCodes } from '@chemisttasker/shared-core';
import { useUnsavedChangesGuard } from '../../../hooks/useUnsavedChangesGuard';

type SkillItem = {
  code: string;
  label: string;
  description?: string;
  requires_certificate?: boolean;
};


// ---- Legacy-style Years of Experience (string values; keep exactly as backend expects) ----
const YEARS_EXPERIENCE_CHOICES: Array<{ value: string; label: string }> = [
  { value: '',        label: 'Select years of experience' },
  { value: '0-1',     label: '0–1 years' },
  { value: '1-2',     label: '1–2 years' },
  { value: '2-3',     label: '2–3 years' },
  { value: '3-5',     label: '3–5 years' },
  { value: '5+',      label: '5+ years' },
];

type CertRow = {
  skill_code: string;
  path: string;
  url?: string | null;
  uploaded_at?: string | null;
};

type ApiData = {
  years_experience?: string | null;
  skills?: string[];
  skill_certificates?: CertRow[];
};

export default function SkillsV2() {
  const roleKey = 'otherstaff' as const;
  const [staffSubtype, setStaffSubtype] = React.useState<string | null>(null);
  const currentRole = workerSkillRole(roleKey, staffSubtype);
  const tabs = React.useMemo(() => roleSkillGroups(skillsRegistry as any, currentRole).map(group => ({key: group.key, label: group.label, items: group.items})), [currentRole]);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [snack, setSnack] = React.useState('');
  const [error, setError] = React.useState('');
  const [tabIndex, setTabIndex] = React.useState(0);

  const [yearsExperience, setYearsExperience] = React.useState<string>('');
  const [selected, setSelected] = React.useState<string[]>([]);
  const legacySkills = React.useMemo(() => legacySkillCodes(skillsRegistry as any, currentRole, selected), [currentRole, selected]);
  const [existingCerts, setExistingCerts] = React.useState<Record<string, CertRow>>({});
  const [pendingFiles, setPendingFiles] = React.useState<Record<string, File | null>>({}); // newly chosen (not yet uploaded)
  const unsaved = useUnsavedChangesGuard({
    disabled: loading || saving,
    value: { existingCerts, pendingFiles, selected, yearsExperience },
  });

  const skillIndex = React.useMemo(() => new Map(tabs.flatMap(group => group.items).map(item => [item.code, item])), [tabs]);

  const getFileUrl = (path?: string | null) =>
    path ? (path.startsWith('http') ? path : `${API_BASE_URL}${path}`) : '';

  // ---------- load ----------
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await getOnboardingDetail(roleKey);
        if (!mounted) return;
        const d: ApiData = (res as any) || {};
        setYearsExperience(d.years_experience || '');
        setStaffSubtype((d as any).role_type || null);
        setSelected(d.skills || []);
        const byCode: Record<string, CertRow> = {};
        (d.skill_certificates || []).forEach(row => { byCode[row.skill_code] = row; });
        setExistingCerts(byCode);
        unsaved.markClean({
          existingCerts: byCode,
          pendingFiles: {},
          selected: d.skills || [],
          yearsExperience: d.years_experience || '',
        });
      } catch (e: any) {
        setError(e?.response?.data?.detail || e.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [roleKey]);

  // ---------- interactions ----------
  const toggleSkill = (code: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setSelected(prev => checked ? [...new Set([...prev, code])] : prev.filter(x => x !== code));
  };

  const pickFileFor = (code: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setPendingFiles(prev => ({ ...prev, [code]: f }));
  };

  const hasExisting = (code: string) => Boolean(existingCerts[code]?.path);
  const hasPending = (code: string) => Boolean(pendingFiles[code]);
  const requiresCert = (code: string) => Boolean((skillIndex.get(code) as any)?.certificate);
  const previewPendingUrl = (code: string) => {
    const f = pendingFiles[code];
    return f ? URL.createObjectURL(f) : '';
  };

  const validateClientSide = (): string[] => {
    // If a skill is checked, the user must either have an existing cert OR pick a new file now.
    const missing = selected.filter(code => requiresCert(code) && !hasExisting(code) && !hasPending(code));
    return missing;
  };

  // ---------- save ----------
  const save = async () => {
    setSaving(true);
    setSnack('');
    setError('');
    try {
      // client precheck
      const missing = validateClientSide();
      if (missing.length) {
        setError(`Please upload a certificate for: ${missing.join(', ')}`);
        setSaving(false);
        return;
      }

      const fd = new FormData();
      fd.append('tab', 'skills');
      fd.append('skills', JSON.stringify(selected));
      fd.append('years_experience', yearsExperience || '');

      // append uploaded files only for checked skills (if chosen this round)
      selected.forEach(code => {
        const f = pendingFiles[code];
        if (f) fd.append(code, f); // accepted by your serializer flat or as skill_files[CODE]
      });

      const res = await updateOnboardingForm(roleKey, fd);

      const d: ApiData = (res as any) || {};
      setYearsExperience(d.years_experience || '');
      setSelected(d.skills || []);
      const byCode: Record<string, CertRow> = {};
      (d.skill_certificates || []).forEach(row => { byCode[row.skill_code] = row; });
      setExistingCerts(byCode);

      // clear pending files that just uploaded
      setPendingFiles(prev => {
        const next = { ...prev };
        selected.forEach(code => { if (next[code]) delete next[code]; });
        return next;
      });
      unsaved.markClean({
        existingCerts: byCode,
        pendingFiles: {},
        selected: d.skills || [],
        yearsExperience: d.years_experience || '',
      });

      setSnack('Skills saved.');
    } catch (e: any) {
      const resp = e.response?.data;
      setError(
        resp && typeof resp === 'object'
          ? Object.entries(resp).map(([k, v]) => `${k}: ${(v as any[]).join(', ')}`).join('\n')
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
        Skills & Experience
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2, whiteSpace: 'pre-line' }}>{error}</Alert>}

      {/* Years of experience (legacy) */}
      <TextField
        select
        fullWidth
        label="Years of Experience"
        value={yearsExperience}
        onChange={(e) => setYearsExperience(e.target.value)}
        sx={{ mb: 2 }}
      >
        {YEARS_EXPERIENCE_CHOICES.map(opt => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </TextField>

      {legacySkills.length > 0 && <Alert severity="warning" sx={{mb:2}}>Previous skills are retained for audit but some are not available for your current role. Save only after reviewing your selections.</Alert>}
      {!currentRole && <Alert severity="warning" sx={{mb:2}}>Select your staff role in Regulatory Docs before claiming professional skills.</Alert>}
      {/* Guidance */}
      <Alert severity="info" sx={{ mb: 2 }}>
        Claim only skills you can perform within your role. Supervised and familiarity claims are labelled. Training documents are required only for marked activities.
      </Alert>

      <Tabs value={Math.min(tabIndex, Math.max(tabs.length - 1, 0))} onChange={(_, next) => setTabIndex(next)} sx={{ mb: 2 }}>
        {tabs.map(tab => (
          <Tab key={tab.key} label={tab.label} />
        ))}
      </Tabs>

      {tabs.map((tab, idx) => (
        <Box key={tab.key} role="tabpanel" hidden={tabIndex !== idx}>
          {tabIndex === idx && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr', md: '1fr 1fr' },
                gap: 1.5,
              }}
            >
              {tab.items.map(item => {
                const checked = selected.includes(item.code);
                const existingUrl = getFileUrl(existingCerts[item.code]?.url || existingCerts[item.code]?.path);
                const pendingUrl = previewPendingUrl(item.code);
                const needsFile = checked && requiresCert(item.code) && !hasExisting(item.code) && !hasPending(item.code);

                return (
                  <Box
                    key={item.code}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1.5,
                      p: 1.25,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1,
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ flexWrap: 'wrap' }}>
                      <FormControlLabel
                        control={<Checkbox checked={checked} onChange={toggleSkill(item.code)} />}
                        label={
                          <Box>
                            <Typography variant="body1" sx={{display:'flex',alignItems:'center',gap:1}}><span role="img" aria-label={item.label}>{(item as any).icon}</span>{item.label}</Typography>
                            {currentRole && claimModeLabel((item as any).eligibility[currentRole]) && <Typography variant="caption" sx={{display:'block',color:'secondary.main',fontWeight:700}}>{claimModeLabel((item as any).eligibility[currentRole])}</Typography>}
                            {item.description && (
                              <Typography variant="body2" color="text.secondary">
                                {item.description}
                              </Typography>
                            )}
                          </Box>
                        }
                      />

                      {checked && requiresCert(item.code) ? (
                        hasPending(item.code) ? (
                          <Chip icon={<UploadFileIcon />} label="File selected" size="small" />
                        ) : hasExisting(item.code) ? (
                          <Chip icon={<CheckCircleOutlineIcon />} color="success" variant="outlined" label="On file" size="small" />
                        ) : needsFile ? (
                          <Chip icon={<HourglassBottomIcon />} color="warning" variant="outlined" label="Certificate required" size="small" />
                        ) : null
                      ) : null}
                    </Stack>

                    {checked && requiresCert(item.code) && (
                      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                        <Button
                          variant="outlined"
                          size="small"
                          component="label"
                          startIcon={<UploadFileIcon />}
                        >
                          {hasPending(item.code) ? 'Change file' : 'Upload certificate'}
                          <input
                            hidden
                            type="file"
                            accept="image/*,.pdf"
                            onChange={pickFileFor(item.code)}
                          />
                        </Button>

                        {hasExisting(item.code) && (
                          <Link href={existingUrl} target="_blank" rel="noopener noreferrer">
                            View current
                          </Link>
                        )}

                        {hasPending(item.code) && (
                          <Link href={pendingUrl} target="_blank" rel="noopener noreferrer">
                            Preview selected
                          </Link>
                        )}
                      </Stack>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      ))}

      <Divider sx={{ my: 2 }} />

      <Stack direction="row" spacing={1.5} sx={{ pt: .5 }}>
        <Button variant="contained" onClick={save} disabled={saving}>
          {saving ? (<><CircularProgress size={18} sx={{ mr: 1 }} />Saving…</>) : 'Save'}
        </Button>
      </Stack>

      <Snackbar open={!!snack} autoHideDuration={2400} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
}
