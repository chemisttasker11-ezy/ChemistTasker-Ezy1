import React from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import ActiveShiftsPage from './ActiveShiftsPage';

const PosterShiftDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const shiftId = id ? Number(id) : null;

  if (!shiftId || Number.isNaN(shiftId)) {
    return (
      <Box sx={{ px: { xs: 1.5, md: 3 }, py: 3 }}>
        <Typography color="text.secondary">Shift not found.</Typography>
      </Box>
    );
  }

  return <ActiveShiftsPage shiftId={shiftId} title="Shift Details" />;
};

export default PosterShiftDetailPage;
