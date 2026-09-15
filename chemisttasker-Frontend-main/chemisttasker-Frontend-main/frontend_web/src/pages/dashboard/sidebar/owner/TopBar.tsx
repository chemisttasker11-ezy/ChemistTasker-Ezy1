// src/pages/dashboard/sidebar/owner/TopBar.tsx
import { Box, Button, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { surface } from "./types";

export default function TopBar({ onBack, breadcrumb }: { onBack?: () => void; breadcrumb?: string[] }) {
  const t = useTheme();
  const s = surface(t);
  const crumbCount = breadcrumb?.length ?? 0;
  const title = crumbCount > 0 ? breadcrumb![crumbCount - 1] : undefined;

  if (!onBack && crumbCount <= 1) {
    return null;
  }

  return (
    <Box
      position="sticky"
      top={0}
      zIndex={10}
      sx={{
        backdropFilter: "blur(6px)",
        backgroundColor: alpha(t.palette.background.paper, 0.85),
        borderBottom: `1px solid ${s.border}`,
      }}
    >
      <Box sx={{ maxWidth: 1200, mx: "auto", px: 2, py: 1.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>
        {onBack && (
          <Button variant="outlined" size="small" onClick={onBack}>
            Back
          </Button>
        )}
        {title && (
          <Typography variant="subtitle1" sx={{ color: t.palette.text.primary, fontWeight: 600 }}>
            {title}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
