import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const icons = Object.fromEntries(['Building2','Heart','Network','Sparkles','Store'].map(name => [name, { name }]));

function transpile(path, imports) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require(name) {
      if (Object.prototype.hasOwnProperty.call(imports, name)) return imports[name];
      throw new Error('Unmocked import: ' + name);
    },
  }, { filename: path });
  return module.exports;
}
test('C web audience levels retain existing labels, reach, scope, order, icons and lookup', () => {
  // The web production module must execute; the shared contract is imported from production source.
  const sharedPath = new URL('../../../../../../../shared-core/src/domains/shifts/audience.ts', import.meta.url);
  const shared = existsSync(sharedPath) ? transpile('../../../../../../../shared-core/src/domains/shifts/audience.ts', {}) : {};
  const web = transpile('./audience.ts', {
    'lucide-react': icons, '@chemisttasker/shared-core': shared,
  });
  const expected = [
    ['FULL_PART_TIME','My Pharmacy','your full-time and part-time team','internal','Building2'],
    ['LOCUM_CASUAL','Favourites','your favourite locums and casuals','internal','Heart'],
    ['OWNER_CHAIN','Chain','staff across your other pharmacies','internal','Store'],
    ['ORG_CHAIN','Organization','members of your organisation','internal','Network'],
    ['PLATFORM','ChemistTasker','verified professionals across ChemistTasker','platform','Sparkles'],
  ];
  assert.deepEqual(Array.from(web.AUDIENCE_LEVELS, level => [
    level.key,level.label,level.reach,level.scope,level.icon.name,
  ]), expected);
  assert.equal(web.getAudienceLevel('ORG_CHAIN').requiresOrganization, true);
  assert.equal(web.getAudienceLevel('NO_SUCH_LEVEL'), undefined);
});
