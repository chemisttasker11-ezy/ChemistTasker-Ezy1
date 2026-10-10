// src/pages/dashboard/sidebar/ChainPage.tsx

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Snackbar, IconButton,
  Typography, Accordion, AccordionSummary,
  AccordionDetails, List,
  ListItem, ListItemText, Autocomplete,
  Paper, Skeleton, Stack, Tooltip, CircularProgress,
} from '@mui/material';
import { Building2, ChevronDown, Pencil, Store, Trash2, X } from 'lucide-react';
import { API_BASE_URL } from '../../../constants/api';
import PageHeader from '../../../components/ui/PageHeader';
import IconTile from '../../../components/ui/IconTile';
import DashboardContentState from '../../../components/dashboard/DashboardContentState';
import { humanizeEnum } from './ActiveShiftsPage/utils/audience';
import {
  Chain,
  PharmacySummary,
  MembershipSummary,
  fetchChainsService,
  createChainService,
  updateChainService,
  deleteChainService,
  fetchChainPharmaciesService,
  fetchPharmaciesService,
  fetchMembershipsByPharmacy,
  addPharmacyToChain,
  removePharmacyFromChain,
} from '@chemisttasker/shared-core';

const sectionTitleSx = { fontFamily: 'var(--ct-font-display)', fontWeight: 500, lineHeight: 1.2, color: 'var(--ct-text-primary)' };
const squareActionSx = { width: 44, height: 44, border: '1px solid var(--ct-border-color)', borderRadius: '12px' };

const memberName = (m: MembershipSummary) =>
  `${m.userDetails?.firstName ?? ''} ${m.userDetails?.lastName ?? ''}`.trim() || m.invitedName || m.userDetails?.email || 'Member';

const memberDetail = (m: MembershipSummary) => {
  const email = m.userDetails?.email;
  return [m.role ? humanizeEnum(m.role) : null, email && email !== memberName(m) ? email : null].filter(Boolean).join(' · ');
};

export default function ChainPage() {
  // ── Chain ─────────────────────────
  const [chain, setChain] = useState<Chain | null>(null);
  const [chainName, setChainName] = useState('');
  const [chainEmail, setChainEmail] = useState('');
  const [chainLogo, setChainLogo] = useState<File | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [openChainDlg, setOpenChainDlg] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  // ── Pharmacies ────────────────────
  const [allPharmacies, setAllPharmacies] = useState<PharmacySummary[]>([]);
  const [chainPharmacies, setChainPharmacies] = useState<PharmacySummary[]>([]);
  const [openPharmDlg, setOpenPharmDlg] = useState(false);
  const [tempPharmacies, setTempPharmacies] = useState<PharmacySummary[]>([]);

  // ── Users & memberships ('error' = that pharmacy's staff failed to load) ──
  const [memberships, setMemberships] = useState<Record<number, MembershipSummary[] | 'error'>>({});

  // New loading state for the entire page's initial data fetch
  const [pageLoading, setPageLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // ── Snackbar ──────────────────────
  const [snack, setSnack] = useState<{ open: boolean; msg: string }>({ open: false, msg: '' });

  // ── Load initial data ──────────────
  useEffect(() => {
    let isMounted = true;
    setPageLoading(true);
    setLoadError(false);
    Promise.all([fetchChainsService(), fetchPharmaciesService({})])
      .then(([chains, pharmacies]) => {
        if (!isMounted) return;
        if (chains.length) {
          setChain(chains[0]);
        }
        setAllPharmacies(pharmacies);
      })
      .catch(err => {
        console.error(err);
        if (isMounted) setLoadError(true);
      })
      .finally(() => {
        if (isMounted) {
          setPageLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  // ── Whenever chain changes, load its pharmacies + members ─────────────
  const loadMembers = useCallback((phId: number) => {
    setMemberships(m => {
      const next = { ...m };
      delete next[phId];
      return next;
    });
    fetchMembershipsByPharmacy(phId)
      .then(res => {
        setMemberships(m => ({ ...m, [phId]: res }));
      })
      .catch(err => {
        console.error(err);
        setMemberships(m => ({ ...m, [phId]: 'error' }));
      });
  }, []);

  useEffect(() => {
    if (!chain) return;
    let isMounted = true;
    setPageLoading(true);
    fetchChainPharmaciesService(chain.id)
      .then(pharmacies => {
        if (!isMounted) return;
        setChainPharmacies(pharmacies);
        pharmacies.forEach((p: PharmacySummary) => loadMembers(p.id));
      })
      .catch(err => {
        console.error(err);
        if (isMounted) setLoadError(true);
      })
      .finally(() => {
        if (isMounted) {
          setPageLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [chain, loadMembers]);

  // ── Chain Dialog Handlers ────────────────────────────────────────────
  function openCreateChain() {
    setIsEditing(false);
    setChainName('');
    setChainEmail('');
    setChainLogo(null);
    setOpenChainDlg(true);
  }
  function openEditChain() {
    if (!chain) return;
    setIsEditing(true);
    setChainName(chain.name);
    setChainEmail(chain.primaryContactEmail ?? '');
    setChainLogo(null);
    setOpenChainDlg(true);
  }
  async function handleSaveChain() {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('name', chainName);
      fd.append('primary_contact_email', chainEmail);
      if (chainLogo) fd.append('logo', chainLogo);

      let savedChain: Chain;
      if (isEditing && chain) {
        savedChain = await updateChainService(chain.id, fd);
        setSnack({ open: true, msg: 'Chain updated' });
      } else {
        savedChain = await createChainService(fd);
        setSnack({ open: true, msg: 'Chain created' });
      }
      setChain(savedChain);
      setOpenChainDlg(false);
    } catch (e: any) {
      console.error(e);
      setSnack({ open: true, msg: e?.message || 'Failed to save chain.' });
    } finally {
      setBusy(false);
    }
  }
  async function handleDeleteChain() {
    if (!chain) return;
    setBusy(true);
    try {
      await deleteChainService(chain.id);
      setChain(null);
      setChainPharmacies([]);
      setConfirmDelete(false);
      setSnack({ open: true, msg: 'Chain deleted' });
    } catch (err: any) {
      console.error(err);
      setSnack({ open: true, msg: err?.message || 'Failed to delete chain.' });
    } finally {
      setBusy(false);
    }
  }

  // ── Manage Pharmacies ────────────────────────────────────────────────
  function openManagePharmacies() {
    setTempPharmacies(chainPharmacies);
    setOpenPharmDlg(true);
  }
  function closeManagePharmacies() {
    setOpenPharmDlg(false);
  }
  async function saveManagePharmacies() {
    if (!chain) return;
    const origIds = chainPharmacies.map(p => p.id);
    const selIds = tempPharmacies.map(p => p.id);
    const toAdd = tempPharmacies.filter(p => !origIds.includes(p.id));
    const toRem = chainPharmacies.filter(p => !selIds.includes(p.id));

    setBusy(true);
    try {
      await Promise.all(toAdd.map(p => addPharmacyToChain(chain.id, p.id)));
      await Promise.all(toRem.map(p => removePharmacyFromChain(chain.id, p.id)));
      setOpenPharmDlg(false);
      setSnack({ open: true, msg: 'Pharmacies updated' });
      setChain(c => (c ? { ...c } : c)); // trigger reload
    } catch (err: any) {
      console.error(err);
      setSnack({ open: true, msg: err?.message || 'Failed to update pharmacies.' });
    } finally {
      setBusy(false);
    }
  }

  const logoSrc = chain?.logo ? (chain.logo.startsWith('http') ? chain.logo : `${API_BASE_URL}${chain.logo}`) : null;
  const busyIcon = busy ? <CircularProgress size={16} color="inherit" /> : undefined;

  // ── RENDER ──────────────────────────────────────────────────────────
  return (
    <Box>
      <PageHeader
        title="My chain"
        subtitle="Group your pharmacies into one chain and see who works at each."
      />

      {pageLoading ? (
        <DashboardContentState kind="loading" title="Loading your chain…" />
      ) : loadError ? (
        <DashboardContentState
          kind="error"
          title="We couldn't load your chain"
          description="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => setReloadKey(k => k + 1)}
        />
      ) : !chain ? (
        <DashboardContentState
          kind="empty"
          icon={<Building2 size={26} />}
          title="You haven't set up a chain yet"
          description="A chain groups your pharmacies so you can see staff across all of them in one place."
          actionLabel="Create chain"
          onAction={openCreateChain}
        />
      ) : (
        <Stack spacing={3}>
          <Paper
            variant="outlined"
            sx={{ borderRadius: 'var(--ct-card-radius)', borderColor: 'var(--ct-border-color)', p: { xs: 2, md: 2.5 }, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}
          >
            {logoSrc ? (
              <Box component="img" src={logoSrc} alt="" sx={{ width: 48, height: 48, objectFit: 'contain', borderRadius: '12px', flexShrink: 0 }} />
            ) : (
              <IconTile icon={<Building2 size={22} />} size={48} />
            )}
            <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
              <Typography component="h2" sx={{ ...sectionTitleSx, fontSize: { xs: 22, md: 26 }, overflowWrap: 'anywhere' }}>
                {chain.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                {chain.primaryContactEmail || 'No contact email'}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Tooltip title="Edit chain">
                <IconButton aria-label="Edit chain" onClick={openEditChain} sx={squareActionSx}>
                  <Pencil size={18} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete chain">
                <IconButton aria-label="Delete chain" onClick={() => setConfirmDelete(true)} sx={{ ...squareActionSx, color: 'var(--ct-status-red-fg)' }}>
                  <Trash2 size={18} />
                </IconButton>
              </Tooltip>
              <Button variant="outlined" onClick={openManagePharmacies} sx={{ minHeight: 44 }}>
                Manage pharmacies
              </Button>
            </Stack>
          </Paper>

          <Box component="section" aria-labelledby="chain-staff-heading">
            <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={2} sx={{ mb: 1.5 }}>
              <Typography id="chain-staff-heading" component="h2" sx={{ ...sectionTitleSx, fontSize: 22 }}>
                Staff by pharmacy
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {chainPharmacies.length} {chainPharmacies.length === 1 ? 'pharmacy' : 'pharmacies'}
              </Typography>
            </Stack>
            {chainPharmacies.length === 0 ? (
              <DashboardContentState
                compact
                kind="empty"
                icon={<Store size={26} />}
                title="No pharmacies in this chain yet"
                description="Add pharmacies to see their staff here."
                actionLabel="Add pharmacies"
                onAction={openManagePharmacies}
              />
            ) : (
              chainPharmacies.map(ph => {
                const list = memberships[ph.id];
                const count = list === undefined ? 'Loading…' : list === 'error' ? 'Staff not loaded' : `${list.length} staff`;
                return (
                  <Accordion key={ph.id} disableGutters sx={{ mb: 1 }}>
                    <AccordionSummary expandIcon={<ChevronDown size={18} />} sx={{ px: 2, '& .MuiAccordionSummary-content': { minWidth: 0 } }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1.5} sx={{ flex: 1, minWidth: 0, pr: 1 }}>
                        <Typography sx={{ fontWeight: 600 }} noWrap>{ph.name}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>{count}</Typography>
                      </Stack>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0, px: 2 }}>
                      {list === undefined ? (
                        <Stack spacing={0.5} aria-busy="true">
                          <Skeleton variant="text" width="55%" height={24} />
                          <Skeleton variant="text" width="40%" height={24} />
                        </Stack>
                      ) : list === 'error' ? (
                        <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap" role="alert">
                          <Typography variant="body2" color="text.secondary">We couldn't load staff for this pharmacy.</Typography>
                          <Button size="small" onClick={() => loadMembers(ph.id)}>Try again</Button>
                        </Stack>
                      ) : list.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">No staff at this pharmacy yet.</Typography>
                      ) : (
                        <List dense disablePadding>
                          {list.map(m => (
                            <ListItem key={m.id} divider disableGutters>
                              <ListItemText
                                primary={memberName(m)}
                                secondary={memberDetail(m) || undefined}
                                primaryTypographyProps={{ fontWeight: 600, sx: { overflowWrap: 'anywhere' } }}
                                secondaryTypographyProps={{ sx: { overflowWrap: 'anywhere' } }}
                              />
                            </ListItem>
                          ))}
                        </List>
                      )}
                    </AccordionDetails>
                  </Accordion>
                );
              })
            )}
          </Box>
        </Stack>
      )}

      {/* Create/Edit Chain Dialog */}
      <Dialog open={openChainDlg} onClose={busy ? undefined : () => setOpenChainDlg(false)} fullWidth maxWidth="sm">
        <DialogTitle>{isEditing ? 'Edit chain' : 'Create chain'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth margin="normal" label="Chain name"
            value={chainName} onChange={e => setChainName(e.target.value)}
            required
          />
          <TextField
            fullWidth margin="normal" label="Contact email" type="email"
            value={chainEmail} onChange={e => setChainEmail(e.target.value)}
            required
          />
          {isEditing && logoSrc && !chainLogo && (
            <Box my={2}>
              <Typography variant="subtitle2">Current logo</Typography>
              <Box component="img" src={logoSrc} alt="Current chain logo" sx={{ width: 80, height: 80, objectFit: 'contain', mt: 1 }} />
            </Box>
          )}
          <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap" sx={{ my: 2 }}>
            <Button variant="outlined" component="label">
              {isEditing ? 'Replace logo' : 'Upload logo'}
              <input
                hidden
                type="file"
                accept="image/*"
                onChange={e => setChainLogo(e.target.files?.[0] ?? null)}
              />
            </Button>
            <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
              {chainLogo ? chainLogo.name : 'Optional'}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenChainDlg(false)} disabled={busy}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!chainName || !chainEmail || busy}
            startIcon={busyIcon}
            onClick={handleSaveChain}
          >
            {isEditing ? 'Save changes' : 'Create chain'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Manage Pharmacies Dialog */}
      <Dialog open={openPharmDlg} onClose={busy ? undefined : closeManagePharmacies} fullWidth maxWidth="sm">
        <DialogTitle>Manage pharmacies</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Choose which of your pharmacies belong to this chain.
          </Typography>
          <Autocomplete
            multiple
            options={allPharmacies}
            getOptionLabel={o => o.name}
            value={tempPharmacies}
            onChange={(_, v) => setTempPharmacies(v)}
            filterSelectedOptions
            noOptionsText="No other pharmacies to add"
            renderInput={params => <TextField {...params} label="Pharmacies" />}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeManagePharmacies} disabled={busy}>Cancel</Button>
          <Button variant="contained" onClick={saveManagePharmacies} disabled={busy} startIcon={busyIcon}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Chain confirmation */}
      <Dialog open={confirmDelete} onClose={busy ? undefined : () => setConfirmDelete(false)} fullWidth maxWidth="xs">
        <DialogTitle>Delete {chain?.name ?? 'chain'}?</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">This deletes the chain and can't be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)} disabled={busy}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteChain} disabled={busy} startIcon={busyIcon}>
            Delete chain
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack(s => ({ ...s, open: false }))}
        message={snack.msg}
        action={
          <IconButton size="small" aria-label="Close" onClick={() => setSnack(s => ({ ...s, open: false }))} color="inherit">
            <X size={16} />
          </IconButton>
        }
      />
    </Box>
  );
}
