import * as React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useAuth } from "../contexts/AuthContext";

import logoPng from "../assets/20250711_1205_Chemisttasker Badge Design_remix_01jzwbh9q5ez49phsbaz65h9cd.png";

type Props = {
  userRole: string;
  titleOverride?: string | null;
  showVerificationChip?: boolean;
};

export default function CustomAppTitle({
  userRole,
  titleOverride,
}: Props) {
  const { isAdminUser, activePersona } = useAuth();
  const theme = useTheme();
  const downSm = useMediaQuery(theme.breakpoints.down("sm"));

  const isAdminPersona = activePersona === "admin" && isAdminUser;
  const rawRole = (userRole || "").trim().toLowerCase().replace(/\s/g, "_");

  const roleTitle =
    isAdminPersona
      ? "Admin Dashboard"
      : rawRole === "owner"
      ? "Owner Dashboard"
      : rawRole === "otherstaff" || rawRole === "other_staff"
      ? "Staff Dashboard"
      : rawRole === "explorer"
      ? "Explorer"
      : "Pharmacist Dashboard";

  const displayTitle =
    titleOverride && titleOverride.trim().length > 0 ? titleOverride : roleTitle;

  return (
    <Box
      sx={{
        px: { xs: 0.25, sm: 1 },
        py: 0.5,
        display: "flex",
        alignItems: { xs: "flex-start", sm: "center" },
        gap: { xs: 1, sm: 1.5 },
        flexWrap: "wrap",
        width: "100%",
        minWidth: 0,
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={{ xs: 0.75, sm: 1.25 }}
        sx={{ minWidth: 0, flex: "1 1 auto" }}
      >
        <Box
          sx={{
            width: { xs: 32, sm: 42 },
            height: { xs: 32, sm: 42 },
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "0 0 auto",
          }}
        >
          <Box
            component="img"
            src={logoPng}
            alt="ChemistTasker"
            sx={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              objectPosition: "left center",
              borderRadius: 0,
              filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.25))",
            }}
          />
        </Box>

        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: { xs: "none", sm: "block" }, lineHeight: 1 }}
          >
            ChemistTasker
          </Typography>
          <Typography
            variant={downSm ? "body1" : "subtitle1"}
            fontWeight={800}
            noWrap
            title={displayTitle}
            sx={{ maxWidth: { xs: 180, sm: 280 } }}
          >
            {displayTitle}
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}
