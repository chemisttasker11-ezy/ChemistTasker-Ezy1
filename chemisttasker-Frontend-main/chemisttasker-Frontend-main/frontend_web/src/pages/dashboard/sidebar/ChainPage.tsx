// src/pages/dashboard/sidebar/ChainPage.tsx

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Snackbar, IconButton,
  Typography, Accordion, AccordionSummary,
  AccordionDetails, List,
  ListItem, ListItemText, Autocomplete,
  Paper, Skeleton, Container
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  Add as AddIcon, Delete as DeleteIcon,
  Edit as EditIcon, ExpandMore as ExpandMoreIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../../../constants/api';
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

export default function ChainPage() {
  // ── Chain ─────────────────────────
  const [chain, setChain] = useState<Chain | null>(null);
  const [chainName, setChainName] = useState('');
  const [chainEmail, setChainEmail] = useState('');
  const [chainLogo, setChainLogo] = useState<File | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [openChainDlg, setOpenChainDlg] = useState(false);

  // ── Pharmacies ────────────────────
  const [allPharmacies, setAllPharmacies] = useState<PharmacySummary[]>([]);
  const [chainPharmacies, setChainPharmacies] = useState<PharmacySummary[]>([]);
  const [openPharmDlg, setOpenPharmDlg] = useState(false);
  const [tempPharmacies, setTempPharmacies] = useState<PharmacySummary[]>([]);

  // ── Users & memberships ───────────
  const [memberships, setMemberships] = useState<Record<number, MembershipSummary[]>>({});


  // New loading state for the entire page's initial data fetch
  const [pageLoading, setPageLoading] = useState(true);

  // ── Snackbar ──────────────────────
  const [snack, setSnack] = useState<{ open: boolean; msg: string }>({ open: false, msg: '' });

  // ── Load initial data ──────────────
  useEffect(() => {
    let isMounted = true;
    setPageLoading(true);
    Promise.all([fetchChainsService(), fetchPharmaciesService({})])
      .then(([chains, pharmacies]) => {
        if (!isMounted) return;
        if (chains.length) {
          setChain(chains[0]);
        }
        setAllPharmacies(pharmacies);
      })
      .catch(console.error)
      .finally(() => {
        if (isMounted) {
          setPageLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // ── Whenever chain changes, load its pharmacies + members ─────────────
  const loadMembers = useCallback((phId: number) => {
    fetchMembershipsByPharmacy(phId)
      .then(res => {
        setMemberships(m => ({ ...m, [phId]: res }));
      })
      .catch(console.error);
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
      .catch(console.error)
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
    }
  }
  async function handleDeleteChain() {
    if (!chain) return;
    try {
      await deleteChainService(chain.id);
      setChain(null);
      setChainPharmacies([]);
      setSnack({ open: true, msg: 'Chain deleted' });
    } catch (err: any) {
      console.error(err);
      setSnack({ open: true, msg: err?.message || 'Failed to delete chain.' });
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

    try {
      await Promise.all(toAdd.map(p => addPharmacyToChain(chain.id, p.id)));
      await Promise.all(toRem.map(p => removePharmacyFromChain(chain.id, p.id)));
      setOpenPharmDlg(false);
      setSnack({ open: true, msg: 'Pharmacies updated' });
      setChain(c => (c ? { ...c } : c)); // trigger reload
    } catch (err: any) {
      console.error(err);
      setSnack({ open: true, msg: err?.message || 'Failed to update pharmacies.' });
    }
  }

  // ── RENDER ──────────────────────────────────────────────────────────
  return (
    <Container sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        Manage Chains
      </Typography>
      {pageLoading ? (
        // Skeleton for the "Create New Chain" button
        <Box sx={{ mb: 3, mt: 5 }}>
          <Skeleton variant="rectangular" width={180} height={36} />
        </Box>
      ) : (
        // Only show button if no chain exists after loading
        !chain && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={openCreateChain}
            sx={{ mb: 3, mt: 5 }}
          >
            Create New Chain
          </Button>
        )
      )}

      {pageLoading ? (
        // Skeletons for main chain/pharmacy content
        <Box sx={{ py: 2 }}>
          {[...Array(3)].map((_, index) => (
            <Paper key={index} sx={{ p: 2, mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Skeleton variant="text" width="60%" height={30} />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Skeleton variant="circular" width={40} height={40} />
                  <Skeleton variant="circular" width={40} height={40} />
                </Box>
              </Box>
              <Skeleton variant="text" width="40%" height={20} sx={{ mt: 1 }} />
              <Skeleton variant="rectangular" width="100%" height={80} sx={{ mt: 2 }} />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                  <Skeleton variant="rectangular" width={100} height={36} />
              </Box>
            </Paper>
          ))}
        </Box>
      ) : !chain ? (
        // Message when no chain is set up (after loading)
        <>
          <Typography>You haven’t set up a chain yet.</Typography>
        </>
      ) : (
        // Display chain details and pharmacies when loaded
        <>
          {/* Header with Logo */}
          <Grid container alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Box display="flex" alignItems="center">
              {chain.logo && (
                <Box
                  component="img"
                  src={chain.logo.startsWith('http') ? chain.logo : `${API_BASE_URL}${chain.logo}`}
                  alt="Logo"
                  sx={{ width: 48, height: 48, objectFit: 'contain', mr: 2 }}
                />
              )}
              <Typography variant="h4">{chain.name}</Typography>
            </Box>
            <Box>
              <IconButton onClick={openEditChain}><EditIcon /></IconButton>
              <IconButton onClick={handleDeleteChain}><DeleteIcon /></IconButton>
              <Button onClick={openManagePharmacies} sx={{ ml: 1 }}>
                Manage Pharmacies
              </Button>
            </Box>
          </Grid>
          <Typography sx={{ mb: 4 }}>{chain.primaryContactEmail}</Typography>

          {/* Staff by Pharmacy */}
          <Typography variant="h5" sx={{ mb: 2 }}>Staff by Pharmacy</Typography>
          {chainPharmacies.length === 0 ? (
            <Typography color="textSecondary">No pharmacies assigned to this chain yet. Add pharmacies to manage staff.</Typography>
          ) : (
            chainPharmacies.map(ph => (
              <Accordion key={ph.id} sx={{ mb: 1 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>{ph.name}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <List dense>
                    {(memberships[ph.id] || []).map(m => (
                      <ListItem
                        key={m.id}
                        // secondaryAction removed (delete button)
                      >
                        <ListItemText
                          primary={
                            m.userDetails?.email ||
                            `${m.userDetails?.first_name ?? ''} ${m.userDetails?.last_name ?? ''}`.trim() ||
                            m.invitedName ||
                            'Member'
                          }
                          secondary={m.role ?? undefined}
                        />
                      </ListItem>
                    ))}
                  </List>
                </AccordionDetails>
                {/* Removed AccordionActions block entirely */}
              </Accordion>
            ))
          )}
        </>
      )}

      {/* Create/Edit Chain Dialog */}
      <Dialog open={openChainDlg} onClose={() => setOpenChainDlg(false)} fullWidth>
        <DialogTitle>{isEditing ? 'Edit Chain' : 'Create Chain'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth margin="normal" label="Name"
            value={chainName} onChange={e => setChainName(e.target.value)}
            required
          />
          <TextField
            fullWidth margin="normal" label="Contact Email"
            value={chainEmail} onChange={e => setChainEmail(e.target.value)}
            required
          />
          {isEditing && chain?.logo && (
            <Box my={2}>
              <Typography variant="subtitle2">Current Logo:</Typography>
              <Box
                component="img"
                src={chain.logo.startsWith('http') ? chain.logo : `${API_BASE_URL}${chain.logo}`}
                alt="Current Logo"
                sx={{ width: 80, height: 80, objectFit: 'contain', mt: 1 }}
              />
            </Box>
          )}
          <Button variant="outlined" component="label" sx={{ my: 2 }}>
            {isEditing ? 'Replace Logo' : 'Upload Logo'}
            <input
              hidden
              type="file"
              accept="image/*"
              onChange={e => setChainLogo(e.target.files?.[0] ?? null)}
            />
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenChainDlg(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!chainName || !chainEmail}
            onClick={handleSaveChain}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Manage Pharmacies Dialog */}
      <Dialog open={openPharmDlg} onClose={closeManagePharmacies} fullWidth>
        <DialogTitle>Manage Pharmacies</DialogTitle>
        <DialogContent>
          <Autocomplete
            multiple
            options={allPharmacies}
            getOptionLabel={o => o.name}
            value={tempPharmacies}
            onChange={(_, v) => setTempPharmacies(v)}
            filterSelectedOptions
            renderInput={params => (
              <TextField
                {...params}
                label="Select Pharmacies"
                // No changes here as per instruction
              />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeManagePharmacies}>Cancel</Button>
          <Button
            variant="contained"
            onClick={saveManagePharmacies}
            // No changes here as per instruction
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Removed Staff Dialog entirely */}


      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack(s => ({ ...s, open: false }))}
        message={snack.msg}
        action={
          <IconButton size="small" onClick={() => setSnack(s => ({ ...s, open: false }))} color="inherit">
            <CloseIcon fontSize="small" />
          </IconButton>
        }
      />
    </Container>
  );
}
