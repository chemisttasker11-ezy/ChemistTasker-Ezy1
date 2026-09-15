// LogoutPage.tsx

import React from 'react';
import { Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';

export default function LogoutPage() {
  const nav = useNavigate();
  const { logout } = useAuth();

  React.useEffect(() => {
    logout();
    nav('/login', { replace: true });
  }, [logout, nav]);

  return <Typography>Logging out…</Typography>;
}
