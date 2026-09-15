import { SxProps, Theme, lighten } from "@mui/material";
import { SxPropsFunc } from "../styles/global";

export const navContainerStyles: SxProps = {
  alignItems: "center",
  justifyContent: "center",
  position: "fixed",
  right: { xs: "1rem", md: "3rem" },
  top: "50%",
  transform: "translateY(-50%)",
  rowGap: 2,
};

// using "SxPropsFunc<Theme>" type here because it's needed when merging styles
export const circleStyles: SxPropsFunc<Theme> = (theme: Theme) => ({
  position: "relative",
  borderRadius: "50%",
  minWidth: 0,
  p: 0,
  transform: "scale(1)",
  transition: theme.transitions.create(["background-color", "transform"], {
    duration: theme.transitions.duration.standard,
  }),
  // apply only when it's the active button (the same page is in view)
  "&:hover[data-active='true']": {
    backgroundColor: theme.palette.darkGrayishBlue.main,
  },
  // apply only when it's not the active button (the same page is not in view)
  "&:hover:not([data-active='true'])": {
    backgroundColor: lighten(theme.palette.darkGrayishBlue.main, 0.3),
    transform: "scale(1.5)",
  },
  // increasing clickable area of the circle links
  "&::before": {
    content: "''",
    position: "absolute",
    inset: "-0.7rem",
    backgroundColor: "transparent",
    borderRadius: "50%",
  },
  // for accessibility
  "&:focus-visible": {
    outline: "2px solid black",
  },
});

export const arrowStyles: SxProps<Theme> = (theme) => ({
  width: "1.5rem",
  height: "1.5rem",
  minWidth: 0,
  overflow: "hidden",
  p: 0,
  my: 1.5,
  fontSize: "3.5rem",
  color: lighten(theme.palette.grayishBlue.main, 0.3),
  transition: theme.transitions.create(["color", "font-size"], {
    duration: theme.transitions.duration.standard,
  }),
  "&:hover": {
    color: lighten(theme.palette.darkGrayishBlue.main, 0.3),
    fontSize: "4.25rem",
    backgroundColor: "transparent",
  },
  // for feedback when button is pressed
  "&:active": {
    color: theme.palette.darkGrayishBlue.main,
  },
  // lighten color when disabled
  "&:disabled": {
    color: lighten(theme.palette.darkGrayishBlue.main, 0.8),
  },
  // for accessibility
  "&:focus-visible": {
    outline: "2px solid black",
  },
});
