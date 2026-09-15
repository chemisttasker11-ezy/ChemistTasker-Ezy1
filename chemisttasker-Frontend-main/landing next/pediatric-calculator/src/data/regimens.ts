import type { Regimen } from '@/lib/types';
const r=(id:string,ingredient:string,indication:string,amount:number,frequency:number,maxDose:number,sourceId:string,duration:string,note='',minMonths=1):Regimen=>({id,ingredient,indication,route:'oral',category:'calculation',dose:{kind:'weight',amount},unit:'mg',frequency,frequencyText:frequency===1?'Once daily':`${frequency} times daily`,maxDose,minMonths,duration,note,sourceId});
// Source-transcribed development records. No independent clinical sign-off is asserted.
// Each indication retains its own source; differing hospital recommendations are not averaged.
export const regimens: Regimen[] = [
 r('amox-aom','amoxicillin','Acute otitis media · antibiotics indicated',30,2,1000,'rch','5 days','Confirm that antibiotics are indicated; the guideline allows observation for selected children.'),
 r('amox-cap','amoxicillin','Pneumonia · mild, outpatient',30,3,1000,'rch','3–5 days','For uncomplicated outpatient disease; assess severity first.'),
 r('cefalexin-impetigo','cefalexin','Impetigo · oral treatment',20,3,750,'rch','5 days','Localised disease may be managed topically.'),
 r('cefalexin-uti','cefalexin','UTI · well child, over 3 months',20,3,750,'rch','5 days','Not for systemic illness or pyelonephritis.',3.01),
 r('trimethoprim-uti','trimethoprim','UTI · well child, over 3 months',4,2,150,'rch','5 days','Not for systemic illness or pyelonephritis.',3.01),
 r('metronidazole-giardia','metronidazole','Giardiasis',30,1,2000,'rch','3 days'),
 {...r('amox-usual','amoxicillin','PCH · usual oral dose range',15,3,1000,'amoxicillin','Indication dependent','A range is shown; the prescriber must select the appropriate regimen.'),dose:{kind:'weight',amount:15,upper:25}},
 {...r('amox-dental-prophylaxis','amoxicillin','Endocarditis prophylaxis · high risk',50,1,2000,'amoxicillin','Single dose','Only for eligible high-risk patients; give 30–60 minutes before the procedure.'),category:'specialist',frequencyText:'Single dose'},
 r('clarithro-pertussis','clarithromycin','Pertussis · treatment',7.5,2,500,'pertussis','7 days','Assess treatment indication and interactions. Infants under 6 months may need admission.'),
 {...r('azithro-young','azithromycin','Pertussis · under 6 months',10,1,500,'pertussis','5 days','Infants under 6 months may need admission.'),maxDose:undefined,maxMonths:6},
 {...r('azithro-day1','azithromycin','Pertussis · age ≥6 months · day 1',10,1,500,'pertussis','Day 1 only','Use the separate days 2–5 regimen for the rest of the course.',6)},
 r('azithro-day2','azithromycin','Pertussis · age ≥6 months · days 2–5',5,1,250,'pertussis','Days 2–5','This is the maintenance phase after the day 1 dose.',6),
 {...r('fluconazole-oral','fluconazole','Superficial / oral candidiasis',6,1,200,'fluconazole','Prescriber to specify','PCH monitored agent. Review interactions, QT risk and liver function.'),category:'specialist'},
 {...r('fluconazole-oesophageal','fluconazole','Oesophageal candidiasis · higher-dose option',12,1,600,'fluconazole','Prescriber to specify','PCH monitored agent; confirm this higher-dose option with the treating team.'),category:'specialist'},
 {...r('nitro-treatment','nitrofurantoin','Uncomplicated lower UTI · liquid dose range',0.75,4,100,'nitrofurantoin','Prescriber to specify','Not for upper UTI. Avoid in G6PD deficiency; renal function and body-weight method require review.'),dose:{kind:'weight',amount:0.75,upper:1.75}},
 {...r('nitro-prophylaxis','nitrofurantoin','UTI prophylaxis · liquid dose range',1,1,100,'nitrofurantoin','Specialist plan','Not routine prophylaxis. Review G6PD status and renal function.'),dose:{kind:'weight',amount:1,upper:2},category:'specialist',frequencyText:'Once daily at bedtime'},
 {...r('terbinafine-tinea','terbinafine','Tinea capitis',0,1,250,'terbinafine','4–6 weeks','Do not use with chronic or active liver disease. Confirm product suitability for the required partial-tablet dose.',12),minKg:10,dose:{kind:'bands',bands:[{below:20,amount:62.5},{below:40,amount:125},{below:null,amount:250}]}},
 {...r('doxy-malaria','doxycycline','Malaria prophylaxis',2,1,100,'doxycycline','Start 2 days before travel; continue 4 weeks after leaving','Travel-medicine assessment needed; check destination and suitability.',96),category:'specialist'},
 {...r('nystatin-oral','nystatin','Oral candidiasis · Chemists’ Own drops',100000,4,100000,'nystatin','Follow prescriber / product information','For the specified oral drops only; hold in the mouth before swallowing where feasible.'),unit:'units',dose:{kind:'fixed',amount:100000},allowedForms:['nystatin-drops']},
 // Cefuroxime is deliberately reference-only: retrieved monograph review date has elapsed.
 {...r('cefuroxime-reference','cefuroxime','ENT / respiratory infections',15,2,500,'cefuroxime','Source review required','Tablets and liquid differ in bioavailability. PCH identifies the liquid as SAS; source review date July 2026 has elapsed.',3),category:'reference',dose:undefined},
];
