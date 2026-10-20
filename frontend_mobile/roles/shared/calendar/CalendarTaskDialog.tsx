import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Dialog, HelperText, IconButton, Menu, Portal, Switch, Text, TextInput } from 'react-native-paper';
import { DatePickerModal, TimePickerModal } from 'react-native-paper-dates';
import { format } from 'date-fns';
import {
  createSavedTask, createWorkNoteService, deleteSavedTask, deleteWorkNoteService,
  getWorkNoteDetail, fillPlannerFromRoster, listSavedTasks, updateWorkNoteService,
  type SavedTaskApi, type WorkNoteApi,
} from '@chemisttasker/shared-core';
import { formatTime, parseTime, taskFormFromNote, toDate } from './calendarModel';

const message = (error: unknown) => error instanceof Error ? error.message : 'Unable to save. Please try again.';

export default function CalendarTaskDialog({ pharmacyId, date, note, isPlannerTask, members, membersLoading, onDismiss, onSaved, onMessage }: {
  pharmacyId: number;
  date: string;
  note?: WorkNoteApi;
  isPlannerTask: boolean;
  members: { id: number; label: string }[];
  membersLoading: boolean;
  onDismiss: () => void;
  onSaved: () => void;
  onMessage: (text: string) => void;
}) {
  const [form, setForm] = useState(() => ({ ...taskFormFromNote(date, note), isPlannerTask: note?.is_planner_task ?? isPlannerTask }));
  const [original, setOriginal] = useState(note);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadingOriginal, setLoadingOriginal] = useState(Boolean(note?.is_occurrence));
  const [loadFailed, setLoadFailed] = useState(false);
  const [picker, setPicker] = useState<'date' | 'until' | 'startTime' | 'endTime' | null>(null);
  const [menu, setMenu] = useState<'assignees' | 'repeat' | null>(null);
  const [savedTasks, setSavedTasks] = useState<SavedTaskApi[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedLoading, setSavedLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<'task' | SavedTaskApi | null>(null);
  const locked = Boolean(note?.is_planner_task && (note.completed_count ?? note.completed_by?.length ?? 0) > 0);
  const blocked = busy || loadingOriginal || loadFailed;

  useEffect(() => {
    if (!note?.is_occurrence) return;
    let active = true;
    // Edit the series from its original date, preserving its weekday rule and stale token.
    getWorkNoteDetail(note.series_id!).then(value => {
      if (!active) return;
      setOriginal(value);
      setForm(taskFormFromNote(date, value));
    }).catch(e => {
      if (active) { setError(message(e)); setLoadFailed(true); }
    }).finally(() => { if (active) setLoadingOriginal(false); });
    return () => { active = false; };
  }, [date, note]);

  function validate() {
    if (!form.title.trim()) { setError('Title is required.'); return false; }
    if (form.endTime && (!form.startTime || form.endTime <= form.startTime)) {
      setError('End time must be after start time on the same day.'); return false;
    }
    if (form.recurrence?.until_date && form.recurrence.until_date < form.date) {
      setError('Repeat until must be on or after the task date.'); return false;
    }
    return true;
  }

  async function save() {
    if (blocked || !validate()) return;
    setBusy(true); setError('');
    try {
      const payload = {
        pharmacy: pharmacyId, title: form.title.trim(), body: form.body, date: form.date,
        isPlannerTask: form.isPlannerTask, isClinical: form.isClinical,
        startTime: form.startTime || null, endTime: form.endTime || null,
        isGeneral: form.isGeneral, notifyOnShiftStart: form.notify,
        assigneeMembershipIds: form.isGeneral ? [] : form.assigneeIds, recurrence: form.recurrence,
      };
      if (original) {
        await updateWorkNoteService(original.series_id ?? original.id, { ...payload, updatedAt: original.updated_at });
      } else {
        await createWorkNoteService(payload);
      }
      onSaved();
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  async function fillRoster() {
    setBusy(true); setError('');
    try {
      // shortcut: eligibility is checked on fill/save/copy, not every future recurrence.
      const result = await fillPlannerFromRoster({ pharmacy: pharmacyId, date: form.date,
        start_time: form.startTime || null, end_time: form.endTime || null, is_clinical: form.isClinical });
      setForm(prev => ({ ...prev, assigneeIds: [...new Set([...prev.assigneeIds, ...result.assignee_membership_ids])] }));
      onMessage(result.assignee_membership_ids.length ? 'Rostered people added.' : 'No eligible people rostered. You can save this task unassigned.');
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  async function openSaved() {
    setSavedOpen(true); setSavedLoading(true); setError('');
    try { setSavedTasks(await listSavedTasks(pharmacyId)); }
    catch (e) { setError(message(e)); setSavedOpen(false); }
    finally { setSavedLoading(false); }
  }

  async function saveReusable() {
    if (!validate()) return;
    setBusy(true); setError('');
    try {
      await createSavedTask({ pharmacy: pharmacyId, title: form.title.trim(), details: form.body,
        start_time: form.startTime || null, end_time: form.endTime || null, is_clinical: form.isClinical });
      onMessage('Saved as a reusable task.');
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  async function confirmDelete() {
    if (!confirmation || busy) return;
    setBusy(true); setError('');
    try {
      if (confirmation === 'task' && original) {
        await deleteWorkNoteService(original.series_id ?? original.id, original.updated_at);
        onSaved();
      } else if (confirmation !== 'task') {
        await deleteSavedTask(confirmation.id);
        setSavedTasks(prev => prev.filter(task => task.id !== confirmation.id));
        onMessage('Saved task deleted. Placed tasks are unchanged.');
      }
      setConfirmation(null);
    } catch (e) { setError(message(e)); setConfirmation(null); setSavedOpen(false); }
    finally { setBusy(false); }
  }

  return <Portal>
    <Dialog visible={!savedOpen && !confirmation} onDismiss={busy ? undefined : onDismiss} style={styles.dialog}>
      <Dialog.Title>{original ? form.isPlannerTask ? 'Edit task' : 'Edit work note' : form.isPlannerTask ? 'Add task' : 'Add work note'}</Dialog.Title>
      <Dialog.ScrollArea style={styles.scroll}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <TextInput label="Title" mode="outlined" value={form.title} disabled={blocked}
            onChangeText={title => setForm(prev => ({ ...prev, title }))} />
          <Button mode="outlined" style={styles.field} contentStyle={styles.touch} icon="calendar" disabled={blocked || locked}
            onPress={() => setPicker('date')}>Date: {form.date}</Button>
          <Text style={styles.field}>Assignees</Text>
          {form.isGeneral ? <HelperText type="info">General note applies to all staff.</HelperText> : <Menu
            visible={menu === 'assignees'} onDismiss={() => setMenu(null)}
            anchor={<Button mode="outlined" contentStyle={styles.touch} disabled={blocked || locked} onPress={() => setMenu('assignees')}>
              {form.assigneeIds.length ? `${form.assigneeIds.length} selected` : 'Choose people (optional)'}
            </Button>}>
            <ScrollView style={styles.scroll}>
              {membersLoading && <Menu.Item title="Loading staff…" disabled />}
              {!membersLoading && members.length === 0 && <Menu.Item title="No staff available" disabled />}
              {members.map(member => <Menu.Item key={member.id} title={member.label}
                leadingIcon={form.assigneeIds.includes(member.id) ? 'check' : undefined}
                onPress={() => setForm(prev => ({ ...prev, assigneeIds: prev.assigneeIds.includes(member.id)
                  ? prev.assigneeIds.filter(id => id !== member.id) : [...prev.assigneeIds, member.id] }))} />)}
            </ScrollView>
          </Menu>}
          {form.assigneeIds.length > 0 && <Text>{form.assigneeIds.map(id => members.find(member => member.id === id)?.label ?? `Member ${id}`).join(', ')}</Text>}
          {form.isPlannerTask && <Button contentStyle={styles.touch} disabled={blocked || locked} onPress={fillRoster}>Fill from roster</Button>}
          {locked && <HelperText type="info">Work has started. Date and assignees are locked; wording changes keep progress.</HelperText>}
          {original?.recurrence && <HelperText type="info">Edits apply to the whole repeating series. Individual dates cannot be excluded.</HelperText>}
          {!original && form.isPlannerTask && <Button contentStyle={styles.touch} disabled={blocked} onPress={openSaved}>Use a saved task</Button>}
          <Button contentStyle={styles.touch} icon={more ? 'chevron-up' : 'chevron-down'} onPress={() => setMore(!more)}>
            More options
          </Button>
          {more && <>
            {(['startTime', 'endTime'] as const).map(field => <View key={field} style={styles.row}>
              <Button style={styles.flex} contentStyle={styles.touch} mode="outlined" disabled={blocked} onPress={() => setPicker(field)}>
                {field === 'startTime' ? 'Start time' : 'End time'}: {form[field] || 'Not set'}
              </Button>
              <IconButton icon="close" accessibilityLabel={`Clear ${field === 'startTime' ? 'start' : 'end'} time`} size={24} style={styles.iconTouch}
                disabled={blocked || !form[field]} onPress={() => setForm(prev => ({ ...prev, [field]: '' }))} />
            </View>)}
            <Menu visible={menu === 'repeat'} onDismiss={() => setMenu(null)} anchor={<Button mode="outlined" contentStyle={styles.touch}
              disabled={blocked} onPress={() => setMenu('repeat')}>Repeat: {form.recurrence?.freq.toLowerCase() ?? 'Does not repeat'}</Button>}>
              {(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'] as const).map(freq => <Menu.Item key={freq}
                title={freq === 'NONE' ? 'Does not repeat' : freq.toLowerCase()} onPress={() => {
                  setForm(prev => ({ ...prev, recurrence: freq === 'NONE' ? null : {
                    ...prev.recurrence, freq,
                    byweekday: freq === 'WEEKLY' ? prev.recurrence?.byweekday : undefined,
                  } })); setMenu(null);
                }} />)}
            </Menu>
            {form.recurrence && <>
              <TextInput label="Repeat every" mode="outlined" style={styles.field} keyboardType="number-pad" disabled={blocked}
                value={String(form.recurrence.interval ?? 1)} onChangeText={text => setForm(prev => ({ ...prev,
                  recurrence: { ...prev.recurrence!, interval: Math.max(1, Math.floor(Number(text) || 1)) } }))} />
              <View style={styles.row}>
                <Button style={styles.flex} contentStyle={styles.touch} disabled={blocked} onPress={() => setPicker('until')}>
                  Repeat until: {form.recurrence.until_date || 'Not set'}
                </Button>
                <IconButton icon="close" size={24} style={styles.iconTouch} accessibilityLabel="Clear repeat until" disabled={blocked || !form.recurrence.until_date}
                  onPress={() => setForm(prev => ({ ...prev, recurrence: { ...prev.recurrence!, until_date: null } }))} />
              </View>
            </>}
            {form.isPlannerTask && <View style={styles.row}>
              <Text style={styles.flex}>Clinical task</Text><Switch style={styles.touch} accessibilityLabel="Clinical task" disabled={blocked} value={form.isClinical}
                onValueChange={isClinical => setForm(prev => ({ ...prev, isClinical }))} />
            </View>}
            <TextInput label="Details" mode="outlined" multiline style={styles.field} value={form.body} disabled={blocked}
              onChangeText={body => setForm(prev => ({ ...prev, body }))} />
            <View style={styles.row}>
              <Text style={styles.flex}>Notify assignees at shift start</Text><Switch style={styles.touch} accessibilityLabel="Notify assignees at shift start"
                disabled={blocked} value={form.notify} onValueChange={notify => setForm(prev => ({ ...prev, notify }))} />
            </View>
            {!form.isPlannerTask && <View style={styles.row}>
              <Text style={styles.flex}>Applies to all staff (general note)</Text><Switch style={styles.touch} accessibilityLabel="Applies to all staff"
                disabled={blocked} value={form.isGeneral} onValueChange={isGeneral => setForm(prev => ({ ...prev, isGeneral, assigneeIds: [] }))} />
            </View>}
            {form.isPlannerTask && <Button contentStyle={styles.touch} disabled={blocked} onPress={saveReusable}>Save as reusable</Button>}
          </>}
          {error ? <HelperText type="error">{error}</HelperText> : null}
        </ScrollView>
      </Dialog.ScrollArea>
      <Dialog.Actions style={styles.actions}>
        {original && <Button contentStyle={styles.touch} disabled={blocked} onPress={() => setConfirmation('task')}>Delete</Button>}
        <Button contentStyle={styles.touch} disabled={busy} onPress={onDismiss}>Cancel</Button>
        <Button contentStyle={styles.touch} mode="contained" loading={busy} disabled={blocked} onPress={save}>Save</Button>
      </Dialog.Actions>
    </Dialog>
    <Dialog visible={savedOpen && !confirmation} onDismiss={() => setSavedOpen(false)} style={styles.dialog}>
      <Dialog.Title>Use a saved task</Dialog.Title>
      <Dialog.ScrollArea style={styles.scroll}><ScrollView>
        {savedLoading && <Text>Loading saved tasks…</Text>}
        {!savedLoading && !savedTasks.length && <Text>No saved tasks yet. Open More options on a task and choose Save as reusable.</Text>}
        {savedTasks.map(task => <View style={styles.row} key={task.id}>
          <Button contentStyle={styles.touch} style={styles.flex} onPress={() => {
            setForm(prev => ({ ...prev, title: task.title, body: task.details, isClinical: task.is_clinical,
              startTime: task.start_time?.slice(0, 5) ?? '', endTime: task.end_time?.slice(0, 5) ?? '' }));
            setSavedOpen(false);
          }}>{task.title}</Button>
          <IconButton icon="delete-outline" size={24} style={styles.iconTouch} accessibilityLabel={`Delete saved task ${task.title}`} onPress={() => setConfirmation(task)} />
        </View>)}
      </ScrollView></Dialog.ScrollArea>
      <Dialog.Actions><Button contentStyle={styles.touch} onPress={() => setSavedOpen(false)}>Cancel</Button></Dialog.Actions>
    </Dialog>
    <Dialog visible={Boolean(confirmation)} onDismiss={busy ? undefined : () => setConfirmation(null)} style={styles.dialog}>
      <Dialog.Title>{confirmation === 'task' ? 'Delete task?' : 'Delete saved task?'}</Dialog.Title>
      <Dialog.Content><Text>{confirmation === 'task' ? 'This permanently deletes the task and its repeating series, if any.' : 'Placed tasks will stay unchanged.'}</Text></Dialog.Content>
      <Dialog.Actions>
        <Button contentStyle={styles.touch} disabled={busy} onPress={() => setConfirmation(null)}>Cancel</Button>
        <Button contentStyle={styles.touch} disabled={busy} loading={busy} onPress={confirmDelete}>Delete</Button>
      </Dialog.Actions>
    </Dialog>
    <DatePickerModal locale="en" mode="single" visible={picker === 'date' || picker === 'until'}
      date={toDate(picker === 'date' ? form.date : form.recurrence?.until_date) ?? new Date()}
      onDismiss={() => setPicker(null)} onConfirm={({ date: chosen }) => {
        if (chosen) setForm(prev => picker === 'date' ? { ...prev, date: format(chosen, 'yyyy-MM-dd') }
          : { ...prev, recurrence: { ...prev.recurrence!, until_date: format(chosen, 'yyyy-MM-dd') } });
        setPicker(null);
      }} />
    <TimePickerModal visible={picker === 'startTime' || picker === 'endTime'}
      {...parseTime(picker === 'startTime' ? form.startTime : form.endTime)} onDismiss={() => setPicker(null)}
      onConfirm={({ hours, minutes }) => {
        if (picker === 'startTime' || picker === 'endTime') setForm(prev => ({ ...prev, [picker]: formatTime(hours, minutes) }));
        setPicker(null);
      }} />
  </Portal>;
}

const styles = StyleSheet.create({
  dialog: { maxWidth: 560, width: '90%', alignSelf: 'center' },
  scroll: { maxHeight: 420 },
  field: { marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, minHeight: 48 },
  flex: { flex: 1 },
  touch: { minHeight: 48 },
  iconTouch: { width: 48, height: 48, margin: 0 },
  actions: { flexWrap: 'wrap' },
});
