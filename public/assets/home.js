// Reveal on scroll
(function () {
  var els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px' });
  els.forEach(function (e) { io.observe(e); });

  // Floating WhatsApp button once the hero is out of view (phones only via CSS)
  var fab = document.getElementById('fab');
  new IntersectionObserver(function (e) { fab.hidden = e[0].isIntersecting; }).observe(document.querySelector('.hero'));
})();

// 3D hero: only on capable desktops, never with reduced motion or data saver
(function () {
  var mq = matchMedia('(prefers-reduced-motion: reduce)');
  var conn = navigator.connection || {};
  if (mq.matches || conn.saveData || innerWidth < 1024 || (navigator.hardwareConcurrency || 4) < 4) return;
  try { var c = document.createElement('canvas'); if (!(c.getContext('webgl2') || c.getContext('webgl'))) return; } catch (e) { return; }
  var go = function () { import('/assets/scene.js').then(function (m) { m.start(document.getElementById('stage')); }).catch(function () {}); };
  var idle = window.requestIdleCallback || function (f) { setTimeout(f, 200); };
  if (document.readyState === 'complete') idle(go, { timeout: 1500 }); else addEventListener('load', function () { idle(go, { timeout: 1500 }); });
})();
