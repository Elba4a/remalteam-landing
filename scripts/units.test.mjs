import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HIDDEN_PRICE,
  VIDEO_MAX_BYTES,
  buildUnitPages,
  publishedUnits,
  readUnitsDocument,
  validateUnits,
  waHref,
  waMessage,
} from './units-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MESSAGE = '\u0627\u0644\u0633\u0644\u0627\u0645 \u0639\u0644\u064a\u0643\u0645\u060c \u062c\u064a\u062a\u0643\u0645 \u0645\u0646 \u0627\u0644\u0645\u0648\u0642\u0639 - \u0648\u062d\u062f\u0629 RT-001';
const site = {
  origin: 'https://remalteam.com',
  name: { ar: 'مكتب الرمال تيم العقارية' },
  whatsapp: { url: 'https://wa.me/966535330034' },
};
const office = { '@type': 'RealEstateAgent', '@id': 'https://remalteam.com/#office' };

function fixture(units) {
  const dir = mkdtempSync(join(tmpdir(), 'units-'));
  const publicDir = join(dir, 'public');
  for (const unit of units) {
    const folder = join(publicDir, 'units', unit.code);
    mkdirSync(folder, { recursive: true });
    for (const name of new Set([unit.media?.cover, unit.media?.poster, unit.ad_license_qr, ...(unit.media?.photos || [])].filter((name) => typeof name === 'string' && !name.includes('://') && !name.includes('..') && !name.includes('/')))) {
      writeFileSync(join(folder, name), 'img');
    }
    if (typeof unit.media?.video === 'string' && unit.media.video.endsWith('.mp4') && !unit.media.video.includes('://') && !unit._bigVideo) {
      writeFileSync(join(folder, unit.media.video), 'mp4');
    }
  }
  return { dir, publicDir };
}

function base(over = {}) {
  return {
    code: 'RT-002',
    status: 'available',
    updated: '2026-10-24',
    type: 'شقة',
    area_m2: 140,
    rooms: 4,
    bathrooms: 3,
    floor: 'الأول',
    neighbourhood: 'المحالة',
    city: 'أبها',
    payment: 'finance',
    price: { hidden: false, amount: 850000, currency: 'SAR' },
    seo: { title: 'شقة في المحالة | الرمال تيم', description: 'وصف اختبار لشقة منشورة.' },
    ad_license_number: '7200000001',
    ad_license_expiry: '2027-06-01',
    ad_license_qr: 'license-qr.png',
    media: { cover: 'cover.jpg', photos: ['cover.jpg'] },
    ...over,
  };
}

function errorsOf(units, publicDir) {
  try {
    validateUnits({ updated: '2026-10-24', units }, { publicDir });
  } catch (error) {
    return error.errors.join('\n');
  }
  return '';
}

test('WhatsApp prefill is the CRM string, percent-encoded', () => {
  assert.equal(waMessage('RT-001'), MESSAGE);
  assert.equal(waMessage('RT-001'), 'السلام عليكم، جيتكم من الموقع - وحدة RT-001');
  assert.ok(MESSAGE.includes('\u060c'));
  assert.equal(MESSAGE.includes(','), false);
  const href = waHref('https://wa.me/966535330034', 'RT-001');
  assert.equal(href, `https://wa.me/966535330034?text=${encodeURIComponent(MESSAGE)}`);
  assert.equal(href.includes('+'), false);
  assert.ok(href.includes('%20-%20'));
  assert.equal(new URL(href).searchParams.get('text'), MESSAGE);
});

test('missing price, missing status, bad media path, and duplicate code fail', () => {
  const unit = base();
  const { publicDir } = fixture([unit]);
  const noPrice = base();
  delete noPrice.price;
  assert.match(errorsOf([noPrice], publicDir), /missing price/);
  const noStatus = base();
  delete noStatus.status;
  assert.match(errorsOf([noStatus], publicDir), /missing status/);
  assert.match(errorsOf([base({ media: { cover: '../site.json', photos: ['../site.json'] } })], publicDir), /bad media path/);
  assert.match(errorsOf([base({ media: { cover: 'missing.jpg', photos: ['missing.jpg'] } })], publicDir), /bad media path/);
  assert.match(errorsOf([base(), base()], publicDir), /duplicate code/);
});

test('placeholder cannot be published and local video over 3 MB fails', () => {
  const { publicDir } = fixture([base()]);
  assert.match(errorsOf([base({ _placeholder: true, status: 'available' })], publicDir), /placeholder units must stay status draft/);
  const heavy = base({
    status: 'draft',
    _placeholder: true,
    media: { cover: 'cover.jpg', photos: ['cover.jpg'], video: 'tour.mp4', poster: 'poster.jpg' },
    _bigVideo: true,
  });
  const { publicDir: videoDir } = fixture([heavy]);
  writeFileSync(join(videoDir, 'units', heavy.code, 'tour.mp4'), Buffer.alloc(VIDEO_MAX_BYTES + 1));
  assert.match(errorsOf([heavy], videoDir), /video over 3 MB/);
});

test('https video is accepted and a hidden price uses the exact phrase', () => {
  const remote = base({
    price: { hidden: true, amount: null, currency: 'SAR' },
    media: { cover: 'cover.jpg', photos: ['cover.jpg'], video: 'https://media.example.com/RT-002/tour.mp4', poster: 'poster.jpg' },
  });
  const { publicDir, dir } = fixture([remote]);
  const { units } = validateUnits({ updated: '2026-10-24', units: [remote] }, { publicDir });
  buildUnitPages({ publicDir, site, office, legal: '', pageLinks: '', units });
  const html = readFileSync(join(publicDir, 'units/RT-002/index.html'), 'utf8');
  assert.ok(html.includes(`>${HIDDEN_PRICE}<`) || html.includes(HIDDEN_PRICE));
  assert.equal(html.includes('850000'), false);
  assert.ok(html.includes('https://media.example.com/RT-002/tour.mp4'));
  assert.ok(html.includes('loading="lazy"'));
  assert.ok(html.includes('fetchpriority="high"'));
  assert.match(html, /property="og:image" content="https:\/\/remalteam.com\/units\/RT-002\/cover\.jpg"/);
  rmSync(dir, { recursive: true, force: true });
});

test('draft units are not rendered unless previewing, and the card link is byte-exact', () => {
  const draft = base({
    code: 'RT-001',
    status: 'draft',
    _placeholder: true,
    type: null,
    area_m2: null,
    rooms: null,
    bathrooms: null,
    floor: null,
    neighbourhood: null,
    city: null,
    payment: null,
    price: { hidden: true, amount: null, currency: 'SAR' },
    ad_license_number: null,
    ad_license_expiry: null,
    ad_license_qr: null,
    media: { cover: 'cover.jpg', photos: ['cover.jpg', 'inside.jpg'], video: 'tour.mp4', poster: 'poster.jpg' },
  });
  const { publicDir } = fixture([draft]);
  validateUnits({ updated: '2026-10-24', units: [draft] }, { publicDir });
  buildUnitPages({ publicDir, site, office, legal: '', pageLinks: '', units: [draft] });
  const hidden = readFileSync(join(publicDir, 'units/index.html'), 'utf8');
  assert.equal(hidden.includes('RT-001'), false);
  assert.equal(hidden.includes('جيتكم من الموقع'), false);
  assert.ok(hidden.includes('لا توجد وحدات منشورة حالياً'));
  assert.equal(existsSync(join(publicDir, 'units/RT-001/index.html')), false);

  buildUnitPages({ publicDir, site, office, legal: '', pageLinks: '', units: [draft], preview: true });
  const index = readFileSync(join(publicDir, 'units/index.html'), 'utf8');
  const detail = readFileSync(join(publicDir, 'units/RT-001/index.html'), 'utf8');
  const href = waHref(site.whatsapp.url, 'RT-001');
  assert.ok(index.includes('rt-listing-card.css'));
  assert.ok(index.includes('class="rt-card rt-listing'));
  assert.ok(index.includes('rt-card--draft'));
  assert.ok(index.includes('مسودة'));
  assert.ok(index.includes('للبيع'));
  assert.ok(index.includes('بيانات تجريبية'));
  assert.ok(index.includes('لا توجد رخصة إعلان'));
  assert.ok(index.includes('aria-disabled="true"'));
  assert.equal(index.includes(href), false);
  const article = index.slice(index.indexOf('<article'), index.indexOf('</article>'));
  assert.equal(article.includes('أبها'), false);
  assert.equal(article.includes('rt-card-loc'), false);
  assert.ok(detail.includes('بيانات تجريبية'));
  assert.ok(detail.includes('لا توجد رخصة إعلان'));
  assert.ok(detail.includes('noindex'));
  assert.equal(detail.includes(href), false);
  assert.ok(detail.includes('loading="lazy"'));
  assert.match(detail, /property="og:image" content="https:\/\/remalteam.com\/units\/RT-001\/cover\.jpg"/);
});

test('published card escapes text and shows the SAR amount', () => {
  const unit = base({ neighbourhood: '<script>' });
  const { publicDir } = fixture([unit]);
  const { units } = validateUnits({ updated: '2026-10-24', units: [unit] }, { publicDir });
  buildUnitPages({ publicDir, site, office, legal: '', pageLinks: '', units });
  const html = readFileSync(join(publicDir, 'units/index.html'), 'utf8');
  const detail = readFileSync(join(publicDir, 'units/RT-002/index.html'), 'utf8');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.equal(html.includes('<script>'), false);
  assert.ok(html.includes('850,000'));
  assert.ok(html.includes('ر.س'));
  assert.ok(html.includes('للبيع'));
  assert.ok(html.includes('ترخيص الإعلان'));
  assert.ok(html.includes(`href="${waHref(site.whatsapp.url, 'RT-002')}"`));
  assert.ok(html.includes('target="_blank"'));
  assert.ok(html.includes('7200000001'));
  assert.ok(html.includes('/units/RT-002/license-qr.png'));
  assert.ok(detail.includes('7200000001'));
  assert.ok(detail.includes('/units/RT-002/license-qr.png'));
  assert.equal(publishedUnits(units).length, 1);
});

test('a non-draft unit missing a REGA licence fails, and an expired licence is withheld with a warning', () => {
  const today = new Date('2026-10-24T12:00:00+03:00');
  const { publicDir } = fixture([base()]);
  for (const key of ['ad_license_number', 'ad_license_expiry', 'ad_license_qr']) {
    const unit = base();
    delete unit[key];
    assert.match(errorsOf([unit], publicDir), new RegExp(key));
  }
  const expired = base({ code: 'RT-009', ad_license_expiry: '2026-04-30' });
  const { publicDir: expiredDir } = fixture([expired]);
  const result = validateUnits({ updated: '2026-10-24', units: [expired] }, { publicDir: expiredDir, today });
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /expired/);
  assert.deepEqual(publishedUnits(result.units, today), []);
  buildUnitPages({ publicDir: expiredDir, site, office, legal: '', pageLinks: '', units: result.units, today });
  const html = readFileSync(join(expiredDir, 'units/index.html'), 'utf8');
  assert.equal(html.includes('RT-009'), false);
  assert.equal(existsSync(join(expiredDir, 'units/RT-009/index.html')), false);
});

test('a sold card names the closed state and disables WhatsApp', () => {
  const today = new Date('2026-10-24T12:00:00+03:00');
  const sold = base({ code: 'RT-003', status: 'sold' });
  const { publicDir } = fixture([sold]);
  const { units } = validateUnits({ updated: '2026-10-24', units: [sold] }, { publicDir, today });
  buildUnitPages({ publicDir, site, office, legal: '', pageLinks: '', units, today });
  const html = readFileSync(join(publicDir, 'units/index.html'), 'utf8');
  assert.ok(html.includes('تم البيع'));
  assert.ok(html.includes('مباع'));
  assert.ok(html.includes('للبيع'));
  assert.ok(html.includes('rt-card--closed'));
  assert.ok(html.includes('aria-disabled="true"'));
  assert.equal(html.includes('rt-btn--disabled'), false);
  assert.equal(html.includes('جيتكم من الموقع'), false);
  const detail = readFileSync(join(publicDir, 'units/RT-003/index.html'), 'utf8');
  assert.ok(detail.includes('تم البيع'));
  assert.ok(detail.includes('class="unit-deal">للبيع'));
  assert.ok(detail.includes('aria-disabled="true"'));
  assert.equal(detail.includes(waMessage('RT-003')), false);
  assert.equal(publishedUnits([base({ ad_license_expiry: '2026-10-24' })], today).length, 1);
});

test('listing_type and a price period are rejected, and every card says للبيع', () => {
  const { publicDir } = fixture([base()]);
  assert.match(errorsOf([base({ listing_type: 'sale' })], publicDir), /listing_type is not used/);
  assert.match(errorsOf([base({ price: { hidden: false, amount: 850000, currency: 'SAR', period: 'yearly' } })], publicDir), /price\.period is not used/);
  assert.match(errorsOf([base({ status: 'leased' })], publicDir), /bad status/);
  assert.match(errorsOf([base({ payment: 'lease' })], publicDir), /missing payment/);
  const { units } = validateUnits({ updated: '2026-10-24', units: [base()] }, { publicDir });
  buildUnitPages({ publicDir, site, office, legal: '', pageLinks: '', units });
  const html = readFileSync(join(publicDir, 'units/index.html'), 'utf8');
  const detail = readFileSync(join(publicDir, 'units/RT-002/index.html'), 'utf8');
  assert.ok(html.includes('للبيع'));
  assert.ok(detail.includes('class="unit-deal">للبيع'));
});

test('the checked-in sample stays a draft sale at the full riyal price', () => {
  const doc = readUnitsDocument(root, join(root, 'public'));
  const unit = doc.units[0];
  assert.equal(unit.code, 'RT-001');
  assert.equal(unit.status, 'draft');
  assert.equal(unit._placeholder, true);
  assert.equal(unit.listing_type, undefined);
  assert.deepEqual(publishedUnits(doc.units), []);
  for (const key of ['type', 'area_m2', 'rooms', 'bathrooms', 'floor', 'neighbourhood', 'city', 'payment']) {
    assert.equal(unit[key], null);
  }
  assert.equal(unit.price.hidden, false);
  assert.equal(unit.price.amount, 430000);
  assert.equal(unit.price.currency, 'SAR');
  assert.equal(unit.ad_license_number, undefined);
  assert.equal(unit.ad_license_expiry, undefined);
  assert.equal(unit.ad_license_qr, undefined);

  const { publicDir } = fixture([unit]);
  buildUnitPages({ publicDir, site, office, legal: '', pageLinks: '', units: [unit], preview: true });
  const index = readFileSync(join(publicDir, 'units/index.html'), 'utf8');
  const article = index.slice(index.indexOf('<article'), index.indexOf('</article>'));
  const detail = readFileSync(join(publicDir, 'units/RT-001/index.html'), 'utf8');
  assert.ok(article.includes('430,000'));
  assert.equal(article.includes('430 ألف'), false);
  assert.equal(article.includes('430.000'), false);
  assert.ok(article.includes('للبيع'));
  assert.equal(article.includes('أبها'), false);
  assert.equal(article.includes('rt-card-loc'), false);
  assert.ok(article.includes('لا توجد رخصة إعلان'));
  assert.equal(article.includes(waHref(site.whatsapp.url, 'RT-001')), false);
  assert.ok(detail.includes('430,000'));
  assert.ok(detail.includes('class="unit-deal">للبيع'));
  assert.equal(detail.includes('>أبها<'), false);
  assert.equal(detail.includes('<dt>الموقع</dt>'), false);
});
