// View model for the Brand listing card. Field names follow the card spec
// (ref, unit_type, deal, district, ad_licence). The site JSON is mapped onto
// this shape in units-lib before render.
export const HIDDEN_PRICE = 'السعر عند التواصل';
export const DEAL_LABEL = 'للبيع';
export const CLOSED_CTA = 'تم البيع';

const STATUS_BADGE = {
  available: ['rt-badge', 'متاح'],
  new: ['rt-badge rt-badge--new', 'جديد'],
  reserved: ['rt-badge rt-badge--reserved', 'محجوز'],
  sold: ['rt-badge rt-badge--sold', 'مباع'],
  offplan: ['rt-badge rt-badge--offplan', 'على الخارطة'],
};

export const STATUS_LABEL = {
  draft: 'مسودة',
  available: 'متاح',
  reserved: 'محجوز',
  sold: 'مباع',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

export function waMessage(code) {
  return `السلام عليكم، جيتكم من الموقع - وحدة ${code}`;
}

export function waHref(whatsappUrl, code) {
  const base = String(whatsappUrl).replace(/\/$/, '');
  return `${base}?text=${encodeURIComponent(waMessage(code))}`;
}

export function riyadhDate(today = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(today);
}

export function licenceExpired(unit, today = new Date()) {
  return typeof unit.ad_license_expiry === 'string' && DATE_RE.test(unit.ad_license_expiry) && unit.ad_license_expiry < riyadhDate(today);
}

/** Full riyals, Western digits, en-US grouping. Never shortened to thousands. */
export function formatPriceAmount(amount) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0, useGrouping: true }).format(amount);
}

export function locationLine(district, city) {
  const name = typeof district === 'string' ? district.trim() : '';
  const town = typeof city === 'string' ? city.trim() : '';
  const districtText = name && !name.startsWith('حي ') && !name.startsWith('حي\u00a0') ? `حي ${name}` : name;
  return [districtText, town].filter(Boolean).join('، ');
}

function whatsappUrlOf(company) {
  const value = company?.whatsapp;
  if (typeof value === 'string') return value;
  if (value && typeof value.url === 'string') return value.url;
  return '';
}

function icon(href, id) {
  return `<svg class="rt-icon" aria-hidden="true"><use href="${esc(href)}#${id}" width="18" height="18"></use></svg>`;
}

function countPhrase(n, singular, plural) {
  return `<span class="rt-num">${esc(formatPriceAmount(n))}</span> ${n === 1 ? singular : plural}`;
}

/**
 * @param {object} unit Spec-shaped unit (ref, status, deal, specs, ad_licence, photos).
 * @param {object} company Office record. WhatsApp comes from company.whatsapp.
 * @param {{ iconHref?: string }} [opts]
 */
export function buildView(unit, company, { iconHref = '/assets/icons.svg' } = {}) {
  const number = typeof unit.ad_licence?.number === 'string' ? unit.ad_licence.number.trim() : '';
  const draft = unit.status === 'draft' || unit.placeholder === true || unit.expired === true || !number;
  const closed = unit.status === 'sold';
  const showDashes = draft;
  const specs = unit.specs || {};
  const items = [];

  function slot(iconId, empty, html) {
    if (empty && !showDashes) return;
    items.push(`<li>${icon(iconHref, iconId)}${empty ? '<span class="ph">—</span>' : html}</li>`);
  }

  const area = specs.area_m2;
  slot('area', area == null || area === '', `<span class="rt-num">${esc(formatPriceAmount(area))}</span> م²`);
  const rooms = specs.bedrooms;
  slot('bed', rooms == null || rooms === '', countPhrase(rooms, 'غرفة نوم', 'غرف نوم'));
  const baths = specs.bathrooms;
  slot('bath', baths == null || baths === '', countPhrase(baths, 'دورة مياه', 'دورات مياه'));
  const floor = specs.floor;
  const floorEmpty = floor == null || floor === '';
  const floorHtml = typeof floor === 'number'
    ? `<span class="rt-num">${esc(formatPriceAmount(floor))}</span>`
    : esc(floor);
  slot('building', floorEmpty, floorHtml);
  if (typeof specs.age_years === 'number') {
    slot('calendar', false, countPhrase(specs.age_years, 'سنة', 'سنوات'));
  }

  const where = locationLine(unit.district, unit.city);
  const badge = STATUS_BADGE[unit.status];
  const hidden = unit.price?.hidden === true || unit.price?.amount == null;
  const priceParts = hidden
    ? { hidden: true, amount: HIDDEN_PRICE, suffix: '' }
    : { hidden: false, amount: formatPriceAmount(unit.price.amount), suffix: 'ر.س' };
  const qr = typeof unit.ad_licence?.qr === 'string' ? unit.ad_licence.qr : '';
  const qrImg = number && qr
    ? `<img src="${esc(qr)}" alt="${esc(`رمز QR لترخيص الإعلان ${number}`)}" width="72" height="72" loading="lazy">`
    : '';
  const ref = `<span>مرجع <span class="rt-num">${esc(unit.ref)}</span></span>`;
  const legal = number
    ? `<span>ترخيص الإعلان <span class="rt-num">${esc(number)}</span></span>${qrImg}${ref}`
    : `<span>لا توجد رخصة إعلان</span>${ref}`;
  const features = Array.isArray(unit.features) && unit.features.length
    ? unit.features.filter((item) => typeof item === 'string' && item.trim()).map((item) => `<li>${esc(item.trim())}</li>`).join('')
    : '';
  const officeUrl = whatsappUrlOf(company);

  return {
    draft,
    closed,
    waDisabled: !closed && (draft || unit.sample === true || !officeUrl),
    wa_link: officeUrl ? waHref(officeUrl, unit.ref) : '',
    detailHref: unit.detailHref || '',
    priceParts,
    html: {
      status: badge ? `<span class="${badge[0]}">${badge[1]}</span>` : '',
      type: typeof unit.unit_type === 'string' ? unit.unit_type.trim() : '',
      deal: DEAL_LABEL,
      title: typeof unit.title === 'string' && unit.title.trim() ? unit.title.trim() : (unit.unit_type || unit.ref || ''),
      location: where ? `${icon(iconHref, 'pin')}<span>${esc(where)}</span>` : '',
      specs: items.join(''),
      features,
      cta: `${icon(iconHref, 'chat')}تواصل عبر واتساب`,
      legal,
    },
  };
}
