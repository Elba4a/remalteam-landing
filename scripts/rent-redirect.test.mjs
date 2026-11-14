// The rent page is gone. Old URLs must 301 to /sale/, including subpaths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../worker.js';

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

async function follow(path, host = 'remalteam.com') {
  const { calls, env } = assets();
  const res = await worker.fetch(new Request(`https://${host}${path}`), env);
  return { res, calls, location: res.headers.get('location') };
}

async function followOptions(path, host = 'remalteam.com') {
  const { calls, env } = assets();
  const res = await worker.fetch(new Request(`https://${host}${path}`, { method: 'OPTIONS' }), env);
  return { res, calls, location: res.headers.get('location') };
}

test('rent, rent/ and rent/* 301 to /sale/ and do not serve an asset', async () => {
  const paths = ['/rent', '/rent/', '/rent/foo', '/rent/foo/bar', '/rent/index.html'];
  for (const path of paths) {
    const { res, calls, location } = await follow(path);
    assert.equal(res.status, 301, path);
    assert.equal(location, 'https://remalteam.com/sale/', path);
    assert.deepEqual(calls, [], path);
  }
});

test('a rent URL on www canonicalizes the host in the same 301', async () => {
  const { res, calls, location } = await follow('/rent/old-listing', 'www.remalteam.com');
  assert.equal(res.status, 301);
  assert.equal(location, 'https://remalteam.com/sale/');
  assert.deepEqual(calls, []);
});

test('query strings survive the rent redirect', async () => {
  const { location } = await follow('/rent/?utm=old');
  assert.equal(location, 'https://remalteam.com/sale/?utm=old');
});

test('nearby paths are not treated as rent', async () => {
  for (const path of ['/', '/sale/', '/rental', '/current', '/rentals', '/abha/']) {
    const { res, calls } = await follow(path);
    assert.equal(res.status, 200, path);
    assert.equal(calls.length, 1, path);
  }
});

test('the existing www redirect still keeps the path', async () => {
  const { res, calls, location } = await follow('/sale/', 'www.remalteam.com');
  assert.equal(res.status, 301);
  assert.equal(location, 'https://remalteam.com/sale/');
  assert.deepEqual(calls, []);
});

test('the units feed allows only calc.remalteam.com and caches for five minutes', async () => {
  const headersFile = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  assert.match(headersFile, /\/units\/index\.json\n  Access-Control-Allow-Origin: https:\/\/calc\.remalteam\.com\n  Cache-Control: public, max-age=300\n/);

  const { res, calls } = await follow('/units/index.json');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://calc.remalteam.com');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=300');
  assert.equal(await res.text(), 'asset');
  assert.deepEqual(calls, ['https://remalteam.com/units/index.json']);

  const preflight = await followOptions('/units/index.json');
  assert.equal(preflight.res.status, 204);
  assert.equal(preflight.res.headers.get('access-control-allow-origin'), 'https://calc.remalteam.com');
  assert.equal(preflight.res.headers.get('cache-control'), 'public, max-age=300');
  assert.deepEqual(preflight.calls, []);

  const other = await follow('/units/');
  assert.equal(other.res.headers.get('access-control-allow-origin'), null);
  assert.equal(other.calls.length, 1);

  const www = await follow('/units/index.json', 'www.remalteam.com');
  assert.equal(www.res.status, 301);
  assert.equal(www.location, 'https://remalteam.com/units/index.json');
  assert.deepEqual(www.calls, []);
});
