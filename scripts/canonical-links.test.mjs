// Every built HTML page (except 404) has one self-canonical, and every internal
// link, sitemap loc, and site URL in JSON-LD is already the URL that returns 200.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishedUnits, readUnitsDocument } from './units-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const ORIGIN = 'https://remalteam.com';

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

function pageCanonical(relHtml) {
  if (relHtml === 'index.html') return `${ORIGIN}/`;
  if (relHtml.endsWith('/index.html')) return `${ORIGIN}/${relHtml.slice(0, -'index.html'.length)}`;
  return '';
}

function existsWithoutRedirect(pathname) {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (decoded.includes('\0')) return false;
  if (decoded === '/') return existsSync(join(pub, 'index.html'));
  const rel = decoded.replace(/^\/+/, '');
  if (!rel || rel.split('/').includes('..')) return false;
  if (rel.endsWith('/')) return existsSync(join(pub, rel, 'index.html'));
  const file = join(pub, rel);
  if (!existsSync(file)) return false;
  const stat = statSync(file);
  if (stat.isDirectory()) return false;
  return stat.isFile();
}

function asSiteUrl(value) {
  if (typeof value !== 'string' || value === '' || value.startsWith('#')) return null;
  if (value.startsWith('/') && !value.startsWith('//')) {
    try {
      return new URL(value, `${ORIGIN}/`);
    } catch {
      return null;
    }
  }
  try {
    const url = new URL(value);
    if (url.hostname === 'remalteam.com' || url.hostname === 'www.remalteam.com') return url;
  } catch {
    return null;
  }
  return null;
}

function assertFinalUrl(value, where) {
  const url = asSiteUrl(value);
  if (!url) return;
  assert.equal(url.protocol, 'https:', `${where} ${value}`);
  assert.equal(url.hostname, 'remalteam.com', `${where} ${value}`);
  assert.equal(existsWithoutRedirect(url.pathname), true, `${where} needs a redirect or is missing: ${value}`);
}

function collectHtmlRefs(html) {
  const refs = [];
  for (const match of html.matchAll(/\s(?:href|content)=["']([^"']+)["']/g)) refs.push(match[1]);
  return refs;
}

function walkJson(value, visit) {
  if (typeof value === 'string') visit(value);
  else if (Array.isArray(value)) value.forEach((item) => walkJson(item, visit));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => walkJson(item, visit));
}

test('sitemap is one urlset and lists every published page', () => {
  const xml = readFileSync(join(pub, 'sitemap.xml'), 'utf8');
  assert.equal(xml.includes('<sitemapindex'), false);
  assert.equal(existsSync(join(pub, 'sitemap_index.xml')), false);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((match) => match[1]);
  const doc = readUnitsDocument(root, pub);
  const codes = publishedUnits(doc.units).map((unit) => unit.code);
  const pages = readdirSync(join(root, 'content/pages')).filter((name) => name.endsWith('.json')).sort().map((name) => JSON.parse(readFileSync(join(root, 'content/pages', name), 'utf8'))).filter((page) => !page.draft);
  const expected = [
    `${ORIGIN}/`,
    ...pages.map((page) => `${ORIGIN}/${page.slug}/`),
    `${ORIGIN}/units/`,
    ...codes.map((code) => `${ORIGIN}/units/${code}/`),
  ];
  assert.deepEqual(locs, expected);
  assert.equal(locs.length, pages.length + 2 + codes.length);
  assert.equal(lastmods.length, locs.length);
  const byLoc = Object.fromEntries(locs.map((loc, index) => [loc, lastmods[index]]));
  assert.equal(byLoc[`${ORIGIN}/`], '2026-11-14');
  assert.equal(byLoc[`${ORIGIN}/units/`], '2026-11-14');
  for (const code of codes) assert.equal(byLoc[`${ORIGIN}/units/${code}/`], '2026-11-14');
  for (const loc of locs) assertFinalUrl(loc, 'sitemap');
  const robots = readFileSync(join(pub, 'robots.txt'), 'utf8');
  assert.match(robots, /^Sitemap: https:\/\/remalteam\.com\/sitemap\.xml$/m);
});

test('built pages canonicalise themselves and link only to final URLs', () => {
  const htmlFiles = walk(pub).filter((path) => path.endsWith('.html'));
  assert.ok(htmlFiles.some((path) => path.endsWith(`${join('public', 'index.html')}`) || relative(pub, path) === 'index.html'));
  for (const file of htmlFiles) {
    const rel = relative(pub, file);
    const html = readFileSync(file, 'utf8');
    const canonicals = [...html.matchAll(/<link rel="canonical" href="([^"]+)">/g)].map((match) => match[1]);
    if (rel === '404.html') {
      assert.equal(canonicals.length, 0, '404 stays without a canonical');
    } else {
      const expected = pageCanonical(rel);
      assert.equal(canonicals.length, 1, rel);
      assert.equal(canonicals[0], expected, rel);
      const og = [...html.matchAll(/<meta property="og:url" content="([^"]+)">/g)].map((match) => match[1]);
      assert.equal(og.length, 1, rel);
      assert.equal(og[0], expected, rel);
    }
    for (const href of collectHtmlRefs(html)) {
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
      assertFinalUrl(href, rel);
    }
    for (const block of html.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)) {
      const data = JSON.parse(block[1]);
      walkJson(data, (value) => assertFinalUrl(value, `${rel} json-ld`));
    }
  }
});
