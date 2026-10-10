import { Box, ButtonBase, Paper, Stack, Typography } from "@mui/material";
import { useId, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";

/** Figma "View all shifts →" style link: bold deep-violet text with an arrow. */
export function ViewAllLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        alignSelf: "flex-start",
        gap: 1,
        minHeight: 44,
        px: 0.25,
        borderRadius: "8px",
        color: "var(--ct-accent-strong)",
        fontSize: 13,
        fontWeight: 600,
        "& svg": { width: 16, height: 16, transition: "transform 160ms ease" },
        "&:hover svg": { transform: "translateX(2px)" },
        "&:focus-visible": { outline: "2px solid var(--ct-accent-strong)", outlineOffset: 2 },
        "@media (prefers-reduced-motion: reduce)": { "& svg": { transition: "none" } },
      }}
    >
      {children}
      <ArrowRight aria-hidden="true" />
    </ButtonBase>
  );
}

/** White Figma card: 20px radius, hairline border, Outfit title with an optional outline icon. */
export default function SectionCard({
  title,
  icon,
  subtitle,
  action,
  children,
  dense = false,
  flush = false,
  component = "section",
}: {
  title?: ReactNode;
  icon?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  dense?: boolean;
  /** Body runs edge to edge (lists with their own row padding); the header keeps the card padding. */
  flush?: boolean;
  component?: "section" | "div";
}) {
  const titleId = useId();
  const pad = dense ? { xs: 2, md: 2.25 } : { xs: 2.25, md: 3 };
  return (
    <Paper
      component={component}
      variant="outlined"
      aria-labelledby={title && component === "section" ? titleId : undefined}
      sx={{
        p: flush ? 0 : pad,
        overflow: flush ? "hidden" : undefined,
        borderRadius: "var(--ct-card-radius)",
        borderColor: "var(--ct-border-color)",
        bgcolor: "var(--ct-surface-bg)",
        boxShadow: "none",
        minWidth: 0,
      }}
    >
      {(title || action) && (
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1.5} sx={{ mb: subtitle ? 2 : 1.75, ...(flush ? { px: pad, pt: pad } : {}) }}>
          <Box sx={{ minWidth: 0 }}>
            {title && (
              <Stack direction="row" spacing={1.1} alignItems="center">
                {icon && (
                  <Box component="span" aria-hidden="true" sx={{ display: "inline-flex", color: "var(--ct-accent-strong)", "& svg": { width: 20, height: 20, strokeWidth: 1.75 } }}>
                    {icon}
                  </Box>
                )}
                <Typography component="h2" id={titleId} sx={{ color: "var(--ct-text-primary)", fontFamily: "var(--ct-font-display)", fontSize: 18, fontWeight: 500, letterSpacing: "-0.015em", lineHeight: 1.3 }}>
                  {title}
                </Typography>
              </Stack>
            )}
            {subtitle && (
              <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 13, lineHeight: 1.5, mt: 0.5 }}>{subtitle}</Typography>
            )}
          </Box>
          {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
        </Stack>
      )}
      {children}
    </Paper>
  );
}
