import { type ReactNode, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Box, Button, Divider, Menu, Stack, Typography, useTheme } from "@mui/material";
import { useDashboardNavigation } from "../../contexts/DashboardNavigationContext";
import { addDashboardScopeParams, normalizeDashboardSegment } from "../dashboardRouteScope";

export default function DashboardMegaMenu({
  anchorEl,
  open,
  onClose,
  selectedPharmacyId,
}: {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  selectedPharmacyId: number | null;
}) {
  const nav = useDashboardNavigation();
  const navigate = useNavigate();
  const location = useLocation();
  const isDark = useTheme().palette.mode === "dark";

  const groups = useMemo(() => {
    const result: Array<{ title: string; items: Array<{ label: string; icon?: ReactNode; path: string; child?: boolean }> }> = [];
    let current: { title: string; items: Array<{ label: string; icon?: ReactNode; path: string; child?: boolean }> } | null = null;

    const addItem = (item: any, parentPath = "") => {
      if (item?.kind === "header") {
        current = { title: item.title, items: [] };
        result.push(current);
        return;
      }
      if (item?.kind === "divider") {
        current = null;
        return;
      }
      if (!item?.segment || !item?.title) return;
      if (!current) {
        current = { title: "Navigation", items: [] };
        result.push(current);
      }
      const path = normalizeDashboardSegment(parentPath, item);
      current.items.push({ label: item.title, icon: item.icon, path });
      if (Array.isArray(item.children)) {
        item.children.forEach((child: any) => {
          const childPath = normalizeDashboardSegment(path, child);
          current?.items.push({ label: child.title, icon: child.icon, path: childPath, child: true });
        });
      }
    };

    nav.forEach((item: any) => addItem(item));
    return result.filter((group) => group.items.length > 0);
  }, [nav]);

  const handleNavigate = (path: string) => {
    navigate(addDashboardScopeParams(path, selectedPharmacyId));
    onClose();
  };

  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            // Portals do not inherit CSS variables from the dashboard shell.
            "--ct-dashboard-accent": isDark ? "#C8B5FF" : "#4A16B8",
            "--ct-dashboard-soft": isDark ? "rgba(130,102,232,.24)" : "#EFE7FF",
            mt: { xs: 0.5, md: 1 },
            width: { xs: "calc(100vw - 16px)", md: "min(1460px, calc(100vw - 24px))" },
            maxWidth: "none",
            maxHeight: { xs: "calc(100dvh - 96px)", md: "calc(100dvh - 112px)" },
            borderRadius: { xs: "0 22px 22px 0", md: "0 30px 30px 0" },
            border: "1px solid var(--ct-border-color)",
            boxShadow: "0 28px 70px rgba(2, 18, 44, 0.16)",
            overflowX: "hidden",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
          },
        },
        list: {
          sx: { p: 0 },
        },
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "repeat(4, minmax(0, 1fr))" },
          gap: { xs: 1.25, md: 2 },
          p: { xs: 1, md: 2 },
          bgcolor: "var(--ct-elevated-bg)",
        }}
      >
        {groups.map((group) => (
          <Box key={group.title} sx={{ border: "1px solid var(--ct-border-color)", bgcolor: "var(--ct-page-bg)", borderRadius: { xs: 2.5, md: 3 }, p: { xs: 1, md: 1.5 } }}>
            <Typography sx={{ px: 1, pb: 1, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", color: "var(--ct-text-secondary)", textTransform: "uppercase" }}>
              {group.title}
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {group.items.map((item) => {
                const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
                return (
                  <Button
                    key={`${group.title}-${item.path}-${item.label}`}
                    onClick={() => handleNavigate(item.path)}
                    startIcon={item.icon}
                    endIcon={item.child ? undefined : null}
                    sx={{
                      width: { xs: "100%", sm: "auto" },
                      minHeight: { xs: 42, md: 46 },
                      justifyContent: "flex-start",
                      borderRadius: 2,
                      px: 1.5,
                      py: 1,
                      textTransform: "none",
                      fontSize: { xs: 12.5, md: 13 },
                      fontWeight: 700,
                      lineHeight: 1.35,
                      color: active ? "var(--ct-dashboard-accent)" : item.child ? "var(--ct-text-secondary)" : "var(--ct-text-primary)",
                      bgcolor: active ? "var(--ct-dashboard-soft)" : item.child ? "var(--ct-hover-bg)" : "var(--ct-surface-bg)",
                      border: `1px solid ${active ? (isDark ? "#7D69BD" : "#C4B5FD") : "transparent"}`,
                      boxShadow: item.child ? "none" : "0 4px 14px rgba(6,18,58,0.05)",
                      "&:hover": {
                        bgcolor: active ? "var(--ct-dashboard-soft)" : "var(--ct-surface-bg)",
                        borderColor: "var(--ct-border-color)",
                      },
                      "& .MuiButton-startIcon": { color: active ? "var(--ct-dashboard-accent)" : "var(--ct-text-secondary)", mr: 0.75 },
                    }}
                  >
                    {item.label}
                  </Button>
                );
              })}
            </Stack>
          </Box>
        ))}
      </Box>
      <Divider />
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2.5, py: 1.5 }}>
        <Button size="small" onClick={onClose} sx={{ minHeight: 44, textTransform: "none", fontWeight: 700, color: "var(--ct-text-secondary)" }}>
          Collapse menu
        </Button>
      </Stack>
    </Menu>
  );
}
