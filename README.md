# remalteam.com

Landing page for Al-Remal Team Real Estate (مكتب الرمال تيم العقارية), Aseer, KSA. Live at https://remalteam.com.

Static HTML in `public/`, served by a Cloudflare Worker (`worker.js`) with static assets. The hero is a procedural 3D villa (`public/assets/scene.js`, three.js r170 vendored) on screens ≥1024px; smaller screens and reduced-motion get static WebP renders from `public/assets/hero/`.

- Deploy: `npx wrangler@4 deploy`
- City/service pages: one JSON file per page in `content/pages/` (copy `abha.json`), then `node scripts/build-pages.mjs`. It writes `public/<slug>/index.html`, the `<!-- build:* -->` blocks in `public/index.html` (schema, page links, footer legal line), `sitemap.xml` and `llms.txt`. Office data (CR, FAL, WhatsApp, address) lives only in `content/site.json`; the script refuses to build if it disagrees with `../brand/design-system/company.json`. `"draft": true` builds a noindex page that stays out of links, sitemap and llms.txt. Commit the generated files.
- After changing `scene.js`, re-render the fallback first: `scripts/render-hero-fallback.sh`

© Al-Remal Team / Elba4a. All rights reserved. Source is visible for reference; no license is granted to reuse it.
