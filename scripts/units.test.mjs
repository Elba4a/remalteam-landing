import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HIDDEN_PRICE,
  VIDEO_MAX_BYTES,
  buildUnitPages,
  buildUnitsFeed,
  publishedUnits,
  readUnitsDocument,
  renderHomeUnits,
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
    for (const name of new Set([unit.media?.cover, unit.media?.poster, unit.ad_license_qr, ...(unit.media?.photos || [])].filter((name) => typeof name === 'string' && name !== '' && !name.includes('://') && !name.includes('..') && !name.includes('/')))) {
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

function errorsOf(units, publicDir, extra = {}) {
  try {
    validateUnits({ updated: '2026-10-24', units }, { publicDir, ...extra });
  } catch (error) {
    return error.errors.join('\n');
  }
  return '';
}

function visibleText(html) {
  return html.replace(/<[^>]+>/g, '');
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
  const noNumber = base();
  delete noNumber.ad_license_number;
  assert.match(errorsOf([noNumber], publicDir), /missing ad_license_number/);
  // Empty expiry: licence pending, hidden, build does not fail.
  const noExpiry = base({ ad_license_expiry: '' });
  assert.equal(errorsOf([noExpiry], publicDir), '');
  assert.deepEqual(publishedUnits([noExpiry], today), []);
  // Empty QR with a valid unexpired expiry: published. A present QR is still checked elsewhere.
  const noQr = base({ ad_license_qr: '' });
  assert.equal(errorsOf([noQr], publicDir), '');
  assert.deepEqual(publishedUnits([noQr], today).map((unit) => unit.code), ['RT-002']);
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
  assert.match(errorsOf([base({ payment: 'lease' })], publicDir), /bad payment/);
  const { units } = validateUnits({ updated: '2026-10-24', units: [base()] }, { publicDir });
  buildUnitPages({ publicDir, site, office, legal: '', pageLinks: '', units });
  const html = readFileSync(join(publicDir, 'units/index.html'), 'utf8');
  const detail = readFileSync(join(publicDir, 'units/RT-002/index.html'), 'utf8');
  assert.ok(html.includes('للبيع'));
  assert.ok(detail.includes('class="unit-deal">للبيع'));
});

test('checked-in units 1-10 publish with expiry, photos, and no QR', () => {
  const today = new Date('2026-11-14T12:00:00+03:00');
  const doc = readUnitsDocument(root, join(root, 'public'), today);
  const codes = doc.units.map((unit) => unit.code);
  assert.deepEqual(codes, Array.from({ length: 10 }, (_, i) => `RT-${String(i + 1).padStart(3, '0')}`));
  assert.deepEqual(publishedUnits(doc.units, today).map((unit) => unit.code), codes);
  assert.deepEqual(doc.units.find((unit) => unit.code === 'RT-001').media.photos, ['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg', 'photo-4.jpg']);
  assert.equal(existsSync(join(root, 'content/unit-media/RT-001/photo-5.jpg')), false);
  assert.equal(existsSync(join(root, 'content/unit-media/RT-001/photo-6.jpg')), false);
  for (const unit of doc.units) {
    assert.equal(unit.status, 'available');
    assert.match(unit.ad_license_number, /^72\d{8}$/);
    assert.equal(unit.ad_license_expiry, '2027-04-15');
    assert.equal(unit.ad_license_qr, '');
    assert.match(unit.ad_license_verify_url, /^https:\/\//);
    assert.equal(unit.media.logo, undefined);
    assert.ok(Array.isArray(unit.media.photos) && unit.media.photos.length > 0);
    assert.ok(unit.features.includes('المعاينة مجانية'));
    assert.equal(unit.features.some((line) => line.startsWith('المعلن:')), false, unit.code);
    assert.equal(unit.features.some((line) => line.startsWith('رقم ترخيص الإعلان')), false, unit.code);
    assert.equal(unit.features.some((line) => /^واتساب/.test(line)), false, unit.code);
    const text = JSON.stringify(unit);
    assert.equal(text.includes('4 غرف نوم'), false, unit.code);
    assert.equal(/تمويل|التمويل|بنك|البنوك|الراجحي|الأهلي|نسبة/.test(text), false, unit.code);
    assert.equal(unit.payment, undefined);
    if (unit.code <= 'RT-005') {
      assert.equal(unit.ad_license_advertiser, 'مكتب الرمال تيم العقارية');
      assert.equal(unit.fal_license, '1200048445');
    } else {
      assert.equal(unit.ad_license_advertiser, undefined);
      assert.equal(unit.fal_license, undefined);
    }
    for (const name of unit.media.photos) {
      assert.equal(existsSync(join(root, 'content/unit-media', unit.code, name)), true, `${unit.code}/${name}`);
      assert.equal(existsSync(join(root, 'public/units', unit.code, name)), true, `${unit.code}/${name}`);
    }
  }
  const home = renderHomeUnits(doc.units, { whatsapp: site.whatsapp.url, today });
  assert.ok(home.cta.includes('شوف الوحدات المتاحة') && home.cta.includes('href="#units"'));
  for (const code of codes) assert.ok(home.section.includes(`data-ref="${code}"`), code);
  assert.equal(home.section.includes('rt-card-logo'), false);
  assert.equal(visibleText(home.section).includes('4 غرف نوم'), false);
  assert.ok(home.section.includes('ينتهي'));
  assert.ok(home.section.includes('15/04/2027'));
  assert.ok(home.section.includes('المعلن: مكتب الرمال تيم العقارية'));
  assert.ok(home.section.includes('1200048445'));
  assert.ok(home.section.includes('0535330034'));
  const html = readFileSync(join(root, 'public/index.html'), 'utf8');
  const schema = html.slice(html.indexOf('<!-- build:schema -->'), html.indexOf('<!-- /build:schema -->'));
  assert.ok(schema.includes('7053922824'));
  assert.ok(schema.includes('السجل التجاري'));
  assert.ok(html.includes('id="units"'));
  assert.ok(html.includes('شوف الوحدات المتاحة'));
  assert.ok(html.includes('data-ref="RT-001"'));
  const detail = readFileSync(join(root, 'public/units/RT-001/index.html'), 'utf8');
  assert.equal(detail.includes('7053922824'), false);
  assert.equal(detail.includes('rega.gov.sa'), false);
  assert.equal(detail.includes('photo-5.jpg'), false);
  const areas = {
    'RT-001': '204.83', 'RT-002': '337.2', 'RT-003': '202.04', 'RT-004': '160.01', 'RT-005': '375.82',
    'RT-006': '189.61', 'RT-007': '319.46', 'RT-008': '254.82', 'RT-009': '164.74', 'RT-010': '274.72',
  };
  for (const [code, area] of Object.entries(areas)) {
    const page = readFileSync(join(root, 'public/units', code, 'index.html'), 'utf8');
    assert.ok(page.includes(`<span class="ltr">${area}</span> م²`), code);
    assert.ok(html.includes(`<span class="rt-num">${area}</span> م²`), code);
    assert.ok(page.includes('ينتهي'));
    assert.ok(page.includes('15/04/2027'));
    assert.ok(page.includes('0535330034'));
  }
});

test('filling expiry + QR publishes the unit on the home section with the hero button', () => {
  const today = new Date('2026-11-04T12:00:00+03:00');
  const doc = readUnitsDocument(root, join(root, 'public'));
  const filled = doc.units.map((unit) => (unit.code === 'RT-008' || unit.code === 'RT-007'
    ? { ...unit, ad_license_expiry: '2027-11-04', ad_license_qr: 'license-qr.png' }
    : unit));
  const { publicDir } = fixture(filled.filter((u) => u.ad_license_qr));
  const { units, warnings } = validateUnits({ updated: '2026-11-04', units: filled.filter((u) => u.ad_license_qr) }, { publicDir, today });
  assert.deepEqual(warnings, []);
  assert.deepEqual(publishedUnits(units, today).map((u) => u.code), ['RT-007', 'RT-008']);
  const home = renderHomeUnits(filled, { whatsapp: site.whatsapp.url, today });
  assert.ok(home.cta.includes('شوف الوحدات المتاحة') && home.cta.includes('href="#units"'));
  assert.ok(home.section.includes('id="units"'));
  assert.ok(home.section.includes('data-ref="RT-008"') && home.section.includes('data-ref="RT-007"'));
  assert.ok(home.section.includes('data-ref="RT-001"'));
  const withoutExpiry = renderHomeUnits(filled.map((unit) => (unit.code === 'RT-001' ? { ...unit, ad_license_expiry: '' } : unit)), { whatsapp: site.whatsapp.url, today });
  assert.equal(withoutExpiry.section.includes('data-ref="RT-001"'), false);
  assert.equal(home.section.includes('rt-card-logo'), false);
  assert.ok(home.section.includes('/units/RT-007/photo-1.jpg'));
  assert.ok(home.section.includes('/units/RT-008/photo-1.jpg'));
  assert.ok(home.section.includes('loading="lazy"'));
  assert.ok(home.section.includes(waHref(site.whatsapp.url, 'RT-008')));
  assert.ok(home.section.includes('المعاينة مجانية'));
  assert.equal(visibleText(home.section).includes('4 غرف نوم'), false);
  assert.equal(home.section.includes('—'), false);
});

test('filled but invalid licence fields still fail the build', () => {
  const { publicDir } = fixture([base()]);
  assert.match(errorsOf([base({ ad_license_expiry: '04/11/2027' })], publicDir), /bad ad_license_expiry/);
  assert.match(errorsOf([base({ ad_license_qr: 'missing-qr.png' })], publicDir), /ad_license_qr missing/);
  assert.match(errorsOf([base({ ad_license_qr: 'qr.pdf' })], publicDir), /ad_license_qr/);
  assert.match(errorsOf([base({ ad_license_qr: 'https://example.com/qr.pdf' })], publicDir), /ad_license_qr/);
  assert.match(errorsOf([base({ ad_license_qr: 'https://example.com/qr' })], publicDir), /ad_license_qr/);
  assert.equal(errorsOf([base({ ad_license_qr: 'https://example.com/license-qr.png' })], publicDir), '');
  assert.match(errorsOf([base({ ad_license_number: '72-01' })], publicDir), /bad ad_license_number/);
  assert.match(errorsOf([base({ ad_license_advertiser: 12 })], publicDir), /bad ad_license_advertiser/);
  assert.match(errorsOf([base({ ad_license_advertiser: '   ' })], publicDir), /bad ad_license_advertiser/);
  assert.match(errorsOf([base({ fal_license: '12-44' })], publicDir), /bad fal_license/);
  assert.match(errorsOf([base({ fal_license: 1200048445 })], publicDir), /bad fal_license/);
  assert.match(errorsOf([base({ ad_license_verify_url: 'http://example.com/a' })], publicDir), /bad ad_license_verify_url/);
  assert.match(errorsOf([base({ ad_license_verify_url: 'not-a-url' })], publicDir), /bad ad_license_verify_url/);
  assert.equal(errorsOf([base({ ad_license_advertiser: '', fal_license: '', ad_license_verify_url: '' })], publicDir), '');
  assert.match(errorsOf([base({ area_m2: 'كبيرة' })], publicDir), /bad area_m2/);
  assert.match(errorsOf([base({ media: { logo: true, cover: 'cover.jpg' } })], publicDir), /media.logo/);
});

test('impossible calendar dates fail for draft and available units, real dates do not', () => {
  const { publicDir } = fixture([base()]);
  for (const expiry of ['2027-02-29', '2027-02-30', '2027-02-31', '2027-04-31', '2027-06-31', '2027-09-31', '2027-11-31']) {
    assert.match(errorsOf([base({ ad_license_expiry: expiry })], publicDir), /bad ad_license_expiry/, expiry);
    assert.match(errorsOf([base({ status: 'draft', ad_license_expiry: expiry })], publicDir), /bad ad_license_expiry/, expiry);
  }
  for (const expiry of ['2027-02-28', '2027-11-30', '2024-02-29', '2028-02-29', '2000-02-29']) {
    assert.equal(errorsOf([base({ ad_license_expiry: expiry })], publicDir), '', expiry);
    assert.equal(errorsOf([base({ status: 'draft', ad_license_expiry: expiry })], publicDir), '', expiry);
  }
});

test('unpublished media is kept out of public and removed when a unit drops out', () => {
  const today = new Date('2026-11-05T12:00:00+03:00');
  const dir = mkdtempSync(join(tmpdir(), 'units-media-'));
  const publicDir = join(dir, 'public');
  const mediaRoot = join(dir, 'content/unit-media');
  const source = join(mediaRoot, 'RT-008');
  mkdirSync(source, { recursive: true });
  writeFileSync(join(source, 'cover.jpg'), 'photo');
  writeFileSync(join(source, 'license-qr.png'), 'qr');
  const stale = join(publicDir, 'units', 'RT-008');
  mkdirSync(stale, { recursive: true });
  writeFileSync(join(stale, 'cover.jpg'), 'stale');
  writeFileSync(join(stale, 'index.html'), 'old');
  const hidden = base({ code: 'RT-008', ad_license_expiry: '', ad_license_qr: '' });
  const hiddenDoc = validateUnits({ updated: '2026-11-04', units: [hidden] }, { publicDir, mediaRoot, today });
  buildUnitPages({ publicDir, site, office, legal: '', pageLinks: '', units: hiddenDoc.units, today, mediaRoot });
  assert.equal(existsSync(join(publicDir, 'units', 'RT-008')), false);
  assert.equal(readFileSync(join(source, 'cover.jpg'), 'utf8'), 'photo');

  const live = base({ code: 'RT-008', ad_license_expiry: '2028-02-29', ad_license_qr: 'license-qr.png' });
  const liveDoc = validateUnits({ updated: '2026-11-04', units: [live] }, { publicDir, mediaRoot, today });
  buildUnitPages({ publicDir, site, office, legal: '', pageLinks: '', units: liveDoc.units, today, mediaRoot });
  assert.equal(readFileSync(join(publicDir, 'units', 'RT-008', 'cover.jpg'), 'utf8'), 'photo');
  assert.equal(readFileSync(join(publicDir, 'units', 'RT-008', 'license-qr.png'), 'utf8'), 'qr');
  assert.equal(existsSync(join(publicDir, 'units', 'RT-008', 'index.html')), true);

  buildUnitPages({ publicDir, site, office, legal: '', pageLinks: '', units: hiddenDoc.units, today, mediaRoot });
  assert.equal(existsSync(join(publicDir, 'units', 'RT-008')), false);
  assert.equal(readdirSync(join(publicDir, 'units')).includes('RT-008'), false);
  rmSync(dir, { recursive: true, force: true });
});

test('a unit advertiser and FAL override the office constants, and the verify URL is not rendered', () => {
  const today = new Date('2026-11-14T12:00:00+03:00');
  const unit = base({
    code: 'RT-004',
    ad_license_qr: '',
    ad_license_advertiser: 'مكتب تجربة',
    fal_license: '1200000001',
    ad_license_verify_url: 'https://example.com/licence',
  });
  const { publicDir, dir } = fixture([unit]);
  const { units, warnings } = validateUnits({ updated: '2026-11-14', units: [unit] }, { publicDir, today });
  assert.deepEqual(warnings, []);
  buildUnitPages({ publicDir, site, office, legal: '', pageLinks: '', units, today });
  const detail = readFileSync(join(publicDir, 'units/RT-004/index.html'), 'utf8');
  const index = readFileSync(join(publicDir, 'units/index.html'), 'utf8');
  for (const html of [detail, index]) {
    const listing = html.split('<section id="contact"')[0];
    assert.ok(listing.includes('المعلن: مكتب تجربة'));
    assert.ok(listing.includes('1200000001'));
    assert.equal(listing.includes('المعلن: مكتب الرمال تيم العقارية'), false);
    assert.equal(html.includes('example.com/licence'), false);
    assert.ok(listing.includes('0535330034'));
  }
  const fallback = base({ code: 'RT-006', ad_license_qr: '' });
  delete fallback.ad_license_advertiser;
  delete fallback.fal_license;
  const { publicDir: fallbackDir, dir: fallbackRoot } = fixture([fallback]);
  const fallbackDoc = validateUnits({ updated: '2026-11-14', units: [fallback] }, { publicDir: fallbackDir, today });
  buildUnitPages({ publicDir: fallbackDir, site, office, legal: '', pageLinks: '', units: fallbackDoc.units, today });
  const fallbackHtml = readFileSync(join(fallbackDir, 'units/RT-006/index.html'), 'utf8');
  assert.ok(fallbackHtml.includes('المعلن: مكتب الرمال تيم العقارية'));
  assert.ok(fallbackHtml.includes('1200048445'));
  rmSync(dir, { recursive: true, force: true });
  rmSync(fallbackRoot, { recursive: true, force: true });
});

test('no QR plus a valid expiry publishes and renders the written licence', () => {
  const today = new Date('2026-11-14T12:00:00+03:00');
  const unit = base({
    code: 'RT-006',
    ad_license_number: '7201191996',
    ad_license_expiry: '2027-04-15',
    ad_license_qr: '',
    neighbourhood: 'الغدير',
    features: ['المعاينة مجانية'],
  });
  const { publicDir, dir } = fixture([unit]);
  const { units, warnings } = validateUnits({ updated: '2026-11-14', units: [unit] }, { publicDir, today });
  assert.deepEqual(warnings, []);
  assert.deepEqual(publishedUnits(units, today).map((item) => item.code), ['RT-006']);
  const officeWithCr = {
    ...office,
    identifier: [
      { '@type': 'PropertyValue', name: 'السجل التجاري', value: '7053922824' },
      { '@type': 'PropertyValue', name: 'رخصة فال', value: '1200048445' },
    ],
  };
  const legal = '<div class="legal"><span>السجل التجاري: <b class="ltr">7053922824</b></span><span>رخصة فال: <b class="ltr">1200048445</b></span></div>';
  buildUnitPages({ publicDir, site, office: officeWithCr, legal, pageLinks: '', units, today });
  const index = readFileSync(join(publicDir, 'units/index.html'), 'utf8');
  const detail = readFileSync(join(publicDir, 'units/RT-006/index.html'), 'utf8');
  for (const html of [index, detail]) {
    const listing = html.split('<section id="contact"')[0];
    assert.ok(listing.includes('7201191996'), 'licence number');
    assert.ok(listing.includes('ينتهي'), 'expiry label');
    assert.ok(listing.includes('15/04/2027'), 'expiry date');
    assert.ok(listing.includes('المعلن: مكتب الرمال تيم العقارية'), 'advertiser');
    assert.ok(listing.includes('1200048445'), 'FAL');
    assert.ok(listing.includes('0535330034'), 'WhatsApp');
    assert.ok(listing.includes('المعاينة مجانية'));
    assert.equal(html.includes('7053922824'), false);
    assert.equal(html.includes('السجل التجاري'), false);
    assert.equal(html.includes('رمز QR'), false);
    assert.equal(html.includes('license-qr'), false);
    assert.equal(/<img[^>]+(?:qr|rega)/i.test(html), false);
    assert.equal(/الراجحي|الأهلي|الإنماء|بنك البلاد|سامبا|الجزيرة|الفرنسي|نسبة/.test(html), false);
    assert.equal(listing.includes('بنك'), false);
    assert.equal(html.includes('rega.gov.sa'), false);
  }
  assert.equal(detail.includes('class="unit-license"'), true);
  assert.equal(index.includes('class="rt-card-legal"'), true);
  rmSync(dir, { recursive: true, force: true });
});

test('an expired no-QR unit stays hidden and a hidden unit’s media is not synced', () => {
  const today = new Date('2026-11-14T12:00:00+03:00');
  const dir = mkdtempSync(join(tmpdir(), 'units-noqr-'));
  const publicDir = join(dir, 'public');
  const mediaRoot = join(dir, 'content/unit-media');
  const liveSrc = join(mediaRoot, 'RT-006');
  const hiddenSrc = join(mediaRoot, 'RT-001');
  const expiredSrc = join(mediaRoot, 'RT-002');
  mkdirSync(liveSrc, { recursive: true });
  mkdirSync(hiddenSrc, { recursive: true });
  mkdirSync(expiredSrc, { recursive: true });
  writeFileSync(join(liveSrc, 'cover.jpg'), 'live-photo');
  writeFileSync(join(liveSrc, 'license-qr.png'), 'qr-bytes');
  writeFileSync(join(hiddenSrc, 'cover.jpg'), 'hidden-photo');
  writeFileSync(join(expiredSrc, 'cover.jpg'), 'expired-photo');
  const stale = join(publicDir, 'units', 'RT-001');
  mkdirSync(stale, { recursive: true });
  writeFileSync(join(stale, 'cover.jpg'), 'stale');
  const live = base({
    code: 'RT-006',
    ad_license_number: '7201191996',
    ad_license_expiry: '2027-04-15',
    ad_license_qr: '',
  });
  const hidden = base({
    code: 'RT-001',
    ad_license_number: '7201191119',
    ad_license_expiry: '',
    ad_license_qr: '',
  });
  const expired = base({
    code: 'RT-002',
    ad_license_number: '7201191103',
    ad_license_expiry: '2026-04-30',
    ad_license_qr: '',
  });
  const result = validateUnits({ updated: '2026-11-14', units: [hidden, expired, live] }, { publicDir, mediaRoot, today });
  assert.ok(result.warnings.some((warning) => warning.includes('RT-001') && warning.includes('hidden until ad_license_expiry is filled')));
  assert.ok(result.warnings.some((warning) => warning.includes('RT-002') && warning.includes('expired')));
  assert.deepEqual(publishedUnits(result.units, today).map((unit) => unit.code), ['RT-006']);
  buildUnitPages({ publicDir, site, office, legal: '', pageLinks: '', units: result.units, today, mediaRoot });
  assert.equal(existsSync(join(publicDir, 'units', 'RT-001')), false);
  assert.equal(existsSync(join(publicDir, 'units', 'RT-002')), false);
  assert.equal(readFileSync(join(hiddenSrc, 'cover.jpg'), 'utf8'), 'hidden-photo');
  assert.equal(readFileSync(join(expiredSrc, 'cover.jpg'), 'utf8'), 'expired-photo');
  assert.equal(readFileSync(join(publicDir, 'units', 'RT-006', 'cover.jpg'), 'utf8'), 'live-photo');
  assert.equal(existsSync(join(publicDir, 'units', 'RT-006', 'license-qr.png')), false);
  const hiddenFeed = JSON.parse(readFileSync(join(publicDir, 'units/index.json'), 'utf8'));
  assert.deepEqual(hiddenFeed.units.map((unit) => unit.code), ['RT-006']);
  assert.equal(JSON.stringify(hiddenFeed).includes('hidden-photo'), false);
  assert.equal(JSON.stringify(hiddenFeed).includes('expired-photo'), false);
  assert.equal(JSON.stringify(hiddenFeed).includes('RT-001'), false);
  assert.equal(JSON.stringify(hiddenFeed).includes('RT-002'), false);
  const html = readFileSync(join(publicDir, 'units/index.html'), 'utf8');
  assert.equal(html.includes('RT-001'), false);
  assert.equal(html.includes('RT-002'), false);
  assert.ok(html.includes('RT-006'));
  assert.equal(existsSync(join(publicDir, 'units/RT-002/index.html')), false);
  rmSync(dir, { recursive: true, force: true });
});

const FEED_KEYS = [
  'code', 'type', 'title', 'city', 'neighbourhood', 'area_m2', 'price',
  'rooms', 'bathrooms', 'floor', 'features', 'payment',
  'ad_license_number', 'ad_license_expiry', 'status', 'availability',
  'needs_manager_confirmation', 'cover', 'photos', 'page_url', 'updated',
];

test('the public feed lists only public units, with absolute URLs, and rejects a bad availability', () => {
  const today = new Date('2026-11-14T12:00:00+03:00');
  const live = base({
    code: 'RT-010',
    title: 'شقة منشورة',
    features: ['المعاينة مجانية'],
    media: { cover: 'cover.jpg', photos: ['cover.jpg', 'inside.jpg'] },
    ad_license_qr: 'license-qr.png',
    fal_license: '1200048445',
    ad_license_verify_url: 'https://rega.gov.sa/example',
    ad_license_advertiser: 'مكتب الرمال تيم العقارية',
  });
  const remote = base({
    code: 'RT-011',
    availability: 'reserved',
    media: {
      cover: 'https://media.example.com/RT-011/cover.jpg',
      photos: ['https://media.example.com/RT-011/cover.jpg'],
    },
  });
  const soldAvailability = base({
    code: 'RT-012',
    availability: 'sold',
    needs_manager_confirmation: true,
    media: { cover: 'secret-sold.jpg', photos: ['secret-sold.jpg'] },
  });
  const draft = base({
    code: 'RT-013',
    status: 'draft',
    _placeholder: true,
    ad_license_number: null,
    ad_license_expiry: null,
    ad_license_qr: null,
    media: { cover: 'draft-only.jpg', photos: ['draft-only.jpg'] },
  });
  const pending = base({
    code: 'RT-014',
    ad_license_expiry: '',
    ad_license_qr: '',
    media: { cover: 'pending-only.jpg', photos: ['pending-only.jpg'] },
  });
  const expired = base({
    code: 'RT-015',
    ad_license_expiry: '2026-04-30',
    ad_license_qr: '',
    media: { cover: 'expired-only.jpg', photos: ['expired-only.jpg'] },
  });
  const units = [draft, pending, expired, live, remote, soldAvailability];
  const { publicDir, dir } = fixture(units);
  const checked = validateUnits({ updated: '2026-11-14', units }, { publicDir, today });
  assert.equal(checked.units.length, 6);
  const built = buildUnitPages({ publicDir, site, office, legal: '', pageLinks: '', units: checked.units, today, preview: true });
  const feed = JSON.parse(readFileSync(join(publicDir, 'units/index.json'), 'utf8'));
  assert.equal(feed.schema_version, 1);
  assert.equal(feed.generated_at, today.toISOString());
  assert.deepEqual(feed.units.map((unit) => unit.code), ['RT-010', 'RT-011', 'RT-012']);
  assert.deepEqual(feed.units.map((unit) => unit.code), built.published.map((unit) => unit.code));
  assert.deepEqual(feed.units.map((unit) => unit.code), publishedUnits(checked.units, today).map((unit) => unit.code));

  const html = readFileSync(join(publicDir, 'units/index.html'), 'utf8');
  assert.ok(html.includes('RT-013'), 'preview still renders the draft on the site');
  const raw = JSON.stringify(feed);
  for (const secret of ['RT-013', 'RT-014', 'RT-015', 'draft-only.jpg', 'pending-only.jpg', 'expired-only.jpg', 'license-qr.png', 'ad_license_qr', 'fal_license', 'rega.gov.sa', '7053922824']) {
    assert.equal(raw.includes(secret), false, secret);
  }
  assert.equal(/الراجحي|الأهلي|الإنماء|بنك البلاد|سامبا|الجزيرة|الفرنسي|نسبة التمويل/.test(raw), false);

  const listed = feed.units[0];
  assert.deepEqual(Object.keys(listed), FEED_KEYS);
  assert.deepEqual(Object.keys(listed.price), ['hidden', 'amount', 'currency']);
  assert.equal(listed.cover, 'https://remalteam.com/units/RT-010/cover.jpg');
  assert.deepEqual(listed.photos, [
    'https://remalteam.com/units/RT-010/cover.jpg',
    'https://remalteam.com/units/RT-010/inside.jpg',
  ]);
  assert.equal(listed.page_url, 'https://remalteam.com/units/RT-010/');
  assert.equal(listed.availability, 'available');
  assert.equal(listed.needs_manager_confirmation, false);
  assert.equal(listed.status, 'available');
  assert.equal(listed.features[0], 'المعاينة مجانية');

  assert.equal(feed.units[1].availability, 'reserved');
  assert.equal(feed.units[1].cover, 'https://media.example.com/RT-011/cover.jpg');
  assert.equal(feed.units[1].page_url, 'https://remalteam.com/units/RT-011/');
  assert.equal(feed.units[2].availability, 'sold');
  assert.equal(feed.units[2].needs_manager_confirmation, true);
  assert.equal(feed.units[2].cover, 'https://remalteam.com/units/RT-012/secret-sold.jpg');

  const detail = readFileSync(join(publicDir, 'units/RT-012/index.html'), 'utf8');
  assert.ok(detail.includes('متاح'));
  assert.ok(detail.includes(waHref(site.whatsapp.url, 'RT-012')));
  assert.equal(detail.includes('تم البيع'), false);
  assert.equal(detail.includes('unit-layout--closed'), false);
  assert.equal(html.includes('rt-card--closed'), false);

  const { publicDir: ruleDir } = fixture([base()]);
  for (const value of ['leased', '', null, 1, 'sold ']) {
    assert.match(errorsOf([base({ availability: value })], ruleDir), /bad availability/);
  }
  assert.match(errorsOf([base({ needs_manager_confirmation: 'yes' })], ruleDir), /needs_manager_confirmation/);
  assert.equal(errorsOf([base()], ruleDir), '');
  rmSync(dir, { recursive: true, force: true });
});

test('the checked-in feed is exactly the published units, and only RT-004 needs confirmation', () => {
  const today = new Date('2026-11-14T12:00:00+03:00');
  const doc = readUnitsDocument(root, join(root, 'public'), today);
  const feed = buildUnitsFeed(doc.units, { origin: 'https://remalteam.com', today });
  assert.equal(feed.schema_version, 1);
  assert.deepEqual(feed.units.map((unit) => unit.code), publishedUnits(doc.units, today).map((unit) => unit.code));
  assert.deepEqual(feed.units.map((unit) => unit.code), ['RT-001', 'RT-002', 'RT-003', 'RT-004', 'RT-005', 'RT-006', 'RT-007', 'RT-008', 'RT-009', 'RT-010']);
  const raw = JSON.stringify(feed);
  for (const secret of ['ad_license_qr', 'ad_license_verify_url', 'fal_license', 'rega.gov.sa', '7053922824', 'license-qr', '1200048445']) {
    assert.equal(raw.includes(secret), false, secret);
  }
  assert.equal(/الراجحي|الأهلي|الإنماء|بنك البلاد|نسبة/.test(raw), false);
  const flagged = feed.units.filter((unit) => unit.needs_manager_confirmation);
  assert.deepEqual(flagged.map((unit) => unit.code), ['RT-004']);
  const rt004 = feed.units.find((unit) => unit.code === 'RT-004');
  assert.equal(rt004.status, 'available');
  assert.equal(rt004.availability, 'available');
  assert.equal(rt004.type, 'شقة – دور أرضي');
  assert.equal(rt004.city, 'أبها');
  assert.equal(rt004.neighbourhood, 'الزهور');
  assert.equal(rt004.area_m2, 160.01);
  assert.equal(rt004.floor, 'الأرضي');
  assert.equal(rt004.rooms, null);
  assert.equal(rt004.bathrooms, null);
  assert.equal(rt004.payment, null);
  assert.deepEqual(rt004.price, { hidden: false, amount: 350000, currency: 'SAR' });
  assert.equal(rt004.ad_license_number, '7201191114');
  assert.equal(rt004.ad_license_expiry, '2027-04-15');
  assert.equal(rt004.updated, '2026-11-14');
  assert.equal(rt004.page_url, 'https://remalteam.com/units/RT-004/');
  assert.equal(rt004.cover, 'https://remalteam.com/units/RT-004/photo-1.jpg');
  assert.deepEqual(rt004.photos, [1, 2, 3, 4, 5, 6, 7].map((n) => `https://remalteam.com/units/RT-004/photo-${n}.jpg`));
  assert.ok(rt004.cover.startsWith('https://remalteam.com/units/RT-004/'));
  assert.ok(rt004.photos.every((url) => url.startsWith('https://remalteam.com/units/RT-004/')));
  for (const unit of feed.units) {
    assert.equal(unit.availability, 'available');
    assert.ok(unit.page_url.startsWith('https://remalteam.com/units/'));
    assert.ok(String(unit.cover).startsWith('https://'));
  }
});

function listingNode(html) {
  const match = html.match(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/);
  assert.ok(match, 'json-ld');
  const data = JSON.parse(match[1]);
  const listing = data['@graph'].find((node) => node['@type'] === 'RealEstateListing');
  assert.ok(listing);
  assert.ok(data['@graph'].some((node) => node['@type'] === 'BreadcrumbList'));
  return listing;
}

test('RealEstateListing JSON-LD keeps confirmed facts and omits empty counts', () => {
  const full = base({ media: { cover: 'cover.jpg', photos: ['cover.jpg', 'inside.jpg'] } });
  const bare = base({ code: 'RT-007', type: 'فيلا', city: ' ', neighbourhood: null, updated: '2026-11-14' });
  delete bare.rooms;
  delete bare.bathrooms;
  const { publicDir, dir } = fixture([full, bare]);
  const { units } = validateUnits({ updated: '2026-11-14', units: [full, bare] }, { publicDir });
  buildUnitPages({ publicDir, site, office, legal: '', pageLinks: '', units, today: new Date('2026-11-14T12:00:00+03:00') });
  const rich = listingNode(readFileSync(join(publicDir, 'units/RT-002/index.html'), 'utf8'));
  assert.equal(rich.additionalType, 'https://schema.org/Apartment');
  assert.equal(rich.address.addressLocality, 'أبها');
  assert.equal(rich.address.streetAddress, 'المحالة');
  assert.equal(rich.address.addressRegion, 'عسير');
  assert.equal(rich.address.addressCountry, 'SA');
  assert.equal(rich.numberOfRooms, 4);
  assert.equal(rich.numberOfBedrooms, 4);
  assert.equal(rich.numberOfBathroomsTotal, 3);
  assert.deepEqual(rich.image, [
    'https://remalteam.com/units/RT-002/cover.jpg',
    'https://remalteam.com/units/RT-002/inside.jpg',
  ]);
  assert.equal(rich.validThrough, '2027-06-01');
  assert.equal(rich.datePosted, '2026-10-24');
  assert.equal(rich.offers.price, 850000);
  assert.equal(rich.offers.priceCurrency, 'SAR');
  assert.equal(rich.offers.priceValidUntil, '2027-06-01');
  assert.equal(rich.offers.validThrough, '2027-06-01');
  assert.equal(rich.floorSize.value, 140);
  assert.equal(rich.identifier.value, '7200000001');
  const visible = readFileSync(join(publicDir, 'units/RT-002/index.html'), 'utf8').replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '');
  assert.equal(visible.includes('numberOfRooms'), false);

  const villa = listingNode(readFileSync(join(publicDir, 'units/RT-007/index.html'), 'utf8'));
  assert.equal(villa.additionalType, 'https://schema.org/SingleFamilyResidence');
  assert.equal(Object.hasOwn(villa, 'numberOfRooms'), false);
  assert.equal(Object.hasOwn(villa, 'numberOfBedrooms'), false);
  assert.equal(Object.hasOwn(villa, 'numberOfBathroomsTotal'), false);
  assert.equal(Object.hasOwn(villa.address, 'addressLocality'), false);
  assert.equal(Object.hasOwn(villa.address, 'streetAddress'), false);
  assert.equal(villa.address.addressRegion, 'عسير');
  assert.equal(villa.address.addressCountry, 'SA');
  rmSync(dir, { recursive: true, force: true });
});
