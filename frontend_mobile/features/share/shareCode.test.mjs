import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('./shareCode.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const box={exports:{},URL,Set};
vm.runInNewContext(js,box);
const {parseChemistTaskerShareCode:parse}=box.exports;
test('scanned QR requires exact trusted HTTPS origin and bounded route',()=>{
 const good=[
 'https://chemisttasker.com.au/membership/apply/abcdefghi',
 'https://www.chemisttasker.com.au/talent/public-board?reference_code=ABCDE1',
 'https://chemisttasker.com.au/organization/western-group',
 ];
 for(const url of good)assert.notEqual(parse(url),null);
 for(const url of [
   'http://chemisttasker.com.au/organization/a1234',
   'https://chemisttasker.com.au.evil.example/membership/apply/abcdefghi',
   'https://evil.example/talent/public-board?reference_code=ABCDE1',
   'https://chemisttasker.com.au@evil.example/organization/example',
   'javascript:alert(1)','https://chemisttasker.com.au/api/v1/users/me/',
   'https://chemisttasker.com.au/membership/apply/abcdefghi?redirect=evil',
   'https://chemisttasker.com.au/talent/public-board?reference_code=ABCDE1&email=private',
 ])assert.equal(parse(url),null);
});
test('scanned tokens are not permissions and remain account scoped',()=>{
 const storage=readFileSync(new URL('./savedContacts.ts',import.meta.url),'utf8');
 assert.match(storage,/encodeURIComponent\(String\(accountId\)\)/);
 assert.match(storage,/parseChemistTaskerShareCode\(row\.url\)/);
 const scan=readFileSync(new URL('../../app/share/scan.tsx',import.meta.url),'utf8');
 assert.match(scan,/No action was taken/);
 assert.match(scan,/requestPermission\(\)/);
 assert.match(scan,/user\?\.id == null \|\| !code/);
 assert.match(scan,/saveContact\(user\.id, code\)/);
 assert.doesNotMatch(scan,/approveMembership|createMembership|addFavorite|addFavourite/);
});

test('membership bearer invites use OS encrypted storage while public listing drafts remain local',()=>{
 const source=readFileSync(new URL('./savedContacts.ts',import.meta.url),'utf8');
 assert.match(source,/SecureStore\.setItemAsync\(secureKey\(accountId\)/);
 assert.match(source,/contact\.kind === 'pharmacy-invitation'/);
 assert.match(source,/storedPublic\.filter\(item => item\.kind !== 'pharmacy-invitation'\)/);
});
