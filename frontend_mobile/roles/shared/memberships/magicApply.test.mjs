import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./magicApply.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const exports = {};
runInNewContext(outputText, { exports });

const valid = {
  role: 'PHARMACIST', firstName: 'Amina', lastName: 'Ali', username: 'amina.ali',
  email: ' AMINA@EXAMPLE.TEST ', mobile: '0411111111', dateOfBirth: '1990-10-10',
  jobTitle: 'Pharmacist', pharmacistAwardLevel: 'EXPERIENCED_PHARMACIST',
  otherstaffClassificationLevel: '', internHalf: '', studentYear: '',
};

test('W4 member invite preserves payroll classification and canonical identity fields', () => {
  const payload = exports.buildMagicMembershipPayload(valid, {category:'FULL_PART_TIME', payroll_enabled:true}, null);
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), {
    role: 'PHARMACIST', first_name: 'Amina', last_name: 'Ali', username: 'amina.ali',
    email: 'amina@example.test', mobile_number: '0411111111', date_of_birth: '1990-10-10',
    job_title: 'Pharmacist', pharmacist_award_level: 'EXPERIENCED_PHARMACIST',
    otherstaff_classification_level: null, intern_half: null, student_year: null,
  });
});

test('W4 invite denies wrong signed-in identity, role mismatch and missing classification', () => {
  assert.match(exports.validateMagicMembership(valid,{category:'LOCUM_CASUAL'}, {role:'OTHER_STAFF',email:'amina@example.test'}), /role/i);
  assert.match(exports.validateMagicMembership(valid,{category:'LOCUM_CASUAL'}, {role:'OWNER',email:'amina@example.test'}), /Only pharmacist and other staff/i);
  assert.match(exports.validateMagicMembership(valid,{category:'LOCUM_CASUAL'}, {role:'PHARMACIST',email:'different@example.test'}), /same email/i);
  assert.match(exports.validateMagicMembership({...valid,pharmacistAwardLevel:''},{category:'FULL_PART_TIME',payroll_enabled:true}, null), /classification/i);
  assert.match(exports.validateMagicMembership({...valid,jobTitle:''},{category:'FULL_PART_TIME',payroll_enabled:false},null), /job title/i);
});

test('W4 locum invites never set TFN/ABN or payroll classifications', () => {
  const payload = exports.buildMagicMembershipPayload(valid,{category:'LOCUM_CASUAL',payroll_enabled:true},null);
  assert.equal(payload.pharmacist_award_level,null);
  assert.equal(payload.job_title,undefined);
  assert.equal(payload.payment_preference,undefined);
  assert.equal(payload.tfn,undefined);
  assert.equal(payload.abn,undefined);
});

test('W4 validate actual date and user data before submission', () => {
  const context={category:'LOCUM_CASUAL',payroll_enabled:false};
  assert.match(exports.validateMagicMembership({...valid,dateOfBirth:'2099-01-01'},context,null), /future/i);
  assert.match(exports.validateMagicMembership({...valid,dateOfBirth:'1999-02-31'},context,null), /date of birth/i);
  assert.match(exports.validateMagicMembership({...valid,email:'bad'},context,null), /email/i);
  assert.match(exports.validateMagicMembership({...valid,username:''},context,null), /username/i);
  assert.equal(exports.validateMagicMembership(valid,context,null),null);
});
