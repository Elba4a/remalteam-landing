import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  RTF1_KEYS,
  WA_BASE,
  buildRtf1Message,
  buildRtf1Url,
  dobRange,
  validateRtf1,
} from '../public/assets/rtf1-message.js';

const TODAY = new Date(2026, 9, 24);

const full = {
  name: 'محمد عبدالله القحطاني',
  netSalary: 14500,
  basicSalary: 9800,
  sector: 'عسكري',
  rank: 'رقيب',
  dob: '1992-03-14',
  hireDate: '2014-08-01',
  salaryBank: 'اسم البنك',
  obligationsAmount: 1800,
  obligationsMonths: 24,
  sakani: 'نعم',
  modLoan: 'لا',
  downPayment: 80000,
  propertyPrice: 750000,
  propertyType: 'فيلا',
  city: 'خميس مشيط / الواحة',
};

const partial = {
  name: 'سارة علي',
  netSalary: 9000,
  basicSalary: null,
  sector: 'خاص',
  rank: '',
  dob: '1995-06-01',
  hireDate: '',
  salaryBank: '',
  obligationsAmount: null,
  obligationsMonths: null,
  sakani: '',
  modLoan: 'نعم',
  downPayment: null,
  propertyPrice: null,
  propertyType: '',
  city: 'أبها',
};

test('message starts with #RTF1 and keeps fixed key order', () => {
  const message = buildRtf1Message(full);
  const lines = message.split('\n');
  assert.equal(lines[0], '#RTF1');
  assert.equal(message.endsWith('\n'), false);
  assert.deepEqual(lines.slice(1).map((line) => line.split(': ')[0]), RTF1_KEYS);
  assert.equal(lines[1], 'الاسم: محمد عبدالله القحطاني');
  assert.equal(lines[9], 'الالتزامات: 1800 / 24');
  assert.equal(lines.at(-1), 'المدينة/الحي: خميس مشيط / الواحة');
});

test('empty optional lines are omitted and قرض الدفاع stays off a non-military sector', () => {
  const message = buildRtf1Message(partial);
  assert.equal(message, [
    '#RTF1',
    'الاسم: سارة علي',
    'الراتب الصافي: 9000',
    'القطاع: خاص',
    'تاريخ الميلاد: 1995-06-01',
    'المدينة/الحي: أبها',
  ].join('\n'));
  assert.equal(message.split('\n')[0], '#RTF1');
  for (const key of ['الراتب الأساسي', 'الرتبة/الوظيفة', 'تاريخ التعيين', 'بنك الراتب', 'الالتزامات', 'سكني', 'قرض الدفاع', 'الدفعة', 'سعر العقار', 'نوع العقار']) {
    assert.equal(message.includes(key), false, key);
  }
});

test('newlines inside a value stay on one line', () => {
  const message = buildRtf1Message({ name: 'محمد\nعلي', netSalary: 9000, sector: 'خاص', dob: '1995-06-01' });
  assert.equal(message.split('\n')[1], 'الاسم: محمد علي');
  assert.equal(message.split('\n').length, 5);
});

test('WhatsApp URL is percent-encoded and round-trips', () => {
  const message = buildRtf1Message(full);
  const url = buildRtf1Url(full);
  assert.equal(url.startsWith(`${WA_BASE}?text=`), true);
  const encoded = url.slice(url.indexOf('?text=') + 6);
  assert.equal(decodeURIComponent(encoded), message);
  assert.match(encoded, /^%23RTF1%0A%D8%A7%D9%84%D8%A7%D8%B3%D9%85%3A%20/);
  assert.match(encoded, /%0A/);
  assert.match(encoded, /%20/);
  assert.doesNotMatch(encoded, /\s/);
  assert.doesNotMatch(encoded, /\+/);
  assert.doesNotMatch(url, /\n/);

  const ampersand = buildRtf1Url({ name: 'علي', netSalary: 9000, sector: 'خاص', dob: '1995-06-01', city: 'أ&ب' });
  assert.match(ampersand, /%26/);
  assert.equal(decodeURIComponent(ampersand.split('?text=')[1]).includes('أ&ب'), true);

  const custom = buildRtf1Url(partial, 'https://wa.me/966500000000/');
  assert.equal(custom.startsWith('https://wa.me/966500000000?text='), true);
});

test('spec examples in docs/rtf1-format.md match the builder', () => {
  const doc = readFileSync(new URL('../docs/rtf1-format.md', import.meta.url), 'utf8');
  const examples = [...doc.matchAll(/```\n(#RTF1\n[\s\S]*?)```/g)].map((match) => match[1].replace(/\n$/, ''));
  assert.equal(examples.length, 2);
  assert.equal(examples[0], buildRtf1Message(full));
  assert.equal(examples[1], buildRtf1Message(partial));
  const site = JSON.parse(readFileSync(new URL('../content/site.json', import.meta.url), 'utf8'));
  assert.equal(WA_BASE, site.whatsapp.url);
});

test('validation bounds, Western digits, and required fields', () => {
  const missing = validateRtf1({}, TODAY);
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.name && missing.errors.netSalary && missing.errors.sector && missing.errors.dob);

  assert.equal(validateRtf1({ name: 'محمد علي', netSalary: '999', sector: 'خاص', dob: '1990-01-01' }, TODAY).errors.netSalary.includes('1000'), true);
  assert.equal(validateRtf1({ name: 'محمد علي', netSalary: '500001', sector: 'خاص', dob: '1990-01-01' }, TODAY).ok, false);
  assert.equal(validateRtf1({ name: 'محمد2', netSalary: '9000', sector: 'خاص', dob: '1990-01-01' }, TODAY).errors.name.includes('أرقام'), true);

  const digits = validateRtf1({
    name: 'محمد علي',
    netSalary: '١٤٥٠٠',
    sector: 'عسكري',
    dob: '1992-03-14',
    modLoan: 'لا',
    city: 'حي ١٢',
  }, TODAY);
  assert.equal(digits.ok, true, JSON.stringify(digits.errors));
  const message = buildRtf1Message(digits.value);
  assert.match(message, /الراتب الصافي: 14500/);
  assert.match(message, /قرض الدفاع: لا/);
  assert.match(message, /المدينة\/الحي: حي 12/);
  assert.doesNotMatch(message, /[٠-٩۰-۹]/);

  const young = validateRtf1({ name: 'محمد علي', netSalary: '9000', sector: 'خاص', dob: '2008-10-25' }, TODAY);
  const ofAge = validateRtf1({ name: 'محمد علي', netSalary: '9000', sector: 'خاص', dob: '2008-10-24' }, TODAY);
  const oldest = validateRtf1({ name: 'محمد علي', netSalary: '9000', sector: 'خاص', dob: '1950-10-25' }, TODAY);
  const older = validateRtf1({ name: 'محمد علي', netSalary: '9000', sector: 'خاص', dob: '1950-10-24' }, TODAY);
  assert.equal(young.ok, false);
  assert.equal(ofAge.ok, true);
  assert.equal(oldest.ok, true);
  assert.equal(older.ok, false);
  assert.deepEqual(dobRange(TODAY), { min: '1950-10-25', max: '2008-10-24' });

  const earlyHire = validateRtf1({
    name: 'محمد علي', netSalary: '9000', sector: 'حكومي مدني', dob: '1992-03-14', hireDate: '2000-01-01',
  }, TODAY);
  assert.equal(earlyHire.ok, false);
  assert.match(earlyHire.errors.hireDate, /15/);

  const price = validateRtf1({
    name: 'محمد علي', netSalary: '9000', sector: 'متقاعد', dob: '1960-01-01', downPayment: '900000', propertyPrice: '800000',
  }, TODAY);
  assert.equal(price.errors.downPayment, 'الدفعة أكبر من سعر العقار.');

  const half = validateRtf1({
    name: 'محمد علي', netSalary: '9000', sector: 'خاص', dob: '1990-01-01', obligationsAmount: '1500',
  }, TODAY);
  assert.match(half.errors.obligationsMonths, /معاً/);

  const none = validateRtf1({
    name: 'محمد علي', netSalary: '9000', sector: 'خاص', dob: '1990-01-01', obligationsAmount: '0', obligationsMonths: '0',
  }, TODAY);
  assert.equal(none.ok, true);
  assert.match(buildRtf1Message(none.value), /الالتزامات: 0 \/ 0/);

  const civilian = validateRtf1({
    name: 'سارة علي', netSalary: '9000', sector: 'خاص', dob: '1995-06-01', modLoan: 'نعم', city: 'أبها',
  }, TODAY);
  assert.equal(civilian.ok, true);
  assert.equal(civilian.value.modLoan, '');
  assert.doesNotMatch(buildRtf1Message(civilian.value), /قرض الدفاع/);
});
