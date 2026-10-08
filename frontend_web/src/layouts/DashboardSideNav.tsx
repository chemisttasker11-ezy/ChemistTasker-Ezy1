import { ReactNode, useMemo, useState } from "react";
import { Box, Button, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import AppsRoundedIcon from "@mui/icons-material/AppsRounded";
import { useLocation, useNavigate } from "react-router-dom";
import { useDashboardNavigation } from "../contexts/DashboardNavigationContext";
import { addDashboardScopeParams, normalizeDashboardSegment } from "./dashboardRouteScope";

type NavGroup = {
  title: string;
  items: Array<{ label: string; icon?: ReactNode; path: string; child?: boolean }>;
};

export default function DashboardSideNav({
  selectedPharmacyId,
}: {
  selectedPharmacyId: number | null;
}) {
  const nav = useDashboardNavigation();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem("ct-dashboard-sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem("ct-dashboard-sidebar-collapsed", next ? "1" : "0");
    } catch {
      // Navigation remains usable even if browser storage is unavailable.
    }
  };

  const groups = useMemo<NavGroup[]>(() => {
    const result: NavGroup[] = [];
    let current: NavGroup | null = null;

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
        current = { title: "Workspace", items: [] };
        result.push(current);
      }

      const path = normalizeDashboardSegment(parentPath, item);
      current.items.push({ label: item.title, icon: item.icon, path });

      if (Array.isArray(item.children)) {
        item.children.forEach((child: any) => {
          current?.items.push({
            label: child.title,
            icon: child.icon,
            path: normalizeDashboardSegment(path, child),
            child: true,
          });
        });
      }
    };

    nav.forEach((item: any) => addItem(item));
    return result.filter((group) => group.items.length > 0);
  }, [nav]);

  const handleNavigate = (path: string) => {
    navigate(addDashboardScopeParams(path, selectedPharmacyId));
  };

  return (
    <Box
      component="aside"
      aria-label="Dashboard navigation"
      sx={{
        display: { xs: "none", lg: "block" },
        width: collapsed ? 80 : 276,
        flex: collapsed ? "0 0 80px" : "0 0 276px",
        transition: "width 180ms ease, flex-basis 180ms ease",
        "@media (prefers-reduced-motion: reduce)": { transition: "none" },
        alignSelf: "stretch",
        borderRight: "1px solid var(--ct-border-color)",
        bgcolor: "var(--ct-surface-bg)",
      }}
    >
      <Box
        component="nav"
        sx={{
          position: "sticky",
          top: 85,
          height: "calc(100dvh - 85px)",
          overflowY: "auto",
          px: collapsed ? 1 : 1.5,
          py: 1.5,
          scrollbarWidth: "thin",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-end", mb: 1.5 }}>
          <Tooltip title={collapsed ? "Expand sidebar" : "Collapse sidebar"} placement="right">
            <IconButton
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              size="small"
              sx={{ width: 44, height: 44, border: "1px solid var(--ct-border-color)", color: "var(--ct-text-primary)", "&:focus-visible": { outline: "3px solid #008DDB", outlineOffset: 2 } }}
            >
              {collapsed ? <ChevronRightRoundedIcon /> : <ChevronLeftRoundedIcon />}
            </IconButton>
          </Tooltip>
        </Box>
        <Stack spacing={collapsed ? 1.75 : 2.5}>
          {groups.map((group) => (
            <Box key={group.title}>
              <Typography
                component="h2"
                sx={{
                  px: 1.25,
                  mb: 0.75,
                  display: collapsed ? "none" : "block",
                  color: "var(--ct-text-secondary)",
                  fontSize: 11,
                  lineHeight: 1.4,
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                {group.title}
              </Typography>
              <Stack spacing={collapsed ? 0.65 : 0.35} role="group" aria-label={group.title}>
                {group.items.map((item) => {
                  const active =
                    location.pathname === item.path ||
                    location.pathname.startsWith(`${item.path}/`);

                  return (
                    <Tooltip key={`${group.title}-${item.path}-${item.label}`} title={collapsed ? item.label : ""} placement="right" arrow>
                    <Button
                      onClick={() => handleNavigate(item.path)}
                      startIcon={item.icon ?? <AppsRoundedIcon />}
                      endIcon={!collapsed && item.child ? <ChevronRightRoundedIcon /> : undefined}
                      aria-label={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      sx={{
                        minHeight: 44,
                        minWidth: 0,
                        width: "100%",
                        justifyContent: collapsed ? "center" : "flex-start",
                        pl: collapsed ? 1 : item.child ? 3.5 : 1.25,
                        pr: collapsed ? 1 : 1.25,
                        py: 0.9,
                        borderRadius: 2.25,
                        textTransform: "none",
                        textAlign: "left",
                        color: active
                          ? "var(--ct-dashboard-accent)"
                          : item.child
                            ? "var(--ct-text-secondary)"
                            : "var(--ct-text-primary)",
                        bgcolor: active ? "var(--ct-dashboard-soft)" : "transparent",
                        fontSize: 13.5,
                        fontWeight: active ? 800 : item.child ? 600 : 700,
                        lineHeight: 1.25,
                        "& .MuiButton-startIcon": {
                          minWidth: 24,
                          mr: collapsed ? 0 : 1,
                          ml: collapsed ? 0 : undefined,
                          color: active
                            ? "var(--ct-dashboard-accent)"
                            : "var(--ct-text-secondary)",
                          "& svg": { fontSize: 20 },
                        },
                        "& .MuiButton-endIcon": {
                          ml: "auto",
                          opacity: 0.55,
                          "& svg": { fontSize: 17 },
                        },
                        "&:hover": {
                          bgcolor: active
                            ? "var(--ct-dashboard-soft)"
                            : "var(--ct-hover-bg)",
                        },
                        "&:focus-visible": {
                          outline: "3px solid rgba(0,141,219,.28)",
                          outlineOffset: 1,
                        },
                      }}
                    >
                      {!collapsed && item.label}
                    </Button>
                    </Tooltip>
                  );
                })}
              </Stack>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
