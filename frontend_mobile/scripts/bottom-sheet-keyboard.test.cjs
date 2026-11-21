// O4 N4: the keyboard covered the Counter Offer footer. Android modals are edge to edge, so the window does not
// resize: the sheet's KeyboardAvoidingView must shrink it on Android too, and the sheet must shrink with the dock.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

test('R bottom sheets keep their footer above the keyboard on iOS and Android', () => {
  const sheet = read('components/ui/BottomSheet.tsx');
  assert.match(sheet, /<KeyboardAvoidingView behavior=\{Platform\.OS === 'ios' \? 'padding' : 'height'\} style=\{styles\.dock\}>/);
  assert.match(sheet, /sheet: \{[^}]*flexShrink: 1,/);
  // The body scrolls between the fixed header and footer.
  assert.match(sheet, /body: \{ flexGrow: 0, flexShrink: 1 \}/);
  const dialog = read('roles/shared/shifts/ShiftsBoard/components/CounterOfferDialog.tsx');
  assert.match(dialog, /<BottomSheet[\s\S]*footer=\{[\s\S]*label=\{counterSubmitting \? 'Sending\.\.\.' : 'Send Offer'\}/);
});
