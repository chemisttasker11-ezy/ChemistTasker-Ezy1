import { ReactNode, useMemo } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
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
        width: 276,
        flex: "0 0 276px",
        alignSelf: "stretch",
        borderRight: "1px solid var(--ct-border-color)",
        bgcolor: "var(--ct-surface-bg)",
      }}
    >
      <Box
        component="nav"
        sx={{
          position: "sticky",
          top: 94,
          height: "calc(100dvh - 94px)",
          overflowY: "auto",
          px: 1.5,
          py: 2.25,
          scrollbarWidth: "thin",
        }}
      >
        <Stack spacing={2.5}>
          {groups.map((group) => (
            <Box key={group.title}>
              <Typography
                component="h2"
                sx={{
                  px: 1.25,
                  mb: 0.75,
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
              <Stack spacing={0.35}>
                {group.items.map((item) => {
                  const active =
                    location.pathname === item.path ||
                    location.pathname.startsWith(`${item.path}/`);

                  return (
                    <Button
                      key={`${group.title}-${item.path}-${item.label}`}
                      onClick={() => handleNavigate(item.path)}
                      startIcon={item.icon}
                      endIcon={item.child ? <ChevronRightRoundedIcon /> : undefined}
                      aria-current={active ? "page" : undefined}
                      sx={{
                        minHeight: 44,
                        justifyContent: "flex-start",
                        pl: item.child ? 3.5 : 1.25,
                        pr: 1.25,
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
                          mr: 1,
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
                      {item.label}
                    </Button>
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
