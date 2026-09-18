'use client';

import Link from 'next/link';
import {FormEvent,useCallback,useEffect,useRef,useState} from 'react';
import {Boxes,CheckCircle2,Clock3,FileUp,LockKeyhole,PackagePlus,Repeat2,ScanLine,ShieldCheck,TriangleAlert} from 'lucide-react';
import {loginHref} from '@/shared/browser-session';
import {useSession} from '@/shared/session-provider';
import {ethicalMarketplaceApi,type EthicalContext} from './api';

type View='home'|'access'|'inventory'|'new'|'listings'|'transfers';
type Product={id:number;name:string;strength:string;form:string;pack_size:string;schedule:string};
type Lot={id:number;pharmacy:number;product:number;product_detail:Product;batch_number:string;expiry_date:string;on_hand_quantity:number;reserved_quantity:number;available_quantity:number;source_reference:string;version:number};
type Listing={id:string;pharmacy:number;product:number;product_detail:Product;mode:string;amount:string;current_circle:'CHAIN_PHARMACIES'|'ORGANISATION_OWNERS'|'PLATFORM_OWNERS';maximum_circle:'CHAIN_PHARMACIES'|'ORGANISATION_OWNERS'|'PLATFORM_OWNERS';status:string;version:number;lot_allocations:{id:number;lot:number;quantity:number}[];can_owner_authorise?:boolean;escalation_steps?:{id:number;target_circle:string;due_at:string;status:string;reason?:string}[]};
type Transfer={id:string;state:string;version:number;mode:string;source_pharmacy:number;destination_pharmacy:number;lines:{id:number;lot:number;quantity:number}[]};
const LABELS:Record<string,string>={CHAIN_PHARMACIES:'Chain pharmacies',ORGANISATION_OWNERS:'Organisation owners',PLATFORM_OWNERS:'All eligible platform owners'};const ORDER=['CHAIN_PHARMACIES','ORGANISATION_OWNERS','PLATFORM_OWNERS'] as const;

export default function EthicalWorkspaceV2({view}:{view:View}){
 const session=useSession();
 const [contexts,setContexts]=useState<EthicalContext[]>([]);
 const [selected,setSelected]=useState<number>();
 const [rows,setRows]=useState<unknown[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const activeReqRef=useRef(0);

 useEffect(()=>{
  if(session.status!=='authenticated')return;
  setLoading(true);
  ethicalMarketplaceApi.getAccess().then(data=>{
   setContexts(data.contexts||[]);
   setSelected(current=>current&&data.contexts.some(row=>row.pharmacy.id===current)?current:data.contexts[0]?.pharmacy.id);
  }).catch(reason=>setError((reason as Error).message)).finally(()=>setLoading(false));
 },[session.status]);

 const context=contexts.find(row=>row.pharmacy.id===selected);

 const reload=useCallback(async()=>{
  if(!selected||!context||view==='access'||context.blockers.length){
   setRows([]);
   return;
  }
  const reqId=++activeReqRef.current;
  setRows([]);
  setLoading(true);
  setError('');
  try{
   let result:unknown[]=[];
   if(view==='inventory'){
    result=await ethicalMarketplaceApi.getLots({pharmacy:selected});
   }else if(view==='transfers'){
    result=await ethicalMarketplaceApi.listTransfers({pharmacy:selected});
   }else if(view==='listings'||view==='new'){
    const data=await ethicalMarketplaceApi.getMyListings({pharmacy:selected});
    result=data.results||[];
   }else{
    const data=await ethicalMarketplaceApi.listListings({pharmacy:selected});
    result=data.results||[];
   }
   if(activeReqRef.current===reqId){
    setRows(result);
   }
  }catch(reason){
   if(activeReqRef.current===reqId){
    setError((reason as Error).message);
   }
  }finally{
   if(activeReqRef.current===reqId){
    setLoading(false);
   }
  }
 },[selected,view,context?.admitted,context?.blockers.length]);

 useEffect(()=>{
  if(session.status==='authenticated'&&selected&&view!=='access')void reload();
 },[session.status,selected,view,reload]);

 const handlePharmacyChange=(nextId:number)=>{
  activeReqRef.current+=1;
  setRows([]);
  setError('');
  setSelected(nextId);
 };

 if(session.status==='loading'||(loading&&!contexts.length&&session.status==='authenticated'))return <main className="market-workspace"><div className="container workspace-loading">Checking secure ethical access…</div></main>;
 if(session.status==='anonymous')return <main className="market-workspace"><div className="container"><section className="workspace-panel"><LockKeyhole/><h1>Sign in for the private ethical marketplace</h1><p>No medicine data loads before access is checked.</p><a className="button primary" href={loginHref('/marketplace/ethical/access')}>Sign in securely</a></section></div></main>;

 return (
  <main className="market-workspace ethical-workspace">
   <div className="container">
    <header className="workspace-header">
     <p>PRIVATE ETHICAL MARKETPLACE</p>
     <h1>{view==='home'?'Restricted medicine stock exchange':view==='access'?'Access and premises approval':view==='inventory'?'Private inventory and import':view==='new'?'Prepare selected medicine stock':view==='listings'?'My ethical listings':'Transfer inbox'}</h1>
    </header>
    {contexts.length>1&& (
     <label className="workspace-context">
      <span>Acting pharmacy</span>
      <select value={selected||''} onChange={e=>handlePharmacyChange(Number(e.target.value))}>
       {contexts.map(row=><option key={row.pharmacy.id} value={row.pharmacy.id}>{row.pharmacy.label}</option>)}
      </select>
     </label>
    )}
    {error&&<p className="workspace-alert"><TriangleAlert size={16}/>{error}</p>}
    {!contexts.length?(
     <section className="workspace-panel"><h2>No eligible pharmacy context</h2></section>
    ):context&&view==='access'?(
     <Access key={context.pharmacy.id} context={context}/>
    ):context?.blockers.length?(
     <section className="workspace-panel"><LockKeyhole/><h2>Complete these access steps</h2><ul>{context.blockers.map(row=><li key={row.code}>{row.message||row.detail}</li>)}</ul></section>
    ):context?(
     render(view,context,rows,reload,setError)
    ):null}
   </div>
  </main>
 );
}

function render(view:View,context:EthicalContext,rows:unknown[],reload:()=>Promise<void>,setError:(v:string)=>void){
 const key=context.pharmacy.id;
 if(view==='home')return <><Overview key="overview"/><Discovery key={key} rows={rows as Listing[]} destination={context.pharmacy.id} setError={setError}/></>;
 if(view==='inventory')return <Inventory key={key} pharmacy={context.pharmacy.id} lots={rows as Lot[]} reload={reload} setError={setError}/>;
 if(view==='new')return <Composer key={key} pharmacy={context.pharmacy.id} setError={setError}/>;
 if(view==='listings')return <Mine key={key} rows={rows as Listing[]} isOwner={context.is_owner} reload={reload} setError={setError}/>;
 return <Transfers key={key} rows={rows as Transfer[]} reload={reload} setError={setError}/>;
}

function Overview(){return <div className="ethical-overview"><article><ShieldCheck/><h2>Premises admission</h2><p>PBS/PAN evidence and exact pharmacy scope.</p></article><article><ScanLine/><h2>Private inventory</h2><p>Barcode-backed products and reconciled lots.</p></article><article><Repeat2/><h2>Escalation</h2><p>Chain pharmacies → organisation owners → platform owners. S8 stops at organisation.</p></article><article><CheckCircle2/><h2>Accountable transfer</h2><p>Request, agreement, authorisation, dispatch and receipt.</p></article></div>}

function Access({context}:{context:EthicalContext}){const [message,setMessage]=useState('');const canApply=context.blockers.some(row=>row.code==='PHARMACY_APPROVAL_REQUIRED');return <div className="workspace-stack">{canApply&&<form className="workspace-form compact" onSubmit={async e=>{e.preventDefault();try{await ethicalMarketplaceApi.submitPharmacyApproval(context.pharmacy.id,new FormData(e.currentTarget));setMessage('Premises application submitted for private review.')}catch(error){setMessage((error as Error).message)}}}><fieldset><legend>Premises application</legend><label><span>PBS/PAN approval number</span><input name="pbs_approval_number" required/></label><label><span>Business phone</span><input name="business_phone" required/></label><label><span>Business email</span><input name="business_email" type="email" required/></label><label className="full"><span>Private evidence</span><input name="evidence" type="file" required/></label></fieldset><button className="button primary">Submit for review</button></form>}{message&&<p role="status">{message}</p>}</div>}

function Inventory({pharmacy,lots,reload,setError}:{pharmacy:number;lots:Lot[];reload:()=>Promise<void>;setError:(v:string)=>void}){const [barcode,setBarcode]=useState('');const [product,setProduct]=useState<Product>();const [batch,setBatch]=useState<{id:number;row_count:number}>();const [message,setMessage]=useState('');async function lookup(){try{const found=await ethicalMarketplaceApi.lookupCatalogue({pharmacy,barcode});if('id' in found){setProduct(found as Product);setMessage('Reviewed private product matched.')}else setMessage('No approved product matched.')}catch(error){setError((error as Error).message)}}return <div className="workspace-stack"><section className="workspace-panel"><h2>Scan or enter a medicine barcode</h2><div className="inline-upload"><input value={barcode} onChange={e=>setBarcode(e.target.value)} placeholder="Barcode"/><button onClick={()=>void lookup()}><ScanLine size={14}/> Lookup</button></div>{product&&<p><strong>{product.name}</strong> · {product.strength} · {product.form} · {product.schedule}</p>}</section><form className="workspace-form compact" onSubmit={async e=>{e.preventDefault();const data=new FormData(e.currentTarget);data.set('pharmacy',String(pharmacy));data.set('source_rights_attested','true');try{const staged=await ethicalMarketplaceApi.uploadImport(data);setBatch({id:staged.id,row_count:staged.row_count??0});setMessage(`${staged.row_count??0} row(s) staged.`)}catch(error){setError((error as Error).message)}}}><fieldset><legend>Import inventory CSV</legend><label><span>Source name</span><input name="source_name" required/></label><label><span>CSV file</span><input name="file" type="file" accept=".csv,text/csv" required/></label></fieldset><button className="button secondary"><FileUp size={15}/> Stage CSV</button></form>{batch&&<section className="workspace-panel"><p>{batch.row_count} row(s) staged. No stock changes until commit.</p><button className="button primary" onClick={async()=>{try{const r=await ethicalMarketplaceApi.commitImport(batch.id);setMessage(`${r.status}: ${r.accepted_count} accepted, ${r.rejected_count} rejected`);await reload()}catch(error){setError((error as Error).message)}}}>Commit reconciled inventory</button></section>}<section className="workspace-section"><h2>Current private lots</h2>{lots.map(lot=><article key={lot.id}><strong>{lot.product_detail.name} {lot.product_detail.strength}</strong><p>Batch {lot.batch_number} · exp {lot.expiry_date} · {lot.available_quantity} available</p></article>)}</section>{message&&<p role="status">{message}</p>}</div>}

function Composer({pharmacy,setError}:{pharmacy:number;setError:(v:string)=>void}){
 const [lots,setLots]=useState<Lot[]>([]);
 const [message,setMessage]=useState('');
 useEffect(()=>{
  let isMounted=true;
  setLots([]);
  ethicalMarketplaceApi.getLots({pharmacy})
   .then(data=>{if(isMounted)setLots(data);})
   .catch(error=>{if(isMounted)setError(error.message);});
  return ()=>{isMounted=false;};
 },[pharmacy,setError]);
 return <form className="workspace-form compact" onSubmit={async e=>{e.preventDefault();const data=new FormData(e.currentTarget);const lot=lots.find(row=>row.id===Number(data.get('lot')));if(!lot)return;try{await ethicalMarketplaceApi.createListing({pharmacy,product:lot.product,mode:String(data.get('mode')),amount:String(data.get('amount')||'0'),current_circle:'CHAIN_PHARMACIES',maximum_circle:String(data.get('maximum_circle')),scope_chain:null,lots:[{lot:lot.id,quantity:Number(data.get('quantity'))}]});setMessage('Private draft prepared. The accountable owner must publish it.')}catch(error){setError((error as Error).message)}}}><fieldset><legend>Selected stock only</legend><label className="full"><span>Reconciled lot</span><select name="lot" required><option value="">Choose lot</option>{lots.filter(row=>row.available_quantity>0).map(row=><option value={row.id} key={row.id}>{row.product_detail.name} · {row.product_detail.schedule} · batch {row.batch_number} · {row.available_quantity} available</option>)}</select></label><label><span>Quantity</span><input name="quantity" type="number" min="1" required/></label><label><span>Mode</span><select name="mode"><option value="SALE">Sale</option><option value="TRANSFER">No-charge transfer</option><option value="SWAP">Swap</option></select></label><label><span>Amount AUD</span><input name="amount" type="number" min="0" step="0.01"/></label><label><span>Maximum audience</span><select name="maximum_circle"><option value="CHAIN_PHARMACIES">Chain only</option><option value="ORGANISATION_OWNERS">Organisation owners</option><option value="PLATFORM_OWNERS">Platform owners</option></select></label></fieldset><button className="button primary"><PackagePlus size={15}/> Prepare private draft</button>{message&&<p role="status">{message}</p>}</form>;
}

function Mine({rows,isOwner,reload,setError}:{rows:Listing[];isOwner:boolean;reload:()=>Promise<void>;setError:(v:string)=>void}){
 async function act(row:Listing,action:string,extra:Record<string,unknown>={}){
  try{
   await ethicalMarketplaceApi.actOnListing(row.id,action as 'publish'|'withdraw'|'escalation',{expected_version:row.version,...extra});
   await reload();
  }catch(error){
   setError((error as Error).message);
  }
 }
 return (
  <section className="workspace-section">
   <div className="workspace-title-row">
    <h2>My ethical listings</h2>
    <Link className="button primary" href="/marketplace/ethical/listings/new">Prepare stock</Link>
   </div>
   {rows.length===0?<p>No listings prepared for this pharmacy yet.</p>:rows.map(row=>{
    const idx=ORDER.indexOf(row.current_circle);
    const max=ORDER.indexOf(row.maximum_circle);
    const next=idx<max?ORDER[idx+1]:null;
    return (
     <article key={row.id}>
      <div>
       <span>{row.product_detail.schedule} · {row.status.toLowerCase()}</span>
       <h3>{row.product_detail.name}</h3>
       <p>{LABELS[row.current_circle]} → max {LABELS[row.maximum_circle]}</p>
       {row.escalation_steps?.filter(step=>step.status==='PENDING').map(step=><small key={step.id}><Clock3 size={13}/> {LABELS[step.target_circle]} scheduled {new Date(step.due_at).toLocaleString()}</small>)}
      </div>
      <div>
       {row.status==='DRAFT'&&isOwner&&<button onClick={()=>void act(row,'publish')}>Owner publish</button>}
       {row.status==='PUBLISHED'&&isOwner&&next&&<button onClick={()=>void act(row,'escalation',{target_circle:next,schedule:[]})}>Escalate to {LABELS[next]}</button>}
       {['PUBLISHED','RESERVED'].includes(row.status)&&isOwner&&<button className="quiet" onClick={()=>void act(row,'withdraw')}>Withdraw</button>}
      </div>
     </article>
    );
   })}
  </section>
 );
}

function Discovery({rows,destination,setError}:{rows:Listing[];destination:number;setError:(v:string)=>void}){
 return (
  <section className="workspace-section">
   <h2>Available in your permitted circle</h2>
   {rows.length?rows.map(row=><article key={row.id}><span>{row.product_detail.schedule}</span><h3>{row.product_detail.name}</h3><p>{row.product_detail.strength} · {LABELS[row.current_circle]}</p></article>):(
    <section className="workspace-panel"><Boxes/><h3>No private listings in your current circle.</h3></section>
   )}
  </section>
 );
}

function Transfers({rows,reload,setError}:{rows:Transfer[];reload:()=>Promise<void>;setError:(v:string)=>void}){
 async function act(row:Transfer,action:string){
  try{
   await ethicalMarketplaceApi.actOnTransfer(row.id,action as 'agree'|'authorise'|'dispatch'|'receive'|'cancel',{expected_version:row.version,client_request_id:crypto.randomUUID()});
   await reload();
  }catch(error){
   setError((error as Error).message);
  }
 }
 return (
  <section className="workspace-section">
   <h2>Accountable transfer records</h2>
   {rows.length===0?<p>No transfer records for this pharmacy.</p>:rows.map(row=><article key={row.id}><div><span>{row.mode.toLowerCase()}</span><h3>{row.state.replaceAll('_',' ').toLowerCase()}</h3></div><div>{row.state==='REQUESTED'&&<button onClick={()=>void act(row,'agree')}>Review and agree</button>}{row.state==='AGREED'&&<button onClick={()=>void act(row,'authorise')}>Authorise dispatch</button>}{row.state==='AUTHORISED_FOR_DISPATCH'&&<button onClick={()=>void act(row,'dispatch')}>Record dispatch</button>}{row.state==='DISPATCHED'&&<button onClick={()=>void act(row,'receive')}>Record receipt</button>}</div></article>)}
  </section>
 );
}
