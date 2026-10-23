'use client';

import { useEffect, useRef, useState } from 'react';
import type { TextFieldProps } from '@mui/material';
import { DatePicker, DateTimePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/en-au';

export type AuDateFieldProps = Omit<TextFieldProps, 'value' | 'onChange' | 'type' | 'defaultValue'> & {
  value: string;
  onChange: (value: string) => void;
  minDate?: string;
  maxDate?: string;
};

function parse(value: string): Dayjs | null {
  if (!value) return null;
  const date = dayjs(value);
  return date.isValid() ? date : null;
}

function AuField({ value, onChange, minDate, maxDate, inputProps, InputLabelProps, label, disabled, dateTime = false, ...textFieldProps }: AuDateFieldProps & { dateTime?: boolean }) {
  const [draft, setDraft] = useState(() => parse(value));
  const emitted = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Parent echoes of invalid/partial edits must not erase the picker's draft.
    if (value === emitted.current) return;
    emitted.current = undefined;
    const next = parse(value);
    if (!value || next) setDraft(next);
  }, [value]);

  const { min, max, ...restInputProps } = inputProps ?? {};
  const minimum = parse(minDate ?? min ?? '');
  const maximum = parse(maxDate ?? max ?? '');
  const props = {
    label,
    disabled,
    value: draft,
    enableAccessibleFieldDOMStructure: false as const,
    ...(minimum ? { minDate: minimum } : {}),
    ...(maximum ? { maxDate: maximum } : {}),
    onChange: (next: Dayjs | null, context: { validationError: unknown }) => {
      setDraft(next);
      const iso = next?.isValid() && !context.validationError
        ? next.format(dateTime ? 'YYYY-MM-DDTHH:mm' : 'YYYY-MM-DD')
        : '';
      emitted.current = iso;
      onChange(iso);
    },
    slotProps: {
      textField: {
        ...textFieldProps,
        inputProps: restInputProps,
        InputLabelProps: { ...InputLabelProps, shrink: true },
      },
    },
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="en-au">
      {dateTime
        ? <DateTimePicker {...props} format="DD/MM/YYYY HH:mm" ampm={false} minDateTime={minimum ?? undefined} maxDateTime={maximum ?? undefined} />
        : <DatePicker {...props} format="DD/MM/YYYY" />}
    </LocalizationProvider>
  );
}

export function AuDateField(props: AuDateFieldProps) {
  return <AuField {...props} />;
}

export function AuDateTimeField(props: AuDateFieldProps) {
  return <AuField {...props} dateTime />;
}
