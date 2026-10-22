import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire,Module} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

// Node's type stripping cannot load TSX or extensionless imports, so compile the source with the app's TypeScript.
function load(relative,stubs={}){
 const filename=fileURLToPath(new URL(relative,import.meta.url));
 const {outputText}=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}});
 const compiled=new Module(filename);compiled.filename=filename;
 const resolve=createRequire(filename);compiled.require=id=>id in stubs?stubs[id]:resolve(id);
 compiled._compile(outputText,filename);
 return compiled.exports;
}
// shared-core's dist only resolves under a bundler; navigation needs just its capability names.
const nav=load('../src/navigation.tsx',{'./constants/adminCapabilities':load('../../shared-core/src/constants/capabilities.ts'),'@chemisttasker/shared-core':{}});

const calendarItems=(navigation,segment)=>navigation.filter(item=>item.segment===segment);
test('organization Calendar is reachable by either former Operations permission and nothing else',()=>{
 for(const capabilities of [['manage_roster'],['manage_communications'],['manage_roster','manage_communications']]){
  const navigation=nav.getOrganizationNav(false,capabilities);
  assert.equal(calendarItems(navigation,'dashboard/organization/calendar').length,1,capabilities.join());
  assert.doesNotMatch(JSON.stringify(navigation),/operations/);
 }
 assert.equal(calendarItems(nav.getOrganizationNav(false,['manage_staff']),'dashboard/organization/calendar').length,0);
 assert.equal(calendarItems(nav.getOrganizationNav(false,[]),'dashboard/organization/calendar').length,0);
});

test('pharmacy admins with roster or communications reach the scoped Calendar; owners keep theirs',()=>{
 for(const capabilities of [['MANAGE_ROSTER'],['MANAGE_COMMUNICATIONS']]){
  const assignment={pharmacy_id:101,admin_level:'FULL_ADMIN',capabilities};
  const navigation=nav.getAdminNav({assignments:[assignment],activeAssignment:assignment,hasUnreadMessages:false,userRole:'PHARMACIST',activePharmacyId:101});
  assert.equal(calendarItems(navigation,'dashboard/admin/101/calendar').length,1,capabilities.join());
  assert.doesNotMatch(JSON.stringify(navigation),/operations/);
 }
 const owner=nav.getOwnerNav(100,false);
 assert.equal(calendarItems(owner,'dashboard/owner/calendar').length,1);
 assert.doesNotMatch(JSON.stringify(owner),/operations/);
});
