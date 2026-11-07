const path=require('node:path'),fs=require('node:fs'),vm=require('node:vm'),ts=require('../node_modules/typescript');
const test=require('node:test'),assert=require('node:assert/strict');
const cache={};
function load(file, mocks={}) {
 file=path.resolve(file);if(cache[file])return cache[file].exports;
 const mod={exports:{}};cache[file]=mod;
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})((name)=>{
   if(name in mocks)return mocks[name];
   if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'),mocks);
   return require(name);
 },mod,mod.exports);return mod.exports;
}
test('R: real native configuration and facade send optional bearer for public eligibility',async()=>{
 const root=path.resolve(__dirname,'../..');let token='eligible-token';const headers=[];
 const original=global.fetch;global.fetch=async(_url,init)=>{const auth=new Headers(init.headers).get('authorization');headers.push(auth);return new Response(JSON.stringify([{key:'public',can_interact:!!auth}]),{headers:{'content-type':'application/json'}});};
 try {
  const core=load(path.join(root,'shared-core/src/platformApi.ts'));
  const config=load(path.join(root,'frontend_mobile/config/api.ts'),{
   '@chemisttasker/shared-core':{...core,configureApi(){},configureStorage(){}},
   '@react-native-async-storage/async-storage':{__esModule:true,default:{}},
   '../utils/secureStorage':{isSecureKey:()=>false},
   '../utils/authSession':{getValidAccessToken:async()=>token,refreshAccessToken:async()=>null},
   '../utils/apiUrl':{resolveApiBaseUrl:()=> 'https://example.test/api'},
  });
  assert.equal((await config.chemistTaskerApi.publicContent.listHubs())[0].can_interact,true);
  token=null;assert.equal((await config.chemistTaskerApi.publicContent.listHubs())[0].can_interact,false);
  assert.deepEqual(headers,['Bearer eligible-token',null]);
 } finally {global.fetch=original;}
});
