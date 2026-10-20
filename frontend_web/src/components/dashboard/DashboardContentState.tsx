import type { ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import SearchOffOutlinedIcon from "@mui/icons-material/SearchOffOutlined";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";

export type DashboardContentStateKind = "loading" | "empty" | "error";

export type DashboardContentStateProps = {
  kind: DashboardContentStateKind;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Use a different existing MUI icon when appropriate to the state. */
  icon?: ReactNode;
  compact?: boolean;
  /** Extra content (e.g. secondary actions) rendered inside the block. */
  children?: ReactNode;
};

/**
 * Shared React/Vite content feedback for Figma-inspired empty, loading and
 * failure states. State decisions are owned by the page/API; this is pure UI.
 * This is deliberately composed from the current MUI theme (light/dark) and
 * does not add an independent component library or synthetic endpoint.
 */
export default function DashboardContentState({
  kind,
  title,
  description,
  actionLabel,
  onAction,
  icon,
  compact = false,
  children,
}: DashboardContentStateProps) {
  if (kind === "loading") {
    return (
      <Paper
        variant="outlined"
        aria-busy="true"
        aria-label={title}
        role="status"
        data-ct-state="loading"
        sx={{
          borderRadius: "var(--ct-card-radius)",
          borderColor: "var(--ct-border-color)",
          bgcolor: "var(--ct-surface-bg)",
          p: { xs: 2.25, md: compact ? 2.5 : 3 },
        }}
      >
        <Stack spacing={1.75}>
          <Typography component="span" sx={{ fontSize: 14, fontWeight: 600, color: "var(--ct-text-secondary)" }}>
            {title}
          </Typography>
          {Array.from({ length: compact ? 2 : 3 }, (_, index) => (
            <Box
              key={index}
              sx={{
                display: "flex",
                gap: 1.75,
                alignItems: "center",
                border: "1px solid var(--ct-border-color)",
                borderRadius: "14px",
                p: 1.5,
              }}
            >
              <Skeleton variant="rounded" width={44} height={44} sx={{ borderRadius: "12px", flexShrink: 0 }} />
              <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
                <Skeleton variant="text" width={index === 1 ? "60%" : "45%"} height={22} />
                <Skeleton variant="text" width="75%" height={18} />
              </Stack>
            </Box>
          ))}
        </Stack>
      </Paper>
    );
  }

  const isError = kind === "error";
  return (
    <Paper
      variant="outlined"
      data-ct-state={kind}
      role={isError ? "alert" : "status"}
      sx={{
        width: "100%",
        borderRadius: "var(--ct-card-radius)",
        p: { xs: 3, md: compact ? 3.5 : 5 },
        textAlign: "center",
        bgcolor: "var(--ct-surface-bg)",
        borderColor: isError ? "var(--ct-status-red-bg)" : "var(--ct-border-color)",
      }}
    >
      <Stack alignItems="center" spacing={1.25} sx={{ maxWidth: 520, mx: "auto", minWidth: 0 }}>
        <Box
          aria-hidden="true"
          sx={{
            width: 56,
            height: 56,
            borderRadius: "16px",
            display: "grid",
            placeItems: "center",
            bgcolor: isError ? "var(--ct-status-red-bg)" : "var(--ct-tone-violet-bg)",
            color: isError ? "var(--ct-status-red-fg)" : "var(--ct-tone-violet-fg)",
            "& svg": { fontSize: 26, width: 26, height: 26 },
          }}
        >
          {icon ?? (isError ? <ErrorOutlineIcon /> : actionLabel ? <SearchOffOutlinedIcon /> : <InboxOutlinedIcon />)}
        </Box>
        <Typography component="h3" sx={{ fontFamily: "var(--ct-font-display)", fontWeight: 500, fontSize: 19, lineHeight: 1.3, color: "var(--ct-text-primary)", overflowWrap: "anywhere" }}>
          {title}
        </Typography>
        {description && (
          <Typography sx={{ fontSize: 14, color: "var(--ct-text-secondary)", lineHeight: 1.6, overflowWrap: "anywhere" }}>
            {description}
          </Typography>
        )}
        {isError && !description && (
          <Alert severity="error" sx={{ width: "100%", justifyContent: "center" }}>
            The request could not be completed.
          </Alert>
        )}
        {actionLabel && onAction && (
          <Button
            type="button"
            variant={isError ? "outlined" : "contained"}
            color={isError ? "error" : "primary"}
            onClick={onAction}
            sx={{ mt: 1, minHeight: 44, px: 2.5 }}
          >
            {actionLabel}
          </Button>
        )}
        {children}
      </Stack>
    </Paper>
  );
}
