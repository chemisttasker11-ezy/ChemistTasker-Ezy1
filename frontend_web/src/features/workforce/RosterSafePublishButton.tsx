import { useEffect, useRef, useState } from 'react';
import { Alert, Button } from '@mui/material';
import { createAsyncScope, rosterV2 } from '@chemisttasker/shared-core';
import PublishIcon from '@mui/icons-material/Publish';
import dayjs from 'dayjs';
import { fetchRosterWorkspace } from './api';
import RosterPublishReviewDialog from './RosterPublishReviewDialog';
import type { RosterWorkspaceResponse } from './types';

type Props = {
  pharmacyId: number | null;
  calendarDate: Date;
  onPublished: () => Promise<void> | void;
  size?: 'small' | 'medium' | 'large';
};

export default function RosterSafePublishButton(props: Props) {
  return <RosterSafePublishSelection key={`${props.pharmacyId}:${props.calendarDate.toISOString()}`} {...props} />;
}

function RosterSafePublishSelection({ pharmacyId, calendarDate, onPublished, size = 'small' }: Props) {
  const requestScope = useRef(createAsyncScope()).current;
  useEffect(() => {
    requestScope.activate();
    return () => requestScope.dispose();
  }, [requestScope]);
  const [workspace, setWorkspace] = useState<RosterWorkspaceResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const review = async () => {
    if (!pharmacyId) return;
    const ticket = requestScope.begin('review');
    if (!ticket.isCurrent()) return;
    setBusy(true);
    setError('');
    try {
      const selected = dayjs(calendarDate);
      const daysSinceMonday = (selected.day() + 6) % 7;
      const monday = selected.subtract(daysSinceMonday, 'day').format('YYYY-MM-DD');
      let next = await ticket.run(() => fetchRosterWorkspace(pharmacyId, monday));
      if (!next.period_id) {
        await ticket.run(() => rosterV2.initializePeriod(pharmacyId, monday));
        next = await ticket.run(() => fetchRosterWorkspace(pharmacyId, monday));
      }
      setWorkspace(next);
      setOpen(true);
    } catch (err) {
      if (ticket.isCurrent()) setError(err instanceof Error ? err.message : 'Unable to load the roster review.');
    } finally { if (ticket.isCurrent()) setBusy(false); }
  };

  return <>
    {error && <Alert severity="error">{error}</Alert>}
    <Button variant="contained" size={size} startIcon={<PublishIcon />} disabled={!pharmacyId || busy} onClick={review}>
      Review & publish
    </Button>
    <RosterPublishReviewDialog key={`${open}:${workspace?.period_id}:${workspace?.draft_revision}`} open={open} workspace={workspace} onClose={() => setOpen(false)} onPublished={onPublished} />
  </>;
}
