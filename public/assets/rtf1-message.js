// RTF1 lead message for /mortgage-calculator/. Builds a WhatsApp text only.
// Spec: docs/rtf1-format.md. No network calls.

export const WA_BASE = 'https://wa.me/966535330034';

export const EMPLOYERS = ['حكومي', 'عسكري', 'خاص', 'متقاعد'];
export const YES_NO = ['نعم', 'لا'];
export const PROPERTY_TYPES = ['فيلا', 'شقة', 'دور', 'أرض', 'عمارة', 'أخرى'];

export const LIMITS = {
  name: { min: 2, max: 80 },
  salary: { min: 1000, max: 500000 },
  bank: { min: 2, max: 60 },
  city: { min: 2, max: 80 },
  obligations: { min: 0, max: 500000 },
  months: { min: 0, max: 360 },
  down: { min: 0, max: 500000000 },
  price: { min: 1, max: 500000000 },
  age: { min: 18, max: 75 },
  hireAge: 15,
};

/** Fixed key order. Empty values are omitted, so a parser must match keys, not line numbers. */
export const RTF1_KEYS = [
  'الاسم',
  'رقم الجوال',
  'جهة العمل',
  'الراتب تقريباً',
  'تاريخ الميلاد',
  'تاريخ التعيين',
  'بنك الراتب',
  'الالتزامات',
  'سكني',
  'قرض الدفاع',
  'الدفعة',
  'سعر العقار',
  'نوع العقار',
  'المدينة/الحي',
];

const DIGITS = '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';

export function toWesternDigits(value) {
  return String(value ?? '').replace(/[٠-٩۰-۹]/g, (ch) => String(DIGITS.indexOf(ch) % 10));
}

function cleanText(value) {
  return toWesternDigits(value).replace(/[\r\n]+/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
}

function asInt(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return null;
  return value;
}

function yesNo(value) {
  return YES_NO.includes(value) ? value : '';
}

function dateText(value) {
  const s = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

/** Saudi mobile: 05XXXXXXXX or +9665XXXXXXXX (also 9665… and 009665…). Result is 9665XXXXXXXX. */
export function normalizeSaudiMobile(raw) {
  let s = toWesternDigits(raw).replace(/[\s\-().\u200e\u200f]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);
  if (/^05\d{8}$/.test(s)) return `966${s.slice(1)}`;
  if (/^9665\d{8}$/.test(s)) return s;
  return '';
}

function obligations(data) {
  const amount = asInt(data.obligationsAmount);
  const months = asInt(data.obligationsMonths);
  if (amount == null || months == null) return '';
  if (amount < 0 || months < 0) return '';
  return `${amount} / ${months}`;
}

function lineValue(data, key) {
  switch (key) {
    case 'الاسم': return cleanText(data.name);
    case 'رقم الجوال': return normalizeSaudiMobile(data.phone);
    case 'جهة العمل': return EMPLOYERS.includes(data.employer) ? data.employer : '';
    case 'الراتب تقريباً': {
      const n = asInt(data.salary);
      return n == null ? '' : String(n);
    }
    case 'تاريخ الميلاد': return dateText(data.dob);
    case 'تاريخ التعيين': return dateText(data.hireDate);
    case 'بنك الراتب': return cleanText(data.salaryBank);
    case 'الالتزامات': return obligations(data);
    case 'سكني': return yesNo(data.sakani);
    case 'قرض الدفاع': return data.employer === 'عسكري' ? yesNo(data.modLoan) : '';
    case 'الدفعة': {
      const n = asInt(data.downPayment);
      return n == null ? '' : String(n);
    }
    case 'سعر العقار': {
      const n = asInt(data.propertyPrice);
      return n == null ? '' : String(n);
    }
    case 'نوع العقار': return PROPERTY_TYPES.includes(data.propertyType) ? data.propertyType : '';
    case 'المدينة/الحي': return cleanText(data.city);
    default: return '';
  }
}

export function buildRtf1Message(data) {
  const lines = ['#RTF1'];
  for (const key of RTF1_KEYS) {
    const value = lineValue(data || {}, key);
    if (value !== '') lines.push(`${key}: ${value}`);
  }
  return lines.join('\n');
}

export function buildRtf1Url(data, waBase = WA_BASE) {
  const base = String(waBase).replace(/\/$/, '');
  return `${base}?text=${encodeURIComponent(buildRtf1Message(data))}`;
}

function parseYMD(raw) {
  const s = cleanText(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { y, m, d };
}

function cmpYMD(a, b) {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m !== b.m) return a.m - b.m;
  return a.d - b.d;
}

function addYears(ymd, years) {
  const dt = new Date(Date.UTC(ymd.y + years, ymd.m - 1, ymd.d));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function addDays(ymd, days) {
  const dt = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + days));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function formatYMD(ymd) {
  const z = (n) => String(n).padStart(2, '0');
  return `${ymd.y}-${z(ymd.m)}-${z(ymd.d)}`;
}

function todayYMD(date) {
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
}

function ageYears(dob, today) {
  let age = today.y - dob.y;
  if (today.m < dob.m || (today.m === dob.m && today.d < dob.d)) age -= 1;
  return age;
}

export function dobRange(today = new Date()) {
  const now = todayYMD(today);
  return {
    min: formatYMD(addDays(addYears(now, -76), 1)),
    max: formatYMD(addYears(now, -LIMITS.age.min)),
  };
}

function parseOptionalInt(raw) {
  let s = toWesternDigits(raw).trim().replace(/[\s,\u066C]/g, '');
  if (s === '') return { ok: true, value: null };
  if (!/^\d+$/.test(s)) return { ok: false };
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return { ok: false };
  return { ok: true, value: n };
}

const NAME_RE = /^(?=.*[\u0600-\u06FFa-zA-Z])[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FFa-zA-Z\s.'’-]+$/;
const TEXT_RE = /^[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FFa-zA-Z0-9\s.'’/،,-]+$/;

function takeText(raw, { min, max, required, emptyMsg, shortMsg, longMsg, badMsg }) {
  const value = cleanText(raw);
  if (!value) return required ? { error: emptyMsg } : { value: '' };
  if (required && /\d/.test(value)) return { error: badMsg };
  if (value.length < min) return { error: shortMsg };
  if (value.length > max) return { error: longMsg };
  if (!(required ? NAME_RE : TEXT_RE).test(value)) return { error: badMsg };
  return { value };
}

function takeInt(raw, { min, max, required, emptyMsg, badMsg, rangeMsg }) {
  const parsed = parseOptionalInt(raw);
  if (!parsed.ok) return { error: badMsg };
  if (parsed.value == null) return required ? { error: emptyMsg } : { value: null };
  if (parsed.value < min || parsed.value > max) return { error: rangeMsg };
  return { value: parsed.value };
}

export function validateRtf1(raw, today = new Date()) {
  const src = raw || {};
  const errors = {};
  const value = {
    name: '',
    phone: '',
    employer: '',
    salary: null,
    dob: '',
    hireDate: '',
    salaryBank: '',
    obligationsAmount: null,
    obligationsMonths: null,
    sakani: '',
    modLoan: '',
    downPayment: null,
    propertyPrice: null,
    propertyType: '',
    city: '',
  };

  const name = takeText(src.name, {
    min: LIMITS.name.min,
    max: LIMITS.name.max,
    required: true,
    emptyMsg: 'أدخل الاسم.',
    shortMsg: 'أدخل الاسم كاملاً، من حرفين على الأقل.',
    longMsg: 'الاسم أطول من 80 حرفاً.',
    badMsg: 'أدخل الاسم بالحروف، دون أرقام.',
  });
  if (name.error) errors.name = name.error;
  else value.name = name.value;

  const phone = normalizeSaudiMobile(src.phone);
  if (!cleanText(src.phone)) errors.phone = 'أدخل رقم الجوال.';
  else if (!phone) errors.phone = 'أدخل جوالاً سعودياً: 05XXXXXXXX أو +9665XXXXXXXX.';
  else value.phone = phone;

  const employer = cleanText(src.employer);
  if (!employer) errors.employer = 'اختر جهة العمل.';
  else if (!EMPLOYERS.includes(employer)) errors.employer = 'اختر جهة العمل: حكومي، أو عسكري، أو خاص، أو متقاعد.';
  else value.employer = employer;

  const salary = takeInt(src.salary, {
    min: LIMITS.salary.min,
    max: LIMITS.salary.max,
    required: true,
    emptyMsg: 'أدخل الراتب التقريبي.',
    badMsg: 'أدخل الراتب التقريبي رقماً صحيحاً دون كسور.',
    rangeMsg: `الراتب التقريبي يجب أن يكون بين ${LIMITS.salary.min} و ${LIMITS.salary.max} ريال.`,
  });
  if (salary.error) errors.salary = salary.error;
  else value.salary = salary.value;

  const now = todayYMD(today);
  const dobRaw = cleanText(src.dob);
  const dob = dobRaw ? parseYMD(dobRaw) : null;
  if (dobRaw && !dob) errors.dob = 'أدخل تاريخ الميلاد بالشكل YYYY-MM-DD، أو اتركه فارغاً.';
  else if (dob) {
    const age = ageYears(dob, now);
    if (age < LIMITS.age.min || age > LIMITS.age.max) errors.dob = `العمر يجب أن يكون بين ${LIMITS.age.min} و ${LIMITS.age.max} سنة.`;
    else value.dob = formatYMD(dob);
  }

  const hireRaw = cleanText(src.hireDate);
  if (hireRaw) {
    const hire = parseYMD(hireRaw);
    if (!hire) errors.hireDate = 'أدخل تاريخ التعيين بالشكل YYYY-MM-DD، أو اتركه فارغاً.';
    else if (cmpYMD(hire, now) > 0) errors.hireDate = 'تاريخ التعيين لا يكون في المستقبل.';
    else if (dob && !errors.dob && cmpYMD(hire, addYears(dob, LIMITS.hireAge)) < 0) errors.hireDate = 'تاريخ التعيين يسبق سن 15.';
    else value.hireDate = formatYMD(hire);
  }

  const bank = takeText(src.salaryBank, {
    min: LIMITS.bank.min,
    max: LIMITS.bank.max,
    required: false,
    shortMsg: 'أدخل اسم بنك الراتب من حرفين على الأقل، أو اتركه فارغاً.',
    longMsg: 'اسم بنك الراتب أطول من 60 حرفاً.',
    badMsg: 'أدخل اسم بنك الراتب بحروف واضحة، أو اتركه فارغاً.',
  });
  if (bank.error) errors.salaryBank = bank.error;
  else value.salaryBank = bank.value;

  const amount = takeInt(src.obligationsAmount, {
    min: LIMITS.obligations.min,
    max: LIMITS.obligations.max,
    required: false,
    badMsg: 'أدخل مبلغ الالتزامات رقماً صحيحاً، أو اتركه فارغاً.',
    rangeMsg: `مبلغ الالتزامات يجب أن يكون بين ${LIMITS.obligations.min} و ${LIMITS.obligations.max} ريال.`,
  });
  const months = takeInt(src.obligationsMonths, {
    min: LIMITS.months.min,
    max: LIMITS.months.max,
    required: false,
    badMsg: 'أدخل الأشهر المتبقية رقماً صحيحاً، أو اتركها فارغة.',
    rangeMsg: `الأشهر المتبقية يجب أن تكون بين ${LIMITS.months.min} و ${LIMITS.months.max}.`,
  });
  if (amount.error) errors.obligationsAmount = amount.error;
  if (months.error) errors.obligationsMonths = months.error;
  if (!amount.error && !months.error) {
    if (amount.value == null && months.value == null) {
      value.obligationsAmount = null;
      value.obligationsMonths = null;
    } else if (amount.value == null || months.value == null) {
      const msg = 'أدخل مبلغ الالتزامات والأشهر المتبقية معاً، أو اتركهما فارغين.';
      if (amount.value == null) errors.obligationsAmount = msg;
      if (months.value == null) errors.obligationsMonths = msg;
    } else {
      value.obligationsAmount = amount.value;
      value.obligationsMonths = months.value;
    }
  }

  const sakani = cleanText(src.sakani);
  if (sakani && !YES_NO.includes(sakani)) errors.sakani = 'اختر نعم أو لا لسكني، أو اتركه دون اختيار.';
  else value.sakani = sakani;

  const modLoan = cleanText(src.modLoan);
  if (value.employer === 'عسكري') {
    if (modLoan && !YES_NO.includes(modLoan)) errors.modLoan = 'اختر نعم أو لا لقرض الدفاع، أو اتركه دون اختيار.';
    else value.modLoan = modLoan;
  } else {
    value.modLoan = '';
  }

  const down = takeInt(src.downPayment, {
    min: LIMITS.down.min,
    max: LIMITS.down.max,
    required: false,
    badMsg: 'أدخل الدفعة رقماً صحيحاً، أو اتركها فارغة.',
    rangeMsg: `الدفعة يجب أن تكون بين ${LIMITS.down.min} و ${LIMITS.down.max} ريال.`,
  });
  if (down.error) errors.downPayment = down.error;
  else value.downPayment = down.value;

  const price = takeInt(src.propertyPrice, {
    min: LIMITS.price.min,
    max: LIMITS.price.max,
    required: false,
    badMsg: 'أدخل سعر العقار رقماً صحيحاً، أو اتركه فارغاً.',
    rangeMsg: `سعر العقار يجب أن يكون بين ${LIMITS.price.min} و ${LIMITS.price.max} ريال، أو اتركه فارغاً.`,
  });
  if (price.error) errors.propertyPrice = price.error;
  else value.propertyPrice = price.value;

  if (!errors.downPayment && !errors.propertyPrice && value.downPayment != null && value.propertyPrice != null && value.downPayment > value.propertyPrice) {
    errors.downPayment = 'الدفعة أكبر من سعر العقار.';
  }

  const propertyType = cleanText(src.propertyType);
  if (propertyType && !PROPERTY_TYPES.includes(propertyType)) errors.propertyType = 'اختر نوع العقار من القائمة، أو اتركه غير محدد.';
  else value.propertyType = propertyType;

  const city = takeText(src.city, {
    min: LIMITS.city.min,
    max: LIMITS.city.max,
    required: false,
    shortMsg: 'أدخل المدينة أو الحي من حرفين على الأقل، أو اترك الحقل فارغاً.',
    longMsg: 'المدينة أو الحي أطول من 80 حرفاً.',
    badMsg: 'أدخل المدينة أو الحي بحروف واضحة، أو اترك الحقل فارغاً.',
  });
  if (city.error) errors.city = city.error;
  else value.city = city.value;

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value };
}
