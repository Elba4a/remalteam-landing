# remalteam.com

Landing page for Al-Remal Team Real Estate (مكتب الرمال تيم العقارية), Aseer, KSA. Live at https://remalteam.com.

Static HTML in `public/`, served by a Cloudflare Worker (`worker.js`) with static assets. The hero is a procedural 3D villa (`public/assets/scene.js`, three.js r170 vendored) on screens ≥1024px; smaller screens and reduced-motion get static WebP renders from `public/assets/hero/`.

- Deploy: `npx wrangler@4 deploy`
- After changing `scene.js`, re-render the fallback first: `scripts/render-hero-fallback.sh`

© Al-Remal Team / Elba4a. All rights reserved. Source is visible for reference; no license is granted to reuse it.
