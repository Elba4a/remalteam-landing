import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('..', import.meta.url).pathname;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'vendor' || name === 'hero' || name === 'node_modules') continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, out);
    else if (/\.(html|js|mjs|css|json|txt|xml|md)$/.test(name)) out.push(path);
  }
  return out;
}

test('build pages', () => {
  execFileSync(process.execPath, ['scripts/build-pages.mjs'], { cwd: root, stdio: 'pipe' });
});

test('built lead page and scripts contain no instalment calculator', () => {
  const page = readFileSync(join(root, 'public/mortgage-calculator/index.html'), 'utf8');
  const messageJs = readFileSync(join(root, 'public/assets/rtf1-message.js'), 'utf8');
  const formJs = readFileSync(join(root, 'public/assets/rtf1-form.js'), 'utf8');
  const bundle = `${page}\n${messageJs}\n${formJs}`;

  assert.equal(existsSync(join(root, 'public/assets/mortgage-calc.js')), false);
  assert.match(page, /src="\/assets\/rtf1-form\.js"/);
  assert.match(page, /تذهب البيانات إلى واتساب المكتب فقط/);
  assert.match(page, /ابعث بياناتك ويتواصل معك مستشار التمويل/);
  assert.doesNotMatch(page, /mortgage-calc\.js/);
  assert.equal(page.split('لو حاب أحد من موظفينا يساعدك').length - 1, 2);
  assert.match(page, /<summary>بيانات إضافية \(اختياري\)<\/summary>/);
  const directs = [...page.matchAll(/<a class="btn btn-gold rtf-direct" href="([^"]+)" target="_blank" rel="noopener">/g)];
  assert.equal(directs.length, 2);
  const greetings = directs.map(([, href]) => decodeURIComponent(href.split('?text=')[1]));
  assert.deepEqual(greetings, [
    'السلام عليكم، أبغى مساعدة في التمويل.',
    'السلام عليكم، أبغى مساعدة في التمويل.',
  ]);
  for (const greeting of greetings) assert.equal(greeting.startsWith('#RTF1'), false);

  const banned = [
    /مجاناً/,
    /حاسبة/,
    /احسب/,
    /القسط/,
    /نسبة الربح/,
    /calc-out/,
    /<output/,
    /mortgage-calc\.js/,
    /instalment/i,
    /\/\s*1200/,
    /\*\*\s*-/,
    /Math\.pow/,
    /toLocaleString/,
    /eligibility/i,
  ];
  for (const pattern of banned) assert.doesNotMatch(bundle, pattern, String(pattern));

  for (const src of [messageJs, formJs]) {
    assert.doesNotMatch(src, /\bfetch\s*\(|localStorage|sessionStorage|indexedDB|sendBeacon|XMLHttpRequest|gtag\s*\(|fbq\s*\(/);
    assert.doesNotMatch(src, /الراجحي|الأهلي|الإنماء|البلاد|الجزيرة|الفرنسي/);
  }

  const llms = readFileSync(join(root, 'public/llms.txt'), 'utf8');
  const entry = llms.split('\n').find((line) => line.includes('/mortgage-calculator/'));
  assert.ok(entry);
  assert.match(entry, /طلب التمويل/);
  assert.doesNotMatch(entry, /حاسبة|مجاناً|احسب/);

  const sitemap = readFileSync(join(root, 'public/sitemap.xml'), 'utf8');
  assert.match(sitemap, /<loc>https:\/\/remalteam\.com\/mortgage-calculator\/<\/loc><lastmod>2026-10-24<\/lastmod>/);

  const nav = readFileSync(join(root, 'public/index.html'), 'utf8');
  assert.match(nav, /href="\/mortgage-calculator\/">طلب التمويل</);
  assert.doesNotMatch(nav, /حاسبة التمويل/);
});

test('public copy no longer says مجاناً or calls the page a calculator', () => {
  const files = [...walk(join(root, 'public')), ...walk(join(root, 'content'))];
  const hits = [];
  for (const path of files) {
    const text = readFileSync(path, 'utf8');
    if (text.includes('مجاناً') || text.includes('حاسبة')) hits.push(path.slice(root.length));
  }
  assert.deepEqual(hits, []);
});
