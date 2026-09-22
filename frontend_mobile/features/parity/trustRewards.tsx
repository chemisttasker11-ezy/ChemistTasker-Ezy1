import React,{useCallback,useEffect,useMemo,useState}from'react';
import{Button,Card,Text}from'react-native-paper';
import{useLocalSearchParams,useRouter}from'expo-router';
import{fetchRatingsSummaryService,fetchRatingsPageService,reportRatingService,fetchPillBalanceService,fetchPillHistoryService,fetchPillReferralCodeService,fetchPillReferralsService}from'@chemisttasker/shared-core';
import{useAuth}from'@/context/AuthContext';
import{DataRow,EmptyState,Field,InfoNote,MetricGrid,ParityPage,ScreenLink,Section,palette}from'./ParityUI';
import{asArray,dateLabel,errorMessage,replaceUnderscore}from'./utils';

type TrustScreen='ratings'|'ratings-history'|'rating-report'|'pills';

export function TrustRewardsScreen({screen}:{screen:TrustScreen}){
 const router=useRouter();const params=useLocalSearchParams<{id?:string}>();const{user}=useAuth();
 const[summary,setSummary]=useState<any>(null),[ratings,setRatings]=useState<any[]>([]),[balance,setBalance]=useState<any>(null),[history,setHistory]=useState<any[]>([]),[referral,setReferral]=useState<any>(null),[referrals,setReferrals]=useState<any[]>([]),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState('');
 const load=useCallback(async()=>{setError('');try{
   if((screen==='ratings'||screen==='ratings-history'||screen==='rating-report')&&user?.id){const[s,p]=await Promise.all([fetchRatingsSummaryService({targetType:'worker',targetId:user.id}),fetchRatingsPageService({targetType:'worker',targetId:user.id,page:1})]);setSummary(s);setRatings(asArray((p as any)?.results??p));}
   if(screen==='pills'){const[b,h,rc,refs]=await Promise.all([fetchPillBalanceService(),fetchPillHistoryService({page:1}),fetchPillReferralCodeService(),fetchPillReferralsService({page:1})]);setBalance(b);setHistory(asArray((h as any)?.results??h));setReferral(rc);setReferrals(asArray((refs as any)?.results??refs));}
 }catch(e){setError(errorMessage(e,'Unable to load trust and rewards data.'));}finally{setLoading(false);setRefreshing(false);}},[screen,user?.id]);
 useEffect(()=>{void load();},[load]);
 const earned=useMemo(()=>history.filter((entry:any)=>Number(entry.delta??0)>0).reduce((sum:number,entry:any)=>sum+Number(entry.delta??0),0),[history]);
 const spent=useMemo(()=>Math.abs(history.filter((entry:any)=>Number(entry.delta??0)<0).reduce((sum:number,entry:any)=>sum+Number(entry.delta??0),0)),[history]);
 const pendingReferrals=useMemo(()=>referrals.filter((event:any)=>String(event.status||'').toUpperCase()==='CLAIMED'),[referrals]);
 const sharedReferralLinks=useMemo(()=>referrals.filter((event:any)=>String(event.status||'').toUpperCase()==='PENDING'&&!event.referred_user_email),[referrals]);
 const sharedShiftLinks=useMemo(()=>sharedReferralLinks.filter((event:any)=>String(event.referral_type||'').toUpperCase()==='SHIFT'),[sharedReferralLinks]);
 const sharedFriendLinks=useMemo(()=>sharedReferralLinks.filter((event:any)=>String(event.referral_type||'').toUpperCase()==='FRIEND'),[sharedReferralLinks]);
 const awardedReferrals=useMemo(()=>referrals.filter((event:any)=>String(event.status||'').toUpperCase()==='AWARDED'),[referrals]);
 const latestSharedLink=sharedReferralLinks[0];
 if(screen==='rating-report')return <RatingReport rating={ratings.find(r=>String(r.id)===String(params.id||''))} ratingId={Number(params.id)} loading={loading} error={error}/>;
 if(screen==='ratings-history')return <ParityPage title="Rating history" subtitle="Relationship-level ratings received from pharmacy owners and administrators." loading={loading} error={error} onRetry={load}><Section title="Reviews">{ratings.length?ratings.map(r=><DataRow key={r.id} title={(r.stars||0)+' / 5 stars'} subtitle={(r.comment||'No written comment')+' · '+dateLabel(r.updatedAt||r.updated_at)} status="Received" onPress={()=>router.push(('/profile/ratings/'+r.id+'/report') as any)}/>):<EmptyState title="No ratings yet" body="Ratings appear after eligible pharmacy relationships submit feedback."/>}</Section></ParityPage>;
 if(screen==='pills')return <ParityPage title="Pill rewards" subtitle="Track every pill earned from referrals and every pill spent on eligible actions." loading={loading} error={error} onRetry={load} onRefresh={()=>{setRefreshing(true);void load();}} refreshing={refreshing}>
   <MetricGrid items={[
     {label:'Balance',value:balance?.balance??0,tone:'success'},
     {label:'Earned',value:earned,tone:'success'},
     {label:'Spent',value:spent},
     {label:'Shift post cost',value:balance?.shift_post_cost??0},
   ]}/>
   {referral?.referral_code?<InfoNote title="Referral code">{referral.referral_code}</InfoNote>:null}
   <Section title="Referral pipeline" description="Shared links, registered referrals awaiting verification, and completed rewards.">
     <MetricGrid items={[
       {label:'Shift links shared',value:sharedShiftLinks.length},
       {label:'Friend links shared',value:sharedFriendLinks.length},
       {label:'Waiting verification',value:pendingReferrals.length},
       {label:'Rewards awarded',value:awardedReferrals.length,tone:'success'},
     ]}/>
     <InfoNote title="Latest shared link">{latestSharedLink?`${String(latestSharedLink.referral_type||'friend').toLowerCase()} referral${latestSharedLink.shift_id?` for Shift #${latestSharedLink.shift_id}`:''} · ${dateLabel(latestSharedLink.created_at)}`:'No referral links have been created yet.'}</InfoNote>
   </Section>
   <Section title="Pending referrals" description="Registered referrals waiting for profile verification.">
     {pendingReferrals.length?pendingReferrals.map((r:any,i:number)=><DataRow key={r.id||i} title={String(r.referral_type||'FRIEND').toUpperCase()==='SHIFT'?`Shift referral${r.shift_id?` · Shift #${r.shift_id}`:''}`:'Friend referral'} subtitle={`${r.referred_user_email||r.referred_email||'Registered user'} · ${dateLabel(r.created_at)}`} status="Waiting verification"/>):<EmptyState title="No pending referrals" body="No registered referrals are waiting for verification."/>}
   </Section>
   <Section title="Pill activity" description="A readable ledger of every action that changed your balance.">
     {history.length?history.map((r:any,i:number)=><DataRow key={r.id||i} title={r.description||replaceUnderscore(r.source||'Reward activity')} subtitle={`${replaceUnderscore(r.source||'reward')} ${r.shift_id?`· Shift #${r.shift_id} `:''}· ${dateLabel(r.created_at)} · Balance after ${r.balance_after??'—'}`} status={`${Number(r.delta??0)>=0?'+':''}${Number(r.delta??0)} pills`}/>):<EmptyState title="No pill activity yet" body="Referrals and future pill payments will appear here."/>}
   </Section>
 </ParityPage>;
 return <ParityPage title="My ratings" subtitle="Your ChemistTasker relationship-level reputation." loading={loading} error={error} onRetry={load}><MetricGrid items={[{label:'Average',value:Number(summary?.average??0).toFixed(1)+' / 5',tone:'success'},{label:'Reviews',value:summary?.count??0}]}/><InfoNote title="Relationship ratings">Ratings are relationship-level rather than per-shift. Eligible owners/admins can maintain one editable rating for a worker relationship.</InfoNote><ScreenLink title="Rating history" subtitle="Read rating comments and report a rating you received." onPress={()=>router.push('/profile/ratings/history' as any)}/><ScreenLink title="Pill rewards" subtitle="View reward balance and referral activity." onPress={()=>router.push('/rewards/pills' as any)}/></ParityPage>;
}
function RatingReport({rating,ratingId,loading,error}:{rating:any;ratingId:number;loading:boolean;error:string}){const router=useRouter();const[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[localError,setLocalError]=useState(''),[reference,setReference]=useState('');const submit=async()=>{setBusy(true);setLocalError('');try{const r:any=await reportRatingService(ratingId,reason.trim());setReference(r.reference||('RAT-'+r.id));}catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}};return <ParityPage title="Report rating" subtitle="Request moderation of a rating received by you." loading={loading} error={error||localError}>{reference?<><InfoNote title="Report submitted" tone="success">Reference {reference}. The rating remains visible unless moderation changes its status.</InfoNote><Button onPress={()=>router.replace('/profile/ratings/history' as any)}>Return to ratings</Button></>:<><Card mode="outlined"><Card.Content><Text variant="titleMedium">{rating?(rating.stars+' / 5 stars'):'Rating #'+ratingId}</Text><Text variant="bodyMedium" style={{color:palette.muted}}>{rating?.comment||'Provide the moderation reason below.'}</Text></Card.Content></Card><Field label="Reason for report" value={reason} multiline onChangeText={setReason}/><Button mode="contained" loading={busy} disabled={reason.trim().length<10||busy||!ratingId} onPress={()=>void submit()}>Submit rating report</Button></>}</ParityPage>;}
