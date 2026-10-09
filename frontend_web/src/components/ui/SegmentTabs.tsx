import { Box, ButtonBase, Typography } from "@mui/material";
import type { ReactNode } from "react";

export type SegmentTab<T extends string> = { value: T; label: string; icon?: ReactNode };

/**
 * Equal-width pill tabs (Figma Shift Centre style). The selected pill is soft violet with deep-violet text;
 * the others are white with a hairline border. Use for page-level section switches with 2–5 options.
 */
export default function SegmentTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: SegmentTab<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <Box
      role="tablist"
      aria-label={label}
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
        gap: { xs: 0.75, sm: 1.25 },
        p: { xs: 0.75, sm: 1 },
        borderRadius: "var(--ct-card-radius)",
        border: "1px solid var(--ct-border-color)",
        bgcolor: "var(--ct-surface-bg)",
        minWidth: 0,
      }}
    >
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <ButtonBase
            key={tab.value}
            role="tab"
            aria-selected={selected}
            onClick={() => { if (!selected) onChange(tab.value); }}
            sx={{
              minWidth: 0,
              minHeight: 44,
              px: { xs: 0.75, sm: 2 },
              gap: 1,
              borderRadius: "14px",
              color: selected ? "var(--ct-accent-strong)" : "var(--ct-text-secondary)",
              bgcolor: selected ? "var(--ct-tone-violet-bg)" : "transparent",
              border: "1px solid",
              borderColor: selected ? "transparent" : "var(--ct-border-color)",
              transition: "background-color 160ms ease, color 160ms ease",
              "&:hover": { bgcolor: selected ? "var(--ct-tone-violet-bg)" : "var(--ct-hover-bg)", color: selected ? "var(--ct-accent-strong)" : "var(--ct-text-primary)" },
              "&:focus-visible": { outline: "2px solid var(--ct-accent-strong)", outlineOffset: 2 },
              "& svg": { width: 16, height: 16, strokeWidth: 1.75, flexShrink: 0 },
              "@media (prefers-reduced-motion: reduce)": { transition: "none" },
            }}
          >
            {tab.icon}
            <Typography component="span" noWrap sx={{ fontSize: { xs: 12.5, sm: 14 }, fontWeight: selected ? 600 : 500 }}>
              {tab.label}
            </Typography>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
