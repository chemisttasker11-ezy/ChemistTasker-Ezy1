import { useState } from 'react';
import { Button } from '@mui/material';
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

  const review = async () => {
    if (!pharmacyId) return;
    setBusy(true);
    try {
      const selected = dayjs(calendarDate);
      const daysSinceMonday = (selected.day() + 6) % 7;
      const monday = selected.subtract(daysSinceMonday, 'day').format('YYYY-MM-DD');
      const next = await fetchRosterWorkspace(pharmacyId, monday);
      setWorkspace(next);
      setOpen(true);
    } finally { setBusy(false); }
  };

  return <>
    <Button variant="contained" size={size} startIcon={<PublishIcon />} disabled={!pharmacyId || busy} onClick={review}>
      Review & publish
    </Button>
    <RosterPublishReviewDialog open={open} workspace={workspace} onClose={() => setOpen(false)} onPublished={onPublished} />
  </>;
}
