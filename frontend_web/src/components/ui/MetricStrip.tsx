import { Box, ButtonBase, Paper, Skeleton, Typography } from "@mui/material";
import type { ReactNode } from "react";
import IconTile, { type Tone } from "./IconTile";

export type MetricItem = {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  icon: ReactNode;
  tone: Tone;
  onClick?: () => void;
};

/** Figma metric band: one card split into cells, each a tinted icon tile + label, figure and caption. */
export default function MetricStrip({ items, loading = false, label = "Key figures" }: { items: MetricItem[]; loading?: boolean; label?: string }) {
  const count = items.length;
  return (
    <Paper
      component="section"
      aria-label={label}
      variant="outlined"
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", lg: `repeat(${count}, minmax(0, 1fr))` },
        borderRadius: "var(--ct-card-radius)",
        borderColor: "var(--ct-border-color)",
        bgcolor: "var(--ct-surface-bg)",
        boxShadow: "none",
        overflow: "hidden",
      }}
    >
      {items.map((item, index) => {
        const lastInRowXs = index % 2 === 1;
        const lastLg = index === count - 1;
        const content = (
          <>
            <IconTile icon={item.icon} tone={item.tone} />
            <Box sx={{ minWidth: 0, textAlign: "left" }}>
              <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 12, lineHeight: 1.4 }}>{item.label}</Typography>
              {loading ? (
                <Skeleton variant="text" width={48} sx={{ fontSize: 28 }} />
              ) : (
                <Typography sx={{ color: "var(--ct-text-primary)", fontFamily: "var(--ct-font-display)", fontWeight: 500, fontSize: { xs: 24, md: 28 }, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" }}>
                  {item.value}
                </Typography>
              )}
              {item.caption && (
                <Typography sx={{ color: "var(--ct-text-muted)", fontSize: 11.5, lineHeight: 1.4, overflowWrap: "anywhere" }}>{item.caption}</Typography>
              )}
            </Box>
          </>
        );
        const cellSx = {
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 1.75,
          minWidth: 0,
          px: { xs: 1.75, md: 2.5 },
          py: { xs: 2, md: 2.5 },
          borderRight: { xs: lastInRowXs ? "none" : "1px solid var(--ct-border-color)", lg: lastLg ? "none" : "1px solid var(--ct-border-color)" },
          borderBottom: { xs: index < count - 2 ? "1px solid var(--ct-border-color)" : "none", lg: "none" },
        } as const;
        return item.onClick ? (
          <ButtonBase
            key={item.label}
            onClick={item.onClick}
            sx={{ ...cellSx, "&:hover": { bgcolor: "var(--ct-hover-bg)" }, "&:focus-visible": { outline: "2px solid var(--ct-accent-strong)", outlineOffset: -2 } }}
          >
            {content}
          </ButtonBase>
        ) : (
          <Box key={item.label} sx={cellSx}>{content}</Box>
        );
      })}
    </Paper>
  );
}
