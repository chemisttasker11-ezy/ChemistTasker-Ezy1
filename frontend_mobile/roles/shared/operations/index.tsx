import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import {
  ActivityIndicator, Button, Card, Chip, Divider, HelperText,
  Menu, ProgressBar, Text, TextInput,
} from 'react-native-paper';
import {
  type OperationCatalogEntry, type OperationPlan, type OperationTemplate,
  type OperationsContext, type OperationPreflight,
  getOperationsContext, listOperationPlans, listOperationsCatalog,
  listOperationTemplates, createOperationTemplate, createOperationPlan,
  applyOperationTemplate, previewOperationPlan, publishOperationPlan,
} from '@chemisttasker/shared-core';
import OperationTaskDialog from '@/roles/shared/calendar/OperationTaskDialog';

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : 'Operation failed. Please try again.';
}
function nowDate() {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
export default function PharmacyOperationsNative() {
  const router = useRouter();
  const segments = useSegments();
  const [context, setContext] = useState<OperationsContext | null>(null);
  const [pharmacyId, setPharmacyId] = useState<number | null>(null);
  const [pharmacyMenu, setPharmacyMenu] = useState(false);
  const [plans, setPlans] = useState<OperationPlan[]>([]);
  const [templates, setTemplates] = useState<OperationTemplate[]>([]);
  const [catalog, setCatalog] = useState<OperationCatalogEntry[]>([]);
  const [planId, setPlanId] = useState<number | null>(null);
  const [planMenu, setPlanMenu] = useState(false);
  const [templateMenu, setTemplateMenu] = useState(false);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [selectedTask, setSelectedTask] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [planName, setPlanName] = useState('Pharmacy operations');
  const [planType, setPlanType] = useState<'daily' | 'weekly' | 'monthly' | 'training'>('daily');
  const [startsOn, setStartsOn] = useState(nowDate());
  const [endsOn, setEndsOn] = useState(nowDate());
  const [review, setReview] = useState<OperationPreflight | null>(null);
  const [reviewRevision, setReviewRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    getOperationsContext().then(data => {
      if (!live) return;
      setContext(data);
      setPharmacyId(data.pharmacies[0]?.id ?? null);
    }).catch(e => { if (live) setError(errorMessage(e)); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, []);

  async function reload(pId: number) {
    const [p, t, c] = await Promise.all([
      listOperationPlans(pId), listOperationTemplates(pId), listOperationsCatalog(),
    ]);
    setPlans(p as OperationPlan[]);
    setTemplates(t as OperationTemplate[]);
    setCatalog(c);
    setPlanId(current => current && p.some(x => x.id === current) ? current : p[0]?.id ?? null);
  }
  useEffect(() => {
    if (pharmacyId === null) return;
    let live = true;
    setBusy(true); setError('');
    Promise.all([
      listOperationPlans(pharmacyId), listOperationTemplates(pharmacyId), listOperationsCatalog(),
    ]).then(([p, t, c]) => {
      if (!live) return;
      setPlans(p as OperationPlan[]); setTemplates(t as OperationTemplate[]); setCatalog(c);
      setPlanId(p[0]?.id ?? null);
      setTemplateId(null);
    }).catch(e => { if (live) setError(errorMessage(e)); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [pharmacyId]);

  const selectedPharmacy = context?.pharmacies.find(p => p.id === pharmacyId);
  const plan = plans.find(p => p.id === planId);
  const published = plans.filter(p => p.status === 'PUBLISHED');
  const items = published.flatMap(p => p.items);
  const outstanding = items.filter(i => i.progress.status !== 'FINISHED');
  const pending = items.filter(i => i.progress.status === 'AWAITING_VERIFICATION');

  async function act(action: () => Promise<unknown>, notice: string) {
    if (pharmacyId === null || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await action();
      await reload(pharmacyId);
      setReview(null); setReviewRevision(null);
      setMessage(notice);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function createPlan() {
    if (!pharmacyId) return;
    await act(async () => {
      const result = await createOperationPlan({
        pharmacy: pharmacyId, name: planName.trim(), period: planType,
        starts_on: startsOn, ends_on: endsOn,
      });
      setPlanId(result.id);
      setShowNew(false);
    }, 'Draft created. Add scheduled work before publishing.');
  }
  return <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="handled">
    <Card style={styles.hero}>
      <Card.Content style={styles.gap}>
        <Text variant="labelLarge" style={styles.eyebrow}>CHEMISTTASKER · OPERATIONS</Text>
        <Text variant="headlineSmall" style={styles.heading}>Pharmacy Planner</Text>
        <Text style={styles.light}>Prepare work, match real staff and publish into the existing calendar.</Text>
      </Card.Content>
    </Card>
    {error ? <HelperText type="error" visible>{error}</HelperText> : null}
    {message ? <Text style={styles.good}>{message}</Text> : null}
    {busy && <ActivityIndicator accessibilityLabel="Loading pharmacy operations" />}
    {!context?.pharmacies.length && !busy ? <Text>No managed pharmacy available in this account.</Text> : null}
    {selectedPharmacy && <>
      <Menu visible={pharmacyMenu} onDismiss={() => setPharmacyMenu(false)}
        anchor={<Button mode="outlined" icon="store" onPress={() => setPharmacyMenu(true)}>{selectedPharmacy.name}</Button>}>
        {context?.pharmacies.map(p => <Menu.Item key={p.id} title={p.name} onPress={() => {
          setPharmacyId(p.id); setPlanId(null); setReview(null); setPharmacyMenu(false);
        }}/>)}
      </Menu>
      <View style={styles.metrics}>
        <Card style={styles.metric}><Card.Content><Text variant="headlineMedium">{published.length}</Text>
          <Text>Published plans</Text></Card.Content></Card>
        <Card style={styles.metric}><Card.Content><Text variant="headlineMedium">{outstanding.length}</Text>
          <Text>Outstanding tasks</Text></Card.Content></Card>
        <Card style={styles.metric}><Card.Content><Text variant="headlineMedium">{pending.length}</Text>
          <Text>Need sign-off</Text></Card.Content></Card>
      </View>
      <Card>
        <Card.Content style={styles.gap}>
          <Text variant="titleLarge">Calendar</Text>
          <Text variant="bodyMedium">Published work is visible in the same staff calendar on web and mobile.</Text>
          <Button mode="contained-tonal" icon="calendar"
            onPress={() => router.push(('/' + (String(segments[0] || 'owner')) + '/calendar') as any)}>
            Open calendar
          </Button>
        </Card.Content>
      </Card>
      <Card>
        <Card.Content style={styles.gap}>
          <View style={styles.row}>
            <Text variant="titleLarge" style={styles.flex}>Plans</Text>
            <Button mode="contained" icon="plus" onPress={() => setShowNew(x => !x)}>New plan</Button>
          </View>
          {showNew && <>
            <TextInput label="Name" mode="outlined" value={planName} onChangeText={setPlanName}/>
            <View style={styles.row}>
              {(['daily', 'weekly', 'monthly', 'training'] as const).map(type => <Chip key={type}
                selected={planType === type} onPress={() => setPlanType(type)}>{type}</Chip>)}
            </View>
            <TextInput label="Starts (YYYY-MM-DD)" mode="outlined" value={startsOn} onChangeText={setStartsOn}/>
            <TextInput label="Ends (YYYY-MM-DD)" mode="outlined" value={endsOn} onChangeText={setEndsOn}/>
            <Button mode="contained" disabled={busy || !planName.trim()}
              onPress={() => void createPlan()}>Create draft</Button>
          </>}
          <Menu visible={planMenu} onDismiss={() => setPlanMenu(false)}
            anchor={<Button mode="outlined" onPress={() => setPlanMenu(true)}>
              {plan?.name ?? 'Select a plan'}
            </Button>}>
            {plans.map(p => <Menu.Item key={p.id} title={p.name + ' · ' + p.status}
              onPress={() => { setPlanId(p.id); setPlanMenu(false); setReview(null); }}/>)}
          </Menu>
          {plan && <>
            <View style={styles.row}>
              <Chip>{plan.status}</Chip>
              <Chip>Revision {plan.revision}</Chip>
              <Text variant="labelSmall">{plan.starts_on} – {plan.ends_on}</Text>
            </View>
            {plan.status === 'DRAFT' && <>
              <Text variant="titleMedium">Schedule a reusable template</Text>
              <Menu visible={templateMenu} onDismiss={() => setTemplateMenu(false)}
                anchor={<Button mode="outlined" onPress={() => setTemplateMenu(true)}>
                  {templates.find(t => t.id === templateId)?.name ?? 'Choose saved template'}
                </Button>}>
                {templates.map(t => <Menu.Item key={t.id} title={t.name}
                  onPress={() => { setTemplateId(t.id); setTemplateMenu(false); }}/>)}
              </Menu>
              <Button mode="contained-tonal" disabled={busy || templateId === null}
                onPress={() => void act(() => applyOperationTemplate(plan.id, templateId!), 'Template scheduled.')}>
                Add work for selected dates
              </Button>
              {templates.length === 0 ? <Text variant="bodySmall">Save a pharmacy template below to begin.</Text> : null}
              <Button mode="outlined" icon="account-check" disabled={busy || !plan.items.length}
                onPress={() => void (async () => {
                  setBusy(true); setError('');
                  try {
                    const p = await previewOperationPlan(plan.id);
                    setReview(p); setReviewRevision(plan.revision);
                  } catch (e) { setError(errorMessage(e)); }
                  finally { setBusy(false); }
                })()}>Preview staff matching</Button>
              {review && <>
                {review.ready ? <Text style={styles.good}>Ready to publish · {review.assignments.length} tasks checked</Text>
                  : review.blockers.map(b => <Text key={b.task_id} style={styles.error}>{b.date}: {b.message}</Text>)}
                <Button mode="contained" icon="publish" disabled={busy || !review.ready || reviewRevision !== plan.revision}
                  onPress={() => void act(() => publishOperationPlan(plan.id, plan.revision),
                    'Plan published to the shared calendar.')}>Publish to calendar</Button>
              </>}
            </>}
            <Divider/>
            <Text variant="titleMedium">{plan.items.length} scheduled task(s)</Text>
            {plan.items.map(task => <View key={task.id} style={styles.task}>
              <View style={styles.flex}>
                <Text variant="titleSmall">{task.title}</Text>
                <Text variant="bodySmall">{task.date} · {task.area} · {task.progress.status.replaceAll('_', ' ')}</Text>
                {task.target_value !== null ? <>
                  <Text variant="bodySmall">Team target {task.progress.kpi_actual}/{task.target_value} {task.target_unit}</Text>
                  <ProgressBar progress={task.target_value ? Math.min(1, task.progress.kpi_actual / task.target_value) : 1}/>
                </> : null}
              </View>
              {task.calendar_note_id ? <Button compact mode="outlined" onPress={() => setSelectedTask(task.id)}>Open</Button> : null}
            </View>)}
          </>}
        </Card.Content>
      </Card>
      <Card>
        <Card.Content style={styles.gap}>
          <Text variant="titleLarge">Template library</Text>
          <Text variant="bodySmall">Choose proven pharmacy activities. Review local SOPs and update staff training requirements before publishing.</Text>
          <Text variant="labelMedium">{templates.length} saved · {catalog.length} starter templates</Text>
          {catalog.slice(0, 28).map(t => <View key={t.catalog_id} style={styles.task}>
            <View style={styles.flex}><Text variant="titleSmall">{t.name}</Text>
              <Text variant="bodySmall">{t.area} · {t.checklist.length} steps · {t.recurrence.freq}</Text>
            </View>
            <Button compact mode="outlined" disabled={busy} onPress={() => void act(
              () => createOperationTemplate({
                pharmacy: pharmacyId, name: t.name, category: t.category,
                area: t.area, description: t.description, recurrence: t.recurrence,
                audience: t.audience, role_codes: t.role_codes, checklist: t.checklist,
                requires_verification: t.requires_verification, target_value: t.target_value,
                target_unit: t.target_unit, target_kind: t.target_kind, training_url: t.training_url,
                active: true,
              }), 'Template saved.',
            )}>Save</Button>
          </View>)}
          <Text variant="bodySmall">Use the web planner for advanced manual task editing, team target allocation and drag-to-plan operations.</Text>
        </Card.Content>
      </Card>
    </>}
    <OperationTaskDialog taskId={selectedTask} onDismiss={() => setSelectedTask(null)}
      onUpdated={() => { if (pharmacyId) void reload(pharmacyId).catch(e => setError(errorMessage(e))); }}/>
  </ScrollView>;
}
const styles = StyleSheet.create({
  root: { padding: 16, paddingBottom: 50, backgroundColor: '#f6f8ff', gap: 18 },
  hero: { backgroundColor: '#172c60', borderRadius: 18 },
  heading: { color: '#ffffff', fontWeight: '800' },
  eyebrow: { color: '#a7c1ff' },
  light: { color: '#ebf1ff' },
  gap: { gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  flex: { flex: 1, minWidth: 130 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { flex: 1, minWidth: 100 },
  task: { flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#d8deed' },
  good: { color: '#087f5b' },
  error: { color: '#b91c1c' },
});
