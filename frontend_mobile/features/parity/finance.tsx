import React, { useCallback, useEffect, useState } from 'react';
import { Button, Chip, IconButton } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import {
  finance,
  financeStatus,
  financeToday,
  type FinanceCustomer,
  type FinanceCustomerInput,
  type FinanceItem,
  type FinanceItemInput,
  type FinanceExpense,
  type FinanceExpenseInput,
  type FinanceInvoice,
} from '@chemisttasker/shared-core';
import FinanceWorkspace from '@/roles/shared/invoices/FinanceWorkspace';
import { ActionButtons, ChoiceChips, DataRow, EmptyState, Field, InfoNote, MetricGrid, ParityPage, Section } from './ParityUI';
import { dateLabel, errorMessage, idempotencyKey, money, replaceUnderscore, toNumber } from './utils';

type FinanceScreen =
  | 'home' | 'customers' | 'customer-new' | 'items' | 'item-new' | 'expenses' | 'expense-new'
  | 'expense-receipt' | 'receipt' | 'bas' | 'received' | 'received-detail' | 'invoice-history' | 'invoice-payment';

const titles: Record<FinanceScreen,string> = {
  home:'Finance',
  customers:'Customers',
  'customer-new':'New customer',
  items:'Reusable items',
  'item-new':'New reusable item',
  expenses:'Expenses',
  'expense-new':'New expense',
  'expense-receipt':'Expense receipt',
  receipt:'Receipt',
  bas:'GST / BAS worksheet',
  received:'Received invoices',
  'received-detail':'Received invoice',
  'invoice-history':'Invoice history',
  'invoice-payment':'Record payment',
};

export function FinanceParityScreen({screen}:{screen:FinanceScreen}) {
  if(screen==='home') return <FinanceWorkspace/>;
  const router=useRouter();
  const params=useLocalSearchParams<{id?:string}>();
  const id=toNumber(params.id);
  const [customers,setCustomers]=useState<FinanceCustomer[]>([]);
  const [items,setItems]=useState<FinanceItem[]>([]);
  const [expenses,setExpenses]=useState<FinanceExpense[]>([]);
  const [invoices,setInvoices]=useState<FinanceInvoice[]>([]);
  const [received,setReceived]=useState<FinanceInvoice[]>([]);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState('');

  const load=useCallback(async()=>{
    setError('');
    try{
      if(screen==='customers'||screen==='customer-new') setCustomers(await finance.customers());
      if(screen==='items'||screen==='item-new') setItems(await finance.items());
      if(screen==='expenses'||screen==='expense-new'||screen==='expense-receipt'||screen==='receipt') setExpenses(await finance.expenses());
      if(screen==='received'||screen==='received-detail') setReceived(await finance.receivedInvoices());
      if(screen==='invoice-history'||screen==='invoice-payment') setInvoices(await finance.invoices());
    }catch(e){setError(errorMessage(e,'Unable to load finance records.'));}
    finally{setLoading(false);setRefreshing(false);}
  },[screen]);

  useEffect(()=>{void load();},[load]);

  if(screen==='customer-new') return <CustomerEditor customer={customers.find(x=>Number(x.id)===id)} loading={loading} error={error} onSaved={load}/>;
  if(screen==='item-new') return <ItemEditor item={items.find(x=>Number(x.id)===id)} loading={loading} error={error} onSaved={load}/>;
  if(screen==='expense-new') return <ExpenseEditor expense={expenses.find(x=>Number(x.id)===id)} loading={loading} error={error} onSaved={load}/>;
  if(screen==='bas') return <BasScreen/>;
  if(screen==='expense-receipt') return <ExpenseReceipt expense={expenses.find(x=>Number(x.id)===id)} loading={loading} error={error} onReload={load}/>;
  if(screen==='receipt') return <ReceiptScreen receiptId={id} loading={loading} error={error}/>;
  if(screen==='received-detail') return <ReceivedDetail invoice={received.find(x=>Number(x.id)===id)} loading={loading} error={error} onReload={load}/>;
  if(screen==='invoice-history') return <InvoiceHistory invoice={invoices.find(x=>Number(x.id)===id)} loading={loading} error={error}/>;
  if(screen==='invoice-payment') return <InvoicePayment invoice={invoices.find(x=>Number(x.id)===id)} loading={loading} error={error} onReload={load}/>;

  const common={loading,error,onRetry:load,onRefresh:()=>{setRefreshing(true);void load();},refreshing};

  if(screen==='customers') return <ParityPage title={titles[screen]} subtitle="Reusable billing contacts for invoices." {...common} right={<IconButton icon="plus" onPress={()=>router.push('/finance/customers/new' as any)}/>}>
    <Section title="Saved customers">{customers.length?customers.map(c=><DataRow key={c.id} title={c.name||c.legal_name} subtitle={`${c.email||'No invoice email'} · ${c.payment_terms_days}-day terms · ABN ${c.abn||'not supplied'}`} status={c.active?'Active':'Inactive'} onPress={()=>router.push(`/finance/customers/new?id=${c.id}` as any)}/>):<EmptyState title="No customers" body="Create a customer before issuing invoices." actionLabel="Create customer" onAction={()=>router.push('/finance/customers/new' as any)}/>}</Section>
  </ParityPage>;

  if(screen==='items') return <ParityPage title={titles[screen]} subtitle="Reusable invoice line items and tax treatment." {...common} right={<IconButton icon="plus" onPress={()=>router.push('/finance/items/new' as any)}/>}>
    <Section title="Saved items">{items.length?items.map(i=><DataRow key={i.id} title={i.name} subtitle={`${i.code||'No code'} · ${money(i.unit_price)} / ${i.unit} · ${replaceUnderscore(i.tax_code)}`} status={i.active?'Active':'Inactive'}/>):<EmptyState title="No reusable items" body="Add common professional-service or expense items for faster invoicing."/>}</Section>
  </ParityPage>;

  if(screen==='expenses') return <ParityPage title={titles[screen]} subtitle="Business expenses, evidence and GST treatment." {...common} right={<IconButton icon="plus" onPress={()=>router.push('/finance/expenses/new' as any)}/>}>
    <MetricGrid items={[{label:'Expenses',value:expenses.length},{label:'Evidence missing',value:expenses.filter(e=>!e.evidence_confirmed).length,tone:expenses.some(e=>!e.evidence_confirmed)?'warning':'success'}]}/>
    <Section title="Expenses">{expenses.length?expenses.map(e=><DataRow key={e.id} title={e.supplier||e.description} subtitle={`${e.description} · ${money(e.amount)} · ${e.incurred_on}`} status={e.receipts?.length?`${e.receipts.length} receipt(s)`:'No receipt'} onPress={()=>router.push(`/finance/expenses/new?id=${e.id}` as any)}/>):<EmptyState title="No expenses" body="Record business expenses and attach evidence for your GST worksheet."/>}</Section>
  </ParityPage>;

  if(screen==='received') return <ParityPage title={titles[screen]} subtitle="Review contractor invoices, request revision and record payment." {...common}>
    <Section title="Received invoices">{received.length?received.map(i=><DataRow key={i.id} title={i.number} subtitle={`${i.payload.issuer_name} · revision ${i.version} · payable ${money(i.calculation.payable)}`} status={financeStatus(i)} onPress={()=>router.push(`/finance/received/${i.id}` as any)}/>):<EmptyState title="No received invoices" body="Internal invoices appear after contractors issue them."/>}</Section>
  </ParityPage>;

  return <ParityPage title={titles[screen]} subtitle="Finance workspace" loading={loading} error={error}><EmptyState title="No data" body="No records are available for this view."/></ParityPage>;
}

function CustomerEditor({customer,loading,error,onSaved}:{customer?:FinanceCustomer;loading:boolean;error:string;onSaved:()=>Promise<void>}) {
  const router=useRouter();
  const [form,setForm]=useState<FinanceCustomerInput>(()=>customer?{
    name:customer.name,legal_name:customer.legal_name,abn:customer.abn,contact_name:customer.contact_name,email:customer.email,phone:customer.phone,address:customer.address,payment_terms_days:customer.payment_terms_days,notes:customer.notes,active:customer.active,
  }:{name:'',legal_name:'',abn:'',contact_name:'',email:'',phone:'',address:'',payment_terms_days:14,notes:'',active:true});
  const [busy,setBusy]=useState(false),[localError,setLocalError]=useState('');
  useEffect(()=>{if(customer)setForm({name:customer.name,legal_name:customer.legal_name,abn:customer.abn,contact_name:customer.contact_name,email:customer.email,phone:customer.phone,address:customer.address,payment_terms_days:customer.payment_terms_days,notes:customer.notes,active:customer.active});},[customer]);
  const save=async()=>{
    setBusy(true);setLocalError('');
    try{
      const saved:any=await finance.saveCustomer(form,customer?.id);
      if(form.abn.trim() && saved?.id) {
        try { await finance.lookupAbn(saved.id); } catch { /* Save remains valid if the external lookup is unavailable. */ }
      }
      await onSaved();router.replace('/finance/customers' as any);
    }catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}
  };
  const lookup=async()=>{
    if(!customer?.id||busy)return;setBusy(true);setLocalError('');
    try{await finance.lookupAbn(customer.id);await onSaved();}catch(e){setLocalError(errorMessage(e,'Unable to verify this ABN.'));}finally{setBusy(false);}
  };
  const patch=(key:keyof FinanceCustomerInput,value:any)=>setForm(v=>({...v,[key]:value}));
  return <ParityPage title={customer?'Edit customer':'New customer'} subtitle="Maintain reusable invoice customer details and ABN verification." loading={loading} error={error||localError}>
    <Field label="Display name" value={form.name} onChangeText={v=>patch('name',v)}/>
    <Field label="Legal entity name" value={form.legal_name} onChangeText={v=>patch('legal_name',v)}/>
    <Field label="ABN" value={form.abn} keyboardType="numeric" onChangeText={v=>patch('abn',v)}/>
    {customer?.abn_checked_at?<InfoNote title="ABN checked">{dateLabel(customer.abn_checked_at)}</InfoNote>:null}
    <Field label="Accounts contact" value={form.contact_name} onChangeText={v=>patch('contact_name',v)}/>
    <Field label="Invoice email" value={form.email} keyboardType="email-address" onChangeText={v=>patch('email',v)}/>
    <Field label="Phone" value={form.phone} keyboardType="phone-pad" onChangeText={v=>patch('phone',v)}/>
    <Field label="Billing address" value={form.address} multiline onChangeText={v=>patch('address',v)}/>
    <Field label="Payment terms (days)" value={String(form.payment_terms_days)} keyboardType="numeric" onChangeText={v=>patch('payment_terms_days',toNumber(v,14))}/>
    <ChoiceChips value={form.active?'ACTIVE':'INACTIVE'} onChange={v=>patch('active',v==='ACTIVE')} options={[{value:'ACTIVE',label:'Active'},{value:'INACTIVE',label:'Inactive'}]}/>
    <Field label="Notes" value={form.notes} multiline onChangeText={v=>patch('notes',v)}/>
    <ActionButtons>
      <Button mode="contained" loading={busy} disabled={!form.name.trim()||busy} onPress={()=>void save()}>{customer?'Save changes':'Save customer'}</Button>
      {customer?.id&&form.abn.trim()?<Button mode="outlined" disabled={busy} onPress={()=>void lookup()}>Verify ABN</Button>:null}
    </ActionButtons>
  </ParityPage>;
}

function ItemEditor({item,loading,error,onSaved}:{item?:FinanceItem;loading:boolean;error:string;onSaved:()=>Promise<void>}) {
  const router=useRouter();
  const [form,setForm]=useState<FinanceItemInput>(()=>item?{code:item.code,name:item.name,category:item.category,unit:item.unit,unit_price:item.unit_price,tax_code:item.tax_code,super_eligible:item.super_eligible,active:item.active}:{code:'',name:'',category:'ProfessionalServices',unit:'Hours',unit_price:'0.00',tax_code:'OUT_OF_SCOPE',super_eligible:false,active:true});
  const [busy,setBusy]=useState(false),[localError,setLocalError]=useState('');
  useEffect(()=>{if(item)setForm({code:item.code,name:item.name,category:item.category,unit:item.unit,unit_price:item.unit_price,tax_code:item.tax_code,super_eligible:item.super_eligible,active:item.active});},[item]);
  const save=async()=>{setBusy(true);setLocalError('');try{await finance.saveItem(form,item?.id);await onSaved();router.replace('/finance/items' as any);}catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}};
  return <ParityPage title={item?'Edit reusable item':'New reusable item'} subtitle="Maintain an invoice line template and its tax/super treatment." loading={loading} error={error||localError}>
    <Field label="Code" value={form.code} onChangeText={v=>setForm(x=>({...x,code:v}))}/>
    <Field label="Name" value={form.name} onChangeText={v=>setForm(x=>({...x,name:v}))}/>
    <ChoiceChips value={form.category} onChange={v=>setForm(x=>({...x,category:v as any}))} options={[{value:'ProfessionalServices',label:'Professional services'},{value:'Superannuation',label:'Super'},{value:'Transportation',label:'Transport'},{value:'Accommodation',label:'Accommodation'},{value:'Miscellaneous',label:'Misc'}]}/>
    <Field label="Unit" value={form.unit} onChangeText={v=>setForm(x=>({...x,unit:v}))}/>
    <Field label="Unit price (AUD)" value={String(form.unit_price)} keyboardType="decimal-pad" onChangeText={v=>setForm(x=>({...x,unit_price:v}))}/>
    <ChoiceChips value={form.tax_code} onChange={v=>setForm(x=>({...x,tax_code:v as any}))} options={[{value:'GST',label:'GST'},{value:'GST_FREE',label:'GST free'},{value:'INPUT_TAXED',label:'Input taxed'},{value:'OUT_OF_SCOPE',label:'Out of scope'}]}/>
    <ChoiceChips value={form.super_eligible?'YES':'NO'} onChange={v=>setForm(x=>({...x,super_eligible:v==='YES'}))} options={[{value:'YES',label:'Super eligible'},{value:'NO',label:'Not super eligible'}]}/>
    <ChoiceChips value={form.active?'ACTIVE':'INACTIVE'} onChange={v=>setForm(x=>({...x,active:v==='ACTIVE'}))} options={[{value:'ACTIVE',label:'Active'},{value:'INACTIVE',label:'Inactive'}]}/>
    <Button mode="contained" loading={busy} disabled={!form.name.trim()||busy} onPress={()=>void save()}>{item?'Save changes':'Save item'}</Button>
  </ParityPage>;
}

function ExpenseEditor({expense,loading,error,onSaved}:{expense?:FinanceExpense;loading:boolean;error:string;onSaved:()=>Promise<void>}) {
  const router=useRouter();
  const [form,setForm]=useState<FinanceExpenseInput>(()=>expense?{
    request_key:expense.request_key,version:expense.version,supplier:expense.supplier,description:expense.description,category:expense.category,incurred_on:expense.incurred_on,paid_on:expense.paid_on,amount:expense.amount,gst_amount:expense.gst_amount,tax_code:expense.tax_code,business_use_percent:expense.business_use_percent,gst_registered:expense.gst_registered,evidence_confirmed:expense.evidence_confirmed,reimbursable:expense.reimbursable,reference:expense.reference,notes:expense.notes,
  }:{request_key:idempotencyKey('expense'),version:1,supplier:'',description:'',category:'Other',incurred_on:financeToday(),paid_on:null,amount:'',gst_amount:'0.00',tax_code:'OUT_OF_SCOPE',business_use_percent:'100.00',gst_registered:false,evidence_confirmed:false,reimbursable:false,reference:'',notes:''});
  const [busy,setBusy]=useState(false),[localError,setLocalError]=useState('');
  useEffect(()=>{if(expense)setForm({request_key:expense.request_key,version:expense.version,supplier:expense.supplier,description:expense.description,category:expense.category,incurred_on:expense.incurred_on,paid_on:expense.paid_on,amount:expense.amount,gst_amount:expense.gst_amount,tax_code:expense.tax_code,business_use_percent:expense.business_use_percent,gst_registered:expense.gst_registered,evidence_confirmed:expense.evidence_confirmed,reimbursable:expense.reimbursable,reference:expense.reference,notes:expense.notes});},[expense]);
  const save=async()=>{setBusy(true);setLocalError('');try{const saved=await finance.saveExpense(form,expense?.id);await onSaved();router.replace(`/finance/expenses/${saved.id}/receipt` as any);}catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}};
  return <ParityPage title={expense?'Edit expense':'New expense'} subtitle="Record business expense, GST treatment and supporting evidence." loading={loading} error={error||localError}>
    <Field label="Supplier" value={form.supplier} onChangeText={v=>setForm(x=>({...x,supplier:v}))}/>
    <Field label="Description" value={form.description} multiline onChangeText={v=>setForm(x=>({...x,description:v}))}/>
    <Field label="Category" value={form.category} onChangeText={v=>setForm(x=>({...x,category:v}))}/>
    <Field label="Incurred date (YYYY-MM-DD)" value={form.incurred_on} onChangeText={v=>setForm(x=>({...x,incurred_on:v}))}/>
    <Field label="Paid date (optional, YYYY-MM-DD)" value={form.paid_on||''} onChangeText={v=>setForm(x=>({...x,paid_on:v||null}))}/>
    <Field label="Amount (AUD)" value={String(form.amount)} keyboardType="decimal-pad" onChangeText={v=>setForm(x=>({...x,amount:v}))}/>
    <Field label="GST amount (AUD)" value={String(form.gst_amount)} keyboardType="decimal-pad" onChangeText={v=>setForm(x=>({...x,gst_amount:v}))}/>
    <ChoiceChips value={form.tax_code} onChange={v=>setForm(x=>({...x,tax_code:v as any}))} options={[{value:'GST',label:'GST'},{value:'GST_FREE',label:'GST free'},{value:'INPUT_TAXED',label:'Input taxed'},{value:'OUT_OF_SCOPE',label:'Out of scope'}]}/>
    <Field label="Business use %" value={String(form.business_use_percent)} keyboardType="decimal-pad" onChangeText={v=>setForm(x=>({...x,business_use_percent:v}))}/>
    <ChoiceChips value={form.gst_registered?'YES':'NO'} onChange={v=>setForm(x=>({...x,gst_registered:v==='YES'}))} options={[{value:'YES',label:'GST registered'},{value:'NO',label:'Not GST registered'}]}/>
    <ChoiceChips value={form.evidence_confirmed?'YES':'NO'} onChange={v=>setForm(x=>({...x,evidence_confirmed:v==='YES'}))} options={[{value:'YES',label:'Evidence confirmed'},{value:'NO',label:'Evidence pending'}]}/>
    <ChoiceChips value={form.reimbursable?'YES':'NO'} onChange={v=>setForm(x=>({...x,reimbursable:v==='YES'}))} options={[{value:'YES',label:'Reimbursable'},{value:'NO',label:'Not reimbursable'}]}/>
    <Field label="Reference" value={form.reference} onChangeText={v=>setForm(x=>({...x,reference:v}))}/>
    <Field label="Notes" value={form.notes} multiline onChangeText={v=>setForm(x=>({...x,notes:v}))}/>
    <Button mode="contained" loading={busy} disabled={!form.supplier.trim()||!String(form.amount).trim()||busy} onPress={()=>void save()}>{expense?'Save & manage receipt':'Save & add receipt'}</Button>
  </ParityPage>;
}

function ExpenseReceipt({expense,loading,error,onReload}:{expense?:FinanceExpense;loading:boolean;error:string;onReload:()=>Promise<void>}) {
  const router=useRouter();
  const [busy,setBusy]=useState(false),[localError,setLocalError]=useState('');
  const upload=async()=>{
    if(!expense)return;setBusy(true);setLocalError('');
    try{
      const permission=await ImagePicker.requestCameraPermissionsAsync();
      const result=permission.granted?await ImagePicker.launchCameraAsync({mediaTypes:['images'],quality:0.85}):await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:0.85});
      if(result.canceled)return;
      const asset=result.assets[0];const blob=await (await fetch(asset.uri)).blob();
      await finance.uploadReceipt(expense.id,blob,asset.fileName||`receipt-${Date.now()}.jpg`);
      await onReload();
    }catch(e){setLocalError(errorMessage(e,'Unable to upload receipt.'));}finally{setBusy(false);}
  };
  return <ParityPage title="Expense receipt" subtitle="Capture or attach evidence to this expense." loading={loading} error={error||localError}>
    {!expense?<EmptyState title="Expense not found" body="The requested expense is unavailable."/>:<>
      <DataRow title={expense.supplier} subtitle={`${expense.description} · ${money(expense.amount)}`} status={expense.evidence_confirmed?'Evidence confirmed':'Evidence pending'}/>
      <Button mode="contained" icon="camera" loading={busy} onPress={()=>void upload()}>Capture / add receipt</Button>
      <Section title="Receipts">{expense.receipts?.length?expense.receipts.map(r=><DataRow key={r.id} title={r.filename} subtitle={`${Math.ceil(r.size/1024)} KB · ${dateLabel(r.created_at)}`} onPress={()=>router.push(`/finance/receipts/${r.id}` as any)}/>):<EmptyState title="No receipts" body="Add at least one receipt when evidence is required."/>}</Section>
    </>}
  </ParityPage>;
}

function ReceiptScreen({receiptId,loading,error}:{receiptId:number;loading:boolean;error:string}) {
  const [busy,setBusy]=useState(false),[localError,setLocalError]=useState('');
  const open=async()=>{setBusy(true);setLocalError('');try{const blob=await finance.receipt(receiptId);const file=new File(Paths.cache,`receipt-${receiptId}`);file.create({overwrite:true});file.write(new Uint8Array(await blob.arrayBuffer()));if(await Sharing.isAvailableAsync())await Sharing.shareAsync(file.uri,{dialogTitle:'Receipt'});}catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}};
  return <ParityPage title="Receipt" subtitle="Download or share the stored finance evidence." loading={loading} error={error||localError}><InfoNote title="Receipt evidence">Receipt files remain protected by the authenticated finance API.</InfoNote><Button mode="contained" icon="share-variant" loading={busy} onPress={()=>void open()}>Open / share receipt</Button></ParityPage>;
}

function BasScreen() {
  const [start,setStart]=useState(`${financeToday().slice(0,4)}-01-01`),[end,setEnd]=useState(financeToday()),[basis,setBasis]=useState<'cash'|'accrual'>('cash'),[worksheet,setWorksheet]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const calculate=async()=>{setBusy(true);setError('');try{setWorksheet(await finance.worksheet(start,end,basis));}catch(e){setError(errorMessage(e));}finally{setBusy(false);}};
  return <ParityPage title="GST / BAS worksheet" subtitle="Estimate GST fields from supported ChemistTasker finance records." error={error}>
    <InfoNote title="Estimate only" tone="warning">This worksheet is not a lodged BAS and may exclude legacy invoices or unsupported adjustments.</InfoNote>
    <Field label="Start (YYYY-MM-DD)" value={start} onChangeText={setStart}/><Field label="End (YYYY-MM-DD)" value={end} onChangeText={setEnd}/><ChoiceChips value={basis} onChange={v=>setBasis(v as any)} options={[{value:'cash',label:'Cash'},{value:'accrual',label:'Accrual'}]}/><Button mode="contained" loading={busy} onPress={()=>void calculate()}>Calculate worksheet</Button>
    {worksheet?<MetricGrid items={[{label:'G1',value:money(worksheet.G1)},{label:'1A',value:money(worksheet['1A'])},{label:'1B',value:money(worksheet['1B'])},{label:'Estimated GST net',value:money(worksheet.estimated_gst_net),tone:'primary'}]}/>:null}
    {worksheet?.warnings?.length?<Section title="Warnings">{worksheet.warnings.map((w:string,i:number)=><DataRow key={i} title={w} status="Review"/>)}</Section>:null}
  </ParityPage>;
}

function ReceivedDetail({invoice,loading,error,onReload}:{invoice?:FinanceInvoice;loading:boolean;error:string;onReload:()=>Promise<void>}) {
  const [note,setNote]=useState(''),[busy,setBusy]=useState(false),[localError,setLocalError]=useState('');
  const act=async(kind:'approve'|'revise'|'paid')=>{if(!invoice)return;setBusy(true);setLocalError('');try{if(kind==='approve')await finance.approveForPayment(invoice.id,invoice.version,note);if(kind==='revise'){if(!note.trim())throw new Error('Add a revision note first.');await finance.requestRevision(invoice.id,invoice.version,note);}if(kind==='paid')await finance.markReceivedPaid(invoice.id,invoice.version,note);await onReload();}catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}};
  return <ParityPage title="Received invoice" subtitle="Review the current immutable invoice revision." loading={loading} error={error||localError}>
    {!invoice?<EmptyState title="Invoice not found" body="The requested received invoice is unavailable."/>:<>
      <MetricGrid items={[{label:'Invoice',value:invoice.number},{label:'Revision',value:invoice.version},{label:'Payable',value:money(invoice.calculation.payable)},{label:'Balance',value:money(invoice.balance)}]}/>
      <DataRow title={invoice.payload.issuer_name} subtitle={invoice.payload.reference||'No reference'} status={financeStatus(invoice)}/>
      {invoice.last_review_note?<InfoNote title="Latest review note">{invoice.last_review_note}</InfoNote>:null}
      <Field label="Review note" value={note} multiline onChangeText={setNote}/>
      <ActionButtons><Button mode="contained" loading={busy} onPress={()=>void act('approve')}>Approve for payment</Button><Button mode="outlined" disabled={busy||!note.trim()} onPress={()=>void act('revise')}>Request revision</Button><Button disabled={busy} onPress={()=>void act('paid')}>Mark paid</Button></ActionButtons>
    </>}
  </ParityPage>;
}

function InvoiceHistory({invoice,loading,error}:{invoice?:FinanceInvoice;loading:boolean;error:string}) {
  const rows=invoice?.revisions||[];
  return <ParityPage title="Invoice history" subtitle="Immutable invoice revisions and review status." loading={loading} error={error}>
    {!invoice?<EmptyState title="Invoice not found" body="The requested invoice is unavailable."/>:<Section title={invoice.number}>{rows.length?rows.map(r=><DataRow key={r.version} title={`Revision ${r.version}`} subtitle={`${dateLabel(r.created_at)} · payable ${money(r.calculation?.payable)}`} status={replaceUnderscore(r.review_status||r.invoice_status)}/>):<DataRow title={`Revision ${invoice.version}`} subtitle={`Current · ${money(invoice.calculation.payable)}`} status={financeStatus(invoice)}/>}</Section>}
  </ParityPage>;
}

function InvoicePayment({invoice,loading,error,onReload}:{invoice?:FinanceInvoice;loading:boolean;error:string;onReload:()=>Promise<void>}) {
  const router=useRouter();
  const [amount,setAmount]=useState(invoice?.balance||''),[date,setDate]=useState(financeToday()),[reference,setReference]=useState(''),[fundConfirmed,setFundConfirmed]=useState(false),[busy,setBusy]=useState(false),[localError,setLocalError]=useState('');
  useEffect(()=>{if(invoice)setAmount(invoice.balance)},[invoice]);
  const save=async()=>{if(!invoice)return;setBusy(true);setLocalError('');try{await finance.payment(invoice.id,{request_key:idempotencyKey('payment'),date,amount,reference,fund_payment_confirmed:invoice.kind==='super_request'?fundConfirmed:true});await onReload();router.back();}catch(e){setLocalError(errorMessage(e));}finally{setBusy(false);}};
  return <ParityPage title="Record payment" subtitle="Append payment history to the current invoice." loading={loading} error={error||localError}>
    {!invoice?<EmptyState title="Invoice not found" body="The requested invoice is unavailable."/>:<><DataRow title={invoice.number} subtitle={`Balance ${money(invoice.balance)}`} status={financeStatus(invoice)}/><Field label="Amount (AUD)" value={String(amount)} keyboardType="decimal-pad" onChangeText={setAmount}/><Field label="Payment date" value={date} onChangeText={setDate}/><Field label="Reference" value={reference} onChangeText={setReference}/>{invoice.kind==='super_request'?<Chip selected={fundConfirmed} onPress={()=>setFundConfirmed(!fundConfirmed)}>Payment went to super fund</Chip>:null}<Button mode="contained" loading={busy} disabled={!amount||busy||(invoice.kind==='super_request'&&!fundConfirmed)} onPress={()=>void save()}>Record payment</Button></>}
  </ParityPage>;
}
