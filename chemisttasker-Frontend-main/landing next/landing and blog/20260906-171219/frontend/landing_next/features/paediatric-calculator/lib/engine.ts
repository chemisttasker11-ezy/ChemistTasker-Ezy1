import type { Formulation, PatientInput, Regimen } from './types';
export const format = (n:number) => n>0&&n<0.001?'<0.001':new Intl.NumberFormat('en-AU',{maximumFractionDigits:3}).format(n);
export function patient(input:PatientInput) {
 const errors:string[]=[];
 const parse=(s:string)=>s.trim()===''?undefined:/^(?:\d+\.?\d*|\.\d+)$/.test(s.trim())?Number(s):NaN;
 const years=parse(input.years),months=parse(input.months),measured=parse(input.weight);
 if(years!==undefined&&(!Number.isInteger(years)||years<0||years>17))errors.push('Years must be a whole number from 0 to 17.');
 if(months!==undefined&&(!Number.isInteger(months)||months<0||months>11))errors.push('Additional months must be a whole number from 0 to 11.');
 const ageMonths=years===undefined&&months===undefined?undefined:(years??0)*12+(months??0);
 if(ageMonths===undefined)errors.push('Enter age so the neonatal exclusion and age limits can be checked.');
 else if(ageMonths<1)errors.push('Under 1 month: neonatal dosing is outside this calculator.');
 else if(ageMonths>=216)errors.push('This calculator is for children under 18 years.');
 if(measured!==undefined&&(!Number.isFinite(measured)||measured<0.5||measured>300))errors.push('Measured weight must be within this app’s supported range: 0.5–300 kg.');
 let weight=measured,formula='',estimated=false;
 // Completed months for infants and completed years for children; no extrapolation beyond 12 years.
 if(measured===undefined&&ageMonths!==undefined&&ageMonths>=1&&ageMonths<156&&errors.length===0){
  const y=Math.floor(ageMonths/12);
  weight=ageMonths<12?0.5*ageMonths+4:y<6?2*y+8:3*y+7;
  formula=ageMonths<12?`0.5 × ${ageMonths} months + 4` : y<6?`2 × ${y} completed years + 8`:`3 × ${y} completed years + 7`;
  estimated=true;
 }
 if(measured===undefined&&ageMonths!==undefined&&ageMonths>=156)errors.push('Age estimation stops at 12 completed years. Enter measured weight.');
 if(input.organConcern)errors.push('Renal or hepatic impairment: individual dose adjustment is not implemented.');
 if(input.allergyConcern)errors.push('Possible allergy or contraindication: resolve suitability with the treating clinician before calculating.');
 if(input.complexConcern)errors.push('Complex dosing context: obesity/adjusted weight, immunocompromise or critical illness needs an individual plan.');
 return {ageMonths,weight,estimated,formula,errors};
}
export function calculate(regimen:Regimen,input:PatientInput,form?:Formulation,specialistConfirmed=false){
 const p=patient(input);
 const blockers=[...p.errors];
 if(regimen.category==='reference'||!regimen.dose)blockers.push('Reference only: no reviewed calculation is enabled for this regimen.');
 if(regimen.category==='specialist'&&!specialistConfirmed)blockers.push('Confirm an existing specialist / treating-team plan to calculate this regimen.');
 if(p.ageMonths!==undefined&&(p.ageMonths<regimen.minMonths||(regimen.maxMonths!==undefined&&p.ageMonths>=regimen.maxMonths)))blockers.push('The child’s age is outside this regimen’s supported band.');
 if(p.weight!==undefined&&regimen.minKg!==undefined&&p.weight<regimen.minKg)blockers.push(`This regimen requires a weight of at least ${regimen.minKg} kg.`);
 if(p.weight===undefined)blockers.push('Enter measured weight or a supported age.');
 if(form&&regimen.allowedForms&&!regimen.allowedForms.includes(form.id))blockers.push('This formulation does not match the regimen.');
 if(form&&form.unit!==regimen.unit)blockers.push('The formulation and regimen use different dose units.');
 if(blockers.length||!regimen.dose||p.weight===undefined)return {patient:p,blockers};
 const dose=regimen.dose;
 let raw:number,upper:number;
 if(dose.kind==='weight'){const divisor=dose.basis==='day'?regimen.frequency:1;raw=dose.amount*p.weight/divisor;upper=(dose.upper??dose.amount)*p.weight/divisor;}
 else if(dose.kind==='fixed'){raw=upper=dose.amount;}
 else {const band=dose.bands.find(b=>b.below===null||p.weight!<b.below);if(!band)return {patient:p,blockers:['No matching weight band.']};raw=upper=band.amount;}
 const cap=Math.min(regimen.maxDose??Infinity,regimen.maxDay===undefined?Infinity:regimen.maxDay/regimen.frequency);
 const amount=Math.min(raw,cap),high=Math.min(upper,cap);
 if(!Number.isFinite(amount)||!Number.isFinite(high)||amount<=0||high<=0)return {patient:p,blockers:['Dose configuration invalid. Calculation withheld.']};
 const concentration=form?.concentration;
 if(concentration!==undefined&&(!Number.isFinite(concentration)||concentration<=0))return {patient:p,blockers:['Formulation concentration invalid.']};
 return {patient:p,blockers,amount,high,raw,rawHigh:upper,capped:raw>cap||upper>cap,daily:amount*regimen.frequency,dailyHigh:high*regimen.frequency,volume:concentration?amount/concentration:undefined,volumeHigh:concentration?high/concentration:undefined};
}
