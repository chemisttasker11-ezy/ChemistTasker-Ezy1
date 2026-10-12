import { ShiftSkillPresetControls } from '../ShiftSkillPresetControls';
import ShiftRequirementsPicker from '../ShiftRequirementsPicker';
import type { Dispatch, SetStateAction } from 'react';
import { Stack } from '@mui/material';

type Setter<T> = Dispatch<SetStateAction<T>>;

type Props = {
  initializedScopes: Set<string>;
  userId?: number | string | null;
  editing?: boolean;
  defaultPreferred?: string[];
  roleNeeded: string;
  mustHave: string[];
  setMustHave: Setter<string[]>;
  niceToHave: string[];
  setNiceToHave: Setter<string[]>;
  isDarkMode: boolean;
};

/** Skills step: saved role presets, then the short-first requirements picker shared with Next. */
export default function PostShiftSkillsStep({
  initializedScopes, userId, editing, defaultPreferred, roleNeeded, mustHave, setMustHave, niceToHave, setNiceToHave,
}: Props) {
  return (
    <Stack spacing={2.5}>
      <ShiftSkillPresetControls userId={userId} role={roleNeeded} required={mustHave} preferred={niceToHave}
        initializedScopes={initializedScopes}
        editing={editing} defaultPreferred={defaultPreferred} onApply={preset => { setMustHave(preset.required); setNiceToHave(preset.preferred); }} />
      <ShiftRequirementsPicker role={roleNeeded} required={mustHave} preferred={niceToHave} pharmacySoftware={defaultPreferred}
        onChange={next => { initializedScopes.add(`${userId ?? ''}:${roleNeeded}`); setMustHave(next.required); setNiceToHave(next.preferred); }} />
    </Stack>
  );
}
