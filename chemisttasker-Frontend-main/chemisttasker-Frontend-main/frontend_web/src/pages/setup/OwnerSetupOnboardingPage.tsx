import { useEffect, useState } from "react";
import { Alert, Box, CircularProgress, Container, Paper, Toolbar } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { Navigate } from "react-router-dom";
import OwnerOnboarding from "../onboarding/OwnerOnboarding";
import { getOwnerSetupStatus, ownerSetupPaths } from "../../utils/ownerSetup";
import { useAuth } from "../../contexts/AuthContext";
import logoBanner from "../../assets/clipsnap-edit-6-1-2026.png";

export default function OwnerSetupOnboardingPage() {
  const { user } = useAuth();
  const [nextPath, setNextPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getOwnerSetupStatus(user)
      .then((status) => {
        if (!active) return;
        if (!status.nextPath) {
          setNextPath("/dashboard/owner/overview");
          return;
        }
        if (status.nextPath && status.nextPath !== ownerSetupPaths.onboarding) {
          setNextPath(status.nextPath);
        }
      })
      .catch((err: any) => {
        if (!active) return;
        setError(err?.message || "Unable to load owner setup.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  if (nextPath) {
    return <Navigate to={nextPath} replace />;
  }

  const content = loading ? (
    <Box sx={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
      <CircularProgress />
    </Box>
  ) : error ? (
    <Box sx={{ maxWidth: 760, mx: "auto", p: 3 }}>
      <Alert severity="error">{error}</Alert>
    </Box>
  ) : (
    <Paper elevation={0} sx={{ bgcolor: "transparent", py: { xs: 2, md: 3 } }}>
      <OwnerOnboarding standalone onSuccessPath={ownerSetupPaths.pharmacies} />
    </Paper>
  );

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#F4F7FB" }}>
      <Box
        component="header"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 1100,
          bgcolor: alpha("#FFFFFF", 0.96),
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid #E5EAF3",
        }}
      >
        <Container maxWidth="xl">
          <Toolbar disableGutters sx={{ minHeight: { xs: 64, md: 72 } }}>
            <Box component="a" href="/" sx={{ display: "inline-flex", alignItems: "center" }}>
              <Box
                component="img"
                src={logoBanner}
                alt="ChemistTaskerRx Logo"
                sx={{ height: { xs: 42, md: 50 }, width: "auto", display: "block" }}
              />
            </Box>
          </Toolbar>
        </Container>
      </Box>
      {content}
    </Box>
  );
}
