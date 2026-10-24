// Binds the RTF1 form. Opens WhatsApp only. Does not store or transmit the fields elsewhere.
import { buildRtf1Url, dobRange, validateRtf1 } from './rtf1-message.js';

const FIELD_ORDER = [
  'name', 'phone', 'employer', 'salary', 'dob', 'hireDate', 'salaryBank',
  'obligationsAmount', 'obligationsMonths', 'sakani', 'modLoan', 'downPayment', 'propertyPrice',
  'propertyType', 'city',
];

const OPTIONAL = new Set([
  'dob', 'hireDate', 'salaryBank', 'obligationsAmount', 'obligationsMonths', 'sakani', 'modLoan',
  'downPayment', 'propertyPrice', 'propertyType', 'city',
]);

const NUMBER_FIELDS = ['salary', 'obligationsAmount', 'obligationsMonths', 'downPayment', 'propertyPrice'];

function readForm(form) {
  const value = (name) => {
    const el = form.elements[name];
    return el && typeof el.value === 'string' ? el.value : '';
  };
  const data = {};
  for (const name of FIELD_ORDER) data[name] = value(name);
  return data;
}

function clearErrors(form) {
  const box = form.querySelector('#rtf1-errors');
  box.hidden = true;
  box.replaceChildren();
  for (const el of form.querySelectorAll('[data-err]')) {
    el.hidden = true;
    el.textContent = '';
  }
  for (const el of form.querySelectorAll('input, select')) el.removeAttribute('aria-invalid');
}

function focusField(form, name) {
  const el = form.elements[name];
  if (!el) return;
  const target = typeof el.focus === 'function' ? el : el[0];
  target?.focus();
}

function showErrors(form, errors) {
  const box = form.querySelector('#rtf1-errors');
  const msgs = FIELD_ORDER.filter((name) => errors[name]).map((name) => errors[name]);
  const title = document.createElement('p');
  title.textContent = 'راجع الحقول التالية:';
  const list = document.createElement('ul');
  for (const msg of msgs) {
    const item = document.createElement('li');
    item.textContent = msg;
    list.append(item);
  }
  box.replaceChildren(title, list);
  box.hidden = false;

  const more = form.querySelector('#rtf1-more');
  if (more && FIELD_ORDER.some((name) => OPTIONAL.has(name) && errors[name])) more.open = true;

  for (const name of FIELD_ORDER) {
    const msg = errors[name] || '';
    const note = form.querySelector(`[data-err="${name}"]`);
    if (note) {
      note.hidden = !msg;
      note.textContent = msg;
    }
    const el = form.elements[name];
    if (!el) continue;
    const controls = typeof el.focus === 'function' ? [el] : Array.from(el);
    for (const control of controls) {
      if (msg) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
      if (note) control.setAttribute('aria-describedby', note.id);
    }
  }
  focusField(form, FIELD_ORDER.find((name) => errors[name]));
}

function syncMilitary(form) {
  const military = form.elements.employer.value === 'عسكري';
  const block = form.querySelector('#mod-loan');
  block.hidden = !military;
  if (!military) {
    for (const el of form.querySelectorAll('input[name="modLoan"]')) el.checked = false;
  }
}

function officeWaBase() {
  const href = document.querySelector('.site-head .btn')?.href;
  if (!href) return undefined;
  const url = new URL(href);
  return `${url.origin}${url.pathname}`;
}

function bind(form) {
  const range = dobRange(new Date());
  form.elements.dob.min = range.min;
  form.elements.dob.max = range.max;
  const today = new Date();
  const z = (n) => String(n).padStart(2, '0');
  form.elements.hireDate.max = `${today.getFullYear()}-${z(today.getMonth() + 1)}-${z(today.getDate())}`;

  for (const el of form.querySelectorAll('input[name="employer"]')) {
    el.addEventListener('change', () => syncMilitary(form));
  }
  syncMilitary(form);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    for (const name of ['phone', ...NUMBER_FIELDS]) {
      const el = form.elements[name];
      if (el && el.value) el.value = el.value.trim();
    }
    const result = validateRtf1(readForm(form));
    clearErrors(form);
    if (!result.ok) {
      showErrors(form, result.errors);
      return;
    }
    location.assign(buildRtf1Url(result.value, officeWaBase()));
  });
}

const form = document.querySelector('#rtf1');
if (form) bind(form);
