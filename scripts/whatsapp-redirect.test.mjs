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
const SNAP = 'https://wa.me/966535330034?text=%D8%A7%D9%84%D8%B3%D9%84%D8%A7%D9%85%20%D8%B9%D9%84%D9%8A%D9%83%D9%85%D8%8C%20%D8%AC%D9%8A%D8%AA%D9%83%D9%85%20%D9%85%D9%86%20%D8%B3%D9%86%D8%A7%D8%A8';
const SITE = 'https://wa.me/966535330034?text=%D8%A7%D9%84%D8%B3%D9%84%D8%A7%D9%85%20%D8%B9%D9%84%D9%8A%D9%83%D9%85%D8%8C%20%D8%AC%D9%8A%D8%AA%D9%83%D9%85%20%D9%85%D9%86%20%D8%A7%D9%84%D9%85%D9%88%D9%82%D8%B9';
const STATUS = 'https://wa.me/966535330034?text=%D8%A7%D9%84%D8%B3%D9%84%D8%A7%D9%85%20%D8%B9%D9%84%D9%8A%D9%83%D9%85%D8%8C%20%D8%AC%D9%8A%D8%AA%D9%83%D9%85%20%D9%85%D9%86%20%D8%AD%D8%A7%D9%84%D8%A9%20%D9%88%D8%A7%D8%AA%D8%B3%D8%A7%D8%A8';

const ROUTES = [
  ['/wa/google', GOOGLE, 'السلام عليكم، جيتكم من قوقل', 'google'],
  ['/wa/tiktok', TIKTOK, 'السلام عليكم، جيتكم من تيك توك', 'tiktok'],
  ['/wa/snap', SNAP, 'السلام عليكم، جيتكم من سناب', 'snap'],
  ['/wa/site', SITE, 'السلام عليكم، جيتكم من الموقع', 'site'],
  ['/wa/status', STATUS, 'السلام عليكم، جيتكم من حالة واتساب', 'status'],
];

function assets(extra = {}) {
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
      ...extra,
    },
  };
}

function clickCounter(writeDataPoint) {
  const points = [];
  const waits = [];
  return {
    points,
    waits,
    env: {
      WA_CLICKS: {
        writeDataPoint: writeDataPoint || ((point) => {
          points.push(structuredClone(point));
        }),
      },
    },
    ctx: {
      waits,
      waitUntil(task) {
        waits.push(task);
      },
    },
  };
}

async function follow(path, { host = 'remalteam.com', method = 'GET', env: extraEnv, ctx, cf, headers } = {}) {
  const { calls, env } = assets(extraEnv);
  const request = new Request(`https://${host}${path}`, { method, headers });
  if (cf) Object.defineProperty(request, 'cf', { value: cf });
  const res = await worker.fetch(request, env, ctx);
  if (ctx && Array.isArray(ctx.waits)) await Promise.all(ctx.waits);
  return { res, calls, location: res.headers.get('location'), env };
}

test('campaign WhatsApp routes 302 with the exact prefilled text', async () => {
  for (const [path, location, text] of ROUTES) {
    assert.equal(decodeURIComponent(location.split('?text=')[1]), text, path);
  }

  const cases = [];
  for (const [path, location] of ROUTES) {
    cases.push([path, 'GET', location], [`${path}/`, 'GET', location], [path, 'HEAD', location], [`${path}/`, 'HEAD', location]);
  }
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
  for (const [path] of ROUTES) assert.equal(xml.includes(path), false, path);
  assert.equal(robots.includes('/wa/'), false);
  const indexed = urlsFromSitemap(xml);
  assert.deepEqual(indexed, locs);
  assert.equal(indexed.some((loc) => loc.includes('/wa/')), false);
});

test('each redirect writes one click with channel, path, date, and country', async () => {
  const day = new Date().toISOString().slice(0, 10);
  for (const [path, , , channel] of ROUTES) {
    for (const suffix of ['', '/']) {
      for (const method of ['GET', 'HEAD']) {
        const counter = clickCounter();
        const hit = await follow(`${path}${suffix}?utm_source=ad&phone=966535330034`, {
          method,
          env: counter.env,
          ctx: counter.ctx,
          cf: { country: 'SA', city: 'Abha', colo: 'RUH', postalCode: '62521' },
          headers: {
            'user-agent': 'SecretBrowser/1.0',
            'cf-connecting-ip': '203.0.113.8',
          },
        });
        assert.equal(hit.res.status, 302, `${method} ${path}${suffix}`);
        assert.equal(counter.waits.length, 1, `${method} ${path}${suffix}`);
        assert.equal(counter.points.length, 1, `${method} ${path}${suffix}`);
        const point = counter.points[0];
        assert.deepEqual(Object.keys(point).sort(), ['blobs', 'doubles', 'indexes']);
        assert.deepEqual(point.indexes, [channel]);
        assert.deepEqual(point.blobs, [channel, path, day, 'SA']);
        assert.deepEqual(point.doubles, [1]);
        const dumped = JSON.stringify(point);
        assert.equal(dumped.includes('utm_source'), false);
        assert.equal(dumped.includes('966535330034'), false);
        assert.equal(dumped.includes('SecretBrowser'), false);
        assert.equal(dumped.includes('203.0.113.8'), false);
        assert.equal(dumped.includes('Abha'), false);
        assert.equal(dumped.includes('62521'), false);
        assert.equal(dumped.includes('?'), false);
      }
    }
  }
});

test('a redirect still 302 when the click binding is missing or throws', async () => {
  const missing = await follow('/wa/snap/');
  assert.equal(missing.res.status, 302);
  assert.equal(missing.location, SNAP);
  assert.equal(missing.env.WA_CLICKS, undefined);

  const thrown = clickCounter(() => {
    throw new Error('analytics down');
  });
  const failed = await follow('/wa/status', { env: thrown.env, ctx: thrown.ctx, cf: { country: 'SA' } });
  assert.equal(failed.res.status, 302);
  assert.equal(failed.location, STATUS);
  assert.deepEqual(thrown.points, []);

  const rejected = clickCounter(() => Promise.reject(new Error('analytics rejected')));
  const asyncFail = await follow('/wa/site/', { env: rejected.env, ctx: rejected.ctx });
  assert.equal(asyncFail.res.status, 302);
  assert.equal(asyncFail.location, SITE);

  const day = new Date().toISOString().slice(0, 10);
  const noWait = clickCounter();
  const unwired = await follow('/wa/google', { env: noWait.env, cf: {} });
  assert.equal(unwired.res.status, 302);
  assert.equal(unwired.location, GOOGLE);
  assert.deepEqual(noWait.points, [{
    indexes: ['google'],
    blobs: ['google', '/wa/google', day, ''],
    doubles: [1],
  }]);
});

test('wrangler binds the free click dataset', () => {
  const config = readFileSync(join(root, 'wrangler.jsonc'), 'utf8');
  assert.match(config, /"binding": "WA_CLICKS"/);
  assert.match(config, /"dataset": "remal_wa_clicks"/);
});

test('clicks are not written unless the WhatsApp redirect runs', async () => {
  const counter = clickCounter();
  const misses = [
    ['/wa', 'GET', 'remalteam.com'],
    ['/wa/snap/extra', 'GET', 'remalteam.com'],
    ['/wa/tiktok', 'POST', 'remalteam.com'],
    ['/wa/google/', 'GET', 'www.remalteam.com'],
  ];
  for (const [path, method, host] of misses) {
    counter.points.length = 0;
    counter.waits.length = 0;
    await follow(path, { method, host, env: counter.env, ctx: counter.ctx, cf: { country: 'SA' } });
    assert.deepEqual(counter.points, [], `${method} ${host}${path}`);
    assert.deepEqual(counter.waits, [], `${method} ${host}${path}`);
  }
});
