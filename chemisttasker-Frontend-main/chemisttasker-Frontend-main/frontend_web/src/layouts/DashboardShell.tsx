import { PropsWithChildren, useCallback } from "react";
import Box from "@mui/material/Box";
import GlobalStyles from "@mui/material/GlobalStyles";
import { alpha } from "@mui/material/styles";
import IconButton from "@mui/material/IconButton";
import KeyboardDoubleArrowRightIcon from "@mui/icons-material/KeyboardDoubleArrowRight";

export default function DashboardShell({ children }: PropsWithChildren) {
  const handleExpandClick = useCallback(() => {
    if (typeof document === "undefined") {
      return;
    }
    const expandButton = document.querySelector<HTMLButtonElement>('[aria-label^="Expand navigation menu"]');
    expandButton?.click();
  }, []);

  return (
    <>
      <GlobalStyles
        styles={(theme) => {
          const navDrawerBaseSelector = '[data-dashboard-shell-nav="true"].MuiDrawer-root.MuiDrawer-docked';
          const navDrawerSelector = `[data-dashboard-shell] ${navDrawerBaseSelector}`;
          const navDrawerPaperSelector = `${navDrawerSelector} .MuiDrawer-paper`;
          const collapsedNavDrawerSelector = `[data-dashboard-shell].dashboard-shell--collapsed ${navDrawerBaseSelector}`;
          const collapsedNavDrawerPaperSelector = `${collapsedNavDrawerSelector} .MuiDrawer-paper`;
          const collapsedNavSelector = `${collapsedNavDrawerSelector} nav`;
          const collapsedToolbarSelector = `${collapsedNavDrawerSelector} .MuiToolbar-root`;
          const collapsedExpandButtonSelector =
            '[data-dashboard-shell].dashboard-shell--collapsed button[aria-label^="Expand navigation menu"]';
          const collapseButtonSelector = '[data-dashboard-shell] button[aria-label^="Collapse navigation menu"]';
          const navigationButtonSelector = '[data-dashboard-shell] button[aria-label$="navigation menu"]';
          const sidebarHandleSelector = '[data-dashboard-shell] [data-sidebar-handle]';
          const collapsedSidebarHandleSelector =
            '[data-dashboard-shell].dashboard-shell--collapsed [data-sidebar-handle]';
          const appBarToolbarSelector = '[data-dashboard-shell] .MuiAppBar-root .MuiToolbar-root';
          const appBarTitleSlotSelector = '[data-dashboard-shell] .MuiAppBar-root .MuiToolbar-root > :first-of-type';
          const appBarActionsSlotSelector = '[data-dashboard-shell] .MuiAppBar-root .MuiToolbar-root > :last-child';
          const contentPaperSelector = '[data-dashboard-shell] main .MuiPaper-root';

          return {
            [navDrawerSelector]: {
              transition: theme.transitions.create("width", {
                duration: theme.transitions.duration.shorter,
              }),
            },
            [navDrawerPaperSelector]: {
              transition: theme.transitions.create("width", {
                duration: theme.transitions.duration.shorter,
              }),
            },
            [collapsedNavDrawerSelector]: {
              width: theme.spacing(2.25),
              border: "none",
            },
            [collapsedNavDrawerPaperSelector]: {
              width: theme.spacing(2.25),
              borderRight: "none",
              overflow: "hidden",
              position: "relative",
              backgroundColor: alpha(theme.palette.primary.main, 0.06),
              "&::after": {
                content: '""',
                position: "absolute",
                top: "50%",
                right: "-14px",
                transform: "translateY(-50%)",
                width: theme.spacing(3),
                height: theme.spacing(9),
                borderRadius: "0 12px 12px 0",
                background: theme.palette.background.paper,
                boxShadow: theme.shadows[6],
                border: `1px solid ${alpha(theme.palette.primary.main, 0.25)}`,
                pointerEvents: "none",
              },
            },
            [collapsedNavSelector]: {
              visibility: "hidden",
              pointerEvents: "none",
            },
            [collapsedToolbarSelector]: {
              minHeight: 0,
              visibility: "hidden",
            },
            [collapsedExpandButtonSelector]: {
              minWidth: theme.spacing(4),
              padding: theme.spacing(0.5),
              borderRadius: 999,
              boxShadow: theme.shadows[6],
              background: theme.palette.background.paper,
              color: theme.palette.text.primary,
              "& svg": {
                fontSize: "1.1rem",
              },
              "&::after": {
                content: '""',
              },
            },
            [collapseButtonSelector]: {
              borderRadius: 999,
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.06em",
              display: "inline-flex",
              alignItems: "center",
              gap: theme.spacing(1),
              "&::after": {
                content: '"Close"',
              },
            },
            [navigationButtonSelector]: {
              transition: theme.transitions.create(["background-color", "box-shadow", "color"], {
                duration: theme.transitions.duration.shortest,
              }),
            },
            [contentPaperSelector]: {
              transition: theme.transitions.create(["box-shadow", "transform", "border-color"], {
                duration: theme.transitions.duration.shortest,
              }),
            },
            [sidebarHandleSelector]: {
              display: "none",
              position: "fixed",
              top: "50%",
              left: theme.spacing(2.25),
              transform: "translateY(-50%)",
              zIndex: theme.zIndex.drawer + 2,
              boxShadow: theme.shadows[6],
              background: "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(239,247,255,0.98) 100%)",
              border: `1px solid ${alpha(theme.palette.primary.main, 0.22)}`,
              color: theme.palette.primary.main,
              "&:hover": {
                backgroundColor: alpha(theme.palette.primary.main, 0.12),
                boxShadow: theme.shadows[10],
              },
            },
            [collapsedSidebarHandleSelector]: {
              display: "flex",
            },
            [theme.breakpoints.down("sm")]: {
              [appBarToolbarSelector]: {
                alignItems: "flex-start",
                flexWrap: "wrap",
                rowGap: theme.spacing(1),
                columnGap: theme.spacing(1),
                paddingTop: theme.spacing(1),
                paddingBottom: theme.spacing(1),
              },
              [appBarTitleSlotSelector]: {
                flex: "1 1 100%",
                minWidth: 0,
              },
              [appBarActionsSlotSelector]: {
                width: "100%",
                minWidth: 0,
                display: "flex",
                justifyContent: "flex-start",
              },
            },
          };
        }}
      />
      <Box
        data-dashboard-shell
        sx={{
          minHeight: "100vh",
          position: "relative",
          isolation: "isolate",
          background:
            "radial-gradient(circle at top left, rgba(20,62,234,0.08) 0, transparent 30%), radial-gradient(circle at top right, rgba(234,10,142,0.07) 0, transparent 34%), linear-gradient(180deg, #F8FBFF 0%, #F4F8FF 100%)",
        }}
      >
        {children}
        <IconButton
          data-sidebar-handle
          size="small"
          aria-label="Expand navigation menu from edge"
          onClick={handleExpandClick}
        >
          <KeyboardDoubleArrowRightIcon fontSize="small" />
        </IconButton>
      </Box>
    </>
  );
}
