import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Card, Text } from 'react-native-paper';
import { fetchMyConfirmedShifts } from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import { colors, radius, space } from '@/constants/tokens';
import { calendarEditorUrl, directionsUrl, upcomingShifts, type OfflineShift } from '@/features/nextShift/nextShiftModel';
import { readConfirmedShiftSnapshot, saveConfirmedShiftSnapshot } from '@/features/nextShift/offlineConfirmedShifts';

export default function NextShiftScreen() {
 const router=useRouter();
 const {user}=useAuth();
 const userId=user?.id;
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
   const saved=await readConfirmedShiftSnapshot(userId);
   if(gen!==generation.current)return;
   if(saved){setRows(saved.rows);setCachedAt(saved.savedAt);setOffline(true);}
   const current=await fetchMyConfirmedShifts();
   if(gen!==generation.current)return;
   const snapshot=await saveConfirmedShiftSnapshot(userId,current);
   if(gen!==generation.current)return;
   setRows(snapshot.rows);setCachedAt(snapshot.savedAt);setOffline(false);
  }catch{
   if(gen===generation.current)setMessage('Live shifts could not be verified. Saved details may have changed or been cancelled.');
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
  const a=new Date(row.start),b=new Date(row.end);
  return a.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})+' · '+
   a.toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit'})+'–'+b.toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit'});
 };
 return <SafeAreaView edges={['top','left','right','bottom']} style={styles.page}>
  <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={()=>void load()}/>}>
   <Button mode="text" icon="arrow-left" onPress={()=>router.back()}>Back</Button>
   <Text variant="headlineMedium" style={styles.title}>My next shifts</Text>
   <Text style={styles.muted}>Confirmed dates only. Refresh against ChemistTasker before travelling.</Text>
   {cachedAt?<Text accessibilityRole="alert" style={offline?styles.warning:styles.muted}>
     {offline?'Saved copy only — not a live booking confirmation':'Live shift list refreshed'} · {new Date(cachedAt).toLocaleString('en-AU')}
   </Text>:null}
   {message?<Text accessibilityRole="alert" style={styles.warning}>{message}</Text>:null}
   {loading&&!rows.length?<ActivityIndicator accessibilityLabel="Loading confirmed shifts"/>:null}
   {upcoming.length===0&&!loading?<Card mode="outlined"><Card.Content>
     <Text variant="titleMedium">No upcoming confirmed shifts</Text>
     <Text style={styles.muted}>Shifts will appear here once confirmed.</Text>
   </Card.Content></Card>:null}
   {upcoming.map((row,index)=><Card key={row.shiftId+'-'+row.slotId} mode="outlined" style={styles.card}>
     <Card.Content style={styles.group}>
      {index===0?<Text style={styles.marker}>NEXT SHIFT</Text>:null}
      <Text variant="titleMedium" style={styles.title}>{row.pharmacy} · {row.role}</Text>
      <Text>{dates(row)}</Text>
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
