import { useEffect, useRef, useState } from 'react';
import { Alert, Button } from '@mui/material';
import { rosterV2 } from '@chemisttasker/shared-core';
import PublishIcon from '@mui/icons-material/Publish';
import dayjs from 'dayjs';
import { fetchRosterWorkspace } from './api';
import RosterPublishReviewDialog from './RosterPublishReviewDialog';
import type { RosterWorkspaceResponse } from './types';

export default function RosterSafePublishButton({
  pharmacyId,
  calendarDate,
  onPublished,
  size = 'small',
}: {
  pharmacyId: number | null;
  calendarDate: Date;
  onPublished: () => Promise<void> | void;
  size?: 'small' | 'medium' | 'large';
}) {
  const [workspace, setWorkspace] = useState<RosterWorkspaceResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scopeKey = `${pharmacyId}:${calendarDate.toISOString()}`;
  const scope = useRef(scopeKey);
  scope.current = scopeKey;
  useEffect(() => {
    setOpen(false);
    setWorkspace(null);
    setBusy(false);
    setError('');
  }, [scopeKey]);

  const review = async () => {
    if (!pharmacyId) return;
    const requestScope = scope.current;
    setBusy(true);
    setError('');
    try {
      const selected = dayjs(calendarDate);
      const daysSinceMonday = (selected.day() + 6) % 7;
      const monday = selected.subtract(daysSinceMonday, 'day').format('YYYY-MM-DD');
      let next = await fetchRosterWorkspace(pharmacyId, monday);
      if (!next.period_id) {
        await rosterV2.initializePeriod(pharmacyId, monday);
        next = await fetchRosterWorkspace(pharmacyId, monday);
      }
      if (scope.current !== requestScope) return;
      setWorkspace(next);
      setOpen(true);
    } catch (err) {
      if (scope.current === requestScope) setError(err instanceof Error ? err.message : 'Unable to load the roster review.');
    } finally { if (scope.current === requestScope) setBusy(false); }
  };

  return <>
    {error && <Alert severity="error">{error}</Alert>}
    <Button variant="contained" size={size} startIcon={<PublishIcon />} disabled={!pharmacyId || busy} onClick={review}>
      Review & publish
    </Button>
    <RosterPublishReviewDialog open={open} workspace={workspace} onClose={() => setOpen(false)} onPublished={onPublished} />
  </>;
}
