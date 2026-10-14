// src/pages/onboardingV2/SkillsV2.tsx
import * as React from 'react';
import { SkillSymbol } from '../../../components/SkillGlyph';
import SoftwarePicker, { SOFTWARE_GROUP, roleSoftware } from '../SoftwarePicker';
import {
  Box, Stack, Typography, Checkbox, FormControlLabel, Button, Link,
  Alert, Snackbar, Chip, Divider, CircularProgress, TextField, Tabs, Tab
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { SkillEvidenceMark } from '@chemisttasker/shared-ui/VerificationBadges';

import { API_BASE_URL } from '../../../constants/api';
import { getOnboardingDetail, updateOnboardingForm } from '@chemisttasker/shared-core';
import skillsRegistry from '../../../../../shared-core/skills_registry.json';
import { searchRoleSkillGroups, normalizeSavedSkillCodes, normalizeVerification, skillId, workerSkillRole, claimModeLabel, type EvidenceState } from '@chemisttasker/shared-core';
import { useUnsavedChangesGuard } from '../../../hooks/useUnsavedChangesGuard';
import { announceOnboardingSaved } from '../OnboardingShell';


type CertRow = {
  skill_code: string;
  path: string;
  url?: string | null;
  uploaded_at?: string | null;
};

type ApiData = {
  skills?: string[];
  skill_certificates?: CertRow[];
};

export default function SkillsV2() {
  const roleKey = 'pharmacist' as const;
  const currentRole = workerSkillRole(roleKey);
  const [query, setQuery] = React.useState('');
  const tabs = React.useMemo(() => searchRoleSkillGroups(skillsRegistry as any, currentRole, query).filter(group => group.key !== SOFTWARE_GROUP).map(group => ({key: group.key, label: group.label, items: group.items})), [currentRole, query]);
  const software = React.useMemo(() => roleSoftware(currentRole, query), [currentRole, query]);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [snack, setSnack] = React.useState('');
  const [error, setError] = React.useState('');
  const [tabIndex, setTabIndex] = React.useState(0);
  const activeTabIndex = Math.min(tabIndex, Math.max(tabs.length - 1, 0));

  const [selected, setSelected] = React.useState<string[]>([]);
  const [evidence, setEvidence] = React.useState<Record<string, EvidenceState>>({}); // check state per certificate skill
  const [existingCerts, setExistingCerts] = React.useState<Record<string, CertRow>>({});
  const [pendingFiles, setPendingFiles] = React.useState<Record<string, File | null>>({}); // newly chosen (not yet uploaded)
  const unsaved = useUnsavedChangesGuard({
    disabled: loading || saving,
    value: { existingCerts, pendingFiles, selected },
  });

  const skillIndex = React.useMemo(() => new Map(skillsRegistry.skills.map(item => [item.code, item])), []);

  // Build absolute link if backend returned a relative media path
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
        setSelected(normalizeSavedSkillCodes(skillsRegistry as any, d.skills || []));
        const byCode: Record<string, CertRow> = {};
        (d.skill_certificates || []).forEach(row => { byCode[skillId(skillsRegistry as any, row.skill_code) || row.skill_code] = row; });
        setExistingCerts(byCode);
        setEvidence(normalizeVerification((d as any).verification)?.skillEvidence ?? {});
        unsaved.markClean({ existingCerts: byCode, pendingFiles: {}, selected: normalizeSavedSkillCodes(skillsRegistry as any, d.skills || []) });
      } catch (e: any) {
        setError(e.response?.data?.detail || e.message || 'Failed to load');
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
    // Optional: if unchecking, keep any previously picked file in case user re-checks quickly
  };

  const pickFileFor = (code: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setPendingFiles(prev => ({ ...prev, [code]: f }));
  };

  const hasExisting = (code: string) => Boolean(existingCerts[code]?.path);
  const hasPending = (code: string) => Boolean(pendingFiles[code]);
  const requiresCert = (code: string) => {
    const item = skillIndex.get(code) as any;
    return Boolean(item?.certificate && currentRole && !['familiarity','none'].includes(item.eligibility[currentRole]));
  };

  const pendingUrls = React.useMemo(() => Object.fromEntries(
    Object.entries(pendingFiles).filter((entry): entry is [string, File] => Boolean(entry[1]))
      .map(([code, file]) => [code, URL.createObjectURL(file)])
  ), [pendingFiles]);
  React.useEffect(() => () => Object.values(pendingUrls).forEach(url => URL.revokeObjectURL(url)), [pendingUrls]);


  // ---------- save ----------
  const save = async () => {
    setSaving(true);
    setSnack('');
    setError('');
    try {
      // Claims can be saved without evidence; verification is separate.

      const fd = new FormData();
      fd.append('tab', 'skills');
      fd.append('skills', JSON.stringify(selected));
      // Append each *checked* skill's file if user picked one this round
      selected.forEach(code => {
        const f = pendingFiles[code];
        if (f) fd.append(code, f); // serializer accepts flat "CBR" or "skill_files[CBR]"
      });

      const res = await updateOnboardingForm(roleKey, fd);

      announceOnboardingSaved(res);

      const d: ApiData = (res as any) || {};
      setSelected(normalizeSavedSkillCodes(skillsRegistry as any, d.skills || []));
      const byCode: Record<string, CertRow> = {};
      (d.skill_certificates || []).forEach(row => { byCode[skillId(skillsRegistry as any, row.skill_code) || row.skill_code] = row; });
      setExistingCerts(byCode);
      setEvidence(normalizeVerification((d as any).verification)?.skillEvidence ?? {});

      // Clear pending files that were just uploaded successfully
      setPendingFiles({});
      unsaved.markClean({ existingCerts: byCode, pendingFiles: {}, selected: normalizeSavedSkillCodes(skillsRegistry as any, d.skills || []) });

      setSnack('Skills saved.');
    } catch (e: any) {
      const resp = e.response?.data;
      setError(
        resp && typeof resp === 'object'
          ? Object.entries(resp).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`).join('\n')
          : e.message
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Typography>Loading…</Typography>;

  return (
    <Box sx={{ width: '100%' }}>
      {error && <Alert severity="error" sx={{ mb: 2, whiteSpace: 'pre-line' }}>{error}</Alert>}

      {/* Legend / guidance */}
      <Alert severity="info" sx={{ mb: 2 }}>
        Tick what you have done on the job, then the software you use: pharmacies match shifts on these. A certificate is never required. Adding one earns a Verified mark on that skill once we have checked it.
      </Alert>

      <TextField fullWidth label="Search skills or software" placeholder="Try Webster, vaccination or FRED"
        value={query} onChange={event => { setQuery(event.target.value); setTabIndex(0); }} sx={{ mb: 2 }} />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {selected.filter(code => skillIndex.get(code)?.group !== SOFTWARE_GROUP).length} skills selected. There is no minimum.
      </Typography>
      {tabs.length === 0 && software.length === 0 && currentRole && <Typography role="status" sx={{ mb: 2 }}>Nothing matches “{query.trim()}”. Try a shorter word, such as Webster, vaccination or Fred.</Typography>}
      {tabs.length > 0 && <Tabs variant="scrollable" scrollButtons="auto" aria-label="Skill categories" value={activeTabIndex} onChange={(_, next) => setTabIndex(next)} sx={{ mb: 2 }}>
        {tabs.map((tab, idx) => (
          <Tab key={tab.key} id={`skill-tab-${idx}`} aria-controls={`skill-panel-${idx}`} label={`${tab.label} (${tab.items.filter(item => selected.includes(item.code)).length})`} />
        ))}
      </Tabs>}

      {tabs.map((tab, idx) => (
        <Box key={tab.key} role="tabpanel" id={`skill-panel-${idx}`} aria-labelledby={`skill-tab-${idx}`} hidden={activeTabIndex !== idx && !query.trim()}>
          {(activeTabIndex === idx || query.trim()) && (
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
                const pendingUrl = pendingUrls[item.code] || '';

                return (
                  <Box
                    key={item.code}
                    sx={{
                      border: '1px solid',
                      borderColor: checked ? 'primary.main' : 'divider',
                      bgcolor: theme => checked && theme.palette.mode === 'light' ? '#F8F5FE' : theme.palette.background.paper,
                      borderRadius: 1.5,
                      p: 1.25,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1,
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ flexWrap: 'wrap' }}>
                      <FormControlLabel
                        sx={{ alignItems: 'flex-start', m: 0, width: '100%', '& .MuiCheckbox-root': { mt: -0.5 }, '& .MuiFormControlLabel-label': { minWidth: 0, flex: 1 } }}
                        control={<Checkbox disabled={saving} checked={checked} onChange={toggleSkill(item.code)} />}
                        label={
                          <Box>
                            <Typography variant="body1" sx={{display:'flex',alignItems:'center',gap:1.25,fontWeight:600}}><SkillSymbol skill={item.code} size={40} expressive selected={checked} />{item.label}</Typography>
                            {currentRole && claimModeLabel((item as any).eligibility[currentRole]) && <Typography variant="caption" sx={{display:'block',color:'secondary.main',fontWeight:700}}>{claimModeLabel((item as any).eligibility[currentRole])}</Typography>}
                            {item.definition && (
                              <Typography variant="body2" color="text.secondary">
                                {item.definition}
                              </Typography>
                            )}
                            {!checked && requiresCert(item.code) && <Typography variant="caption" color="text.secondary">Certificate optional · earns a Verified mark</Typography>}
                          </Box>
                        }
                      />

                      {checked && requiresCert(item.code) ? (
                        hasPending(item.code) ? (
                          <Chip icon={<UploadFileIcon />} label="File selected · save to send it for checking" size="small" />
                        ) : (
                          <SkillEvidenceMark audience="worker" skill={item.label} state={evidence[item.code] ?? (hasExisting(item.code) ? 'pending' : 'not_supplied')} />
                        )
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
                          {hasPending(item.code) ? 'Change file' : hasExisting(item.code) ? 'Replace certificate' : 'Add certificate (optional)'}
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

      <SoftwarePicker role={currentRole} items={software} selected={selected} disabled={saving}
        onToggle={code => setSelected(prev => prev.includes(code) ? prev.filter(x => x !== code) : [...prev, code])} />

      <Divider sx={{ my: 2 }} />

      <Stack direction="row" spacing={1.5} sx={{ pt: .5 }}>
        <Button variant="contained" onClick={save} disabled={saving || !currentRole}>
          {saving ? (<><CircularProgress size={18} sx={{ mr: 1 }} />Saving…</>) : 'Save Skills'}
        </Button>
      </Stack>

      <Snackbar open={!!snack} autoHideDuration={2400} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
}
