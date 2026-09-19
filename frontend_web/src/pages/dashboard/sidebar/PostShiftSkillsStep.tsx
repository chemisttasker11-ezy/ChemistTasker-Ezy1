import type { Dispatch, SetStateAction } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import skillsCatalog from '../../../../../shared-core/skills_catalog.json';

type Setter<T> = Dispatch<SetStateAction<T>>;

type Props = {
  roleNeeded: string;
  mustHave: string[];
  setMustHave: Setter<string[]>;
  niceToHave: string[];
  setNiceToHave: Setter<string[]>;
  isDarkMode: boolean;
};

export default function PostShiftSkillsStep({
  roleNeeded,
  mustHave,
  setMustHave,
  niceToHave,
  setNiceToHave,
  isDarkMode,
}: Props) {
  const roleKey = roleNeeded === 'PHARMACIST' ? 'pharmacist' : 'otherstaff';
  const roleCatalog = (skillsCatalog as any)[roleKey] || {};

  const categories = [
    {
      key: 'clinical_services',
      title: 'Clinical Services',
      items: roleCatalog.clinical_services || [],
    },
    {
      key: 'dispense_software',
      title: 'Dispense Software',
      items: roleCatalog.dispense_software || [],
    },
    {
      key: 'expanded_scope',
      title: 'Expanded Scope',
      items: roleCatalog.expanded_scope || [],
    },
  ].filter((category) => category.items.length > 0);

  return (
    <Stack spacing={3}>
      <Alert severity="info" sx={{ borderRadius: 2 }}>
        Select which skills are <strong>Required</strong> (must have to apply) or{' '}
        <strong>Favorable</strong> (nice to have, but not mandatory).
      </Alert>

      <Box sx={{ width: '100%' }}>
        {categories.map((category, index) => {
          const selectedCount = category.items.filter(
            (skill: any) =>
              mustHave.includes(skill.code) || niceToHave.includes(skill.code),
          ).length;

          return (
            <Accordion
              key={category.key}
              disableGutters
              elevation={0}
              defaultExpanded={index === 0}
              sx={{
                border: '1px solid',
                borderColor: 'grey.200',
                '&:not(:last-child)': { borderBottom: 0 },
                '&:before': { display: 'none' },
                '&:first-of-type': {
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                },
                '&:last-of-type': {
                  borderBottomLeftRadius: 12,
                  borderBottomRightRadius: 12,
                },
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  bgcolor: isDarkMode
                    ? 'rgba(15, 23, 42, 0.84)'
                    : 'grey.50',
                  borderBottom: '1px solid',
                  borderColor: 'grey.200',
                  '& .MuiAccordionSummary-content': {
                    alignItems: 'center',
                    gap: 1.5,
                    my: 1.5,
                  },
                }}
              >
                <Typography variant="subtitle1" fontWeight={600}>
                  {category.title}
                </Typography>
                {selectedCount > 0 && (
                  <Chip
                    size="small"
                    label={`${selectedCount} selected`}
                    color="primary"
                    variant="outlined"
                    sx={{
                      height: 22,
                      fontWeight: 600,
                      bgcolor: isDarkMode
                        ? 'rgba(15, 23, 42, 0.9)'
                        : 'white',
                    }}
                  />
                )}
              </AccordionSummary>

              <AccordionDetails sx={{ p: 0 }}>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: '1fr',
                      lg: 'repeat(2, minmax(0, 1fr))',
                    },
                  }}
                >
                  {category.items.map((skill: any, itemIndex: number) => {
                    const value = mustHave.includes(skill.code)
                      ? 'required'
                      : niceToHave.includes(skill.code)
                        ? 'favorable'
                        : null;

                    return (
                      <Box
                        key={skill.code}
                        sx={{
                          display: 'flex',
                          flexDirection: { xs: 'column', xl: 'row' },
                          alignItems: { xs: 'flex-start', xl: 'center' },
                          justifyContent: 'space-between',
                          p: 2.5,
                          gap: 2,
                          minHeight: 124,
                          minWidth: 0,
                          borderBottom:
                            itemIndex < category.items.length - 1
                              ? '1px solid'
                              : 'none',
                          borderRight: {
                            lg:
                              itemIndex % 2 === 0 &&
                              itemIndex < category.items.length - 1
                                ? '1px solid'
                                : 'none',
                          },
                          borderColor: 'grey.100',
                          bgcolor:
                            value === 'required'
                              ? 'rgba(109, 40, 217, 0.06)'
                              : value === 'favorable'
                                ? 'rgba(16, 185, 129, 0.08)'
                                : 'transparent',
                          transition: 'all 0.2s ease-in-out',
                          '&:hover': {
                            bgcolor: value
                              ? undefined
                              : isDarkMode
                                ? 'rgba(148, 163, 184, 0.08)'
                                : 'grey.50',
                          },
                        }}
                      >
                        <Box
                          sx={{
                            flex: '1 1 auto',
                            minWidth: 0,
                            pr: { xl: 1 },
                          }}
                        >
                          <Typography
                            variant="body1"
                            fontWeight={value ? 600 : 500}
                            color={value ? 'text.primary' : 'text.secondary'}
                            sx={{ overflowWrap: 'anywhere' }}
                          >
                            {skill.label}
                          </Typography>
                          {skill.description && (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{
                                mt: 0.5,
                                overflowWrap: 'anywhere',
                              }}
                            >
                              {skill.description}
                            </Typography>
                          )}
                        </Box>

                        <ToggleButtonGroup
                          size="small"
                          value={value}
                          exclusive
                          onChange={(_, nextValue) => {
                            setMustHave((previous) =>
                              previous.filter((code) => code !== skill.code),
                            );
                            setNiceToHave((previous) =>
                              previous.filter((code) => code !== skill.code),
                            );
                            if (nextValue === 'required') {
                              setMustHave((previous) => [
                                ...previous,
                                skill.code,
                              ]);
                            } else if (nextValue === 'favorable') {
                              setNiceToHave((previous) => [
                                ...previous,
                                skill.code,
                              ]);
                            }
                          }}
                          sx={{
                            flex: '0 0 auto',
                            width: { xs: '100%', sm: 'auto' },
                            bgcolor: 'background.paper',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                            '& .MuiToggleButtonGroup-grouped': {
                              border: '1px solid',
                              borderColor: 'grey.300',
                            },
                            '& .MuiToggleButton-root': {
                              flex: { xs: 1, sm: '0 0 auto' },
                              minWidth: 108,
                              px: 2,
                              py: 0.75,
                              textTransform: 'none',
                              fontWeight: 600,
                              color: 'text.secondary',
                            },
                            '& .Mui-selected': {
                              bgcolor:
                                value === 'required'
                                  ? 'primary.main'
                                  : 'secondary.dark',
                              color: 'white !important',
                              borderColor:
                                value === 'required'
                                  ? 'primary.main'
                                  : 'secondary.dark',
                              zIndex: 1,
                              '&:hover': {
                                bgcolor:
                                  value === 'required'
                                    ? 'primary.dark'
                                    : '#03694b',
                              },
                            },
                          }}
                        >
                          <ToggleButton value="required">
                            Required
                          </ToggleButton>
                          <ToggleButton value="favorable">
                            Favorable
                          </ToggleButton>
                        </ToggleButtonGroup>
                      </Box>
                    );
                  })}
                </Box>
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>
    </Stack>
  );
}
