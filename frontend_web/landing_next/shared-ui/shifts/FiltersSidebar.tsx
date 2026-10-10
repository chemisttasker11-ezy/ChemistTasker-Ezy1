'use client';

import React from 'react';
import {
  Box,
  Checkbox,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Slider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  AccessTimeOutlined as AccessTimeIcon,
  Bolt as BoltIcon,
  CommuteOutlined as CommuteIcon,
  DarkModeOutlined as DarkModeIcon,
  EventRepeat as EventRepeatIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  HotelOutlined as HotelIcon,
  PaidOutlined as PaidIcon,
  Search as SearchIcon,
  WbSunnyOutlined as WbSunnyIcon,
  WbTwilight as WbTwilightIcon,
} from '@mui/icons-material';
import { FILTER_SECTIONS } from './model';
import { FilterChip, FilterChips, FilterSection, FiltersHeader, filterColors } from '../filterParts';
import type { FilterConfig } from './model';

type FiltersSidebarProps = {
  filterConfig: FilterConfig;
  hideSearch?: boolean;
  setFilterConfig: React.Dispatch<React.SetStateAction<FilterConfig>>;
  roleOptions: string[];
  locationGroups: Record<string, Set<string>>;
  expandedStates: Record<string, boolean>;
  toggleStateExpand: (state: string) => void;
  toggleStateSelection: (cities: string[]) => void;
  toggleFilter: (key: keyof FilterConfig, value: string) => void;
  toggleBooleanFilter: (key: keyof FilterConfig) => void;
  /** Shows "Clear all" beside the active-filter count. */
  onClearAll?: () => void;
};

const c = filterColors;

const EMPLOYMENT = [
  { id: 'FULL_TIME', label: 'Full-time' },
  { id: 'PART_TIME', label: 'Part-time' },
  { id: 'LOCUM', label: 'Locum' },
];
const PERKS: { key: keyof FilterConfig; label: string; icon: React.ReactNode }[] = [
  { key: 'bulkShiftsOnly', label: 'Bulk (1 week+)', icon: <EventRepeatIcon /> },
  { key: 'negotiableOnly', label: 'Negotiable rate', icon: <PaidIcon /> },
  { key: 'flexibleOnly', label: 'Flexible hours', icon: <AccessTimeIcon /> },
  { key: 'travelProvided', label: 'Travel covered', icon: <CommuteIcon /> },
  { key: 'accommodationProvided', label: 'Accommodation', icon: <HotelIcon /> },
];
const TIMES = [
  { id: 'morning', label: 'Morning', icon: <WbSunnyIcon /> },
  { id: 'afternoon', label: 'Afternoon', icon: <WbTwilightIcon /> },
  { id: 'evening', label: 'Evening', icon: <DarkModeIcon /> },
];

/** How many filters are on, so the header can summarise them. */
export function activeFilterCount(f: FilterConfig) {
  const booleans = (['onlyUrgent', 'negotiableOnly', 'flexibleOnly', 'travelProvided', 'accommodationProvided', 'bulkShiftsOnly'] as const)
    .filter((key) => f[key]).length;
  return f.roles.length + f.employmentTypes.length + f.city.length + f.timeOfDay.length + booleans
    + (f.minRate > 0 ? 1 : 0) + (f.dateRange.start || f.dateRange.end ? 1 : 0);
}

const checkboxRowSx = {
  m: 0,
  minHeight: 38,
  minWidth: 0,
  '& .MuiCheckbox-root': { p: 0.75, mr: 0.5, color: c.muted, '&.Mui-checked, &.MuiCheckbox-indeterminate': { color: c.accent } },
  '& .MuiFormControlLabel-label': { minWidth: 0, fontSize: 13.5, lineHeight: 1.5, color: c.text, overflowWrap: 'anywhere' },
} as const;

const FiltersSidebar: React.FC<FiltersSidebarProps> = ({
  filterConfig,
  hideSearch = false,
  setFilterConfig,
  roleOptions,
  locationGroups,
  expandedStates,
  toggleStateExpand,
  toggleStateSelection,
  toggleFilter,
  toggleBooleanFilter,
  onClearAll,
}) => {
  const active = activeFilterCount(filterConfig);
  return (
    <Box sx={{ px: { xs: 2, sm: 2.25 }, py: 2, width: '100%', minWidth: 0 }}>
      <FiltersHeader active={active} onClearAll={onClearAll} />

      {!hideSearch && (
        <TextField
          fullWidth
          size="small"
          label="Search shifts"
          placeholder="Role, pharmacy or suburb"
          value={filterConfig.search}
          onChange={(event) => setFilterConfig((prev) => ({ ...prev, search: event.target.value }))}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          sx={{ mb: 1.5 }}
        />
      )}

      <FilterChips>
        <FilterChip selected={filterConfig.onlyUrgent} onClick={() => toggleBooleanFilter('onlyUrgent')} icon={<BoltIcon sx={{ color: c.urgent }} />}>
          Urgent only
        </FilterChip>
      </FilterChips>

      <FilterSection idPrefix="shift-filter" title={FILTER_SECTIONS.roles}>
        <FilterChips>
          {roleOptions.map((role) => (
            <FilterChip key={role} selected={filterConfig.roles.includes(role)} onClick={() => toggleFilter('roles', role)}>{role}</FilterChip>
          ))}
        </FilterChips>
      </FilterSection>

      <FilterSection idPrefix="shift-filter" title={FILTER_SECTIONS.employment}>
        <FilterChips>
          {EMPLOYMENT.map((item) => (
            <FilterChip key={item.id} selected={filterConfig.employmentTypes.includes(item.id)} onClick={() => toggleFilter('employmentTypes', item.id)}>{item.label}</FilterChip>
          ))}
        </FilterChips>
      </FilterSection>

      <FilterSection idPrefix="shift-filter" title={FILTER_SECTIONS.dateRange}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1.25 }}>
          <TextField
            fullWidth
            type="date"
            label="From"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={filterConfig.dateRange.start}
            onChange={(event) => setFilterConfig((prev) => ({ ...prev, dateRange: { ...prev.dateRange, start: event.target.value } }))}
          />
          <TextField
            fullWidth
            type="date"
            label="To"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={filterConfig.dateRange.end}
            onChange={(event) => setFilterConfig((prev) => ({ ...prev, dateRange: { ...prev.dateRange, end: event.target.value } }))}
          />
        </Box>
      </FilterSection>

      <FilterSection idPrefix="shift-filter" title={FILTER_SECTIONS.timeOfDay}>
        <FilterChips>
          {TIMES.map((entry) => (
            <FilterChip key={entry.id} selected={filterConfig.timeOfDay.includes(entry.id as never)} onClick={() => toggleFilter('timeOfDay', entry.id)} icon={entry.icon}>
              {entry.label}
            </FilterChip>
          ))}
        </FilterChips>
      </FilterSection>

      <FilterSection idPrefix="shift-filter" title={FILTER_SECTIONS.perks}>
        <FilterChips>
          {PERKS.map((perk) => (
            <FilterChip key={perk.key} selected={Boolean(filterConfig[perk.key])} onClick={() => toggleBooleanFilter(perk.key)} icon={perk.icon}>
              {perk.label}
            </FilterChip>
          ))}
        </FilterChips>
      </FilterSection>

      <FilterSection idPrefix="shift-filter" title={FILTER_SECTIONS.minRate}>
        <Stack spacing={0.5} sx={{ px: 0.75 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: c.text }}>
            {filterConfig.minRate > 0 ? 'From $' + filterConfig.minRate + '/hr' : 'Any hourly rate'}
          </Typography>
          <Slider
            size="small"
            min={0}
            max={100}
            step={5}
            value={filterConfig.minRate}
            onChange={(_, value) => setFilterConfig((prev) => ({ ...prev, minRate: Number(value) }))}
            aria-label="Minimum hourly rate"
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => value === 0 ? 'Any' : '$' + value + '/hr'}
            sx={{ color: c.accent, py: 1.5, '& .MuiSlider-thumb': { width: 16, height: 16 }, '& .MuiSlider-rail': { opacity: 1, bgcolor: c.border } }}
          />
          <Stack direction="row" justifyContent="space-between">
            <Typography sx={{ fontSize: 12, color: c.muted }}>Any</Typography>
            <Typography sx={{ fontSize: 12, color: c.muted }}>$100+/hr</Typography>
          </Stack>
        </Stack>
      </FilterSection>

      <FilterSection idPrefix="shift-filter" title={FILTER_SECTIONS.locations}>
        <Stack spacing={0.5}>
          {Object.entries(locationGroups).map(([state, citiesSet]) => {
            const cities = Array.from(citiesSet).sort();
            const isExpanded = !!expandedStates[state];
            const allSelected = cities.length > 0 && cities.every((city) => filterConfig.city.includes(city));
            const someSelected = cities.some((city) => filterConfig.city.includes(city));
            return (
              <Box key={state} sx={{ minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                  <FormControlLabel sx={{ ...checkboxRowSx, flex: 1 }}
                    control={<Checkbox checked={allSelected} indeterminate={someSelected && !allSelected} onChange={() => toggleStateSelection(cities)} />}
                    label={<Typography sx={{ fontSize: 13.5, fontWeight: 600, color: c.text }}>{state} <Box component="span" sx={{ color: c.muted, fontWeight: 400 }}>· {cities.length}</Box></Typography>}
                  />
                  <IconButton
                    type="button"
                    size="small"
                    onClick={() => toggleStateExpand(state)}
                    aria-label={(isExpanded ? 'Hide' : 'Show') + ' suburbs in ' + state}
                    aria-expanded={isExpanded}
                    sx={{ width: 36, height: 36, flexShrink: 0, color: c.muted }}
                  >
                    {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </IconButton>
                </Box>
                {isExpanded && (
                  <Box sx={{ pl: 1, pb: 0.75 }}>
                    <FilterChips>
                      {cities.map((city) => (
                        <FilterChip key={city} selected={filterConfig.city.includes(city)} onClick={() => toggleFilter('city', city)}>{city}</FilterChip>
                      ))}
                    </FilterChips>
                  </Box>
                )}
              </Box>
            );
          })}
          {Object.keys(locationGroups).length === 0 && (
            <Typography sx={{ fontSize: 13, color: c.muted, lineHeight: 1.6 }}>
              Suburbs will appear when matching shifts are available.
            </Typography>
          )}
        </Stack>
      </FilterSection>
    </Box>
  );
};

export default FiltersSidebar;
