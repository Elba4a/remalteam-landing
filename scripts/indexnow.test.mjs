import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexNowBody, urlsFromSitemap } from './indexnow-ping.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = 'bef2f3062074c9ff62a6e9800fdf317f';

test('IndexNow key file is the key itself', () => {
  const body = readFileSync(join(root, 'public', `${KEY}.txt`), 'utf8');
  assert.equal(body, KEY);
});

test('sitemap locs become an IndexNow body without posting', () => {
  const urls = urlsFromSitemap(`<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://remalteam.com/</loc></url>
  <url><loc>https://remalteam.com/units/RT-001/</loc></url>
</urlset>`);
  assert.deepEqual(urls, ['https://remalteam.com/', 'https://remalteam.com/units/RT-001/']);
  assert.deepEqual(indexNowBody({ key: KEY, urls }), {
    host: 'remalteam.com',
    key: KEY,
    keyLocation: `https://remalteam.com/${KEY}.txt`,
    urlList: urls,
  });
});
