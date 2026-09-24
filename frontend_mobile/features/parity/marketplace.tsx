import React,{useCallback,useEffect,useState}from'react';
import{Image,View}from'react-native';
import{Button,Card,Chip,IconButton,Searchbar,Text}from'react-native-paper';
import{useLocalSearchParams,useRouter}from'expo-router';
import*as ImagePicker from'expo-image-picker';
import{chemistTaskerApi}from'@/config/api';
import{ActionButtons,ChoiceChips,DataRow,EmptyState,Field,InfoNote,MetricGrid,ParityPage,Section,palette}from'./ParityUI';
import{asArray,dateLabel,errorMessage,idempotencyKey,money,replaceUnderscore,toNumber}from'./utils';
import{clearMarketplaceDraft,emptyMarketplaceDraft,loadMarketplaceDraft,patchMarketplaceDraft,type MarketplaceMobileDraft}from'./marketplaceDraft';

type MarketplaceScreen='browse'|'filters'|'item'|'seller'|'category'|'details'|'photos'|'audience'|'review'|'mine'|'mine-detail'|'exchanges'|'exchange-detail'|'report';
const api=chemistTaskerApi.marketplace;

export function MarketplaceParityScreen({screen}:{screen:MarketplaceScreen}){
 const router=useRouter();const params=useLocalSearchParams<{id?:string}>();const id=String(params.id||'');
 const[listings,setListings]=useState<any[]>([]),[listing,setListing]=useState<any>(null),[categories,setCategories]=useState<any[]>([]),[options,setOptions]=useState<any>(null),[mine,setMine]=useState<any[]>([]),[exchanges,setExchanges]=useState<any[]>([]),[exchange,setExchange]=useState<any>(null);
 const[draft,setDraft]=useState<MarketplaceMobileDraft>(emptyMarketplaceDraft()),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState('');
 const load=useCallback(async()=>{setError('');try{
   if(screen==='browse'||screen==='filters'){const[page,cats]=await Promise.all([api.listListings(query?{search:query}:undefined),api.listCategories()]);setListings(asArray((page as any)?.results??page));setCategories(asArray(cats));}
   if(screen==='item'||screen==='report')setListing(await api.getListing(id));
   if(['seller','category','details','photos','audience','review'].includes(screen)){const[d,o]=await Promise.all([loadMarketplaceDraft(),api.getListingOptions()]);setDraft(d);setOptions(o);const all=[...(o?.personal_categories||[]),...(o?.pharmacy_categories||[])];setCategories(all.filter((r:any,i:number,a:any[])=>a.findIndex(x=>x.id===r.id)===i));}
   if(screen==='mine'||screen==='mine-detail')setMine(asArray(await api.getDashboard()));
   if(screen==='exchanges'||screen==='exchange-detail'){setExchanges(asArray(await api.listExchanges()));if(screen==='exchange-detail'&&id)setExchange(await api.getExchange(id));}
 }catch(e){setError(errorMessage(e,'Unable to load Marketplace.'));}finally{setLoading(false);setRefreshing(false);}},[screen,id,query]);
 useEffect(()=>{void load();},[load]);

 if(screen==='seller')return <SellerStep draft={draft} options={options} loading={loading} error={error}/>;
 if(screen==='category')return <CategoryStep draft={draft} categories={categories} loading={loading} error={error}/>;
 if(screen==='details')return <DetailsStep draft={draft} categories={categories} loading={loading} error={error}/>;
 if(screen==='photos')return <PhotosStep draft={draft} loading={loading} error={error}/>;
 if(screen==='audience')return <AudienceStep draft={draft} loading={loading} error={error}/>;
 if(screen==='review')return <ReviewStep draft={draft} loading={loading} error={error}/>;
 if(screen==='item')return <ListingDetail listing={listing} loading={loading} error={error}/>;
 if(screen==='report')return <ReportListing listing={listing} loading={loading} error={error}/>;
 if(screen==='mine-detail')return <MyListingDetail row={mine.find(x=>String(x.id)===id)} loading={loading} error={error} onReload={load}/>;
 if(screen==='exchange-detail')return <ExchangeDetail row={exchange} loading={loading} error={error} onReload={load}/>;
 if(screen==='filters')return <ParityPage title="Marketplace filters" subtitle="Search the live catalogue." loading={loading} error={error}><Searchbar value={query} onChangeText={setQuery} onSubmitEditing={()=>void load()} placeholder="Search Marketplace"/><Section title="Categories"><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{categories.map(c=><Chip key={c.id} onPress={()=>setQuery(c.name)}>{c.name}</Chip>)}</View></Section><Button mode="contained" onPress={()=>router.replace('/marketplace' as any)}>Show results</Button></ParityPage>;
 if(screen==='mine')return <ParityPage title="My Marketplace listings" subtitle="Manage publication and audience escalation." loading={loading} error={error} onRetry={load} right={<IconButton icon="plus" onPress={()=>router.push('/marketplace/new/seller' as any)}/>}><Section title="Listings">{mine.length?mine.map(row=><DataRow key={row.id} title={row.title} subtitle={(row.category?.name||'Marketplace')+' · '+(row.current_circle||'Private')+' · updated '+dateLabel(row.updated_at)} status={replaceUnderscore(row.publication_status)+' / '+replaceUnderscore(row.availability_status)} onPress={()=>router.push(('/marketplace/mine/'+row.id) as any)}/>):<EmptyState title="No listings yet" body="Create your first Marketplace listing." actionLabel="Add item" onAction={()=>router.push('/marketplace/new/seller' as any)}/>}</Section></ParityPage>;
 if(screen==='exchanges')return <ParityPage title="My exchanges" subtitle="Enquiries, agreed terms and transfer state." loading={loading} error={error} onRetry={load}><Section title="Exchanges">{exchanges.length?exchanges.map(row=><DataRow key={row.id} title={row.listing_title||'Marketplace exchange'} subtitle={replaceUnderscore(row.state)+' · updated '+dateLabel(row.updated_at)} status={replaceUnderscore(row.state)} onPress={()=>router.push(('/marketplace/exchanges/'+row.id) as any)}/>):<EmptyState title="No exchanges" body="Marketplace enquiries and agreed exchanges will appear here."/>}</Section></ParityPage>;
 return <ParityPage title="Marketplace" subtitle="Tools, books, fixtures, workwear and approved non-medicine goods." loading={loading} error={error} onRetry={load} onRefresh={()=>{setRefreshing(true);void load();}} refreshing={refreshing} right={<IconButton icon="plus" onPress={()=>router.push('/marketplace/new/seller' as any)}/>}><Searchbar value={query} onChangeText={setQuery} onSubmitEditing={()=>void load()} placeholder="Search listings"/><ActionButtons><Button mode="outlined" icon="filter-variant" onPress={()=>router.push('/marketplace/filters' as any)}>Filters</Button><Button mode="outlined" onPress={()=>router.push('/marketplace/mine' as any)}>My listings</Button><Button mode="outlined" onPress={()=>router.push('/marketplace/exchanges' as any)}>Exchanges</Button></ActionButtons><Section title="Latest listings">{listings.length?listings.map(row=><ListingCard key={row.id} row={row} onPress={()=>router.push(('/marketplace/items/'+row.id) as any)}/>):<EmptyState title="No listings found" body="Try a different search or category."/>}</Section></ParityPage>;
}

function ListingCard({row,onPress}:{row:any;onPress:()=>void}){const image=row.images?.[0]?.derivative_url;return <Card mode="outlined" onPress={onPress} style={{overflow:'hidden'}}>{image?<Image source={{uri:image}} style={{width:'100%',height:170,backgroundColor:'#EEF2FF'}} resizeMode="cover"/>:null}<Card.Content style={{gap:6,paddingTop:12}}><Text variant="titleMedium">{row.title}</Text><Text variant="bodySmall" style={{color:palette.muted}}>{row.summary||row.description}</Text><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Chip compact>{row.category?.name||replaceUnderscore(row.mode)}</Chip><Text variant="titleSmall">{row.mode==='FREE'?'Free':row.mode==='SWAP'?'Swap':money(row.item_amount||row.amount)}</Text></View></Card.Content></Card>;}

function ListingDetail({listing,loading,error}:{listing:any;loading:boolean;error:string}){const router=useRouter();const[busy,setBusy]=useState(false),[localError,setLocalError]=useState('');const enquire=async()=>{if(!listing)return;setBusy(true);setLocalError('');try{await api.createEnquiry(listing.id,{client_request_id:idempotencyKey('enquiry'),message:'Interested via ChemistTasker mobile Marketplace.'});router.push('/marketplace/exchanges' as any);}catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}};return <ParityPage title="Listing detail" subtitle="Public listing information and eligibility." loading={loading} error={error||localError}>{!listing?<EmptyState title="Listing not found" body="This listing is unavailable."/>:<>{listing.images?.[0]?.derivative_url?<Image source={{uri:listing.images[0].derivative_url}} style={{width:'100%',height:240,borderRadius:16}} resizeMode="cover"/>:null}<Section title={listing.title} description={listing.coarse_location}><Text>{listing.description}</Text><MetricGrid items={[{label:'Condition',value:replaceUnderscore(listing.condition)},{label:'Mode',value:replaceUnderscore(listing.mode)},{label:'Amount',value:listing.mode==='FREE'?'Free':listing.mode==='SWAP'?'Swap':money(listing.item_amount)}]}/><DataRow title="Seller" subtitle={listing.seller_role_label}/><DataRow title="Delivery" subtitle={asArray(listing.delivery_options).map(replaceUnderscore).join(', ')||'Seller arrangements'}/></Section><ActionButtons><Button mode="contained" loading={busy} onPress={()=>void enquire()}>Enquire</Button><Button mode="outlined" onPress={()=>router.push(('/marketplace/items/'+listing.id+'/report') as any)}>Report</Button></ActionButtons></>}</ParityPage>;}

function useDraftStep(initial:MarketplaceMobileDraft){const[value,setValue]=useState(initial);useEffect(()=>setValue(initial),[initial]);const patch=async(p:Partial<MarketplaceMobileDraft>)=>{const next={...value,...p};setValue(next);await patchMarketplaceDraft(p);return next;};return{value,patch};}
function SellerStep({draft,options,loading,error}:{draft:MarketplaceMobileDraft;options:any;loading:boolean;error:string}){const router=useRouter();const{value,patch}=useDraftStep(draft);const pharmacies=asArray<any>(options?.eligible_pharmacies);return <ParityPage title="Who is selling?" subtitle="Choose personal or pharmacy seller context." loading={loading} error={error}><ChoiceChips value={value.seller_context} onChange={v=>void patch({seller_context:v as any,pharmacy:v==='PERSONAL'?null:value.pharmacy})} options={[{value:'PERSONAL',label:'Personal'},{value:'PHARMACY',label:'Pharmacy'}]}/>{value.seller_context==='PHARMACY'?<Section title="Eligible pharmacies"><View style={{gap:8}}>{pharmacies.map(p=><Chip key={p.id} selected={value.pharmacy===p.id} onPress={()=>void patch({pharmacy:p.id})}>{p.label}</Chip>)}</View></Section>:null}<Button mode="contained" disabled={value.seller_context==='PHARMACY'&&!value.pharmacy} onPress={()=>router.push('/marketplace/new/category' as any)}>Continue</Button></ParityPage>;}
function CategoryStep({draft,categories,loading,error}:{draft:MarketplaceMobileDraft;categories:any[];loading:boolean;error:string}){const router=useRouter();const{value,patch}=useDraftStep(draft);return <ParityPage title="Choose category" subtitle="Categories and policy rules come from the live catalogue." loading={loading} error={error}><Section title="Categories">{categories.map(c=><DataRow key={c.id} title={c.name} subtitle={c.description} status={value.category===c.id?'Selected':undefined} onPress={()=>void patch({category:c.id,category_name:c.name})}/>)}</Section><Button mode="contained" disabled={!value.category} onPress={()=>router.push('/marketplace/new/details' as any)}>Continue</Button></ParityPage>;}
function DetailsStep({draft,categories,loading,error}:{draft:MarketplaceMobileDraft;categories:any[];loading:boolean;error:string}){
 const router=useRouter();const{value,patch}=useDraftStep(draft);
 const[barcode,setBarcode]=useState(''),[lookupMessage,setLookupMessage]=useState(''),[lookupBusy,setLookupBusy]=useState(false);
 const lookup=async()=>{if(!barcode.trim())return;setLookupBusy(true);setLookupMessage('');try{
   const result=await api.lookupCatalogue({barcode:barcode.trim()});const product=asArray<any>((result as any)?.results)[0];
   if(!product){setLookupMessage('No reviewed ordinary product matched. Continue with manual details.');return;}
   const matchedCategory=categories.find((category:any)=>String(category.slug||'')===String(product.category?.slug||'')||String(category.name||'').toLowerCase()===String(product.category?.name||'').toLowerCase());
   await patch({
     ...(product.name?{title:[product.brand,product.name].filter(Boolean).join(' ').trim()}:{}),
     ...(product.description?{description:product.description}:{}),
     ...(matchedCategory?{category:Number(matchedCategory.id),category_name:matchedCategory.name}:{}),
   });
   setLookupMessage(matchedCategory?'Reviewed product details and category added.':'Reviewed product details added. Confirm the selected category before continuing.');
 }catch(e){setLookupMessage(errorMessage(e,'Catalogue lookup failed. You can continue manually.'));}finally{setLookupBusy(false);}};
 return <ParityPage title="Item details" subtitle="Describe the item accurately." loading={loading} error={error}>
  <Section title="Catalogue assist" description="Optional. Use a barcode to prefill reviewed ordinary-product details; medicines still belong in Ethical Marketplace.">
   <Field label="Barcode / identifier" value={barcode} onChangeText={setBarcode}/>
   <Button mode="outlined" icon="barcode-scan" loading={lookupBusy} disabled={!barcode.trim()||lookupBusy} onPress={()=>void lookup()}>Look up product</Button>
   {lookupMessage?<InfoNote title="Catalogue">{lookupMessage}</InfoNote>:null}
  </Section>
  <ChoiceChips value={value.mode} onChange={v=>void patch({mode:v as any})} options={[{value:'SELL',label:'Sell'},{value:'FREE',label:'Free'},{value:'SWAP',label:'Swap'}]}/>
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
function PhotosStep({draft,loading,error}:{draft:MarketplaceMobileDraft;loading:boolean;error:string}){const router=useRouter();const{value,patch}=useDraftStep(draft);const add=async()=>{const r=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:true,quality:.85});if(!r.canceled)await patch({image_uris:[...value.image_uris,...r.assets.map(a=>a.uri)].slice(0,6)});};return <ParityPage title="Photos" subtitle="Add clear photos of the actual item." loading={loading} error={error}><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{value.image_uris.map((uri,i)=><Card key={uri+i} style={{width:'47%',overflow:'hidden'}}><Image source={{uri}} style={{width:'100%',height:130}}/><Card.Actions><Button onPress={()=>void patch({image_uris:value.image_uris.filter((_,x)=>x!==i)})}>Remove</Button></Card.Actions></Card>)}</View><Button mode="outlined" icon="image-plus" onPress={()=>void add()}>Add photos</Button><Button mode="contained" onPress={()=>router.push('/marketplace/new/audience' as any)}>Continue</Button></ParityPage>;}
function AudienceStep({draft,loading,error}:{draft:MarketplaceMobileDraft;loading:boolean;error:string}){
 const router=useRouter();const{value,patch}=useDraftStep(draft);const toggle=(role:string)=>void patch({allowed_buyer_roles:value.allowed_buyer_roles.includes(role)?value.allowed_buyer_roles.filter(x=>x!==role):[...value.allowed_buyer_roles,role]});
 const circles=[{value:'OWNED_CHAIN',label:'Owned pharmacies'},{value:'ORGANISATION',label:'Organisation'},{value:'PLATFORM',label:'Platform owners'}];const rank:Record<string,number>={OWNED_CHAIN:1,ORGANISATION:2,PLATFORM:3};
 const setInitial=(next:string)=>void patch({current_circle:next as MarketplaceMobileDraft['current_circle'],...(rank[next]>rank[value.maximum_circle]?{maximum_circle:next as MarketplaceMobileDraft['maximum_circle']}:{})});
 const setMaximum=(next:string)=>void patch({maximum_circle:next as MarketplaceMobileDraft['maximum_circle'],...(rank[value.current_circle]>rank[next]?{current_circle:next as MarketplaceMobileDraft['current_circle']}:{})});
 const postage=value.delivery_method!=='PICKUP';
 return <ParityPage title="Audience & delivery" subtitle="Choose who can enquire, how a pharmacy listing widens, and how the item changes hands." loading={loading} error={error}>
  <Section title="Buyer roles"><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{['OWNER','PHARMACIST','OTHER_STAFF','INTERN','STUDENT'].map(r=><Chip key={r} selected={value.allowed_buyer_roles.includes(r)} onPress={()=>toggle(r)}>{replaceUnderscore(r)}</Chip>)}</View></Section>
  {value.seller_context==='PHARMACY'?<Section title="Pharmacy audience escalation"><Text variant="bodySmall" style={{color:palette.muted}}>Start inside the owner network, then allow widening only up to the confirmed maximum.</Text><ChoiceChips value={value.current_circle} onChange={setInitial} options={circles}/><ChoiceChips value={value.maximum_circle} onChange={setMaximum} options={circles}/></Section>:null}
  <Section title="Delivery"><ChoiceChips value={value.delivery_method} onChange={v=>void patch({delivery_method:v as any,...(v==='PICKUP'?{postage_payer:'',postage_organiser:'',known_cost:'',quote_required:false}:{})})} options={[{value:'PICKUP',label:'Pickup'},{value:'POSTAGE',label:'Postage'},{value:'BOTH',label:'Both'}]}/>{postage?<><Text variant="labelMedium">Who pays postage?</Text><ChoiceChips value={value.postage_payer} onChange={v=>void patch({postage_payer:v as any})} options={[{value:'BUYER',label:'Buyer'},{value:'SELLER',label:'Seller'}]}/><Text variant="labelMedium">Who organises postage?</Text><ChoiceChips value={value.postage_organiser} onChange={v=>void patch({postage_organiser:v as any})} options={[{value:'BUYER',label:'Buyer'},{value:'SELLER',label:'Seller'}]}/><Field label="Known postage cost (optional)" value={value.known_cost} keyboardType="decimal-pad" onChangeText={v=>void patch({known_cost:v})}/><Chip selected={value.quote_required} onPress={()=>void patch({quote_required:!value.quote_required})}>Quote required before agreement</Chip></>:null}<Field label="Private pickup details" value={value.private_pickup_details} multiline onChangeText={v=>void patch({private_pickup_details:v})}/></Section>
  <Button mode="contained" disabled={!value.allowed_buyer_roles.length||(postage&&(!value.postage_payer||!value.postage_organiser))} onPress={()=>router.push('/marketplace/new/review' as any)}>Review</Button>
 </ParityPage>;
}
function ReviewStep({draft,loading,error}:{draft:MarketplaceMobileDraft;loading:boolean;error:string}){
 const router=useRouter();const[busy,setBusy]=useState(false),[localError,setLocalError]=useState('');
 const complete=async(submitForReview:boolean)=>{setBusy(true);setLocalError('');try{
   const body:any={seller_context:draft.seller_context,pharmacy:draft.pharmacy,category:draft.category,mode:draft.mode,title:draft.title,description:draft.description,condition:draft.condition,quantity:draft.quantity,unit:draft.unit,amount:draft.mode==='SELL'?draft.amount:'0',desired_swap:draft.desired_swap,suburb:draft.suburb,state:draft.state,postcode:draft.postcode,private_pickup_details:draft.private_pickup_details,allowed_buyer_roles:draft.allowed_buyer_roles,delivery:{method:draft.delivery_method,postage_payer:draft.postage_payer||undefined,postage_organiser:draft.postage_organiser||undefined,known_cost:draft.known_cost||null,quote_required:draft.quote_required}};
   const created=await api.createListing(body);let expectedVersion=created.version;
   if(draft.seller_context==='PHARMACY'){const audience=await api.updateAudience(created.id,{expected_version:expectedVersion,current_circle:draft.current_circle,maximum_circle:draft.maximum_circle});expectedVersion=audience.version;}
   for(const uri of draft.image_uris){const blob=await(await fetch(uri)).blob();const data=new FormData();data.append('image',blob as any,'listing-'+Date.now()+'.jpg');await api.uploadImage(created.id,data);}
   if(submitForReview)await api.actOnListing(created.id,'submit',expectedVersion);
   await clearMarketplaceDraft();router.replace('/marketplace/mine' as any);
 }catch(e){setLocalError(errorMessage(e,submitForReview?'Unable to submit listing.':'Unable to save listing draft.'));}finally{setBusy(false);}};
 const postage=draft.delivery_method!=='PICKUP';
 const disabled=busy||!draft.category||!draft.title||(postage&&(!draft.postage_payer||!draft.postage_organiser));
 return <ParityPage title="Review listing" subtitle="Confirm seller, item, audience and delivery details." loading={loading} error={error||localError}>
  <Section title={draft.title||'Untitled listing'} description={draft.category_name}>
   <DataRow title="Seller" subtitle={draft.seller_context==='PHARMACY'?'Pharmacy #'+draft.pharmacy:'Personal'}/>
   <DataRow title="Mode" subtitle={draft.mode==='SELL'?money(draft.amount):replaceUnderscore(draft.mode)}/>
   <DataRow title="Location" subtitle={draft.suburb+', '+draft.state+' '+draft.postcode}/>
   <DataRow title="Buyer roles" subtitle={draft.allowed_buyer_roles.map(replaceUnderscore).join(', ')}/>
   {draft.seller_context==='PHARMACY'?<DataRow title="Audience" subtitle={replaceUnderscore(draft.current_circle)+' → '+replaceUnderscore(draft.maximum_circle)}/>:null}
   <DataRow title="Delivery" subtitle={replaceUnderscore(draft.delivery_method)+(postage?' · '+replaceUnderscore(draft.postage_payer)+' pays · '+replaceUnderscore(draft.postage_organiser)+' organises':'')}/>
   <DataRow title="Photos" subtitle={draft.image_uris.length+' selected'}/>
  </Section>
  <InfoNote title="Marketplace policy">Medicines are excluded from the ordinary Marketplace. Use Ethical Marketplace for eligible medicine exchange workflows.</InfoNote>
  <InfoNote title="Draft or review">A private draft stays unpublished until you explicitly submit it for review.</InfoNote>
  <ActionButtons>
   <Button mode="outlined" loading={busy} disabled={disabled} onPress={()=>void complete(false)}>Save private draft</Button>
   <Button mode="contained" loading={busy} disabled={disabled} onPress={()=>void complete(true)}>Submit for review</Button>
  </ActionButtons>
 </ParityPage>;
}
function MyListingDetail({row,loading,error,onReload}:{row:any;loading:boolean;error:string;onReload:()=>Promise<void>}){
 const[busy,setBusy]=useState(false),[localError,setLocalError]=useState(''),[scheduleAt,setScheduleAt]=useState('');
 const order=['OWNED_CHAIN','ORGANISATION','PLATFORM'];const labels:Record<string,string>={OWNED_CHAIN:'Owned pharmacies',ORGANISATION:'Organisation',PLATFORM:'Platform owners'};
 const act=async(action:'submit'|'withdraw')=>{if(!row)return;setBusy(true);setLocalError('');try{await api.actOnListing(row.id,action,row.version);await onReload();}catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}};
 const currentIndex=order.indexOf(String(row?.current_circle||'')),maxIndex=order.indexOf(String(row?.maximum_circle||'PLATFORM'));const next=currentIndex>=0&&currentIndex<maxIndex?order[currentIndex+1]:null;
 const widen=async(schedule=false)=>{if(!row||!next)return;setBusy(true);setLocalError('');try{
   const due=scheduleAt.trim();if(schedule&&!due){setLocalError('Enter a future ISO date/time before scheduling audience widening.');return;}
   await api.updateAudience(row.id,{expected_version:row.version,current_circle:schedule?row.current_circle:next,maximum_circle:row.maximum_circle||'PLATFORM',...(schedule?{schedule:[{target_circle:next,due_at:new Date(due).toISOString()}]}:{})});
   setScheduleAt('');await onReload();
 }catch(e){setLocalError(errorMessage(e,'Unable to update listing audience.'));}finally{setBusy(false);}};
 return <ParityPage title="Manage listing" subtitle="Publication, availability and audience state." loading={loading} error={error||localError}>
  {!row?<EmptyState title="Listing not found" body="The listing is unavailable."/>:<>
   <MetricGrid items={[{label:'Publication',value:replaceUnderscore(row.publication_status)},{label:'Availability',value:replaceUnderscore(row.availability_status)},{label:'Audience',value:replaceUnderscore(row.current_circle||'PRIVATE')}]}/>
   <DataRow title={row.title} subtitle={row.category?.name||'Marketplace listing'}/>
   <ActionButtons>
    {['DRAFT','REJECTED'].includes(String(row.publication_status||'').toUpperCase())?<Button mode="contained" loading={busy} onPress={()=>void act('submit')}>Submit for review</Button>:null}
    {['PUBLISHED','PENDING_REVIEW'].includes(String(row.publication_status||'').toUpperCase())?<Button mode="outlined" disabled={busy} onPress={()=>void act('withdraw')}>Withdraw</Button>:null}
   </ActionButtons>
   {String(row.seller_context||'').toUpperCase()==='PHARMACY'&&String(row.publication_status||'').toUpperCase()==='PUBLISHED'&&next?<Section title="Audience widening" description={`Current: ${labels[row.current_circle]||replaceUnderscore(row.current_circle)} · Maximum: ${labels[row.maximum_circle||'PLATFORM']}`}>
    <InfoNote title="Next permitted circle">{labels[next]}</InfoNote>
    <Button mode="contained-tonal" disabled={busy} onPress={()=>void widen(false)}>Widen now to {labels[next]}</Button>
    <Field label="Schedule date/time (ISO)" value={scheduleAt} onChangeText={setScheduleAt}/>
    <Button mode="outlined" disabled={busy||!scheduleAt.trim()} onPress={()=>void widen(true)}>Schedule widening</Button>
   </Section>:null}
  </>}
 </ParityPage>;
}
function ExchangeDetail({row,loading,error,onReload}:{row:any;loading:boolean;error:string;onReload:()=>Promise<void>}){const[message,setMessage]=useState(''),[messages,setMessages]=useState<any[]>([]),[busy,setBusy]=useState(false),[localError,setLocalError]=useState('');useEffect(()=>{if(row?.id)api.listExchangeMessages(row.id).then(x=>setMessages(asArray(x))).catch(()=>null);},[row?.id]);const send=async()=>{if(!row||!message.trim())return;setBusy(true);try{await api.sendExchangeMessage(row.id,message.trim());setMessage('');setMessages(asArray(await api.listExchangeMessages(row.id)));}catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}};const act=async(action:string)=>{if(!row)return;setBusy(true);try{await api.actOnExchange(row.id,action,{expected_version:row.version});await onReload();}catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}};return <ParityPage title="Exchange detail" subtitle="Negotiation, messages and state transitions." loading={loading} error={error||localError}>{!row?<EmptyState title="Exchange not found" body="The exchange is unavailable."/>:<><MetricGrid items={[{label:'State',value:replaceUnderscore(row.state)},{label:'Quantity',value:row.quantity||'—'},{label:'Version',value:row.version}]}/><Section title={row.listing_title||'Marketplace exchange'}>{messages.map(m=><DataRow key={m.id} title={m.author_label||'Member'} subtitle={m.body}/>)}</Section><Field label="Message" value={message} multiline onChangeText={setMessage}/><Button mode="outlined" loading={busy} disabled={!message.trim()||busy} onPress={()=>void send()}>Send message</Button><ActionButtons>{asArray<string>(row.allowed_actions).map(action=><Button key={action} mode="contained-tonal" disabled={busy} onPress={()=>void act(action)}>{replaceUnderscore(action)}</Button>)}</ActionButtons></>}</ParityPage>;}
function ReportListing({listing,loading,error}:{listing:any;loading:boolean;error:string}){const router=useRouter();const[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[localError,setLocalError]=useState(''),[reference,setReference]=useState('');const submit=async()=>{if(!listing)return;setBusy(true);try{const r=await api.reportListing(listing.id,reason.trim());setReference(r.reference);}catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}};return <ParityPage title="Report listing" subtitle="Send a Marketplace policy or safety report." loading={loading} error={error||localError}>{reference?<><InfoNote title="Report submitted" tone="success">Reference {reference}</InfoNote><Button onPress={()=>router.back()}>Return to listing</Button></>:<><DataRow title={listing?.title||'Listing'} subtitle={listing?.coarse_location}/><Field label="Reason" value={reason} multiline onChangeText={setReason}/><Button mode="contained" loading={busy} disabled={!reason.trim()||busy} onPress={()=>void submit()}>Submit report</Button></>}</ParityPage>;}
