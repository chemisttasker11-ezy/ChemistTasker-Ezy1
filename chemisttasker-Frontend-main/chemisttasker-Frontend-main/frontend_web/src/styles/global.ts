import { SxProps, Theme } from "@mui/material";
import {
  CSSSelectorObjectOrCssVariables,
  SystemCssProperties,
  SystemStyleObject,
} from "@mui/system";

// types

export type SxPropsFunc<T extends object> = (_: T) => SystemStyleObject<T>;

export type SxPropsSpread =
  | SystemCssProperties<Theme>
  | CSSSelectorObjectOrCssVariables<Theme>;

// styles

// container with background
export const containerStylesWithBG: SxProps = {
  minWidth: "100%",
  minHeight: "100dvh",
  display: "flex",
  flexDirection: "column",
  justifyContent: { xs: "space-evenly", md: "center" },
  alignItems: "center",
  "&:not(:last-child)": {
    mb: { xs: 8, md: 0 },
  },
  backgroundImage: {
    xs: "url('images/bg-header-mobile.png')",
    md: "url('images/bg-header-desktop.png')",
  },
  backgroundPosition: "top",
  backgroundSize: "100%",
  backgroundRepeat: "no-repeat",
  textAlign: "center",
  scrollSnapAlign: { md: "start" },
  scrollSnapStop: { md: "always" },
  overflow: "hidden",
};

let {
  backgroundImage,
  backgroundPosition,
  backgroundSize,
  backgroundRepeat,
  ...containerStyles
}: SxPropsSpread = containerStylesWithBG;
// remove "min-height" on smaller screens to minimize blank space
containerStyles.minHeight = { xs: "initial", md: "100vh" };
containerStyles.justifyContent = "space-evenly";
// add margin between sections on smaller screens
containerStyles.mt = { xs: "6rem", md: 0 };
export { containerStyles };

// main page header text
export const mainHeaderStyles: SxProps<Theme> = (theme: Theme) => ({
  mt: "2.75rem",
  fontWeight: 600,
  fontSize: {
    xs: theme.typography.h4.fontSize,
    md: theme.typography.h3.fontSize,
  },
});

// header text
export const headerStyles: SxProps<Theme> = {
  lineHeight: { xs: 1.1, md: 1 },
  fontWeight: 600,
  fontSize: {
    xs: "1.75rem",
    md: "2.2rem",
  },
  mx: { xs: 2, md: 0 },
};

// main subheader text
export const mainSubHeaderStyles = (theme: Theme) => ({
  lineHeight: 1.6,
  maxWidth: "45rem",
  mx: { xs: 2, md: 0 },
  mt: "0.9rem",
  color: theme.palette.grayishBlue.main,
  fontSize: {
    xs: theme.typography.body1.fontSize,
    md: "1.3rem",
  },
});

// subheader text
export const subHeaderStyles: Array<SxPropsFunc<Theme>> = [
  mainSubHeaderStyles,
  (theme: Theme) => ({
    mt: "1.5rem",
    fontSize: {
      xs: theme.typography.body1.fontSize,
      md: "1.15rem",
    },
  }),
];
