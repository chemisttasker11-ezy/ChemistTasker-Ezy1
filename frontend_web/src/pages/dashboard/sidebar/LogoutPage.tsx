// The logout route can re-render when AuthContext clears the old identity.
// Start only one server-side logout: a second request could revoke the newly
// signed-in account's session during same-tab account switching.
import React from 'react';
import { Typography } from '@mui/material';
import { useAuth } from '../../../contexts/AuthContext';

export default function LogoutPage() {
  const { logout } = useAuth();
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    void logout().then((done) => {
      if (done) window.location.replace('/login');
    });
  }, [logout]);

  return <Typography>Logging out…</Typography>;
}
