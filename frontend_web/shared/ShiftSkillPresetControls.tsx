'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { BookmarkPlus, RotateCcw } from 'lucide-react';
import registry from '@chemisttasker/shared-core/skills_registry.json';
import { canAutoApplySkillPreset, loadShiftSkillPreset, saveShiftSkillPreset, supportsShiftSkillPresets, type ShiftSkillPreset } from '@chemisttasker/shared-core';

export function ShiftSkillPresetControls({ initializedScopes, userId, role, required, preferred, defaultPreferred = [], editing = false, onApply }: {
  initializedScopes: Set<string>;
  userId?: number | string | null; role: string; required: string[]; preferred: string[];
  defaultPreferred?: string[]; editing?: boolean; onApply: (preset: ShiftSkillPreset) => void;
}) {
  const [savedState, setSaved] = useState<{ scope: string; preset: ShiftSkillPreset } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null);
  const scope = `${userId ?? ''}:${role}`;
  const eligible = supportsShiftSkillPresets(registry as any, role);
  const saved = savedState?.scope === scope ? savedState.preset : null;
  const generation = useRef(0);
  const latest = useRef({ scope, required, preferred, defaultPreferred, editing, onApply });
  latest.current = { scope, required, preferred, defaultPreferred, editing, onApply };

  useEffect(() => {
    let cancelled = false;
    const loadGeneration = ++generation.current;
    const initial = latest.current;
    setSaved(null);
    setNotice(null);
    setLoading(true);
    setSaving(false);
    if (userId == null || !eligible) { setLoading(false); return; }
    loadShiftSkillPreset(registry as any, userId, role).then(preset => {
      if (cancelled || latest.current.scope !== scope || generation.current !== loadGeneration) return;
      setSaved(preset ? { scope, preset } : null);
      const current = latest.current;
      const firstLoad = !initializedScopes.has(scope);
      initializedScopes.add(scope);
      if (firstLoad && preset && current.required === initial.required && current.preferred === initial.preferred && canAutoApplySkillPreset(current.editing, { required: current.required, preferred: current.preferred }, current.defaultPreferred)) {
        current.onApply(preset);
        setNotice({ message: 'Your saved selections have been applied. You can change them for this shift.', error: false });
      }
    }).catch(() => {
      if (!cancelled && latest.current.scope === scope && generation.current === loadGeneration) setNotice({ message: 'Saved selections could not be loaded in this browser.', error: true });
    }).finally(() => { if (!cancelled && latest.current.scope === scope && generation.current === loadGeneration) setLoading(false); });
    return () => { cancelled = true; generation.current++; };
  }, [userId, role, eligible, initializedScopes]);

  const save = async () => {
    if (userId == null) return;
    const savingScope = scope;
    const savingGeneration = generation.current;
    setSaving(true);
    setNotice(null);
    try {
      const preset = await saveShiftSkillPreset(registry as any, userId, role, { required, preferred });
      if (latest.current.scope !== savingScope || generation.current !== savingGeneration) return;
      setSaved({ scope, preset });
      setNotice({ message: 'Selections saved for this role in this browser.', error: false });
    } catch (error) {
      if (latest.current.scope === savingScope && generation.current === savingGeneration) setNotice({ message: error instanceof Error ? error.message : 'Unable to save selections.', error: true });
    } finally { if (latest.current.scope === savingScope && generation.current === savingGeneration) setSaving(false); }
  };

  if (!eligible) return null;
  return <Stack spacing={1}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
      <Box>
        <Typography variant="subtitle2">Your selections for {role.toLowerCase().replaceAll('_', ' ')}</Typography>
        <Typography variant="body2" color="text.secondary">Reuse your Required, Preferred and Software choices for this role. Saved in this browser.</Typography>
      </Box>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {saved && <Button variant="outlined" startIcon={<RotateCcw size={17} />} disabled={loading || saving} onClick={() => {
          onApply(saved);
          setNotice({ message: 'Saved selections applied to this shift.', error: false });
        }}>Use saved selections</Button>}
        <Button variant="contained" startIcon={<BookmarkPlus size={17} />} disabled={userId == null || !role || loading || saving} onClick={save}>
          {saving ? 'Saving…' : 'Save selections for this role'}
        </Button>
      </Stack>
    </Stack>
    {notice && <Alert severity={notice.error ? 'error' : 'success'} onClose={() => setNotice(null)}>{notice.message}</Alert>}
  </Stack>;
}
