import type { SxProps, Theme } from "@mui/material/styles";

export const dashboardPageSx: SxProps<Theme> = {
  width: "100%",
  mx: "auto",
  maxWidth: 1660,
  color: "#06123A",
  fontFamily: '"DM Sans Variable", "DM Sans", "Barlow", Arial, sans-serif',
  display: "flex",
  flexDirection: "column",
  gap: { xs: 2, md: 3, xl: 3.5 },
  minWidth: 0,
};

export const dashboardContentShellSx: SxProps<Theme> = {
  display: "grid",
  gridTemplateColumns: {
    xs: "1fr",
    xl: "minmax(0, 1fr) minmax(320px, 388px)",
  },
  gap: { xs: 2, md: 2.5, xl: 3 },
  alignItems: "start",
  minWidth: 0,
};

export const dashboardMainStackSx: SxProps<Theme> = {
  minWidth: 0,
};

export const dashboardSidebarSx: SxProps<Theme> = {
  minWidth: 0,
};

export const dashboardHeroSx: SxProps<Theme> = {
  p: { xs: 2, sm: 3, md: 3, xl: 4 },
  minHeight: { xs: "auto", md: 260, xl: 290 },
  borderRadius: { xs: "18px", md: "22px" },
};

export const dashboardActionGridSx: SxProps<Theme> = {
  display: "grid",
  gridTemplateColumns: {
    xs: "1fr",
    sm: "repeat(2, minmax(0, 1fr))",
    lg: "repeat(3, minmax(0, 1fr))",
    xl: "repeat(4, minmax(0, 1fr))",
  },
  gap: { xs: 1.5, md: 2, xl: 2.5 },
  minWidth: 0,
};

export const dashboardActionCardSx: SxProps<Theme> = {
  minHeight: { xs: 132, md: 176, xl: 196 },
  p: { xs: 2, md: 2.5, xl: 3 },
};

export const dashboardMetricGridSx: SxProps<Theme> = {
  display: "grid",
  gridTemplateColumns: {
    xs: "1fr",
    sm: "repeat(2, minmax(0, 1fr))",
    xl: "repeat(4, minmax(0, 1fr))",
  },
  overflow: "hidden",
};

export const dashboardMetricItemSx: SxProps<Theme> = {
  minHeight: { xs: 104, md: 120, xl: 132 },
  px: { xs: 2, md: 3, xl: 4 },
  py: { xs: 2, md: 2.25, xl: 2.5 },
};
