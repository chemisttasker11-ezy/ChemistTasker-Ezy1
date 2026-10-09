import React, { useState } from "react";
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
import {
  CommuteOutlined as CommuteIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  SchoolOutlined as SchoolIcon,
  Search as SearchIcon,
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

const filterRowSx = {
  m: 0,
  minHeight: 38,
  minWidth: 0,
  alignItems: "center",
  "& .MuiCheckbox-root": {
    p: 0.75,
    mr: 0.5,
    color: "text.secondary",
    "&.Mui-checked": { color: "primary.main" },
  },
  "& .MuiFormControlLabel-label": {
    minWidth: 0,
    fontSize: 13.5,
    lineHeight: 1.5,
    color: "text.primary",
    overflowWrap: "anywhere",
  },
} as const;

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(true);
  const id = "talent-filter-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    <Box sx={{ borderBottom: "1px solid", borderColor: "divider", pb: 1.75, mb: 1.75, minWidth: 0 }}>
      <Button
        type="button"
        fullWidth
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={id}
        endIcon={isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        sx={{
          justifyContent: "space-between",
          textTransform: "none",
          color: "text.primary",
          fontWeight: 800,
          fontSize: 13.5,
          lineHeight: 1.35,
          letterSpacing: ".015em",
          textAlign: "left",
          px: 0.75,
          py: 0.5,
          mb: isOpen ? 0.75 : 0,
          minHeight: 38,
          minWidth: 0,
          borderRadius: "8px",
          "& .MuiButton-endIcon": { ml: 1, color: "text.secondary", "& svg": { fontSize: 19 } },
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        {title}
      </Button>
      <Box id={id} hidden={!isOpen} sx={{ display: isOpen ? "block" : "none", minWidth: 0, px: 0.5 }}>
        {children}
      </Box>
    </Box>
  );
}

function FilterIconLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.85} sx={{ minWidth: 0 }}>
      <Box
        component="span"
        aria-hidden="true"
        sx={{ display: "inline-flex", alignItems: "center", flexShrink: 0, color: "text.secondary", "& svg": { fontSize: 18 } }}
      >
        {icon}
      </Box>
      <Typography component="span" sx={{ fontSize: 13.5, lineHeight: 1.5, color: "text.primary", minWidth: 0, overflowWrap: "anywhere" }}>
        {children}
      </Typography>
    </Stack>
  );
}

const toggleList = (list: string[], value: string) =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

export default function FiltersSidebar({
  filters,
  onChange,
  hideSearch = false,
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
  hideSearch?: boolean;
  roleOptions: string[];
  stateOptions: string[];
  workTypeOptions: string[];
  roleSkillOptions: Record<string, string[]>;
  softwareOptions: string[];
  expandedRoleSkills: Record<string, boolean>;
  onToggleRoleSkillExpand: (role: string) => void;
}) {
  const clearFilters = () =>
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
    });

  return (
    <Box sx={{ px: { xs: 2, sm: 2.25 }, py: 1.75, width: "100%", minWidth: 0, bgcolor: "background.paper" }}>
      {!hideSearch && (
        <TextField
          fullWidth
          size="small"
          label="Search talent"
          placeholder="Role, suburb or skill"
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
      )}

      <FilterSection title="Quick filters">
        <Stack spacing={0.35}>
          <FormControlLabel
            sx={filterRowSx}
            control={
              <Checkbox
                checked={filters.willingToTravel}
                onChange={() => onChange({ ...filters, willingToTravel: !filters.willingToTravel })}
              />
            }
            label={<FilterIconLabel icon={<CommuteIcon />}>Open to travel</FilterIconLabel>}
          />
          <FormControlLabel
            sx={filterRowSx}
            control={
              <Checkbox
                checked={filters.placementSeeker}
                onChange={() => onChange({ ...filters, placementSeeker: !filters.placementSeeker })}
              />
            }
            label={<FilterIconLabel icon={<SchoolIcon />}>Students & interns seeking placements</FilterIconLabel>}
          />
        </Stack>
      </FilterSection>

      <FilterSection title="Role type & skills">
        <Stack spacing={0.45}>
          {roleOptions.map((role) => {
            const hasSkills = (roleSkillOptions[role] || []).length > 0;
            const expanded = expandedRoleSkills[role] ?? false;
            return (
              <Box key={role} sx={{ minWidth: 0, borderBottom: hasSkills ? "1px solid" : "none", borderColor: "divider", pb: hasSkills ? 0.45 : 0 }}>
                <Box sx={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                  <FormControlLabel
                    sx={{ ...filterRowSx, flex: 1 }}
                    control={
                      <Checkbox
                        checked={filters.roles.includes(role)}
                        onChange={() => onChange({ ...filters, roles: toggleList(filters.roles, role) })}
                      />
                    }
                    label={<Typography sx={{ fontSize: 13.5, fontWeight: 700, color: "text.primary", overflowWrap: "anywhere" }}>{role}</Typography>}
                  />
                  {hasSkills && (
                    <IconButton
                      type="button"
                      size="small"
                      onClick={() => onToggleRoleSkillExpand(role)}
                      aria-label={(expanded ? "Hide" : "Show") + " skills for " + role}
                      aria-expanded={expanded}
                      sx={{ width: 36, height: 36, flexShrink: 0, color: "text.secondary" }}
                    >
                      {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                    </IconButton>
                  )}
                </Box>
                {hasSkills && (
                  <Collapse in={expanded} timeout="auto" unmountOnExit>
                    <Stack spacing={0.2} sx={{ pl: 3.25, minWidth: 0 }}>
                      {roleSkillOptions[role].map((skill) => (
                        <FormControlLabel
                          key={skill}
                          sx={filterRowSx}
                          control={
                            <Checkbox
                              size="small"
                              checked={filters.skills.includes(skill)}
                              onChange={() => onChange({ ...filters, skills: toggleList(filters.skills, skill) })}
                            />
                          }
                          label={<Typography component="span" sx={{ fontSize: 13, lineHeight: 1.45, color: "text.primary", minWidth: 0, overflowWrap: "anywhere" }}>{skill}</Typography>}
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

      <FilterSection title="Software proficiency">
        <Stack spacing={0.2}>
          {softwareOptions.map((skill) => (
            <FormControlLabel
              key={skill}
              sx={filterRowSx}
              control={
                <Checkbox
                  size="small"
                  checked={filters.skills.includes(skill)}
                  onChange={() => onChange({ ...filters, skills: toggleList(filters.skills, skill) })}
                />
              }
              label={skill}
            />
          ))}
        </Stack>
      </FilterSection>

      <FilterSection title="Engagement type">
        <Stack spacing={0.2}>
          {workTypeOptions.map((type) => (
            <FormControlLabel
              key={type}
              sx={filterRowSx}
              control={
                <Checkbox
                  size="small"
                  checked={filters.workTypes.includes(type)}
                  onChange={() => onChange({ ...filters, workTypes: toggleList(filters.workTypes, type) })}
                />
              }
              label={type}
            />
          ))}
        </Stack>
      </FilterSection>

      <FilterSection title="Availability dates">
        <Stack spacing={1.25}>
          <TextField
            label="Start date"
            type="date"
            size="small"
            fullWidth
            value={filters.availabilityStart ?? ""}
            onChange={(event) => onChange({ ...filters, availabilityStart: event.target.value || null })}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="End date"
            type="date"
            size="small"
            fullWidth
            value={filters.availabilityEnd ?? ""}
            inputProps={{ min: filters.availabilityStart ?? undefined }}
            onChange={(event) => onChange({ ...filters, availabilityEnd: event.target.value || null })}
            InputLabelProps={{ shrink: true }}
          />
        </Stack>
      </FilterSection>

      <FilterSection title="Location">
        <Stack spacing={0.2}>
          {stateOptions.map((state) => (
            <FormControlLabel
              key={state}
              sx={filterRowSx}
              control={
                <Checkbox
                  size="small"
                  checked={filters.states.includes(state)}
                  onChange={() => onChange({ ...filters, states: toggleList(filters.states, state) })}
                />
              }
              label={state}
            />
          ))}
        </Stack>
      </FilterSection>

      <Button
        type="button"
        variant="outlined"
        fullWidth
        onClick={clearFilters}
        sx={{ minHeight: 42, textTransform: "none", fontWeight: 800 }}
      >
        Clear all filters
      </Button>
    </Box>
  );
}
