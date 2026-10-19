// www.remalteam.com -> remalteam.com (301); everything else is served from public/.
export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.remalteam.com') {
      url.hostname = 'remalteam.com';
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
