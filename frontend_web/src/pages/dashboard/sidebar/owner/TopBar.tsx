// src/pages/dashboard/sidebar/owner/TopBar.tsx
import { Box, Button, Stack, Typography } from "@mui/material";
import { ArrowLeft, ChevronRight } from "lucide-react";

/** Breadcrumb back-link above a detail view: "← My Pharmacies › Harbour Health Pharmacy". */
export default function TopBar({ onBack, breadcrumb }: { onBack?: () => void; breadcrumb?: string[] }) {
  const crumbs = breadcrumb ?? [];
  if (!onBack && crumbs.length <= 1) {
    return null;
  }
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : "Back";
  const current = crumbs.length > 0 ? crumbs[crumbs.length - 1] : undefined;

  return (
    <Box component="nav" aria-label="Breadcrumb" data-ct-tokens="" sx={{ width: "100%", maxWidth: 1240, mx: "auto", px: { xs: 0, sm: 1.5, md: 2 }, pt: { xs: 1.5, md: 2 } }}>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
        {onBack ? (
          <Button
            onClick={onBack}
            startIcon={<ArrowLeft size={16} />}
            sx={{ minHeight: 36, px: 1.25, ml: -1.25, color: "var(--ct-text-secondary)", fontWeight: 600, "&:hover": { color: "var(--ct-accent-strong)", bgcolor: "var(--ct-subtle-bg)" } }}
          >
            {parent}
          </Button>
        ) : null}
        {current && crumbs.length > 1 ? (
          <>
            <ChevronRight size={16} color="var(--ct-text-muted)" aria-hidden="true" />
            <Typography noWrap aria-current="page" sx={{ color: "var(--ct-text-primary)", fontWeight: 600, fontSize: 14, minWidth: 0 }}>
              {current}
            </Typography>
          </>
        ) : null}
      </Stack>
    </Box>
  );
}
