import { SxProps, Theme } from "@mui/material";

// paper subtitle text
export const paperSubTitleStyles: SxProps<Theme> = (theme: Theme) => ({
  color: theme.palette.grayishBlue.main,
  mt: 2,
  maxWidth: "20rem",
  mx: "auto",
});

// card paper
export const paperStyles: SxProps = {
  textAlign: "center",
  height: "100%",
  p: 2,
  backgroundColor: "transparent",
};
