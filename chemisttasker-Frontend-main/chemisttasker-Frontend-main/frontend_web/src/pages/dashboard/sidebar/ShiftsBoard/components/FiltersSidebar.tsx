import React from 'react';
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  Bolt as BoltIcon,
  DarkMode as DarkModeIcon,
  DateRange as DateRangeIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Flight as FlightIcon,
  Hotel as HotelIcon,
  Paid as PaidIcon,
  Search as SearchIcon,
  SwapVert as SwapVertIcon,
  WbSunny as WbSunnyIcon,
  WbTwilight as WbTwilightIcon,
} from '@mui/icons-material';
import { FILTER_SECTIONS } from '../constants';
import { FilterConfig } from '../types';

type FiltersSidebarProps = {
  filterConfig: FilterConfig;
  setFilterConfig: React.Dispatch<React.SetStateAction<FilterConfig>>;
  roleOptions: string[];
  locationGroups: Record<string, Set<string>>;
  expandedStates: Record<string, boolean>;
  toggleStateExpand: (state: string) => void;
  toggleStateSelection: (cities: string[]) => void;
  toggleFilter: (key: keyof FilterConfig, value: string) => void;
  toggleBooleanFilter: (key: keyof FilterConfig) => void;
};

const FiltersSidebar: React.FC<FiltersSidebarProps> = ({
  filterConfig,
  setFilterConfig,
  roleOptions,
  locationGroups,
  expandedStates,
  toggleStateExpand,
  toggleStateSelection,
  toggleFilter,
  toggleBooleanFilter,
}) => {
  const renderFilterSection = (
    title: string,
    content: React.ReactNode,
    isOpen = true,
    onToggle?: () => void
  ) => (
    <Box sx={{ borderBottom: '1px solid', borderColor: 'grey.100', pb: 2.5, mb: 2.5 }}>
      <Button
        onClick={onToggle}
        fullWidth
        sx={{
          justifyContent: 'space-between',
          textTransform: 'none',
          color: 'text.secondary',
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: 1,
        }}
      >
        {title}
        {isOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
      </Button>
      {isOpen && <Box>{content}</Box>}
    </Box>
  );

  return (
    <Box sx={{ px: 2.5, py: 2 }}>
      <TextField
        fullWidth
        size="small"
        placeholder="Search pharmacy, role..."
        value={filterConfig.search}
        onChange={(event) => setFilterConfig((prev) => ({ ...prev, search: event.target.value }))}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 2 }}
      />

      <Box sx={{ mb: 2 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={filterConfig.onlyUrgent}
              onChange={() => toggleBooleanFilter('onlyUrgent')}
              icon={<BoltIcon fontSize="small" />}
              checkedIcon={<BoltIcon fontSize="small" />}
            />
          }
          label="Urgent only"
        />
      </Box>

      {renderFilterSection(
        FILTER_SECTIONS.roles,
        <Stack spacing={1}>
          {roleOptions.map((role) => (
            <FormControlLabel
              key={role}
              control={
                <Checkbox
                  checked={filterConfig.roles.includes(role)}
                  onChange={() => toggleFilter('roles', role)}
                />
              }
              label={role}
            />
          ))}
        </Stack>
      )}

      {renderFilterSection(
        FILTER_SECTIONS.dateRange,
        <Stack spacing={1.5}>
          <TextField
            type="date"
            label="From"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={filterConfig.dateRange.start}
            onChange={(event) =>
              setFilterConfig((prev) => ({
                ...prev,
                dateRange: { ...prev.dateRange, start: event.target.value },
              }))
            }
          />
          <TextField
            type="date"
            label="To"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={filterConfig.dateRange.end}
            onChange={(event) =>
              setFilterConfig((prev) => ({
                ...prev,
                dateRange: { ...prev.dateRange, end: event.target.value },
              }))
            }
          />
        </Stack>
      )}

      {renderFilterSection(
        FILTER_SECTIONS.perks,
        <Stack spacing={1}>
          <FormControlLabel
            control={
              <Checkbox
                checked={filterConfig.bulkShiftsOnly}
                onChange={() => toggleBooleanFilter('bulkShiftsOnly')}
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <DateRangeIcon fontSize="small" />
                <span>Bulk shifts (1 week+)</span>
              </Stack>
            }
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={filterConfig.negotiableOnly}
                onChange={() => toggleBooleanFilter('negotiableOnly')}
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <PaidIcon fontSize="small" />
                <span>Negotiable rate</span>
              </Stack>
            }
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={filterConfig.flexibleOnly}
                onChange={() => toggleBooleanFilter('flexibleOnly')}
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <SwapVertIcon fontSize="small" />
                <span>Flexible hours</span>
              </Stack>
            }
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={filterConfig.travelProvided}
                onChange={() => toggleBooleanFilter('travelProvided')}
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <FlightIcon fontSize="small" />
                <span>Travel paid</span>
              </Stack>
            }
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={filterConfig.accommodationProvided}
                onChange={() => toggleBooleanFilter('accommodationProvided')}
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <HotelIcon fontSize="small" />
                <span>Accommodation</span>
              </Stack>
            }
          />
        </Stack>
      )}

      {renderFilterSection(
        FILTER_SECTIONS.employment,
        <Stack spacing={1}>
          {[
            { id: 'FULL_TIME', label: 'Full-time' },
            { id: 'PART_TIME', label: 'Part-time' },
            { id: 'LOCUM', label: 'Locum' },
          ].map((item) => (
            <FormControlLabel
              key={item.id}
              control={
                <Checkbox
                  checked={filterConfig.employmentTypes.includes(item.id)}
                  onChange={() => toggleFilter('employmentTypes', item.id)}
                />
              }
              label={item.label}
            />
          ))}
        </Stack>
      )}

      {renderFilterSection(
        FILTER_SECTIONS.locations,
        <Stack spacing={1}>
          {Object.entries(locationGroups).map(([state, citiesSet]) => {
            const cities = Array.from(citiesSet).sort();
            const isExpanded = !!expandedStates[state];
            const allSelected = cities.every((city) => filterConfig.city.includes(city));
            const someSelected = cities.some((city) => filterConfig.city.includes(city));

            return (
              <Box key={state} sx={{ borderBottom: '1px solid', borderColor: 'grey.100', pb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected && !allSelected}
                        onChange={() => toggleStateSelection(cities)}
                      />
                    }
                    label={<Typography fontWeight={700}>{state}</Typography>}
                  />
                  <IconButton size="small" onClick={() => toggleStateExpand(state)}>
                    {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </IconButton>
                </Box>
                {isExpanded && (
                  <Stack spacing={0.5} sx={{ pl: 3 }}>
                    {cities.map((city) => (
                      <FormControlLabel
                        key={city}
                        control={
                          <Checkbox
                            checked={filterConfig.city.includes(city)}
                            onChange={() => toggleFilter('city', city)}
                          />
                        }
                        label={city}
                      />
                    ))}
                  </Stack>
                )}
              </Box>
            );
          })}
        </Stack>
      )}

      {renderFilterSection(
        FILTER_SECTIONS.timeOfDay,
        <Grid container spacing={1}>
          {[
            { id: 'morning', label: 'Morning', icon: <WbSunnyIcon fontSize="small" /> },
            { id: 'afternoon', label: 'Afternoon', icon: <WbTwilightIcon fontSize="small" /> },
            { id: 'evening', label: 'Evening', icon: <DarkModeIcon fontSize="small" /> },
          ].map((entry) => {
            const active = filterConfig.timeOfDay.includes(entry.id as 'morning' | 'afternoon' | 'evening');
            return (
              <Grid key={entry.id} size={{ xs: 4 }}>
                <Button
                  variant={active ? 'contained' : 'outlined'}
                  onClick={() => toggleFilter('timeOfDay', entry.id)}
                  fullWidth
                  sx={{ textTransform: 'none', gap: 1 }}
                >
                  {entry.icon}
                  {entry.label}
                </Button>
              </Grid>
            );
          })}
        </Grid>
      )}

      {renderFilterSection(
        `${FILTER_SECTIONS.minRate}: $${filterConfig.minRate}/hr`,
        <Stack spacing={1}>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={filterConfig.minRate}
            onChange={(event) => setFilterConfig((prev) => ({ ...prev, minRate: Number(event.target.value) }))}
          />
          <Stack direction="row" justifyContent="space-between" sx={{ fontSize: 12, color: 'text.secondary' }}>
            <span>Any</span>
            <span>$100+</span>
          </Stack>
        </Stack>
      )}
    </Box>
  );
};

export default FiltersSidebar;
