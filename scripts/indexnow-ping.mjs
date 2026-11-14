#!/usr/bin/env node
// Posts the live sitemap URLs to IndexNow. Run by hand: node scripts/indexnow-ping.mjs
// Importing this module does not send anything.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HOST = 'remalteam.com';
const SITEMAP_URL = 'https://remalteam.com/sitemap.xml';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

export function urlsFromSitemap(xml) {
  return [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => match[1]);
}

export function indexNowBody({ host = HOST, key, urls }) {
  return {
    host,
    key,
    keyLocation: `https://${host}/${key}.txt`,
    urlList: urls,
  };
}

function readKey(root) {
  const names = readdirSync(join(root, 'public')).filter((name) => /^[0-9a-f]{32}\.txt$/.test(name));
  if (names.length !== 1) throw new Error(`expected one public/<32 hex>.txt IndexNow key, found ${names.length}`);
  const key = readFileSync(join(root, 'public', names[0]), 'utf8').trim();
  if (key !== names[0].slice(0, -4)) throw new Error('IndexNow key file does not match its name');
  return key;
}

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const key = readKey(root);
  const response = await fetch(SITEMAP_URL);
  if (!response.ok) throw new Error(`sitemap ${response.status}`);
  const urls = urlsFromSitemap(await response.text());
  if (!urls.length) throw new Error('sitemap has no URLs');
  const posted = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(indexNowBody({ key, urls })),
  });
  const text = await posted.text();
  console.log(`${posted.status} ${text}`.trim());
  if (posted.status !== 200 && posted.status !== 202) process.exitCode = 1;
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
