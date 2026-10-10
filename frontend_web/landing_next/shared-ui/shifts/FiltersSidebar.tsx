'use client';

import React, { useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Slider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  AccessTimeOutlined as AccessTimeIcon,
  Bolt as BoltIcon,
  CommuteOutlined as CommuteIcon,
  DarkMode as DarkModeIcon,
  EventRepeat as EventRepeatIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  HotelOutlined as HotelIcon,
  PaidOutlined as PaidIcon,
  Search as SearchIcon,
  WbSunny as WbSunnyIcon,
  WbTwilight as WbTwilightIcon,
} from '@mui/icons-material';
import { FILTER_SECTIONS } from './model';
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
};

const filterRowSx = {
  m: 0,
  minHeight: 38,
  minWidth: 0,
  alignItems: 'center',
  '& .MuiCheckbox-root': {
    p: 0.75,
    mr: 0.5,
    color: '#627491',
    '&.Mui-checked': { color: '#5222B8' },
  },
  '& .MuiFormControlLabel-label': {
    minWidth: 0,
    fontSize: 13.5,
    lineHeight: 1.5,
    color: '#344563',
    overflowWrap: 'anywhere',
  },
} as const;

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(true);
  const id = 'shift-filter-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return (
    <Box sx={{ borderBottom: '1px solid #E6EBF3', pb: 1.75, mb: 1.75, minWidth: 0 }}>
      <Button
        type="button"
        fullWidth
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={id}
        endIcon={isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        sx={{
          justifyContent: 'space-between',
          textTransform: 'none',
          color: '#263858',
          fontWeight: 800,
          fontSize: 13.5,
          lineHeight: 1.35,
          letterSpacing: '.015em',
          textAlign: 'left',
          px: 0.75,
          py: 0.5,
          mb: isOpen ? 0.75 : 0,
          minHeight: 38,
          minWidth: 0,
          borderRadius: '8px',
          '& .MuiButton-endIcon': { ml: 1, color: '#61728E', '& svg': { fontSize: 19 } },
          '&:hover': { bgcolor: '#F5F1FC' },
        }}
      >
        {title}
      </Button>
      <Box id={id} hidden={!isOpen} sx={{ display: isOpen ? 'block' : 'none', minWidth: 0, px: 0.5 }}>
        {children}
      </Box>
    </Box>
  );
}

function BenefitLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.85} sx={{ minWidth: 0 }}>
      <Box component="span" aria-hidden="true" sx={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, color: '#647591', '& svg': { fontSize: 18 } }}>
        {icon}
      </Box>
      <Typography component="span" sx={{ fontSize: 13.5, lineHeight: 1.5, color: '#344563', minWidth: 0, overflowWrap: 'anywhere' }}>
        {children}
      </Typography>
    </Stack>
  );
}

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
}) => (
  <Box sx={{ px: { xs: 2, sm: 2.25 }, py: 1.75, width: '100%', minWidth: 0 }}>
    {!hideSearch && (
      <TextField
        fullWidth
        size="small"
        label="Search shifts"
        placeholder="Role, pharmacy or suburb"
        value={filterConfig.search}
        onChange={(event) => setFilterConfig((prev) => ({ ...prev, search: event.target.value }))}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        sx={{ mb: 2 }}
      />
    )}

    <Box sx={{ px: 0.5, mb: 1.5 }}>
      <FormControlLabel
        sx={filterRowSx}
        control={<Checkbox checked={filterConfig.onlyUrgent} onChange={() => toggleBooleanFilter('onlyUrgent')} />}
        label={<BenefitLabel icon={<BoltIcon sx={{ color: '#A95D00' }} />}>Urgent shifts only</BenefitLabel>}
      />
    </Box>

    <FilterSection title={FILTER_SECTIONS.roles}>
      <Stack spacing={0.35}>
        {roleOptions.map((role) => (
          <FormControlLabel
            key={role}
            sx={filterRowSx}
            control={<Checkbox checked={filterConfig.roles.includes(role)} onChange={() => toggleFilter('roles', role)} />}
            label={role}
          />
        ))}
      </Stack>
    </FilterSection>

    <FilterSection title={FILTER_SECTIONS.dateRange}>
      <Stack spacing={1.5}>
        <TextField
          fullWidth
          type="date"
          label="From"
          size="small"
          InputLabelProps={{ shrink: true }}
          value={filterConfig.dateRange.start}
          onChange={(event) => setFilterConfig((prev) => ({
            ...prev,
            dateRange: { ...prev.dateRange, start: event.target.value },
          }))}
        />
        <TextField
          fullWidth
          type="date"
          label="To"
          size="small"
          InputLabelProps={{ shrink: true }}
          value={filterConfig.dateRange.end}
          onChange={(event) => setFilterConfig((prev) => ({
            ...prev,
            dateRange: { ...prev.dateRange, end: event.target.value },
          }))}
        />
      </Stack>
    </FilterSection>

    <FilterSection title={FILTER_SECTIONS.perks}>
      <Stack spacing={0.35}>
        <FormControlLabel sx={filterRowSx}
          control={<Checkbox checked={filterConfig.bulkShiftsOnly} onChange={() => toggleBooleanFilter('bulkShiftsOnly')} />}
          label={<BenefitLabel icon={<EventRepeatIcon />}>Bulk shifts (1 week+)</BenefitLabel>}
        />
        <FormControlLabel sx={filterRowSx}
          control={<Checkbox checked={filterConfig.negotiableOnly} onChange={() => toggleBooleanFilter('negotiableOnly')} />}
          label={<BenefitLabel icon={<PaidIcon />}>Negotiable rate</BenefitLabel>}
        />
        <FormControlLabel sx={filterRowSx}
          control={<Checkbox checked={filterConfig.flexibleOnly} onChange={() => toggleBooleanFilter('flexibleOnly')} />}
          label={<BenefitLabel icon={<AccessTimeIcon />}>Flexible hours</BenefitLabel>}
        />
        <FormControlLabel sx={filterRowSx}
          control={<Checkbox checked={filterConfig.travelProvided} onChange={() => toggleBooleanFilter('travelProvided')} />}
          label={<BenefitLabel icon={<CommuteIcon />}>Travel covered</BenefitLabel>}
        />
        <FormControlLabel sx={filterRowSx}
          control={<Checkbox checked={filterConfig.accommodationProvided} onChange={() => toggleBooleanFilter('accommodationProvided')} />}
          label={<BenefitLabel icon={<HotelIcon />}>Accommodation</BenefitLabel>}
        />
      </Stack>
    </FilterSection>

    <FilterSection title={FILTER_SECTIONS.employment}>
      <Stack spacing={0.35}>
        {[
          { id: 'FULL_TIME', label: 'Full-time' },
          { id: 'PART_TIME', label: 'Part-time' },
          { id: 'LOCUM', label: 'Locum' },
        ].map((item) => (
          <FormControlLabel key={item.id} sx={filterRowSx}
            control={<Checkbox checked={filterConfig.employmentTypes.includes(item.id)} onChange={() => toggleFilter('employmentTypes', item.id)} />}
            label={item.label}
          />
        ))}
      </Stack>
    </FilterSection>

    <FilterSection title={FILTER_SECTIONS.locations}>
      <Stack spacing={0.65}>
        {Object.entries(locationGroups).map(([state, citiesSet]) => {
          const cities = Array.from(citiesSet).sort();
          const isExpanded = !!expandedStates[state];
          const allSelected = cities.length > 0 && cities.every((city) => filterConfig.city.includes(city));
          const someSelected = cities.some((city) => filterConfig.city.includes(city));
          return (
            <Box key={state} sx={{ minWidth: 0, borderBottom: '1px solid #EDF1F6', pb: 0.65 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <FormControlLabel sx={{ ...filterRowSx, flex: 1 }}
                  control={<Checkbox checked={allSelected} indeterminate={someSelected && !allSelected} onChange={() => toggleStateSelection(cities)} />}
                  label={<Typography sx={{ fontSize: 13.5, fontWeight: 800, color: '#263858' }}>{state}</Typography>}
                />
                <IconButton
                  type="button"
                  size="small"
                  onClick={() => toggleStateExpand(state)}
                  aria-label={(isExpanded ? 'Hide' : 'Show') + ' suburbs in ' + state}
                  aria-expanded={isExpanded}
                  sx={{ width: 36, height: 36, flexShrink: 0, color: '#61728E' }}
                >
                  {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
              </Box>
              {isExpanded && (
                <Stack spacing={0.25} sx={{ pl: 3, minWidth: 0 }}>
                  {cities.map((city) => (
                    <FormControlLabel key={city} sx={filterRowSx}
                      control={<Checkbox checked={filterConfig.city.includes(city)} onChange={() => toggleFilter('city', city)} />}
                      label={city}
                    />
                  ))}
                </Stack>
              )}
            </Box>
          );
        })}
        {Object.keys(locationGroups).length === 0 && (
          <Typography sx={{ fontSize: 13, color: '#52617C', lineHeight: 1.6 }}>
            Suburbs will appear when matching shifts are available.
          </Typography>
        )}
      </Stack>
    </FilterSection>

    <FilterSection title={FILTER_SECTIONS.timeOfDay}>
      <Grid container spacing={0.75}>
        {[
          { id: 'morning' as const, label: 'Morning', icon: <WbSunnyIcon sx={{ fontSize: 20 }} /> },
          { id: 'afternoon' as const, label: 'Afternoon', icon: <WbTwilightIcon sx={{ fontSize: 20 }} /> },
          { id: 'evening' as const, label: 'Evening', icon: <DarkModeIcon sx={{ fontSize: 20 }} /> },
        ].map((entry) => {
          const active = filterConfig.timeOfDay.includes(entry.id);
          return (
            <Grid key={entry.id} size={{ xs: 4 }} sx={{ minWidth: 0 }}>
              <Button
                type="button"
                variant={active ? 'contained' : 'outlined'}
                onClick={() => toggleFilter('timeOfDay', entry.id)}
                aria-pressed={active}
                fullWidth
                sx={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 0.35, minWidth: 0, minHeight: 68,
                  px: 0.35, py: 0.75, borderRadius: '9px',
                  textTransform: 'none', fontWeight: 800, fontSize: 12, lineHeight: 1.25,
                  borderColor: active ? '#5222B8' : '#D6C9EC',
                  color: active ? '#FFF' : '#5222B8',
                  bgcolor: active ? '#5222B8' : '#FFF',
                  '&:hover': { bgcolor: active ? '#40168F' : '#F5F1FC', borderColor: '#5222B8' },
                }}
              >
                {entry.icon}
                <Box component="span" sx={{ display: 'block', width: '100%', minWidth: 0, textAlign: 'center', overflowWrap: 'anywhere' }}>
                  {entry.label}
                </Box>
              </Button>
            </Grid>
          );
        })}
      </Grid>
    </FilterSection>

    <FilterSection title={FILTER_SECTIONS.minRate}>
      <Stack spacing={0.5} sx={{ px: 0.75 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#344563' }}>
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
          sx={{
            color: '#5222B8', py: 1.5,
            '& .MuiSlider-thumb': { width: 16, height: 16 },
            '& .MuiSlider-rail': { opacity: 1, bgcolor: '#D8DFEB' },
          }}
        />
        <Stack direction="row" justifyContent="space-between">
          <Typography sx={{ fontSize: 12, color: '#61728E' }}>Any</Typography>
          <Typography sx={{ fontSize: 12, color: '#61728E' }}>$100+/hr</Typography>
        </Stack>
      </Stack>
    </FilterSection>
  </Box>
);

export default FiltersSidebar;
