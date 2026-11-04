import React, { useEffect, useRef, useState } from 'react';
import { AppState, DeviceEventEmitter, Platform, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { authenticateWithDeviceLock } from '@/utils/biometricAuth';
import { APP_LOCK_CHANGED, getAppLockPreference, needsUnlock, type AppLockPreference } from '@/utils/appLock';
import { colors, space } from '@/constants/tokens';

function ScopedLock({userId}:{userId:number}) {
 const router=useRouter();
 const {logout}=useAuth();
 const [pref,setPref]=useState<AppLockPreference|null>(null);
 const [locked,setLocked]=useState(true);
 const [hidden,setHidden]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const backgroundAt=useRef<number|null>(null);
 const attempting=useRef(false);
 const prefRef=useRef<AppLockPreference|null>(null);
 useEffect(()=>{
  let alive=true;
  void getAppLockPreference(userId).then(value=>{
   if(!alive)return;
   prefRef.current=value;
   setPref(value);
   setLocked(value.enabled);
   setHidden(false);
  });
  return ()=>{alive=false;};
 },[userId]);
 useEffect(()=>{
  const prefSubscription=DeviceEventEmitter.addListener(APP_LOCK_CHANGED,(changedId:number)=>{
   if(changedId!==userId)return;
   void getAppLockPreference(userId).then(value=>{prefRef.current=value;setPref(value);});
  });
  return ()=>prefSubscription.remove();
 },[userId]);
 useEffect(()=>{
  if(Platform.OS==='web')return;
  const sub=AppState.addEventListener('change',next=>{
   if(attempting.current)return;
   if(next==='inactive'||next==='background'){
    if(backgroundAt.current===null)backgroundAt.current=Date.now();
    // Hide sensitive content while the system captures app-switcher previews.
    setHidden(true);
   }else if(next==='active'){
    const previous=backgroundAt.current;
    backgroundAt.current=null;
    const policy=prefRef.current;
    if(policy?.enabled && needsUnlock(previous,Date.now(),policy.delaySeconds))setLocked(true);
    setHidden(false);
   }
  });
  return ()=>sub.remove();
 },[]);
 const unlock=async()=>{
  if(busy)return;
  setBusy(true);setError('');attempting.current=true;
  try{
   const valid=await authenticateWithDeviceLock();
   if(valid)setLocked(false);
   else setError('Device authentication was cancelled. The app remains locked.');
  }catch{setError('Device authentication failed. Retry or sign in with your password.');}
  finally{attempting.current=false;setBusy(false);}
 };
 const usePassword=async()=>{
  if(busy)return;
  setBusy(true);
  try{await logout();router.replace('/login' as any);}
  catch{setError('Could not sign out. Try again.');}
  finally{setBusy(false);}
 };
 if(Platform.OS==='web'||(!hidden&&pref!==null&&!locked))return null;
 return <View style={styles.overlay} accessibilityViewIsModal importantForAccessibility="yes" accessibilityLabel="ChemistTasker app lock">
  <Text variant="headlineMedium" style={styles.heading}>ChemistTasker is locked</Text>
  <Text style={styles.body}>Unlock using your device fingerprint, Face ID or system passcode. Your existing account session and permissions still apply.</Text>
  {error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}
  {hidden?<Text style={styles.body}>Securing your workspace…</Text>:<>
   <Button mode="contained" loading={busy} disabled={busy} onPress={()=>void unlock()}>Unlock app</Button>
   <Button mode="outlined" disabled={busy} onPress={()=>void usePassword()}>Sign in with password instead</Button>
  </>}
 </View>;
}
export default function AppLockGate(){
 const {user}=useAuth();
 return user?.id==null?null:<ScopedLock key={user.id} userId={user.id}/>;
}
const styles=StyleSheet.create({
 overlay:{...StyleSheet.absoluteFillObject,zIndex:20000,elevation:20000,backgroundColor:colors.pageBg,justifyContent:'center',padding:space['3xl'],gap:space.lg},
 heading:{color:colors.textPrimary,fontWeight:'700'},body:{color:colors.textSecondary,lineHeight:23},
 error:{color:colors.status.red.fg}
});
