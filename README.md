# remalteam.com

Landing page for Al-Remal Team Real Estate (مكتب الرمال تيم العقارية), Aseer, KSA. Live at https://remalteam.com.

Static HTML in `public/`, served by a Cloudflare Worker (`worker.js`) with static assets. The hero is a procedural 3D villa (`public/assets/scene.js`, three.js r170 vendored) on screens ≥1024px; smaller screens and reduced-motion get static WebP renders from `public/assets/hero/`.

- Deploy: `npx wrangler@4.149.0 deploy` (pinned; bump on purpose, to a release at least two weeks old). Local run with the real headers: `npx wrangler@4.149.0 dev --local`
- City/service pages: one JSON file per page in `content/pages/` (copy `abha.json`), then `node scripts/build-pages.mjs`. It writes `public/<slug>/index.html`, the `<!-- build:* -->` blocks in `public/index.html` (schema, page links, footer legal line), `404.html`, `sitemap.xml` and `llms.txt`. Office data (CR, FAL, WhatsApp, address) lives only in `content/site.json`; the script refuses to build if it disagrees with `../brand/design-system/company.json`. `"draft": true` builds a noindex page that stays out of links, sitemap and llms.txt. Commit the generated files.
- Headers live in `public/_headers`. The Content-Security-Policy is Report-Only for now: no inline scripts except the one-line `js` class in `index.html`, allowed by its sha256 (change both together); page scripts go in `public/assets/`.
- After changing `scene.js`, re-render the fallback first: `scripts/render-hero-fallback.sh`

© Al-Remal Team / Elba4a. All rights reserved. Source is visible for reference; no license is granted to reuse it.
