import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { Button, Card, Text } from 'react-native-paper';
import { BrandActivityIndicator as ActivityIndicator } from '@/components/ui/BrandActivityIndicator';
import { RootPageHeader } from '@/components/RootPageHeader';
import { fetchMyConfirmedShifts } from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import { isWorkerPersona, resolveShiftSurface } from '@/roles/shared/shifts/shiftSurface';
import { colors, radius, space } from '@/constants/tokens';
import { calendarEditorUrl, directionsUrl, offlineShiftKey, sanitizeConfirmedShifts, upcomingShifts, type OfflineShift } from '@/features/nextShift/nextShiftModel';
import { readConfirmedShiftSnapshot, saveConfirmedShiftSnapshot } from '@/features/nextShift/offlineConfirmedShifts';

export async function loadNextShiftsSequence({
 userId,
 isCurrent,
 onCached,
 onLive,
 onError,
 fetchLive = fetchMyConfirmedShifts,
 readSnapshot = readConfirmedShiftSnapshot,
 saveSnapshot = saveConfirmedShiftSnapshot,
}: {
 userId: number;
 isCurrent: () => boolean;
 onCached: (snapshot: { rows: OfflineShift[]; savedAt: string }) => void;
 onLive: (rows: OfflineShift[]) => void;
 onError: (msg: string) => void;
 fetchLive?: () => Promise<any[]>;
 readSnapshot?: (id: number) => Promise<{ rows: OfflineShift[]; savedAt: string } | null>;
 saveSnapshot?: (id: number, shifts: any[]) => Promise<unknown>;
}): Promise<void> {
 try {
  const saved = await readSnapshot(userId).catch(() => null);
  if (!isCurrent()) return;
  if (saved) onCached(saved);
  const current = await fetchLive();
  if (!isCurrent()) return;
  if (current.some((shift) => !Array.isArray(shift.assignedOccurrences))) {
   onError('Confirmed shift dates cannot be verified until the service is updated. Please use your main shift page.');
   return;
  }
  const liveRows = sanitizeConfirmedShifts(current, userId);
  onLive(liveRows);
  void saveSnapshot(userId, current).catch(() => undefined);
 } catch {
  if (isCurrent()) {
   onError('Live shifts could not be verified. Saved details may have changed or been cancelled.');
  }
 }
}

export default function NextShiftScreen() {
 const { user, isLoading } = useAuth();
 // Redirect effects are too late: guard against worker API calls before the
 // child is mounted, using the same persona policy as the Shifts surface.
 const surface = resolveShiftSurface({ pathname: '/next-shifts', role: user?.role, userId: user?.id });
 if (isLoading) return <ActivityIndicator accessibilityLabel="Checking shift access" />;
 if (!user || !isWorkerPersona(surface.persona) || surface.publicOnly) {
  return <Redirect href={surface.persona === 'explorer' ? '/explorer/shifts?section=public' : '/'} />;
 }
 // A persona switch must remount all state, not show another account's cached shifts.
 return <ScopedNextShifts key={user.id ?? 'signed-out'} userId={user.id} />;
}

function ScopedNextShifts({userId}:{userId?:number}) {
 const generation=useRef(0);
 const [rows,setRows]=useState<OfflineShift[]>([]);
 const [cachedAt,setCachedAt]=useState('');
 const [offline,setOffline]=useState(true);
 const [loading,setLoading]=useState(true);
 const [message,setMessage]=useState('');

 const load=useCallback(async()=>{
  const gen=++generation.current;
  if(userId==null){setRows([]);setLoading(false);return;}
  setLoading(true);setMessage('');
  try{
   await loadNextShiftsSequence({
    userId,
    isCurrent:()=>gen===generation.current,
    onCached:(saved)=>{setRows(saved.rows);setCachedAt(saved.savedAt);setOffline(true);},
    onLive:(liveRows)=>{setRows(liveRows);setCachedAt(new Date().toISOString());setOffline(false);},
    onError:(msg)=>setMessage(msg),
   });
  }finally{
   if(gen===generation.current)setLoading(false);
  }
 },[userId]);

 useEffect(()=>{
  void load();
  return ()=>{generation.current++;};
 },[load]);

 const open=async(url:string)=>{
  try{await Linking.openURL(url);}catch{setMessage('Could not open this link. Try again.');}
 };
 const upcoming=upcomingShifts(rows);
 const dates=(row:OfflineShift)=>{
  // The booked wall clock belongs to the pharmacy. Never re-interpret it using device time zone.
  const formatDate=(wall:string)=>new Date(wall.slice(0,10)+'T12:00:00Z').toLocaleDateString('en-AU',{
   weekday:'short',day:'numeric',month:'short',timeZone:'UTC'
  });
  const formatTime=(wall:string)=>wall.slice(11,16);
  const dayStart=row.wallStart.slice(0,10),dayEnd=row.wallEnd.slice(0,10);
  return formatDate(row.wallStart)+' · '+formatTime(row.wallStart)+'–'+
   (dayEnd!==dayStart ? formatDate(row.wallEnd)+' ' : '')+formatTime(row.wallEnd);
 };
 return <SafeAreaView edges={['left','right','bottom']} style={styles.page}>
  <RootPageHeader title="My next shifts" />
  <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={()=>void load()}/>}>
   <Text variant="headlineMedium" style={styles.title}>My next shifts</Text>
   <Text style={styles.muted}>Confirmed dates only. Refresh against ChemistTasker before travelling.</Text>
   {cachedAt?<Text accessibilityRole="alert" style={offline?styles.warning:styles.muted}>
     {offline?'Saved copy only — not a live booking confirmation':'Live shift list refreshed'} · {new Date(cachedAt).toLocaleString('en-AU')}
   </Text>:null}
   {message?<Text accessibilityRole="alert" style={styles.warning}>{message}</Text>:null}
   {loading&&!rows.length?<ActivityIndicator accessibilityLabel="Loading confirmed shifts"/>:null}
   {upcoming.length===0&&!loading&&!message?<Card mode="outlined"><Card.Content>
     <Text variant="titleMedium">No upcoming confirmed shifts</Text>
     <Text style={styles.muted}>Shifts will appear here once confirmed.</Text>
   </Card.Content></Card>:null}
   {upcoming.map((row,index)=><Card key={offlineShiftKey(row)} mode="outlined" style={styles.card}>
     <Card.Content style={styles.group}>
      {index===0?<Text style={styles.marker}>NEXT SHIFT</Text>:null}
      <Text variant="titleMedium" style={styles.title}>{row.pharmacy} · {row.role}</Text>
      <Text>{dates(row)}</Text>
      <Text style={styles.muted}>Pharmacy time zone: {row.timeZone}</Text>
      <Text style={styles.muted}>{row.address||'Pharmacy address not supplied'}</Text>
      <View style={styles.actions}>
       <Button mode="outlined" icon="calendar-plus" onPress={()=>void open(calendarEditorUrl(row))}>Add to calendar</Button>
       {directionsUrl(row)?<Button mode="outlined" icon="map-marker" onPress={()=>void open(directionsUrl(row)!)}>Directions</Button>:null}
      </View>
      {offline?<Text style={styles.warning}>Saved information may be outdated. Do not assume this shift is still booked until you reconnect.</Text>:null}
     </Card.Content>
   </Card>)}
   <Button mode="contained" onPress={()=>void load()} disabled={loading} loading={loading}>Refresh confirmed shifts</Button>
  </ScrollView>
 </SafeAreaView>;
}
const styles=StyleSheet.create({
 page:{flex:1,backgroundColor:colors.pageBg},
 content:{padding:space.lg,gap:space.lg,paddingBottom:space['3xl']},
 card:{borderColor:colors.border,borderRadius:radius.card,backgroundColor:colors.surfaceBg},
 group:{gap:space.md},actions:{flexDirection:'row',flexWrap:'wrap',gap:space.sm},
 title:{color:colors.textPrimary,fontWeight:'700'},
 muted:{color:colors.textSecondary,lineHeight:22},
 marker:{color:colors.primary,fontWeight:'700',letterSpacing:1,fontSize:12},
 warning:{color:colors.status.amber.fg,lineHeight:22}
});
