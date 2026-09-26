import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  FormControlLabel,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { STAFF_ROLE_OPTIONS, attendance, canManageKioskDevices, fetchPharmaciesService } from '@chemisttasker/shared-core';
import { useAuth } from '../../contexts/AuthContext';
import type { WorkforcePayrollConfiguration, WorkforceWorkSettings } from '@chemisttasker/shared-core';
import EmploymentEngagementsPanel from './EmploymentEngagementsPanel';
import {
  createCoverageRequirement,
  deleteCoverageRequirement,
  getPayrollConfiguration,
  listCoverageRequirements,
  listWorkSettings,
  saveWorkSettings,
  updatePayrollConfiguration,
} from './api';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function WorkforceSettingsPage() {
  const { hasCapability, user } = useAuth();
  const initialPharmacy = Number(new URLSearchParams(window.location.search).get('pharmacy_id') || '') || null;
  const [pharmacies, setPharmacies] = useState<Array<{ id: number; name: string }>>([]);
  const [pharmacyId, setPharmacyId] = useState<number | null>(initialPharmacy);
  const [tab, setTab] = useState(0);
  const [coverage, setCoverage] = useState<any[]>([]);
  const [staff, setStaff] = useState<WorkforceWorkSettings[]>([]);
  const [payrollConfig, setPayrollConfig] = useState<WorkforcePayrollConfiguration | null>(null);
  const [kioskDevices, setKioskDevices] = useState<any[]>([]);
  const [revokeDevice, setRevokeDevice] = useState<any | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [kioskMessage, setKioskMessage] = useState('');
  const [payrollSaving, setPayrollSaving] = useState(false);
  const [error, setError] = useState('');
  const loadSequence = useRef(0);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [coverageForm, setCoverageForm] = useState({ weekday: 0, start_time: '08:00', end_time: '18:00', role: 'PHARMACIST', minimum_staff: 1 });

  const canManageRoster = pharmacyId
    ? hasCapability('MANAGE_ROSTER', pharmacyId)
    : hasCapability('MANAGE_ROSTER');
  const canManageStaff = canManageRoster || (
    pharmacyId
      ? hasCapability('MANAGE_STAFF', pharmacyId)
      : hasCapability('MANAGE_STAFF')
  );
  const canManageKiosk = pharmacyId != null && canManageKioskDevices(user, pharmacyId);

  useEffect(() => {
    fetchPharmaciesService({}).then((rows: any[]) => {
      const next = (rows || []).map((row: any) => ({ id: Number(row.id), name: row.name || `Pharmacy #${row.id}` }));
      setPharmacies(next);
      if (next.length) setPharmacyId((id) => id && next.some((row) => row.id === id) ? id : next[0].id);
    }).catch((err: any) => setError(err?.message || 'Unable to load pharmacies.'));
  }, []);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    if (!pharmacyId) {
      setKioskDevices([]);
      return;
    }
    setError('');
    try {
      const [coverageRows, staffRows, payroll, kiosks] = await Promise.all([
        canManageRoster ? listCoverageRequirements(pharmacyId) : Promise.resolve([]),
        canManageStaff ? listWorkSettings(pharmacyId) : Promise.resolve([]),
        canManageStaff ? getPayrollConfiguration(pharmacyId) : Promise.resolve(null),
        canManageKiosk ? attendance.getManagerKioskDevices(pharmacyId) : Promise.resolve({ devices: [] }),
      ]);
      if (sequence !== loadSequence.current) return;
      setCoverage(coverageRows);
      setStaff(staffRows);
      setPayrollConfig(payroll);
      setKioskDevices(Array.isArray((kiosks as any)?.devices) ? (kiosks as any).devices : []);
    } catch (err: any) {
      if (sequence === loadSequence.current) {
        setError(err?.response?.data?.error || err?.message || 'Unable to load workforce settings.');
      }
    }
  }, [canManageRoster, canManageStaff, canManageKiosk, pharmacyId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!canManageRoster && tab === 0) setTab(1);
    if (!canManageKiosk && tab === 3) setTab(canManageRoster ? 0 : 1);
  }, [canManageRoster, canManageKiosk, tab]);

  const saveHours = async (membershipId: number, raw: string) => {
    const hours = raw.trim() === '' ? null : Number(raw);
    if (hours != null && (!Number.isFinite(hours) || hours < 0 || hours > 168)) {
      setError('Contracted hours must be between 0 and 168 per week.');
      return;
    }
    try {
      await saveWorkSettings({ membership_id: membershipId, contracted_weekly_minutes: hours == null ? null : Math.round(hours * 60) });
      await load();
    } catch (err: any) { setError(err?.response?.data?.error || err?.message || 'Unable to save contracted hours.'); }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" fontWeight={900} color="#06214A">Workforce settings</Typography>
          <Typography color="text.secondary">Roster coverage, contracted hours, and dated employment/pay terms. Employment engagements preserve the Award correspondence and agreed rates used for payroll history.</Typography>
        </Box>
        <FormControl size="small" sx={{ maxWidth: 320 }}><InputLabel>Pharmacy</InputLabel><Select value={pharmacyId ?? ''} label="Pharmacy" onChange={(e) => setPharmacyId(Number(e.target.value))}>{pharmacies.map((row) => <MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>)}</Select></FormControl>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        {kioskMessage && <Alert severity="success" onClose={() => setKioskMessage('')}>{kioskMessage}</Alert>}

        {pharmacyId && payrollConfig && (
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Stack spacing={1.5}>
              <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} alignItems={{ md: 'center' }}>
                <Box>
                  <Typography fontWeight={900}>Use ChemistTasker Payroll</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Optional. Leave this off while you continue using your existing payroll system; ChemistTasker will still manage rosters, attendance and timesheets.
                  </Typography>
                </Box>
                <FormControlLabel
                  control={(
                    <Switch
                      checked={payrollConfig.use_chemisttasker_payroll}
                      disabled={payrollSaving}
                      onChange={async (_, checked) => {
                        setPayrollSaving(true);
                        setError('');
                        try {
                          const next = await updatePayrollConfiguration(pharmacyId, checked);
                          setPayrollConfig(next);
                        } catch (err: any) {
                          setError(err?.message || 'Unable to update payroll configuration.');
                        } finally {
                          setPayrollSaving(false);
                        }
                      }}
                    />
                  )}
                  label={payrollConfig.use_chemisttasker_payroll ? 'Enabled' : 'Disabled'}
                />
              </Stack>
              {payrollConfig.use_chemisttasker_payroll ? (
                <Alert severity="info">
                  <strong>Before ChemistTasker processes payroll:</strong> each TFN staff member needs dated employment terms with employment type, Award classification and Award/above-award rates; part-time staff also need agreed ordinary hours. The worker must complete TFN and super fund name, USI and member number in onboarding. ABN workers continue through invoicing.
                </Alert>
              ) : (
                <Alert severity="success">
                  Timesheet-only mode: Award classifications and ChemistTasker pay rates are not required. Approved hours remain available for export/hand-off to your existing payroll process. ABN shift workers continue through invoicing.
                </Alert>
              )}
            </Stack>
          </Paper>
        )}
        <Paper variant="outlined" sx={{ borderRadius: 3 }}>
          <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto"><Tab label="Coverage requirements" disabled={!canManageRoster} /><Tab label="Contracted hours" disabled={!canManageStaff} /><Tab label="Employment & pay" disabled={!canManageStaff} /><Tab label="Kiosk devices" disabled={!canManageKiosk} /></Tabs>
          <Box sx={{ p: 2 }}>
            {tab === 0 && <Stack spacing={1.5}>
              <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography fontWeight={900}>Coverage rules</Typography><Button variant="contained" disabled={!canManageRoster} onClick={() => setCoverageOpen(true)}>Add rule</Button></Stack>
              {!coverage.length && <Alert severity="info">No coverage rules are configured. This is not evidence that the roster has adequate staffing.</Alert>}
              {coverage.map((row) => <Paper key={row.id} variant="outlined" sx={{ p: 1.5 }}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}><Box flex={1}><Typography fontWeight={800}>{DAYS[row.weekday]} · {row.start_time}–{row.end_time}</Typography><Typography variant="body2">{row.role.replaceAll('_', ' ')} · minimum {row.minimum_staff}</Typography></Box><Button color="error" onClick={async () => { await deleteCoverageRequirement(row.id); await load(); }}>Delete</Button></Stack></Paper>)}
            </Stack>}
            {tab === 1 && <Stack spacing={1.5}>
              <Alert severity="info">Contracted hours are displayed for comparison in timesheets. Leave blank when unknown rather than inventing a value.</Alert>
              {staff.map((row) => <Paper key={row.membership_id} variant="outlined" sx={{ p: 1.5 }}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}><Box flex={1}><Typography fontWeight={800}>{row.worker_name}</Typography><Typography variant="body2" color="text.secondary">{row.role} · {row.employment_type}</Typography></Box><TextField size="small" label="Contracted h/week" defaultValue={row.contracted_weekly_minutes == null ? '' : (row.contracted_weekly_minutes / 60).toFixed(2)} onBlur={(e) => saveHours(row.membership_id, e.target.value)} sx={{ width: 190 }} /></Stack></Paper>)}
            </Stack>}
            {tab === 2 && pharmacyId && (
              payrollConfig?.use_chemisttasker_payroll ? (
                <EmploymentEngagementsPanel pharmacyId={pharmacyId} staff={staff} />
              ) : (
                <Alert severity="info">
                  ChemistTasker Payroll is currently disabled for this pharmacy, so employment pay rates and Award classifications are optional and are not required to roster staff. Enable payroll above when you are ready to move payroll calculations into ChemistTasker.
                </Alert>
              )
            )}
            {tab === 3 && pharmacyId && canManageKiosk && (
              <Stack spacing={1.5}>
                <Alert severity="info">
                  Revoking a kiosk blocks QR and new online authorization immediately. A native terminal may drain already-signed offline evidence, but revoked-device evidence cannot silently create attendance.
                </Alert>
                {!kioskDevices.length && <Alert severity="info">No kiosk terminals are registered for this pharmacy.</Alert>}
                {kioskDevices.map((device) => (
                  <Paper key={device.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                    <Stack spacing={1.5}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                        <Box flex={1}>
                          <Typography fontWeight={900} color="#06214A">{device.device_name || 'Kiosk terminal'}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {[
                              device.platform || 'Unknown platform',
                              String(device.client_kind || '').replaceAll('_', ' '),
                              device.app_version ? `v${device.app_version}` : null,
                            ].filter(Boolean).join(' · ')}
                          </Typography>
                        </Box>
                        <Typography variant="body2" fontWeight={900} color={device.is_active ? 'success.main' : 'text.secondary'}>
                          {device.is_active ? 'Active' : 'Revoked'}
                        </Typography>
                        {device.is_active && <Button color="error" variant="outlined" onClick={() => setRevokeDevice(device)}>Revoke</Button>}
                      </Stack>
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                        {[
                          ['Activated', device.activated_at ? new Date(device.activated_at).toLocaleString() : '—'],
                          ['Last seen', device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : 'Never'],
                          ['Last sync', device.last_sync_at ? new Date(device.last_sync_at).toLocaleString() : 'Never'],
                          ['Received sequence', String(device.last_contiguous_sequence || 0)],
                        ].map(([label, value]) => (
                          <Box key={label} sx={{ flex: 1, p: 1.25, borderRadius: 2, bgcolor: '#F5F8FC' }}>
                            <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
                            <Typography variant="body2" fontWeight={800} color="#06214A">{value}</Typography>
                          </Box>
                        ))}
                      </Stack>
                      {!device.is_active && device.revoked_at && (
                        <Alert severity="warning">
                          Revoked {new Date(device.revoked_at).toLocaleString()}. This terminal must be paired again before it can record new attendance.
                        </Alert>
                      )}
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
          </Box>
        </Paper>
      </Stack>
      <Dialog open={!!revokeDevice} onClose={() => !revokeBusy && setRevokeDevice(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Revoke kiosk terminal?</DialogTitle>
        <DialogContent dividers>
          <Typography>
            {revokeDevice?.device_name || 'This kiosk'} will lose QR and attendance authorization. Already-signed offline evidence can still be drained for review so it is not lost.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={revokeBusy} onClick={() => setRevokeDevice(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={revokeBusy || !revokeDevice}
            onClick={async () => {
              if (!revokeDevice) return;
              setRevokeBusy(true);
              setError('');
              try {
                await attendance.revokeManagerKioskDevice(Number(revokeDevice.id));
                setKioskMessage(`${revokeDevice.device_name || 'Kiosk terminal'} was revoked.`);
                setRevokeDevice(null);
                await load();
              } catch (err: any) {
                setError(err?.response?.data?.error || err?.message || 'Unable to revoke kiosk.');
              } finally {
                setRevokeBusy(false);
              }
            }}
          >
            {revokeBusy ? 'Revoking…' : 'Revoke kiosk'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={coverageOpen} onClose={() => setCoverageOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add coverage requirement</DialogTitle>
        <DialogContent dividers><Stack spacing={2} pt={0.5}>
          <FormControl><InputLabel>Day</InputLabel><Select value={coverageForm.weekday} label="Day" onChange={(e) => setCoverageForm((f) => ({ ...f, weekday: Number(e.target.value) }))}>{DAYS.map((day, index) => <MenuItem key={day} value={index}>{day}</MenuItem>)}</Select></FormControl>
          <Stack direction="row" spacing={1}><TextField type="time" label="Start" InputLabelProps={{ shrink: true }} value={coverageForm.start_time} onChange={(e) => setCoverageForm((f) => ({ ...f, start_time: e.target.value }))} fullWidth /><TextField type="time" label="End" InputLabelProps={{ shrink: true }} value={coverageForm.end_time} onChange={(e) => setCoverageForm((f) => ({ ...f, end_time: e.target.value }))} fullWidth /></Stack>
          <FormControl><InputLabel>Role</InputLabel><Select value={coverageForm.role} label="Role" onChange={(e) => setCoverageForm((f) => ({ ...f, role: String(e.target.value) }))}>{STAFF_ROLE_OPTIONS.map((row) => <MenuItem key={row.value} value={row.value}>{row.label}</MenuItem>)}</Select></FormControl>
          <TextField type="number" label="Minimum staff" value={coverageForm.minimum_staff} inputProps={{ min: 1 }} onChange={(e) => setCoverageForm((f) => ({ ...f, minimum_staff: Number(e.target.value) }))} />
        </Stack></DialogContent>
        <DialogActions><Button onClick={() => setCoverageOpen(false)}>Cancel</Button><Button variant="contained" disabled={!pharmacyId} onClick={async () => { if (!pharmacyId) return; await createCoverageRequirement({ pharmacy_id: pharmacyId, ...coverageForm }); setCoverageOpen(false); await load(); }}>Add rule</Button></DialogActions>
      </Dialog>
    </Container>
  );
}
