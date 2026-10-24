// renderListingCard(unit, company, opts) -> HTML string for one website listing card.
// Uses the same view model as the social templates. Drop into remalteam-landing pages (dir="rtl").
import { buildView, esc } from './listing-view.mjs';

export function renderListingCard(unit, company, { iconHref = '/assets/icons.svg', photoBase = '' } = {}) {
  const v = buildView(unit, company, { iconHref });
  const h = v.html;
  const photo = unit.photos?.[0];
  const media = photo
    ? `<img src="${esc(photoBase + photo)}" alt="${esc(unit.title || unit.unit_type || 'صورة الوحدة')}" loading="lazy">`
    : `<div class="rt-card-ph"><svg class="rt-waves" viewBox="0 0 300 120" preserveAspectRatio="none" aria-hidden="true"><path d="M0 50 C80 20 160 25 220 55 S290 95 300 85"/><path d="M0 70 C80 40 160 45 220 75 S290 115 300 105"/><path d="M0 90 C80 60 160 65 220 95 S290 135 300 125"/></svg><b>مكان صورة العقار</b><span>صورة حقيقية للوحدة فقط</span></div>`;
  const linkedMedia = v.detailHref ? `<a href="${esc(v.detailHref)}">${media}</a>` : media;
  const tag = unit.sample ? '<span class="rt-card-tag">مثال</span>' : (v.draft ? '<span class="rt-card-tag rt-card-tag--draft">مسودة</span>' : '');
  const cta = v.closed
    ? `<a class="rt-btn rt-btn-primary" aria-disabled="true">${unit.status === 'rented' ? 'تم التأجير' : 'تم البيع'}</a>`
    : v.waDisabled
      ? `<a class="rt-btn rt-btn-primary" aria-disabled="true">${h.cta}</a>`
      : `<a class="rt-btn rt-btn-primary" href="${esc(v.wa_link)}" target="_blank" rel="noopener">${h.cta}</a>`;
  const feats = h.features ? `<ul class="rt-card-features">${h.features}</ul>` : '';
  const cls = ['rt-card', 'rt-listing', v.closed && 'rt-card--closed', v.draft && !unit.sample && 'rt-card--draft'].filter(Boolean).join(' ');
  const eyebrow = [h.type, h.deal].filter(Boolean).map((part) => esc(part)).join(' · ');
  const title = v.detailHref ? `<a href="${esc(v.detailHref)}">${esc(h.title)}</a>` : esc(h.title);
  const loc = h.location ? `<div class="rt-card-loc">${h.location}</div>` : '';
  const price = v.priceParts.hidden
    ? esc(v.priceParts.amount)
    : `<span class="rt-num">${esc(v.priceParts.amount)}</span><small>${esc(v.priceParts.suffix)}</small>`;
  return `<article class="${cls}" data-ref="${esc(unit.ref)}" data-status="${esc(unit.status)}">
  <div class="rt-card-media">${linkedMedia}${h.status}${tag}</div>
  <div class="rt-card-body">
    <div class="rt-card-type">${eyebrow}</div>
    <h3 class="rt-card-title">${title}</h3>
    ${loc}
    <ul class="rt-card-specs">${h.specs}</ul>
    ${feats}
    <div class="rt-card-foot"><div class="rt-price">${price}</div>${cta}</div>
    <div class="rt-card-legal">${h.legal}</div>
  </div>
</article>`;
}
