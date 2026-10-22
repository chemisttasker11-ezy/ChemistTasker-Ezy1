const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const test = require('node:test');
const ts = require('typescript');

const calendarModelPath = path.resolve(__dirname, '../roles/shared/calendar/calendarModel.ts');

function createEnvironment() {
  const tsSource = fs.readFileSync(calendarModelPath, 'utf8');
  const { outputText: jsCode } = ts.transpileModule(tsSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });

  let capturedCallback = null;
  let capturedDelay = null;
  let clearedTimerId = null;
  let currentTimerId = 100;

  const sandbox = {
    module: { exports: {} },
    exports: {},
    require,
    setTimeout: (fn, delay) => {
      capturedCallback = fn;
      capturedDelay = delay;
      return ++currentTimerId;
    },
    clearTimeout: (id) => { clearedTimerId = id; },
    AbortController: globalThis.AbortController,
    AbortSignal: globalThis.AbortSignal,
    console,
  };
  sandbox.module.exports = sandbox.exports;

  const context = vm.createContext(sandbox);
  new vm.Script(jsCode, { filename: 'calendarModel.js' }).runInContext(context);

  const helper = sandbox.module.exports.withCalendarRequestBudget;
  assert.strictEqual(typeof helper, 'function', 'withCalendarRequestBudget must be exported from calendarModel.ts');

  return {
    withCalendarRequestBudget: helper,
    getDelay: () => capturedDelay,
    getTimerId: () => currentTimerId,
    getClearedTimerId: () => clearedTimerId,
    fireTimer: () => capturedCallback?.(),
  };
}

test('resolves operation, enforces 15000ms default budget, and clears timer', async () => {
  const env = createEnvironment();
  let operationCalled = false;
  const result = await env.withCalendarRequestBudget(async (signal) => {
    operationCalled = true;
    assert.strictEqual(signal instanceof AbortSignal, true, 'signal must be an AbortSignal instance');
    assert.strictEqual(signal.aborted, false, 'signal must not be aborted initially');
    return 'operation-result';
  });

  assert.strictEqual(operationCalled, true, 'operation must be invoked');
  assert.strictEqual(result, 'operation-result', 'must return the resolved result');
  assert.strictEqual(env.getDelay(), 15000, 'default timer budget must be 15000ms');
  assert.strictEqual(env.getClearedTimerId(), env.getTimerId(), 'timer must be cleared in finally on resolve');
});

test('aborts signal after operation is listening, rejects, and clears timer', async () => {
  const env = createEnvironment();
  let receivedSignal = null;
  const budgetPromise = env.withCalendarRequestBudget(async (signal) => {
    receivedSignal = signal;
    return new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        const err = new Error('Budget timed out');
        err.name = 'AbortError';
        reject(err);
      });
    });
  });

  assert.strictEqual(env.getDelay(), 15000, 'default timer must be 15000ms');
  assert.strictEqual(receivedSignal !== null, true, 'operation must receive the AbortSignal');
  assert.strictEqual(receivedSignal.aborted, false, 'signal must not be aborted before timer');

  env.fireTimer();
  assert.strictEqual(receivedSignal.aborted, true, 'actual abort must reach signal in operation');

  await assert.rejects(budgetPromise, (err) => {
    assert.strictEqual(err.name, 'AbortError');
    assert.strictEqual(err.message, 'Budget timed out');
    return true;
  }, 'withCalendarRequestBudget must reject when operation is aborted');

  assert.strictEqual(env.getClearedTimerId(), env.getTimerId(), 'timer must be cleared in finally on timeout reject');
});

test('clears timer on ordinary rejection before timeout', async () => {
  const env = createEnvironment();
  const rejectPromise = env.withCalendarRequestBudget(async () => {
    throw new Error('Immediate network error');
  });

  await assert.rejects(rejectPromise, /Immediate network error/);
  assert.strictEqual(env.getClearedTimerId(), env.getTimerId(), 'timer must be cleared in finally on error rejection');
});
