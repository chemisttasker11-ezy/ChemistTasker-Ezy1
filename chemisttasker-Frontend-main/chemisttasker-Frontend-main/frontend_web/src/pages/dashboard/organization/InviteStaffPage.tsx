// src/pages/dashboard/organization/InviteStaffPage.tsx

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Container,
  TextField,
  Button,
  Alert,
  MenuItem,
  Typography,
  Box,
  FormControl,
  InputLabel,
  Select,
  OutlinedInput,
  InputAdornment,
  Checkbox,
  ListItemText,
  Stack,
  CircularProgress,
  Card,
  CardHeader,
  CardContent,
  Collapse,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormHelperText,
  Chip,
  Tooltip,
} from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FilterListIcon from '@mui/icons-material/FilterList';
import RefreshIcon from '@mui/icons-material/Refresh';

import { useAuth } from '../../../contexts/AuthContext';
import type { OrgMembership, PharmacyMembership } from '../../../contexts/AuthContext';
import { ORG_ROLES } from '../../../constants/roles';
import {
  fetchPharmaciesService,
  getOrganizationMemberships,
  getOrganizationRoleDefinitions,
  inviteOrgUser,
  deleteOrganizationMembership,
  updateOrganizationMembership,
} from '@chemisttasker/shared-core';

type RoleDefinition = {
  key: string;
  label: string;
  description: string;
  default_admin_level: string;
  allowed_admin_levels: string[];
  requires_job_title: boolean;
  requires_region: boolean;
  requires_pharmacies: boolean;
  capabilities: string[];
};

type AdminLevelDefinition = {
  key: string;
  label: string;
  description: string;
  capabilities: string[];
};

type PharmacyOption = {
  id: number;
  name: string;
};

type RoleMetadata = {
  admin_levels?: AdminLevelDefinition[];
  roles?: RoleDefinition[];
  documentation?: string;
};

type OrganizationMember = {
  id: number;
  organization: number;
  role: string;
  role_label: string;
  admin_level: string;
  admin_level_label: string;
  job_title?: string | null;
  region?: string | null;
  user?: {
    id?: number;
    email?: string;
    first_name?: string;
    last_name?: string;
    name?: string;
  } | null;
  pharmacies: PharmacyOption[];
  capabilities: string[];
};

type EditMemberForm = {
  id: number;
  role: string;
  admin_level: string;
  job_title: string;
  region: string;
  pharmacy_ids: number[];
};

const CAPABILITY_LABELS: Record<string, string> = {
  manage_admins: 'Manage Admins',
  manage_staff: 'Manage Staff',
  manage_roster: 'Manage Roster',
  manage_communications: 'Manage Communications',
  invite_staff: 'Invite Staff',
  claim_pharmacy: 'Claim Pharmacies',
  view_all_pharmacies: 'View All Pharmacies',
  assign_pharmacies: 'Assign Pharmacies',
};

const isOrgMembership = (membership: OrgMembership | PharmacyMembership | null | undefined): membership is OrgMembership => {
  return !!(
    membership &&
    typeof membership === 'object' &&
    'organization_id' in membership &&
    typeof (membership as OrgMembership).organization_id === 'number'
  );
};

export default function InviteStaffPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [warning, setWarning] = useState<string>('');

  const [roleDefinitions, setRoleDefinitions] = useState<RoleDefinition[]>([]);
  const [adminLevelMap, setAdminLevelMap] = useState<Record<string, AdminLevelDefinition>>({});
  const [documentation, setDocumentation] = useState<string>('');
  const [pharmacies, setPharmacies] = useState<PharmacyOption[]>([]);

  const [email, setEmail] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [selectedAdminLevel, setSelectedAdminLevel] = useState<string>('');
  const [jobTitle, setJobTitle] = useState<string>('');
  const [region, setRegion] = useState<string>('');
  const [selectedPharmacyIds, setSelectedPharmacyIds] = useState<number[]>([]);
  const [inviteOpen, setInviteOpen] = useState<boolean>(true);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [membersLoading, setMembersLoading] = useState<boolean>(false);
  const [membersError, setMembersError] = useState<string>('');
  const [memberSearch, setMemberSearch] = useState<string>('');
  const [roleFilterValue, setRoleFilterValue] = useState<string>('ALL');
  const [adminFilterValue, setAdminFilterValue] = useState<string>('ALL');
  const [editDialogOpen, setEditDialogOpen] = useState<boolean>(false);
  const [editForm, setEditForm] = useState<EditMemberForm | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [targetMember, setTargetMember] = useState<OrganizationMember | null>(null);
  const [savingMember, setSavingMember] = useState<boolean>(false);
  const [deletingMember, setDeletingMember] = useState<boolean>(false);
  const [editError, setEditError] = useState<string>('');
  const [deleteError, setDeleteError] = useState<string>('');

  const orgMembership = useMemo<OrgMembership | null>(() => {
    if (!Array.isArray(user?.memberships)) return null;
    return (
      user.memberships.find((membership): membership is OrgMembership =>
        isOrgMembership(membership) &&
        !!membership.role &&
        ORG_ROLES.includes(membership.role as (typeof ORG_ROLES)[number])
      ) ?? null
    );
  }, [user]);

  const orgId = orgMembership?.organization_id ?? null;
  const inviterCapabilities = new Set(orgMembership?.capabilities ?? []);
  const canInvite = inviterCapabilities.has('invite_staff');

  const eligibleRoles = useMemo(
    () =>
      roleDefinitions.filter((definition) => {
        if (definition.key === 'ORG_ADMIN') {
          return inviterCapabilities.has('claim_pharmacy');
        }
        return true;
      }),
    [roleDefinitions, inviterCapabilities]
  );

  const roleDefinition = useMemo(
    () => eligibleRoles.find((definition) => definition.key === selectedRole) ?? null,
    [eligibleRoles, selectedRole]
  );

  const adminLevelDefinition = useMemo(
    () => (selectedAdminLevel ? adminLevelMap[selectedAdminLevel] ?? null : null),
    [adminLevelMap, selectedAdminLevel]
  );

  const roleDefinitionMap = useMemo(() => {
    const map = new Map<string, RoleDefinition>();
    roleDefinitions.forEach((definition) => {
      map.set(definition.key, definition);
    });
    return map;
  }, [roleDefinitions]);

  const adminLevelOptions = useMemo(
    () => Object.values(adminLevelMap),
    [adminLevelMap]
  );

  const currentUserId = user?.id ?? null;

  const filteredMembers = useMemo(() => {
    const search = memberSearch.trim().toLowerCase();
    return members.filter((member) => {
      const matchesSearch =
        !search ||
        [
          member.user?.name,
          member.user?.email,
          member.role_label,
          member.job_title,
        ].some((value) => value && value.toLowerCase().includes(search));
      const matchesRole = roleFilterValue === 'ALL' || member.role === roleFilterValue;
      const matchesAdmin =
        adminFilterValue === 'ALL' || member.admin_level === adminFilterValue;
      return matchesSearch && matchesRole && matchesAdmin;
    });
  }, [members, memberSearch, roleFilterValue, adminFilterValue]);

  const sortedMembers = useMemo(() => {
    return [...filteredMembers].sort((a, b) => {
      const nameA = (a.user?.name || a.user?.email || '').toLowerCase();
      const nameB = (b.user?.name || b.user?.email || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [filteredMembers]);

  useEffect(() => {
    if (!orgId) return;

    let isMounted = true;
    setLoading(true);
    setError('');

    const fetchMetadata = async () => {
      try {
        const [roleResponse, pharmaciesResponse] = await Promise.all([
          getOrganizationRoleDefinitions(),
          fetchPharmaciesService({ organization: orgId, limit: 200 }),
        ]);

        if (!isMounted) return;

        const roleData: RoleMetadata = (roleResponse as RoleMetadata) || {};
        const adminLevelsArray: AdminLevelDefinition[] = roleData.admin_levels ?? [];
        const roleDefs: RoleDefinition[] = roleData.roles ?? [];

        const adminLevelDictionary = adminLevelsArray.reduce<Record<string, AdminLevelDefinition>>((acc, level) => {
          acc[level.key] = level;
          return acc;
        }, {});

        const pharmacyResults = Array.isArray(pharmaciesResponse) ? pharmaciesResponse : [];

        setRoleDefinitions(roleDefs);
        setAdminLevelMap(adminLevelDictionary);
        setDocumentation(roleData.documentation ?? '');
        setPharmacies(
          pharmacyResults.map((item: any) => ({
            id: item.id,
            name: item.name,
          }))
        );

        if (!selectedRole && roleDefs.length) {
          setSelectedRole(roleDefs[0].key);
        }
      } catch (err) {
        console.error(err);
        if (isMounted) {
          setError('Unable to load organization role metadata.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchMetadata();
    return () => {
      isMounted = false;
    };
  }, [orgId]);

  useEffect(() => {
    if (!roleDefinition) return;

    if (!roleDefinition.allowed_admin_levels.includes(selectedAdminLevel)) {
      setSelectedAdminLevel(roleDefinition.default_admin_level);
    }

    if (!roleDefinition.requires_job_title) {
      setJobTitle('');
    }
    if (!roleDefinition.requires_region) {
      setRegion('');
    }
    if (!roleDefinition.requires_pharmacies) {
      setSelectedPharmacyIds([]);
    }
  }, [roleDefinition, selectedAdminLevel]);

  useEffect(() => {
    if (!roleDefinition) return;
    if (roleDefinition.key === 'REGION_ADMIN' && selectedAdminLevel === 'ROSTER_MANAGER') {
      setWarning(
        'Roster Managers can manage shifts but cannot invite or manage staff. This invitation will have limited permissions.'
      );
    } else {
      setWarning('');
    }
  }, [roleDefinition, selectedAdminLevel]);

  const loadMemberships = useCallback(async () => {
    if (!orgId) return;
    setMembersLoading(true);
    setMembersError('');
    try {
      const response = await getOrganizationMemberships({ organization: orgId, limit: 200 });
      const data: OrganizationMember[] = Array.isArray((response as any)?.results)
        ? (response as any).results
        : Array.isArray(response as any)
        ? (response as any)
        : [];
      setMembers(data);
    } catch (err: any) {
      console.error(err);
      const message = err?.response?.data?.detail ?? 'Unable to load organization members.';
      setMembersError(message);
    } finally {
      setMembersLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    loadMemberships();
  }, [orgId, loadMemberships]);

  if (!user) {
    return <div>Loading user info</div>;
  }

  if (!orgId) {
    return <Alert severity="error">You do not have an organization membership.</Alert>;
  }

  const handleInvite = async () => {
    if (!roleDefinition) {
      setError('Select an organization role.');
      return;
    }
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    if (!selectedAdminLevel) {
      setError('Select an admin level.');
      return;
    }
    if (roleDefinition.requires_job_title && !jobTitle.trim()) {
      setError('Job title is required for this role.');
      return;
    }
    if (roleDefinition.requires_region && !region.trim()) {
      setError('Region is required for this role.');
      return;
    }
  if (roleDefinition.requires_pharmacies && selectedPharmacyIds.length === 0) {
      setError('Select at least one pharmacy for this role.');
      return;
    }

    setError('');
    setMessage('');
    try {
      const payload: Record<string, unknown> = {
        email: email.trim().toLowerCase(),
        organization: orgId,
        role: selectedRole,
        admin_level: selectedAdminLevel,
      };
      if (roleDefinition.requires_job_title && jobTitle.trim()) {
        payload.job_title = jobTitle.trim();
      }
      if (roleDefinition.requires_region && region.trim()) {
        payload.region = region.trim();
      }
      if (roleDefinition.requires_pharmacies) {
        payload.pharmacies = selectedPharmacyIds;
      }

      await inviteOrgUser(payload);
      await loadMemberships();
      setMessage('Invitation sent successfully.');
      setEmail('');
      if (roleDefinition.requires_job_title) setJobTitle('');
      if (roleDefinition.requires_region) setRegion('');
      if (roleDefinition.requires_pharmacies) setSelectedPharmacyIds([]);
    } catch (err: any) {
      console.error(err);
      const detail =
        err?.response?.data?.detail ||
        (typeof err?.response?.data === 'object' ? JSON.stringify(err.response.data) : null) ||
        'Failed to send invite.';
      setError(detail);
    }
  };

  const handleOpenEditDialog = (member: OrganizationMember) => {
    setEditError('');
    setEditForm({
      id: member.id,
      role: member.role,
      admin_level: member.admin_level,
      job_title: member.job_title ?? '',
      region: member.region ?? '',
      pharmacy_ids: member.pharmacies.map((pharmacy) => pharmacy.id),
    });
    setEditDialogOpen(true);
  };

  const handleCloseEditDialog = () => {
    if (savingMember) return;
    setEditDialogOpen(false);
    setEditForm(null);
    setEditError('');
  };

  const handleEditFieldChange = <K extends keyof EditMemberForm>(key: K, value: EditMemberForm[K]) => {
    setEditForm((previous) => (previous ? { ...previous, [key]: value } : previous));
  };

  const handleSaveMember = async () => {
    if (!editForm) return;
    const definition = roleDefinitionMap.get(editForm.role);
    if (!definition) {
      setEditError('Invalid role selection.');
      return;
    }
    if (definition.requires_job_title && !editForm.job_title.trim()) {
      setEditError('Job title is required for this role.');
      return;
    }
    if (definition.requires_region && !editForm.region.trim()) {
      setEditError('Region is required for this role.');
      return;
    }
    if (definition.requires_pharmacies && editForm.pharmacy_ids.length === 0) {
      setEditError('Select at least one pharmacy.');
      return;
    }

    setSavingMember(true);
    setEditError('');
    try {
      await updateOrganizationMembership(editForm.id, {
        role: editForm.role,
        admin_level: editForm.admin_level,
        job_title: editForm.job_title.trim() || null,
        region: editForm.region.trim() || null,
        pharmacy_ids: editForm.pharmacy_ids,
      });
      await loadMemberships();
      handleCloseEditDialog();
    } catch (err: any) {
      console.error(err);
      const message =
        err?.response?.data?.detail ||
        (typeof err?.response?.data === 'object' ? JSON.stringify(err.response.data) : null) ||
        'Failed to update member.';
      setEditError(message);
    } finally {
      setSavingMember(false);
    }
  };

  const handleOpenDeleteDialog = (member: OrganizationMember) => {
    setDeleteError('');
    setTargetMember(member);
    setDeleteDialogOpen(true);
  };

  const handleCloseDeleteDialog = () => {
    if (deletingMember) return;
    setDeleteDialogOpen(false);
    setTargetMember(null);
    setDeleteError('');
  };

  const handleConfirmDelete = async () => {
    if (!targetMember) return;
    setDeletingMember(true);
    setDeleteError('');
    try {
      await deleteOrganizationMembership(targetMember.id);
      await loadMemberships();
      handleCloseDeleteDialog();
    } catch (err: any) {
      console.error(err);
      const message =
        err?.response?.data?.detail ||
        (typeof err?.response?.data === 'object' ? JSON.stringify(err.response.data) : null) ||
        'Failed to delete member.';
      setDeleteError(message);
    } finally {
      setDeletingMember(false);
    }
  };

  // const capabilityList = roleDefinition?.capabilities ?? [];
  // const adminCapabilities = adminLevelDefinition?.capabilities ?? [];
  const editRoleDefinition = editForm ? roleDefinitionMap.get(editForm.role) ?? null : null;
  const editAdminLevelDefinition = editForm ? adminLevelMap[editForm.admin_level] ?? null : null;
  const editCapabilities = [
    ...(editRoleDefinition?.capabilities ?? []),
    ...(editAdminLevelDefinition?.capabilities ?? []),
  ];

  return (
    <Container sx={{ mt: 4, maxWidth: 960 }}>
      <Stack spacing={3}>
        {!canInvite && (
          <Alert severity="warning">
            You do not currently have permission to send invitations. Contact an organization admin for access.
          </Alert>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {message && <Alert severity="success">{message}</Alert>}
        {warning && <Alert severity="warning">{warning}</Alert>}

        {documentation && (
          <Alert severity="info" sx={{ whiteSpace: 'pre-line' }}>
            {documentation.trim()}
          </Alert>
        )}

        <Card>
          <CardHeader
            title="Invite Organization Member"
            action={
              <Button
                variant="outlined"
                startIcon={inviteOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                onClick={() => setInviteOpen((prev) => !prev)}
              >
                {inviteOpen ? 'Hide Form' : 'Show Form'}
              </Button>
            }
          />
          <Collapse in={inviteOpen} timeout="auto" unmountOnExit>
            <CardContent>
              {loading ? (
                <Box display="flex" justifyContent="center" py={4}>
                  <CircularProgress />
                </Box>
              ) : (
                <Box component="form" noValidate autoComplete="off">
                  <TextField
                    fullWidth
                    label="Email"
                    type="email"
                    required
                    margin="normal"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />

                  <FormControl fullWidth margin="normal">
                    <InputLabel id="invite-role-label">Organization Role</InputLabel>
                    <Select
                      labelId="invite-role-label"
                      value={selectedRole}
                      label="Organization Role"
                      onChange={(event) => setSelectedRole(event.target.value)}
                    >
                      {eligibleRoles.map((definition) => (
                        <MenuItem key={definition.key} value={definition.key}>
                          {definition.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {roleDefinition && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {roleDefinition.description}
                    </Typography>
                  )}

                  {roleDefinition && (
                    <FormControl fullWidth margin="normal">
                      <InputLabel id="invite-admin-level-label">Admin Level</InputLabel>
                      <Select
                        labelId="invite-admin-level-label"
                        value={selectedAdminLevel}
                        label="Admin Level"
                        onChange={(event) => setSelectedAdminLevel(event.target.value)}
                      >
                        {roleDefinition.allowed_admin_levels.map((levelKey) => {
                          const levelDef = adminLevelMap[levelKey];
                          return (
                            <MenuItem key={levelKey} value={levelKey}>
                              {levelDef?.label ?? levelKey.replace('_', ' ')}
                            </MenuItem>
                          );
                        })}
                      </Select>
                    </FormControl>
                  )}

                  {adminLevelDefinition && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {adminLevelDefinition.description}
                    </Typography>
                  )}

                  {roleDefinition?.requires_job_title && (
                    <TextField
                      fullWidth
                      label="Job Title"
                      required
                      margin="normal"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                    />
                  )}

                  {roleDefinition?.requires_region && (
                    <TextField
                      fullWidth
                      label="Region"
                      required
                      margin="normal"
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                    />
                  )}

                  {roleDefinition?.requires_pharmacies && (
                    <FormControl fullWidth margin="normal">
                      <InputLabel id="invite-pharmacies-label">Pharmacies</InputLabel>
                      <Select
                        labelId="invite-pharmacies-label"
                        label="Pharmacies"
                        value={selectedPharmacyIds}
                        onChange={(event) => {
                          const value = event.target.value;
                          setSelectedPharmacyIds(
                            typeof value === 'string' ? value.split(',').map(Number) : (value as number[])
                          );
                        }}
                        multiple
                        input={<OutlinedInput label="Pharmacies" />}
                        renderValue={(selected) => {
                          const ids = selected as number[];
                          if (!ids.length) return 'Select pharmacies';
                          return ids
                            .map((id) => pharmacies.find((pharmacy) => pharmacy.id === id)?.name ?? `#${id}`)
                            .join(', ');
                        }}
                      >
                        {pharmacies.map((pharmacy) => (
                          <MenuItem key={pharmacy.id} value={pharmacy.id}>
                            <Checkbox checked={selectedPharmacyIds.includes(pharmacy.id)} />
                            <ListItemText primary={pharmacy.name} />
                          </MenuItem>
                        ))}
                      </Select>
                      {!pharmacies.length && (
                        <Typography variant="caption" color="text.secondary">
                          No pharmacies available for assignment.
                        </Typography>
                      )}
                    </FormControl>
                  )}

                  {/* {(capabilityList.length || adminCapabilities.length) && (
                    <Box mt={2}>
                      <Typography variant="subtitle2">Capabilities</Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap">
                        {capabilityList.concat(adminCapabilities).map((capability) => {
                          const label = CAPABILITY_LABELS[capability] ?? capability.replace('_', ' ');
                          return (
                            <Box
                              key={`${capability}-${label}`}
                              sx={{
                                px: 1.5,
                                py: 0.5,
                                borderRadius: 1,
                                bgcolor: 'grey.100',
                                fontSize: '0.75rem',
                              }}
                            >
                              {label}
                            </Box>
                          );
                        })}
                      </Stack>
                    </Box>
                  )} */}

                  <Box mt={3}>
                    <Button variant="contained" onClick={handleInvite} disabled={!canInvite || loading}>
                      Send Invite
                    </Button>
                  </Box>
                </Box>
              )}
            </CardContent>
          </Collapse>
        </Card>

        <Card>
          <CardHeader
            title="Organization Members"
            action={
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={1}
                alignItems={{ xs: 'stretch', md: 'center' }}
              >
                <TextField
                  size="small"
                  placeholder="Search members"
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <FilterListIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel id="filter-role-label">Role</InputLabel>
                  <Select
                    labelId="filter-role-label"
                    value={roleFilterValue}
                    label="Role"
                    onChange={(event) => setRoleFilterValue(event.target.value)}
                  >
                    <MenuItem value="ALL">All Roles</MenuItem>
                    {roleDefinitions.map((definition) => (
                      <MenuItem key={definition.key} value={definition.key}>
                        {definition.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 170 }}>
                  <InputLabel id="filter-admin-label">Admin Level</InputLabel>
                  <Select
                    labelId="filter-admin-label"
                    value={adminFilterValue}
                    label="Admin Level"
                    onChange={(event) => setAdminFilterValue(event.target.value)}
                  >
                    <MenuItem value="ALL">All Levels</MenuItem>
                    {adminLevelOptions.map((level) => (
                      <MenuItem key={level.key} value={level.key}>
                        {level.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Tooltip title="Refresh members list">
                  <span>
                    <IconButton onClick={loadMemberships} disabled={membersLoading}>
                      <RefreshIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            }
          />
          <Divider />
          <CardContent>
            {membersError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {membersError}
              </Alert>
            )}
            {membersLoading ? (
              <Box display="flex" justifyContent="center" py={4}>
                <CircularProgress />
              </Box>
            ) : sortedMembers.length ? (
              <Paper variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>Role</TableCell>
                      <TableCell>Admin Level</TableCell>
                      <TableCell>Job Title</TableCell>
                      <TableCell>Region</TableCell>
                      <TableCell>Pharmacies</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sortedMembers.map((member) => (
                      <TableRow key={member.id} hover>
                        <TableCell>{member.user?.name || member.user?.email || '—'}</TableCell>
                        <TableCell>{member.user?.email || '—'}</TableCell>
                        <TableCell>{member.role_label}</TableCell>
                        <TableCell>{member.admin_level_label}</TableCell>
                        <TableCell>{member.job_title || '—'}</TableCell>
                        <TableCell>{member.region || '—'}</TableCell>
                        <TableCell>
                          {member.pharmacies.length ? (
                            <Stack direction="row" spacing={0.5} flexWrap="wrap">
                              {member.pharmacies.map((pharmacy) => (
                                <Chip
                                  key={pharmacy.id}
                                  label={pharmacy.name}
                                  size="small"
                                  sx={{ mb: 0.5 }}
                                />
                              ))}
                            </Stack>
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              None
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => handleOpenEditDialog(member)}>
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip
                            title={member.user?.id === currentUserId ? 'Cannot remove yourself' : 'Delete'}
                          >
                            <span>
                              <IconButton
                                size="small"
                                onClick={() => handleOpenDeleteDialog(member)}
                                disabled={member.user?.id === currentUserId}
                                color="error"
                              >
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            ) : (
              <Alert severity="info">No organization members yet.</Alert>
            )}
          </CardContent>
        </Card>
      </Stack>

      <Dialog open={editDialogOpen} onClose={handleCloseEditDialog} fullWidth maxWidth="sm">
        <DialogTitle>Edit Organization Member</DialogTitle>
        <DialogContent dividers sx={{ pt: 1 }}>
          {editForm && (
            <Stack spacing={2}>
              <FormControl fullWidth>
                <InputLabel id="edit-role-label">Organization Role</InputLabel>
                <Select
                  labelId="edit-role-label"
                  value={editForm.role}
                  label="Organization Role"
                  onChange={(event) => {
                    const nextRole = event.target.value;
                    handleEditFieldChange('role', nextRole);
                    const nextDefinition = roleDefinitionMap.get(nextRole) ?? null;
                    if (nextDefinition && !nextDefinition.allowed_admin_levels.includes(editForm.admin_level)) {
                      handleEditFieldChange('admin_level', nextDefinition.default_admin_level);
                    }
                    if (!nextDefinition || !nextDefinition.requires_job_title) {
                      handleEditFieldChange('job_title', '');
                    }
                    if (!nextDefinition || !nextDefinition.requires_region) {
                      handleEditFieldChange('region', '');
                    }
                    if (!nextDefinition || !nextDefinition.requires_pharmacies) {
                      handleEditFieldChange('pharmacy_ids', []);
                    }
                  }}
                >
                  {roleDefinitions.map((definition) => (
                    <MenuItem key={definition.key} value={definition.key}>
                      {definition.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {editRoleDefinition && (
                <Typography variant="body2" color="text.secondary">
                  {editRoleDefinition.description}
                </Typography>
              )}

              <FormControl fullWidth>
                <InputLabel id="edit-admin-level-label">Admin Level</InputLabel>
                <Select
                  labelId="edit-admin-level-label"
                  value={editForm.admin_level}
                  label="Admin Level"
                  onChange={(event) => handleEditFieldChange('admin_level', event.target.value)}
                >
                  {(editRoleDefinition?.allowed_admin_levels ?? []).map((levelKey) => {
                    const levelDef = adminLevelMap[levelKey];
                    return (
                      <MenuItem key={levelKey} value={levelKey}>
                        {levelDef?.label ?? levelKey.replace('_', ' ')}
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>

              {editAdminLevelDefinition && (
                <Typography variant="body2" color="text.secondary">
                  {editAdminLevelDefinition.description}
                </Typography>
              )}

              {editRoleDefinition?.requires_job_title && (
                <TextField
                  fullWidth
                  label="Job Title"
                  value={editForm.job_title}
                  onChange={(event) => handleEditFieldChange('job_title', event.target.value)}
                />
              )}

              {editRoleDefinition?.requires_region && (
                <TextField
                  fullWidth
                  label="Region"
                  value={editForm.region}
                  onChange={(event) => handleEditFieldChange('region', event.target.value)}
                />
              )}

              {editRoleDefinition?.requires_pharmacies && (
                <FormControl fullWidth>
                  <InputLabel id="edit-pharmacies-label">Pharmacies</InputLabel>
                  <Select
                    labelId="edit-pharmacies-label"
                    label="Pharmacies"
                    value={editForm.pharmacy_ids}
                    multiple
                    input={<OutlinedInput label="Pharmacies" />}
                    onChange={(event) => {
                      const value = event.target.value;
                      handleEditFieldChange(
                        'pharmacy_ids',
                        typeof value === 'string' ? value.split(',').map(Number) : (value as number[])
                      );
                    }}
                    renderValue={(selected) => {
                      const ids = selected as number[];
                      if (!ids.length) return 'Select pharmacies';
                      return ids
                        .map((id) => pharmacies.find((pharmacy) => pharmacy.id === id)?.name ?? `#${id}`)
                        .join(', ');
                    }}
                  >
                    {pharmacies.map((pharmacy) => (
                      <MenuItem key={pharmacy.id} value={pharmacy.id}>
                        <Checkbox checked={editForm.pharmacy_ids.includes(pharmacy.id)} />
                        <ListItemText primary={pharmacy.name} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {editCapabilities.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Capabilities
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    {editCapabilities.map((capability) => {
                      const label = CAPABILITY_LABELS[capability] ?? capability.replace('_', ' ');
                      return <Chip key={capability} label={label} size="small" />;
                    })}
                  </Stack>
                </Box>
              )}

              {editError && <FormHelperText error>{editError}</FormHelperText>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEditDialog} disabled={savingMember}>
            Cancel
          </Button>
          <Button onClick={handleSaveMember} variant="contained" disabled={savingMember}>
            {savingMember ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteDialogOpen} onClose={handleCloseDeleteDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Remove Organization Member</DialogTitle>
        <DialogContent dividers>
          <Typography>
            Are you sure you want to remove{' '}
            <strong>{targetMember?.user?.name || targetMember?.user?.email || 'this member'}</strong> from the
            organization?
          </Typography>
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog} disabled={deletingMember}>
            Cancel
          </Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained" disabled={deletingMember}>
            {deletingMember ? 'Removing...' : 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
