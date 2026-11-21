const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { resolve, relative } = require('node:path');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

const root = resolve(__dirname, '..');
const guardPath = 'components/security/GuardedModal.tsx';
const jsx = (type, props) => ({ type, props });

function compile(source, dependencies, scope = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  });
  runInNewContext(outputText, Object.assign(scope, {
    exports, module: { exports },
    require(id) {
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      assert.ok(id in dependencies, `Unmocked dependency: ${id}`);
      return dependencies[id];
    },
  }));
  return exports;
}

function parse(file, source = readFileSync(resolve(root, file), 'utf8')) {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function nodesMatching(source, predicate) {
  const nodes = [];
  function visit(node) {
    if (predicate(node)) nodes.push(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return nodes;
}

// Native windows must enter through the guard. Paper Modal/Portal are regular
// views inside GuardedRootContent's Portal.Host, not separate native windows.
function unguardedImports(file, source) {
  const ast = parse(file, source);
  return nodesMatching(ast, node => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.importClause?.isTypeOnly || node.isTypeOnly) return false;
      const module = node.moduleSpecifier?.text || '';
      if (module === 'react-native') {
        const bindings = node.importClause?.namedBindings || node.exportClause;
        if (bindings && (ts.isNamedImports(bindings) || ts.isNamedExports(bindings))) {
          return bindings.elements.some(item => !item.isTypeOnly && (item.propertyName || item.name).text === 'Modal');
        }
        // Namespace/default imports can expose RN.Modal.
        return ts.isExportDeclaration(node) || Boolean(node.importClause &&
          (node.importClause.name || (bindings && ts.isNamespaceImport(bindings))));
      }
      if (module.startsWith('react-native-paper-dates/')) return true;
      if (module === 'react-native-paper-dates') {
        const bindings = node.importClause?.namedBindings || node.exportClause;
        return !bindings || !(ts.isNamedImports(bindings) || ts.isNamedExports(bindings)) ||
          bindings.elements.some(item => !item.isTypeOnly && /Picker/.test((item.propertyName || item.name).text));
      }
      return /(?:react-native|@react-native).*?(?:picker|modal|datetime)/i.test(module);
    }
    if (ts.isCallExpression(node) && ['require', 'import'].includes(node.expression.getText(ast))) {
      const module = node.arguments[0]?.text || '';
      return module === 'react-native' || module === 'react-native-paper-dates' ||
        /(?:react-native|@react-native).*?(?:picker|modal|datetime)/i.test(module);
    }
    return false;
  }).map(node => `${file}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}`);
}

function runtimeFiles(dir = root) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('.') || ['node_modules', 'scripts', 'android', 'ios'].includes(entry.name)) return [];
    const file = resolve(dir, entry.name);
    if (entry.isDirectory()) return runtimeFiles(file);
    return /\.[cm]?[jt]sx?$/.test(entry.name) && !/\.(?:test|spec|d)\./.test(entry.name)
      ? [relative(root, file).replaceAll('\\', '/')] : [];
  });
}

test('source sweep: every native picker/window uses the guard (including public routes)', () => {
  const gaps = runtimeFiles().filter(file => file !== guardPath)
    .flatMap(file => unguardedImports(file, readFileSync(resolve(root, file), 'utf8')));
  assert.deepEqual(gaps, [], `Unguarded native windows:\n${gaps.join('\n')}`);
});

test('source sweep detects aliases, namespaces, re-exports and imperative picker APIs', () => {
  for (const source of [
    "import { DatePickerInput as Calendar } from 'react-native-paper-dates';",
    "import * as Dates from 'react-native-paper-dates';",
    "export { TimePickerModal as Clock } from 'react-native-paper-dates';",
    "export * from 'react-native-paper-dates';",
    "import DateInput from 'react-native-paper-dates/lib/module/Date/DatePickerInput';",
    "import { Modal as Window } from 'react-native';",
    "export * from 'react-native';",
    "import * as RN from 'react-native';",
    "const { Modal: Window } = require('react-native');",
    "const dates = import('react-native-paper-dates');",
    "import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';",
  ]) assert.equal(unguardedImports('app/new-screen.tsx', source).length, 1, source);
  for (const source of [
    "import { GuardedDatePickerInput as DatePickerInput } from '@/components/security/GuardedModal';",
    "import { en, registerTranslation } from 'react-native-paper-dates';",
    "import { Modal, Portal } from 'react-native-paper';",
    "import { View, type ModalProps } from 'react-native';",
    "import type { DatePickerInputProps } from 'react-native-paper-dates';",
  ]) assert.equal(unguardedImports('app/new-screen.tsx', source).length, 0, source);
});

// Execute each production JSX element and its actual callback. Only host state
// and native leaf views are stubbed; both the guard and the library's input
// (including its internal open/confirm state) are production code.
const cases = [
  ['app/my-roster.tsx', 0, 'weekStart', '2026-11-09'],
  ['features/parity/roster.tsx', 0, 'weekStart', '2026-11-09'],
  ['features/parity/roster.tsx', 1, 'date', '2026-11-11'],
  ['features/parity/roster.tsx', 2, 'target', '2026-11-09'],
  ['features/parity/roster.tsx', 3, 'target', '2026-11-09'],
  ['features/parity/workforce.tsx', 0, 'effectiveFrom', '2026-11-11'],
  ['features/parity/workforce.tsx', 1, 'effectiveFrom', '2026-11-11'],
  ['features/parity/workforce.tsx', 2, 'effectiveTo', '2026-11-11'],
  ['features/parity/ethicalMarketplace.tsx', 0, 'untilDate', 'date'],
  ['features/parity/ethicalMarketplace.tsx', 1, 'expiry', '2026-11-11'],
  ['roles/shared/memberships/MagicMembershipApplyScreen.tsx', 0, 'dateOfBirth', '2026-11-11'],
  ['app/register.tsx', 0, 'dateOfBirth', '2026-11-11'],
];

for (const [file, index, field, expected] of cases) {
  test(`${file} picker ${index + 1}: hides on lock and returns the chosen value after unlock`, () => {
    const ast = parse(file);
    const pickers = nodesMatching(ast, node => ts.isJsxSelfClosingElement(node) &&
      ['DatePickerInput', 'DatePickerModal'].includes(node.tagName.getText(ast)));
    const picker = pickers[index];
    assert.ok(picker, 'Production picker must exist');
    const name = picker.tagName.getText(ast);
    const pickerImport = ast.statements.find(node => ts.isImportDeclaration(node) &&
      node.importClause?.namedBindings?.elements?.some(item => item.name.text === name));

    let locked = false;
    let activeUserId = 42;
    let nativeOpen = false;
    const react = {
      useState: () => [nativeOpen, value => { nativeOpen = value; }],
      useCallback: fn => fn,
      forwardRef: fn => fn,
    };
    const native = { Platform: { OS: 'ios', select: options => options.default }, StyleSheet: { create: styles => styles } };
    const input = compile(readFileSync(resolve(root, 'node_modules/react-native-paper-dates/src/Date/DatePickerInput.tsx'), 'utf8'), {
      react, 'react-native': native, 'react-native-paper': { TextInput: { Icon: 'CalendarButton' } },
      './DatePickerInputWithoutModal': 'Input', './DatePickerModal': 'NativeDatePickerModal',
      '../shared/utils': { useLatest: value => ({ current: value }) },
      './dateUtils': { defaultStartYear: 1900, defaultEndYear: 2200 },
    }).default;
    const dates = { DatePickerInput: input, DatePickerModal: 'NativeDatePickerModal', TimePickerModal: 'NativeTimePickerModal' };
    const guard = compile(readFileSync(resolve(root, guardPath), 'utf8'), {
      react, 'react-native': native, 'react-native-paper': {}, 'react-native-paper-dates': dates,
      '@/context/AuthContext': { useAuth: () => ({ user: { id: 42 } }) },
      '@/utils/appLock': { useAppLockState: () => ({ isLocked: locked, activeUserId }) },
      '@/constants/tokens': { colors: { status: { red: {} } }, space: {} },
      '@/components/ui/BrandLoader': {},
    });
    const helpers = compile(readFileSync(resolve(root, 'features/parity/utils.ts'), 'utf8'), {});
    const state = {
      weekStart: '2026-11-02', date: '2026-11-02', target: '2026-11-02',
      effectiveFrom: '2026-11-02', effectiveTo: '2026-11-02', expiry: '2026-11-02',
      untilDate: new Date(2026, 10, 2), dateOfBirth: '1990-01-01',
      form: { dateOfBirth: '1990-01-01' }, dobOpen: false, dobPickerOpen: false,
      busy: false, historical: false, completedHistorical: false,
      busyRef: { current: false }, actionRequestRef: { current: 0 }, rosterRequestRef: { current: 0 },
      ...helpers,
    };
    for (const key of ['weekStart', 'date', 'target', 'effectiveFrom', 'effectiveTo', 'expiry', 'untilDate', 'dateOfBirth', 'dobOpen', 'dobPickerOpen', 'busy', 'assignments', 'openShifts', 'requests', 'edit', 'loading', 'preview']) {
      state[`set${key[0].toUpperCase()}${key.slice(1)}`] = value => { state[key] = value; };
    }
    state.update = (key, value) => { state[key] = value; state.form[key] = value; };
    // Retain the real named handler rather than replacing it with a test setter.
    const handler = nodesMatching(ast, node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleWeekChange')[0];
    const opener = nodesMatching(ast, node => ts.isJsxAttribute(node) && node.name.getText(ast) === 'onPress' &&
      /setDob(?:Picker)?Open\(true\)/.test(node.initializer?.getText(ast) || ''))[0];
    const { render, openPicker } = compile(`${pickerImport.getText(ast)}\n${handler ? `const ${handler.getText(ast)};` : ''}\nexports.render = () => (${picker.getText(ast)});\n${opener ? `exports.openPicker = ${opener.initializer.expression.getText(ast)};` : ''}`, {
      '@/components/security/GuardedModal': guard, 'react-native-paper-dates': dates,
    }, state);

    function leaf() {
      let element = render();
      while (typeof element.type === 'function') element = element.type(element.props);
      return element;
    }
    const modal = element => element.type === 'Input' ? element.props.modal(element.props) : element;
    const chosen = new Date(2026, 10, 11);
    let element = leaf();
    if (name === 'DatePickerInput') {
      assert.equal(Boolean(element.props.disabled), false);
      assert.equal(modal(element).props.visible, false);
      element.props.inputButton.props.onPress();
      element = leaf();
    } else {
      assert.equal(modal(element).props.visible, false);
      openPicker();
      element = leaf();
    }
    assert.equal(modal(element).props.visible, true, 'Unlocked picker opens normally');
    const before = state[field];
    locked = true;
    element = leaf();
    if (name === 'DatePickerInput') {
      assert.equal(modal(element), null, 'Lock unmounts the input native modal');
      assert.equal(element.props.disabled, true);
      assert.equal(element.props.inputButton, null);
    } else assert.equal(modal(element).props.visible, false, 'Lock hides the native dialog');
    assert.equal(state[field], before, 'Lock preserves the controlled value');

    locked = false;
    // Account transitions fail closed even before the coordinator has locked.
    activeUserId = 99;
    element = leaf();
    assert.ok(modal(element) === null || modal(element).props.visible === false);
    activeUserId = 42;
    element = leaf();
    assert.equal(modal(element).props.visible, true, 'Picker works again after unlock');
    modal(element).props.onConfirm({ date: chosen });
    assert.equal(state[field], expected === 'date' ? chosen : expected, 'Production callback stores the selected date');
    assert.equal(modal(leaf()).props.visible, false, 'Confirmation dismisses the dialog');
    if (field === 'effectiveFrom') assert.equal(state.preview, null, 'Changing effective date still clears stale preview');
  });
}
