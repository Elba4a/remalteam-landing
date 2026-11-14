// www.remalteam.com -> remalteam.com (301).
// Retired rentals: /rent, /rent/ and /rent/* -> /sale/ (301).
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

export default {
  fetch(request, env) {
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
    const asset = env.ASSETS.fetch(request);
    if (url.pathname !== UNITS_FEED_PATH) return asset;
    return Promise.resolve(asset).then(unitsFeedHeaders);
  },
};
