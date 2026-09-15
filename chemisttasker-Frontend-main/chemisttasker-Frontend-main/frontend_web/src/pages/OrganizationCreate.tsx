import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Button,
  Container,
  Paper,
  TextField,
  Typography,
  CircularProgress,
  Alert,
  Box,
  Link,
} from '@mui/material';
import { createOrganization } from '@chemisttasker/shared-core';

export default function OrganizationCreate() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Organization name is required');
      return;
    }
    setLoading(true);
    try {
      await createOrganization({ name });
      navigate('/organizations'); // or wherever you list orgs
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={3} sx={{ p: 4, borderRadius: 3 }}>
        <Typography variant="h4" mb={3} textAlign="center">
          New Organization
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            margin="normal"
            label="Organization Name"
            value={name}
            onChange={e => setName(e.target.value)}
          />

          <Box mt={3}>
            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={loading}
              sx={{ py: 1.5 }}
            >
              {loading ? <CircularProgress size={24} /> : 'Create'}
            </Button>
          </Box>
        </form>

        <Box mt={2} textAlign="center">
          <Link component={RouterLink} to="/">
            Back to Dashboard
          </Link>
        </Box>
      </Paper>
    </Container>
  );
}
