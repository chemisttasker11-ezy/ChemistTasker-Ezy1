// Render the actual posting skills step with its child controls stubbed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('posting skills step explains why pharmacy details help', () => {
  const jsx = (type, props) => ({ type, props });
  const imports = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@mui/material': { Stack: 'Stack', Typography: 'Typography' },
    '../ShiftSkillPresetControls': { ShiftSkillPresetControls: 'controls' },
    '../ShiftRequirementsPicker': { default: 'picker', __esModule: true },
  };
  const source = readFileSync(new URL('./PostShiftSkillsStep.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => imports[name] });
  const tree = module.exports.default({ initializedScopes: new Set(), roleNeeded: 'PHARMACIST', mustHave: [], niceToHave: [] });
  assert.equal(tree.props.children[0].props.children, 'Filling this in helps applicants understand what your pharmacy needs.');
});
