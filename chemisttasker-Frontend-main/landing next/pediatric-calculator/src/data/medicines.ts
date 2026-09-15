import type { Medicine, Formulation } from '@/lib/types';
import legacy from './legacy-regimens.json';
import { regimens } from './regimens';
const groups:Record<string,string[]>={
 'Antibacterial':['amoxicillin','amoxicillin-clavulanate','phenoxymethylpenicillin','flucloxacillin','dicloxacillin','cefalexin','cefaclor','cefuroxime','azithromycin','clarithromycin','erythromycin','roxithromycin','clindamycin','doxycycline','minocycline','trimethoprim','trimethoprim-sulfamethoxazole','nitrofurantoin','metronidazole','ciprofloxacin','moxifloxacin','rifaximin','methenamine','sodium-fusidate','sulfadiazine','fidaxomicin','vancomycin'],
 'Antifungal':['fluconazole','nystatin','terbinafine','itraconazole','griseofulvin','flucytosine','posaconazole','voriconazole','isavuconazole'],
 'Antiviral':['aciclovir','valaciclovir','famciclovir','oseltamivir','valganciclovir','maribavir'],
 'TB / specialist':['rifampicin','isoniazid','pyrazinamide','ethambutol','clofazimine','cycloserine','dapsone'],
 'Antiparasitic':['albendazole','mebendazole','ivermectin','pyrantel','tinidazole'],
};
const names:Record<string,string>={'amoxicillin-clavulanate':'Amoxicillin + clavulanic acid','trimethoprim-sulfamethoxazole':'Trimethoprim + sulfamethoxazole','piperacillin-tazobactam':'Piperacillin + tazobactam','sodium-fusidate':'Sodium fusidate','cefalexin':'Cefalexin (cephalexin)'};
const specialist=new Set(['moxifloxacin','vancomycin','fidaxomicin','flucytosine','posaconazole','voriconazole','isavuconazole','valganciclovir','maribavir','rifampicin','isoniazid','pyrazinamide','ethambutol','clofazimine','cycloserine','dapsone','sulfadiazine']);
const forms:Record<string,Formulation[]>={
 amoxicillin:[{id:'amox-250',label:'250 mg / 5 mL suspension',concentration:50,unit:'mg',sourceId:'amoxicillin'}],
 fluconazole:[{id:'fluconazole-10',label:'10 mg / mL suspension',concentration:10,unit:'mg',sourceId:'fluconazole'}],
 nitrofurantoin:[{id:'nitro-10',label:'10 mg / mL suspension',concentration:10,unit:'mg',sourceId:'nitrofurantoin'}],
 nystatin:[{id:'nystatin-drops',label:'100,000 units / mL · Chemists’ Own drops',concentration:100000,unit:'units',sourceId:'nystatin'}],
};
export const medicines:Medicine[]=Object.entries(groups).flatMap(([family,ids])=>ids.map(id=>({
 id,name:names[id]??id[0].toUpperCase()+id.slice(1),family,specialist:specialist.has(id),formulations:forms[id]??[],
 sourceIds:[...new Set([...regimens.filter(r=>r.ingredient===id).map(r=>r.sourceId),...(id==='moxifloxacin'?['moxifloxacin']:[]),...(family==='TB / specialist'?['who']:[]),...(legacy.some(r=>r.ingredient===id)?['chq']:[]),'champ'])],
 registration:id==='cefuroxime'?'PCH identifies tablets as registered and liquid as SAS. Current product status requires checking.':'Current ARTG registration and supply have not been audited in this build. A source-listed strength is not a stock-availability claim.',
 administration:id==='amoxicillin'?'Shake suspension before measuring. Food is optional. Storage after reconstitution varies by brand: follow the actual pack label.':id==='fluconazole'?'Shake suspension before measuring; may be taken with or without food. See the source for monitoring and storage.':id==='nystatin'?'Shake well and use the supplied measuring device. Hold the dose in the mouth as long as feasible before swallowing.':'Use the exact product’s instructions. Crushing, capsule opening, mixing and storage have not been verified for every formulation.',
}))).sort((a,b)=>a.name.localeCompare(b.name));
export { legacy };
