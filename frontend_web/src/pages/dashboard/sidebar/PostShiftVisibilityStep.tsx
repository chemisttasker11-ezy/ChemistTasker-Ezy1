import type { Dispatch, SetStateAction } from 'react';
import {
  Box,
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
import dayjs from 'dayjs';

type Setter<T> = Dispatch<SetStateAction<T>>;

type Props = {
  isEmbedded: boolean;
  isDarkMode: boolean;
  visibility: string;
  setVisibility: Setter<string>;
  allowedVis: string[];
  canPostAnonymously: boolean;
  postAnonymously: boolean;
  setPostAnonymously: Setter<boolean>;
  showNotifyPharmacyStaff: boolean;
  showNotifyFavoriteStaff: boolean;
  showNotifyChainMembers: boolean;
  notifyPharmacyStaff: boolean;
  setNotifyPharmacyStaff: Setter<boolean>;
  notifyFavoriteStaff: boolean;
  setNotifyFavoriteStaff: Setter<boolean>;
  notifyChainMembers: boolean;
  setNotifyChainMembers: Setter<boolean>;
  escalationDates: Record<string, string>;
  setEscalationDates: Setter<Record<string, string>>;
};

const ESCALATION_LABELS: Record<string, string> = {
  FULL_PART_TIME: 'Pharmacy Members',
  LOCUM_CASUAL: 'Favourite Staff',
  OWNER_CHAIN: 'Owner Chain',
  ORG_CHAIN: 'Organization',
  PLATFORM: 'Platform (Public)',
};

const VISIBILITY_META: Record<
  string,
  { eyebrow: string; description: string; accent: string }
> = {
  FULL_PART_TIME: {
    eyebrow: 'Internal first',
    description:
      'Start with your own pharmacy team before widening the audience.',
    accent:
      'linear-gradient(135deg, rgba(16, 185, 129, 0.16), rgba(5, 150, 105, 0.06))',
  },
  LOCUM_CASUAL: {
    eyebrow: 'Trusted bench',
    description:
      'Open the shift to your known locums and favourite casual staff.',
    accent:
      'linear-gradient(135deg, rgba(59, 130, 246, 0.16), rgba(37, 99, 235, 0.06))',
  },
  OWNER_CHAIN: {
    eyebrow: 'Chain network',
    description:
      'Share across the owner chain when local coverage is still unavailable.',
    accent:
      'linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(217, 119, 6, 0.06))',
  },
  ORG_CHAIN: {
    eyebrow: 'Organization reach',
    description:
      'Escalate to the wider organization to improve fill speed.',
    accent:
      'linear-gradient(135deg, rgba(236, 72, 153, 0.16), rgba(190, 24, 93, 0.06))',
  },
  PLATFORM: {
    eyebrow: 'Public audience',
    description: 'Publish broadly on the platform for maximum visibility and reach.',
    accent:
      'linear-gradient(135deg, rgba(109, 40, 217, 0.18), rgba(79, 70, 229, 0.06))',
  },
};

const formatEscalationDateTime = (value?: string) =>
  value ? dayjs(value).format('ddd, MMM D - h:mm A') : 'Choose a date and time';

export default function PostShiftVisibilityStep({
  isEmbedded,
  isDarkMode,
  visibility,
  setVisibility,
  allowedVis,
  canPostAnonymously,
  postAnonymously,
  setPostAnonymously,
  showNotifyPharmacyStaff,
  showNotifyFavoriteStaff,
  showNotifyChainMembers,
  notifyPharmacyStaff,
  setNotifyPharmacyStaff,
  notifyFavoriteStaff,
  setNotifyFavoriteStaff,
  notifyChainMembers,
  setNotifyChainMembers,
  escalationDates,
  setEscalationDates,
}: Props) {
  const startIdx = allowedVis.indexOf(visibility);
  const upcomingTiers =
    !isEmbedded && startIdx > -1 ? allowedVis.slice(startIdx + 1) : [];

  const fieldSx = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 2,
      bgcolor: isDarkMode
        ? 'rgba(15, 23, 42, 0.78)'
        : 'background.paper',
    },
  };

  return (
    <Grid container rowSpacing={3} columnSpacing={{ xs: 0, md: 3 }}>
      <Grid size={12}>
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 2, md: 2.5 },
            borderRadius: 4,
            borderColor: 'rgba(109, 40, 217, 0.12)',
            background: isDarkMode
              ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.94), rgba(39, 28, 73, 0.82))'
              : 'linear-gradient(135deg, rgba(248, 250, 252, 1), rgba(245, 243, 255, 0.95))',
          }}
        >
          <Stack spacing={1.25}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', sm: 'center' }}
            >
              <Box>
                <Typography
                  variant="overline"
                  sx={{
                    letterSpacing: 1,
                    color: 'primary.main',
                    fontWeight: 700,
                  }}
                >
                  Audience Plan
                </Typography>
                <Typography variant="h6" fontWeight={700}>
                  {isEmbedded
                    ? 'Private direct booking'
                    : 'Control who sees this shift first'}
                </Typography>
              </Box>
              {!isEmbedded && visibility && (
                <Chip
                  label={`Starting with ${ESCALATION_LABELS[visibility]}`}
                  sx={{
                    fontWeight: 700,
                    bgcolor: 'rgba(109, 40, 217, 0.08)',
                    color: 'primary.dark',
                  }}
                />
              )}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {isEmbedded
                ? 'This booking stays private and is only visible to the selected team member.'
                : 'Choose the first audience, then optionally schedule when the shift should expand to broader groups.'}
            </Typography>
          </Stack>
        </Paper>
      </Grid>

      {canPostAnonymously && (
        <Grid size={12}>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              borderRadius: 3,
              borderColor: postAnonymously
                ? 'rgba(109, 40, 217, 0.28)'
                : 'grey.200',
              bgcolor: postAnonymously
                ? isDarkMode
                  ? 'rgba(109, 40, 217, 0.18)'
                  : 'rgba(245, 243, 255, 0.72)'
                : 'background.paper',
            }}
          >
            <FormControlLabel
              control={
                <Checkbox
                  checked={postAnonymously}
                  onChange={(_, checked) => setPostAnonymously(checked)}
                />
              }
              label={
                <Box>
                  <Typography
                    variant="body1"
                    sx={{ display: 'block', fontWeight: 600 }}
                  >
                    Post as anonymous
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Only the pharmacy suburb will be shown.
                  </Typography>
                </Box>
              }
              sx={{ alignItems: 'flex-start', m: 0 }}
            />
          </Paper>
        </Grid>
      )}

      {!isEmbedded && (
        <Grid size={12}>
          <Stack spacing={2}>
            <FormControl fullWidth size="small" sx={fieldSx}>
              <InputLabel>Initial Audience</InputLabel>
              <Select
                value={visibility}
                label="Initial Audience"
                onChange={(event) => setVisibility(event.target.value)}
              >
                {allowedVis.map((option) => (
                  <MenuItem key={option} value={option}>
                    {ESCALATION_LABELS[option]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Grid container spacing={2}>
              {allowedVis.map((option, index) => {
                const meta =
                  VISIBILITY_META[option] ?? VISIBILITY_META.PLATFORM;
                const isSelected = visibility === option;
                const isCurrentOrPast =
                  startIdx > -1 && index <= startIdx;

                return (
                  <Grid key={option} size={{ xs: 12, md: 6, xl: 4 }}>
                    <Paper
                      variant="outlined"
                      onClick={() => setVisibility(option)}
                      sx={{
                        p: 2,
                        borderRadius: 3,
                        cursor: 'pointer',
                        height: '100%',
                        borderColor: isSelected
                          ? 'primary.main'
                          : 'grey.200',
                        bgcolor: isSelected
                          ? isDarkMode
                            ? 'rgba(109, 40, 217, 0.2)'
                            : 'rgba(245, 243, 255, 0.96)'
                          : 'background.paper',
                        backgroundImage: meta.accent,
                        boxShadow: isSelected
                          ? '0 12px 30px rgba(109, 40, 217, 0.14)'
                          : 'none',
                        transition: 'all 180ms ease',
                        '&:hover': {
                          borderColor: isSelected
                            ? 'primary.main'
                            : 'rgba(109, 40, 217, 0.28)',
                          transform: 'translateY(-2px)',
                        },
                      }}
                    >
                      <Stack spacing={1.5} height="100%">
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          spacing={1}
                          alignItems="flex-start"
                        >
                          <Box>
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'text.secondary',
                                fontWeight: 700,
                                letterSpacing: 0.6,
                              }}
                            >
                              {meta.eyebrow}
                            </Typography>
                            <Typography variant="subtitle1" fontWeight={700}>
                              {ESCALATION_LABELS[option]}
                            </Typography>
                          </Box>
                          <Chip
                            size="small"
                            label={
                              isSelected
                                ? 'Selected'
                                : isCurrentOrPast
                                  ? 'In flow'
                                  : `Stage ${index + 1}`
                            }
                            color={isSelected ? 'primary' : 'default'}
                            variant={isSelected ? 'filled' : 'outlined'}
                          />
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          {meta.description}
                        </Typography>
                      </Stack>
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>
          </Stack>
        </Grid>
      )}

      {(showNotifyPharmacyStaff ||
        showNotifyFavoriteStaff ||
        showNotifyChainMembers) && (
        <Grid size={12}>
          <Paper
            variant="outlined"
            sx={{
              p: 2.5,
              borderRadius: 3,
              borderColor: 'grey.200',
              background: isDarkMode
                ? 'linear-gradient(180deg, rgba(16, 27, 47, 1), rgba(15, 23, 42, 0.94))'
                : 'linear-gradient(180deg, rgba(255,255,255,1), rgba(249,250,251,1))',
            }}
          >
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle1" fontWeight={700}>
                  Notification Boost
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Choose which groups should get an immediate nudge when this
                  shift goes live.
                </Typography>
              </Box>
              <Stack spacing={1.25}>
                {showNotifyPharmacyStaff && (
                  <Paper
                    variant="outlined"
                    sx={{
                      borderRadius: 2.5,
                      borderColor: notifyPharmacyStaff
                        ? 'rgba(109, 40, 217, 0.28)'
                        : 'grey.200',
                      bgcolor: notifyPharmacyStaff
                        ? isDarkMode
                          ? 'rgba(109, 40, 217, 0.18)'
                          : 'rgba(245, 243, 255, 0.72)'
                        : 'background.paper',
                    }}
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={notifyPharmacyStaff}
                          onChange={(_, checked) =>
                            setNotifyPharmacyStaff(checked)
                          }
                        />
                      }
                      label="Email and notify pharmacy staff members"
                      sx={{
                        m: 0,
                        px: 1.5,
                        py: 0.75,
                        width: '100%',
                      }}
                    />
                  </Paper>
                )}

                {showNotifyFavoriteStaff && (
                  <Paper
                    variant="outlined"
                    sx={{
                      borderRadius: 2.5,
                      borderColor: notifyFavoriteStaff
                        ? 'rgba(109, 40, 217, 0.28)'
                        : 'grey.200',
                      bgcolor: notifyFavoriteStaff
                        ? isDarkMode
                          ? 'rgba(109, 40, 217, 0.18)'
                          : 'rgba(245, 243, 255, 0.72)'
                        : 'background.paper',
                    }}
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={notifyFavoriteStaff}
                          onChange={(_, checked) =>
                            setNotifyFavoriteStaff(checked)
                          }
                        />
                      }
                      label="Email and notify pharmacy favourite staff"
                      sx={{
                        m: 0,
                        px: 1.5,
                        py: 0.75,
                        width: '100%',
                      }}
                    />
                  </Paper>
                )}

                {showNotifyChainMembers && (
                  <Paper
                    variant="outlined"
                    sx={{
                      borderRadius: 2.5,
                      borderColor: notifyChainMembers
                        ? 'rgba(109, 40, 217, 0.28)'
                        : 'grey.200',
                      bgcolor: notifyChainMembers
                        ? isDarkMode
                          ? 'rgba(109, 40, 217, 0.18)'
                          : 'rgba(245, 243, 255, 0.72)'
                        : 'background.paper',
                    }}
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={notifyChainMembers}
                          onChange={(_, checked) =>
                            setNotifyChainMembers(checked)
                          }
                        />
                      }
                      label="Email and notify your chain members"
                      sx={{
                        m: 0,
                        px: 1.5,
                        py: 0.75,
                        width: '100%',
                      }}
                    />
                  </Paper>
                )}
              </Stack>
            </Stack>
          </Paper>
        </Grid>
      )}

      {!isEmbedded && upcomingTiers.length > 0 && (
        <Grid size={12}>
          <Paper
            variant="outlined"
            sx={{
              p: { xs: 2, md: 2.5 },
              borderRadius: 3,
              borderColor: 'grey.200',
            }}
          >
            <Stack spacing={2.5}>
              <Box>
                <Typography variant="subtitle1" fontWeight={700}>
                  Escalation Schedule
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  If the shift is still unfilled, these timestamps will
                  automatically widen the audience in order.
                </Typography>
              </Box>
              <Grid container spacing={2}>
                {upcomingTiers.map((tier, index) => (
                  <Grid key={tier} size={{ xs: 12, lg: 6 }}>
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 2,
                        borderRadius: 3,
                        borderColor: escalationDates[tier]
                          ? 'rgba(109, 40, 217, 0.24)'
                          : 'grey.200',
                        bgcolor: escalationDates[tier]
                          ? isDarkMode
                            ? 'rgba(109, 40, 217, 0.16)'
                            : 'rgba(245, 243, 255, 0.6)'
                          : 'background.paper',
                      }}
                    >
                      <Stack spacing={1.5}>
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          spacing={1}
                          alignItems="center"
                        >
                          <Typography variant="subtitle2" fontWeight={700}>
                            {`${index + 2}. ${ESCALATION_LABELS[tier]}`}
                          </Typography>
                          <Chip
                            size="small"
                            variant="outlined"
                            label={
                              escalationDates[tier]
                                ? 'Scheduled'
                                : 'Optional'
                            }
                          />
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          {formatEscalationDateTime(escalationDates[tier])}
                        </Typography>
                        <TextField
                          label={`Escalate to ${ESCALATION_LABELS[tier]}`}
                          type="datetime-local"
                          value={escalationDates[tier] || ''}
                          onChange={(event) =>
                            setEscalationDates((dates) => ({
                              ...dates,
                              [tier]: event.target.value,
                            }))
                          }
                          InputLabelProps={{ shrink: true }}
                          fullWidth
                          size="small"
                          sx={fieldSx}
                        />
                      </Stack>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </Stack>
          </Paper>
        </Grid>
      )}
    </Grid>
  );
}
