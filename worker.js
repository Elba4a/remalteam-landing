// www.remalteam.com -> remalteam.com (301).
// Retired rentals: /rent, /rent/ and /rent/* -> /sale/ (301).
// /wa/google and /wa/tiktok (optional trailing slash) 302 to WhatsApp. GET and HEAD only.
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
};

function whatsappRedirect(pathname, method) {
  if (method !== 'GET' && method !== 'HEAD') return null;
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const location = WHATSAPP_REDIRECTS[path];
  if (!location) return null;
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    },
  });
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
  async fetch(request, env) {
    const url = new URL(request.url);
    const canonicalHost = url.hostname === 'www.remalteam.com';
    const retiredRent = url.pathname === '/rent' || url.pathname.startsWith('/rent/');
    if (canonicalHost) url.hostname = 'remalteam.com';
    if (retiredRent) url.pathname = '/sale/';
    if (canonicalHost || retiredRent) return Response.redirect(url.toString(), 301);
    const wa = whatsappRedirect(url.pathname, request.method);
    if (wa) return wa;
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
