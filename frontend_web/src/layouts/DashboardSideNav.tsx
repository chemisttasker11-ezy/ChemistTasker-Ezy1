import { ReactNode, useMemo, useState } from "react";
import {
  Box,
  ButtonBase,
  Button,
  Collapse,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AppsRoundedIcon from "@mui/icons-material/AppsRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import menuLogo from "../assets/clipsnap-edit-6-1-2026.png";
import { useLocation, useNavigate } from "react-router-dom";
import { useDashboardNavigation } from "../contexts/DashboardNavigationContext";
import { addDashboardScopeParams, normalizeDashboardSegment } from "./dashboardRouteScope";

/**
 * Presentation only: every route, child route, icon and capability still comes
 * from DashboardNavigationContext. This component does not define authority.
 */
type SidebarItem = {
  label: string;
  path: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: SidebarItem[];
};

type SidebarGroup = {
  id: string;
  title: string;
  items: SidebarItem[];
};

const EXPANDED_WIDTH = 276;
const RAIL_WIDTH = 76;

function displayGroupTitle(title: string) {
  switch (title.toLowerCase()) {
    case "profile settings":
    case "profile, availability and memberships":
      return "Workspace";
    case "manage pharmacies and shifts":
      return "Pharmacy operations";
    case "shifts & invoices":
      return "Shifts & finance";
    case "learning & explorer hub":
      return "Discover";
    case "organization management":
      return "Organisation";
    default:
      return title;
  }
}

function routePart(path: string) {
  return path.split("?")[0].replace(/\/+$/, "") || "/";
}

function matchesRoute(path: string, pathname: string, search: string) {
  const target = routePart(path);
  if (pathname !== target && !pathname.startsWith(target + "/")) return false;

  // A few navigation actions share a route but differ by query parameters.
  const query = path.split("?")[1];
  if (!query) return true;
  const required = new URLSearchParams(query);
  const actual = new URLSearchParams(search);
  for (const [key, value] of required.entries()) {
    if (actual.get(key) !== value) return false;
  }
  return true;
}

function activeRouteKey(groups: SidebarGroup[], pathname: string, search: string) {
  const entries = groups.flatMap((group) =>
    group.items.flatMap((item) => [item, ...item.children]),
  );
  const candidates = entries.filter((item) => matchesRoute(item.path, pathname, search));
  // Prefer deep, specific destinations; a query-qualified action beats its plain route.
  candidates.sort((a, b) =>
    routePart(b.path).length - routePart(a.path).length ||
    Number(b.path.includes("?")) - Number(a.path.includes("?")),
  );
  return candidates[0]?.path ?? null;
}

function NavSymbol({ icon, active, small = false }: { icon?: ReactNode; active: boolean; small?: boolean }) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{
        width: small ? 25 : 34,
        height: small ? 25 : 34,
        flex: small ? "0 0 25px" : "0 0 34px",
        borderRadius: small ? "8px" : "10px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "transparent",
        color: active ? "var(--ct-sidebar-accent)" : "var(--ct-text-secondary)",
        "& svg": { width: small ? 16 : 18, height: small ? 16 : 18, fontSize: small ? 16 : 18, strokeWidth: 1.75 },
      }}
    >
      {icon ?? <AppsRoundedIcon />}
    </Box>
  );
}

export default function DashboardSideNav({
  selectedPharmacyId,
  homePath,
}: {
  selectedPharmacyId: number | null;
  /** Where the sidebar logo leads (the persona's dashboard home). */
  homePath: string;
}) {
  const navigation = useDashboardNavigation();
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const isDark = useTheme().palette.mode === "dark";
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return typeof window !== "undefined" &&
        window.localStorage.getItem("ct-dashboard-sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});
  const [flyout, setFlyout] = useState<{ anchor: HTMLElement; item: SidebarItem } | null>(null);

  const { groups, utilities } = useMemo(() => {
    const result: SidebarGroup[] = [];
    const footer: SidebarItem[] = [];
    let current: SidebarGroup | null = null;

    const makeItem = (item: any, parentPath = ""): SidebarItem => {
      const path = normalizeDashboardSegment(parentPath, item);
      return {
        label: String(item.title),
        path,
        icon: item.icon,
        action: item.action,
        children: Array.isArray(item.children)
          ? item.children
              .filter((child: any) => child?.segment && child?.title)
              .map((child: any) => makeItem(child, path))
          : [],
      };
    };

    for (const item of navigation as any[]) {
      if (item?.kind === "header") {
        current = { id: "section-" + result.length, title: String(item.title || "Workspace"), items: [] };
        result.push(current);
        continue;
      }
      if (item?.kind === "divider") {
        current = null;
        continue;
      }
      if (!item?.segment || !item?.title) continue;
      const mapped = makeItem(item);

      // Preserve the actual logout route, but separate it from everyday tools.
      if (mapped.label.toLowerCase() === "logout") {
        footer.push(mapped);
        continue;
      }
      if (!current) {
        current = { id: "section-" + result.length, title: "Workspace", items: [] };
        result.push(current);
      }
      current.items.push(mapped);
    }

    return { groups: result.filter((group) => group.items.length > 0), utilities: footer };
  }, [navigation]);

  const activePath = useMemo(
    () => activeRouteKey(groups, location.pathname, location.search),
    [groups, location.pathname, location.search],
  );

  const navigateTo = (path: string) => {
    setFlyout(null);
    navigate(addDashboardScopeParams(path, selectedPharmacyId));
  };

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    setFlyout(null);
    try {
      window.localStorage.setItem("ct-dashboard-sidebar-collapsed", next ? "1" : "0");
    } catch {
      // The sidebar still works when local storage is unavailable.
    }
  };

  const renderItem = (item: SidebarItem) => {
    const exactActive = item.path === activePath;
    const activeChild = item.children.some((child) => child.path === activePath);
    const sectionActive = exactActive || activeChild;
    const hasChildren = item.children.length > 0;
    const childrenOpen = expandedParents[item.path] ?? activeChild;
    const menuOpen = flyout?.item.path === item.path;
    const submenuId = "dashboard-submenu-" + item.path.replace(/[^a-z0-9]/gi, "-");

    return (
      <Box key={item.path} sx={{ minWidth: 0 }}>
        <Stack direction="row" alignItems="center" sx={{
          position: "relative", gap: 0.25, minWidth: 0, borderRadius: "11px",
          bgcolor: sectionActive ? "var(--ct-sidebar-selected)" : "transparent",
          "&::before": {
            content: '""', display: "none",
            position: "absolute", top: 11, bottom: 11, left: 0, width: 3,
            borderRadius: "0 4px 4px 0", bgcolor: "var(--ct-sidebar-accent)",
            pointerEvents: "none", zIndex: 1,
          },
        }}>
          <Tooltip title={collapsed ? item.label : ""} placement="right" arrow disableInteractive>
            <Button
              onClick={(event) => {
                if (collapsed && hasChildren) {
                  setFlyout({ anchor: event.currentTarget, item });
                } else {
                  navigateTo(item.path);
                }
              }}
              aria-label={collapsed ? (hasChildren ? item.label + " menu" : item.label) : undefined}
              aria-current={exactActive ? "page" : undefined}
              aria-haspopup={collapsed && hasChildren ? "menu" : undefined}
              aria-expanded={collapsed && hasChildren ? menuOpen : undefined}
              sx={{
                position: "relative",
                minWidth: 0,
                width: "100%",
                flex: "1 1 0%",
                minHeight: 46,
                px: collapsed ? 0 : 0.85,
                py: 0.4,
                gap: collapsed ? 0 : 0.85,
                justifyContent: collapsed ? "center" : "flex-start",
                textAlign: "left",
                textTransform: "none",
                borderRadius: "11px",
                color: sectionActive ? "var(--ct-sidebar-accent)" : childrenOpen && hasChildren ? "var(--ct-text-primary)" : "var(--ct-text-secondary)",
                bgcolor: "transparent",
                fontSize: 13,
                fontWeight: sectionActive || (childrenOpen && hasChildren) ? 600 : 400,
                letterSpacing: "-.01em",
                lineHeight: 1.35,
                "&:hover": {
                  bgcolor: sectionActive ? "var(--ct-sidebar-selected)" : "var(--ct-hover-bg)",
                },
                "&:focus-visible": {
                  outline: "2px solid var(--ct-sidebar-accent)",
                  outlineOffset: 2,
                },
              }}
            >
              <NavSymbol icon={item.icon} active={sectionActive} />
              {!collapsed && (
                <Box component="span" sx={{
                  display: "flex",
                  flex: "1 1 auto",
                  minWidth: 0,
                  alignItems: "center",
                  gap: 0.6,
                  overflow: "hidden",
                }}>
                  <Box component="span" sx={{
                    flex: "1 1 auto",
                    minWidth: 0,
                    whiteSpace: "normal",
                    overflowWrap: "anywhere",
                  }}>
                    {item.label}
                  </Box>
                  {item.action && (
                    <Box component="span" sx={{ flexShrink: 0, display: "inline-flex", alignItems: "center", "& .MuiChip-root": { maxWidth: 64, height: 21, fontSize: 10 } }}>
                      {item.action}
                    </Box>
                  )}
                </Box>
              )}
            </Button>
          </Tooltip>
          {hasChildren && !collapsed && (
            <Tooltip title={childrenOpen ? "Hide " + item.label + " pages" : "Show " + item.label + " pages"} placement="right">
              <IconButton
                onClick={() => setExpandedParents((prev) => ({ ...prev, [item.path]: !childrenOpen }))}
                aria-label={(childrenOpen ? "Collapse " : "Expand ") + item.label + " subpages"}
                aria-expanded={childrenOpen}
                aria-controls={submenuId}
                size="small"
                sx={{
                  flex: "0 0 34px",
                  width: 34,
                  height: 42,
                  ml: 0.1,
                  borderRadius: "9px",
                  color: sectionActive ? "var(--ct-sidebar-accent)" : "var(--ct-text-secondary)",
                  "&:hover": { bgcolor: "var(--ct-hover-bg)" },
                  "&:focus-visible": { outline: "2px solid var(--ct-sidebar-accent)", outlineOffset: 1 },
                }}
              >
                <ExpandMoreRoundedIcon sx={{ fontSize: 20, transform: childrenOpen ? "rotate(180deg)" : "none", transition: reduceMotion ? "none" : "transform 150ms ease" }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>

        {hasChildren && !collapsed && (
          <Collapse id={submenuId} in={childrenOpen} timeout={reduceMotion ? 0 : 150} unmountOnExit>
            <Stack
              spacing={0.1}
              role="group"
              aria-label={item.label + " pages"}
              sx={{
                ml: 2.55,
                my: 0.45,
                pl: 1.45,
                borderLeft: "1px solid var(--ct-border-color)",
                minWidth: 0,
              }}
            >
              {item.children.map((child) => {
                const selected = child.path === activePath;
                return (
                  <Button
                    key={child.path}
                    onClick={() => navigateTo(child.path)}
                    aria-current={selected ? "page" : undefined}
                    sx={{
                      minWidth: 0,
                      minHeight: 44,
                      borderRadius: "9px",
                      px: 1,
                      py: 0.75,
                      gap: 1,
                      justifyContent: "flex-start",
                      textTransform: "none",
                      textAlign: "left",
                      fontSize: 12.5,
                      lineHeight: 1.4,
                      fontWeight: selected ? 600 : 400,
                      color: selected ? "var(--ct-sidebar-accent)" : "var(--ct-text-secondary)",
                      bgcolor: selected ? "var(--ct-sidebar-selected)" : "transparent",
                      "&:hover": { bgcolor: selected ? "var(--ct-sidebar-selected)" : "var(--ct-hover-bg)" },
                      "&:focus-visible": { outline: "2px solid var(--ct-sidebar-accent)", outlineOffset: 1 },
                    }}
                  >
                    <NavSymbol icon={child.icon} active={selected} small />
                    <Box component="span" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>{child.label}</Box>
                  </Button>
                );
              })}
            </Stack>
          </Collapse>
        )}
      </Box>
    );
  };

  const renderUtility = (item: SidebarItem) => {
    const active = item.path === activePath;
    return (
      <Tooltip key={item.path} title={collapsed ? item.label : ""} placement="right" arrow>
        <Button
          onClick={() => navigateTo(item.path)}
          aria-label={collapsed ? item.label : undefined}
          aria-current={active ? "page" : undefined}
          sx={{
            minWidth: 0,
            width: "100%",
            minHeight: 46,
            display: "flex",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: collapsed ? 0 : 1,
            px: collapsed ? 0 : 1,
            borderRadius: "11px",
            textTransform: "none",
            fontSize: 13,
            fontWeight: 400,
            color: "var(--ct-text-secondary)",
            "&:hover": { bgcolor: "var(--ct-hover-bg)", color: "var(--ct-text-primary)" },
            "&:focus-visible": { outline: "2px solid var(--ct-sidebar-accent)", outlineOffset: 2 },
          }}
        >
          <NavSymbol icon={item.icon} active={active} />
          {!collapsed && <Box component="span" sx={{ minWidth: 0 }}>{item.label}</Box>}
        </Button>
      </Tooltip>
    );
  };

  return (
    <Box
      component="aside"
      aria-label="Dashboard navigation"
      sx={{
        display: { xs: "none", lg: "flex" },
        flexDirection: "column",
        width: collapsed ? RAIL_WIDTH : EXPANDED_WIDTH,
        flex: collapsed ? "0 0 " + RAIL_WIDTH + "px" : "0 0 " + EXPANDED_WIDTH + "px",
        minWidth: 0,
        transition: reduceMotion ? "none" : "width 170ms ease, flex-basis 170ms ease",
        alignSelf: "stretch",
        bgcolor: "var(--ct-surface-bg)",
        "--ct-sidebar-accent": isDark ? "#C8B5FF" : "var(--ct-dashboard-accent)",
        "--ct-sidebar-selected": isDark ? "rgba(130, 102, 232, .24)" : "var(--ct-dashboard-soft)",
        "--ct-sidebar-icon": isDark ? "rgba(130, 102, 232, .18)" : "var(--ct-soft-primary)",
        borderRight: "1px solid var(--ct-border-color)",
        boxSizing: "border-box",
        overflow: "visible",
      }}
    >
      <Box
        sx={{
          position: "sticky",
          top: 0,
          height: "100dvh",
          minHeight: 0,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          bgcolor: "var(--ct-surface-bg)",
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent={collapsed ? "center" : "space-between"}
          sx={{
            px: collapsed ? 0.75 : 2,
            py: 1,
            minHeight: 85,
            borderBottom: "1px solid var(--ct-border-color)",
            flexShrink: 0,
          }}
        >
          {!collapsed && (
            <ButtonBase
              onClick={() => navigate(homePath)}
              aria-label="ChemistTasker dashboard home"
              sx={{
                borderRadius: "10px",
                "&:hover": { opacity: 0.88 },
                "&:focus-visible": { outline: "2px solid var(--ct-sidebar-accent)", outlineOffset: 3 },
              }}
            >
              <Box component="img" src={menuLogo} alt="ChemistTasker" sx={{ display: "block", width: 124, height: "auto" }} />
            </ButtonBase>
          )}
          <Tooltip title={collapsed ? "Expand sidebar" : "Collapse sidebar"} placement="right" arrow>
            <IconButton
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              sx={{
                width: 34,
                height: 34,
                borderRadius: "10px",
                border: "1px solid var(--ct-border-color)",
                bgcolor: "var(--ct-elevated-bg)",
                color: "var(--ct-text-secondary)",
                "&:hover": { bgcolor: "var(--ct-hover-bg)", color: "var(--ct-sidebar-accent)" },
                "&:focus-visible": { outline: "2px solid var(--ct-sidebar-accent)", outlineOffset: 2 },
              }}
            >
              {collapsed ? <ChevronsRight size={18} strokeWidth={1.75} /> : <ChevronsLeft size={18} strokeWidth={1.75} />}
            </IconButton>
          </Tooltip>
        </Stack>

        <Box
          component="nav"
          aria-label="Dashboard pages"
          sx={{
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            overscrollBehavior: "contain",
            py: 1.75,
            px: collapsed ? 1 : 1.5,
            scrollbarWidth: "thin",
            scrollbarColor: "var(--ct-border-color) transparent",
            "&::-webkit-scrollbar": { width: 6 },
            "&::-webkit-scrollbar-thumb": { bgcolor: "var(--ct-border-color)", borderRadius: "999px" },
          }}
        >
          <Stack spacing={1.75}>
            {groups.map((group) => {
              const isOpen = !closedGroups[group.id];
              return (
                <Box key={group.id} sx={{ minWidth: 0 }}>
                  {collapsed ? (
                    <Tooltip title={displayGroupTitle(group.title)} placement="right" arrow>
                      <Divider
                        aria-label={displayGroupTitle(group.title)}
                        sx={{ mx: 1.25, mb: 1, borderColor: "var(--ct-border-color)" }}
                      />
                    </Tooltip>
                  ) : (
                    <Button
                      onClick={() => setClosedGroups((prev) => ({ ...prev, [group.id]: isOpen }))}
                      aria-expanded={isOpen}
                      aria-controls={"dashboard-nav-" + group.id}
                      aria-label={(isOpen ? "Collapse " : "Expand ") + displayGroupTitle(group.title) + " group"}
                      endIcon={<ExpandMoreRoundedIcon sx={{
                        fontSize: "18px !important",
                        transform: isOpen ? "rotate(180deg)" : "none",
                        transition: reduceMotion ? "none" : "transform 150ms ease",
                      }} />}
                      sx={{
                        minWidth: 0,
                        width: "100%",
                        minHeight: 36,
                        px: 1.05,
                        mb: 0.45,
                        display: "flex",
                        justifyContent: "space-between",
                        borderRadius: "8px",
                        color: "var(--ct-text-secondary)",
                        textTransform: "uppercase",
                        textAlign: "left",
                        letterSpacing: ".06em",
                        fontSize: 10.5,
                        fontWeight: 600,
                        "& .MuiButton-endIcon": { ml: 0.5, color: "var(--ct-text-secondary)" },
                        "&:hover": { bgcolor: "var(--ct-hover-bg)", color: "var(--ct-text-primary)" },
                        "&:focus-visible": { outline: "2px solid var(--ct-sidebar-accent)", outlineOffset: 1 },
                      }}
                    >
                      {displayGroupTitle(group.title)}
                    </Button>
                  )}
                  <Collapse id={"dashboard-nav-" + group.id} in={collapsed || isOpen} timeout={reduceMotion ? 0 : 150} unmountOnExit>
                    <Stack spacing={0.35} role="group" aria-label={group.title}>
                      {group.items.map(renderItem)}
                    </Stack>
                  </Collapse>
                </Box>
              );
            })}
          </Stack>
        </Box>

        {utilities.length > 0 && (
          <Box sx={{
            flexShrink: 0,
            borderTop: "1px solid var(--ct-border-color)",
            px: collapsed ? 1 : 1.5,
            py: 1,
            bgcolor: "var(--ct-surface-bg)",
          }}>
            {utilities.map(renderUtility)}
          </Box>
        )}
      </Box>

      <Menu
        anchorEl={flyout?.anchor ?? null}
        open={Boolean(flyout && collapsed)}
        onClose={() => setFlyout(null)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: {
              ml: 1,
              width: 256,
              maxHeight: "min(70dvh, 520px)",
              bgcolor: "var(--ct-elevated-bg)",
              border: "1px solid var(--ct-border-color)",
              color: "var(--ct-text-primary)",
              borderRadius: "14px",
              boxShadow: "0 18px 48px rgba(6,18,58,.16)",
              "--ct-sidebar-accent": isDark ? "#C8B5FF" : "var(--ct-dashboard-accent)",
              "--ct-sidebar-selected": isDark ? "rgba(130, 102, 232, .24)" : "var(--ct-dashboard-soft)",
              "--ct-sidebar-icon": isDark ? "rgba(130, 102, 232, .18)" : "var(--ct-soft-primary)",
            },
          },
          list: { "aria-label": flyout?.item.label + " pages", sx: { p: 1 } },
        }}
      >
        {flyout && [
          { label: flyout.item.label, path: flyout.item.path, icon: flyout.item.icon },
          ...flyout.item.children,
        ].map((item) => (
          <MenuItem
            key={item.path}
            selected={item.path === activePath}
            onClick={() => navigateTo(item.path)}
            sx={{
              minHeight: 44,
              borderRadius: "9px",
              gap: 1,
              my: 0.15,
              color: item.path === activePath ? "var(--ct-sidebar-accent)" : "var(--ct-text-primary)",
              "&.Mui-selected": { bgcolor: "var(--ct-sidebar-selected)" },
              "&:hover": { bgcolor: "var(--ct-hover-bg)" },
            }}
          >
            <NavSymbol icon={item.icon} active={item.path === activePath} small />
            <Typography sx={{ minWidth: 0, fontSize: 13.5, fontWeight: item.path === activePath ? 800 : 650, lineHeight: 1.45, overflowWrap: "anywhere" }}>
              {item.label}
            </Typography>
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}
