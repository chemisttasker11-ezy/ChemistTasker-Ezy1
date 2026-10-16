import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, LinearProgress, MenuItem,
  Paper, Stack, Tab, Tabs, TextField, Typography, useTheme,
} from '@mui/material';
import {
  BarChart3, BookOpen, CalendarCheck2, CalendarDays, GraduationCap,
  ListTodo, PlusCircle, ShieldCheck, Target, UsersRound,
} from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  type OperationCatalogEntry, type OperationPlan, type OperationTask,
  type OperationTemplate, type OperationsContext, createOperationTemplate,
  deleteOperationTemplate, getOperationsContext, listOperationPlans,
  listOperationTemplates, listOperationsCatalog,
} from '@chemisttasker/shared-core';
import OperationsPlanBuilder from './OperationsPlanBuilder';
import OperationTaskDialog from './OperationTaskDialog';

type TabKey = 'today' | 'plans' | 'library' | 'kpis' | 'training';
const TABS: Array<{ value: TabKey; label: string }> = [
  { value: 'today', label: 'Today & workload' },
  { value: 'plans', label: 'Plan builder' },
  { value: 'library', label: 'Task library' },
  { value: 'kpis', label: 'KPIs & compliance' },
  { value: 'training', label: 'Training' },
];
type PlanWithTask = { item: OperationTask; plan: OperationPlan };
const DATE_NOW = () => format(new Date(), 'yyyy-MM-dd');
const humanError = (e: unknown) => e instanceof Error ? e.message : 'Unable to load or save operations.';

function PillMetric({ value, label, color }: { value: string | number; label: string; color: string }) {
  return <Paper elevation={0} variant="outlined" sx={{ p: 2.5, borderRadius: 3, flex: '1 1 165px', minWidth: 0 }}>
    <Typography sx={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
    <Typography variant="body2" color="text.secondary" mt={0.5}>{label}</Typography>
  </Paper>;
}
function KpiGroup({ title, subtitle, items, accent }: {
  title: string; subtitle: string; items: PlanWithTask[]; accent: string;
}) {
  const withTargets = items.filter(({ item }) => item.target_value !== null);
  return <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, flex: 1 }}>
    <Typography variant="h6" fontWeight={750}>{title}</Typography>
    <Typography color="text.secondary" variant="body2" mb={2}>{subtitle}</Typography>
    {withTargets.length === 0 && <Typography color="text.secondary" variant="body2">No published targets for this classification yet.</Typography>}
    <Stack spacing={2}>
      {withTargets.map(({ item, plan }) => {
        const target = item.target_value ?? 0;
        const actual = item.progress.kpi_actual;
        return <Box key={item.id}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
            <Box><Typography variant="subtitle2" fontWeight={700}>{item.title}</Typography>
              <Typography color="text.secondary" variant="caption">{plan.name} · {item.date}</Typography></Box>
            <Typography fontWeight={750} sx={{ whiteSpace: 'nowrap' }}>{actual} / {target}</Typography>
          </Stack>
          <LinearProgress aria-label={item.title + ' progress'} variant="determinate"
            value={target ? Math.min(100, 100 * actual / target) : 100}
            sx={{ height: 8, borderRadius: 8, bgcolor: 'action.hover', '& .MuiLinearProgress-bar': { bgcolor: accent } }} />
          <Typography color="text.secondary" variant="caption">{item.target_unit}</Typography>
        </Box>;
      })}
    </Stack>
  </Paper>;
}

export default function PharmacyOperationsPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<TabKey>('today');
  const [context, setContext] = useState<OperationsContext | null>(null);
  const [pharmacyId, setPharmacyId] = useState<number | null>(null);
  const [plans, setPlans] = useState<OperationPlan[]>([]);
  const [templates, setTemplates] = useState<OperationTemplate[]>([]);
  const [catalog, setCatalog] = useState<OperationCatalogEntry[]>([]);
  const [filterDate, setFilterDate] = useState(DATE_NOW());
  const [activeTask, setActiveTask] = useState<number | null>(null);
  const [catalogCategory, setCatalogCategory] = useState('all');
  const [templateScope, setTemplateScope] = useState<'pharmacy' | 'organization'>('pharmacy');
  const [customTemplateName, setCustomTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let live = true;
    getOperationsContext().then(data => {
      if (!live) return;
      setContext(data);
      const query = Number(params.get('pharmacy_id'));
      setPharmacyId(data.pharmacies.find(p => p.id === query)?.id ?? data.pharmacies[0]?.id ?? null);
    }).catch(e => { if (live) setError(humanError(e)); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
    // Intentional initial selection: updates afterwards come from dropdown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = useCallback(async () => {
    if (pharmacyId === null) return;
    const [nextPlans, nextTemplates, nextCatalog] = await Promise.all([
      listOperationPlans(pharmacyId), listOperationTemplates(pharmacyId), listOperationsCatalog(),
    ]);
    setPlans(nextPlans as OperationPlan[]);
    setTemplates(nextTemplates as OperationTemplate[]);
    setCatalog(nextCatalog);
  }, [pharmacyId]);
  useEffect(() => {
    if (pharmacyId === null) return;
    let live = true;
    setBusy(true); setError('');
    Promise.all([listOperationPlans(pharmacyId), listOperationTemplates(pharmacyId), listOperationsCatalog()])
      .then(([p, t, c]) => {
        if (!live) return;
        setPlans(p as OperationPlan[]); setTemplates(t as OperationTemplate[]); setCatalog(c);
      })
      .catch(e => { if (live) setError(humanError(e)); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [pharmacyId]);

  const selectedPharmacy = context?.pharmacies.find(x => x.id === pharmacyId);
  const published = useMemo<PlanWithTask[]>(() => plans.filter(p => p.status === 'PUBLISHED')
    .flatMap(plan => plan.items.map(item => ({ item, plan }))), [plans]);
  const todayItems = published.filter(x => x.item.date === filterDate);
  const outstanding = published.filter(x => x.item.progress.status !== 'FINISHED');
  const clinical = published.filter(x => x.item.target_kind === 'clinical');
  const operations = published.filter(x => x.item.target_kind === 'operational');
  const safety = published.filter(x => x.item.target_kind === 'safety');
  const training = published.filter(x => x.plan.period === 'training' || x.item.training_url);
  const pendingApproval = published.filter(x => x.item.progress.status === 'AWAITING_VERIFICATION');

  async function saveCatalogTemplate(t: OperationCatalogEntry) {
    if (!pharmacyId) return;
    setSavingTemplate(true); setError(''); setNotice('');
    try {
      await createOperationTemplate({
        pharmacy: templateScope === 'pharmacy' ? pharmacyId : null,
        organization: templateScope === 'organization' ? selectedPharmacy?.organization_id ?? null : null,
        name: t.name, area: t.area, category: t.category, description: t.description,
        recurrence: t.recurrence, audience: t.audience, role_codes: t.role_codes,
        checklist: t.checklist, requires_verification: t.requires_verification,
        target_value: t.target_value, target_unit: t.target_unit, target_kind: t.target_kind,
        training_url: t.training_url, active: true,
      });
      await reload();
      setNotice(t.name + ' saved to your reusable templates.');
    } catch (e) { setError(humanError(e)); }
    finally { setSavingTemplate(false); }
  }

  const filteredCatalog = catalog.filter(item => (
    catalogCategory === 'all' || item.category === catalogCategory
  ));
  const allCategories = Array.from(new Set(catalog.map(t => t.category)));

  return <Box sx={{ p: { xs: 2, md: 3 }, minHeight: '100%', bgcolor: 'background.default' }}>
    <Paper elevation={0} sx={{
      borderRadius: 4, p: { xs: 2.5, md: 4 }, color: 'common.white',
      background: 'linear-gradient(115deg, #111f41 0%, #233f87 61%, #3b4fc4 100%)',
      mb: 3, overflow: 'hidden', position: 'relative',
    }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={3}>
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" mb={1}><CalendarCheck2 size={20} color="#93c5fd" aria-hidden="true"/>
            <Typography variant="overline" sx={{ color: '#c7dcff', letterSpacing: 2 }}>CHEMISTTASKER · PHARMACY OPERATIONS</Typography></Stack>
          <Typography component="h1" variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.035em' }}>Your pharmacy, organised.</Typography>
          <Typography sx={{ color: '#e4ecff', maxWidth: 650, mt: 1 }}>
            Plan duties and team targets. Publish work only once, directly to the authoritative calendar.
            Measure real completion, not duplicated task lists.
          </Typography>
        </Box>
        <Stack spacing={1} sx={{ minWidth: { md: 220 }, position: 'relative', zIndex: 1 }}>
          <Typography variant="caption" sx={{ color: '#e5eaff' }}>MANAGED PHARMACY</Typography>
          <TextField select size="small" value={pharmacyId ?? ''} aria-label="Managed pharmacy"
            disabled={!context?.pharmacies.length}
            onChange={e => {
              const id = Number(e.target.value); setPharmacyId(id);
              const next = new URLSearchParams(params); next.set('pharmacy_id', String(id)); setParams(next);
              setNotice(''); setError('');
            }}
            sx={{ bgcolor: 'white', borderRadius: 2, '& .MuiInputBase-root': { color: '#18294c' } }}>
            {context?.pharmacies.map(p => <MenuItem value={p.id} key={p.id}>{p.name}</MenuItem>)}
          </TextField>
          <Button variant="outlined" size="small" sx={{ borderColor: '#b5caf9', color: 'white', '&:hover': { borderColor: '#fff' } }}
            onClick={() => {
              const path = window.location.pathname.replace(/\/operations$/, '/calendar');
              navigate(path + '?pharmacy_id=' + pharmacyId);
            }}
            startIcon={<CalendarDays size={16}/>}>Open authoritative calendar</Button>
        </Stack>
      </Stack>
      <Box aria-hidden="true" sx={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%',
        bgcolor: '#647dfb', opacity: 0.18, top: -110, right: 100 }} />
    </Paper>
    {error && <Alert severity="error" sx={{ mb: 2 }} role="alert">{error}</Alert>}
    {notice && <Alert severity="success" sx={{ mb: 2 }} role="status">{notice}</Alert>}
    {busy && <Stack direction="row" gap={2} alignItems="center" mb={2}><CircularProgress size={20}/><Typography>Loading pharmacy operations…</Typography></Stack>}
    {!busy && context && context.pharmacies.length === 0 && <Alert severity="info">
      This workspace is available only to authorised pharmacy owners and operations administrators.
      Staff continue to access assigned work in their calendar.
    </Alert>}
    {pharmacyId !== null && <Stack spacing={3}>
      <Stack direction="row" gap={1.5} flexWrap="wrap">
        <PillMetric value={plans.filter(p => p.status === 'PUBLISHED').length} label="Published operating plans" color={theme.palette.primary.main} />
        <PillMetric value={outstanding.length} label="Outstanding published tasks" color={theme.palette.warning.main} />
        <PillMetric value={pendingApproval.length} label="Awaiting supervisor sign-off" color={theme.palette.secondary.main} />
        <PillMetric value={templates.length} label="Saved reusable templates" color={theme.palette.success.main} />
      </Stack>
      <Paper variant="outlined" sx={{ borderRadius: 3, px: 1 }}>
        <Tabs value={tab} onChange={(_, value: TabKey) => setTab(value)} variant="scrollable" scrollButtons="auto"
          aria-label="Pharmacy operations sections">
          {TABS.map(x => <Tab key={x.value} value={x.value} label={x.label} sx={{ textTransform: 'none', minHeight: 56, fontWeight: 700 }} />)}
        </Tabs>
      </Paper>
      {tab === 'today' && <Stack spacing={3}>
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems={{ sm: 'center' }} justifyContent="space-between">
            <Box><Typography variant="h6" fontWeight={750}>Today's area duties</Typography>
              <Typography color="text.secondary" variant="body2">Published tasks by work area and scheduled date.</Typography></Box>
            <TextField label="View date" type="date" size="small" value={filterDate} InputLabelProps={{ shrink: true }}
              onChange={e => setFilterDate(e.target.value)} />
          </Stack>
          <Stack direction="row" gap={1} flexWrap="wrap" my={2}>
            <Chip icon={<UsersRound size={16}/>} label={todayItems.length + ' published tasks'} />
            <Chip color="success" icon={<CalendarCheck2 size={16}/>}
              label={todayItems.filter(x => x.item.progress.status === 'FINISHED').length + ' finished'} />
            <Chip color="warning" label={todayItems.filter(x => x.item.progress.status === 'AWAITING_VERIFICATION').length + ' pending sign-off'} />
          </Stack>
          {todayItems.length === 0 && <Alert severity="info">No published operational work on this date. Use Plan builder to prepare a plan, then publish it to the calendar.</Alert>}
          <Stack spacing={2}>
            {Array.from(new Set(todayItems.map(x => x.item.area))).sort().map(area => <Box key={area}>
              <Typography variant="subtitle1" fontWeight={750} mb={1}>{area.replaceAll('_', ' ')}</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: 1.5 }}>
                {todayItems.filter(x => x.item.area === area).map(({ item }) => <Paper key={item.id} variant="outlined"
                  sx={{ p: 2, borderRadius: 2.5, borderLeft: '4px solid', borderLeftColor: item.progress.status === 'FINISHED' ? 'success.main' : 'primary.main' }}>
                  <Typography fontWeight={700}>{item.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{item.progress.completed} / {item.progress.assigned} submitted · {item.start_time?.slice(0, 5) ?? 'anytime'}</Typography>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" mt={1.5} gap={1}>
                    <Chip size="small" label={item.progress.status.toLowerCase().replaceAll('_', ' ')} />
                    <Button size="small" onClick={() => setActiveTask(item.id)}>Details</Button>
                  </Stack>
                </Paper>)}
              </Box>
            </Box>)}
          </Stack>
        </Paper>
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
          <Typography fontWeight={750} variant="h6" mb={1}>Handover and exceptions</Typography>
          <Typography variant="body2" color="text.secondary">
            Late tasks, missing roster matches and outstanding verification are visible in plan previews and live task states.
            Any cold-chain excursion or dispensing incident must follow the pharmacy's clinical escalation SOP rather than being closed with a routine tick.
          </Typography>
        </Paper>
      </Stack>}
      {tab === 'plans' && <OperationsPlanBuilder pharmacyId={pharmacyId} plans={plans}
        templates={templates} catalog={catalog} onReload={reload} onOpenTask={setActiveTask}
        onShowTemplates={() => setTab('library')} />}
      {tab === 'library' && <Stack spacing={3}>
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} justifyContent="space-between" alignItems={{ sm: 'center' }}>
            <Box><Typography fontWeight={750} variant="h6">Reusable pharmacy standards</Typography>
              <Typography variant="body2" color="text.secondary">Curated editable starting points. Review each template against current local SOPs before use.</Typography></Box>
            <TextField select size="small" label="Template scope" value={templateScope} onChange={e => setTemplateScope(e.target.value as typeof templateScope)} sx={{ minWidth: 210 }}>
              <MenuItem value="pharmacy">This pharmacy</MenuItem>
              <MenuItem value="organization" disabled={!selectedPharmacy?.organization_id}>Organisation standard</MenuItem>
            </TextField>
          </Stack>
          <Stack direction="row" gap={1} flexWrap="wrap" my={2}>
            <Chip label="All categories" onClick={() => setCatalogCategory('all')} color={catalogCategory === 'all' ? 'primary' : 'default'} />
            {allCategories.map(x => <Chip key={x} label={x.replaceAll('_', ' ')}
              onClick={() => setCatalogCategory(x)} color={catalogCategory === x ? 'primary' : 'default'} />)}
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 2 }}>
            {filteredCatalog.map(t => <Paper key={t.catalog_id} variant="outlined" sx={{ borderRadius: 3, p: 2.5 }}>
              <Stack direction="row" alignItems="center" gap={1} mb={1}>
                <BookOpen size={17} color={theme.palette.primary.main}/>
                <Typography variant="subtitle1" fontWeight={750}>{t.name}</Typography></Stack>
              <Typography variant="caption" color="text.secondary">{t.area.replaceAll('_', ' ')} · {t.recurrence?.freq ?? 'ONCE'}</Typography>
              <Typography variant="body2" color="text.secondary" mt={1}>{t.checklist.length} steps · {t.role_codes.join(', ') || 'All eligible roles'}{t.requires_verification ? ' · Sign-off' : ''}</Typography>
              <Button size="small" variant="outlined" fullWidth sx={{ mt: 2 }} disabled={savingTemplate}
                onClick={() => void saveCatalogTemplate(t)} startIcon={<PlusCircle size={16}/>}>Save to library</Button>
            </Paper>)}
          </Box>
        </Paper>
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
          <Typography variant="h6" fontWeight={750}>Your saved templates</Typography>
          <Stack spacing={1} mt={2}>
            {templates.map(t => <Stack key={t.id} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between"
              alignItems={{ sm: 'center' }} gap={1} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
              <Box><Typography fontWeight={650}>{t.name}</Typography><Typography variant="caption" color="text.secondary">
                {t.organization ? 'Organisation template' : 'Pharmacy template'} · {t.recurrence?.freq ?? 'ONCE'}</Typography></Box>
              <Button size="small" color="error" startIcon={<ListTodo size={15}/>}
                onClick={() => void (async () => {
                  if (!window.confirm('Delete this template? Existing scheduled tasks remain unchanged.')) return;
                  setError(''); try { await deleteOperationTemplate(t.id); await reload(); setNotice('Template removed.'); }
                  catch (e) { setError(humanError(e)); }
                })()}>Remove</Button>
            </Stack>)}
            {templates.length === 0 && <Typography variant="body2" color="text.secondary">No saved templates yet. Choose a starting point above.</Typography>}
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} mt={2}>
            <TextField label="New custom template name" size="small" value={customTemplateName} fullWidth
              onChange={e => setCustomTemplateName(e.target.value)} />
            <Button variant="contained" disabled={!customTemplateName.trim() || savingTemplate} onClick={() => void (async () => {
              if (!pharmacyId) return;
              setSavingTemplate(true); setError('');
              try {
                await createOperationTemplate({
                  pharmacy: templateScope === 'pharmacy' ? pharmacyId : null,
                  organization: templateScope === 'organization' ? selectedPharmacy?.organization_id ?? null : null,
                  name: customTemplateName, category: 'other', area: 'general',
                  recurrence: { freq: 'ONCE' }, checklist: [], audience: 'ROLE_ON_DUTY',
                  role_codes: [], target_kind: 'operational', active: true,
                });
                setCustomTemplateName(''); await reload(); setNotice('Custom template saved.');
              } catch (e) { setError(humanError(e)); }
              finally { setSavingTemplate(false); }
            })()}>Add template</Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" mt={1} display="block">
            Custom details and steps can be refined in a draft plan. Updating organisation standards requires organisation-wide permissions.
          </Typography>
        </Paper>
      </Stack>}
      {tab === 'kpis' && <Stack spacing={2}>
        <Alert severity="info">KPIs record actual staff-reported progress. They do not create PBS or PPA claims or establish clinical eligibility. Safety checks are never scored as sales goals.</Alert>
        <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
          <KpiGroup title="Operational KPIs" subtitle="Team activity and workflow outcomes" items={operations} accent={theme.palette.info.main} />
          <KpiGroup title="Clinical service KPIs" subtitle="Appropriate service activity, not funding claims" items={clinical} accent={theme.palette.secondary.main} />
        </Stack>
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
          <Stack direction="row" spacing={1} alignItems="center"><ShieldCheck size={19} color={theme.palette.warning.main} /><Typography variant="h6" fontWeight={750}>Safety and compliance</Typography></Stack>
          <Typography variant="body2" color="text.secondary" mt={1}>Safety tasks are independently tracked, not hidden in a revenue score.</Typography>
          <Stack direction="row" gap={1.5} mt={2} flexWrap="wrap">
            <PillMetric value={safety.length} label="Published safety tasks" color={theme.palette.info.main}/>
            <PillMetric value={safety.filter(x => x.item.progress.status === 'FINISHED').length} label="Completed safety tasks" color={theme.palette.success.main}/>
            <PillMetric value={safety.filter(x => x.item.progress.status !== 'FINISHED').length} label="Outstanding safety tasks" color={theme.palette.warning.main}/>
          </Stack>
        </Paper>
      </Stack>}
      {tab === 'training' && <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" mb={1}><GraduationCap size={24} color={theme.palette.primary.main} /><Typography variant="h6" fontWeight={750}>Training assignments</Typography></Stack>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Publish training plans to designated employees, record completed learning steps, and request supervisor verification.
          Credential verification remains a separate professional authorisation control.
        </Typography>
        <Stack spacing={2}>
          {training.map(({ item, plan }) => <Paper key={item.id} variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1}>
              <Box><Typography fontWeight={700}>{item.title}</Typography>
                <Typography variant="body2" color="text.secondary">{plan.name} · Due {item.date} · {item.progress.completed}/{item.progress.assigned} submitted</Typography></Box>
              <Stack direction="row" alignItems="center" gap={1}>
                <Chip size="small" label={item.progress.status.toLowerCase().replaceAll('_', ' ')} />
                <Button variant="outlined" size="small" onClick={() => setActiveTask(item.id)}>Details</Button>
              </Stack>
            </Stack>
          </Paper>)}
          {training.length === 0 && <Alert severity="info">No published training assignments. Create a training plan or use the training task templates.</Alert>}
        </Stack>
      </Paper>}
    </Stack>}
    <OperationTaskDialog taskId={activeTask} onClose={() => setActiveTask(null)}
      onUpdated={() => { void reload().catch(e => setError(humanError(e))); }} />
    <Typography variant="caption" color="text.secondary" display="block" mt={3}>
      Pharmacy Operations Planner · Calendar is authoritative for published work. No clinical patient data should be entered in operational notes.
    </Typography>
  </Box>;
}
