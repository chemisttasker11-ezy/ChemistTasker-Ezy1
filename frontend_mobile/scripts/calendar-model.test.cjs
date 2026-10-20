const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

test('Calendar replaces Operations in every role menu that had it, with the same visibility', () => {
  // The menus are inline literals in the layouts; Operations had no visibility rule on any of them.
  for (const role of ['owner', 'organization', 'admin']) {
    const layout = readFileSync(path.resolve(__dirname, `../app/${role}/_layout.tsx`), 'utf8');
    const entry = layout.match(/\{ label: 'Calendar',[^}]*route: '\/\w+\/calendar'[^}]*\}/)?.[0];
    assert.ok(entry, role);
    assert.doesNotMatch(entry, /visible: (?!true)/, role);
    assert.doesNotMatch(layout, /\/operations/, role);
  }
});
