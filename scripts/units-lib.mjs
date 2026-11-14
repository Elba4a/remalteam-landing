// Units listings. Office data stays in content/site.json; unit data stays in content/units.json.
// Draft units are validated and then omitted from HTML, sitemap, and llms.txt.
// Card markup lives only in scripts/rt-listing-card.mjs.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { renderListingCard } from './rt-listing-card.mjs';
import {
  HIDDEN_PRICE,
  CLOSED_CTA,
  DEAL_LABEL,
  STATUS_LABEL,
  esc,
  ADVERTISER_NAME,
  ADVERTISER_WHATSAPP,
  FAL_LICENSE,
  formatLicenceDate,
  formatMeasure,
  formatPriceAmount,
  licenceExpired,
  locationLine,
  riyadhDate,
  waHref,
  waMessage,
} from './listing-view.mjs';

export { HIDDEN_PRICE, esc, licenceExpired, riyadhDate, waHref, waMessage };

export const CODE_RE = /^[A-Z]{2,4}-\d{3,4}$/;
export const STATUSES = ['draft', 'available', 'reserved', 'sold'];
export const AVAILABILITIES = ['available', 'reserved', 'sold'];
export const FEED_SCHEMA_VERSION = 1;
export const LICENSE_NUMBER_RE = /^[0-9]{6,20}$/;
export const PAYMENTS = ['cash', 'finance'];
export const VIDEO_MAX_BYTES = 3 * 1024 * 1024;
export const PLACEHOLDER_FLAG = 'بيانات تجريبية — الموقع والمواصفات غير مكتملة، ولا توجد رخصة إعلان، وهذه الوحدة غير منشورة.';

const PAYMENT_LABEL = { cash: 'كاش', finance: 'تمويل' };
const LOCAL_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const IMAGE_RE = /\.(jpe?g|png|webp)$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ICON_CHAT = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/></svg>';

const blank = (value) => value == null || (typeof value === 'string' && value.trim() === '');

// Date.parse('2027-02-31') overflows to March, so a NaN check accepts days that
// do not exist. Round-trip the UTC calendar fields instead.
export function isCalendarDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// A non-draft unit goes public with a valid ad licence number and an unexpired
// expiry (Real-Estate Advertising Regulation art. 5/1: the written data is enough).
// The QR image is optional. A non-draft unit whose expiry is still empty is
// "licence pending": it stays hidden and the build does not fail. A QR that is
// present but invalid still fails the build, as do a bad number or a bad expiry.
export function licencePending(unit) {
  return unit.status !== 'draft' && blank(unit.ad_license_expiry);
}

export function isPublic(unit, today = new Date()) {
  return unit.status !== 'draft' && !licencePending(unit) && !licenceExpired(unit, today);
}

export function publishedUnits(units, today = new Date()) {
  return units.filter((unit) => isPublic(unit, today));
}

function absoluteMediaUrl(origin, code, file) {
  if (typeof file !== 'string' || file.trim() === '') return null;
  if (/^https:\/\//i.test(file)) return file;
  if (!LOCAL_FILE_RE.test(file)) return null;
  return `${origin}/units/${code}/${file}`;
}

function feedText(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function feedNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function feedFloor(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return feedText(value);
}

// Machine-readable list for remal-calc. Same isPublic guard as the HTML:
// draft, licence-pending, and expired units are absent, and so is their media.
// `availability` is included as data only; it does not change publishing.
export function buildUnitsFeed(units, { origin, today = new Date() } = {}) {
  if (typeof origin !== 'string' || !/^https:\/\//i.test(origin)) throw new Error('units feed: missing https origin');
  const base = origin.replace(/\/$/, '');
  return {
    schema_version: FEED_SCHEMA_VERSION,
    generated_at: today.toISOString(),
    units: publishedUnits(units, today).map((unit) => {
      const logo = unit.media?.logo === true;
      const photos = logo
        ? []
        : (Array.isArray(unit.media?.photos) && unit.media.photos.length ? unit.media.photos : (unit.media?.cover ? [unit.media.cover] : []))
          .map((photo) => absoluteMediaUrl(base, unit.code, photo))
          .filter(Boolean);
      const cover = logo ? `${base}${LOGO_URL}` : absoluteMediaUrl(base, unit.code, unit.media?.cover);
      const price = unit.price && typeof unit.price === 'object' ? unit.price : {};
      return {
        code: unit.code,
        type: feedText(unit.type),
        title: cardTitle(unit),
        city: feedText(unit.city),
        neighbourhood: feedText(unit.neighbourhood),
        area_m2: feedNumber(unit.area_m2),
        price: {
          hidden: price.hidden === true,
          amount: feedNumber(price.amount),
          currency: price.currency || 'SAR',
        },
        rooms: Number.isInteger(unit.rooms) ? unit.rooms : null,
        bathrooms: Number.isInteger(unit.bathrooms) ? unit.bathrooms : null,
        floor: feedFloor(unit.floor),
        features: Array.isArray(unit.features) ? unit.features.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()) : [],
        payment: PAYMENTS.includes(unit.payment) ? unit.payment : null,
        ad_license_number: typeof unit.ad_license_number === 'string' ? unit.ad_license_number.trim() : '',
        ad_license_expiry: typeof unit.ad_license_expiry === 'string' ? unit.ad_license_expiry : '',
        status: unit.status,
        availability: AVAILABILITIES.includes(unit.availability) ? unit.availability : 'available',
        needs_manager_confirmation: unit.needs_manager_confirmation === true,
        cover,
        photos,
        page_url: `${base}/units/${unit.code}/`,
        updated: unit.updated,
      };
    }),
  };
}

function isHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function mediaRef(code, value, publicDir, errors, label, mediaRoot) {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${code}: bad media path (${label})`);
    return null;
  }
  if (/^https?:\/\//i.test(value)) {
    if (!isHttps(value)) errors.push(`${code}: bad media path (${label} must be https)`);
    return { kind: 'remote', url: value };
  }
  if (value.startsWith('/') || value.includes('..') || value.includes('\\') || value.includes('://') || !LOCAL_FILE_RE.test(value)) {
    errors.push(`${code}: bad media path (${label})`);
    return null;
  }
  // Source files live in mediaRoot/<code>/ when the build owns public/units.
  // Tests that stage files directly under public/units/<code>/ omit mediaRoot.
  const root = mediaRoot ? resolve(mediaRoot, code) : resolve(publicDir, 'units', code);
  const abs = resolve(root, value);
  if (abs !== root && !abs.startsWith(root + sep)) {
    errors.push(`${code}: bad media path (${label})`);
    return null;
  }
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    errors.push(`${code}: bad media path (${label} missing ${value})`);
    return null;
  }
  return { kind: 'local', url: `/units/${code}/${value}`, abs };
}

function qrImageOk(qr) {
  if (!qr) return true;
  if (qr.kind === 'local') return IMAGE_RE.test(String(qr.url).split('/').pop());
  try {
    return IMAGE_RE.test(new URL(qr.url).pathname);
  } catch {
    return false;
  }
}

function requireText(unit, key, errors) {
  if (typeof unit[key] !== 'string' || unit[key].trim() === '') errors.push(`${unit.code || '?'}: missing ${key}`);
}

export function validateUnits(data, { publicDir, mediaRoot, today = new Date() }) {
  const errors = [];
  const warnings = [];
  const todayStamp = riyadhDate(today);
  if (!data || typeof data !== 'object' || Array.isArray(data)) errors.push('content/units.json: expected an object');
  if (data && !DATE_RE.test(data.updated || '')) errors.push('content/units.json: missing updated (YYYY-MM-DD)');
  if (data && !Array.isArray(data.units)) errors.push('content/units.json: missing units array');
  if (errors.length) {
    const error = new Error(errors.join('\n'));
    error.errors = errors;
    throw error;
  }

  const seen = new Set();
  for (const unit of data.units) {
    if (!unit || typeof unit !== 'object' || Array.isArray(unit)) {
      errors.push('unit: expected an object');
      continue;
    }
    const code = unit.code;
    if (typeof code !== 'string' || !CODE_RE.test(code)) errors.push(`${code ?? '?'}: bad code`);
    else if (seen.has(code)) errors.push(`${code}: duplicate code`);
    else seen.add(code);
    const label = typeof code === 'string' ? code : '?';

    if (unit.status == null || unit.status === '') errors.push(`${label}: missing status`);
    else if (!STATUSES.includes(unit.status)) errors.push(`${label}: bad status`);

    // Optional. Omitted means available. Any other value fails the build.
    // This does not change what isPublic publishes, including availability "sold".
    if (Object.prototype.hasOwnProperty.call(unit, 'availability') && !AVAILABILITIES.includes(unit.availability)) {
      errors.push(`${label}: bad availability`);
    }
    if (Object.prototype.hasOwnProperty.call(unit, 'needs_manager_confirmation') && typeof unit.needs_manager_confirmation !== 'boolean') {
      errors.push(`${label}: needs_manager_confirmation must be true or false`);
    }

    if (unit.price == null) errors.push(`${label}: missing price`);
    else if (typeof unit.price !== 'object' || Array.isArray(unit.price)) errors.push(`${label}: missing price`);
    else {
      const hidden = unit.price.hidden === true;
      if (!hidden) {
        if (typeof unit.price.amount !== 'number' || !Number.isFinite(unit.price.amount) || unit.price.amount < 0) errors.push(`${label}: missing price`);
        if (unit.price.currency !== 'SAR') errors.push(`${label}: price.currency must be SAR`);
      } else if (unit.price.currency != null && unit.price.currency !== 'SAR') errors.push(`${label}: price.currency must be SAR`);
      if (Object.prototype.hasOwnProperty.call(unit.price, 'period')) errors.push(`${label}: price.period is not used`);
    }

    if (Object.prototype.hasOwnProperty.call(unit, 'listing_type')) errors.push(`${label}: listing_type is not used`);
    if (unit._placeholder != null && typeof unit._placeholder !== 'boolean') errors.push(`${label}: _placeholder must be true or false`);
    if (unit._placeholder === true && unit.status !== 'draft') errors.push(`${label}: placeholder units must stay status draft`);

    const media = unit.media;
    if (!media || typeof media !== 'object') errors.push(`${label}: bad media path (media)`);
    else if (media.logo != null) {
      if (media.logo !== true) errors.push(`${label}: media.logo must be true`);
      if (media.cover != null || media.photos != null || media.video != null) errors.push(`${label}: media.logo cannot be combined with photos`);
    } else {
      const cover = mediaRef(label, media.cover, publicDir, errors, 'cover', mediaRoot);
      if (cover && cover.kind === 'local' && !IMAGE_RE.test(media.cover)) errors.push(`${label}: bad media path (cover)`);
      const photos = media.photos == null ? [media.cover] : media.photos;
      if (!Array.isArray(photos) || photos.length === 0) errors.push(`${label}: bad media path (photos)`);
      else {
        const names = new Set();
        for (const photo of photos) {
          if (names.has(photo)) errors.push(`${label}: bad media path (duplicate photo)`);
          names.add(photo);
          const ref = mediaRef(label, photo, publicDir, errors, 'photo', mediaRoot);
          if (ref && ref.kind === 'local' && !IMAGE_RE.test(photo)) errors.push(`${label}: bad media path (photo)`);
        }
        if (typeof media.cover === 'string' && !names.has(media.cover)) errors.push(`${label}: bad media path (cover not in photos)`);
      }
      if (media.video != null && media.video !== '') {
        const video = mediaRef(label, media.video, publicDir, errors, 'video', mediaRoot);
        if (video?.kind === 'local') {
          if (!/\.mp4$/i.test(media.video)) errors.push(`${label}: bad media path (video must be mp4)`);
          else if (statSync(video.abs).size > VIDEO_MAX_BYTES) errors.push(`${label}: video over 3 MB (use an https URL instead)`);
        }
        const poster = mediaRef(label, media.poster, publicDir, errors, 'poster', mediaRoot);
        if (poster && poster.kind === 'local' && !IMAGE_RE.test(String(media.poster))) errors.push(`${label}: bad media path (poster)`);
      }
    }

    const publishing = unit.status && unit.status !== 'draft';
    if (publishing) {
      if (unit._placeholder === true) errors.push(`${label}: placeholder units must stay status draft`);
      requireText(unit, 'type', errors);
      // Optional specs: omitted when the manager did not give them, validated when present.
      if (unit.area_m2 != null && (typeof unit.area_m2 !== 'number' || !Number.isFinite(unit.area_m2) || unit.area_m2 <= 0)) errors.push(`${label}: bad area_m2`);
      for (const key of ['rooms', 'bathrooms']) {
        if (unit[key] != null && (!Number.isInteger(unit[key]) || unit[key] < 0)) errors.push(`${label}: bad ${key}`);
      }
      if (unit.floor != null && unit.floor !== '' && typeof unit.floor !== 'string' && typeof unit.floor !== 'number') errors.push(`${label}: bad floor`);
      for (const key of ['neighbourhood', 'city']) {
        if (unit[key] != null && typeof unit[key] !== 'string') errors.push(`${label}: bad ${key}`);
      }
      if (unit.payment != null && !PAYMENTS.includes(unit.payment)) errors.push(`${label}: bad payment`);
      if (unit.features != null && (!Array.isArray(unit.features) || unit.features.some((f) => typeof f !== 'string' || !f.trim()))) errors.push(`${label}: bad features`);
      if (!unit.updated || !DATE_RE.test(unit.updated)) errors.push(`${label}: missing updated`);
      if (!unit.seo || typeof unit.seo.title !== 'string' || unit.seo.title.trim() === '') errors.push(`${label}: missing seo.title`);
      if (!unit.seo || typeof unit.seo.description !== 'string' || unit.seo.description.trim() === '') errors.push(`${label}: missing seo.description`);
      const number = typeof unit.ad_license_number === 'string' ? unit.ad_license_number.trim() : '';
      if (!number) errors.push(`${label}: missing ad_license_number`);
      else if (!LICENSE_NUMBER_RE.test(number)) errors.push(`${label}: bad ad_license_number`);
      if (!blank(unit.ad_license_expiry) && (typeof unit.ad_license_expiry !== 'string' || !isCalendarDate(unit.ad_license_expiry))) errors.push(`${label}: bad ad_license_expiry`);
      if (unit.ad_license_qr != null && typeof unit.ad_license_qr !== 'string') errors.push(`${label}: bad ad_license_qr`);
      if (licencePending(unit)) warnings.push(`${label}: hidden until ad_license_expiry is filled`);
    }

    if (unit.ad_license_advertiser != null && unit.ad_license_advertiser !== '') {
      if (typeof unit.ad_license_advertiser !== 'string' || !unit.ad_license_advertiser.trim()) errors.push(`${label}: bad ad_license_advertiser`);
    }
    if (unit.fal_license != null && unit.fal_license !== '') {
      const fal = typeof unit.fal_license === 'string' ? unit.fal_license.trim() : '';
      if (!LICENSE_NUMBER_RE.test(fal)) errors.push(`${label}: bad fal_license`);
    }
    if (unit.ad_license_verify_url != null && unit.ad_license_verify_url !== '') {
      if (typeof unit.ad_license_verify_url !== 'string' || !isHttps(unit.ad_license_verify_url)) errors.push(`${label}: bad ad_license_verify_url`);
    }

    if (unit.ad_license_qr != null && unit.ad_license_qr !== '') {
      const qr = mediaRef(label, unit.ad_license_qr, publicDir, errors, 'ad_license_qr', mediaRoot);
      if (qr && !qrImageOk(qr)) errors.push(`${label}: bad media path (ad_license_qr)`);
    }
    if (unit.status === 'draft' && !blank(unit.ad_license_expiry) && !isCalendarDate(unit.ad_license_expiry)) {
      errors.push(`${label}: bad ad_license_expiry`);
    }
    if (licenceExpired(unit, today)) warnings.push(`${label}: ad licence expired on ${unit.ad_license_expiry} (today in Riyadh is ${todayStamp}); not published`);
  }

  if (errors.length) {
    const error = new Error(`content/units.json\n${errors.join('\n')}`);
    error.errors = errors;
    throw error;
  }
  return { units: data.units, warnings };
}

// content/units.json plus one file per unit in content/units/<CODE>.json.
export function readUnitFiles(root) {
  const dir = join(root, 'content/units');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith('.json')).sort().map((name) => {
    let unit;
    try {
      unit = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    } catch (err) {
      throw new Error(`content/units/${name}: invalid JSON (${err.message})`);
    }
    if (!unit || typeof unit !== 'object' || Array.isArray(unit)) throw new Error(`content/units/${name}: expected one unit object`);
    if (`${unit.code}.json` !== name) throw new Error(`content/units/${name}: file name must match code`);
    return unit;
  });
}

export function readUnitsDocument(root, publicDir, today = new Date()) {
  const data = JSON.parse(readFileSync(join(root, 'content/units.json'), 'utf8'));
  if (data && Array.isArray(data.units)) data.units = [...data.units, ...readUnitFiles(root)];
  const { units, warnings } = validateUnits(data, { publicDir, mediaRoot: join(root, 'content/unit-media'), today });
  return { updated: data.updated, units, warnings };
}

function priceView(unit) {
  if (unit.price?.hidden === true || unit.price?.amount == null) return { hidden: true, text: HIDDEN_PRICE };
  return { hidden: false, amount: formatPriceAmount(unit.price.amount), currency: 'ر.س' };
}

function cardTitle(unit) {
  if (typeof unit.title === 'string' && unit.title.trim()) return unit.title.trim();
  const type = typeof unit.type === 'string' ? unit.type.trim() : '';
  if (type && typeof unit.area_m2 === 'number') return `${type} · ${formatMeasure(unit.area_m2)} م²`;
  if (type) return type;
  return `وحدة ${unit.code}`;
}

function specRows(unit) {
  // Missing specs are omitted, never shown as dashes or guessed.
  const rows = [];
  if (!blank(unit.type)) rows.push({ label: 'النوع', value: String(unit.type) });
  if (unit.area_m2 != null) rows.push({ label: 'المساحة', value: formatMeasure(unit.area_m2), ltr: true, suffix: ' م²' });
  if (unit.rooms != null) rows.push({ label: 'الغرف', value: String(unit.rooms), ltr: true });
  if (unit.bathrooms != null) rows.push({ label: 'دورات المياه', value: String(unit.bathrooms), ltr: true });
  if (!blank(unit.floor)) rows.push({ label: 'الدور', value: String(unit.floor), ltr: typeof unit.floor === 'number' });
  const where = locationLine(unit.neighbourhood, unit.city);
  if (where) rows.push({ label: 'الموقع', value: where });
  if (PAYMENT_LABEL[unit.payment]) rows.push({ label: 'الدفع', value: PAYMENT_LABEL[unit.payment] });
  for (const feature of Array.isArray(unit.features) ? unit.features : []) rows.push({ label: '', value: feature });
  return rows;
}

export const LOGO_URL = '/assets/logo-ivory.svg';

function coverUrl(unit) {
  if (unit.media?.logo === true) return LOGO_URL;
  const cover = unit.media.cover;
  return /^https:\/\//i.test(cover) ? cover : `/units/${unit.code}/${cover}`;
}

function publicUrl(unit, file) {
  return /^https:\/\//i.test(file) ? file : `/units/${unit.code}/${file}`;
}

function licenceParty(unit) {
  const advertiser = typeof unit.ad_license_advertiser === 'string' ? unit.ad_license_advertiser.trim() : '';
  const fal = typeof unit.fal_license === 'string' ? unit.fal_license.trim() : '';
  return {
    advertiser: advertiser || ADVERTISER_NAME,
    fal: fal || FAL_LICENSE,
    whatsapp: ADVERTISER_WHATSAPP,
  };
}

function toSpecUnit(unit, today) {
  const number = typeof unit.ad_license_number === 'string' ? unit.ad_license_number.trim() : '';
  const qr = typeof unit.ad_license_qr === 'string' && unit.ad_license_qr ? publicUrl(unit, unit.ad_license_qr) : '';
  const party = licenceParty(unit);
  return {
    ref: unit.code,
    status: unit.status,
    sample: unit.sample === true,
    placeholder: unit._placeholder === true,
    expired: licenceExpired(unit, today),
    pending: licencePending(unit),
    title: cardTitle(unit),
    unit_type: typeof unit.type === 'string' ? unit.type.trim() : '',
    deal: DEAL_LABEL,
    district: unit.neighbourhood,
    city: unit.city,
    specs: {
      area_m2: unit.area_m2,
      bedrooms: unit.rooms,
      bathrooms: unit.bathrooms,
      floor: unit.floor,
      age_years: unit.age_years,
    },
    features: unit.features,
    price: {
      hidden: unit.price?.hidden === true || unit.price?.amount == null,
      amount: unit.price?.amount,
      unit: unit.price?.currency || 'SAR',
      period: unit.price?.period,
    },
    photos: unit.media?.cover ? [unit.media.cover] : [],
    logo: unit.media?.logo === true,
    ad_licence: { number, qr, expiry: formatLicenceDate(unit.ad_license_expiry), ...party },
    detailHref: `/units/${unit.code}/`,
  };
}

function cardPhotoBase(unit) {
  const cover = unit.media?.cover;
  if (typeof cover === 'string' && /^https:\/\//i.test(cover)) return '';
  return `/units/${unit.code}/`;
}

export function unitCardView(unit, whatsappUrl, today = new Date()) {
  const expired = licenceExpired(unit, today);
  const closed = unit.status === 'sold';
  const number = typeof unit.ad_license_number === 'string' ? unit.ad_license_number.trim() : '';
  const qr = typeof unit.ad_license_qr === 'string' && unit.ad_license_qr ? publicUrl(unit, unit.ad_license_qr) : '';
  const party = licenceParty(unit);
  const placeholder = unit._placeholder === true || unit.status === 'draft' || expired || licencePending(unit);
  return {
    code: unit.code,
    placeholder,
    closed,
    detailHref: `/units/${unit.code}/`,
    waHref: waHref(whatsappUrl, unit.code),
    disabledWa: closed || placeholder,
    coverUrl: coverUrl(unit),
    alt: cardTitle(unit),
    status: unit.status,
    statusLabel: STATUS_LABEL[unit.status] || unit.status,
    dealLabel: DEAL_LABEL,
    title: cardTitle(unit),
    specs: specRows(unit),
    price: priceView(unit),
    license: number ? { number, expiry: formatLicenceDate(unit.ad_license_expiry), qrUrl: qr, alt: qr ? `رمز QR لترخيص الإعلان ${number}` : '', ...party } : null,
  };
}

function jsonLd(value) {
  return JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
}

// Schema.org type for the unit's own `type` string. Unknown types are omitted.
function accommodationType(type) {
  const value = typeof type === 'string' ? type.trim() : '';
  if (value.startsWith('شقة') || value.startsWith('دور')) return 'Apartment';
  if (value.startsWith('فيلا')) return 'SingleFamilyResidence';
  if (value.startsWith('عمارة')) return 'ApartmentComplex';
  if (value.startsWith('استراحة')) return 'House';
  return '';
}

function listingImageUrls(unit, origin) {
  if (unit.media?.logo === true) return [`${origin}/assets/og.png`];
  const urls = [];
  const add = (file) => {
    if (typeof file !== 'string' || !file.trim()) return;
    const url = /^https:\/\//i.test(file) ? file : `${origin}/units/${unit.code}/${file}`;
    if (!urls.includes(url)) urls.push(url);
  };
  const photos = Array.isArray(unit.media?.photos) ? unit.media.photos : [];
  if (photos.length) photos.forEach(add);
  else add(unit.media?.cover);
  return urls;
}

function listingAddress(unit) {
  const address = { '@type': 'PostalAddress', addressRegion: 'عسير', addressCountry: 'SA' };
  const city = typeof unit.city === 'string' ? unit.city.trim() : '';
  const district = typeof unit.neighbourhood === 'string' ? unit.neighbourhood.trim() : '';
  if (city) address.addressLocality = city;
  if (district) address.streetAddress = district;
  return address;
}

// Room counts come only from integer fields already on the unit. `rooms` is the
// single stored count; the listing card already presents it as غرف نوم.
function applyListingFacts(listing, unit, origin, offer) {
  const images = listingImageUrls(unit, origin);
  if (images.length) listing.image = images;
  listing.address = listingAddress(unit);
  const propertyType = accommodationType(unit.type);
  if (propertyType) listing.additionalType = `https://schema.org/${propertyType}`;
  if (Number.isInteger(unit.rooms)) {
    listing.numberOfRooms = unit.rooms;
    listing.numberOfBedrooms = unit.rooms;
  }
  if (Number.isInteger(unit.bathrooms)) listing.numberOfBathroomsTotal = unit.bathrooms;
  if (isCalendarDate(unit.ad_license_expiry)) {
    listing.validThrough = unit.ad_license_expiry;
    if (offer) {
      offer.validThrough = unit.ad_license_expiry;
      offer.priceValidUntil = unit.ad_license_expiry;
    }
  }
  if (isCalendarDate(unit.updated)) listing.datePosted = unit.updated;
}

const COMMERCIAL_REGISTRATION = '7053922824';

function officeWithoutCommercialRegistration(office) {
  if (!office || typeof office !== 'object' || !Array.isArray(office.identifier)) return office;
  const identifier = office.identifier.filter((item) => !item || (item.name !== 'السجل التجاري' && String(item.value) !== COMMERCIAL_REGISTRATION));
  if (identifier.length === office.identifier.length) return office;
  const next = { ...office };
  if (identifier.length) next.identifier = identifier;
  else delete next.identifier;
  return next;
}

function legalWithoutCommercialRegistration(legal) {
  return String(legal ?? '').replace(/<span>السجل التجاري:[\s\S]*?<\/span>\s*/g, '');
}

function pageShell({ site, legal, pageLinks, title, description, canonical, robots, ogImage, main, graph, whatsappHref, cardCss = false }) {
  legal = legalWithoutCommercialRegistration(legal);
  graph = graph.map((node) => (node && node['@type'] === 'RealEstateAgent' ? officeWithoutCommercialRegistration(node) : node));
  const wa = whatsappHref || site.whatsapp.url;
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${robots ? `<meta name="robots" content="${esc(robots)}">\n` : ''}<link rel="canonical" href="${esc(canonical)}">
<meta name="theme-color" content="#1C1D21">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/assets/favicon-48.png" type="image/png" sizes="48x48">
<link rel="icon" href="/assets/favicon-96.png" type="image/png" sizes="96x96">
<link rel="icon" href="/assets/favicon-192.png" type="image/png" sizes="192x192">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:locale" content="ar_SA">
<meta property="og:site_name" content="${esc(site.name.ar)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(ogImage)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alexandria:wght@500;600&family=Barlow+Condensed:wght@500;600&family=Barlow+Semi+Condensed:wght@500;600&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/assets/pages.css">
${cardCss ? '<link rel="stylesheet" href="/assets/rt-listing-card.css">\n' : ''}
<script type="application/ld+json">
${jsonLd({ '@context': 'https://schema.org', '@graph': graph })}
</script>
</head>
<body>
<a class="skip" href="#main">تخطَّ إلى المحتوى</a>
<header class="site-head night">
  <div class="wrap">
    <a class="logo" href="/" aria-label="${esc(site.name.ar)} — الصفحة الرئيسية"><img src="/assets/logo-ivory.svg" alt="الرمال تيم العقارية" width="164" height="36"></a>
    <a class="btn btn-gold" href="${esc(wa)}">${ICON_CHAT}واتساب</a>
  </div>
</header>
<main id="main">
${main}
  <section id="contact" class="contact night" aria-labelledby="contact-title">
    <div class="wrap">
      <div class="contact-grid">
        <div>
          <h2 id="contact-title">تواصل معنا</h2>
          <p class="en">Get in touch</p>
          <p>اكتب لنا على واتساب: نوع العقار، الحي، والميزانية أو بيانات التمويل. حسبة التمويل ومقارنة البنوك نرسلها لك خلال دقائق، وباقي الطلبات نرد عليها في أقرب وقت.</p>
          <a class="btn btn-gold" href="${esc(wa)}">${ICON_CHAT}تواصل عبر واتساب</a>
        </div>
        ${pageLinks}
      </div>
      <footer class="site-foot">
        <img src="/assets/logo-ivory.svg" alt="الرمال تيم العقارية" width="137" height="30" loading="lazy">
        ${legal}
        <a href="https://calc.remalteam.com" rel="nofollow">دخول الفريق</a>
      </footer>
    </div>
  </section>
</main>
</body>
</html>
`;
}

function flagHtml(units, today) {
  const bits = [];
  if (units.some((unit) => unit._placeholder === true || unit.status === 'draft')) bits.push(PLACEHOLDER_FLAG);
  if (units.some((unit) => licenceExpired(unit, today))) bits.push('رخصة الإعلان منتهية — الوحدة غير منشورة.');
  return bits.map((bit) => `    <p class="unit-flag" role="note">${esc(bit)}</p>`).join('\n');
}

const INDEX_TITLE = 'الوحدات العقارية في عسير | مكتب الرمال تيم العقارية';
const INDEX_DESCRIPTION = 'الوحدات المنشورة لدى مكتب الرمال تيم العقارية في أبها وخميس مشيط ومنطقة عسير. تظهر الوحدة هنا بعد اعتماد المواصفات والسعر، والتواصل عبر واتساب.';

function renderIndex(units, ctx) {
  const today = ctx.today || new Date();
  const showFlag = units.some((unit) => !isPublic(unit, today) || unit._placeholder === true);
  const cards = units.map((unit) => renderListingCard(toSpecUnit(unit, today), { whatsapp: ctx.site.whatsapp.url }, { photoBase: cardPhotoBase(unit) })).join('\n');
  const list = units.length
    ? `<div class="rt-listing-grid">\n${cards}\n</div>`
    : `<div class="units-empty">
      <h2>لا توجد وحدات منشورة حالياً</h2>
      <p>تظهر الوحدة هنا بعد اعتماد مواصفاتها وسعرها. للسؤال عن المتاح الآن، تواصل معنا على واتساب.</p>
      <a class="btn btn-gold" href="${esc(ctx.site.whatsapp.url)}">${ICON_CHAT}تواصل عبر واتساب</a>
    </div>`;
  const origin = ctx.site.origin;
  const graph = [
    ctx.office,
    { '@type': 'CollectionPage', '@id': `${origin}/units/#page`, url: `${origin}/units/`, name: INDEX_TITLE, description: INDEX_DESCRIPTION, inLanguage: 'ar', isPartOf: { '@id': `${origin}/#site` }, about: { '@id': ctx.office['@id'] } },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'الرئيسية', item: `${origin}/` }, { '@type': 'ListItem', position: 2, name: 'الوحدات', item: `${origin}/units/` }] },
    { '@type': 'ItemList', itemListElement: publishedUnits(units, ctx.today).map((unit, index) => ({ '@type': 'ListItem', position: index + 1, name: cardTitle(unit), url: `${origin}/units/${unit.code}/` })) },
  ];
  const main = `  <section class="page-hero night" aria-labelledby="page-title">
    <div class="wrap">
      <nav class="crumbs" aria-label="مسار الصفحة"><a href="/">الرئيسية</a> / <span>الوحدات</span></nav>
      <p class="eyebrow">الوحدات</p>
      <h1 id="page-title">الوحدات العقارية</h1>
      <p class="en en-line">Listings</p>
      <p class="lead">الوحدات التي نعتمد مواصفاتها وسعرها تظهر هنا. إن لم تجد ما يناسبك، اكتب لنا على واتساب.</p>
    </div>
  </section>
  <section aria-labelledby="page-title">
    <div class="wrap">
${flagHtml(units, today)}${list}
    </div>
  </section>`;
  return pageShell({
    ...ctx,
    title: INDEX_TITLE,
    description: INDEX_DESCRIPTION,
    canonical: `${origin}/units/`,
    robots: showFlag ? 'noindex' : '',
    ogImage: `${origin}/assets/og.png`,
    main,
    graph,
    cardCss: units.length > 0,
  });
}

function detailLicense(view) {
  if (!view.license) return view.placeholder ? '<p class="unit-license unit-license--missing">لا توجد رخصة إعلان</p>' : '';
  const qr = view.license.qrUrl
    ? `<img src="${esc(view.license.qrUrl)}" alt="${esc(view.license.alt)}" width="128" height="128" loading="lazy" decoding="async">`
    : '';
  const expiry = view.license.expiry ? `<p>ينتهي <span class="ltr">${esc(view.license.expiry)}</span></p>` : '';
  const advertiser = view.license.advertiser || ADVERTISER_NAME;
  const fal = view.license.fal || FAL_LICENSE;
  const whatsapp = view.license.whatsapp || ADVERTISER_WHATSAPP;
  return `<div class="unit-license">
          ${qr}<div>
            <p class="lbl">ترخيص الإعلان</p>
            <p class="ltr">${esc(view.license.number)}</p>
            ${expiry}
            <p>المعلن: ${esc(advertiser)}</p>
            <p>رخصة فال <span class="ltr">${esc(fal)}</span></p>
            <p>واتساب <span class="ltr">${esc(whatsapp)}</span></p>
          </div>
        </div>`;
}

function renderDetail(unit, ctx) {
  const view = unitCardView(unit, ctx.site.whatsapp.url, ctx.today);
  const photos = unit.media.logo ? [] : (unit.media.photos?.length ? unit.media.photos : [unit.media.cover]).filter((photo) => photo !== unit.media.cover);
  const thumbs = photos.map((photo) => `        <img src="${esc(publicUrl(unit, photo))}" alt="${esc(view.alt)}" width="1280" height="800" loading="lazy" decoding="async">`).join('\n');
  const video = unit.media.video
    ? `      <div class="unit-video"><video controls playsinline preload="metadata" poster="${esc(publicUrl(unit, unit.media.poster))}"><source src="${esc(publicUrl(unit, unit.media.video))}" type="video/mp4"></video></div>`
    : '';
  const specs = view.specs.map((spec) => {
    const value = spec.ltr ? `<span class="ltr">${esc(spec.value)}</span>${spec.suffix ? esc(spec.suffix) : ''}` : esc(spec.value);
    return spec.label ? `        <div><dt>${esc(spec.label)}</dt><dd>${value}</dd></div>` : `        <div class="unit-specs__feature"><dd>${value}</dd></div>`;
  }).join('\n');
  const price = view.price.hidden
    ? esc(view.price.text)
    : `<span class="ltr">${esc(view.price.amount)}</span> ${esc(view.price.currency)}`;
  const showFlag = view.placeholder;
  const ctaLabel = view.closed ? CLOSED_CTA : 'تواصل عبر واتساب';
  const waButton = view.disabledWa
    ? `<span class="btn btn-gold btn-disabled" aria-disabled="true">${ICON_CHAT}${esc(ctaLabel)}</span>`
    : `<a class="btn btn-gold" href="${esc(view.waHref)}" target="_blank" rel="noopener">${ICON_CHAT}${esc(ctaLabel)}</a>`;
  const origin = ctx.site.origin;
  const url = `${origin}/units/${unit.code}/`;
  const title = unit.seo?.title?.trim() || `وحدة ${unit.code} | ${ctx.site.name.ar}`;
  const description = unit.seo?.description?.trim() || PLACEHOLDER_FLAG;
  const ogImage = unit.media.logo ? `${origin}/assets/og.png` : /^https:\/\//i.test(view.coverUrl) ? view.coverUrl : `${origin}${view.coverUrl}`;
  const offer = view.price.hidden || !isPublic(unit, ctx.today) ? null : {
    '@type': 'Offer',
    priceCurrency: 'SAR',
    price: unit.price.amount,
    availability: unit.status === 'sold' ? 'https://schema.org/SoldOut' : unit.status === 'reserved' ? 'https://schema.org/LimitedAvailability' : 'https://schema.org/InStock',
  };
  const listing = {
    '@type': 'RealEstateListing',
    '@id': `${url}#listing`,
    name: view.title,
    description,
    url,
    image: ogImage,
    inLanguage: 'ar',
    provider: { '@id': ctx.office['@id'] },
  };
  if (offer) listing.offers = offer;
  applyListingFacts(listing, unit, origin, offer);
  if (view.license) listing.identifier = { '@type': 'PropertyValue', name: 'رقم ترخيص الإعلان', value: view.license.number };
  if (typeof unit.area_m2 === 'number') listing.floorSize = { '@type': 'QuantitativeValue', value: unit.area_m2, unitCode: 'MTK' };
  const graph = [
    ctx.office,
    { '@type': 'WebPage', '@id': url, url, name: title, description, inLanguage: 'ar', isPartOf: { '@id': `${origin}/#site` }, about: { '@id': ctx.office['@id'] }, primaryImageOfPage: ogImage },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'الرئيسية', item: `${origin}/` }, { '@type': 'ListItem', position: 2, name: 'الوحدات', item: `${origin}/units/` }, { '@type': 'ListItem', position: 3, name: unit.code, item: url }] },
    listing,
  ];
  const main = `  <section class="page-hero night" aria-labelledby="page-title">
    <div class="wrap">
      <nav class="crumbs" aria-label="مسار الصفحة"><a href="/">الرئيسية</a> / <a href="/units/">الوحدات</a> / <span class="ltr">${esc(unit.code)}</span></nav>
      <p class="eyebrow ltr">${esc(unit.code)}</p>
      <h1 id="page-title">${esc(view.title)}</h1>
      <p class="en en-line">Unit ${esc(unit.code)}</p>
    </div>
  </section>
  <section>
    <div class="wrap">
${flagHtml([unit], ctx.today)}      <div class="unit-layout${view.closed ? ' unit-layout--closed' : ''}">
        <div class="unit-gallery">
          ${unit.media.logo ? `<div class="unit-logo-card"><img src="${esc(view.coverUrl)}" alt="الرمال تيم" width="220" height="80" decoding="async"><span class="ltr">${esc(unit.code)}</span></div>` : `<img src="${esc(view.coverUrl)}" alt="${esc(view.alt)}" width="1280" height="800" fetchpriority="high" decoding="async">`}
          ${thumbs ? `<div class="unit-gallery__rest">\n${thumbs}\n          </div>` : ''}
        </div>
        <div class="unit-buy">
          <p class="unit-price${view.closed ? ' unit-price--closed' : ''}">${price}</p>
          <p class="unit-deal">${esc(view.dealLabel)}</p>
          <p class="unit-status unit-status--${esc(unit.status)}">${esc(view.statusLabel)}</p>
          ${waButton}
          ${detailLicense(view)}
        </div>
        <dl class="unit-specs">
${specs}
        </dl>
        ${video}
      </div>
    </div>
  </section>`;
  return pageShell({
    ...ctx,
    title,
    description,
    canonical: url,
    robots: showFlag ? 'noindex' : '',
    ogImage,
    main,
    graph,
    whatsappHref: view.disabledWa ? undefined : view.waHref,
  });
}

function referencedLocalMedia(unit) {
  const names = [];
  const push = (value) => {
    if (typeof value !== 'string' || !LOCAL_FILE_RE.test(value) || names.includes(value)) return;
    names.push(value);
  };
  const media = unit.media || {};
  if (media.logo !== true) {
    push(media.cover);
    for (const photo of Array.isArray(media.photos) ? media.photos : []) push(photo);
    push(media.video);
    push(media.poster);
  }
  push(unit.ad_license_qr);
  return names;
}

// public/units/<code>/ is build output. Source files stay in mediaRoot and are
// copied only for units that are actually being rendered. Everyone else loses
// their public directory, including a unit that was published and then dropped.
function syncPublishedMedia({ publicDir, mediaRoot, visible }) {
  if (!mediaRoot) return;
  const dir = join(publicDir, 'units');
  mkdirSync(dir, { recursive: true });
  const keep = new Set(visible.map((unit) => unit.code));
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || keep.has(entry.name)) continue;
    rmSync(join(dir, entry.name), { recursive: true, force: true });
  }
  for (const unit of visible) {
    const dest = join(dir, unit.code);
    mkdirSync(dest, { recursive: true });
    const names = referencedLocalMedia(unit);
    const kept = new Set(names);
    for (const name of names) {
      const fromRoot = resolve(mediaRoot, unit.code);
      const from = resolve(fromRoot, name);
      if (from !== fromRoot && !from.startsWith(fromRoot + sep)) throw new Error(`${unit.code}: bad media path (${name})`);
      if (!existsSync(from) || !statSync(from).isFile()) throw new Error(`${unit.code}: source media missing ${name}`);
      copyFileSync(from, join(dest, name));
    }
    for (const file of readdirSync(dest)) {
      if (file === 'index.html' || kept.has(file)) continue;
      unlinkSync(join(dest, file));
    }
  }
}

export function buildUnitPages({ publicDir, site, office, legal, pageLinks, units, preview = false, today = new Date(), mediaRoot }) {
  const visible = preview ? units : publishedUnits(units, today);
  const ctx = { site, office, legal, pageLinks, today };
  const dir = join(publicDir, 'units');
  mkdirSync(dir, { recursive: true });
  syncPublishedMedia({ publicDir, mediaRoot, visible });
  writeFileSync(join(dir, 'index.html'), renderIndex(visible, ctx));
  const keep = new Set(visible.map((unit) => unit.code));
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const index = join(dir, entry.name, 'index.html');
    if (!keep.has(entry.name) && existsSync(index)) unlinkSync(index);
  }
  for (const unit of visible) {
    mkdirSync(join(dir, unit.code), { recursive: true });
    writeFileSync(join(dir, unit.code, 'index.html'), renderDetail(unit, ctx));
  }
  const feed = buildUnitsFeed(units, { origin: site.origin, today });
  writeFileSync(join(dir, 'index.json'), `${JSON.stringify(feed, null, 2)}\n`);
  return { visible, published: publishedUnits(units, today), feed };
}

// Home page section under the hero. Only units that pass the licence check
// (number + unexpired expiry; QR optional) are listed; with none, both the
// section and the hero button render as empty strings, so nothing shows.
export function renderHomeUnits(units, { whatsapp, today = new Date() }) {
  const live = publishedUnits(units, today);
  if (!live.length) return { section: '', cta: '' };
  const cards = live.map((unit) => renderListingCard(toSpecUnit(unit, today), { whatsapp }, { photoBase: cardPhotoBase(unit) })).join('\n');
  const section = `  <link rel="stylesheet" href="/assets/rt-listing-card.css">
  <section id="units" class="home-units" aria-labelledby="units-title">
    <div class="wrap">
      <div class="sec-head">
        <p class="kicker">الوحدات المتاحة</p>
        <h2 id="units-title">وحدات متاحة للبيع الآن</h2>
        <p class="en">Available units</p>
      </div>
      <div class="rt-listing-grid">
${cards}
      </div>
      <p class="home-units__more"><a class="btn btn-ghost" href="/units/">كل الوحدات</a></p>
    </div>
  </section>`;
  const cta = '<a class="btn btn-ghost" href="#units">شوف الوحدات المتاحة</a>';
  return { section, cta };
}
