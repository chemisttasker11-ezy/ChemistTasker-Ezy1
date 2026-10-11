'use client';

// Talent filters, shared by the Vite dashboard and the Next public site. Each app owns its data and filtering;
// the public site passes its skill icons through renderSkillIcon.
import React from 'react';
import { Box, Collapse, IconButton, InputAdornment, Stack, TextField } from '@mui/material';
import skillsRegistry from '@chemisttasker/shared-core/skills_registry.json';
import { skillLabel } from '@chemisttasker/shared-core';
import {
  CommuteOutlined as CommuteIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  SchoolOutlined as SchoolIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { FilterChip, FilterChips, FilterSection, FiltersHeader, filterColors as c } from '../filterParts';

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

export const EMPTY_TALENT_FILTERS: TalentFilterState = {
  search: '', roles: [], workTypes: [], states: [], skills: [],
  willingToTravel: false, placementSeeker: false, availabilityStart: null, availabilityEnd: null,
};

const toggleList = (list: string[], value: string) =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

export default function TalentFiltersSidebar({
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
  renderSkillIcon,
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
  renderSkillIcon?: (skill: string) => React.ReactNode;
}) {
  const active = filters.roles.length + filters.workTypes.length + filters.states.length + filters.skills.length
    + (filters.willingToTravel ? 1 : 0) + (filters.placementSeeker ? 1 : 0)
    + (filters.availabilityStart || filters.availabilityEnd ? 1 : 0);
  const toggleSkill = (skill: string) => onChange({ ...filters, skills: toggleList(filters.skills, skill) });

  return (
    <Box sx={{ px: { xs: 2, sm: 2.25 }, py: 2, width: '100%', minWidth: 0 }}>
      <FiltersHeader active={active} onClearAll={() => onChange(EMPTY_TALENT_FILTERS)} />

      {!hideSearch && (
        <TextField
          fullWidth
          size="small"
          label="Search talent"
          placeholder="Role, suburb or skill"
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          sx={{ mb: 1.5 }}
        />
      )}

      <FilterChips>
        <FilterChip selected={filters.willingToTravel} onClick={() => onChange({ ...filters, willingToTravel: !filters.willingToTravel })} icon={<CommuteIcon />}>
          Open to travel
        </FilterChip>
        <FilterChip selected={filters.placementSeeker} onClick={() => onChange({ ...filters, placementSeeker: !filters.placementSeeker })} icon={<SchoolIcon />}>
          Students & interns seeking placements
        </FilterChip>
      </FilterChips>

      <FilterSection idPrefix="talent-filter" title="Role">
        <Stack spacing={1}>
          <FilterChips>
            {roleOptions.map((role) => (
              <FilterChip key={role} selected={filters.roles.includes(role)} onClick={() => onChange({ ...filters, roles: toggleList(filters.roles, role) })}>{role}</FilterChip>
            ))}
          </FilterChips>
          {roleOptions.filter((role) => (roleSkillOptions[role] || []).length > 0).map((role) => {
            const expanded = expandedRoleSkills[role] ?? false;
            return (
              <Box key={role} sx={{ minWidth: 0 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 0.5 }}>
                  <Box component="span" sx={{ fontSize: 13, color: c.muted }}>{role} skills</Box>
                  <IconButton
                    type="button"
                    size="small"
                    onClick={() => onToggleRoleSkillExpand(role)}
                    aria-label={(expanded ? 'Hide' : 'Show') + ' skills for ' + role}
                    aria-expanded={expanded}
                    sx={{ width: 36, height: 36, color: c.muted }}
                  >
                    {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </IconButton>
                </Stack>
                <Collapse in={expanded} timeout="auto" unmountOnExit>
                  <Box sx={{ pb: 0.75 }}>
                    <FilterChips>
                      {roleSkillOptions[role].map((skill) => (
                        <FilterChip key={skill} selected={filters.skills.includes(skill)} onClick={() => toggleSkill(skill)} icon={renderSkillIcon?.(skill)}>{skillLabel(skillsRegistry as any, skill)}</FilterChip>
                      ))}
                    </FilterChips>
                  </Box>
                </Collapse>
              </Box>
            );
          })}
        </Stack>
      </FilterSection>

      {softwareOptions.length > 0 && (
        <FilterSection idPrefix="talent-filter" title="Dispensing software">
          <FilterChips>
            {softwareOptions.map((skill) => (
              <FilterChip key={skill} selected={filters.skills.includes(skill)} onClick={() => toggleSkill(skill)} icon={renderSkillIcon?.(skill)}>{skillLabel(skillsRegistry as any, skill)}</FilterChip>
            ))}
          </FilterChips>
        </FilterSection>
      )}

      <FilterSection idPrefix="talent-filter" title="Engagement type">
        <FilterChips>
          {workTypeOptions.map((type) => (
            <FilterChip key={type} selected={filters.workTypes.includes(type)} onClick={() => onChange({ ...filters, workTypes: toggleList(filters.workTypes, type) })}>{type}</FilterChip>
          ))}
        </FilterChips>
      </FilterSection>

      <FilterSection idPrefix="talent-filter" title="Availability dates">
        <Stack spacing={1.25}>
          <TextField
            label="Start date"
            type="date"
            size="small"
            fullWidth
            value={filters.availabilityStart ?? ''}
            onChange={(event) => onChange({ ...filters, availabilityStart: event.target.value || null })}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="End date"
            type="date"
            size="small"
            fullWidth
            value={filters.availabilityEnd ?? ''}
            inputProps={{ min: filters.availabilityStart ?? undefined }}
            onChange={(event) => onChange({ ...filters, availabilityEnd: event.target.value || null })}
            InputLabelProps={{ shrink: true }}
          />
        </Stack>
      </FilterSection>

      {stateOptions.length > 0 && (
        <FilterSection idPrefix="talent-filter" title="Location">
          <FilterChips>
            {stateOptions.map((state) => (
              <FilterChip key={state} selected={filters.states.includes(state)} onClick={() => onChange({ ...filters, states: toggleList(filters.states, state) })}>{state}</FilterChip>
            ))}
          </FilterChips>
        </FilterSection>
      )}
    </Box>
  );
}
