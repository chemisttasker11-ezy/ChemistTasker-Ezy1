import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ahpraCooldownSeconds, getOnboardingDetail, recheckAhpra, subscribeAhpraErrors, type AhpraSummary } from '@chemisttasker/shared-core';

type Recovery = {
  summary: AhpraSummary | null; loading: boolean; error: string; busy: boolean; seconds: number;
  refusal: boolean; clearRefusal: () => void; refresh: () => Promise<void>; recheck: () => Promise<void>;
};
const Context = createContext<Recovery | null>(null);

export function AhpraProvider({ user, children }: { user: { id?: number; role: string } | null; children: React.ReactNode }) {
  const role = user?.role === 'PHARMACIST' ? 'pharmacist' : user?.role === 'OTHER_STAFF' ? 'otherstaff' : user?.role === 'OWNER' ? 'owner' : null;
  const errorVersion = useRef(0);
  // Bumped on logout/user switch so a pending poll cannot write into the next user's state.
  const generation = useRef(0);
  const [summary, setSummary] = useState<AhpraSummary | null>(null);
  const [loading, setLoading] = useState(Boolean(role));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState(false);
  const [queuedUntil, setQueuedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const clearRefusal = useCallback(() => setRefusal(false), []);
  const refresh = useCallback(async () => {
    if (!role) return;
    const version = errorVersion.current;
    const current = generation.current;
    const data = await getOnboardingDetail(role);
    if (version === errorVersion.current && current === generation.current) { setSummary(data.ahpra ?? null); setError(''); if (!data.ahpra?.frozen) setRefusal(false); }
  }, [role]);

  useEffect(() => {
    let active = true;
    generation.current += 1;
    setSummary(null);
    setQueuedUntil(0);
    setError('');
    setRefusal(false);
    setBusy(false);
    setLoading(Boolean(role));
    if (!role) return;
    const load = async () => {
      try {
        const version = errorVersion.current;
        const data = await getOnboardingDetail(role);
        // An unfrozen server summary is authoritative, so it ends an earlier runtime refusal.
        if (active && version === errorVersion.current) { setSummary(data.ahpra ?? null); setError(''); if (!data.ahpra?.frozen) setRefusal(false); }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load AHPRA status.');
      } finally {
        if (active) setLoading(false);
      }
    };
    const unsubscribe = subscribeAhpraErrors(value => {
      errorVersion.current += 1;
      if (value.code === 'ahpra_recheck_cooldown') {
        setNow(Date.now());
        const available = new Date(Date.now() + Math.max(0, Number(value.retry_after) || 0) * 1000).toISOString();
        setSummary(previous => previous ? { ...previous, recheck_available_at: available } : previous);
        return;
      }
      setSummary(previous => ({
        attempts: 0, contact_support: false, registration_status: null, registration_type: null, expiry_date: null, checked_at: null, recheck_available_at: null,
        ...previous, state: value.code === 'ahpra_unreadable' ? 'unreadable' : value.code === 'ahpra_suspended' ? 'suspended' : value.code === 'ahpra_rejected' ? 'rejected' : 'not_found', note: value.detail || '', frozen: role !== 'owner' && value.code !== 'ahpra_unreadable' && Boolean(value.frozen),
      }));
      // Only the account freeze sends frozen; a member refused on a public shift stays where they are.
      setRefusal(role !== 'owner' && value.code !== 'ahpra_unreadable' && Boolean(value.frozen));
      if (value.code === 'ahpra_unreadable') void load();
    });
    void load();
    return () => { active = false; generation.current += 1; unsubscribe(); };
  }, [role, user?.id]);

  useEffect(() => {
    // A first check has no cooldown; give it a bounded five-minute polling window.
    const until = Math.max(Date.parse(summary?.recheck_available_at ?? '') || 0, queuedUntil, summary?.state === 'pending' ? Date.now() + 300000 : 0);
    if ((summary?.state !== 'pending' && summary?.state !== 'suspended' && summary?.state !== 'not_found' && summary?.state !== 'unreadable') || !(until > Date.now())) return;
    const timer = setInterval(() => {
      // The last tick still refreshes so a lookup that finished near expiry shows up.
      void refresh().catch(() => {});
      if (Date.now() >= until) clearInterval(timer);
    }, 15000);
    return () => clearInterval(timer);
  }, [summary?.state, summary?.recheck_available_at, queuedUntil, refresh]);

  useEffect(() => {
    // Hidden tabs throttle timers; refresh on return so a finished lookup is not missed.
    if (summary?.state !== 'pending' && summary?.state !== 'suspended' && summary?.state !== 'not_found' && summary?.state !== 'unreadable') return;
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh().catch(() => {}); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [summary?.state, refresh]);

  useEffect(() => {
    if (!summary?.recheck_available_at) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [summary?.recheck_available_at]);

  const recheck = async () => {
    setBusy(true);
    setNow(Date.now());
    setError('');
    try {
      await recheckAhpra();
      setQueuedUntil(Date.now() + 3600000);
      // Keep a suspension visible until the backend reports the finished lookup.
      setSummary(previous => previous && previous.state !== 'unreadable' ? { ...previous, recheck_available_at: new Date(Date.now() + 3600000).toISOString() } : previous);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to queue AHPRA check.');
    } finally { setBusy(false); }
  };
  return <Context.Provider value={{ summary, loading, error, busy, seconds: summary?.state === 'unreadable' && summary.attempts < 3 ? 0 : ahpraCooldownSeconds(summary?.recheck_available_at, now), refusal, clearRefusal, refresh, recheck }}>{children}</Context.Provider>;
}

export function useAhpra() {
  const context = useContext(Context);
  if (!context) throw new Error('useAhpra must be used within AhpraProvider');
  return context;
}
