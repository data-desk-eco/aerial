#!/usr/bin/env bash
# vendor the third-party half of web/: maplibre, duckdb-wasm-lite, inter, the
# data desk design system and burnoff's wasm detector. everything else under
# web/ is first-party.
set -euo pipefail

VENDOR=web/vendor
DD_DIST="${DD_DIST:-$HOME/Tools/design/dist}"
BURNOFF="${BURNOFF:-$HOME/Tools/burnoff}"   # after `make wasm` there
DUCKDB_TAG="v2.0.0-lite.1"   # DuckDB data engine release
grep -q "DUCKDB_RELEASE = '$DUCKDB_TAG'" web/shell/engine.js

rm -rf "$VENDOR"
mkdir -p "$VENDOR/fonts"

ML=https://unpkg.com/maplibre-gl@5.1.0/dist/maplibre-gl
echo "maplibre-gl@5.1.0 ..."
curl -sLo "$VENDOR/maplibre-gl.js" "$ML.js"
curl -sLo "$VENDOR/maplibre-gl.css" "$ML.css"

echo "duckdb-wasm-lite $DUCKDB_TAG ..."
mkdir -p "$VENDOR/duckdb"
gh release download "$DUCKDB_TAG" -R data-desk-eco/duckdb-wasm-lite \
    -p 'duckdb-eh.wasm' -p 'duckdb-browser.mjs' \
    -p 'duckdb-browser-eh.worker.js' \
    -D "$VENDOR/duckdb" --clobber
# the guard is for the category error: a build that linked gdal and proj, or
# the stock npm wasm (35.96 MB). the lite build is 24.40 MB
[ "$(wc -c < "$VENDOR/duckdb/duckdb-eh.wasm")" -lt 30000000 ] || {
    echo "duckdb-wasm-lite: WASM exceeds 30 MB" >&2
    exit 1
}

echo "dd design system (from $DD_DIST) ..."
mkdir -p "$VENDOR/dd"
# dd.js is the kernel the app is built on; audit.js checks a page against it.
cp "$DD_DIST/dd.js" "$DD_DIST/audit.js" "$DD_DIST/style.dark.json" \
   "$DD_DIST/worldmap.js" "$DD_DIST/land.json" "$VENDOR/dd/"

echo "burnoff (from $BURNOFF/web) ..."
mkdir -p "$VENDOR/burnoff"
cp "$BURNOFF"/web/{burnoff.js,burnoff.wasm,worker.js,gpu.js,j2k.wgsl} \
    "$VENDOR/burnoff/"

echo "quack sdk 0.3.0 ..."
# the browser's quack client, for burnoff's service (live.js), and flechette,
# its one dependency, which it imports by name: pointed at the file here
mkdir -p "$VENDOR/quack"
NPM=https://registry.npmjs.org
curl -sL "$NPM/@quack-protocol/sdk/-/sdk-0.3.0.tgz" |
    tar xz -C "$VENDOR/quack" --strip-components 2 \
        package/dist/index.js package/dist/messages-BsNzlNiY.js
curl -sL "$NPM/@uwdata/flechette/-/flechette-2.7.1.tgz" |
    tar xz -C "$VENDOR/quack" --strip-components 2 package/dist/flechette.mjs
sed -i.bak 's#"@uwdata/flechette"#"./flechette.mjs"#' "$VENDOR/quack/index.js"
rm "$VENDOR/quack/index.js.bak"

echo "mediapipe tasks-vision 1.2.2 ..."
# the hand landmarker hands.js runs in a worker: the bundle, the wasm built
# as an es module (a module worker has no importScripts), the float16 model
mkdir -p "$VENDOR/mediapipe"
curl -sL "$NPM/@mediapipe/tasks-vision/-/tasks-vision-1.2.2.tgz" |
    tar xz -C "$VENDOR/mediapipe" --strip-components 1 \
        package/vision_bundle.mjs \
        package/wasm/vision_wasm_module_internal.{js,wasm}
curl -sLo "$VENDOR/mediapipe/hand_landmarker.task" \
    https://storage.googleapis.com/mediapipe-models/hand_landmarker/\
hand_landmarker/float16/1/hand_landmarker.task

echo "inter font ...
# a desktop chrome agent, so google serves woff2
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
UA+=' (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
# regular, bold and italic (pdf:22), over the weights the drawings measure at
AXES='ital,opsz,wght@0,14..32,300..800;1,14..32,300..800'
curl -sH "User-Agent: $UA" \
  "https://fonts.googleapis.com/css2?family=Inter:$AXES&display=swap" |
python3 -c "
import re, urllib.request, sys
css = sys.stdin.read()
out, i = '', 0
for block in re.split(r'(?=/\*)', css):
    if not block.strip().startswith('/* latin */'): continue
    url = re.search(r'url\((https://[^)]+\.woff2)\)', block)
    if not url: continue
    fname = f'inter-latin-{i}.woff2'
    urllib.request.urlretrieve(url.group(1), f'$VENDOR/fonts/{fname}')
    out += block.replace(url.group(1), fname) + '\n'
    i += 1
open('$VENDOR/fonts/inter.css', 'w').write(out)
print(f'  {i} latin font files')
"
