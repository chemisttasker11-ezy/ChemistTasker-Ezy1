import React from "react";
import {
  Box,
  Button,
  Checkbox,
  Collapse,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  FlightTakeoff as FlightTakeoffIcon,
  School as SchoolIcon,
} from "@mui/icons-material";

export type TalentFilterState = {
  search: string;
  roles: string[];
  workTypes: string[];
  states: string[];
  skills: string[];
  willingToTravel: boolean;
  placementSeeker: boolean;
  availabilityStart: string | null;
  availabilityEnd: string | null;
};

const FilterSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Box sx={{ borderBottom: "1px solid", borderColor: "divider", pb: 2.5, mb: 2.5 }}>
    <Typography
      sx={{
        textTransform: "uppercase",
        color: "text.secondary",
        fontWeight: 700,
        fontSize: 12,
        letterSpacing: 1,
        mb: 1.5,
      }}
    >
      {title}
    </Typography>
    {children}
  </Box>
);

const toggleList = (list: string[], value: string) =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

export default function FiltersSidebar({
  filters,
  onChange,
  roleOptions,
  stateOptions,
  workTypeOptions,
  roleSkillOptions,
  softwareOptions,
  expandedRoleSkills,
  onToggleRoleSkillExpand,
}: {
  filters: TalentFilterState;
  onChange: (next: TalentFilterState) => void;
  roleOptions: string[];
  stateOptions: string[];
  workTypeOptions: string[];
  roleSkillOptions: Record<string, string[]>;
  softwareOptions: string[];
  expandedRoleSkills: Record<string, boolean>;
  onToggleRoleSkillExpand: (role: string) => void;
}) {
  return (
    <Box sx={{ px: 2.5, py: 2, bgcolor: "background.paper" }}>
      <TextField
        fullWidth
        size="small"
        placeholder="Role, City, Ref #..."
        value={filters.search}
        onChange={(event) => onChange({ ...filters, search: event.target.value })}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 2 }}
      />

      <Stack spacing={1.5} sx={{ mb: 2 }}>
        <Box
          sx={(theme) => ({
            border: 1,
            borderColor: filters.willingToTravel ? theme.palette.primary.main : theme.palette.divider,
            bgcolor: filters.willingToTravel ? alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.18 : 0.08) : "transparent",
            borderRadius: 2,
            p: 1.5,
          })}
        >
          <FormControlLabel
            control={
              <Checkbox
                checked={filters.willingToTravel}
                onChange={() => onChange({ ...filters, willingToTravel: !filters.willingToTravel })}
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <FlightTakeoffIcon fontSize="small" />
                <Box>
                  <Typography variant="body2" fontWeight={700}>
                    Open to Travel
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Candidates willing to relocate
                  </Typography>
                </Box>
              </Stack>
            }
          />
        </Box>

        <Box
          sx={(theme) => ({
            border: 1,
            borderColor: filters.placementSeeker ? theme.palette.success.main : theme.palette.divider,
            bgcolor: filters.placementSeeker ? alpha(theme.palette.success.main, theme.palette.mode === "dark" ? 0.18 : 0.08) : "transparent",
            borderRadius: 2,
            p: 1.5,
          })}
        >
          <FormControlLabel
            control={
              <Checkbox
                checked={filters.placementSeeker}
                onChange={() => onChange({ ...filters, placementSeeker: !filters.placementSeeker })}
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <SchoolIcon fontSize="small" />
                <Box>
                  <Typography variant="body2" fontWeight={700}>
                    Students & Interns
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Searching for placements
                  </Typography>
                </Box>
              </Stack>
            }
          />
        </Box>
      </Stack>

      <FilterSection title="Role Type & Skills">
        <Stack spacing={1}>
          {roleOptions.map((role) => {
            const hasSkills = (roleSkillOptions[role] || []).length > 0;
            const expanded = expandedRoleSkills[role] ?? false;
            return (
              <Box key={role}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={filters.roles.includes(role)}
                        onChange={() => onChange({ ...filters, roles: toggleList(filters.roles, role) })}
                      />
                    }
                    label={<Typography variant="body2" fontWeight={600}>{role}</Typography>}
                  />
                  {hasSkills && (
                    <IconButton size="small" onClick={() => onToggleRoleSkillExpand(role)}>
                      {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                    </IconButton>
                  )}
                </Stack>
                {hasSkills && (
                  <Collapse in={expanded} timeout="auto" unmountOnExit>
                    <Stack spacing={0.5} sx={{ pl: 4, pt: 0.5 }}>
                      {roleSkillOptions[role].map((skill) => (
                        <FormControlLabel
                          key={skill}
                          control={
                            <Checkbox
                              size="small"
                              checked={filters.skills.includes(skill)}
                              onChange={() => onChange({ ...filters, skills: toggleList(filters.skills, skill) })}
                            />
                          }
                          label={<Typography variant="caption">{skill}</Typography>}
                        />
                      ))}
                    </Stack>
                  </Collapse>
                )}
              </Box>
            );
          })}
        </Stack>
      </FilterSection>

      <FilterSection title="Software Proficiency">
        <Stack spacing={0.5}>
          {softwareOptions.map((skill) => (
            <FormControlLabel
              key={skill}
              control={
                <Checkbox
                  size="small"
                  checked={filters.skills.includes(skill)}
                  onChange={() => onChange({ ...filters, skills: toggleList(filters.skills, skill) })}
                />
              }
              label={<Typography variant="body2">{skill}</Typography>}
            />
          ))}
        </Stack>
      </FilterSection>

      <FilterSection title="Engagement Type">
        <Stack spacing={0.5}>
          {workTypeOptions.map((type) => (
            <FormControlLabel
              key={type}
              control={
                <Checkbox
                  size="small"
                  checked={filters.workTypes.includes(type)}
                  onChange={() => onChange({ ...filters, workTypes: toggleList(filters.workTypes, type) })}
                />
              }
              label={<Typography variant="body2">{type}</Typography>}
            />
          ))}
        </Stack>
      </FilterSection>

      <FilterSection title="Availability Dates">
        <Stack spacing={1.5}>
          <TextField
            label="Start date"
            type="date"
            size="small"
            fullWidth
            value={filters.availabilityStart ?? ""}
            onChange={(event) =>
              onChange({ ...filters, availabilityStart: event.target.value || null })
            }
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="End date"
            type="date"
            size="small"
            fullWidth
            value={filters.availabilityEnd ?? ""}
            inputProps={{ min: filters.availabilityStart ?? undefined }}
            onChange={(event) =>
              onChange({ ...filters, availabilityEnd: event.target.value || null })
            }
            InputLabelProps={{ shrink: true }}
          />
        </Stack>
      </FilterSection>

      <FilterSection title="Location (State)">
        <Stack spacing={0.5}>
          {stateOptions.map((state) => (
            <FormControlLabel
              key={state}
              control={
                <Checkbox
                  size="small"
                  checked={filters.states.includes(state)}
                  onChange={() => onChange({ ...filters, states: toggleList(filters.states, state) })}
                />
              }
              label={<Typography variant="body2">{state}</Typography>}
            />
          ))}
        </Stack>
      </FilterSection>

      <Button
        variant="outlined"
        fullWidth
        onClick={() =>
          onChange({
            search: "",
            roles: [],
            workTypes: [],
            states: [],
            skills: [],
            willingToTravel: false,
            placementSeeker: false,
            availabilityStart: null,
            availabilityEnd: null,
          })
        }
      >
        Clear Filters
      </Button>
    </Box>
  );
}
