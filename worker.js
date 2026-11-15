// www.remalteam.com -> remalteam.com (301).
// Retired rentals: /rent, /rent/ and /rent/* -> /sale/ (301).
// /wa/google, /wa/tiktok, /wa/snap, /wa/site, and /wa/status (optional trailing slash)
// 302 to WhatsApp. GET and HEAD only. Each redirect writes one Workers Analytics
// Engine point on WA_CLICKS (dataset remal_wa_clicks): channel, path, UTC date,
// and request.cf.country. No IP, user agent, or query string. A missing binding
// does not change the redirect.
// Assets html_handling (auto-trailing-slash) redirects /units to /units/ with 307.
// There is no status setting for that redirect, so a slash-only 307/302 is reissued as 301.
// HTTP is not rewritten here. The zone "Always Use HTTPS" setting already returns 301
// before the Worker runs (http://remalteam.com/units → https://remalteam.com/units).
// run_worker_first is true, so public/_redirects would not run; this Worker is the redirect.
// The units feed also gets its CORS and cache headers here: with run_worker_first,
// headers have to be attached on the response the Worker returns. The same rule
// is declared in public/_headers.
// Everything else is served from public/.
const UNITS_FEED_PATH = '/units/index.json';
const UNITS_FEED_ORIGIN = 'https://calc.remalteam.com';

// 302, not 301, so these targets can change. Location values are already encoded.
const WHATSAPP_REDIRECTS = {
  '/wa/google': 'https://wa.me/966535330034?text=%D8%A7%D9%84%D8%B3%D9%84%D8%A7%D9%85%20%D8%B9%D9%84%D9%8A%D9%83%D9%85%D8%8C%20%D8%AC%D9%8A%D8%AA%D9%83%D9%85%20%D9%85%D9%86%20%D9%82%D9%88%D9%82%D9%84',
  '/wa/tiktok': 'https://wa.me/966535330034?text=%D8%A7%D9%84%D8%B3%D9%84%D8%A7%D9%85%20%D8%B9%D9%84%D9%8A%D9%83%D9%85%D8%8C%20%D8%AC%D9%8A%D8%AA%D9%83%D9%85%20%D9%85%D9%86%20%D8%AA%D9%8A%D9%83%20%D8%AA%D9%88%D9%83',
  '/wa/snap': 'https://wa.me/966535330034?text=%D8%A7%D9%84%D8%B3%D9%84%D8%A7%D9%85%20%D8%B9%D9%84%D9%8A%D9%83%D9%85%D8%8C%20%D8%AC%D9%8A%D8%AA%D9%83%D9%85%20%D9%85%D9%86%20%D8%B3%D9%86%D8%A7%D8%A8',
  '/wa/site': 'https://wa.me/966535330034?text=%D8%A7%D9%84%D8%B3%D9%84%D8%A7%D9%85%20%D8%B9%D9%84%D9%8A%D9%83%D9%85%D8%8C%20%D8%AC%D9%8A%D8%AA%D9%83%D9%85%20%D9%85%D9%86%20%D8%A7%D9%84%D9%85%D9%88%D9%82%D8%B9',
  '/wa/status': 'https://wa.me/966535330034?text=%D8%A7%D9%84%D8%B3%D9%84%D8%A7%D9%85%20%D8%B9%D9%84%D9%8A%D9%83%D9%85%D8%8C%20%D8%AC%D9%8A%D8%AA%D9%83%D9%85%20%D9%85%D9%86%20%D8%AD%D8%A7%D9%84%D8%A9%20%D9%88%D8%A7%D8%AA%D8%B3%D8%A7%D8%A8',
};

// blob1/index1 channel, blob2 path, blob3 UTC date, blob4 country, double1 1.
function canonicalWhatsappPath(pathname, method) {
  if (method !== 'GET' && method !== 'HEAD') return '';
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return Object.hasOwn(WHATSAPP_REDIRECTS, path) ? path : '';
}

function whatsappRedirect(pathname, method) {
  const path = canonicalWhatsappPath(pathname, method);
  if (!path) return null;
  return new Response(null, {
    status: 302,
    headers: {
      Location: WHATSAPP_REDIRECTS[path],
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    },
  });
}

function recordWhatsappClick(env, ctx, request, path) {
  const dataset = env && env.WA_CLICKS;
  if (!dataset || typeof dataset.writeDataPoint !== 'function') return;
  const channel = path.slice('/wa/'.length);
  const country = request.cf && typeof request.cf.country === 'string' ? request.cf.country : '';
  const point = {
    indexes: [channel],
    blobs: [channel, path, new Date().toISOString().slice(0, 10), country],
    doubles: [1],
  };
  // writeDataPoint returns immediately. Keep it off the response path anyway:
  // a missing binding, a throw, or a rejected write must not change the 302.
  const task = Promise.resolve().then(() => {
    try {
      return dataset.writeDataPoint(point);
    } catch {
      return undefined;
    }
  }).then(() => {}, () => {});
  try {
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(task);
  } catch {
    // The write is already scheduled. Swallow a broken waitUntil.
  }
}

function unitsFeedHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', UNITS_FEED_ORIGIN);
  headers.set('Cache-Control', 'public, max-age=300');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// True when Location only adds or removes a trailing slash on the same origin and query.
function slashOnlyLocation(requestUrl, location) {
  if (!location) return '';
  let target;
  try {
    target = new URL(location, requestUrl);
  } catch {
    return '';
  }
  const from = new URL(requestUrl);
  if (target.origin !== from.origin || target.search !== from.search) return '';
  const strip = (path) => (path.length > 1 ? path.replace(/\/+$/, '') : path);
  if (strip(from.pathname) !== strip(target.pathname) || from.pathname === target.pathname) return '';
  return target.toString();
}

function permanentSlashRedirect(requestUrl, response) {
  if (response.status !== 307 && response.status !== 302) return null;
  const location = slashOnlyLocation(requestUrl, response.headers.get('Location'));
  if (!location) return null;
  const headers = new Headers(response.headers);
  headers.set('Location', location);
  return new Response(null, { status: 301, statusText: 'Moved Permanently', headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const canonicalHost = url.hostname === 'www.remalteam.com';
    const retiredRent = url.pathname === '/rent' || url.pathname.startsWith('/rent/');
    if (canonicalHost) url.hostname = 'remalteam.com';
    if (retiredRent) url.pathname = '/sale/';
    if (canonicalHost || retiredRent) return Response.redirect(url.toString(), 301);
    const waPath = canonicalWhatsappPath(url.pathname, request.method);
    if (waPath) {
      recordWhatsappClick(env, ctx, request, waPath);
      return whatsappRedirect(url.pathname, request.method);
    }
    if (url.pathname === UNITS_FEED_PATH && request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': UNITS_FEED_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Max-Age': '300',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }
    const asset = await env.ASSETS.fetch(request);
    const slash = permanentSlashRedirect(request.url, asset);
    if (slash) return slash;
    if (url.pathname !== UNITS_FEED_PATH) return asset;
    return unitsFeedHeaders(asset);
  },
};
