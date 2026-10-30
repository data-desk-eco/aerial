# aerial

one map of two ways the oil and gas industry puts carbon into the air: gas it
burns and gas it leaks. flaring is Sentinel-2 archive clusters (S2) and VIIRS
Nightfire looks (VNF), a layer each and both drawn at once; methane plumes are
the third layer. one quarter grid sets the date window for all three, and a
quarter greys only when no layer covers it.

aerial reads parquet off the Data Desk archive with DuckDB and draws it, and does
nothing else: no detection, no publishing, no live third-party api. the one
exception is `/review`, behind cloudflare access: a person's verdict on each
new attribution goes to `worker/review.js`, and the jump host folds it into the
archive. the map shows a claim from a later run only once it is confirmed.

`web/config.js` is the declaration `mount()` takes; everything aerial-specific
lives in the hook modules it wires in. `web/shell/` is the map shell,
first-party since 2026-08-17 (it was the cartograph library): change it here,
and delete what only a second consumer would have wanted.

zero npm dependencies. MapLibre GL and DuckDB-Wasm lite are vendored; everything
else is browser built-ins.

**the engine does the work.** aerial's js is a thin layer between maplibre and
the archive: a reader builds one statement, the engine filters, windows,
reduces, rates, names, joins and orders, and the rows come out as the map's
properties (`fc()`). the lite build carries spatial (`ST_Distance_Sphere`,
`ST_Contains`, `ST_Normalize`) and h3 (`h3_latlng_to_cell_string`,
`h3_polygon_wkt_to_cells_experimental_string`), so geometry and the archive's
cells are sql too. what the session holds, the engine holds, as a table, not
a js array: `terminals`, `plume_index`, `site_view`; and the ranges it read,
which a repeated read is answered from. js keeps the dom and the map. a loop
over rows in js is a statement not yet written.

## the brand

the ui is built on `vendor/dd/dd.js`, the kernel the data desk `design`
repository compiles from mikael dahlén's guidelines: `dd-panel`, `dd-key`,
`dd-row`, `dd-btn`, `dd-dot`, `dd-slider`, `dd-toggle`, `dd-label`,
`dd-logo`, which draw their own chrome in shadow roots, and the basemap,
markings and graded imagery. aerial css places and sizes them and styles what
it puts in them, in `--dd-*` tokens only. `make audit` runs
`vendor/dd/audit.js` over the intro, the map and a card, and fails on any
deviation not declared in `AUDIT` (`layers.js`): the data rasters. a new deviation is a line there, argued in its comment.
change the elements in the design repository, never in vendor/.

## the three families

**flaring.** `flaring/flares.js` is both families: a statement per window,
the whole world, over `data-desk/flares` (S2 clusters) or `eog/flares` (VNF
sites), one row per site with its quarterly history nested in `quarters`, both held as engine
buffers. the per-date series, `data-desk/detections` and `eog/detections`, is
read per site on card open. every eog detections row is a positive detection;
the looks that found nothing are `eog/observations`, which aerial does not read
(see invariants). the S2 methodology is s2-flares, run in the etl; aerial is a
viewer. a pan reads nothing: every family is drawn whole and maplibre
draws what is in view. below z5 all three are one clustered source, every
point a cluster (60k markers placed each frame made the globe crawl), drawn
as a hairline ring on a log of its count, coloured by the mean band
(`band`, `layers.js`) of what it holds; from z5
each family draws every point (S2 is 631 sites in 47 ms, VNF 21k in 0.4 s; per viewport, flares
lagged and churned the card).

both are named after the export LNG terminal they sit on, where one is within
7.5 km: `loadTerminals` fills the `terminals` table off `gem/infrastructure`
on the card lane, and a site drawn before it lands is renamed on the next
refresh.

**methane.** `methane/plumes.js` reads every provider's plume detections for
the ticked window, the wind at the plume among them (`wind_ms`,
`wind_from_deg`, extension columns the etl takes from each producer's own
wind; sron has none). `methane/attribution.js` stamps ch4id's attributions on,
`methane/candidates.js` reads the `infrastructure` tables around an open plume
card and nowhere else (there is no standing infrastructure layer),
`methane/overlay.js` drapes a Data Desk probability surface, and `methane/mask.js`
reads the open plume's outline from its provider's `masks`.

no module names an archive object. `<meta name="data-bucket">` gives the bucket
and `index.json` says which object each table is and whether it is partitioned,
so a table that starts partitioning does not break a reader. its `sizes` say
what each object weighs and which partitions a table holds (`bytes()`,
`shell/archive.js`): a hint, listed as the archive publishes.

**live s2 (experimental, branch burnoff-live).** on this branch s2 is the
live layer alone: the archive's s2 sites are not read or drawn, and the ui
says hotspots, not flares. `flaring/live.js` is the one exception to
"detects nothing": burnoff's detector, as wasm in `vendor/burnoff/` (built
by `make wasm` in `~/Tools/burnoff`), reads google's sentinel-2 mirror in
two workers per core, at most two per GB of `deviceMemory`, and four on a
touch-first device: a worker's wasm heap keeps its largest read (25-40 MB
over a phone's view, up to 135 MB over a desktop's), and sixteen crashed a
phone's tab.

the search belongs to the ground, not the view. from z12 (LIVE_ZOOM) each
0.05° square in view wants every scene of its tiles in the last year: the
last 30 days' first, then the rest coarse to fine in time (the newest of
each month, then the middle of the month, then halving the gaps), so most
flares are drawn early and the last reads only complete the year (`ranks`).
reads are scored by place (in view, then within a view's width, at least
0.5°, then paused), then rank, then rings out from the centre, then newest;
one scene is read over every square wanting it. a found site has its year
read around it too, a small read ranked just behind the sweeps of the same
rank, and a scene its square was swept in counts as a look at it. a pan or
zoom re-scores the wants and drops only sweeps now beyond the margin.
nothing is kept in indexeddb: the service's store is the cache, and the
browser's http cache keeps its answers (max-age a day for a window closed
before today, else an hour). a z12 permian view
read its recent scenes in ~12 s and the year in ~130 s (360 sweeps, ~10 MB
each over a clear view), headless on an m2.

the page's thread is the map's. no read starts while the map moves or until
it has been still for half a second (a read started between two drags held
every core through the second); the read-ahead fetches run in their own
worker (`flaring/ahead.js`); a live update waits for the map to stop and
re-sets only its own source unless its set of points changed (`setSource`:
re-clustering 60k points at every read made pans judder), and the clusters,
drawn only below NEAR, are re-set on the way out. the next read is chosen
as a worker comes free, the squares' wants kept by scene until a sweep
lands, a tile is listed or the view moves.

an open card reads its site's last 90 days in one request of burnoff's
service (`API`, its `serve/` on the jump host, which answers off the archive
where it holds the scene and reads the jp2s in region where not; `?api=` on
the page names another, empty reads here), and a scroll past its rows' end
90 more once those are in (`older()`); the view's search reads here.

a site is every date's detections linked within 40 m, never two of one
date over 30 m apart (burnoff's `serve/sites.sql`), named by its
detections' mean place rounded to 40 m (`live:<lat>,<lon>`), the same
for any block or window; as the store fills, the mean can cross a
rounding edge, so a site joins one held within 40 m (the
fallback's detections, within 100 m; a link falls back to the site
nearest its place), and a look is clear
under 0.6 cloud, as in the archive. it is drawn as the archive's are, lit on
two dates with its mean b12 over MODE.s2.floor, unless lit only in its
hemisphere's summer (the archive's `seasonal`, april to august in the
north): roofs and solar panels that catch a high sun, which the detector's
heat test (b8a against b12, burnoff's AGENTS.md) cannot tell from a fire. in
a year of scenes the heat test took london from ~2000 drawn sites to 87 and
the summer rule to 54; madrid 704, 114, 43; the permian's sites by a viirs
flare 327, 308, 301. kind `live` draws, clusters and filters as an s2 site
(`key.js`, `layers.js` band, FAMILIES) and opens the s2 card
(`card/flare.js`), named by every detection it lists, cloudy ones too, whose title says Loading…
in grey until every scene of the year has looked at the site (`loading`), and where a date draws the detector's
own pixels, each on the ramp by its b12 inside a hairline outline, as a
plume mask is drawn. the table's s2 tab says Detections loading, not No rows
in view, while the view's search is not done (`busy`; a live redraw
sends `fx-rows`). one line at the map's top right says what is still being
read, the newest read's (`status`, `shell/ui.js`): the engine at start, each
layer's read, and the view's live search, Recent S2 hotspots: x%, then Older
S2 hotspots: x% (each the mean over the view's squares of their scenes read,
so it moves with every read, never falls while the view is still and is the
same at every zoom), kept up 3 s once both are done; at z10-11 it says Zoom
in to detect S2 hotspots. its lines carry no ellipsis. the ground not yet
read through is hatched (layer `unread`), fainter as its scenes are read. the reads
for a view ask `viewportBbox` (`shell/map.js`), the canvas less the table
drawer's padding, and a drag of the drawer reads again as a move does. no
live read starts out past LIVE_ZOOM: one in flight finishes, and the rest
wait until the view is back. a hotspot card dims the imagery around its site, not each
date's own point, which lit some dates and darkened others.

from z10 each hotspot carries its instrument, S2 or VNF, up and right of
it: an image set in the page's inter at 300 (`ensureTag`, `shell/map.js`)
in a layer of its own over the family's source (`tagLayer`, `layers.js`),
as gl text takes only the basemap's sdf glyphs, which are not inter. the
intro names the three groups of facilities whose outlines the map holds, as
text. the old burnoff map (`~/Tools/burnoff-map`) did
this with l2a cogs, a stac search, every band of every 256 px block of every
scene, and a crdt shared over webrtc.

## layout

```
web/
  config.js          the declaration: sources, layers, the one refresh path,
                     quarter availability, the table's tabs, deep links
  layers.js          marking / ramp / colour policy and the key's bands.
                     shape categorises, colour is measurement
  key.js             the key: a group of bands per family
  sites.js           data-desk/sites, the outlines a detection sits in
  card/              one header, one body per feature kind
    index.js         the registry, the shared series card,
                     reselectCurrentFeature
    overlays.js      the open card's map overlays
    chart.js         the intensity chart
    flare.js vnf.js plume.js   the bodies
  flaring/
    render.js        MODE: the scale each instrument reads on, the S2 floor
    flares.js        both families in sql: the reducer, s2() and vnf(),
                     the terminals, availability, coverage(), the series
  methane/           plumes.js reader, attribution.js, candidates.js,
                     overlay.js, mask.js
  shell/             app.js mount, map.js, ui.js, detail.js, table.js,
                     quarters.js, data.js reads, engine.js the duckdb
                     worker, archive.js index, util.js
  review/            the /review page: index.html and review.js
  vendor/            dd kernel (dd.js, audit.js) and basemap, duckdb,
                     maplibre, inter (300-800, italic)
worker/              the review api and its d1 schema
scripts/             vendor.sh, dist.sh, serve.py
test/                the rate rules: flares.js's sql, in the duckdb cli
```

## commands

```bash
make serve     # static server on :8000
make test      # the rate rules (node --test, needs duckdb with spatial)
make audit     # the ui against the brand, headless (needs ~/data-desk browse)
make vendor    # re-vendor maplibre, duckdb, the dd kernel, inter
make dist      # the pages artifact, assertions and all
```

no `npm install`, and no build step. examine DOM logic in the browser
(`skills/browser/browse` in `~/data-desk`), not only in the tests.

## invariants

these were arrived at through production incidents. several are one refactor
away from being broken silently, and they compile and run either way.

**persistence is a ratio, so guard both halves.** numerator and denominator
must cover the same looks. `clear` is the cloud-free look count persistence
divides by; `observations` is every look. the only numerator that pairs with
`clear` is `detections_clear`. never divide `detections` by `clear` — that
broke `lng-flaring` — and reading `observations` where `clear` belongs
silently redefines persistence.

**one reducer.** both families go through `reduce` in `flaring/flares.js`, a
subquery over `unnest(quarters)`. it returns null, not 0, for any field absent
from any quarter in the window (`count(q.x) = count(*)`): summing that as zero
turns "we never counted the passes" into "no pass was ever made". keep it the
single path.

**do not wire through the published `persistence` column** for the card's
rate: the app recomputes over exactly the ticked quarters, and the published
value would stop the quarter picker affecting the number. its use is as the
gate's `rank` fallback (`flares.js`), a different question.

**the two null branches stay split.** in S2 a null persistence is unrated and
passes the gate; in VNF it is a finding — no clear night — and the flare is
dropped. the split is in `readS2` and `readVNF` (`flares.js`): S2 has no
persistence gate, VNF keeps `persistence IS NOT NULL`. it is sql, not a layer
filter, because a cluster counts what its source holds. the old slider at
0.25 sank the whole archive when S2 coalesced to 0. (on burnoff-live
`readS2` is gone with the archive's s2 layer; a live site with no rate is
drawn, as an archive one was.)

**intensity is the key's.** there is no persistence slider: it only hid
flares. B12 reflectance and radiant heat
are not one scale. `MODE.s2.floor` is the published quality gate (a constant,
on the site's *average*; VNF has none), and the key's rows filter above it, on
the *maximum*, at exactly the breaks `flareIcon` steps at — `flareBands` in
`layers.js` keeps the two in step. a row passes a feature it is no statement
about (`p.kind !== kind || …`, `key.js`), so switching a group off drops that
family and nothing else.

**floors:** `MIN_LOOKS = 10` for S2, `COVERAGE_MIN = 0.8` for VNF, both in
`flares.js`. below them, publish no rate; the card shows an em dash.

**`reselectCurrentFeature()` is load-bearing.** every dot carries the numbers
for the ticked quarters alone, and an open card holds a copy. every layer
refreshes through the one `refresh(id)` in `config.js`, which ends in it; a
new layer goes in `READS` and gets that for free. a card reads no layer but
its own: when only others moved, its re-render is a no-op (detail.js compares
properties, rightly — a rebuild would drop the reader's selected date).

**units and types.** MCM/d is `rh_mw × 0.0315` (JZ-RH, Zhizhin et al. 2025);
`RH_TO_MCM` in `flaring/render.js` is the only place it is spelled. EOG's own
`flow_mcm` must never be displayed — the legacy power law overestimates dim
flares and underestimates bright ones. identifiers are VARCHAR in every table;
never coerce with `Number()` (`card/index.js` compares `String(id)`), and never
match on coordinates: an 11 m match handed two close sites each other's card.

**the cell is computed in sql, never in js.** a card that names a partitioned
object asks the engine for the cell of the position it holds
(`h3_latlng_to_cell_string(lat, lon, 1)`, as the etl's `cell()`), and a read
around a rect asks for the cells the rect overlaps; nothing plumbs `cell`
through a feature builder, and no js reimplements h3.

**aerial does not read `eog/observations`, deliberately.** the quarters list
already carries the looks, windowed the same way as the numerator. a second
read is a second place to get the pairing wrong.

**at dense complexes:** sum radiant heat across detection points rather than
averaging, always check `n_sats`, and read a day with files but no detections
as cloud, not as zero activity (`docs/ras-laffan-monitoring.md`).

**the negation in the S2 intensity gate is deliberate.**
`NOT coalesce(f.avg_b12 < floor, false)` (`readS2`) lets a cluster the table
gives no intensity for through: `avg_b12 >= 0.85` is null for such a row, and
a null WHERE drops it. (main only: burnoff-live reads no archive s2.)

**VNF has no intensity floor.** a 3 MW floor on the average hid every dim
flare — most onshore gas plants, and the LNG trains at Darwin and Ichthys.
persistence is VNF's only gate.

**`flareIcon` coalesces a missing value to `stops[0]`** (`layers.js`): a site
with no value flattens the ramp rather than vanishing. a plume is the other way
round: no rate is not a low rate, so it is grey, off the ramp and out of every
band.

**one ramp, three scales.** every family reads on the dd intensity ramp
(red → orange → white, the guidelines' own), each on its stops: B12, MW,
t/hr. the key's headings carry the units, and shape says burned or leaked:
the flare marking, the plume's diamond (the attributed source is a square).
colour never means provider or category.

**a lane is a connection, and the engine serialises each one.** statements on
one connection run one after another; on different connections they overlap
without touching each other's staged ranges. `sql()` and `read()` take a
`lane`, and `.query()` is called in exactly one place (bar each connection's
`SET geometry_always_xy`: the setting is per connection, and spatial's sphere
functions otherwise take (lat, lon)). the map is the default
lane and card opens (the mask and the attributions among them, and the
terminal read) are `lane: 'card'`: sharing one
made a pan wait for a card, 6.1 s against 1.3 s. a held table is shared by
every connection, so a statement that replaces one goes on the lane that reads
it (`site_view` on the map lane), and a lane is otherwise only a parallelism
choice. add one when work must not wait behind other work, never one per
provider.

**two read tiers, and size picks the tier.** every object under the 8 MB cap is
fetched whole at page parse, racing the engine download, and registered as an
engine buffer (`prefetchData`, `shell/data.js`); the index's `sizes` say
which, so nothing is asked twice. what is past it stays on ranged reads,
which is also every prefetch's fallback, and the engine keeps every range it
read (32 MB, least recently used): a reopened card is answered from memory,
and js holds no copy of its rows. do not put the first paint behind a ranged
read again (`docs/cold-load.md`). and nothing the first paint does not draw
shares the line with it: the attributions and the terminals wait for the
first paint, and the plume read leaves out `bounds` (nature trace's 7.6 MB of
wkt, 6.5 MB as geometry), which a data desk card reads for its one plume. a
phone on poor signal paid 17.7 MB of archive before its first plume; it pays
about 4.3.

**the engine is ~7 MB over the wire, and the first load after a deploy pays for
it.** one cold-edge load took over two minutes to mount where a warm one takes
about eight seconds. it is the deploy that is cold, not the map.

## the tables

the etl that publishes everything this map reads lives in `~/data-desk/etl`;
`sql/tables/` there holds the definitions and their `*.checks.sql`, which state
exactly what a reader may rely on.

- `data-desk/flares`, `data-desk/detections` — S2 clusters and their per-date
  series. flares carries `quarters`: `quarter, days, observations, clear,
  detections, detections_clear, rh_sum, rh_max`.
- `eog/flares`, `eog/detections` — VNF sites and their nightly detections, the
  same `quarters` struct. `eog/observations` exists and is not read here.
- `<provider>/detections` — methane plumes, `kind = 'plume'`, with `valid`
  false on a retrieval the producer does not trust, and `wind_ms`,
  `wind_from_deg` where the producer gives a wind.
- `<provider>/infrastructure` — candidate sources, one object per h3 res-1
  `cell` and Hilbert-clustered on lon/lat inside it; gem's is one object,
  as its `lng_terminal` rows name the flares the world over.
- `data-desk/attributions` — ch4id's plume → source contract.
- `data-desk/sites` — the osm outline of every industrial facility a flare
  or plume can come from (oil and gas, coal, steel, cement, power, waste),
  `outline` as geojson and a box. 88k rows, so read from z10 for the
  viewport padded a viewport each way, and read again only when the view
  leaves that box. an outline is drawn while a drawn detection is within
  `REACH` of it (`drawSites`, on `fx-filters`), and only the detections in
  the held box are asked: all 40k plumes made it 10 s against 5 ms, which
  held the engine and every lane behind it. it names no detection, so a
  flare's facility is what the reader sees it inside.
