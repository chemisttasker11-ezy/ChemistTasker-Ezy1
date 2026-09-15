
import { Button, Typography, Box } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout'; // Make sure this path is correct

export default function NotFoundPage() {
  return (
    <AuthLayout title="Oops!">
      <Box sx={{ textAlign: 'center' }}>
        <Typography 
          variant="h1" 
          component="div" 
          sx={{ 
            fontWeight: 800, 
            fontSize: { xs: '6rem', md: '8rem' },
            color: 'primary.main', // Uses the theme's teal color
            lineHeight: 1,
            textShadow: '2px 2px 8px rgba(0,0,0,0.1)'
          }}
        >
          404
        </Typography>
        <Typography variant="h5" sx={{ my: 2, fontWeight: 600 }}>
          Page Not Found
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          Sorry, we couldn’t find the page you’re looking for. It might have been moved or deleted.
        </Typography>
        <Button
          component={RouterLink}
          to="/" // Links to the homepage. Change to "/login" if you prefer.
          variant="contained"
          sx={{ 
            py: 1.5, 
            px: 5,
            backgroundColor: '#00a99d',
            '&:hover': {
                backgroundColor: '#00877d'
            }
          }}
        >
          Go Home
        </Button>
      </Box>
    </AuthLayout>
  );
}
