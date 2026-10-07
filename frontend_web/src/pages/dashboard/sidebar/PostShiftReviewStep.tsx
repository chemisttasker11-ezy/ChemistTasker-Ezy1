import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { EditOutlined } from '@mui/icons-material';
import type { ReactNode } from 'react';

export type ShiftReviewSection = { key: string; title: string; content: ReactNode };
export default function PostShiftReviewStep({ sections, onEdit, isEditing }: { sections: ShiftReviewSection[]; onEdit: (key: string) => void; isEditing: boolean }) {
  return <Stack spacing={2.5}>
    <Typography color="text.secondary">{isEditing ? 'Check your changes before saving.' : 'Check the details below before you publish. You can edit any section.'}</Typography>
    {sections.map((section) => <Box key={section.key} sx={{ pb: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 1 }}>
        <Typography component="h3" variant="subtitle1" fontWeight={700}>{section.title}</Typography>
        <Button startIcon={<EditOutlined />} aria-label={`Edit ${section.title.toLowerCase()}`} onClick={() => onEdit(section.key)} sx={{ minHeight: 44 }}>Edit</Button>
      </Stack>
      {section.content}
    </Box>)}
    <Chip variant="outlined" label="Manage responses in Shift Centre after posting" sx={{ alignSelf: 'flex-start', height: 'auto', py: 0.5, '& .MuiChip-label': { whiteSpace: 'normal' } }} />
  </Stack>;
}
