import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  RTF1_KEYS,
  WA_BASE,
  buildRtf1Message,
  buildRtf1Url,
  dobRange,
  normalizeSaudiMobile,
  validateRtf1,
} from '../public/assets/rtf1-message.js';

const TODAY = new Date(2026, 9, 24);

const full = {
  name: 'محمد عبدالله القحطاني',
  phone: '0551234567',
  employer: 'عسكري',
  salary: 14500,
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
  phone: '+966512345678',
  employer: 'خاص',
  salary: 9000,
  dob: '',
  hireDate: '',
  salaryBank: '',
  obligationsAmount: null,
  obligationsMonths: null,
  sakani: '',
  modLoan: 'نعم',
  downPayment: null,
  propertyPrice: null,
  propertyType: '',
  city: '',
};

const ready = (extra = {}) => ({ name: 'محمد علي', phone: '0551234567', employer: 'خاص', salary: '9000', ...extra });

test('message starts with #RTF1 and keeps fixed key order', () => {
  const message = buildRtf1Message(full);
  const lines = message.split('\n');
  assert.equal(lines[0], '#RTF1');
  assert.equal(message.endsWith('\n'), false);
  assert.deepEqual(lines.slice(1).map((line) => line.split(': ')[0]), RTF1_KEYS);
  assert.equal(lines[1], 'الاسم: محمد عبدالله القحطاني');
  assert.equal(lines[2], 'رقم الجوال: 966551234567');
  assert.equal(lines[4], 'الراتب تقريباً: 14500');
  assert.equal(lines.at(-1), 'المدينة/الحي: خميس مشيط / الواحة');
  for (const gone of ['الراتب الصافي', 'الراتب الأساسي', 'القطاع', 'الرتبة/الوظيفة']) {
    assert.equal(message.includes(gone), false, gone);
  }
});

test('empty optional lines are omitted and قرض الدفاع stays off a non-military employer', () => {
  const message = buildRtf1Message(partial);
  assert.equal(message, [
    '#RTF1',
    'الاسم: سارة علي',
    'رقم الجوال: 966512345678',
    'جهة العمل: خاص',
    'الراتب تقريباً: 9000',
  ].join('\n'));
  assert.equal(message.split('\n')[0], '#RTF1');
  for (const key of ['تاريخ الميلاد', 'تاريخ التعيين', 'بنك الراتب', 'الالتزامات', 'سكني', 'قرض الدفاع', 'الدفعة', 'سعر العقار', 'نوع العقار', 'المدينة/الحي']) {
    assert.equal(message.includes(key), false, key);
  }
});

test('Saudi mobiles normalise to 9665XXXXXXXX in Western digits', () => {
  assert.equal(normalizeSaudiMobile('0551234567'), '966551234567');
  assert.equal(normalizeSaudiMobile('+966551234567'), '966551234567');
  assert.equal(normalizeSaudiMobile('966551234567'), '966551234567');
  assert.equal(normalizeSaudiMobile('00966551234567'), '966551234567');
  assert.equal(normalizeSaudiMobile('٠٥٥١٢٣٤٥٦٧'), '966551234567');
  assert.equal(normalizeSaudiMobile('+966 55 123 4567'), '966551234567');
  assert.equal(normalizeSaudiMobile('0451234567'), '');
  assert.equal(normalizeSaudiMobile('+966412345678'), '');
  assert.equal(normalizeSaudiMobile('055123'), '');
});

test('newlines inside a value stay on one line', () => {
  const message = buildRtf1Message({ name: 'محمد\nعلي', phone: '966551234567', employer: 'خاص', salary: 9000 });
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

  const ampersand = buildRtf1Url({ name: 'علي', phone: '0551234567', employer: 'خاص', salary: 9000, city: 'أ&ب' });
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
  assert.match(doc, /جهة العمل/);
  assert.match(doc, /رقم الجوال/);
  assert.match(doc, /الراتب تقريباً/);
  assert.doesNotMatch(doc, /القطاع|الراتب الصافي|حكومي مدني/);
});

test('validation bounds, Western digits, and the four required fields', () => {
  const missing = validateRtf1({}, TODAY);
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.name && missing.errors.phone && missing.errors.employer && missing.errors.salary);
  assert.equal(missing.errors.dob, undefined);

  assert.equal(validateRtf1(ready({ salary: '999' }), TODAY).errors.salary.includes('1000'), true);
  assert.equal(validateRtf1(ready({ salary: '500001' }), TODAY).ok, false);
  assert.equal(validateRtf1(ready({ salary: '1000' }), TODAY).ok, true);
  assert.equal(validateRtf1(ready({ salary: '500000' }), TODAY).ok, true);
  assert.equal(validateRtf1(ready({ name: 'محمد2' }), TODAY).errors.name.includes('أرقام'), true);
  assert.equal(validateRtf1(ready({ phone: '0451234567' }), TODAY).ok, false);

  const digits = validateRtf1({
    name: 'محمد علي',
    phone: '٠٥٥١٢٣٤٥٦٧',
    employer: 'عسكري',
    salary: '١٤٥٠٠',
    modLoan: 'لا',
    city: 'حي ١٢',
  }, TODAY);
  assert.equal(digits.ok, true, JSON.stringify(digits.errors));
  assert.equal(digits.value.phone, '966551234567');
  const message = buildRtf1Message(digits.value);
  assert.match(message, /رقم الجوال: 966551234567/);
  assert.match(message, /الراتب تقريباً: 14500/);
  assert.match(message, /جهة العمل: عسكري/);
  assert.match(message, /قرض الدفاع: لا/);
  assert.match(message, /المدينة\/الحي: حي 12/);
  assert.doesNotMatch(message, /[٠-٩۰-۹]/);
  assert.doesNotMatch(message, /تاريخ الميلاد/);

  const young = validateRtf1(ready({ dob: '2008-10-25' }), TODAY);
  const ofAge = validateRtf1(ready({ dob: '2008-10-24' }), TODAY);
  const oldest = validateRtf1(ready({ dob: '1950-10-25' }), TODAY);
  const older = validateRtf1(ready({ dob: '1950-10-24' }), TODAY);
  assert.equal(young.ok, false);
  assert.equal(ofAge.ok, true);
  assert.equal(oldest.ok, true);
  assert.equal(older.ok, false);
  assert.deepEqual(dobRange(TODAY), { min: '1950-10-25', max: '2008-10-24' });

  const earlyHire = validateRtf1(ready({
    employer: 'حكومي', dob: '1992-03-14', hireDate: '2000-01-01',
  }), TODAY);
  assert.equal(earlyHire.ok, false);
  assert.match(earlyHire.errors.hireDate, /15/);

  const price = validateRtf1(ready({
    employer: 'متقاعد', downPayment: '900000', propertyPrice: '800000',
  }), TODAY);
  assert.equal(price.errors.downPayment, 'الدفعة أكبر من سعر العقار.');

  const half = validateRtf1(ready({ obligationsAmount: '1500' }), TODAY);
  assert.match(half.errors.obligationsMonths, /معاً/);

  const none = validateRtf1(ready({ obligationsAmount: '0', obligationsMonths: '0' }), TODAY);
  assert.equal(none.ok, true);
  assert.match(buildRtf1Message(none.value), /الالتزامات: 0 \/ 0/);

  const civilian = validateRtf1(ready({
    phone: '+966512345678', employer: 'خاص', modLoan: 'نعم', city: 'أبها',
  }), TODAY);
  assert.equal(civilian.ok, true);
  assert.equal(civilian.value.modLoan, '');
  assert.equal(civilian.value.phone, '966512345678');
  assert.doesNotMatch(buildRtf1Message(civilian.value), /قرض الدفاع/);
});
