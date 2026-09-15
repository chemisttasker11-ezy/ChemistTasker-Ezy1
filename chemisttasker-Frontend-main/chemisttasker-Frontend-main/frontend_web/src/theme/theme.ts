import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2', // Customize color
    },
    secondary: {
      main: '#9c27b0',
    },
    grayishBlue: {
      main: '#90a4ae',
    },
    darkGrayishBlue: {
      main: '#546e7a',
    },
  },
  typography: {
    fontFamily: 'Roboto, Arial',
  },
});

export default theme;
