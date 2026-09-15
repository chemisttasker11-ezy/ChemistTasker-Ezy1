import { SxProps, Theme } from "@mui/material";

// types

export type sectionRefType = (node?: Element | null | undefined) => void;

// styles

export const rootContainerStyles: SxProps<Theme> = (theme) => ({
  color: theme.palette.darkGrayishBlue.main,
  scrollSnapType: { md: "y mandatory" },
  overflowY: "scroll",
  height: "100vh",
  "&::-webkit-scrollbar": {
    display: { md: "none" },
  },
  scrollBehavior: "smooth",
});
