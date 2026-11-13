import React,{useCallback,useEffect,useRef,useState}from'react';
import{Image,View}from'react-native';
import{Button,Card,Chip,IconButton,Searchbar,Text}from'react-native-paper';
import { GuardedDatePickerInput as DatePickerInput, GuardedTimePickerModal as TimePickerModal } from '@/components/security/GuardedModal';
import{useLocalSearchParams,useRouter}from'expo-router';
import*as ImagePicker from'expo-image-picker';
import{File,Paths}from'expo-file-system';
import{chemistTaskerApi}from'@/config/api';
import{useAuth}from'@/context/AuthContext';
import{categoriesForSellerContext,clampMaximumAudience,nextMarketplaceAudience,permittedBuyerRolesForCategory,permittedModesForCategory,type MarketplaceCategory,type MarketplaceDashboardListing,type MarketplaceExchange,type MarketplaceListingOptions,type MarketplacePublicListing}from'@chemisttasker/shared-core';
import{ActionButtons,ChoiceChips,DataRow,EmptyState,Field,InfoNote,MetricGrid,ParityPage,Section,palette}from'./ParityUI';
import{asArray,dateLabel,errorMessage,idempotencyKey,money,replaceUnderscore,toNumber}from'./utils';
import{clearMarketplaceDraft,emptyMarketplaceDraft,loadMarketplaceDraft,loadSettledMarketplaceDraft,patchMarketplaceDraft,loadMarketplaceIntent,pendingMarketplaceIntent,saveMarketplaceIntent,releaseMarketplaceIntent,recoverMarketplaceIntent,UNREADABLE_INTENT,type MarketplaceMobileDraft,type MarketplacePendingIntent}from'./marketplaceDraft';
import{browseModes,browseQuery,categorySlug,normalizeBrowseMode,enquiryValidation,appendBrowsePage,nextBrowsePage,type BrowseMode}from'./marketplaceBrowseModel';
import { MarketplaceAccessResolution } from './MarketplaceAccessResolution';

type MarketplaceScreen='browse'|'filters'|'item'|'seller'|'category'|'details'|'photos'|'audience'|'review'|'mine'|'mine-detail'|'exchanges'|'exchange-detail'|'report';
const api=chemistTaskerApi.marketplace;

/** Key sensitive workspace state to the authenticated account; cached private
 * listings and drafts cannot render for a subsequent signed-in user, even
 * before asynchronous data-load effects have cleared the previous snapshot.
 */
export function MarketplaceParityScreen({screen}:{screen:MarketplaceScreen}){
 const {user}=useAuth();
 return <MarketplaceParityContent key={`${user?.id??'signed-out'}:${screen}`} screen={screen}/>;
}
function MarketplaceParityContent({screen}:{screen:MarketplaceScreen}){
 const router=useRouter();const{user}=useAuth();const draftScope=String(user?.id??user?.email??user?.username??'anonymous');const params=useLocalSearchParams<{id?:string;search?:string;category?:string;mode?:string}>();const id=String(params.id||'');
 const[listings,setListings]=useState<MarketplacePublicListing[]>([]),[listing,setListing]=useState<MarketplacePublicListing|null>(null),[categories,setCategories]=useState<MarketplaceCategory[]>([]),[options,setOptions]=useState<MarketplaceListingOptions|null>(null),[mine,setMine]=useState<MarketplaceDashboardListing[]>([]),[exchanges,setExchanges]=useState<MarketplaceExchange[]>([]),[exchange,setExchange]=useState<MarketplaceExchange|null>(null);
 const[draft,setDraft]=useState<MarketplaceMobileDraft>(emptyMarketplaceDraft()),[query,setQuery]=useState(String(params.search||'')),[categoryFilter,setCategoryFilter]=useState(String(params.category||'')),[modeFilter,setModeFilter]=useState<BrowseMode>(normalizeBrowseMode(params.mode)),[listingCount,setListingCount]=useState<number|null>(null),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState('');
 const[nextPage,setNextPage]=useState<number|null>(null),[loadingMore,setLoadingMore]=useState(false),[moreError,setMoreError]=useState('');
 const requestRef=useRef(0),moreRequestRef=useRef(0),moreBusyRef=useRef(false);
 useEffect(()=>{setQuery(String(params.search||''));setCategoryFilter(String(params.category||''));setModeFilter(normalizeBrowseMode(params.mode));},[params.search,params.category,params.mode]);
 const load=useCallback(async()=>{const request=++requestRef.current;
   if(screen==='browse'||screen==='filters'){moreRequestRef.current+=1;moreBusyRef.current=false;setNextPage(null);setLoadingMore(false);setMoreError('');}
   if(screen!=='browse'&&screen!=='filters')setLoading(true);setError('');try{
   if(screen==='browse'||screen==='filters'){const[page,cats]=await Promise.all([api.listListings(browseQuery({search:query,category:categoryFilter,mode:modeFilter})),api.listCategories()]);if(request===requestRef.current){const rows=asArray<MarketplacePublicListing>((page as any)?.results??page);setListings(rows);setListingCount(Number.isFinite(Number((page as any)?.count))?Number((page as any).count):rows.length);setNextPage(nextBrowsePage(page,1));setCategories(asArray(cats));}}
   if(screen==='item'||screen==='report'){const result=await api.getListing(id);if(request===requestRef.current)setListing(result);}
   if(['seller','category','details','photos','audience','review'].includes(screen)){const[d,o]=await Promise.all([loadMarketplaceDraft(draftScope),api.getListingOptions()]);if(request===requestRef.current){setDraft(d);setOptions(o);setCategories(categoriesForSellerContext(o,d.seller_context));}}
   if(screen==='mine'||screen==='mine-detail'){const result=await api.getDashboard();if(request===requestRef.current)setMine(asArray(result));}
   if(screen==='exchanges'||screen==='exchange-detail'){const result=await api.listExchanges();if(request===requestRef.current)setExchanges(asArray(result));if(screen==='exchange-detail'&&id){const detail=await api.getExchange(id);if(request===requestRef.current)setExchange(detail);}}
 }catch(e){if(request===requestRef.current){setError(errorMessage(e,'Unable to load Marketplace.'));if(screen==='browse'||screen==='filters'){setListings([]);setListingCount(null);}}}finally{if(request===requestRef.current){setLoading(false);setRefreshing(false);}}},[screen,id,query,categoryFilter,modeFilter,draftScope]);
 useEffect(()=>{void load();return()=>{requestRef.current+=1;moreRequestRef.current+=1;};},[load]);

 const loadMore=async()=>{
   if(screen!=='browse'||nextPage===null||moreBusyRef.current)return;
   const parentRequest=requestRef.current;
   const pageNumber=nextPage;
   const moreRequest=++moreRequestRef.current;
   moreBusyRef.current=true;setLoadingMore(true);setMoreError('');
   try{
     const page=await api.listListings({...browseQuery({search:query,category:categoryFilter,mode:modeFilter}),page:pageNumber});
     if(parentRequest!==requestRef.current||moreRequest!==moreRequestRef.current)return;
     const rows=asArray<MarketplacePublicListing>((page as any)?.results??page);
     setListings(existing=>appendBrowsePage(existing,rows));
     if(typeof (page as any)?.count==='number')setListingCount((page as any).count);
     setNextPage(nextBrowsePage(page,pageNumber));
   }catch(e){if(parentRequest===requestRef.current&&moreRequest===moreRequestRef.current)setMoreError(errorMessage(e,'More listings could not be loaded.'));}
   finally{if(moreRequest===moreRequestRef.current){moreBusyRef.current=false;setLoadingMore(false);}}
 };

 if(screen==='seller')return <SellerStep draft={draft} options={options} loading={loading} error={error} onReload={load}/>;
 if(screen==='category')return <CategoryStep draft={draft} options={options} loading={loading} error={error}/>;
 if(screen==='details')return <DetailsStep draft={draft} options={options} loading={loading} error={error}/>;
 if(screen==='photos')return <PhotosStep draft={draft} loading={loading} error={error}/>;
 if(screen==='audience')return <AudienceStep draft={draft} options={options} loading={loading} error={error}/>;
 if(screen==='review')return <ReviewStep draft={draft} loading={loading} error={error}/>;
 if(screen==='item')return <ListingDetail listing={listing} loading={loading} error={error}/>;
 if(screen==='report')return <ReportListing listing={listing} loading={loading} error={error}/>;
 if(screen==='mine-detail')return <MyListingDetail row={mine.find(x=>String(x.id)===id)} loading={loading} error={error} onReload={load}/>;
 if(screen==='exchange-detail')return <ExchangeDetail row={exchange} loading={loading} error={error} onReload={load}/>;
 if(screen==='filters')return <ParityPage title="Marketplace filters" subtitle="Narrow approved ordinary goods by category and exchange type." loading={loading} error={error} onRetry={load}><Searchbar value={query} onChangeText={setQuery} placeholder="Search Marketplace"/><Section title="Categories"><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}><Chip selected={!categoryFilter} onPress={()=>setCategoryFilter('')}>All</Chip>{categories.map(category=><Chip key={category.id} selected={categoryFilter===categorySlug(category)} onPress={()=>setCategoryFilter(categorySlug(category))}>{category.name}</Chip>)}</View></Section><Section title="Exchange type"><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{browseModes.map(mode=><Chip key={mode.value||'all'} selected={modeFilter===mode.value} onPress={()=>setModeFilter(mode.value)}>{mode.label}</Chip>)}</View></Section><ActionButtons><Button mode="outlined" onPress={()=>{setQuery('');setCategoryFilter('');setModeFilter('');}}>Clear filters</Button><Button mode="contained" onPress={()=>router.replace({pathname:'/marketplace',params:browseQuery({search:query,category:categoryFilter,mode:modeFilter})} as any)}>Show results</Button></ActionButtons></ParityPage>;
 if(screen==='mine')return <ParityPage title="My Marketplace listings" subtitle="Manage publication and audience escalation." loading={loading} error={error} onRetry={load} right={<IconButton icon="plus" onPress={()=>router.push('/marketplace/new/seller' as any)}/>}><Section title="Listings">{mine.length?mine.map(row=><DataRow key={row.id} title={row.title} subtitle={(row.category?.name||'Marketplace')+' · '+(row.current_circle||'Private')+' · updated '+dateLabel(row.updated_at)} status={replaceUnderscore(row.publication_status)+' / '+replaceUnderscore(row.availability_status)} onPress={()=>router.push(('/marketplace/mine/'+row.id) as any)}/>):<EmptyState title="No listings yet" body="Create your first Marketplace listing." actionLabel="Add item" onAction={()=>router.push('/marketplace/new/seller' as any)}/>}</Section></ParityPage>;
 if(screen==='exchanges')return <ParityPage title="My exchanges" subtitle="Enquiries, agreed terms and transfer state." loading={loading} error={error} onRetry={load}><Section title="Exchanges">{exchanges.length?exchanges.map(row=><DataRow key={row.id} title={row.listing_title||'Marketplace exchange'} subtitle={replaceUnderscore(row.state)+' · updated '+dateLabel(row.updated_at)} status={replaceUnderscore(row.state)} onPress={()=>router.push(('/marketplace/exchanges/'+row.id) as any)}/>):<EmptyState title="No exchanges" body="Marketplace enquiries and agreed exchanges will appear here."/>}</Section></ParityPage>;
 return <ParityPage title="Marketplace" subtitle="Tools, books, fixtures, workwear and approved non-medicine goods." loading={loading} error={error} onRetry={load} onRefresh={()=>{setRefreshing(true);void load();}} refreshing={refreshing} right={<IconButton icon="plus" onPress={()=>router.push('/marketplace/new/seller' as any)}/>}><Searchbar value={query} onChangeText={setQuery} onSubmitEditing={()=>void load()} placeholder="Search listings"/><ActionButtons><Button mode="outlined" icon="filter-variant" onPress={()=>router.push({pathname:'/marketplace/filters',params:browseQuery({search:query,category:categoryFilter,mode:modeFilter})} as any)}>Filters</Button><Button mode="outlined" onPress={()=>router.push('/marketplace/mine' as any)}>My listings</Button><Button mode="outlined" onPress={()=>router.push('/marketplace/exchanges' as any)}>Exchanges</Button></ActionButtons><Section title={listingCount===null?'Approved listings':`${listingCount} approved ${listingCount===1?'listing':'listings'}`} description={[categoryFilter?'Category selected':'',modeFilter||''].filter(Boolean).join(' · ')||undefined}>{listings.length?listings.map(row=><ListingCard key={row.id} row={row} onPress={()=>router.push(('/marketplace/items/'+row.id) as any)}/>):<EmptyState title="No listings found" body="Try a different search or category."/>}
 {moreError?<InfoNote title="More listings unavailable" tone="warning">{moreError}</InfoNote>:null}
 {(nextPage!==null||loadingMore)?<Button mode="outlined" icon="chevron-down" loading={loadingMore} disabled={loadingMore||nextPage===null} onPress={()=>void loadMore()}>Load more listings</Button>:null}</Section></ParityPage>;
}

function ListingCard({row,onPress}:{row:MarketplacePublicListing;onPress:()=>void}){const image=row.images?.[0]?.derivative_url;return <Card mode="outlined" onPress={onPress} style={{overflow:'hidden'}}>{image?<Image source={{uri:image}} style={{width:'100%',height:170,backgroundColor:'#EEF2FF'}} resizeMode="cover"/>:null}<Card.Content style={{gap:6,paddingTop:12}}><Text variant="titleMedium">{row.title}</Text><Text variant="bodySmall" style={{color:palette.muted}}>{row.summary||row.description}</Text><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Chip compact>{row.category?.name||replaceUnderscore(row.mode)}</Chip><Text variant="titleSmall">{row.mode==='FREE'?'Free':row.mode==='SWAP'?'Swap':money(row.item_amount)}</Text></View></Card.Content></Card>;}


function ListingDetail({listing,loading,error}:{listing:MarketplacePublicListing|null;loading:boolean;error:string}){
 const router=useRouter();const{user}=useAuth();
 const[busy,setBusy]=useState(false),[localError,setLocalError]=useState(''),[message,setMessage]=useState(''),[buyingPharmacy,setBuyingPharmacy]=useState<number|null>(null);
 const[access,setAccess]=useState<import('@chemisttasker/shared-core').MarketplaceAccess|null>(null);
 const[accessLoading,setAccessLoading]=useState(false),[contactOpen,setContactOpen]=useState(false),[submitted,setSubmitted]=useState(false);
 const requestRef=useRef(0),submittingRef=useRef(false),requestIdRef=useRef(idempotencyKey('enquiry'));
 useEffect(()=>{
   const request=++requestRef.current;submittingRef.current=false;setBusy(false);setContactOpen(false);setSubmitted(false);setMessage('');setBuyingPharmacy(null);setAccess(null);setLocalError('');requestIdRef.current=idempotencyKey('enquiry');
   if(!listing||!user)return()=>{requestRef.current+=1;};
   setAccessLoading(true);
   void api.getAccess().then(value=>{if(request===requestRef.current)setAccess(value);}).catch(e=>{if(request===requestRef.current)setLocalError(errorMessage(e,'Trade eligibility could not be checked.'));}).finally(()=>{if(request===requestRef.current)setAccessLoading(false);});
   return()=>{requestRef.current+=1;};
 },[listing?.id,user?.id]);
 const selectedPharmacy=access?.eligible_pharmacies?.find(p=>p.id===buyingPharmacy);
 const canTrade=Boolean(access&&(access.can_trade_personally||access.can_trade_for_pharmacy));
 const enquire=async()=>{
   if(!listing||!canTrade||submittingRef.current)return;
   const validation=enquiryValidation(message);
   if(validation){setLocalError(validation);return;}
   if(buyingPharmacy!=null&&!selectedPharmacy){setLocalError('Choose a pharmacy you are authorized to represent.');return;}
   if(buyingPharmacy==null&&!access?.can_trade_personally){setLocalError('Select an eligible buying pharmacy for this enquiry.');return;}
   const request=requestRef.current;
   submittingRef.current=true;setBusy(true);setLocalError('');
   try{
     const eligibility=await api.getEligibility(listing.id,buyingPharmacy!=null?{pharmacy:buyingPharmacy}:undefined);
     // A user/listing switch invalidates the previous eligibility snapshot before any write.
     if(request!==requestRef.current)return;
     if(!eligibility.can_enquire){
       const blocker=eligibility.blocker;
       const detail=typeof blocker==='string'?blocker:blocker&&typeof blocker==='object'?(blocker as any).message||(blocker as any).detail||(blocker as any).code:null;
       throw new Error(detail||'This account cannot enquire about this listing in the selected buying context.');
     }
     await api.createEnquiry(listing.id,{
       client_request_id:requestIdRef.current,
       buying_pharmacy:buyingPharmacy,
       message:message.trim(),
       terms:{intent:'ENQUIRY'},
     });
     if(request!==requestRef.current)return;
     setSubmitted(true);router.push('/marketplace/exchanges' as any);
   }catch(e){if(request===requestRef.current)setLocalError(errorMessage(e,'Unable to send enquiry.'));}finally{if(request===requestRef.current){submittingRef.current=false;setBusy(false);}}
 };
 return <ParityPage title="Listing detail" subtitle="Approved ordinary goods with verified seller and buyer eligibility." loading={loading} error={error} onRetry={()=>router.replace('/marketplace' as any)}>
  {!listing?<EmptyState title="Listing not found" body="This listing may have been removed or withdrawn." actionLabel="Browse listings" onAction={()=>router.replace('/marketplace' as any)}/>:<>
   {listing.images?.[0]?.derivative_url?<Image source={{uri:listing.images[0].derivative_url}} style={{width:'100%',height:240,borderRadius:16}} resizeMode="cover"/>:null}
   <Section title={listing.title} description={listing.coarse_location}>
     <Text>{listing.description}</Text>
     <MetricGrid items={[{label:'Condition',value:replaceUnderscore(listing.condition)},{label:'Mode',value:replaceUnderscore(listing.mode)},{label:'Amount',value:listing.mode==='FREE'?'Free':listing.mode==='SWAP'?'Swap':money(listing.item_amount)}]}/>
     <DataRow title="Seller" subtitle={listing.seller_role_label}/>
     <DataRow title="Delivery" subtitle={asArray(listing.delivery_options).map(replaceUnderscore).join(', ')||'Seller arrangements'}/>
     <DataRow title="Eligible buyers" subtitle={asArray(listing.permitted_buyer_labels).join(', ')||'Eligibility checked before contact'}/>
   </Section>
   {user==null?<InfoNote title="Sign in to enquire">You can browse approved items without signing in. Sign in with an eligible verified account to contact the seller.</InfoNote>:
     accessLoading?<InfoNote title="Checking eligibility">Checking current marketplace trading permissions.</InfoNote>:
     access&&!canTrade?<View style={{gap:12}}><InfoNote title="Trading access required" tone="warning">{access.blockers.map(b=>b.message||b.detail||b.code).join(' · ')||'Complete account verification and accept applicable marketplace terms to contact a seller.'}</InfoNote><MarketplaceAccessResolution access={access} onUpdated={async()=>{const request=requestRef.current;const refreshed=await api.getAccess();if(request===requestRef.current)setAccess(refreshed);}} /></View>:null}
   {localError?<InfoNote title="Marketplace needs attention" tone="warning">{localError}</InfoNote>:null}
   {contactOpen&&!submitted&&canTrade?<Section title="Enquire with seller" description="No purchase is committed by sending this enquiry.">
     <Field label="Message to seller" value={message} onChangeText={setMessage} multiline placeholder="Ask about condition, pickup or delivery arrangements." disabled={busy}/>
     {access?.eligible_pharmacies?.length?<Section title="Buying context" description="Select a pharmacy only if you are authorized to act on its behalf.">
       <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
         <Chip selected={buyingPharmacy==null} onPress={()=>setBuyingPharmacy(null)} disabled={busy||!access.can_trade_personally}>Personal</Chip>
         {access.eligible_pharmacies.map(pharmacy=><Chip key={pharmacy.id} selected={buyingPharmacy===pharmacy.id} disabled={busy} onPress={()=>setBuyingPharmacy(pharmacy.id)}>{pharmacy.label}</Chip>)}
       </View>
     </Section>:null}
     <ActionButtons>
       <Button mode="outlined" onPress={()=>setContactOpen(false)} disabled={busy}>Cancel</Button>
       <Button mode="contained" loading={busy} disabled={busy||!!enquiryValidation(message)} onPress={()=>void enquire()}>Send gated enquiry</Button>
     </ActionButtons>
   </Section>:null}
   <ActionButtons>
     {!contactOpen&&!submitted?<Button mode="contained" loading={accessLoading} disabled={!user||accessLoading||!canTrade} onPress={()=>{setContactOpen(true);setLocalError('');}}>Check eligibility & enquire</Button>:null}
     <Button mode="outlined" onPress={()=>router.push(('/marketplace/items/'+listing.id+'/report') as any)}>Report listing</Button>
   </ActionButtons>
   {submitted?<InfoNote title="Enquiry sent" tone="success">The seller conversation is available in My exchanges.</InfoNote>:null}
  </>}
 </ParityPage>;
}

function useDraftStep(initial:MarketplaceMobileDraft){
 const{user}=useAuth(),scope=String(user?.id??user?.email??user?.username??'anonymous');
 const[value,setValue]=useState(initial),generation=useRef(0);
 useEffect(()=>setValue(initial),[initial]);
 useEffect(()=>{generation.current++;return()=>{generation.current++;};},[scope]);
 const current=()=>{const captured=generation.current;return()=>captured===generation.current;};
 const patch=async(p:Partial<MarketplaceMobileDraft>,stillCurrent:()=>boolean=current())=>{
  if(!stillCurrent())return value;
  setValue(previous=>({...previous,...p}));
  return patchMarketplaceDraft(scope,p,stillCurrent);
 };
 return{value,patch,scope,current};
}
function SellerStep({draft,options,loading,error,onReload}:{draft:MarketplaceMobileDraft;options:MarketplaceListingOptions|null;loading:boolean;error:string;onReload:()=>Promise<void>}){
 const router=useRouter();const{value,patch}=useDraftStep(draft);
 const pharmacies=asArray<any>(options?.eligible_pharmacies);
 const canSell=Boolean(options&&(options.can_trade_personally||options.can_trade_for_pharmacy));
 const changeContext=(next:string)=>void patch({
   seller_context:next as MarketplaceMobileDraft['seller_context'],
   pharmacy:next==='PERSONAL'?null:value.pharmacy,
   category:null,category_name:'',mode:'SELL',allowed_buyer_roles:[],current_circle:'OWNED_CHAIN',
 });
 return <ParityPage title="Who is selling?" subtitle="Select the authorized personal or pharmacy seller context." loading={loading} error={error} onRetry={onReload}>
  {options&&!canSell?<View style={{gap:12}}>
    <InfoNote title="Trading permission required" tone="warning">{options.blockers.map(blocker=>blocker.message||blocker.detail||blocker.code).join(' · ')||'Complete the current marketplace verification and terms checks before selling.'}</InfoNote>
    <MarketplaceAccessResolution access={options} onUpdated={onReload}/>
  </View>:null}
  {canSell?<><ChoiceChips value={value.seller_context} onChange={changeContext} disabled={loading} options={[
    ...(options?.can_trade_personally?[{value:'PERSONAL',label:'Personal'}]:[]),
    ...(options?.can_trade_for_pharmacy?[{value:'PHARMACY',label:'Pharmacy'}]:[]),
  ]}/>
  {value.seller_context==='PHARMACY'?<Section title="Eligible pharmacies"><View style={{gap:8}}>{pharmacies.map(pharmacy=><Chip key={pharmacy.id} selected={value.pharmacy===pharmacy.id} onPress={()=>void patch({pharmacy:pharmacy.id})}>{pharmacy.label}</Chip>)}</View></Section>:null}
  <Button mode="contained" disabled={!canSell||(value.seller_context==='PERSONAL'&&!options?.can_trade_personally)||(value.seller_context==='PHARMACY'&&(!options?.can_trade_for_pharmacy||!value.pharmacy))} onPress={()=>router.push('/marketplace/new/category' as any)}>Continue</Button></>:null}
 </ParityPage>;
}
function CategoryStep({draft,options,loading,error}:{draft:MarketplaceMobileDraft;options:MarketplaceListingOptions|null;loading:boolean;error:string}){const router=useRouter();const{value,patch}=useDraftStep(draft);const categories=categoriesForSellerContext(options,value.seller_context);const choose=(category:MarketplaceCategory)=>{const modes=permittedModesForCategory(category);const roles=permittedBuyerRolesForCategory(category,value.seller_context);void patch({category:category.id,category_name:category.name,mode:modes.includes(value.mode)?value.mode:modes[0],allowed_buyer_roles:roles,current_circle:'OWNED_CHAIN'});};return <ParityPage title="Choose category" subtitle="Only categories permitted for the selected seller context are shown." loading={loading} error={error}><Section title="Categories">{categories.map(category=><DataRow key={category.id} title={category.name} subtitle={category.description} status={value.category===category.id?'Selected':undefined} onPress={()=>choose(category)}/>)}</Section><Button mode="contained" disabled={!value.category} onPress={()=>router.push('/marketplace/new/details' as any)}>Continue</Button></ParityPage>;}
function DetailsStep({draft,options,loading,error}:{draft:MarketplaceMobileDraft;options:MarketplaceListingOptions|null;loading:boolean;error:string}){
 const router=useRouter();const{value,patch,current}=useDraftStep(draft);const categories=categoriesForSellerContext(options,value.seller_context);const selectedCategory=categories.find(category=>category.id===value.category);const modeOptions=permittedModesForCategory(selectedCategory).map(mode=>({value:mode,label:mode==='SELL'?'Sell':mode==='FREE'?'Free':'Swap'}));
 const[barcode,setBarcode]=useState(''),[lookupMessage,setLookupMessage]=useState(''),[lookupBusy,setLookupBusy]=useState(false);
 const lookup=async()=>{if(!barcode.trim())return;const stillCurrent=current();setLookupBusy(true);setLookupMessage('');try{
   const result=await api.lookupCatalogue({barcode:barcode.trim()});if(!stillCurrent())return;const product=asArray<any>((result as any)?.results)[0];
   if(!product){setLookupMessage('No reviewed ordinary product matched. Continue with manual details.');return;}
   const matchedCategory=categories.find((category:any)=>String(category.slug||'')===String(product.category?.slug||'')||String(category.name||'').toLowerCase()===String(product.category?.name||'').toLowerCase());
   await patch({
     ...(product.name?{title:[product.brand,product.name].filter(Boolean).join(' ').trim()}:{}),
     ...(product.description?{description:product.description}:{}),
     ...(matchedCategory?{category:Number(matchedCategory.id),category_name:matchedCategory.name,mode:permittedModesForCategory(matchedCategory)[0],allowed_buyer_roles:permittedBuyerRolesForCategory(matchedCategory,value.seller_context)}:{}),
   },stillCurrent);
   if(!stillCurrent())return;
   setLookupMessage(matchedCategory?'Reviewed product details and category added.':'Reviewed product details added. Confirm the selected category before continuing.');
 }catch(e){if(stillCurrent())setLookupMessage(errorMessage(e,'Catalogue lookup failed. You can continue manually.'));}finally{if(stillCurrent())setLookupBusy(false);}};
 return <ParityPage title="Item details" subtitle="Describe the item accurately." loading={loading} error={error}>
  <Section title="Catalogue assist" description="Optional. Use a barcode to prefill reviewed ordinary-product details; medicines still belong in Ethical Marketplace.">
   <Field label="Barcode / identifier" value={barcode} onChangeText={setBarcode}/>
   <Button mode="outlined" icon="barcode-scan" loading={lookupBusy} disabled={!barcode.trim()||lookupBusy} onPress={()=>void lookup()}>Look up product</Button>
   {lookupMessage?<InfoNote title="Catalogue">{lookupMessage}</InfoNote>:null}
  </Section>
  <ChoiceChips value={value.mode} onChange={v=>void patch({mode:v as MarketplaceMobileDraft['mode']})} options={modeOptions}/>
  <Field label="Title" value={value.title} onChangeText={v=>void patch({title:v})}/>
  <Field label="Description" value={value.description} multiline onChangeText={v=>void patch({description:v})}/>
  <Field label="Condition" value={value.condition} onChangeText={v=>void patch({condition:v})}/>
  <Field label="Quantity" value={String(value.quantity)} keyboardType="numeric" onChangeText={v=>void patch({quantity:Math.max(1,toNumber(v,1))})}/>
  <Field label="Unit" value={value.unit} onChangeText={v=>void patch({unit:v})}/>
  {value.mode==='SELL'?<Field label="Amount (AUD)" value={value.amount} keyboardType="decimal-pad" onChangeText={v=>void patch({amount:v})}/>:null}
  {value.mode==='SWAP'?<Field label="Desired swap" value={value.desired_swap} onChangeText={v=>void patch({desired_swap:v})}/>:null}
  <Field label="Suburb" value={value.suburb} onChangeText={v=>void patch({suburb:v})}/>
  <Field label="State" value={value.state} onChangeText={v=>void patch({state:v})}/>
  <Field label="Postcode" value={value.postcode} keyboardType="numeric" onChangeText={v=>void patch({postcode:v})}/>
  <Button mode="contained" disabled={!value.title.trim()||!value.description.trim()||!value.suburb.trim()} onPress={()=>router.push('/marketplace/new/photos' as any)}>Continue</Button>
 </ParityPage>;
}
function PhotosStep({draft,loading,error}:{draft:MarketplaceMobileDraft;loading:boolean;error:string}){
 const router=useRouter();const{value,patch,scope,current}=useDraftStep(draft);const[removing,setRemoving]=useState(false),[removeError,setRemoveError]=useState('');const removingRef=useRef(false);
 const add=async()=>{const stillCurrent=current();const r=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:true,quality:.85});if(stillCurrent()&&!r.canceled)await patch({image_uris:[...value.image_uris,...r.assets.map(a=>a.uri)].slice(0,6)},stillCurrent);};
 const remove=async(uri:string,i:number)=>{if(removingRef.current)return;const stillCurrent=current();removingRef.current=true;setRemoving(true);setRemoveError('');try{
  const saved=await loadSettledMarketplaceDraft(scope);if(!stillCurrent())return;
  if(saved.uploaded_image_uris.includes(uri)){const id=saved.uploaded_image_ids?.[uri];if(id==null)throw new Error('This uploaded photo cannot be removed here.');await api.deleteImage(id);if(!stillCurrent())return;}
  const ids={...saved.uploaded_image_ids};delete ids[uri];await patch({image_uris:value.image_uris.filter((_,x)=>x!==i),uploaded_image_uris:saved.uploaded_image_uris.filter(x=>x!==uri),uploaded_image_ids:ids},stillCurrent);
 }catch(e){if(stillCurrent())setRemoveError(errorMessage(e,'Unable to remove photo.'));}finally{removingRef.current=false;if(stillCurrent())setRemoving(false);}};
 return <ParityPage title="Photos" subtitle="Add clear photos of the actual item." loading={loading} error={error||removeError}><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{value.image_uris.map((uri,i)=><Card key={uri+i} style={{width:'47%',overflow:'hidden'}}><Image source={{uri}} style={{width:'100%',height:130}}/><Card.Actions><Button disabled={removing} onPress={()=>void remove(uri,i)}>Remove</Button></Card.Actions></Card>)}</View><Button disabled={removing} mode="outlined" icon="image-plus" onPress={()=>void add()}>Add photos</Button><Button disabled={removing} mode="contained" onPress={()=>router.push('/marketplace/new/audience' as any)}>Continue</Button></ParityPage>;
}
function AudienceStep({draft,options,loading,error}:{draft:MarketplaceMobileDraft;options:MarketplaceListingOptions|null;loading:boolean;error:string}){
 const router=useRouter();const{value,patch}=useDraftStep(draft);const categories=categoriesForSellerContext(options,value.seller_context);const category=categories.find(row=>row.id===value.category);const allowedRoles=permittedBuyerRolesForCategory(category,value.seller_context);const toggle=(role:string)=>{if(!allowedRoles.includes(role)||value.seller_context==='PHARMACY')return;void patch({allowed_buyer_roles:value.allowed_buyer_roles.includes(role)?value.allowed_buyer_roles.filter(x=>x!==role):[...value.allowed_buyer_roles,role]});};
 const circles=[{value:'OWNED_CHAIN',label:'Owned pharmacies'},{value:'ORGANISATION',label:'Organisation'},{value:'PLATFORM',label:'Platform owners'}];const setMaximum=(next:string)=>void patch({maximum_circle:clampMaximumAudience(next)});
 const postage=value.delivery_method!=='PICKUP';
 return <ParityPage title="Audience & delivery" subtitle="Buyer eligibility comes from the selected category policy." loading={loading} error={error}>
  <Section title="Buyer roles" description={value.seller_context==='PHARMACY'?'Ordinary pharmacy assets are owner-to-owner in the current marketplace policy.':'Choose from the maximum buyer roles allowed by this category.'}><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{allowedRoles.map(role=><Chip key={role} selected={value.allowed_buyer_roles.includes(role)} disabled={value.seller_context==='PHARMACY'} onPress={()=>toggle(role)}>{replaceUnderscore(role)}</Chip>)}</View></Section>
  {value.seller_context==='PHARMACY'?<Section title="Pharmacy audience escalation"><InfoNote title="Initial audience">Every pharmacy listing starts inside Owned pharmacies. Wider audiences are only reached through the controlled escalation workflow.</InfoNote><ChoiceChips value={value.maximum_circle} onChange={setMaximum} options={circles}/></Section>:null}
  <Section title="Delivery"><ChoiceChips value={value.delivery_method} onChange={v=>void patch({delivery_method:v as any,...(v==='PICKUP'?{postage_payer:'',postage_organiser:'',known_cost:'',quote_required:false}:{})})} options={[{value:'PICKUP',label:'Pickup'},{value:'POSTAGE',label:'Postage'},{value:'BOTH',label:'Both'}]}/>{postage?<><Text variant="labelMedium">Who pays postage?</Text><ChoiceChips value={value.postage_payer} onChange={v=>void patch({postage_payer:v as any})} options={[{value:'BUYER',label:'Buyer'},{value:'SELLER',label:'Seller'}]}/><Text variant="labelMedium">Who organises postage?</Text><ChoiceChips value={value.postage_organiser} onChange={v=>void patch({postage_organiser:v as any})} options={[{value:'BUYER',label:'Buyer'},{value:'SELLER',label:'Seller'}]}/><Field label="Known postage cost (optional)" value={value.known_cost} keyboardType="decimal-pad" onChangeText={v=>void patch({known_cost:v})}/><Chip selected={value.quote_required} onPress={()=>void patch({quote_required:!value.quote_required})}>Quote required before agreement</Chip></>:null}<Field label="Private pickup details" value={value.private_pickup_details} multiline onChangeText={v=>void patch({private_pickup_details:v})}/></Section>
  <Button mode="contained" disabled={!value.allowed_buyer_roles.length||(postage&&(!value.postage_payer||!value.postage_organiser))} onPress={()=>router.push('/marketplace/new/review' as any)}>Review</Button>
 </ParityPage>;
}
const dropCopy=(file?:string)=>{if(file){const copy=new File(file);if(copy.exists)copy.delete();}};
const CONFLICT='This listing changed on another device or screen. We reloaded it and kept your edits: review them and submit again.';
function ReviewStep({draft,loading,error}:{draft:MarketplaceMobileDraft;loading:boolean;error:string}){
 const router=useRouter();
 const {user}=useAuth();
 const scope=String(user?.id??user?.email??user?.username??'anonymous');
 const [busy,setBusy]=useState(false),[localError,setLocalError]=useState(''),[blocked,setBlocked]=useState<''|'unreadable'|'terminal'>('');
 const submittingRef=useRef(false),scopeRef=useRef(scope),submissionGeneration=useRef(0);
 scopeRef.current=scope;
 useEffect(()=>{
   submissionGeneration.current+=1;
   submittingRef.current=false;
   setBusy(false);
   setLocalError('');
   setBlocked('');
   // The parent keys this content by account, so a previous ReviewStep can
   // remain in an async closure after unmount. Invalidate it at cleanup.
   return()=>{submissionGeneration.current+=1;submittingRef.current=false;};
 },[scope]);

 const complete=async(submitForReview:boolean)=>{
   if(submittingRef.current)return; // synchronous double-tap mutex
   submittingRef.current=true;
   const targetScope=scope,attempt=++submissionGeneration.current;
   const current=()=>scopeRef.current===targetScope&&submissionGeneration.current===attempt;
   setBusy(true);setLocalError('');setBlocked('');
   try{
     // Draft props can predate queued field edits and server receipts (a
     // partial earlier attempt), so the payload is built from the settled
     // saved draft of this account; receipts keep the create/upload de-dup.
     const [saved,storedIntent]=await Promise.all([loadSettledMarketplaceDraft(targetScope),loadMarketplaceIntent(targetScope).catch(()=>undefined)]);
     if(!current())return;
     // A corrupt or unreadable intent blocks this draft until it is read again or cleared after review (D104).
     if(storedIntent===undefined){setBlocked('unreadable');setLocalError(UNREADABLE_INTENT);return;}
     const progress:MarketplaceMobileDraft={
       ...saved,
       created_listing_id:saved.created_listing_id||draft.created_listing_id,
       created_listing_version:saved.created_listing_version??draft.created_listing_version,
       uploaded_image_uris:Array.from(new Set([
         ...(draft.uploaded_image_uris||[]),...(saved.uploaded_image_uris||[]),
       ])),
     };
     const body:any={
       client_request_id:progress.create_request_id,
       seller_context:progress.seller_context,pharmacy:progress.pharmacy,
       category:progress.category,mode:progress.mode,title:progress.title,
       description:progress.description,condition:progress.condition,
       quantity:progress.quantity,unit:progress.unit,
       amount:progress.mode==='SELL'?progress.amount:'0',
       desired_swap:progress.desired_swap,suburb:progress.suburb,
       state:progress.state,postcode:progress.postcode,
       private_pickup_details:progress.private_pickup_details,
       allowed_buyer_roles:progress.allowed_buyer_roles,
       delivery:{
         method:progress.delivery_method,
         postage_payer:progress.postage_payer||undefined,
         postage_organiser:progress.postage_organiser||undefined,
         known_cost:progress.known_cost||null,
         quote_required:progress.quote_required,
       },
     };
     let listingId=progress.created_listing_id;
     let expectedVersion=progress.created_listing_version;
     let uploaded=[...progress.uploaded_image_uris];
     let imageIds={...saved.uploaded_image_ids,...draft.uploaded_image_ids};
     // What this attempt sends; an intent frozen from another snapshot means the draft was edited since.
     const snapshot=JSON.stringify({body,maximum_circle:progress.maximum_circle,image_uris:progress.image_uris});
     const run=(intent:MarketplacePendingIntent,image?:Blob):Promise<any>=>{
       if(intent.operation==='create')return api.createListing(intent.body);
       if(intent.operation==='update')return api.updateListing(intent.id!,intent.body,intent.key);
       if(intent.operation==='audience')return api.updateAudience(intent.id!,intent.body,intent.key);
       if(intent.operation==='submit')return api.actOnListing(intent.id!,'submit',intent.version!,intent.key);
       const data=new FormData();
       // A replay reads the durable app copy: the picker's temporary file may be gone.
       data.append('image',(image??{uri:intent.file,name:intent.name,type:'image/jpeg'}) as any,intent.name);
       return api.uploadImage(intent.id!,data,intent.key);
     };
     // Each mutation is frozen (own key, exact request) for this account and durable before it leaves.
     const freeze=(intent:MarketplacePendingIntent)=>{
       const frozen=saveMarketplaceIntent(targetScope,intent);
       frozen.catch(()=>undefined); // a failed write still rejects where it is awaited
       return frozen;
     };
     // Terminal (409 mismatch, 410, listing missing): kept with its photo copy until the user discards it.
     const terminal=async(intent:MarketplacePendingIntent,code:string):Promise<never>=>{
       const reset=intent.operation==='create'||code==='LISTING_DELETED'||code==='LISTING_MISSING';
       const message=!reset?'This saved change can no longer be applied on the server. Check My listings, then discard the saved change.'
         :code==='IDEMPOTENCY_PAYLOAD_MISMATCH'?'This listing was already saved with different details. Check My listings, then discard the saved change to save this draft as a new listing.'
         :'This listing no longer exists. Discard the saved change to save this draft as a new listing.';
       await patchMarketplaceDraft(targetScope,{terminal_intent:{key:intent.key,message,reset}});
       if(current())setBlocked('terminal');
       throw new Error(message);
     };
     // A version conflict: reload the version, keep the user's edits; the next submit sends them with new keys.
     const conflict=async(intent:MarketplacePendingIntent,row:MarketplaceDashboardListing):Promise<never>=>{
       await patchMarketplaceDraft(targetScope,{created_listing_version:Number(row.version),settled_intent:intent.key});
       await releaseMarketplaceIntent(targetScope);
       throw new Error(CONFLICT);
     };
     // `frozen` is null for a replay: that intent is already stored. Network/5xx failures keep it for a same-key resend.
     const send=async(intent:MarketplacePendingIntent,frozen:Promise<void>|null,image?:Blob)=>{
       if(frozen){await frozen;if(!current())return false;}
       let result:any;
       try{result=await run(intent,image);}
       catch(e:any){
         const status=Number(e?.status??e?.response?.status),code=String((e?.payload??e?.response?.data??e?.data)?.code??'');
         if(status===409&&code==='STALE_VERSION'&&intent.id){
           await releaseMarketplaceIntent(targetScope); // refused: nothing committed
           const row=asArray<MarketplaceDashboardListing>(await api.getDashboard()).find(item=>String(item.id)===intent.id);
           if(row)return conflict(intent,row);
         }
         if(status===410||(status===409&&code==='IDEMPOTENCY_PAYLOAD_MISMATCH'))return terminal(intent,code);
         else if(status>=400&&status<500){await releaseMarketplaceIntent(targetScope);dropCopy(intent.file);} // refused: nothing committed
         throw e;
       }
       if(!current())return false;
       if(intent.operation==='submit')return true; // completion clears the draft and its intent together
       // The outcome and the settled key are one draft write, so a crash cannot record one without the other.
       const patch:Partial<MarketplaceMobileDraft>={settled_intent:intent.key};
       if(intent.operation==='create'){listingId=String(result.id);patch.created_listing_id=listingId;}
       if(intent.operation==='upload'){
         uploaded=[...uploaded,intent.uri!];imageIds={...imageIds,[intent.uri!]:result.id};
         patch.uploaded_image_uris=uploaded;patch.uploaded_image_ids=imageIds;
       }else{expectedVersion=result.version;patch.created_listing_version=expectedVersion;}
       if(intent.operation==='audience')patch.current_circle='OWNED_CHAIN';
       await patchMarketplaceDraft(targetScope,patch);
       void releaseMarketplaceIntent(targetScope).catch(()=>undefined); // queued ahead of the next freeze on the same lock
       dropCopy(intent.file);
       return current();
     };

     const pending=pendingMarketplaceIntent(storedIntent,saved);
     if(storedIntent&&!pending)await releaseMarketplaceIntent(targetScope); // reconciled already, or its draft was cleared
     if(pending&&saved.terminal_intent?.key===pending.key){setBlocked('terminal');throw new Error(saved.terminal_intent.message);}
     const unchanged=pending?.snapshot===snapshot;
     let skipSave=false,skipAudience=false;
     if(pending?.operation==='submit'){
       // Orchestrator D125: read the listing back before resending a submit whose outcome is unknown.
       const rows=await api.getDashboard();
       if(!current())return;
       const row=asArray<MarketplaceDashboardListing>(rows).find(item=>String(item.id)===pending.id);
       if(!row)return await terminal(pending,'LISTING_MISSING');
       const submitted=!['DRAFT','REJECTED'].includes(String(row.publication_status).toUpperCase());
       if(!submitted&&Number(row.version)!==Number(pending.version))return await conflict(pending,row);
       if(submitted||unchanged){
         // An unchanged draft resends only the submit: an update first would move the version under its key.
         if(!submitted&&!await send(pending,null))return;
         await clearMarketplaceDraft(targetScope);
         if(current())router.replace('/marketplace/mine' as any);
         return;
       }
       await releaseMarketplaceIntent(targetScope); // edited since: save and submit afresh below
       if(!current())return;
     }else if(pending){
       // Resend the frozen intent with its key first; later edits go out after it is reconciled.
       if(!await send(pending,null))return;
       // An upload replay keeps the existing retry path (save the draft, then the rest).
       skipSave=unchanged&&pending.operation!=='upload';
       skipAudience=unchanged&&pending.operation==='audience';
     }
     if(!skipSave){
       if(listingId&&expectedVersion!=null){
         const update:MarketplacePendingIntent={operation:'update',key:idempotencyKey(),draft:progress.create_request_id,
           snapshot,id:listingId,body:{...body,expected_version:expectedVersion}};
         if(!await send(update,freeze(update)))return;
       }else{
         const create:MarketplacePendingIntent={operation:'create',key:body.client_request_id,draft:progress.create_request_id,snapshot,body};
         if(!await send(create,freeze(create)))return;
       }
     }

     if(progress.seller_context==='PHARMACY'&&!skipAudience){
       const audience:MarketplacePendingIntent={operation:'audience',key:idempotencyKey(),draft:progress.create_request_id,
         snapshot,id:listingId!,body:{
           expected_version:Number(expectedVersion),current_circle:'OWNED_CHAIN',
           maximum_circle:clampMaximumAudience(progress.maximum_circle),
         }};
       if(!await send(audience,freeze(audience)))return;
     }

     for(const uri of progress.image_uris){
       if(uploaded.includes(uri))continue;
       if(!current())return;
       const response=await fetch(uri);
       if(!current())return; // Account may switch during the local URI read.
       // Durable copy and frozen intent first: a lost response is replayed after the picker's file is gone.
       const name='listing-'+idempotencyKey()+'.jpg';
       const copy=new File(Paths.document,name);
       new File(uri).copy(copy);
       const upload:MarketplacePendingIntent={operation:'upload',key:idempotencyKey(),draft:progress.create_request_id,
         snapshot,id:listingId!,uri,file:copy.uri,name};
       const frozen=freeze(upload); // written while the blob is read; awaited before the upload leaves
       const blob=await response.blob();
       if(!current())return; // Blob conversion is a second asynchronous boundary.
       if(!await send(upload,frozen,blob))return;
     }
     if(!current())return;
     if(submitForReview){
       const submit:MarketplacePendingIntent={operation:'submit',key:idempotencyKey(),draft:progress.create_request_id,
         snapshot,id:listingId!,version:Number(expectedVersion)};
       if(!await send(submit,freeze(submit)))return;
     }
     // Clear only the original account's completed draft, never a new login's.
     await clearMarketplaceDraft(targetScope);
     if(current())router.replace('/marketplace/mine' as any);
   }catch(e){
     if(current())setLocalError(errorMessage(e,submitForReview
       ?'Unable to submit listing. Your existing draft will be resumed on retry.'
       :'Unable to save listing draft. Your existing draft will be resumed on retry.'));
   }finally{
     if(current()){submittingRef.current=false;setBusy(false);}
   }
 };
 // The user reviewed the blocked change: clear an unreadable record (D104), or discard a terminal one.
 const resolveBlocked=async()=>{
   if(submittingRef.current)return;
   submittingRef.current=true;
   const targetScope=scope,attempt=++submissionGeneration.current;
   const current=()=>scopeRef.current===targetScope&&submissionGeneration.current===attempt;
   setBusy(true);setLocalError('');
   try{
     if(blocked==='unreadable')await recoverMarketplaceIntent(targetScope);
     else{
       const [saved,intent]=await Promise.all([loadSettledMarketplaceDraft(targetScope),loadMarketplaceIntent(targetScope)]);
       const ended=saved.terminal_intent;
       if(ended&&intent?.key===ended.key){dropCopy(intent.file);await releaseMarketplaceIntent(targetScope);}
       await patchMarketplaceDraft(targetScope,{terminal_intent:null,...(ended?.reset?{created_listing_id:null,created_listing_version:null,
         uploaded_image_uris:[],uploaded_image_ids:{},create_request_id:idempotencyKey('marketplace-listing')}:{})});
     }
     if(current())setBlocked('');
   }catch(e){if(current())setLocalError(errorMessage(e,'Unable to clear the saved change. Please retry.'));}
   finally{if(current()){submittingRef.current=false;setBusy(false);}}
 };
 const postage=draft.delivery_method!=='PICKUP';
 const disabled=busy||!draft.category||!draft.title||
   (postage&&(!draft.postage_payer||!draft.postage_organiser));
 return <ParityPage title="Review listing" subtitle="Confirm seller, item, audience and delivery details."
   loading={loading} error={error||localError}>
   <Section title={draft.title||'Untitled listing'} description={draft.category_name}>
     <DataRow title="Seller" subtitle={draft.seller_context==='PHARMACY'?'Pharmacy #'+draft.pharmacy:'Personal'}/>
     <DataRow title="Mode" subtitle={draft.mode==='SELL'?money(draft.amount):replaceUnderscore(draft.mode)}/>
     <DataRow title="Location" subtitle={draft.suburb+', '+draft.state+' '+draft.postcode}/>
     <DataRow title="Buyer roles" subtitle={draft.allowed_buyer_roles.map(replaceUnderscore).join(', ')}/>
     {draft.seller_context==='PHARMACY'?<DataRow title="Audience" subtitle={'Owned pharmacies → '+replaceUnderscore(draft.maximum_circle)}/>:null}
     <DataRow title="Delivery" subtitle={replaceUnderscore(draft.delivery_method)+(postage?' · '+replaceUnderscore(draft.postage_payer)+' pays · '+replaceUnderscore(draft.postage_organiser)+' organises':'')}/>
     <DataRow title="Photos" subtitle={draft.image_uris.length+' selected'}/>
   </Section>
   <InfoNote title="Marketplace policy">Medicines are excluded from the ordinary Marketplace. Use Ethical Marketplace for eligible medicine exchange workflows.</InfoNote>
   <InfoNote title="Draft or review">A private draft stays unpublished until you explicitly submit it for review.</InfoNote>
   <ActionButtons>
     <Button mode="outlined" loading={busy} disabled={disabled} onPress={()=>void complete(false)}>Save private draft</Button>
     <Button mode="contained" loading={busy} disabled={disabled} onPress={()=>void complete(true)}>Submit for review</Button>
   </ActionButtons>
   {blocked?<Button mode="text" disabled={busy} onPress={()=>void resolveBlocked()}>{blocked==='unreadable'?'Clear unreadable saved change':'Discard saved change'}</Button>:null}
 </ParityPage>;
}
function MyListingDetail({row,loading,error,onReload}:{row:MarketplaceDashboardListing|undefined;loading:boolean;error:string;onReload:()=>Promise<void>}){
 const actionBusyRef=useRef(false);
 const[busy,setBusy]=useState(false),[localError,setLocalError]=useState(''),[scheduleAt,setScheduleAt]=useState<Date|undefined>(undefined),[timeOpen,setTimeOpen]=useState(false);
 const labels:Record<string,string>={OWNED_CHAIN:'Owned pharmacies',ORGANISATION:'Organisation',PLATFORM:'Platform owners'};
 const act=async(action:'submit'|'withdraw')=>{if(!row||actionBusyRef.current)return;actionBusyRef.current=true;setBusy(true);setLocalError('');try{await api.actOnListing(row.id,action,row.version);await onReload();}catch(e){setLocalError(errorMessage(e));}finally{actionBusyRef.current=false;setBusy(false);}};
 const currentCircle=row?.current_circle||'OWNED_CHAIN';
 const next=nextMarketplaceAudience(currentCircle,row?.maximum_circle);
 const widen=async(schedule=false)=>{if(!row||!next||actionBusyRef.current)return;actionBusyRef.current=true;setBusy(true);setLocalError('');try{
   if(schedule&&!scheduleAt){setLocalError('Choose a future date and time before scheduling audience widening.');return;}
   if(schedule&&scheduleAt&&scheduleAt.getTime()<=Date.now()){setLocalError('Scheduled widening must be in the future.');return;}
   await api.updateAudience(row.id,{expected_version:row.version,current_circle:schedule?currentCircle:next,maximum_circle:row.maximum_circle||'PLATFORM',...(schedule&&scheduleAt?{schedule:[{target_circle:next,due_at:scheduleAt.toISOString()}]}:{})});
   setScheduleAt(undefined);await onReload();
 }catch(e){setLocalError(errorMessage(e,'Unable to update listing audience.'));}finally{actionBusyRef.current=false;setBusy(false);}};
 return <ParityPage title="Manage listing" subtitle="Publication, availability and audience state." loading={loading} error={error} onRetry={onReload}>
  {!row?<EmptyState title="Listing not found" body="The listing is unavailable."/>:<>
   {localError?<InfoNote title="Listing action could not be completed" tone="warning">{localError}</InfoNote>:null}
   <MetricGrid items={[{label:'Publication',value:replaceUnderscore(row.publication_status)},{label:'Availability',value:replaceUnderscore(row.availability_status)},{label:'Audience',value:replaceUnderscore(row.current_circle||'PRIVATE')}]}/>
   <DataRow title={row.title} subtitle={row.category?.name||'Marketplace listing'}/>
   <ActionButtons>
    {['DRAFT','REJECTED'].includes(String(row.publication_status||'').toUpperCase())?<Button mode="contained" loading={busy} onPress={()=>void act('submit')}>Submit for review</Button>:null}
    {['PUBLISHED','PENDING_REVIEW'].includes(String(row.publication_status||'').toUpperCase())?<Button mode="outlined" disabled={busy} onPress={()=>void act('withdraw')}>Withdraw</Button>:null}
   </ActionButtons>
   {String(row.seller_context||'').toUpperCase()==='PHARMACY'&&String(row.publication_status||'').toUpperCase()==='PUBLISHED'&&next?<Section title="Audience widening" description={`Current: ${labels[currentCircle]||replaceUnderscore(currentCircle)} · Maximum: ${labels[row.maximum_circle||'PLATFORM']}`}>
    <InfoNote title="Next permitted circle">{labels[next]}</InfoNote>
    <Button mode="contained-tonal" disabled={busy} onPress={()=>void widen(false)}>Widen now to {labels[next]}</Button>
    <DatePickerInput
      locale="en-AU"
      label="Schedule widening date"
      value={scheduleAt}
      onChange={(date)=>{if(!date)return setScheduleAt(undefined);const nextDate=new Date(date);nextDate.setHours(scheduleAt?.getHours()??9,scheduleAt?.getMinutes()??0,0,0);setScheduleAt(nextDate);}}
      inputMode="start"
      disabled={busy}
    />
    <Button mode="outlined" icon="clock-outline" disabled={busy||!scheduleAt} onPress={()=>setTimeOpen(true)}>
      {scheduleAt?`Widen at ${scheduleAt.toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit'})}`:'Choose date first'}
    </Button>
    <TimePickerModal
      visible={timeOpen}
      onDismiss={()=>setTimeOpen(false)}
      onConfirm={({hours,minutes})=>{if(scheduleAt){const nextDate=new Date(scheduleAt);nextDate.setHours(hours,minutes,0,0);setScheduleAt(nextDate);}setTimeOpen(false);}}
      hours={scheduleAt?.getHours()??9}
      minutes={scheduleAt?.getMinutes()??0}
      label="Select widening time"
      locale="en"
    />
    <Button mode="outlined" disabled={busy||!scheduleAt} onPress={()=>void widen(true)}>Schedule widening</Button>
   </Section>:null}
  </>}
 </ParityPage>;
}
function ExchangeDetail({row,loading,error,onReload}:{row:MarketplaceExchange|null;loading:boolean;error:string;onReload:()=>Promise<void>}){const[message,setMessage]=useState(''),[messages,setMessages]=useState<any[]>([]),[busy,setBusy]=useState(false),[localError,setLocalError]=useState('');useEffect(()=>{if(row?.id)api.listExchangeMessages(row.id).then(x=>setMessages(asArray(x))).catch(()=>null);},[row?.id]);const send=async()=>{if(!row||!message.trim())return;setBusy(true);try{await api.sendExchangeMessage(row.id,message.trim());setMessage('');setMessages(asArray(await api.listExchangeMessages(row.id)));}catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}};const act=async(action:string)=>{if(!row)return;setBusy(true);try{await api.actOnExchange(row.id,action,{expected_version:row.version});await onReload();}catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}};return <ParityPage title="Exchange detail" subtitle="Negotiation, messages and state transitions." loading={loading} error={error||localError}>{!row?<EmptyState title="Exchange not found" body="The exchange is unavailable."/>:<><MetricGrid items={[{label:'State',value:replaceUnderscore(row.state)},{label:'Quantity',value:row.quantity||'—'},{label:'Version',value:row.version}]}/><Section title={row.listing_title||'Marketplace exchange'}>{messages.map(m=><DataRow key={m.id} title={m.author_label||'Member'} subtitle={m.body}/>)}</Section><Field label="Message" value={message} multiline onChangeText={setMessage}/><Button mode="outlined" loading={busy} disabled={!message.trim()||busy} onPress={()=>void send()}>Send message</Button><ActionButtons>{asArray<string>(row.allowed_actions).map(action=><Button key={action} mode="contained-tonal" disabled={busy} onPress={()=>void act(action)}>{replaceUnderscore(action)}</Button>)}</ActionButtons></>}</ParityPage>;}
function ReportListing({listing,loading,error}:{listing:MarketplacePublicListing|null;loading:boolean;error:string}){const router=useRouter();const[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[localError,setLocalError]=useState(''),[reference,setReference]=useState('');const submit=async()=>{if(!listing)return;setBusy(true);try{const r=await api.reportListing(listing.id,reason.trim());setReference(r.reference);}catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}};return <ParityPage title="Report listing" subtitle="Send a Marketplace policy or safety report." loading={loading} error={error||localError}>{reference?<><InfoNote title="Report submitted" tone="success">Reference {reference}</InfoNote><Button onPress={()=>router.back()}>Return to listing</Button></>:<><DataRow title={listing?.title||'Listing'} subtitle={listing?.coarse_location}/><Field label="Reason" value={reason} multiline onChangeText={setReason}/><Button mode="contained" loading={busy} disabled={!reason.trim()||busy} onPress={()=>void submit()}>Submit report</Button></>}</ParityPage>;}
