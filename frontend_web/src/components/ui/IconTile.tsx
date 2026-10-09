import { Box } from "@mui/material";
import type { ReactNode } from "react";

/** The four tinted tones of the dashboard Figma system (theme CSS variables). */
export type Tone = "violet" | "blue" | "cyan" | "magenta";

export const toneVars = (tone: Tone) => ({
  bg: `var(--ct-tone-${tone}-bg)`,
  fg: `var(--ct-tone-${tone}-fg)`,
});

/** Rounded tinted square holding an outline icon (Figma metric/action/activity tiles). */
export default function IconTile({ icon, tone = "violet", size = 44 }: { icon: ReactNode; tone?: Tone; size?: number }) {
  const { bg, fg } = toneVars(tone);
  const glyph = Math.round(size * 0.45);
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        borderRadius: size >= 40 ? "12px" : "9px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: bg,
        color: fg,
        "& svg": { width: glyph, height: glyph, fontSize: glyph, strokeWidth: 1.75 },
      }}
    >
      {icon}
    </Box>
  );
}
