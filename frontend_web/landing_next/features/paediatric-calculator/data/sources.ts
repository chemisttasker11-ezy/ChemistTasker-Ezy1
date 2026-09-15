import type { Source } from '@/features/paediatric-calculator/lib/types';
const pch = 'https://pch.health.wa.gov.au/-/media/Files/Hospitals/PCH/General-documents/Health-professionals/ChAMP-Monographs/';
const source = (id:string,title:string,url:string,section:string,version='Public document; version not established'): Source => ({id,title,url,section,version,checkedAt:'2026-09-06'});
export const sources: Source[] = [
 source('rch','RCH · Antimicrobial guidelines','https://www.rch.org.au/clinicalguide/guideline_index/Antimicrobial_guidelines/','Indication table and notes','Live web guideline'),
 source('pertussis','RCH · Whooping cough','https://www.rch.org.au/clinicalguide/guideline_index/whooping_cough_pertussis/','Management of cases → Treatment','Live web guideline'),
 source('amoxicillin','PCH · Amoxicillin','https://www.pch.health.wa.gov.au/~/media/Files/Hospitals/PCH/General-documents/Health-professionals/ChAMP-Monographs/Amoxcillin.pdf','pp. 2–5: oral dose, formulations, administration'),
 source('fluconazole','PCH · Fluconazole',pch+'Fluconazole.pdf','pp. 2–4: candidiasis, formulations, monitoring'),
 source('terbinafine','PCH · Terbinafine', 'https://www.pch.health.wa.gov.au/~/media/Files/Hospitals/PCH/General-documents/Health-professionals/ChAMP-Monographs/Terbinafine.pdf','p. 2: age/weight bands; pp. 1, 3: precautions'),
 {...source('cefuroxime','PCH · Cefuroxime','https://cahs.health.wa.gov.au/~/media/Files/Hospitals/PCH/General-documents/Health-professionals/ChAMP-Monographs/Cefuroxime.pdf','pp. 1–3: access, formulation, dose','Reviewed July 2023'),reviewDue:'2026-07-31'},
 source('nitrofurantoin','PCH · Nitrofurantoin','https://rph.health.wa.gov.au/-/media/Files/Hospitals/PCH/General-documents/Health-professionals/ChAMP-Monographs/Nitrofurantoin.pdf','p. 2: lower UTI doses and precautions'),
 source('doxycycline','PCH · Doxycycline',pch+'Doxycycline.pdf','Malaria prophylaxis and administration'),
 source('nystatin',"Chemists’ Own Nystatin · Product information",'https://www.safetyandquality.gov.au/medicine-finder/chemists-own-nystatin-oral-drops','PI sections 2, 4.1 and 4.2','PI reproduced by ACSQHC; page identifies revision May 2024'),
 source('champ','PCH · ChAMP resource collection','https://www.pch.health.wa.gov.au/For-health-professionals/Childrens-Antimicrobial-Management-Program','Medicine-specific monographs; candidate source, not dose verification','Resource directory'),
 source('moxifloxacin','PCH · Moxifloxacin',pch+'Moxifloxacin.pdf','Indications and restrictions: protected antibiotic'),
 source('who','WHO · Childhood tuberculosis','https://www.who.int/publications/i/item/9789240046832','Module 5: specialist regimen guidance','2022 handbook; check subsequent WHO updates'),
 source('chq','CHQ · Paediatric Antibiocard','https://www.childrens.health.qld.gov.au/__data/assets/pdf_file/0037/176878/Antibiocard.pdf','Legacy reference records; individual doses await revalidation','v10.2 in supplied export'),
 source('weight','Age-based weight estimation · validation study','https://pmc.ncbi.nlm.nih.gov/articles/PMC3463167/','APLS 2011 formulae, Methods','2012 study; historical estimation method'),
];
export const getSource = (id: string) => sources.find(s=>s.id===id)!;
