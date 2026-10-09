import { Skeleton, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

/** Figma "Upcoming Shifts" rows: label left, large deep-violet figure right, hairline dividers. */
export default function StatList({ rows, loading = false }: { rows: { label: string; value: ReactNode }[]; loading?: boolean }) {
  return (
    <Stack component="dl" sx={{ m: 0 }}>
      {rows.map((row, index) => (
        <Stack
          key={row.label}
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ py: 1.4, borderTop: index > 0 ? "1px solid var(--ct-border-color)" : "none" }}
        >
          <Typography component="dt" sx={{ color: "var(--ct-text-secondary)", fontSize: 13.5 }}>{row.label}</Typography>
          <Typography component="dd" sx={{ m: 0, color: "var(--ct-accent-strong)", fontFamily: "var(--ct-font-display)", fontWeight: 500, fontSize: 26, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
            {loading ? <Skeleton width={28} /> : row.value}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}
