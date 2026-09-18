import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Chip, Dialog, Menu, Portal, Text, TextInput } from 'react-native-paper';
import { DatePickerInput } from 'react-native-paper-dates';
import { useAuth } from '../context/AuthContext';
import { chemistTaskerApi } from '../config/api';

const TYPES = ['ANNUAL', 'SICK', 'CARER', 'COMPASSIONATE', 'STUDY', 'UNPAID', 'OTHER'];
const parseTime = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]); const m = Number(match[2]);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59 ? { h, m } : null;
};
const combine = (day: Date | undefined, text: string) => {
  if (!day) return null; const t = parseTime(text); if (!t) return null;
  const next = new Date(day); next.setHours(t.h, t.m, 0, 0); return next;
};

export default function MyLeaveScreen() {
  const { user } = useAuth();
  const memberships = useMemo(() => ((user as any)?.memberships || []).filter((m: any) => m.is_active !== false && String(m.status || 'ACCEPTED').toUpperCase() === 'ACCEPTED' && m.role !== 'CONTACT'), [user]);
  const [rows, setRows] = useState<any[]>([]);
  const [visible, setVisible] = useState(false);
  const [membershipId, setMembershipId] = useState<number | null>(memberships[0]?.id ?? null);
  const [type, setType] = useState('ANNUAL');
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [membershipMenu, setMembershipMenu] = useState(false);
  const [typeMenu, setTypeMenu] = useState(false);

  useEffect(() => { if (!membershipId && memberships.length) setMembershipId(Number(memberships[0].id)); }, [membershipId, memberships]);
  const load = useCallback(async () => { try { const rows = await chemistTaskerApi.workforce.listLeave(); setRows(Array.isArray(rows) ? rows : []); } catch (e: any) { setError(e?.payload?.error || e?.message || 'Unable to load leave.'); } }, []);
  useEffect(() => { void load(); }, [load]);

  const start = combine(startDate, startTime); const end = combine(endDate, endTime);
  const submit = async () => {
    if (!membershipId || !start || !end || end <= start) { setError('Enter a valid start and end date/time.'); return; }
    setError('');
    try {
      await chemistTaskerApi.workforce.createLeave({ membership_id: membershipId, leave_type: type, start_at: start.toISOString(), end_at: end.toISOString(), note });
      setVisible(false); setNote(''); await load();
    } catch (e: any) { setError(e?.response?.data?.error || e?.message || 'Unable to request leave.'); }
  };
  const cancel = async (id: number) => { try { await chemistTaskerApi.workforce.decideLeave(id, 'CANCELLED', 'Cancelled by worker'); await load(); } catch (e: any) { setError(e?.payload?.error || e?.message || 'Unable to cancel request.'); } };

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.header}><View style={{flex:1}}><Text variant="headlineMedium" style={styles.title}>My leave</Text><Text variant="bodyMedium">Request full or partial-day leave without waiting for a rostered shift.</Text></View><Button mode="contained" onPress={() => setVisible(true)}>Request</Button></View>
    {!!error && <Card style={styles.error}><Card.Content><Text style={{color:'#B42318'}}>{error}</Text></Card.Content></Card>}
    {!rows.length && <Card><Card.Content><Text>No leave requests yet.</Text></Card.Content></Card>}
    {rows.map(row => <Card key={row.id}><Card.Content><View style={styles.row}><View style={{flex:1}}><Text variant="titleMedium">{row.pharmacy_name} · {row.leave_type}</Text><Text>{new Date(row.start_at).toLocaleString()} – {new Date(row.end_at).toLocaleString()}</Text>{row.note ? <Text>{row.note}</Text> : null}</View><Chip>{row.status}</Chip></View>{row.status === 'PENDING' ? <Button onPress={() => cancel(row.id)}>Cancel request</Button> : null}</Card.Content></Card>)}
  </ScrollView><Portal><Dialog visible={visible} onDismiss={() => setVisible(false)}><Dialog.Title>Request leave</Dialog.Title><Dialog.ScrollArea><ScrollView contentContainerStyle={styles.dialogContent}>
    <Menu visible={membershipMenu} onDismiss={() => setMembershipMenu(false)} anchor={<Button mode="outlined" onPress={() => setMembershipMenu(true)}>{memberships.find((m:any)=>Number(m.id)===membershipId)?.pharmacy_name || 'Select pharmacy'}</Button>}>{memberships.map((m:any)=><Menu.Item key={m.id} title={m.pharmacy_name || m.pharmacy?.name || `Pharmacy #${m.pharmacy_id || m.pharmacy?.id}`} onPress={()=>{setMembershipId(Number(m.id));setMembershipMenu(false);}} />)}</Menu>
    <Menu visible={typeMenu} onDismiss={()=>setTypeMenu(false)} anchor={<Button mode="outlined" style={styles.field} onPress={()=>setTypeMenu(true)}>{type.replaceAll('_',' ')}</Button>}>{TYPES.map(v=><Menu.Item key={v} title={v.replaceAll('_',' ')} onPress={()=>{setType(v);setTypeMenu(false);}} />)}</Menu>
    <DatePickerInput locale="en-AU" label="Start date" value={startDate} onChange={setStartDate} inputMode="start" style={styles.field}/><TextInput style={styles.field} label="Start time (HH:MM)" value={startTime} onChangeText={setStartTime}/>
    <DatePickerInput locale="en-AU" label="End date" value={endDate} onChange={setEndDate} inputMode="start" style={styles.field}/><TextInput style={styles.field} label="End time (HH:MM)" value={endTime} onChangeText={setEndTime}/>
    <TextInput style={styles.field} label="Note" multiline value={note} onChangeText={setNote}/>
  </ScrollView></Dialog.ScrollArea><Dialog.Actions><Button onPress={()=>setVisible(false)}>Cancel</Button><Button mode="contained" disabled={!membershipId || !start || !end || end <= start} onPress={submit}>Submit</Button></Dialog.Actions></Dialog></Portal></SafeAreaView>;
}

const styles=StyleSheet.create({safe:{flex:1,backgroundColor:'#F7FAFF'},content:{padding:18,gap:12},header:{flexDirection:'row',gap:12,alignItems:'center'},title:{fontWeight:'800',color:'#06214A'},row:{flexDirection:'row',gap:12,alignItems:'center'},field:{marginTop:12},error:{backgroundColor:'#FFF1F0'},dialogContent:{padding:18}});
