// Listing card markup. The only card component.
// Styles and DS v2 tokens: public/assets/rt-listing-card.css
// Do not add rt-listing-card rules anywhere else.

const ICON_CHAT = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/></svg>';

function specValue(spec, esc) {
  const value = spec.ltr ? `<span class="ltr">${esc(spec.value)}</span>` : esc(spec.value);
  return spec.suffix ? `${value}${esc(spec.suffix)}` : value;
}

function whatsAppControl(card, esc) {
  const classes = card.disabledWa ? 'rt-btn rt-btn--whatsapp rt-btn--disabled' : 'rt-btn rt-btn--whatsapp';
  if (card.disabledWa) return `<span class="${classes}" aria-disabled="true">${ICON_CHAT}واتساب</span>`;
  return `<a class="${classes}" href="${esc(card.waHref)}">${ICON_CHAT}واتساب</a>`;
}

function licenseBlock(card, esc) {
  if (!card.license) {
    return card.placeholder ? '<p class="rt-listing-card__license rt-listing-card__license--missing">لا توجد رخصة إعلان</p>' : '';
  }
  return `<div class="rt-listing-card__license">
    <div>
      <p class="rt-listing-card__license-label">رخصة الإعلان</p>
      <p class="rt-listing-card__license-number ltr">${esc(card.license.number)}</p>
    </div>
    <img class="rt-listing-card__qr" src="${esc(card.license.qrUrl)}" alt="${esc(card.license.alt)}" width="72" height="72" loading="lazy" decoding="async">
  </div>`;
}

/**
 * @param {object} card Presentational view model. Strings are unescaped.
 * @param {(s: unknown) => string} esc
 */
export function renderListingCard(card, esc) {
  const specs = card.specs.map((spec) => `<div><dt>${esc(spec.label)}</dt><dd>${specValue(spec, esc)}</dd></div>`).join('');
  const price = card.price.hidden
    ? esc(card.price.text)
    : `<span class="ltr">${esc(card.price.amount)}</span> ${esc(card.price.currency)}`;
  return `<article class="rt-listing-card rt-listing-card--${esc(card.status)}${card.placeholder ? ' rt-listing-card--placeholder' : ''}">
  <a class="rt-listing-card__media" href="${esc(card.detailHref)}">
    <img src="${esc(card.coverUrl)}" alt="${esc(card.alt)}" width="1280" height="800" loading="lazy" decoding="async">
  </a>
  <div class="rt-listing-card__body">
    <div class="rt-listing-card__kicker">
      <p class="rt-listing-card__code ltr">${esc(card.code)}</p>
      <p class="rt-listing-card__status">${esc(card.statusLabel)}</p>
    </div>
    <h2 class="rt-listing-card__title"><a href="${esc(card.detailHref)}">${esc(card.title)}</a></h2>
    <dl class="rt-listing-card__specs">${specs}</dl>
    <p class="rt-listing-card__price">${price}</p>
    ${licenseBlock(card, esc)}
    <div class="rt-listing-card__actions">
      ${whatsAppControl(card, esc)}
      <a class="rt-btn rt-btn--ghost" href="${esc(card.detailHref)}">التفاصيل</a>
    </div>
  </div>
</article>`;
}
