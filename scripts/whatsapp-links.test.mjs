// Non-unit pages must not ship a bare WhatsApp link. Unit pages keep their own prefill.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_WA_TEXT, siteWaHref } from './listing-view.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const EXPECTED = 'https://wa.me/966535330034?text=%D8%A7%D9%84%D8%B3%D9%84%D8%A7%D9%85%20%D8%B9%D9%84%D9%8A%D9%83%D9%85%D8%8C%20%D8%AC%D9%8A%D8%AA%D9%83%D9%85%20%D9%85%D9%86%20%D8%A7%D9%84%D9%85%D9%88%D9%82%D8%B9';

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

function isUnitPage(rel) {
  return rel === 'units/index.html' || rel.startsWith('units/');
}

function whatsappHrefs(html) {
  const hrefs = [];
  for (const match of html.matchAll(/\shref="([^"]+)"/g)) {
    let url;
    try {
      url = new URL(match[1]);
    } catch {
      continue;
    }
    if (url.hostname === 'wa.me' || url.hostname === 'api.whatsapp.com') hrefs.push(url);
  }
  return hrefs;
}

function allowedText(text) {
  return text === SITE_WA_TEXT || text.startsWith(`${SITE_WA_TEXT} - وحدة `);
}

test('the shared greeting is the exact wa.me link', () => {
  const site = JSON.parse(readFileSync(join(root, 'content/site.json'), 'utf8'));
  assert.equal(SITE_WA_TEXT, 'السلام عليكم، جيتكم من الموقع');
  assert.equal(siteWaHref(site.whatsapp.url), EXPECTED);
});

test('non-unit pages have no bare WhatsApp link', () => {
  const htmlFiles = walk(pub).filter((path) => path.endsWith('.html'));
  const pages = htmlFiles.map((path) => relative(pub, path)).filter((rel) => !isUnitPage(rel));
  const required = ['index.html', 'abha/index.html', 'khamis-mushait/index.html', 'namas/index.html', 'ahad-rafidah/index.html', 'sale/index.html', 'home-finance/index.html', 'mortgage-calculator/index.html', '404.html'];
  for (const rel of required) assert.ok(pages.includes(rel), rel);
  for (const rel of pages) {
    const html = readFileSync(join(pub, rel), 'utf8');
    if (required.includes(rel)) assert.ok(html.includes(`href="${EXPECTED}"`), `${rel} is missing the shared greeting`);
    for (const url of whatsappHrefs(html)) {
      const text = url.searchParams.get('text') || '';
      assert.equal(allowedText(text), true, `${rel} bare WhatsApp link: ${url.href}`);
    }
  }
});

test('the mortgage calculator reuses the header WhatsApp link', () => {
  const js = readFileSync(join(pub, 'assets/mortgage-calc.js'), 'utf8');
  assert.match(js, /document\.querySelector\('\.site-head \.btn'\)\.href/);
  assert.equal(js.includes('encodeURIComponent'), false);
  assert.equal(js.includes('text='), false);
});
