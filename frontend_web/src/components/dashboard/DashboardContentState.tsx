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
          borderRadius: 3,
          borderColor: "divider",
          bgcolor: "background.paper",
          p: { xs: 2.25, md: compact ? 2.5 : 3 },
        }}
      >
        <Stack spacing={1.75}>
          <Typography component="span" color="text.secondary" sx={{ fontSize: 14, fontWeight: 650 }}>
            {title}
          </Typography>
          {Array.from({ length: compact ? 2 : 3 }, (_, index) => (
            <Box
              key={index}
              sx={{
                display: "flex",
                gap: 1.75,
                alignItems: "center",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 2,
                p: 1.5,
              }}
            >
              <Skeleton variant="rounded" width={44} height={44} sx={{ borderRadius: 1.5, flexShrink: 0 }} />
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
        borderRadius: 3,
        p: { xs: 2.5, md: compact ? 3 : 4 },
        textAlign: "center",
        bgcolor: "background.paper",
        borderColor: isError ? "error.light" : "divider",
      }}
    >
      <Stack alignItems="center" spacing={1.25} sx={{ maxWidth: 520, mx: "auto", minWidth: 0 }}>
        <Box
          aria-hidden="true"
          sx={{
            width: 56,
            height: 56,
            borderRadius: "18px",
            display: "grid",
            placeItems: "center",
            bgcolor: isError ? "error.light" : "action.hover",
            color: isError ? "error.dark" : "text.secondary",
            "& svg": { fontSize: 27 },
          }}
        >
          {icon ?? (isError ? <ErrorOutlineIcon /> : actionLabel ? <SearchOffOutlinedIcon /> : <InboxOutlinedIcon />)}
        </Box>
        <Typography component="h3" variant="h6" sx={{ fontWeight: 800, lineHeight: 1.3, overflowWrap: "anywhere" }}>
          {title}
        </Typography>
        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6, overflowWrap: "anywhere" }}>
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
            sx={{ mt: 1, minHeight: 44, px: 2.5, borderRadius: 2 }}
          >
            {actionLabel}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
