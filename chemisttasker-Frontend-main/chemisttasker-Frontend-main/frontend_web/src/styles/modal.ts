import { SxProps, Theme } from "@mui/material";

export const paperStyles: SxProps = {
  borderRadius: "1rem",
  textAlign: "center",
  px: { xs: 1, md: 4 },
  pt: { xs: 1, md: 2 },
  pb: { xs: 2, md: 4 },
};

export const titleStyles: SxProps<Theme> = (theme) => ({
  color: theme.palette.darkGrayishBlue.main,
  pt: { xs: 0, md: 1 },
  fontSize: { xs: 24, md: 28 },
  fontWeight: 600,
});

export const iconContainerStyles: SxProps = {
  "& svg": { fontSize: { xs: 28, md: 32 } },
  rowGap: { xs: 2, md: 0 },
  columnGap: { xs: 4, md: 4 },
  flexWrap: "wrap",
  width: { xs: "10rem", sm: "auto" },
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "row",
};
