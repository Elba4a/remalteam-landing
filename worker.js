// www.remalteam.com -> remalteam.com (301).
// Retired rentals: /rent, /rent/ and /rent/* -> /sale/ (301).
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
