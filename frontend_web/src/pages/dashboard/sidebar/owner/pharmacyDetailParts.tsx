import {
  Alert,
  Badge,
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Skeleton,
  Stack,
  Switch,
  Typography
} from "@mui/material";
import {
  ChevronRight
} from "lucide-react";
import React from "react";
import IconTile, { type Tone } from "../../../../components/ui/IconTile";

/* ---------- small parts ---------- */

export function ActionRow({ icon, tone, title, detail, onClick, emphasis = false }: { icon: React.ReactNode; tone: Tone; title: string; detail?: string; onClick: () => void; emphasis?: boolean }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 1.5,
        px: 2.25,
        py: 1.25,
        textAlign: "left",
        borderTop: "1px solid var(--ct-border-color)",
        "&:hover": { bgcolor: "var(--ct-subtle-bg)" },
        "&.Mui-focusVisible": { outline: "2px solid var(--ct-accent-strong)", outlineOffset: -2 },
      }}
    >
      <IconTile icon={icon} tone={tone} size={36} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ color: emphasis ? "var(--ct-accent-strong)" : "var(--ct-text-primary)", fontWeight: 600, fontSize: 14.5 }}>{title}</Typography>
        {detail ? <Typography noWrap sx={{ color: "var(--ct-text-secondary)", fontSize: 13 }}>{detail}</Typography> : null}
      </Box>
      <ChevronRight size={18} color="var(--ct-text-secondary)" aria-hidden="true" />
    </ButtonBase>
  );
}

export function StatButton({ icon, tone, label, value, detail, onClick }: { icon: React.ReactNode; tone: Tone; label: string; value: React.ReactNode; detail?: React.ReactNode; onClick: () => void }) {
  return (
    <ButtonBase
      onClick={onClick}
      aria-label={`${label}: open the ${label.toLowerCase()} tab`}
      sx={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        gap: 1.5,
        p: { xs: 1.5, sm: 2 },
        textAlign: "left",
        borderRadius: "14px",
        "& .ct-stat-icon, & .ct-stat-detail": { display: { xs: "none", sm: "block" } },
        border: "1px solid var(--ct-border-color)",
        "&:hover": { borderColor: "var(--ct-accent-strong)" },
        "&.Mui-focusVisible": { outline: "2px solid var(--ct-accent-strong)", outlineOffset: 2 },
      }}
    >
      <Box className="ct-stat-icon"><IconTile icon={icon} tone={tone} size={40} /></Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 13, lineHeight: 1.3 }}>{label}</Typography>
        <Typography sx={{ color: "var(--ct-text-primary)", fontFamily: "var(--ct-font-display)", fontWeight: 500, fontSize: 26, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
        {detail ? <Typography component="div" className="ct-stat-detail" sx={{ color: "var(--ct-text-secondary)", fontSize: 12.5, mt: 0.25 }}>{detail}</Typography> : null}
      </Box>
    </ButtonBase>
  );
}

export function SettingRow({
  title,
  description,
  checked,
  busy,
  disabled,
  onChange,
  note,
  error,
  loading,
  onRetry,
}: {
  title: string;
  description: string;
  checked: boolean;
  busy?: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  note?: React.ReactNode;
  error?: string;
  loading?: boolean;
  onRetry?: () => void;
}) {
  const id = `setting-${title.replace(/\W+/g, "-").toLowerCase()}`;
  const unavailable = Boolean(onRetry && error);
  return (
    <Box sx={{ p: 2.25 }}>
      <Stack direction="row" spacing={2} alignItems="flex-start" justifyContent="space-between">
        <Box sx={{ minWidth: 0 }}>
          <Typography id={id} sx={{ color: "var(--ct-text-primary)", fontWeight: 600, fontSize: 15.5 }}>{title}</Typography>
          <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 14, lineHeight: 1.5, mt: 0.5, maxWidth: 640 }}>{description}</Typography>
        </Box>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0, minHeight: 40 }}>
          {loading ? (
            <Skeleton variant="rounded" width={86} height={28} aria-label={`Loading ${title}`} />
          ) : unavailable ? null : (
            <>
              {busy ? <CircularProgress size={18} aria-label="Saving" /> : null}
              <Switch checked={checked} disabled={disabled || busy} onChange={(_, next) => onChange(next)} slotProps={{ input: { "aria-labelledby": id } }} />
              <Typography sx={{ color: checked ? "var(--ct-status-green-fg)" : "var(--ct-text-secondary)", fontWeight: 600, fontSize: 14, minWidth: 26 }}>
                {checked ? "On" : "Off"}
              </Typography>
            </>
          )}
        </Stack>
      </Stack>
      {note && !error && !loading ? (
        <Box sx={{ mt: 1.5, p: 1.5, borderRadius: "12px", bgcolor: "var(--ct-subtle-bg)", color: "var(--ct-text-secondary)", fontSize: 13.5, lineHeight: 1.55 }}>{note}</Box>
      ) : null}
      {error ? (
        <Alert severity="error" sx={{ mt: 1.5 }} action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>Try again</Button> : undefined}>
          {error}
        </Alert>
      ) : null}
    </Box>
  );
}

export function TabLabel({ label, count, attention }: { label: string; count?: number; attention?: number }) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <span>{label}</span>
      {typeof count === "number" ? (
        <Box component="span" sx={{ px: 0.75, minWidth: 22, borderRadius: "999px", bgcolor: "var(--ct-subtle-bg)", color: "var(--ct-text-secondary)", fontSize: 12, fontWeight: 600, lineHeight: "20px" }}>
          {count}
        </Box>
      ) : null}
      {attention ? (
        <Badge
          badgeContent={attention}
          sx={{ "& .MuiBadge-badge": { position: "static", transform: "none", bgcolor: "#C000B4", color: "#FFFFFF", fontWeight: 600 } }}
          aria-label={`${attention} waiting for review`}
        />
      ) : null}
    </Stack>
  );
}
