import {
  Box,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import GroupIcon from '@mui/icons-material/Group';
import HomeIcon from '@mui/icons-material/Home';
import TagIcon from '@mui/icons-material/Tag';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

import type {
  HubChemistTaskerHub,
  HubGroup,
  HubOrganization,
  HubPharmacy,
} from '../../../../types/hub';

interface InternalSidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  chemisttaskerHubs: HubChemistTaskerHub[];
  pharmacies: HubPharmacy[];
  selectedPharmacyId: number | null;
  onPharmacyChange: (id: number) => void;
  communityGroups: HubGroup[];
  organizationGroups: HubGroup[];
  organizations: HubOrganization[];
  selectedViewId: number | string;
  onSelectView: (view: {
    type: 'home' | 'orgHome' | 'group' | 'orgGroup' | 'platformHome';
    id: number | string;
  }) => void;
  canCreateCommunityGroup: boolean;
  canCreateOrganizationGroup: boolean;
  onRequestCreateCommunityGroup: () => void;
  onRequestCreateOrganizationGroup: () => void;
  activeOrganizationId: number | null;
}

export function InternalSidebar({
  isOpen,
  toggleSidebar,
  mobileOpen,
  onMobileClose,
  chemisttaskerHubs,
  pharmacies,
  selectedPharmacyId,
  onPharmacyChange,
  communityGroups,
  organizationGroups,
  organizations,
  selectedViewId,
  onSelectView,
  canCreateCommunityGroup,
  canCreateOrganizationGroup,
  onRequestCreateCommunityGroup,
  onRequestCreateOrganizationGroup,
  activeOrganizationId,
}: InternalSidebarProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const showExpandedContent = isMobile || isOpen;
  const drawerWidth = isMobile ? 328 : isOpen ? 380 : 80;
  const mobileDrawerTopOffset = 96;
  const primaryOrganizationId = activeOrganizationId ?? (organizations[0]?.id ?? null);

  return (
    <Drawer
      variant={isMobile ? 'temporary' : 'permanent'}
      open={isMobile ? mobileOpen : isOpen}
      onClose={isMobile ? onMobileClose : undefined}
      ModalProps={isMobile ? { keepMounted: true } : undefined}
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        alignSelf: 'stretch',
        display: isMobile ? undefined : 'block',
        [`& .MuiDrawer-paper`]: {
          width: drawerWidth,
          boxSizing: 'border-box',
          position: 'relative',
          transition: isMobile
            ? undefined
            : theme.transitions.create('width', {
                duration: theme.transitions.duration.shorter,
              }),
          overflowX: 'hidden',
          overflowY: 'hidden',
          boxShadow: isMobile ? 16 : 3,
          borderRadius: isMobile ? 0 : 3,
          top: isMobile ? `${mobileDrawerTopOffset}px` : 0,
          height: isMobile ? `calc(100% - ${mobileDrawerTopOffset}px)` : '100%',
          maxHeight: isMobile ? `calc(100% - ${mobileDrawerTopOffset}px)` : '100%',
          margin: 0,
          border: isMobile ? 'none' : '1px solid',
          borderColor: 'grey.200',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: isMobile ? 2 : 1.5,
            pl: showExpandedContent ? 1.5 : 0.75,
            gap: 1,
            width: '100%',
            flexShrink: 0,
          }}
        >
          {showExpandedContent ? (
            <PharmacySwitcher
              pharmacies={pharmacies}
              selectedId={selectedPharmacyId}
              onChange={onPharmacyChange}
            />
          ) : null}

          {isMobile ? (
            <Tooltip title="Close hub navigation">
              <IconButton onClick={onMobileClose} aria-label="Close hub navigation" size="small">
                <CloseIcon />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
              <IconButton
                onClick={toggleSidebar}
                aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                size="small"
                sx={{ ml: isOpen ? 'auto' : 0, mr: isOpen ? 0 : 'auto' }}
              >
                {isOpen ? <ChevronLeftIcon /> : <ChevronRightIcon />}
              </IconButton>
            </Tooltip>
          )}
        </Box>

        <Box
          sx={{
            flexGrow: 1,
            width: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
            px: isMobile ? 1.5 : 0,
            pb: isMobile ? 2 : 0,
          }}
        >
          <ListItemButton
            onClick={() => onSelectView({ type: 'home', id: selectedPharmacyId || 'home' })}
            selected={selectedViewId === (selectedPharmacyId || 'home')}
            sx={{
              borderRadius: 1,
              mb: 1,
              justifyContent: showExpandedContent ? 'flex-start' : 'center',
              '&.Mui-selected': {
                bgcolor: 'primary.light',
                color: 'primary.dark',
                '&:hover': { bgcolor: 'primary.light' },
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: showExpandedContent ? 36 : 'auto', color: 'inherit' }}>
              <HomeIcon sx={{ fontSize: 20 }} />
            </ListItemIcon>
            {showExpandedContent ? (
              <ListItemText
                primary="Pharmacy Home"
                primaryTypographyProps={{ fontWeight: 'medium' }}
              />
            ) : null}
          </ListItemButton>

          <Divider sx={{ my: 2, width: '100%' }} />

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            {showExpandedContent ? (
              <Typography variant="overline" color="text.secondary" sx={{ pl: 1 }}>
                Community Groups
              </Typography>
            ) : null}
            <Tooltip
              title={
                canCreateCommunityGroup
                  ? 'Create community group'
                  : 'Only pharmacy admins can create groups'
              }
            >
              <span>
                <IconButton
                  onClick={onRequestCreateCommunityGroup}
                  size="small"
                  disabled={!canCreateCommunityGroup}
                  sx={{
                    color: 'grey.500',
                    '&:hover': { bgcolor: 'grey.100', color: 'grey.900' },
                    width: showExpandedContent ? 'auto' : '100%',
                    justifyContent: showExpandedContent ? 'flex-start' : 'center',
                  }}
                >
                  <AddIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>

          <List dense disablePadding>
            {communityGroups.map((group) => (
              <ListItemButton
                key={group.id}
                onClick={() => onSelectView({ type: 'group', id: group.id })}
                selected={selectedViewId === group.id}
                title={group.name}
                sx={{
                  borderRadius: 1,
                  mb: 0.5,
                  justifyContent: showExpandedContent ? 'flex-start' : 'center',
                  '&.Mui-selected': {
                    bgcolor: 'grey.200',
                    fontWeight: 'medium',
                    color: 'grey.900',
                    '&:hover': { bgcolor: 'grey.200' },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: showExpandedContent ? 36 : 'auto', color: 'grey.400' }}>
                  <TagIcon sx={{ fontSize: 20 }} />
                </ListItemIcon>
                {showExpandedContent ? (
                  <ListItemText
                    primary={group.name}
                    primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                  />
                ) : null}
              </ListItemButton>
            ))}
          </List>

          <Divider sx={{ my: 2, width: '100%' }} />

          {organizations.length > 0 && primaryOrganizationId ? (
            <ListItemButton
              onClick={() => onSelectView({ type: 'orgHome', id: primaryOrganizationId })}
              selected={selectedViewId === primaryOrganizationId}
              sx={{
                borderRadius: 1,
                mb: 1,
                justifyContent: showExpandedContent ? 'flex-start' : 'center',
                '&.Mui-selected': {
                  bgcolor: 'info.light',
                  color: 'info.dark',
                  '&:hover': { bgcolor: 'info.light' },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: showExpandedContent ? 36 : 'auto', color: 'inherit' }}>
                <BusinessCenterIcon sx={{ fontSize: 20 }} />
              </ListItemIcon>
              {showExpandedContent ? (
                <ListItemText
                  primary="Organization Home"
                  primaryTypographyProps={{ fontWeight: 'medium' }}
                />
              ) : null}
            </ListItemButton>
          ) : null}

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, mt: 2 }}>
            {showExpandedContent ? (
              <Typography variant="overline" color="text.secondary" sx={{ pl: 1 }}>
                Organization Hub
              </Typography>
            ) : null}
            <Tooltip
              title={
                canCreateOrganizationGroup
                  ? 'Create organization group'
                  : 'Only organization admins can create groups'
              }
            >
              <span>
                <IconButton
                  onClick={onRequestCreateOrganizationGroup}
                  size="small"
                  disabled={!canCreateOrganizationGroup}
                  sx={{
                    color: 'grey.500',
                    '&:hover': { bgcolor: 'grey.100', color: 'grey.900' },
                    width: showExpandedContent ? 'auto' : '100%',
                    justifyContent: showExpandedContent ? 'flex-start' : 'center',
                  }}
                >
                  <AddIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>

          <List dense disablePadding>
            {organizationGroups.map((group) => (
              <ListItemButton
                key={group.id}
                onClick={() => onSelectView({ type: 'orgGroup', id: group.id })}
                selected={selectedViewId === group.id}
                title={group.name}
                sx={{
                  borderRadius: 1,
                  mb: 0.5,
                  justifyContent: showExpandedContent ? 'flex-start' : 'center',
                  '&.Mui-selected': {
                    bgcolor: 'grey.200',
                    fontWeight: 'medium',
                    color: 'grey.900',
                    '&:hover': { bgcolor: 'grey.200' },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: showExpandedContent ? 36 : 'auto', color: 'grey.400' }}>
                  <TagIcon sx={{ fontSize: 20 }} />
                </ListItemIcon>
                {showExpandedContent ? (
                  <ListItemText
                    primary={group.name}
                    primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                  />
                ) : null}
              </ListItemButton>
            ))}
          </List>

          {!!chemisttaskerHubs.length ? (
            <>
              <Divider sx={{ my: 2, width: '100%' }} />
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                {showExpandedContent ? (
                  <Typography variant="overline" color="text.secondary" sx={{ pl: 1 }}>
                    ChemistTasker Hub
                  </Typography>
                ) : null}
              </Box>

              <List dense disablePadding>
                {chemisttaskerHubs.map((hub) => (
                  <ListItemButton
                    key={hub.key}
                    onClick={() => onSelectView({ type: 'platformHome', id: hub.key })}
                    selected={selectedViewId === hub.key}
                    title={hub.label}
                    sx={{
                      borderRadius: 1,
                      mb: 0.5,
                      justifyContent: showExpandedContent ? 'flex-start' : 'center',
                      '&.Mui-selected': {
                        bgcolor: 'warning.light',
                        color: 'warning.dark',
                        '&:hover': { bgcolor: 'warning.light' },
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: showExpandedContent ? 36 : 'auto', color: 'inherit' }}>
                      <GroupIcon sx={{ fontSize: 20 }} />
                    </ListItemIcon>
                    {showExpandedContent ? (
                      <ListItemText
                        primary={hub.label}
                        secondary={hub.audienceType.replace(/_/g, ' ')}
                        primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                        secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
                      />
                    ) : null}
                  </ListItemButton>
                ))}
              </List>
            </>
          ) : null}
        </Box>
      </Box>
    </Drawer>
  );
}

interface PharmacySwitcherProps {
  pharmacies: HubPharmacy[];
  selectedId: number | null;
  onChange: (id: number) => void;
}

function PharmacySwitcher({ pharmacies, selectedId, onChange }: PharmacySwitcherProps) {
  const selected = pharmacies.find((p) => p.id === selectedId);

  return (
    <FormControl fullWidth size="small">
      <InputLabel id="pharmacy-select-label">Pharmacy</InputLabel>
      <Select
        labelId="pharmacy-select-label"
        value={selectedId || ''}
        label="Pharmacy"
        onChange={(e) => onChange(e.target.value as number)}
        renderValue={() => (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Box
              sx={{
                display: 'flex',
                height: 24,
                width: 24,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 1,
                bgcolor: 'primary.main',
                color: 'white',
                fontSize: '0.8rem',
                flexShrink: 0,
              }}
            >
              {selected?.name.charAt(0)}
            </Box>
            <Typography
              variant="body2"
              sx={{
                flexGrow: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {selected?.name}
            </Typography>
          </Box>
        )}
      >
        {pharmacies.map((pharmacy) => (
          <MenuItem key={pharmacy.id} value={pharmacy.id}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                sx={{
                  display: 'flex',
                  height: 24,
                  width: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 1,
                  bgcolor: 'grey.200',
                  fontSize: '0.8rem',
                  flexShrink: 0,
                }}
              >
                {pharmacy.name.charAt(0)}
              </Box>
              <Typography variant="body2">{pharmacy.name}</Typography>
            </Box>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
