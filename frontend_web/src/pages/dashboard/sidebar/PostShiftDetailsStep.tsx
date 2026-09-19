import type { Dispatch, SetStateAction } from 'react';
import {
  Button,
  Checkbox,
  Chip,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import type {
  PharmacyOption,
  ShiftDescriptionTemplate,
} from './PostShiftPage.helpers';

type Setter<T> = Dispatch<SetStateAction<T>>;

type Props = {
  isDarkMode: boolean;
  isEmbedded: boolean;
  pharmacies: PharmacyOption[];
  pharmacyId: number | '';
  setPharmacyId: Setter<number | ''>;
  scopedPharmacyId: number | null;
  roleNeeded: string;
  setRoleNeeded: Setter<string>;
  employmentType: string;
  setEmploymentType: Setter<string>;
  descriptionTemplateLoading: boolean;
  descriptionTemplate: ShiftDescriptionTemplate | null;
  descriptionTemplateSaving: boolean;
  handleUseDescriptionTemplate: () => void;
  handleSaveDescriptionTemplate: () => void | Promise<void>;
  description: string;
  setDescription: Setter<string>;
  hasTravel: boolean;
  setHasTravel: Setter<boolean>;
  hasAccommodation: boolean;
  setHasAccommodation: Setter<boolean>;
  isUrgent: boolean;
  setIsUrgent: Setter<boolean>;
  workloadTags: string[];
  setWorkloadTags: Setter<string[]>;
};

const WORKLOAD_OPTIONS = [
  'Sole Pharmacist',
  'High Script Load',
  'Webster Packs',
];

export default function PostShiftDetailsStep({
  isDarkMode,
  isEmbedded,
  pharmacies,
  pharmacyId,
  setPharmacyId,
  scopedPharmacyId,
  roleNeeded,
  setRoleNeeded,
  employmentType,
  setEmploymentType,
  descriptionTemplateLoading,
  descriptionTemplate,
  descriptionTemplateSaving,
  handleUseDescriptionTemplate,
  handleSaveDescriptionTemplate,
  description,
  setDescription,
  hasTravel,
  setHasTravel,
  hasAccommodation,
  setHasAccommodation,
  isUrgent,
  setIsUrgent,
  workloadTags,
  setWorkloadTags,
}: Props) {
  const fieldSx = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 2,
      bgcolor: isDarkMode ? 'rgba(15, 23, 42, 0.78)' : 'background.paper',
    },
  };

  const embeddedPanelSx = isEmbedded
    ? {
        p: 1.5,
        borderRadius: 2,
        borderColor: 'rgba(15, 23, 42, 0.08)',
        bgcolor: 'transparent',
        boxShadow: 'none',
      }
    : {
        p: 2,
        borderRadius: 3,
        borderColor: 'grey.200',
      };

  return (
    <Grid container rowSpacing={3} columnSpacing={{ xs: 0, md: 3 }}>
      <Grid size={12}>
        <FormControl fullWidth size="small" sx={fieldSx}>
          <InputLabel>Pharmacy *</InputLabel>
          <Select
            value={pharmacyId}
            label="Pharmacy *"
            onChange={(event) => setPharmacyId(Number(event.target.value))}
            disabled={scopedPharmacyId != null}
          >
            {pharmacies.map((pharmacy) => (
              <MenuItem key={pharmacy.id} value={pharmacy.id}>
                {pharmacy.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <FormControl fullWidth size="small" sx={fieldSx}>
          <InputLabel>Role Needed *</InputLabel>
          <Select
            value={roleNeeded}
            label="Role Needed *"
            onChange={(event) => setRoleNeeded(event.target.value)}
          >
            <MenuItem value="PHARMACIST">Pharmacist</MenuItem>
            <MenuItem value="TECHNICIAN">Dispensary Technician</MenuItem>
            <MenuItem value="ASSISTANT">Assistant</MenuItem>
            <MenuItem value="INTERN">Intern Pharmacist</MenuItem>
            <MenuItem value="STUDENT">Pharmacy Student</MenuItem>
            <MenuItem value="EXPLORER">Explorer</MenuItem>
          </Select>
        </FormControl>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <FormControl fullWidth size="small" sx={fieldSx}>
          <InputLabel>Employment Type *</InputLabel>
          <Select
            value={employmentType}
            label="Employment Type *"
            onChange={(event) => setEmploymentType(event.target.value)}
          >
            <MenuItem value="LOCUM">
              {roleNeeded === 'PHARMACIST' ? 'Locum' : 'Casual'}
            </MenuItem>
            <MenuItem value="FULL_TIME">Full-Time</MenuItem>
            <MenuItem value="PART_TIME">Part-Time</MenuItem>
          </Select>
        </FormControl>
      </Grid>

      <Grid size={12}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', sm: 'center' }}
          sx={{ mb: 1 }}
        >
          <Typography variant="subtitle2" color="text.secondary">
            {descriptionTemplateLoading
              ? 'Loading role description template...'
              : descriptionTemplate?.description
                ? 'Role description template available'
                : 'No role description template saved yet'}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              disabled={!descriptionTemplate?.description}
              onClick={handleUseDescriptionTemplate}
            >
              Use Template
            </Button>
            <Button
              size="small"
              variant="contained"
              disabled={
                descriptionTemplateSaving ||
                !pharmacyId ||
                !roleNeeded ||
                !description.trim()
              }
              onClick={handleSaveDescriptionTemplate}
            >
              {descriptionTemplateSaving ? 'Saving...' : 'Save as Template'}
            </Button>
          </Stack>
        </Stack>

        <TextField
          label="Shift Description"
          multiline
          minRows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          fullWidth
          placeholder="Provide key responsibilities or context..."
          size="small"
          sx={fieldSx}
        />
      </Grid>

      <Grid size={12}>
        <Paper variant="outlined" sx={embeddedPanelSx}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Shift Flags
          </Typography>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={isEmbedded ? 1.5 : 2}
          >
            <FormControlLabel
              control={
                <Checkbox
                  checked={hasTravel}
                  onChange={(_, checked) => setHasTravel(checked)}
                />
              }
              label="Travel allowance"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={hasAccommodation}
                  onChange={(_, checked) => setHasAccommodation(checked)}
                />
              }
              label="Accommodation provided"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={isUrgent}
                  onChange={(_, checked) => setIsUrgent(checked)}
                />
              }
              label="Mark as urgent"
            />
          </Stack>
        </Paper>
      </Grid>

      <Grid size={12}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Workload Tags
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={1.5}>
          {WORKLOAD_OPTIONS.map((tag) => {
            const selected = workloadTags.includes(tag);
            return (
              <Chip
                key={tag}
                label={tag}
                onClick={() =>
                  setWorkloadTags((current) =>
                    selected
                      ? current.filter((value) => value !== tag)
                      : [...current, tag],
                  )
                }
                variant={selected ? 'filled' : 'outlined'}
                color={selected ? 'primary' : 'default'}
                clickable
                sx={{
                  borderRadius: '999px',
                  fontWeight: 600,
                  px: 1.5,
                  py: 0.5,
                }}
              />
            );
          })}
        </Stack>
      </Grid>
    </Grid>
  );
}
