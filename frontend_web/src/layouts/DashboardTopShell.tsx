import { type ReactNode, useState } from "react";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { Box, Button, IconButton, Stack, Typography, useTheme } from "@mui/material";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import TopBarActions from "./TopBarActions";
import DashboardSideNav, { useActiveDashboardPageLabel } from "./DashboardSideNav";
import menuLogo from "../assets/clipsnap-edit-6-1-2026.png";
import { dashboardTitleForRole } from "../utils/roleLabels";
import { publicSiteHomeUrl } from "../components/PublicRouteBridge";
import { accentForScope } from "./dashboardShell/shellModel";
import DashboardMegaMenu from "./dashboardShell/DashboardMegaMenu";
import DashboardPharmacySelector from "./dashboardShell/DashboardPharmacySelector";
import DashboardPersonaSwitcher from "./dashboardShell/DashboardPersonaSwitcher";
import { useDashboardWorkspaceScope } from "./dashboardShell/useDashboardWorkspaceScope";

export default function DashboardTopShell({
  children,
  titleOverride,
  forceAdminScope = false,
}: {
  children: ReactNode;
  titleOverride?: string;
  forceAdminScope?: boolean;
}) {
  const scope = useDashboardWorkspaceScope(forceAdminScope);
  const { user, workspace, selectedPharmacyId, otherStaffRoleType, showPharmacySelector, hasOwnPersona, isAdminUser } = scope;
  const isDark = useTheme().palette.mode === "dark";
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const activePageLabel = useActiveDashboardPageLabel();
  const title = titleOverride ?? (activePageLabel && activePageLabel !== "Overview"
    ? activePageLabel : dashboardTitleForRole(forceAdminScope ? "ADMIN" : user?.role, otherStaffRoleType));
  const accent = accentForScope(selectedPharmacyId, forceAdminScope ? "internal" : workspace);

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box
        sx={{
          "--ct-dashboard-gradient": accent.gradient,
          "--ct-dashboard-soft": isDark ? "rgba(130,102,232,.24)" : accent.soft,
          "--ct-dashboard-accent": isDark ? "#C8B5FF" : accent.text,
          "--ct-dashboard-card-bg": "var(--ct-surface-bg)",
          "--ct-dashboard-card-border": "var(--ct-border-color)",
          "--ct-dashboard-card-shadow": "0 8px 24px rgba(6, 18, 58, 0.04)",
          "--ct-dashboard-card-shadow-hover": "0 18px 42px rgba(6, 18, 58, 0.10)",
          "--ct-dashboard-icon-bg": isDark ? "rgba(130,102,232,.18)" : "#EFE7FF",
          "--ct-dashboard-title": "var(--ct-text-primary)",
          "--ct-dashboard-muted": "var(--ct-text-secondary)",
          minHeight: "100vh",
          width: "100%",
          minWidth: 0,
          maxWidth: "100%",
          overflowX: "clip",
          bgcolor: "var(--ct-page-bg)",
          color: "var(--ct-text-primary)",
          fontFamily: "var(--ct-font-body)",
          position: "relative",
          isolation: "isolate",
          "&::before": {
            content: '""',
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(circle at 0% 0%, rgba(20,62,234,0.08) 0, transparent 28%), radial-gradient(circle at 100% 0%, rgba(234,10,142,0.08) 0, transparent 28%), radial-gradient(circle at 50% 100%, rgba(8,190,234,0.06) 0, transparent 24%)",
            zIndex: -2,
          },
          "&::after": {
            content: '""',
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 22%, rgba(255,255,255,0.1) 100%)",
            zIndex: -1,
          },
        }}
      >
      <Box sx={{ display: "flex", width: "100%", minWidth: 0 }}>
      <DashboardSideNav selectedPharmacyId={selectedPharmacyId} />
      <Box sx={{ flex: "1 1 0%", minWidth: 0, display: "flex", flexDirection: "column" }}>
      <Box
        component="header"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 1200,
          display: "flex",
          justifyContent: "center",
          alignItems: "stretch",
          minWidth: 0,
          maxWidth: "100%",
          minHeight: { xs: 72, md: 85 },
          background: "rgba(255,255,255,0.93)",
          backdropFilter: "blur(15px)",
          borderBottom: "1px solid #EDF0F5",
          boxShadow: "0 6px 18px rgba(6,18,58,0.035)",
        }}
      >
        <Stack
          direction="row"
          alignItems="stretch"
          justifyContent="center"
          sx={{
            width: "100%",
            maxWidth: 1660,
            minWidth: 0,
            boxSizing: "border-box",
            minHeight: { xs: 72, md: 85 },
            px: { xs: 1.5, sm: 2.25, md: 2.5, xl: 4 },
          }}
        >
        <Box
          sx={{
            width: { xs: 112, md: 132 },
            flex: "0 0 auto",
            display: { xs: "flex", lg: "none" },
            alignItems: "center",
          }}
        >
          <Button
            href={publicSiteHomeUrl()}
            aria-label="ChemistTasker home"
            sx={{
              width: "100%",
              minWidth: 0,
              minHeight: 44,
              p: 0,
              justifyContent: "flex-start",
              borderRadius: 1.5,
              "&:hover": { bgcolor: "transparent", opacity: 0.88 },
              "&:focus-visible": {
                outline: "3px solid rgba(0,141,219,.28)",
                outlineOffset: 3,
              },
            }}
          >
            <Box
              component="img"
              src={menuLogo}
              alt="ChemistTasker"
              sx={{
                display: "block",
                width: { xs: 112, md: 132 },
                height: "auto",
                objectFit: "contain",
              }}
            />
          </Button>
        </Box>
        <DashboardMegaMenu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
          selectedPharmacyId={selectedPharmacyId}
        />

        <Box
          sx={{
            minWidth: 0,
            flex: 1,
            display: "grid",
            // Phones and small tablets: icons on the first row, menu + pharmacy selector on a full-width second
            // row, so the selector never collapses to nothing beside the actions.
            gridTemplateColumns: {
              xs: "minmax(0, 1fr)",
              md: "minmax(0, 1fr) auto",
              lg: "minmax(210px, 300px) minmax(0, 1fr) minmax(0, auto)",
              xl: "minmax(280px, 360px) minmax(0, 1fr) minmax(0, auto)",
            },
            gridTemplateAreas: {
              xs: '"actions" "scope"',
              md: '"scope actions"',
              lg: '"scope title actions"',
            },
            alignItems: "center",
            columnGap: { xs: 0.75, md: 1.25, xl: 2 },
            rowGap: { xs: 0.75, md: 0 },
            py: { xs: 0.75, md: 0 },
            px: { xs: 0.75, md: 1.5, xl: 2.5 },
            minHeight: { xs: 72, md: 85 },
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent={{ xs: "flex-start", md: "flex-end", lg: "flex-start" }}
            spacing={1}
            sx={{
              gridArea: "scope",
              minWidth: 0,
              maxWidth: "100%",
              overflowX: "auto",
              overflowY: "hidden",
              scrollbarWidth: "none",
              "&::-webkit-scrollbar": { display: "none" },
            }}
          >
          <IconButton
            aria-label="Open dashboard navigation"
            aria-expanded={Boolean(menuAnchor)}
            onClick={(event) => setMenuAnchor(event.currentTarget)}
            sx={{
              display: { xs: "inline-flex", lg: "none" },
              width: 44,
              height: 44,
              flex: "0 0 auto",
              color: "var(--ct-text-primary)",
              border: "1px solid var(--ct-border-color)",
              bgcolor: "var(--ct-surface-bg)",
              "&:hover": { bgcolor: "var(--ct-hover-bg)" },
              "&:focus-visible": {
                outline: "3px solid rgba(0,141,219,.28)",
                outlineOffset: 1,
              },
            }}
          >
            <MenuRoundedIcon />
          </IconButton>
          {showPharmacySelector && <DashboardPharmacySelector scope={scope} />}
          {hasOwnPersona && isAdminUser && <DashboardPersonaSwitcher scope={scope} />}
          </Stack>

          <Box
            sx={{
              gridArea: "title",
              minWidth: 0,
              display: { xs: "none", lg: "block" },
              textAlign: "left",
              justifySelf: "start",
              width: "100%",
              maxWidth: "100%",
            }}
          >
            <Typography noWrap sx={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ct-dashboard-accent)" }}>
              {forceAdminScope ? "Internal Workspace" : workspace === "platform" ? "Public Platform" : "Internal Workspace"}
            </Typography>
            <Typography component="div" noWrap sx={{ fontFamily: "var(--ct-font-display)", fontSize: 19, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.2, color: "var(--ct-text-primary)" }}>
              {title}
            </Typography>
          </Box>

          <Stack
            direction="row"
            alignItems="center"
            justifyContent={{ xs: "flex-start", md: "flex-start" }}
            spacing={{ xs: 0.5, md: 1 }}
            sx={{
              gridArea: "actions",
              minWidth: 0,
              justifySelf: "end",
              display: "flex",
              width: "auto",
              maxWidth: "100%",
            }}
          >
            <TopBarActions
              iconSx={{
                width: { xs: 44, md: 46 },
                height: { xs: 44, md: 46 },
                bgcolor: "var(--ct-surface-bg)",
                color: "var(--ct-text-secondary)",
                boxShadow: "0 3px 12px rgba(6,18,58,0.05)",
                "&:hover": { bgcolor: "var(--ct-hover-bg)", color: "var(--ct-dashboard-accent)" },
              }}
            />
          </Stack>
        </Box>
        </Stack>
      </Box>

        <Box
          component="main"
          sx={{
            width: "100%",
            flex: "1 1 0%",
            maxWidth: "100%",
            minWidth: 0,
            mx: "auto",
            px: { xs: 1.5, sm: 2, md: 3, xl: 4 },
            py: { xs: 2, md: 3.5 },
            overflowX: "hidden",
            position: "relative",
            zIndex: 1,
            "& .MuiPaper-root": {
              borderColor: "var(--ct-border-color)",
            },
          }}
        >
          {children}
        </Box>
      </Box>
      </Box>
      </Box>
    </LocalizationProvider>
  );
}
