import { SxProps, Theme } from "@mui/material";

// list header text
export const listItemHeaderStyles: SxProps = {
  textAlign: { xs: "center", md: "left" },
  fontWeight: 600,
};

// list subheader text
export const listItemSubHeaderStyle: SxProps<Theme> = (theme: Theme) => ({
  color: theme.palette.grayishBlue.main,
  mt: 1,
  maxWidth: { md: "22rem" },
  textAlign: { xs: "center", md: "left" },
});
