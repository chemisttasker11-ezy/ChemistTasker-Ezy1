import { Box, Button, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

export type BannerAction = { label: string; icon?: ReactNode; onClick: () => void };

// Colours sampled from the dashboard Figma welcome panel: navy -> violet -> blue,
// with one soft violet circle top-right and one blue circle along the bottom.
export const brandPanelBackground = [
  "radial-gradient(circle at 92% 12%, rgba(196, 128, 240, 0.42) 0 150px, transparent 151px)",
  "radial-gradient(circle at 60% 122%, rgba(18, 104, 214, 0.78) 0 132px, transparent 133px)",
  "linear-gradient(104deg, #02184B 0%, #1F1777 38%, #3A1BA6 66%, #4A33C2 82%, #0280D6 100%)",
].join(", ");

/** The dashboard welcome panel: greeting, one primary and one secondary action, optional side panel. */
export default function BrandBanner({
  title,
  subtitle,
  primary,
  secondary,
  aside,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  primary?: BannerAction;
  secondary?: BannerAction;
  aside?: ReactNode;
}) {
  return (
    <Box
      component="section"
      sx={{
        position: "relative",
        overflow: "hidden",
        borderRadius: { xs: "18px", md: "24px" },
        background: brandPanelBackground,
        color: "#FFFFFF",
        px: { xs: 2.5, sm: 3.5, md: 4.25 },
        py: { xs: 3, md: 4.5 },
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: aside ? "minmax(0, 1fr) minmax(260px, 320px)" : "1fr" },
        gap: { xs: 3, md: 4 },
        alignItems: "center",
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography component="h1" sx={{ fontFamily: "var(--ct-font-display)", fontWeight: 500, fontSize: { xs: 28, sm: 32, md: 38 }, lineHeight: 1.12, letterSpacing: "-0.025em", overflowWrap: "anywhere" }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography sx={{ color: "#E0DAFA", fontSize: { xs: 14, md: 15 }, lineHeight: 1.55, mt: 1.25, maxWidth: 560 }}>{subtitle}</Typography>
        )}
        {(primary || secondary) && (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ mt: { xs: 2.5, md: 3.25 } }}>
            {primary && (
              <Button
                onClick={primary.onClick}
                startIcon={primary.icon}
                sx={{
                  minHeight: 46, px: 2.5, borderRadius: "12px", bgcolor: "#FFFFFF", color: "#3C18A8", fontSize: 13.5, fontWeight: 600,
                  "& svg": { width: 18, height: 18 },
                  "&:hover": { bgcolor: "#F1EDFD" },
                  "&:focus-visible": { outline: "3px solid #FFFFFF", outlineOffset: 2 },
                }}
              >
                {primary.label}
              </Button>
            )}
            {secondary && (
              <Button
                onClick={secondary.onClick}
                startIcon={secondary.icon}
                sx={{
                  minHeight: 46, px: 2.5, borderRadius: "12px", color: "#FFFFFF", fontSize: 13.5, fontWeight: 600,
                  bgcolor: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255, 255, 255, 0.32)",
                  "& svg": { width: 18, height: 18 },
                  "&:hover": { bgcolor: "rgba(255, 255, 255, 0.16)" },
                  "&:focus-visible": { outline: "3px solid #FFFFFF", outlineOffset: 2 },
                }}
              >
                {secondary.label}
              </Button>
            )}
          </Stack>
        )}
      </Box>
      {aside && (
        <Box
          sx={{
            position: "relative",
            borderRadius: "18px",
            border: "1px solid rgba(255, 255, 255, 0.24)",
            bgcolor: "rgba(255, 255, 255, 0.10)",
            backdropFilter: "blur(6px)",
            p: { xs: 2.25, md: 3 },
            minWidth: 0,
          }}
        >
          {aside}
        </Box>
      )}
    </Box>
  );
}
