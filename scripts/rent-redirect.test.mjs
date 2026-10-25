// The rent page is gone. Old URLs must 301 to /sale/, including subpaths.
import test from 'node:test';
import assert from 'node:assert/strict';
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
