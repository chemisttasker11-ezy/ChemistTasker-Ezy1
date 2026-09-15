import '@mui/material/styles';

declare module '@mui/material/styles' {
  interface Palette {
    grayishBlue: Palette['primary'];
    darkGrayishBlue: Palette['primary'];
  }

  interface PaletteOptions {
    grayishBlue?: PaletteOptions['primary'];
    darkGrayishBlue?: PaletteOptions['primary'];
  }
}

declare module '@mui/material/Button' {
  interface ButtonPropsColorOverrides {
    grayishBlue: true;
    darkGrayishBlue: true;
  }
}
