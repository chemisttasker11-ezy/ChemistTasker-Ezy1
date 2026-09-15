import fs from 'node:fs';
import { medicines, legacy } from '../src/data/medicines';
import { regimens } from '../src/data/regimens';
import { getSource } from '../src/data/sources';
const rows=[['Ingredient','Class','Enabled development regimens','Legacy reference records','Source candidates','Registration review','Clinical sign-off']];
for(const m of medicines)rows.push([m.name,m.family,String(regimens.filter(r=>r.ingredient===m.id&&r.category!=='reference').length),String(legacy.filter(r=>r.ingredient===m.id).length),m.sourceIds.map(id=>getSource(id).title).join('; '),m.registration,'Pending']);
fs.mkdirSync('docs',{recursive:true});fs.writeFileSync('docs/COVERAGE.csv',rows.map(row=>row.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\n')+'\n');
console.log(JSON.stringify({ingredients:medicines.length,activeRegimens:regimens.filter(r=>r.category!=='reference').length,activeIngredients:new Set(regimens.filter(r=>r.category!=='reference').map(r=>r.ingredient)).size,legacyRecords:legacy.length}));
