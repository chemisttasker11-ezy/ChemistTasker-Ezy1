import { useCallback, useEffect, useRef, useState } from 'react';
import { getPayrollConfiguration, updatePayrollConfiguration } from '../../../../features/workforce/api';

/** Owns configuration loading and saving; late replies from another pharmacy cannot overwrite this one. */
export function usePayrollSetting(pharmacyId: number) {
  const generation = useRef(0);
  const savingRef = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [payrollEnabled, setEnabled] = useState(false);
  const [payrollReady, setReady] = useState(false);
  const [payrollLoadError, setLoadError] = useState('');
  const [payrollSaving, setSaving] = useState(false);
  const [payrollSaveError, setSaveError] = useState('');

  useEffect(() => {
    const request = ++generation.current;
    setReady(false); setLoadError(''); setSaveError(''); setSaving(false); savingRef.current = false;
    getPayrollConfiguration(pharmacyId).then(config => {
      if (request !== generation.current) return;
      setEnabled(Boolean(config.use_chemisttasker_payroll)); setReady(true);
    }).catch(() => {
      if (request === generation.current) setLoadError("The payroll setting didn't load, so it can't be changed right now.");
    });
    return () => { generation.current += 1; };
  }, [pharmacyId, attempt]);

  const handlePayrollToggle = useCallback(async (enabled: boolean) => {
    if (!payrollReady || savingRef.current) return;
    const request = generation.current;
    savingRef.current = true; setSaving(true); setSaveError('');
    try {
      const config = await updatePayrollConfiguration(pharmacyId, enabled);
      if (request === generation.current) setEnabled(Boolean(config.use_chemisttasker_payroll));
    } catch (error) {
      if (request !== generation.current) return;
      const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setSaveError(typeof detail === 'string' && detail ? detail : "The payroll setting wasn't saved. Try again.");
    } finally {
      if (request === generation.current) { savingRef.current = false; setSaving(false); }
    }
  }, [pharmacyId, payrollReady]);

  return { payrollEnabled, payrollReady, payrollLoadError, payrollSaving, payrollSaveError, handlePayrollToggle, retryPayroll: () => setAttempt(n => n + 1) };
}
