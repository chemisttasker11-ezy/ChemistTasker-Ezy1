// "Work rights in Australia" on every worker profile (self-declared; "No work rights yet" shows as a label to employers).
import React, { useState } from 'react';
import { Button, Menu } from 'react-native-paper';
import { WORK_RIGHTS_OPTIONS } from '@chemisttasker/shared-core';

export function WorkRightsMenu({ value, onChange }: { value?: string | null; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const label = WORK_RIGHTS_OPTIONS.find(option => option.value === value)?.label || 'Work rights in Australia';
  return (
    <Menu visible={open} onDismiss={() => setOpen(false)}
      anchor={<Button mode="outlined" onPress={() => setOpen(true)} accessibilityLabel={`Work rights in Australia: ${label}`}>{label}</Button>}>
      {WORK_RIGHTS_OPTIONS.map(option => (
        <Menu.Item key={option.value} title={option.label} onPress={() => { onChange(option.value); setOpen(false); }} />
      ))}
    </Menu>
  );
}
