#!/usr/bin/env node
// Builds the city/service pages from content/pages/*.json into public/<slug>/index.html,
// and refreshes everything else that carries office data: the build:* blocks in
// public/index.html, 404.html, sitemap.xml and llms.txt. Office data lives only in content/site.json.
// Usage: node scripts/build-pages.mjs   (no dependencies)
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const read = (p) => readFileSync(join(root, p), 'utf8');
const site = JSON.parse(read('content/site.json'));

// site.json must agree with the brand source of truth when this repo sits inside ~/Code/RT.
const brandPath = join(root, '../brand/design-system/company.json');
if (existsSync(brandPath)) {
  const c = JSON.parse(readFileSync(brandPath, 'utf8'));
  const pairs = [
    [c.name.ar, site.name.ar], [c.name.en, site.name.en],
    [c.commercial_registration, site.commercial_registration], [c.fal_license, site.fal_license],
    [c.whatsapp.number, site.whatsapp.number], [c.whatsapp.url, site.whatsapp.url], [c.email, site.email],
    [c.location_url, site.location_url], [c.google_business_profile_url, site.google_business_profile_url],
    [c.snapchat?.url, site.snapchat.url], [c.tiktok?.url, site.tiktok.url],
  ];
  for (const [want, got] of pairs) if (want !== undefined && want !== got) throw new Error(`content/site.json "${got}" != company.json "${want}"`);
}

const GROUPS = { city: 'المدن', service: 'الخدمات' };
const pages = readdirSync(join(root, 'content/pages')).filter((f) => f.endsWith('.json')).sort().map((f) => {
  const p = JSON.parse(read(`content/pages/${f}`));
  for (const k of ['slug', 'group', 'label', 'updated', 'title', 'description', 'h1', 'lead']) if (!p[k]) throw new Error(`${f}: missing "${k}"`);
  if (!GROUPS[p.group]) throw new Error(`${f}: group must be ${Object.keys(GROUPS).join('/')}`);
  if (!/^[a-z0-9-]+$/.test(p.slug)) throw new Error(`${f}: bad slug`);
  return p;
});
// Drafts are built for local preview only: noindex, and left out of links, sitemap and llms.txt.
const live = pages.filter((p) => !p.draft);

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const url = (p) => `${site.origin}/${p ? p.slug + '/' : ''}`;
const wa = (text) => (text ? `${site.whatsapp.url}?text=${encodeURIComponent(text)}` : site.whatsapp.url);
const json = (o) => JSON.stringify(o, null, 2).replace(/</g, '\\u003c');

const office = {
  '@type': 'RealEstateAgent',
  '@id': `${site.origin}/#office`,
  name: site.name.ar,
  alternateName: site.name.en,
  url: url(),
  logo: `${site.origin}/assets/favicon-192.png`,
  telephone: site.whatsapp.number,
  email: site.email,
  address: { '@type': 'PostalAddress', streetAddress: site.address.street, addressLocality: site.address.locality, postalCode: site.address.postal_code, addressRegion: site.address.region, addressCountry: site.address.country },
  geo: { '@type': 'GeoCoordinates', latitude: site.geo.latitude, longitude: site.geo.longitude },
  openingHoursSpecification: site.opening_hours.map((h) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: h.days, opens: h.opens, closes: h.closes })),
  areaServed: site.area_served,
  hasMap: site.location_url,
  sameAs: [site.google_business_profile_url, site.snapchat.url, site.tiktok.url],
  identifier: [
    { '@type': 'PropertyValue', name: 'السجل التجاري', value: site.commercial_registration },
    { '@type': 'PropertyValue', name: 'رخصة فال', value: site.fal_license },
  ],
};
const schema = (graph) => `<script type="application/ld+json">\n${json({ '@context': 'https://schema.org', '@graph': graph })}\n</script>`;

// Links to the live city/service pages, grouped; empty string while there are none.
const pageLinks = (cls) => Object.entries(GROUPS).map(([g, title]) => {
  const ps = live.filter((p) => p.group === g);
  return ps.length ? `<div><h3>${title}</h3><ul>${ps.map((p) => `<li><a href="/${p.slug}/">${esc(p.label)}</a></li>`).join('')}</ul></div>` : '';
}).join('').replace(/^(.+)$/s, `<nav class="${cls}" aria-label="صفحات الموقع">$1</nav>`);

const legal = `<div class="legal">
          <span>السجل التجاري: <b class="ltr">${site.commercial_registration}</b></span>
          <span>رخصة فال: <b class="ltr">${site.fal_license}</b></span>
          <span>واتساب: <a class="ltr" href="${site.whatsapp.url}">${site.whatsapp.number}</a></span>
          <span>البريد: <a class="ltr" href="mailto:${site.email}">${site.email}</a></span>
          <span>سناب شات: <a class="ltr" href="${site.snapchat.url}">${site.snapchat.handle}</a></span>
          <span>تيك توك: <a class="ltr" href="${site.tiktok.url}">${site.tiktok.handle}</a></span>
          <span>© <span class="ltr">${new Date().getFullYear()}</span> ${site.name.ar}</span>
        </div>`;

const ICON_CHAT = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/></svg>';

const page = (p) => {
  const faq = p.faq?.length ? p.faq : null;
  const graph = [
    office,
    { '@type': 'WebPage', '@id': url(p), url: url(p), name: p.title, description: p.description, inLanguage: 'ar', isPartOf: { '@id': `${site.origin}/#site` }, about: { '@id': office['@id'] } },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'الرئيسية', item: url() }, { '@type': 'ListItem', position: 2, name: p.label, item: url(p) }] },
  ];
  if (faq) graph.push({ '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
${p.draft ? '<meta name="robots" content="noindex">\n' : ''}<link rel="canonical" href="${url(p)}">
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
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${url(p)}">
<meta property="og:image" content="${site.origin}/assets/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alexandria:wght@500;600&family=Barlow+Condensed:wght@500;600&family=Barlow+Semi+Condensed:wght@500;600&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/assets/pages.css">
${schema(graph)}
</head>
<body>
<a class="skip" href="#main">تخطَّ إلى المحتوى</a>
<header class="site-head night">
  <div class="wrap">
    <a class="logo" href="/" aria-label="${esc(site.name.ar)} — الصفحة الرئيسية"><img src="/assets/logo-ivory.svg" alt="الرمال تيم العقارية" width="164" height="36"></a>
    <a class="btn btn-gold" href="${wa(p.wa_text)}">${ICON_CHAT}واتساب</a>
  </div>
</header>
<main id="main">
  <section class="page-hero night" aria-labelledby="page-title">
    <div class="wrap">
      <nav class="crumbs" aria-label="مسار الصفحة"><a href="/">الرئيسية</a> / <span>${esc(p.label)}</span></nav>
      ${p.kicker ? `<p class="eyebrow">${esc(p.kicker)}</p>` : ''}
      <h1 id="page-title">${esc(p.h1)}</h1>
      ${p.en ? `<p class="en en-line">${esc(p.en)}</p>` : ''}
      <p class="lead">${esc(p.lead)}</p>
      <a class="btn btn-gold" href="${wa(p.wa_text)}">${ICON_CHAT}تواصل عبر واتساب</a>
    </div>
  </section>
${(p.sections || []).map((s, i) => `  <section class="${i % 2 ? 'sand' : ''}">
    <div class="wrap prose">
      <div class="sec-head"><h2>${esc(s.h2)}</h2>${s.en ? `<p class="en">${esc(s.en)}</p>` : ''}</div>
      ${s.html}
    </div>
  </section>`).join('\n')}
${faq ? `  <section class="faq" aria-labelledby="faq-title">
    <div class="wrap prose">
      <div class="sec-head"><h2 id="faq-title">أسئلة شائعة</h2><p class="en">FAQ</p></div>
${faq.map((f) => `      <details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n')}
    </div>
  </section>` : ''}
  <section id="contact" class="contact night" aria-labelledby="contact-title">
    <div class="wrap">
      <div class="contact-grid">
        <div>
          <h2 id="contact-title">تواصل معنا</h2>
          <p class="en">Get in touch</p>
          <p>اكتب لنا على واتساب: نوع العقار، الحي، والميزانية أو بيانات التمويل، ونرد عليك في أقرب وقت.</p>
          <a class="btn btn-gold" href="${wa(p.wa_text)}">${ICON_CHAT}تواصل عبر واتساب</a>
        </div>
        ${pageLinks('page-links')}
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
};

for (const p of pages) {
  mkdirSync(join(pub, p.slug), { recursive: true });
  writeFileSync(join(pub, p.slug, 'index.html'), page(p));
}

// Home page: hand-written, except the blocks between <!-- build:NAME --> and <!-- /build:NAME -->.
const blocks = {
  schema: schema([{ ...office, url: url() }, { '@type': 'WebSite', '@id': `${site.origin}/#site`, url: url(), name: site.name.ar, inLanguage: 'ar', publisher: { '@id': office['@id'] } }]),
  'home-links': pageLinks('page-links reveal'),
  'foot-links': pageLinks('page-links'),
  legal,
};
let home = readFileSync(join(pub, 'index.html'), 'utf8');
for (const [name, html] of Object.entries(blocks)) {
  const re = new RegExp(`(<!-- build:${name} -->)[\\s\\S]*?(<!-- /build:${name} -->)`);
  if (!re.test(home)) throw new Error(`public/index.html: missing <!-- build:${name} --> block`);
  // Replacer function, so '$' in content is never read as a replacement pattern.
  home = home.replace(re, (_, open, close) => open + (html ? `\n${html}\n` : '') + close);
}
writeFileSync(join(pub, 'index.html'), home);

// 404: self-contained (inline styles), but the office line comes from site.json like every other page.
writeFileSync(join(pub, '404.html'), `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>الصفحة غير موجودة | الرمال تيم العقارية</title><meta name="robots" content="noindex"><link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#1C1D21;color:#F7F4EF;font:16px/28px 'IBM Plex Sans Arabic',Tahoma,sans-serif;text-align:center;padding:16px">
<div><img src="/assets/mark-gold.svg" alt="" width="72" style="margin:0 auto 16px"><h1 style="font-size:28px;margin:0 0 8px">الصفحة غير موجودة</h1><p style="color:#B9B2A6;margin:0 0 24px">Page not found</p><a href="/" style="color:#C8A46B">العودة للرئيسية</a><p style="color:#B9B2A6;font-size:13px;margin-top:32px">السجل التجاري ${site.commercial_registration} · رخصة فال ${site.fal_license} · واتساب <a href="${site.whatsapp.url}" style="color:#B9B2A6" dir="ltr">${site.whatsapp.number}</a></p></div></body></html>
`);

writeFileSync(join(pub, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${url()}</loc><lastmod>${site.home_updated}</lastmod></url>
${live.map((p) => `  <url><loc>${url(p)}</loc><lastmod>${p.updated}</lastmod></url>\n`).join('')}</urlset>
`);

writeFileSync(join(pub, 'llms.txt'), `# ${site.name.ar} (${site.name.en})

> ${site.summary}

- السجل التجاري: ${site.commercial_registration}
- رخصة فال: ${site.fal_license}
- واتساب: ${site.whatsapp.number} (${site.whatsapp.url})
- البريد: ${site.email}
- العنوان: ${site.address.street}، ${site.address.locality} ${site.address.postal_code}، ${site.address.region}
- الخريطة: ${site.location_url}
- سناب شات: ${site.snapchat.url}
- تيك توك: ${site.tiktok.url}

## الصفحات

- [الرئيسية](${url()}): ${site.summary}
${live.map((p) => `- [${p.label}](${url(p)}): ${p.description}\n`).join('')}`);

console.log(`built ${pages.length} page(s) (${pages.length - live.length} draft), index.html blocks, 404.html, sitemap.xml (${live.length + 1} urls), llms.txt`);
