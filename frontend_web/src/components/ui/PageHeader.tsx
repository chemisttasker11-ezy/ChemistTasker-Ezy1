import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

/**
 * The one header for inner dashboard pages: Outfit title, a short supporting line and actions on the right.
 * Overview (home) pages use BrandBanner instead; every other page uses this, so headers stay uniform.
 */
export default function PageHeader({
  title,
  subtitle,
  actions,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Optional row under the heading, e.g. tabs or a scope selector. */
  children?: ReactNode;
}) {
  return (
    <Box component="header" data-ct-tokens="" sx={{ mb: { xs: 2.5, md: 3 }, minWidth: 0 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "stretch", sm: "flex-start" }}
        justifyContent="space-between"
        spacing={{ xs: 1.75, sm: 3 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="h1"
            sx={{
              color: "var(--ct-text-primary)",
              fontFamily: "var(--ct-font-display)",
              fontWeight: 500,
              fontSize: { xs: 26, md: 32 },
              lineHeight: 1.15,
              letterSpacing: "-0.025em",
              overflowWrap: "anywhere",
            }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 15, lineHeight: 1.55, mt: 0.75, maxWidth: 720 }}>{subtitle}</Typography>
          )}
        </Box>
        {actions && (
          <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap sx={{ flexShrink: 0, alignItems: "center" }}>
            {actions}
          </Stack>
        )}
      </Stack>
      {children && <Box sx={{ mt: 2.25 }}>{children}</Box>}
    </Box>
  );
}
