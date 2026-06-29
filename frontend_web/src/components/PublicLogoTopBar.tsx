import { Box, Container, Toolbar } from "@mui/material";
import logoBanner from "../assets/clipsnap-edit-6-1-2026.png";

export default function PublicLogoTopBar() {
  return (
    <Box
      component="header"
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 1100,
        backgroundColor: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(10px)",
        boxShadow: "none",
        borderBottom: "1px solid #e2e8f0",
      }}
    >
      <Container maxWidth="xl">
        <Toolbar disableGutters sx={{ justifyContent: "space-between" }}>
          <a href="/" style={{ display: "flex", alignItems: "center" }}>
            <img
              src={logoBanner}
              alt="ChemistTaskerRx Logo"
              style={{ height: "48px", width: "auto" }}
            />
          </a>
          <Box />
        </Toolbar>
      </Container>
    </Box>
  );
}
