// Short campaign links. 302 so the prefilled WhatsApp text can change later.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker.js';
import { urlsFromSitemap } from './indexnow-ping.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const GOOGLE = 'https://wa.me/966535330034?text=%D8%A7%D9%84%D8%B3%D9%84%D8%A7%D9%85%20%D8%B9%D9%84%D9%8A%D9%83%D9%85%D8%8C%20%D8%AC%D9%8A%D8%AA%D9%83%D9%85%20%D9%85%D9%86%20%D9%82%D9%88%D9%82%D9%84';
const TIKTOK = 'https://wa.me/966535330034?text=%D8%A7%D9%84%D8%B3%D9%84%D8%A7%D9%85%20%D8%B9%D9%84%D9%8A%D9%83%D9%85%D8%8C%20%D8%AC%D9%8A%D8%AA%D9%83%D9%85%20%D9%85%D9%86%20%D8%AA%D9%8A%D9%83%20%D8%AA%D9%88%D9%83';

function assets() {
  const calls = [];
  return {
    calls,
    env: {
      ASSETS: {
        fetch(request) {
          calls.push(request.url);
          return new Response('asset', { status: 200 });
        },
      },
    },
  };
}

async function follow(path, { host = 'remalteam.com', method = 'GET' } = {}) {
  const { calls, env } = assets();
  const res = await worker.fetch(new Request(`https://${host}${path}`, { method }), env);
  return { res, calls, location: res.headers.get('location') };
}

test('google and tiktok WhatsApp routes 302 with the exact prefilled text', async () => {
  assert.equal(decodeURIComponent(GOOGLE.split('?text=')[1]), 'السلام عليكم، جيتكم من قوقل');
  assert.equal(decodeURIComponent(TIKTOK.split('?text=')[1]), 'السلام عليكم، جيتكم من تيك توك');

  const cases = [
    ['/wa/google', 'GET', GOOGLE],
    ['/wa/google/', 'GET', GOOGLE],
    ['/wa/google', 'HEAD', GOOGLE],
    ['/wa/google/', 'HEAD', GOOGLE],
    ['/wa/tiktok', 'GET', TIKTOK],
    ['/wa/tiktok/', 'GET', TIKTOK],
    ['/wa/tiktok', 'HEAD', TIKTOK],
    ['/wa/tiktok/', 'HEAD', TIKTOK],
  ];
  for (const [path, method, location] of cases) {
    const hit = await follow(path, { method });
    assert.equal(hit.res.status, 302, `${method} ${path}`);
    assert.equal(hit.location, location, `${method} ${path}`);
    assert.equal(hit.res.headers.get('x-robots-tag'), 'noindex, nofollow', `${method} ${path}`);
    assert.equal(hit.res.headers.get('cache-control'), 'no-store', `${method} ${path}`);
    assert.equal(await hit.res.text(), '', `${method} ${path}`);
    assert.deepEqual(hit.calls, [], `${method} ${path}`);
  }
});

test('a query string does not change the WhatsApp Location', async () => {
  const { res, location } = await follow('/wa/google?utm=ad');
  assert.equal(res.status, 302);
  assert.equal(location, GOOGLE);
});

test('only the exact paths redirect', async () => {
  for (const path of ['/wa', '/wa/', '/wa/google//', '/wa/google/extra', '/wa/goog', '/whatsapp', '/sale/']) {
    const { res, calls, location } = await follow(path);
    assert.equal(res.status, 200, path);
    assert.equal(location, null, path);
    assert.equal(calls.length, 1, path);
  }
});

test('other methods are not redirected', async () => {
  const { res, calls, location } = await follow('/wa/tiktok', { method: 'POST' });
  assert.equal(res.status, 200);
  assert.equal(location, null);
  assert.deepEqual(calls, ['https://remalteam.com/wa/tiktok']);
});

test('www still canonicalises before the WhatsApp redirect', async () => {
  const { res, calls, location } = await follow('/wa/google/', { host: 'www.remalteam.com' });
  assert.equal(res.status, 301);
  assert.equal(location, 'https://remalteam.com/wa/google/');
  assert.deepEqual(calls, []);
});

test('sitemap, robots, and IndexNow omit /wa/', () => {
  const xml = readFileSync(join(root, 'public/sitemap.xml'), 'utf8');
  const robots = readFileSync(join(root, 'public/robots.txt'), 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(xml.includes('/wa/'), false);
  assert.equal(locs.length, 19);
  assert.equal(locs.some((loc) => loc.includes('/wa/')), false);
  assert.equal(robots.includes('/wa/'), false);
  const indexed = urlsFromSitemap(xml);
  assert.deepEqual(indexed, locs);
  assert.equal(indexed.some((loc) => loc.includes('/wa/')), false);
});
