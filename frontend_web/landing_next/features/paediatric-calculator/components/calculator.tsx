'use client';

import { useMemo, useState } from 'react';

import { MeasuringCylinder } from './measuring-cylinder';

import { MedicineBottle, MedicineSpoon } from './medicine-icons';

import { ArrowUpRight, BookOpen, Check, ChevronRight, CircleHelp, Info, Layers3, LockKeyhole, Pill, RotateCcw, Search, ShieldCheck, Calculator as CalculatorIcon, Stethoscope, TriangleAlert, Weight } from 'lucide-react';

import { medicines, legacy } from '@/features/paediatric-calculator/data/medicines';

import { regimens } from '@/features/paediatric-calculator/data/regimens';

import { getSource, sources } from '@/features/paediatric-calculator/data/sources';

import { calculate, format, patient } from '@/features/paediatric-calculator/lib/engine';

import type { Formulation, PatientInput, Regimen } from '@/features/paediatric-calculator/lib/types';

const initial:PatientInput={years:'',months:'',weight:'',organConcern:false,allergyConcern:false,complexConcern:false};

function SourceLink({id}:{id:string}) {const s=getSource(id);return <a className="source-link" href={s.url} target="_blank" rel="noreferrer">{s.title}<ArrowUpRight size={14}/></a>;}

function Status({type}:{type:string}) {return <span className={`status ${type}`}>{type==='calculation'?<Check size={13}/>:type==='specialist'?<Stethoscope size={13}/>:<BookOpen size={13}/>} {type==='calculation'?'Calculation available':type==='specialist'?'Specialist guidance':'Reference only'}</span>;}

function RegimenCard({regimen,input,form,customError,med}:{regimen:Regimen;input:PatientInput;form?:Formulation;customError:boolean;med:{name:string;specialist:boolean}}){

 const [specialist,setSpecialist]=useState(false);

 const p=patient(input);const result=calculate(regimen,input,form,specialist);

 const ready=result.amount!==undefined&&!customError;

 const range=(a:number,b?:number)=>b!==undefined&&Math.abs(a-b)>0.000001?`${format(a)}–${format(b)}`:format(a);

 return <section className="regimen-row" data-regimen={regimen.id}><div className="result-heading"><div><h3>{regimen.indication}</h3></div><Status type={regimen?.category??(med.specialist?'specialist':'reference')}/></div>

 {regimen?.category==='specialist'&&<div className="specialist-notice"><Stethoscope size={20}/><div><strong>Use within an existing clinical plan</strong><p>{regimen.note}</p><label className="check"><input type="checkbox" checked={specialist} onChange={e=>setSpecialist(e.target.checked)}/>I am checking a dose against a specialist / treating-team plan.</label></div></div>}

 <div aria-live="polite" aria-atomic="true">{ready?<><div className={`dose-surface ${p.estimated?'dose-estimated':''}`}><div className="dose-kicker">{p.estimated?'AGE-ESTIMATED WEIGHT':'MEASURED WEIGHT'} · {format(p.weight!)} KG · {regimen!.route.toUpperCase()}</div><div className="dose-main"><div><span className="dose-label">Amount per dose</span><div className="dose-number">{range(result.amount!,result.high)} <span>{regimen!.unit}</span></div><p>{regimen!.frequencyText}</p></div><div className="volume-result"><span className="dose-label">{result.volume!==undefined?'Liquid per dose':'Liquid volume'}</span><strong>{result.volume!==undefined?<>{range(result.volume,result.volumeHigh)} <span>mL</span></>:'Not selected'}</strong><p>{form?.label??'Select or enter a liquid strength'}</p></div></div>{p.estimated&&<div className="estimate-banner"><TriangleAlert size={15}/> Estimated weight, not a measured weight. Verify before use.</div>}</div>

 <div className="result-facts"><div><span>Duration</span><strong>{regimen!.duration}</strong></div><div><span>Total per day{regimen!.frequencyText==='Single dose'?' (single dose)':''}</span><strong>{range(result.daily!,result.dailyHigh)} {regimen!.unit}</strong></div><div><span>Maximum</span><strong>{regimen!.maxDose?`${format(regimen!.maxDose)} ${regimen!.unit} / dose`:'Not specified in this record'}</strong></div></div>

 {result.capped&&<p className="cap-note"><ShieldCheck size={16}/> Source maximum applied. The uncapped amount was {range(result.raw!,result.rawHigh)} {regimen!.unit} per dose.</p>}

 {result.high!==result.amount&&<p className="range-note">This is a source dose range, not an instruction to choose its midpoint. Confirm the intended dose with the prescriber.</p>}

 <details className="calculation-details"><summary>How this was calculated <ChevronRight size={16}/></summary><p>{regimen!.dose?.kind==='weight'?`${range(regimen!.dose.amount,regimen!.dose.upper)} ${regimen!.unit}/kg/${regimen!.dose.basis??'dose'} × ${format(p.weight!)} kg${regimen!.dose.basis==='day'?` ÷ ${regimen!.frequency} doses`:''}`:regimen!.dose?.kind==='fixed'?'Fixed dose from the selected product information.':'Dose selected from the source’s weight bands.'}{result.capped?' → limited to the source maximum.':'.'}</p>{result.volume!==undefined&&<p>{range(result.amount!,result.high)} {regimen!.unit} ÷ {format(form!.concentration!)} {regimen!.unit}/mL = {range(result.volume,result.volumeHigh)} mL per dose.</p>}<p className="muted">Display uses up to 3 decimal places; no administration rounding is applied. Select an appropriate measuring device and confirm measurable rounding.</p>{p.estimated&&<SourceLink id="weight"/>}</details>

 </>:<div className="row-blockers">{(customError?['Enter a positive, valid liquid strength and volume.',...result.blockers]:result.blockers).filter(e=>!p.errors.includes(e)).map(e=><p key={e}>{e}</p>)}</div>}</div>

 {regimen.note&&regimen.category!=='specialist'&&<div className="context-note"><Info size={18}/><p>{regimen.note}</p></div>}

 {regimen&&<div className="evidence-footer"><BookOpen size={18}/><div><SourceLink id={regimen.sourceId}/><p>{getSource(regimen.sourceId).section} · Checked {getSource(regimen.sourceId).checkedAt}</p></div></div>}

 </section>;

}

export default function Calculator(){

 const [tab,setTab]=useState('calculator');const [search,setSearch]=useState('');const [family,setFamily]=useState('All classes');const [coverage,setCoverage]=useState('All coverage');

 const [medicineId,setMedicineId]=useState('amoxicillin');

 const [input,setInput]=useState(initial);const [formId,setFormId]=useState('');

 const [customAmount,setCustomAmount]=useState('');const [customMl,setCustomMl]=useState('5');

 const med=medicines.find(m=>m.id===medicineId)!;const available=regimens.filter(r=>r.ingredient===medicineId&&r.route==='oral');

 const p=patient(input);const unit=med.id==='nystatin'?'units':'mg';

 const update=(key:keyof PatientInput,value:string|boolean)=>{setInput(old=>({...old,[key]:value}));};

 const selectMedicine=(id:string)=>{setMedicineId(id);setFormId('');setCustomAmount('');};

 const actualFormId=formId||(med.formulations[0]?.id??'dose-only');

 let form:Formulation|undefined=med.formulations.find(f=>f.id===actualFormId);

 const customValid=customAmount.trim()!==''&&customMl.trim()!==''&&Number.isFinite(Number(customAmount))&&Number.isFinite(Number(customMl))&&Number(customAmount)>0&&Number(customMl)>0;

 if(actualFormId==='custom'&&customValid)form={id:'custom',label:`${customAmount} ${unit} / ${customMl} mL (entered from pack)`,concentration:Number(customAmount)/Number(customMl),unit:unit,sourceId:''};

 const customError=actualFormId==='custom'&&!customValid;

 const activeIds=new Set(regimens.filter(r=>r.category!=='reference').map(r=>r.ingredient));

 const filtered=useMemo(()=>medicines.filter(m=>(m.name+' '+m.id).toLowerCase().includes(search.toLowerCase())&&(family==='All classes'||m.family===family)&&(coverage==='All coverage'||(coverage==='With calculations'?activeIds.has(m.id):!activeIds.has(m.id)))),[search,family,coverage]);

 const range=(a:number,b?:number)=>b!==undefined&&Math.abs(a-b)>0.000001?`${format(a)}–${format(b)}`:format(a);

 const legacyMatches=legacy.filter(r=>r.ingredient===med.id&&r.route==='oral');

 return <>

 <a className="skip" href="#workspace">Skip to calculator</a>

 <div className="calculator-toolbar"><div className="header-inner"><span className="header-label">Clinical tools</span><span className="private-badge"><LockKeyhole size={13}/> Clinical validation pending</span></div></div>

 <main id="workspace" className="shell"><button className="calculator-back" type="button" onClick={()=>{if(window.history.length>1)window.history.back();else window.location.assign('/');}}>← Back</button>

 <div className="intro"><div><div className="eyebrow"><span/> FOR HEALTH PROFESSIONALS</div><h1>Small patients.<br className="mobile-break"/> <span>Clearer calculations.</span></h1><p>Paediatric anti-infectives, with the source behind every calculation.</p></div><div className="intro-mark" aria-hidden="true"><MeasuringCylinder/><span className="mark-plus">+</span></div></div>

 <div className="review-note"><ShieldCheck size={18}/><p><strong>Decision support · clinical validation pending.</strong> Check the source and product label before use. This preview does not assess treatment suitability.</p><a href="#scope" onClick={()=>setTab('sources')}>Scope <ArrowUpRight size={14}/></a></div>

 <nav className="tabs" aria-label="Calculator sections">{[['calculator','Dose calculator',CalculatorIcon],['library','Medicine library',MedicineBottle],['sources','Sources & scope',BookOpen]].map(([id,label,Icon])=>{const I=Icon as typeof Pill;return <button key={id as string} onClick={()=>setTab(id as string)} aria-current={tab===id?'page':undefined} className={tab===id?'active':''}><I size={17}/>{label as string}{id==='library'&&<span>{medicines.length}</span>}</button>;})}<div className="local-note"><LockKeyhole size={12}/> Patient inputs stay in this browser tab</div></nav>

 {tab==='calculator'&&<div className="workspace-grid">

 <aside className="input-column"><section className="panel patient-panel"><div className="section-title"><span className="step">01</span><h2>Patient details</h2><button className="icon-button" aria-label="Reset patient details" onClick={()=>{setInput(initial);}}><RotateCcw size={16}/></button></div><p className="section-help">Age checks eligibility. Measured weight takes priority.</p>

 <div className="age-row"><div><label htmlFor="years">Age <span>years</span></label><input id="years" type="text" inputMode="numeric" placeholder="0" value={input.years} onChange={e=>update('years',e.target.value)}/></div><div><label htmlFor="months">Additional <span>months</span></label><input id="months" type="text" inputMode="numeric" placeholder="0" value={input.months} onChange={e=>update('months',e.target.value)}/></div></div>

 <label htmlFor="weight">Measured weight <span>optional</span></label><div className="unit-input"><input id="weight" type="text" inputMode="decimal" placeholder="Enter if available" value={input.weight} onChange={e=>update('weight',e.target.value)}/><span>kg</span></div>

 <div className={`weight-note ${p.estimated?'estimated':''}`}><Weight size={17}/><div>{p.estimated?<><strong>Using age-estimated weight: {format(p.weight!)} kg</strong><span>{p.formula}. Enter measured weight when available.</span></>:input.weight&&p.errors.length===0?<><strong>Using measured weight: {format(p.weight!)} kg</strong><span>Your measurement overrides age estimation.</span></>:<><strong>No measured weight?</strong><span>We estimate automatically from a supported age.</span></>}</div></div>

 <details className="clinical-checks"><summary>Clinical considerations <ChevronRight size={15}/></summary><p>Standard calculations assume normal organ function and no contraindication. Mark any concern to withhold the result.</p>{[['organConcern','Renal or hepatic impairment'],['allergyConcern','Allergy / contraindication concern'],['complexConcern','Obesity, immunocompromise or critical illness']].map(([key,label])=><label className="check" key={key}><input type="checkbox" checked={input[key as keyof PatientInput] as boolean} onChange={e=>update(key as keyof PatientInput,e.target.checked)}/>{label}</label>)}</details>

 </section>

 <section className="panel medicine-panel"><div className="section-title"><span className="step">02</span><h2>Medicine & formulation</h2></div><label htmlFor="medicine">Active ingredient</label><select id="medicine" value={medicineId} onChange={e=>selectMedicine(e.target.value)}>{medicines.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>

 {<><label htmlFor="form">Dose form & strength</label><select id="form" value={actualFormId} onChange={e=>setFormId(e.target.value)}>{med.formulations.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}{!available.some(r=>r.allowedForms)&&<><option value="dose-only">Dose only · no volume conversion</option><option value="custom">Enter liquid strength from pack</option></>}</select>{actualFormId==='custom'&&<div className="custom-form"><div><label htmlFor="strength">{unit} on label</label><input id="strength" type="number" min="0" step="any" value={customAmount} onChange={e=>setCustomAmount(e.target.value)} placeholder="e.g. 125"/></div><div><label htmlFor="volume">per mL</label><input id="volume" type="number" min="0" step="any" value={customMl} onChange={e=>setCustomMl(e.target.value)}/></div><p>Transcribe the exact liquid label. Do not substitute a tablet strength or a different combination ratio.</p></div>}</>}

 <p className="small-note"><Info size={14}/> Each result below identifies its indication and source.</p></section>

 <div className="sidebar-foot"><BookOpen size={16}/><p>Source-specific regimens.<br/>No adult-dose extrapolation.</p></div></aside>

 <div className="result-column"><section className="panel unified-results"><div className="unified-heading"><MedicineSpoon size={24}/><div><div className="eyebrow">ORAL REGIMENS</div><h2>{med.name}</h2></div></div><div className="context-note"><Info size={18}/><p>All available oral regimens are shown below. These are separate treatment options, not instructions to combine them. Confirm the intended indication with the prescriber.</p></div>

 {p.errors.length>0&&<div className="shared-input-note"><strong>Patient details needed</strong><ul>{p.errors.map(e=><li key={e}>{e}</li>)}</ul></div>}

 {p.estimated&&<p className="shared-input-note">Using age-estimated weight: {format(p.weight!)} kg. Verify against measured weight before use.</p>}

 {available.map(regimen=><RegimenCard key={regimen.id+JSON.stringify(input)+actualFormId+customAmount+customMl} regimen={regimen} input={input} form={form} customError={customError} med={med}/>)}

 {!available.length&&<section className="panel empty-result"><h2>{med.name}</h2><h3>Reference only · calculation pending</h3><p>No reviewed oral paediatric regimen is enabled for this ingredient yet.</p></section>}



 <details className="compact-support"><summary>Giving it to a child · administration notes</summary><p>{med.administration}</p>{med.formulations[0]&&<SourceLink id={med.formulations[0].sourceId}/>}<div className="support-grid"><div><span>Crushing & opening</span><strong>Check the exact product</strong></div><div><span>Storage & mixing</span><strong>Follow the product label</strong></div></div></details>

 <details className="compact-support"><summary>Australian product information</summary><p>{med.registration}</p><div className="link-row"><a href="https://www.tga.gov.au/resources/artg" target="_blank" rel="noreferrer">Search TGA ARTG <ArrowUpRight size={15}/></a><a href="https://www.pbs.gov.au" target="_blank" rel="noreferrer">Search PBS <ArrowUpRight size={15}/></a></div><small>Register searches are not ingredient-specific verification. No unverified product images are shown.</small></details>

 {legacyMatches.length>0&&<details className="compact-support legacy"><summary>Earlier reference coverage <span>{legacyMatches.length} records</span><ChevronRight size={16}/></summary><p>Recovered from your previous calculator. Original numerical records are preserved in the project, but are not enabled until checked against the source.</p><ul>{legacyMatches.map(r=><li key={r.id}><span>{r.indication}</span><span className="muted">{r.route}</span></li>)}</ul><SourceLink id="chq"/></details>}

 </section></div></div>}

 {tab==='library'&&<section className="library"><div className="library-heading"><div className="eyebrow">COVERAGE, MADE VISIBLE</div><h2>The medicine library</h2><p>{medicines.length} ingredients in scope · {activeIds.size} with source-transcribed calculations · remaining entries are references.</p></div><div className="library-controls"><div className="search"><Search size={18}/><input aria-label="Search medicine library" placeholder="Search ingredient or synonym…" value={search} onChange={e=>setSearch(e.target.value)}/></div><select aria-label="Filter by drug class" value={family} onChange={e=>setFamily(e.target.value)}><option>All classes</option>{[...new Set(medicines.map(m=>m.family))].map(f=><option key={f}>{f}</option>)}</select><select aria-label="Filter by calculation coverage" value={coverage} onChange={e=>setCoverage(e.target.value)}><option>All coverage</option><option>With calculations</option><option>Reference only</option></select></div><p className="muted">{filtered.length} medicines · Existing oral ingredient list; remaining evidence and formulation gaps are under review.</p><div className="medicine-list">{filtered.map(m=>{const rs=regimens.filter(r=>r.ingredient===m.id&&r.category!=='reference');return <button key={m.id} className="library-item" onClick={()=>{selectMedicine(m.id);setTab('calculator');}}><div className="medicine-icon"><Pill size={20}/></div><div><h3>{m.name}</h3><p>{m.family} · {rs.length?`${rs.length} calculation ${rs.length===1?'regimen':'regimens'}`:'No verified paediatric regimen available in this app'}</p></div><Status type={rs.length?(rs.every(r=>r.category==='specialist')?'specialist':'calculation'):m.specialist?'specialist':'reference'}/><ChevronRight size={18}/></button>;})}</div>{!filtered.length&&<div className="panel empty-result"><Search size={24}/><h3>No medicines match</h3><button className="primary" onClick={()=>{setSearch('');setFamily('All classes');setCoverage('All coverage');}}>Clear filters</button></div>}</section>}

 {tab==='sources'&&<section id="scope" className="scope"><div className="library-heading"><div className="eyebrow">TRACEABLE BY DESIGN</div><h2>Sources, scope & limitations</h2><p>Public references support this build. Source transcription is separate from independent clinical validation.</p></div><div className="scope-grid"><div className="panel"><h3>What this version calculates</h3><p>Selected oral regimens for children aged 1 month to under 18 years. Age is required to check eligibility. Weight is estimated only when the measured-weight field is empty and age is within 1–12 completed years or 1–11 months.</p><p>Infant estimation: 0.5 × months + 4 kg. Ages 1–5: 2 × completed years + 8 kg. Ages 6–12: 3 × completed years + 7 kg. These are historical APLS estimates, not a substitute for weighing a child.</p><SourceLink id="weight"/></div><div className="panel"><h3>What stays outside the calculation</h3><p>Neonates, renal/hepatic adjustments, obesity or adjusted-weight dosing, critical illness and immunocompromise require individual assessment. Allergy and interaction screening are not automated.</p><p>Unreviewed oral medicines are reference-only. Specialist calculations require an existing treatment plan. No patient inputs are stored, logged by this app, or sent to a clinical backend.</p></div></div><div className="source-list">{sources.map(s=><article className="panel source-card" key={s.id}><div><BookOpen size={20}/><h3>{s.title}</h3></div><p>{s.section}</p><small>{s.version} · Access checked {s.checkedAt}{s.reviewDue?` · Source review due ${s.reviewDue} — calculation withheld`:''}</small><a href={s.url} target="_blank" rel="noreferrer">Open reference <ArrowUpRight size={15}/></a></article>)}</div><div className="panel scope-foot"><h3>Release and evidence governance</h3><p>Every active regimen needs independent pharmacist/clinician sign-off before public clinical release. Access dates do not establish a source’s currency. Registration, commercial reuse permissions, local antimicrobial policy and formulation availability need a separate review. AMH, eMIMS and BNFC text is not included.</p></div></section>}

 <footer><span>ChemistTasker <span className="footer-dot">/</span> Paediatric anti-infectives</span><span>Made for a more informed check.</span><button onClick={()=>setTab('sources')}><CircleHelp size={15}/> Sources & limitations</button></footer>

 </main></>;

}

