import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { attendance } from '@chemisttasker/shared-core';
import { Box, Typography } from '@mui/material';

export default function KioskNoticeCode({ kind }: { kind: 'pairing' | 'pin' }) {
  const [params] = useSearchParams();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const authorizationId = params.get('authorization_id') || undefined;
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    attendance.getNoticeCode(kind, authorizationId).then(data => {
      if (!active) return;
      setCode(data.code);
      timer = setTimeout(() => { setCode(''); setError('This code has expired.'); },
        Math.max(0, Date.parse(data.expires_at || '') - Date.now()));
    }).catch(() => { if (active) setError('This code is unavailable or expired.'); });
    return () => { active = false; if (timer) clearTimeout(timer); setCode(''); };
  }, [kind, authorizationId]);
  return <Box sx={{ p: 4 }}>
    <Typography variant="h5">{kind === 'pairing' ? 'Kiosk pairing code' : 'Kiosk PIN verification code'}</Typography>
    <Typography>{code || error || 'Loading code…'}</Typography>
  </Box>;
}
