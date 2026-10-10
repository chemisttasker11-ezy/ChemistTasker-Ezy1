// Shared presentation for the pharmacy team screens (staff, favourite locums, admins, applications).
// Pure UI: every list keeps its own data loading and actions.
import { useId, useState, type ReactNode } from "react";
import {
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Check, ChevronDown, Copy, Link2, Search } from "lucide-react";
import { Pill, toneColors, type ShiftTone } from "../../shiftCenter/ShiftCentreParts";
import { EMPLOYMENT_LABELS, roleLabel } from "../../../../components/social/socialFormat";
import type { MembershipDTO } from "./types";

/* ---------- labels ---------- */

export const ROLE_TONE: Record<string, ShiftTone> = {
  PHARMACIST: "violet",
  INTERN: "magenta",
  TECHNICIAN: "cyan",
  ASSISTANT: "blue",
  STUDENT: "amber",
  CONTACT: "neutral",
};
export const roleTone = (role?: string | null): ShiftTone => ROLE_TONE[String(role || "").toUpperCase()] ?? "neutral";
export const employmentLabel = (value?: string | null) => {
  const key = String(value || "").toUpperCase();
  if (!key) return "";
  return EMPLOYMENT_LABELS[key] ?? key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, " ");
};
export { roleLabel };

/** PHARMACIST_IN_CHARGE → "Pharmacist in charge", LEVEL_2 → "Level 2". */
export const prettyCode = (value?: string | null) => {
  const words = String(value || "").trim().toLowerCase().replace(/_/g, " ");
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
};

export const formatDate = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
};

const read = (m: unknown, ...keys: string[]) => {
  for (const key of keys) {
    const value = (m as Record<string, unknown>)?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

export const membershipName = (m: MembershipDTO, fallback = "Team member") => {
  const details = (read(m, "user_details", "userDetails") || {}) as Record<string, string | undefined>;
  return (
    (read(m, "invited_name", "invitedName") as string | undefined) ||
    (read(m, "name") as string | undefined) ||
    [details.first_name ?? details.firstName, details.last_name ?? details.lastName].filter(Boolean).join(" ") ||
    fallback
  );
};
export const membershipEmail = (m: MembershipDTO) => {
  const details = (read(m, "user_details", "userDetails") || {}) as Record<string, string | undefined>;
  return details.email || (read(m, "email") as string | undefined) || "";
};
export const membershipPhoto = (m: MembershipDTO) => {
  const details = (read(m, "user_details", "userDetails") || {}) as Record<string, string | undefined>;
  return details.profile_photo_url || details.profilePhotoUrl || "";
};
export const membershipUserId = (m: MembershipDTO): number | null => {
  const raw = read(m, "user");
  const details = (read(m, "user_details", "userDetails") || {}) as Record<string, unknown>;
  const id = typeof raw === "number" ? raw : typeof details.id === "number" ? details.id : null;
  return id;
};
export const membershipClassification = (m: MembershipDTO) =>
  prettyCode(
    (read(m, "pharmacist_award_level", "pharmacistAwardLevel", "otherstaff_classification_level", "otherstaffClassificationLevel", "intern_half", "internHalf", "student_year", "studentYear") as string | undefined) || "",
  );

/* ---------- avatar ---------- */

export function PersonAvatar({ name, photoUrl, tone = "violet", size = 40 }: { name: string; photoUrl?: string; tone?: ShiftTone; size?: number }) {
  const [failed, setFailed] = useState(false);
  const { bg, fg } = toneColors(tone);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        borderRadius: "50%",
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
        bgcolor: bg,
        color: fg,
        fontSize: size * 0.36,
        fontWeight: 600,
      }}
    >
      {photoUrl && !failed ? (
        <Box component="img" src={photoUrl} alt="" onError={() => setFailed(true)} sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initials
      )}
    </Box>
  );
}

/* ---------- list + expandable row ---------- */

export function TeamList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Paper
      variant="outlined"
      component="ul"
      aria-label={label}
      sx={{
        listStyle: "none",
        m: 0,
        p: 0,
        borderRadius: "var(--ct-card-radius)",
        borderColor: "var(--ct-border-color)",
        bgcolor: "var(--ct-surface-bg)",
        boxShadow: "none",
        overflow: "hidden",
        "& > li + li": { borderTop: "1px solid var(--ct-border-color)" },
      }}
    >
      {children}
    </Paper>
  );
}

export type Detail = { label: string; value: ReactNode };

/**
 * One person. The main line carries only name and role; everything else opens underneath.
 * `trailing` is for a status pill or a single primary action that must stay reachable (applications).
 */
export function MemberRow({
  name,
  photoUrl,
  role,
  tone,
  trailing,
  details,
  actions,
  note,
  defaultOpen = false,
}: {
  name: string;
  photoUrl?: string;
  role: ReactNode;
  tone: ShiftTone;
  trailing?: ReactNode;
  details: Detail[];
  actions?: ReactNode;
  note?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const shown = details.filter((d) => d.value !== undefined && d.value !== null && d.value !== "");
  return (
    <Box component="li">
      <Stack direction="row" alignItems="center" sx={{ pr: { xs: 1, sm: 1.5 } }}>
        <ButtonBase
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 1.5,
            px: { xs: 1.75, sm: 2.25 },
            py: 1.5,
            minHeight: 64,
            textAlign: "left",
            "&:hover .ct-row-name": { color: "var(--ct-accent-strong)" },
            "&.Mui-focusVisible": { outline: "2px solid var(--ct-accent-strong)", outlineOffset: -2 },
          }}
        >
          <PersonAvatar name={name} photoUrl={photoUrl} tone={tone} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography className="ct-row-name" noWrap sx={{ color: "var(--ct-text-primary)", fontWeight: 600, fontSize: 15.5, transition: "color 120ms ease" }}>
              {name}
            </Typography>
            <Typography noWrap sx={{ color: "var(--ct-text-secondary)", fontSize: 13.5 }}>{role}</Typography>
          </Box>
          <Box
            component="span"
            aria-hidden="true"
            sx={{ display: "inline-flex", color: "var(--ct-text-secondary)", transition: "transform 180ms ease", transform: open ? "rotate(180deg)" : "none" }}
          >
            <ChevronDown size={18} />
          </Box>
          <Box component="span" sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
            {open ? "Hide details" : "Show details"}
          </Box>
        </ButtonBase>
        {trailing ? <Box sx={{ flexShrink: 0, pl: 1, display: { xs: "none", sm: "block" } }}>{trailing}</Box> : null}
      </Stack>
      {trailing ? <Box sx={{ display: { xs: "block", sm: "none" }, pl: 9, pr: 1.75, mt: -0.75, pb: 1.5 }}>{trailing}</Box> : null}
      <Collapse in={open} unmountOnExit>
        <Box id={panelId} sx={{ px: { xs: 1.75, sm: 2.25 }, pb: 2, pl: { sm: 9 } }}>
          {note ? <Box sx={{ mb: 1.5 }}>{note}</Box> : null}
          {shown.length ? (
            <Box
              component="dl"
              sx={{
                m: 0,
                display: "grid",
                gap: { xs: 1.25, sm: 1.5 },
                gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(3, minmax(0, 1fr))" },
              }}
            >
              {shown.map((d) => (
                <Box key={d.label} sx={{ minWidth: 0 }}>
                  <Typography component="dt" sx={{ color: "var(--ct-text-secondary)", fontSize: 12.5 }}>{d.label}</Typography>
                  <Typography component="dd" sx={{ m: 0, color: "var(--ct-text-primary)", fontSize: 14.5, fontWeight: 500, overflowWrap: "anywhere" }}>
                    {d.value}
                  </Typography>
                </Box>
              ))}
            </Box>
          ) : null}
          {actions ? (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
              {actions}
            </Stack>
          ) : null}
        </Box>
      </Collapse>
    </Box>
  );
}

export function TeamListSkeleton({ rows = 3, label }: { rows?: number; label: string }) {
  return (
    <TeamList label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <Box component="li" key={i} role="presentation" sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2.25, py: 1.75 }}>
          <Skeleton variant="circular" width={40} height={40} />
          <Box sx={{ flex: 1 }}>
            <Skeleton width="40%" />
            <Skeleton width="25%" />
          </Box>
        </Box>
      ))}
    </TeamList>
  );
}

/* ---------- section + toolbar ---------- */

export function TeamSection({
  title,
  count,
  description,
  actions,
  tone,
  children,
}: {
  title: string;
  count?: number;
  description?: string;
  actions?: ReactNode;
  tone?: ShiftTone;
  children: ReactNode;
}) {
  return (
    <Box component="section" aria-label={title} sx={{ "& + &": { mt: 4 } }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: "stretch", sm: "flex-end" }} sx={{ mb: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography component="h3" sx={{ color: "var(--ct-text-primary)", fontWeight: 600, fontSize: 17 }}>{title}</Typography>
            {typeof count === "number" ? <Pill label={count} tone={tone ?? "neutral"} /> : null}
          </Stack>
          {description ? <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 14, mt: 0.25 }}>{description}</Typography> : null}
        </Box>
        {actions ? <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ flexShrink: 0 }}>{actions}</Stack> : null}
      </Stack>
      {children}
    </Box>
  );
}

export type Option = { value: string; label: string };

export function TeamToolbar({
  search,
  onSearch,
  searchLabel,
  filters,
}: {
  search: string;
  onSearch: (value: string) => void;
  searchLabel: string;
  filters: { label: string; value: string; options: Option[]; onChange: (value: string) => void }[];
}) {
  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} sx={{ mb: 1.5 }}>
      <TextField
        size="small"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={searchLabel}
        inputProps={{ "aria-label": searchLabel }}
        InputProps={{ startAdornment: <InputAdornment position="start"><Search size={17} /></InputAdornment> }}
        sx={{ flex: 1, minWidth: 0, "& .MuiOutlinedInput-root": { minHeight: 42, borderRadius: "12px", bgcolor: "var(--ct-surface-bg)" } }}
      />
      <Stack direction="row" spacing={1.25} sx={{ minWidth: 0 }}>
        {filters.map((f) => (
          <TextField
            key={f.label}
            select
            size="small"
            label={f.label}
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            sx={{ flex: 1, minWidth: { md: 170 }, "& .MuiOutlinedInput-root": { minHeight: 42, borderRadius: "12px", bgcolor: "var(--ct-surface-bg)" } }}
          >
            {f.options.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
        ))}
      </Stack>
    </Stack>
  );
}

export function EmptyTeam({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: { xs: 2.5, md: 3 }, borderRadius: "var(--ct-card-radius)", borderColor: "var(--ct-border-color)", borderStyle: "dashed", bgcolor: "var(--ct-surface-bg)", boxShadow: "none", textAlign: "center" }}
    >
      <Box sx={{ display: "inline-grid", placeItems: "center", width: 48, height: 48, borderRadius: "14px", bgcolor: "var(--ct-tone-violet-bg)", color: "var(--ct-tone-violet-fg)", mb: 1.25 }}>{icon}</Box>
      <Typography sx={{ color: "var(--ct-text-primary)", fontWeight: 600, fontSize: 16 }}>{title}</Typography>
      <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 14, mt: 0.5, maxWidth: 460, mx: "auto" }}>{body}</Typography>
      {action ? <Box sx={{ mt: 2 }}>{action}</Box> : null}
    </Paper>
  );
}

/* ---------- dialogs ---------- */

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  busyLabel,
  busy,
  destructive = true,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="xs" fullWidth aria-labelledby="ct-confirm-title">
      <DialogTitle id="ct-confirm-title" sx={{ fontWeight: 600 }}>{title}</DialogTitle>
      <DialogContent>
        <Typography component="div" sx={{ color: "var(--ct-text-secondary)", fontSize: 15, lineHeight: 1.55 }}>{body}</Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={busy} sx={{ minHeight: 40 }}>Cancel</Button>
        <Button
          variant="contained"
          color={destructive ? "error" : "primary"}
          onClick={onConfirm}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ minHeight: 40 }}
        >
          {busy ? busyLabel : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const EXPIRY_PRESETS = ["7", "14", "30"];

export function InviteLinkDialog({
  open,
  title,
  audience,
  expiry,
  onExpiry,
  link,
  generating,
  onGenerate,
  onCopy,
  onClose,
}: {
  open: boolean;
  title: string;
  audience: string;
  expiry: string;
  onExpiry: (value: string) => void;
  link: string;
  generating: boolean;
  onGenerate: () => void;
  onCopy: () => Promise<boolean> | boolean | void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const ok = await onCopy();
    if (ok !== false) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone} aria-labelledby="ct-link-title">
      <DialogTitle id="ct-link-title" sx={{ fontWeight: 600 }}>{title}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2.25 }}>
        <Typography sx={{ color: "var(--ct-text-secondary)", fontSize: 15, lineHeight: 1.55 }}>{audience}</Typography>
        <Box>
          <Typography sx={{ color: "var(--ct-text-primary)", fontWeight: 600, fontSize: 14, mb: 1 }}>Link stays open for</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap role="group" aria-label="Link expiry">
            {EXPIRY_PRESETS.map((days) => {
              const selected = expiry === days;
              return (
                <Button
                  key={days}
                  onClick={() => onExpiry(days)}
                  aria-pressed={selected}
                  disabled={generating}
                  sx={{
                    minHeight: 40,
                    px: 2,
                    borderRadius: "999px",
                    border: "1px solid",
                    borderColor: selected ? "var(--ct-accent-strong)" : "var(--ct-border-color)",
                    bgcolor: selected ? "var(--ct-tone-violet-bg)" : "transparent",
                    color: selected ? "var(--ct-tone-violet-fg)" : "var(--ct-text-secondary)",
                    fontWeight: 600,
                  }}
                >
                  {days} days
                </Button>
              );
            })}
            <TextField
              size="small"
              type="number"
              label="Custom days"
              value={EXPIRY_PRESETS.includes(expiry) ? "" : expiry}
              onChange={(e) => onExpiry(e.target.value)}
              inputProps={{ min: 1, max: 90 }}
              disabled={generating}
              sx={{ width: 130, "& .MuiOutlinedInput-root": { minHeight: 40, borderRadius: "999px" } }}
            />
          </Stack>
        </Box>
        {link ? (
          <TextField
            label="Invite link"
            value={link}
            fullWidth
            InputProps={{
              readOnly: true,
              endAdornment: (
                <InputAdornment position="end">
                  <Button onClick={() => void copy()} startIcon={copied ? <Check size={16} /> : <Copy size={16} />} sx={{ minHeight: 36 }}>
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </InputAdornment>
              ),
            }}
            onFocus={(e) => e.target.select()}
          />
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ minHeight: 40 }}>{link ? "Done" : "Cancel"}</Button>
        <Button
          variant={link ? "outlined" : "contained"}
          onClick={onGenerate}
          disabled={generating}
          startIcon={generating ? <CircularProgress size={16} color="inherit" /> : <Link2 size={16} />}
          sx={{ minHeight: 40 }}
        >
          {generating ? "Creating link…" : link ? "Create a new link" : "Create link"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export const actionButtonSx = { minHeight: 40, borderRadius: "10px" } as const;
