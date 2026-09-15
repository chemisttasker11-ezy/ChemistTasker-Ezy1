import { SxProps, Theme, lighten } from "@mui/material";

// footer wrapper
export const footerWrapperStyles: SxProps<Theme> = (theme: Theme) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: { xs: "initial", md: "10rem" },
  backgroundColor: lighten(theme.palette.grayishBlue.main, 0.8),
  py: { xs: 4, md: 0 },
  mt: { xs: 10, md: 0 },
});

// footer container (inside the wrapper)
export const footerContainerStyles: SxProps = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexDirection: { xs: "column", md: "row" },
};

// footer link container
export const footerLinkContainerStyles: SxProps = {
  my: { xs: 5, md: 0 },
  flexDirection: { xs: "column", md: "row" },
  columnGap: { md: 10 },
  rowGap: { xs: 3 },
};

// footer button
export const footerButtonStyles: SxProps<Theme> = (theme) => ({
  transition: theme.transitions.create(["filter"], {
    duration: theme.transitions.duration.standard,
  }),
  "&:hover": { backgroundColor: "transparent", filter: "brightness(115%)" },
});
