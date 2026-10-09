import { Box, ButtonBase, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { Bell, CalendarDays, MessageSquareText, ReceiptText, ShieldCheck, Users } from "lucide-react";
import IconTile, { type Tone } from "./IconTile";

export type ActivityEntry = {
  title: string;
  description?: string | null;
  time?: string | null;
  kind?: string | null;
  onOpen?: (() => void) | null;
};

// Activity kinds returned by the dashboard read model, mapped to the Figma tile tones.
const kindStyle: Record<string, { icon: ReactNode; tone: Tone }> = {
  shift: { icon: <CalendarDays />, tone: "violet" },
  assignment: { icon: <ShieldCheck />, tone: "cyan" },
  confirmed: { icon: <ShieldCheck />, tone: "cyan" },
  hub: { icon: <MessageSquareText />, tone: "blue" },
  invoice: { icon: <ReceiptText />, tone: "magenta" },
  membership: { icon: <Users />, tone: "blue" },
};

function styleFor(kind?: string | null) {
  const key = String(kind ?? "").toLowerCase();
  const match = Object.keys(kindStyle).find((name) => key.includes(name));
  return match ? kindStyle[match] : { icon: <Bell />, tone: "violet" as Tone };
}

/** Figma "Recent Activity" rows: tinted icon tile, bold title, muted detail, time on the right. */
export default function ActivityList({ entries }: { entries: ActivityEntry[] }) {
  return (
    <Stack>
      {entries.map((entry, index) => {
        const { icon, tone } = styleFor(entry.kind ?? entry.title);
        const body = (
          <>
            <IconTile icon={icon} tone={tone} size={32} />
            <Box sx={{ minWidth: 0, flex: 1, textAlign: "left" }}>
              <Typography sx={{ color: "var(--ct-text-primary)", fontSize: 13, fontWeight: 600, lineHeight: 1.35, overflowWrap: "anywhere" }}>{entry.title}</Typography>
              {entry.description && (
                <Typography sx={{ color: "var(--ct-text-muted)", fontSize: 12, lineHeight: 1.45, mt: 0.25, overflowWrap: "anywhere" }}>{entry.description}</Typography>
              )}
            </Box>
            {entry.time && (
              <Typography sx={{ color: "var(--ct-text-muted)", fontSize: 11, lineHeight: 1.6, flexShrink: 0, whiteSpace: "nowrap" }}>{entry.time}</Typography>
            )}
          </>
        );
        const rowSx = {
          display: "flex",
          alignItems: "flex-start",
          gap: 1.5,
          width: "100%",
          py: 1.5,
          borderTop: index > 0 ? "1px solid var(--ct-border-color)" : "none",
        } as const;
        return entry.onOpen ? (
          <ButtonBase
            key={index}
            onClick={entry.onOpen}
            sx={{ ...rowSx, borderRadius: "10px", "&:hover": { bgcolor: "var(--ct-hover-bg)" }, "&:focus-visible": { outline: "2px solid var(--ct-accent-strong)", outlineOffset: 2 } }}
          >
            {body}
          </ButtonBase>
        ) : (
          <Box key={index} sx={rowSx}>{body}</Box>
        );
      })}
    </Stack>
  );
}
