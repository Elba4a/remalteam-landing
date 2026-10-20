#!/usr/bin/env bash
# Renders the static hero fallback (WebP) from the live 3D scene (assets/scene.js ?still).
# Run after any change to scene.js, before deploying:  ./landing-3d/scripts/render-hero-fallback.sh
# Needs: Google Chrome, node >= 22 (global WebSocket), python3, cwebp.
# Writes public/assets/hero/hero-{portrait-{390,780},landscape-{1280,2048}}.<hash>.webp, removes the old
# ones, rewrites the filenames in public/index.html, and fails if a file is over its size limit.
set -euo pipefail

cd "$(dirname "$0")/.."
PUB=public
OUT=$PUB/assets/hero
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
LIMIT_PORTRAIT=35000    # bytes, hero-portrait-780 (spec: <= 35KB)
LIMIT_LANDSCAPE=70000   # bytes, hero-landscape-2048 (spec: <= 70KB)

for c in node python3 cwebp; do command -v $c >/dev/null || { echo "missing: $c" >&2; exit 1; }; done
[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME (set CHROME=...)" >&2; exit 1; }

TMP=$(mktemp -d)
PAGE=$PUB/.render-hero.html   # temporary render target, same origin as scene.js; also in .assetsignore
cleanup() {
  kill ${SRV:-} ${CHR:-} 2>/dev/null || true
  wait 2>/dev/null || true   # Chrome keeps writing its profile until it exits
  rm -rf "$TMP" "$PAGE"
}
trap cleanup EXIT

cat > "$PAGE" <<'HTML'
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#1C1D21}#stage{position:fixed;inset:0}#stage canvas{position:absolute;inset:0;width:100%;height:100%}</style>
</head><body><div id="stage"></div>
<script type="module">import('/assets/scene.js').then((m) => m.start(document.getElementById('stage')));</script>
</body></html>
HTML

PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$PUB" >/dev/null 2>&1 & SRV=$!


"$CHROME" --headless=new --remote-debugging-port=0 --user-data-dir="$TMP/profile" \
  --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars --mute-audio \
  --no-first-run --no-default-browser-check about:blank >/dev/null 2>&1 & CHR=$!

for _ in $(seq 100); do [ -s "$TMP/profile/DevToolsActivePort" ] && break; sleep 0.1; done
CDP_PORT=$(head -1 "$TMP/profile/DevToolsActivePort")

# Each shot renders at its final pixel size with DPR 1 (scene.js caps DPR at 1.75; composition depends only on aspect).
#   portrait: 390x844 composition, no film offset, distance 50   -> 780w, then 390w
#   landscape: hero box of a 1440x900 window (1440x828, 92vh), desktop camera (w > 1200) -> 2048w, then 1280w
node - "$CDP_PORT" "$PORT" "$TMP" <<'JS'
const [cdpPort, port, tmp] = process.argv.slice(2);
const shots = [
  { name: 'portrait', w: 780, h: 1688, q: 'still&fo=0&r=50' },
  { name: 'landscape', w: 2048, h: 1178, q: 'still' },
];
const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r, j) => {
  pending.set(++id, (m) => (m.error ? j(new Error(method + ': ' + m.error.message)) : r(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const { writeFileSync } = await import('node:fs');
for (const s of shots) {
  await send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/.render-hero.html?${s.q}` });
  const t0 = Date.now();
  for (;;) {
    const { result } = await send('Runtime.evaluate', { expression: 'document.documentElement.dataset.heroStill || ""', returnByValue: true });
    if (result.value === 'ready') break;
    if (Date.now() - t0 > 60000) throw new Error(s.name + ': scene never reported heroStill=ready');
    await new Promise((r) => setTimeout(r, 250));
  }
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${tmp}/${s.name}.png`, Buffer.from(data, 'base64'));
  console.log(`rendered ${s.name} ${s.w}x${s.h} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
ws.close();
JS

mkdir -p "$OUT"
rm -f "$OUT"/hero-*.webp
fail=0
enc() { # name src width limit
  local f="$TMP/$1.webp"
  cwebp -quiet -q 60 -m 6 -resize "$3" 0 "$TMP/$2.png" -o "$f"
  local hash size; hash=$(shasum -a 256 "$f" | cut -c1-8); size=$(wc -c < "$f" | tr -d ' ')
  mv "$f" "$OUT/$1.$hash.webp"
  # Point index.html at the new file (matches any previous hash of the same name)
  sed -i '' -E "s#/assets/hero/$1\.[0-9a-f]{8}\.webp#/assets/hero/$1.$hash.webp#g" "$PUB/index.html"
  local note=""; if [ -n "$4" ] && [ "$size" -gt "$4" ]; then note="  OVER LIMIT ($4)"; fail=1; fi
  printf '%-24s %7d bytes%s\n' "$1.$hash.webp" "$size" "$note"
}
enc hero-portrait-780 portrait 780 $LIMIT_PORTRAIT
enc hero-portrait-390 portrait 390 ""
enc hero-landscape-2048 landscape 2048 $LIMIT_LANDSCAPE
enc hero-landscape-1280 landscape 1280 ""
[ $fail = 0 ] || { echo "size limit exceeded" >&2; exit 1; }
echo "ok: $OUT, index.html updated"
