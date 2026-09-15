import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { CircularProgress, Stack, Typography } from "@mui/material";
import { Navigate } from "react-router-dom";
import { getOwnerSetupStatus } from "../utils/ownerSetup";
import { useAuth } from "../contexts/AuthContext";

export default function OwnerDashboardGate({ children }: { children: ReactElement }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [redirectPath, setRedirectPath] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getOwnerSetupStatus(user)
      .then((status) => {
        if (!active) return;
        if (status.nextPath) {
          setRedirectPath(status.nextPath);
        }
      })
      .catch(() => {
        if (!active) return;
        setRedirectPath(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  if (loading) {
    return (
      <Stack spacing={2} sx={{ py: 6, alignItems: "center", justifyContent: "center" }}>
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">
          Loading owner workspace...
        </Typography>
      </Stack>
    );
  }

  if (redirectPath) {
    return <Navigate to={redirectPath} replace />;
  }

  return children;
}
