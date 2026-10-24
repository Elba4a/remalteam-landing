// www.remalteam.com -> remalteam.com (301).
// Retired rentals: /rent, /rent/ and /rent/* -> / (301).
// run_worker_first is true, so public/_redirects would not run; this Worker is the redirect.
// Everything else is served from public/.
export default {
  fetch(request, env) {
    const url = new URL(request.url);
    const canonicalHost = url.hostname === 'www.remalteam.com';
    const retiredRent = url.pathname === '/rent' || url.pathname.startsWith('/rent/');
    if (canonicalHost) url.hostname = 'remalteam.com';
    if (retiredRent) url.pathname = '/';
    if (canonicalHost || retiredRent) return Response.redirect(url.toString(), 301);
    return env.ASSETS.fetch(request);
  },
};
