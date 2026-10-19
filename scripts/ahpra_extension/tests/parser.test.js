'use strict';
const assert = require('node:assert/strict');
const {parseRecordText} = require('../parser.js');
const number = 'PHA0009999999';
const provisional = `Registration Details
Start new search
Ms Jane Example Citizen
Pharmacist
Provisional
No. PHA0009999999
Registration details
Profession
Pharmacist
Registration number
PHA0009999999
Registration status
Registered
Conditions
Condition
None
Undertakings
Undertaking
None
Reprimands
Reprimand
None
Registration expiry date
(an explanatory paragraph)
Date of first Registration in profession
Date of first Registration
05/04/2024
Registration Type - Provisional
Registration Expiry Date
04/04/2027
Conditions
Condition
None
Endorsements
Endorsement
None
Notations
Notation
None
Registration Requirements
Registration Requirement
The Practitioner will only practise with supervision by a Board approved supervisor or Delegate:
Supervision approved from 5 January 2026
Employer: Example Pharmacy, Suburb NT
Position: Pharmacy Intern
Pathway: Supervised practice
Personal details
Private synthetic text`;
let passed = 0;
function test(name, run) { run(); passed++; console.log(`PASS ${name}`); }
test('synthetic Provisional record', () => {
  assert.deepEqual(parseRecordText(provisional, number), {
    name: 'Ms Jane Example Citizen', profession: 'Pharmacist', registration_status: 'Registered',
    registration_type: 'Provisional', expiry_date: '2027-04-04', conditions: false, undertakings: false, reprimands: false,
    registration_requirements: 'The Practitioner will only practise with supervision by a Board approved supervisor or Delegate: Supervision approved from 5 January 2026 Employer: Example Pharmacy, Suburb NT Position: Pharmacy Intern Pathway: Supervised practice',
    supervised_practice: true
  });
});
const general = provisional.slice(0, provisional.indexOf('Registration Requirements'))
  .replaceAll('Provisional', 'General')
  .replaceAll('Ms Jane Example Citizen', 'Mr Alex Synthetic Person')
  .replaceAll(number, 'PHA0008888888')
  .replace('Start new search', 'Start new search\nBack to search results');
test('General registration without requirements', () => {
  const record = parseRecordText(general, 'PHA0008888888');
  assert.equal(record.registration_type, 'General');
  assert.equal(record.registration_requirements, '');
  assert.equal(record.supervised_practice, false);
  assert.equal(record.name, 'Mr Alex Synthetic Person');
});
test('Suspended registration', () => assert.equal(parseRecordText(general.replace('Registered', 'Suspended'), 'PHA0008888888').registration_status, 'Suspended'));
test('condition, undertaking and reprimand present', () => {
  const record = parseRecordText(general.replace('Condition\nNone', 'Condition\nMust practise at a synthetic approved location').replace('Undertaking\nNone', 'Undertaking\nSynthetic undertaking').replace('Reprimand\nNone', 'Reprimand\nSynthetic reprimand'), 'PHA0008888888');
  assert.equal(record.conditions, true);
  assert.equal(record.undertakings, true);
  assert.equal(record.reprimands, true);
});
test('missing sections', () => assert.deepEqual(parseRecordText('', number), {
  name: '', profession: '', registration_status: '', registration_type: '', expiry_date: null,
  conditions: null, undertakings: null, reprimands: null, registration_requirements: '', supervised_practice: false
}));

test('otherwise complete record with a missing restriction section', () => {
  for (const [plural, singular] of [['Conditions', 'Condition'], ['Undertakings', 'Undertaking'], ['Reprimands', 'Reprimand']]) {
    const text = general.replaceAll(`${plural}\n${singular}\nNone\n`, '');
    const record = parseRecordText(text, 'PHA0008888888');
    assert.equal(record[plural.toLowerCase()], null);
    assert.equal(record.name, 'Mr Alex Synthetic Person');
    assert.equal(record.registration_status, 'Registered');
  }
});

test('restriction sections present with None', () => {
  const record = parseRecordText('Conditions\nCondition\nNone\nUndertakings\nUndertaking\nNone\nReprimands\nReprimand\nNone', number);
  assert.equal(record.conditions, false);
  assert.equal(record.undertakings, false);
  assert.equal(record.reprimands, false);
});
test('empty sections and None requirements', () => {
  const record = parseRecordText('Conditions\nCondition\nUndertakings\nUndertaking\nReprimands\nReprimand\nRegistration Requirements\nRegistration Requirement\nNone\nPersonal details', number);
  assert.equal(record.conditions, false);
  assert.equal(record.undertakings, false);
  assert.equal(record.reprimands, false);
  assert.equal(record.registration_requirements, '');
});
test('header type fallback and expiry validation', () => {
  const text = general.replace('Registration Type - General', '').replace('04/04/2027', '31/02/2027');
  assert.equal(parseRecordText(text, 'PHA0008888888').registration_type, 'General');
  assert.equal(parseRecordText(text, 'PHA0008888888').expiry_date, null);
});
test('requirements cap and supervision beyond cap', () => {
  const record = parseRecordText(`Registration Requirement\n${'a'.repeat(1200)} supervision\nPersonal details`, number);
  assert.equal(record.registration_requirements.length, 1000);
  assert.equal(record.supervised_practice, true);
});
test('button labels: Print this page, Back to search results, and Start new search', () => {
  const text = `Registration Details\nPrint this page\nBack to search results\nStart new search\nDr Sam Synthetic Practitioner\nPharmacist\nGeneral\nNo. PHA0001111111`;
  const record = parseRecordText(text, 'PHA0001111111');
  assert.equal(record.name, 'Dr Sam Synthetic Practitioner');
  assert.equal(record.profession, 'Pharmacist');
  assert.equal(record.registration_type, 'General');
});
test('No. header line match is case-insensitive and allows extra spaces', () => {
  const text = `Registration Details\nStart new search\nDr Taylor Synthetic Example\nPharmacist\nGeneral\nNo.   pha0002222222`;
  const record = parseRecordText(text, 'PHA0002222222');
  assert.equal(record.name, 'Dr Taylor Synthetic Example');
});
test('fallback to previous behaviour when no No. header line exists', () => {
  const text = `Registration Details\nMs Robin Synthetic Fallback\nProfession\nPharmacist`;
  const record = parseRecordText(text, 'PHA0003333333');
  assert.equal(record.name, 'Ms Robin Synthetic Fallback');
});
console.log(`${passed} parser tests passed`);

