# aerial

one map of two ways the oil and gas industry puts carbon into the air: gas it
burns and gas it leaks. flaring is hotspots: Sentinel-2 by day (S2) and
Sentinel-3 by night (S3), live off burnoff's service, and VIIRS Nightfire
looks (VNF) off the archive, a layer each and all drawn at once; methane
plumes are the fourth layer. one quarter grid sets the date window for all
of them, and a quarter greys only when no layer covers it.

aerial reads parquet off the Data Desk archive with DuckDB and burnoff's
service over quack, and draws them, and does nothing else: no publishing,
and no detection but s2's fallback (below). the one exception is
`/review`, behind cloudflare access: a person's verdict on each new
attribution goes to `worker/review.js`, and the jump host folds it into the
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

## the families

**vnf.** `flaring/flares.js` is a statement per window, the whole world,
over `eog/flares`, one row per site with its quarterly history nested in
`quarters`, held as an engine buffer. the per-date series, `eog/detections`,
is read per site on card open. every eog detections row is a positive
detection; the looks that found nothing are `eog/observations`, which aerial
does not read (see invariants). a pan reads nothing: vnf and the plumes are
drawn whole and maplibre draws what is in view. below z5 every family is
one surface, `heat` (`heat.js`; 60k markers placed each frame made the
globe crawl): one statement grids every
point the key passes into one grid of mercator cells (2^12 to the world,
4 px at z4) at every zoom, each lighting the 3×3
around its own at the mean band (`band`, `layers.js`) of what lights it,
drawn opaque on the ramp with a 1 px white outline, the edges only one cell
has, as a plume mask is; from z5
each family draws every point (VNF 21k in 0.4 s; per viewport, flares
lagged and churned the card).

vnf sites are named after the export LNG terminal they sit on, where one is
within 7.5 km: `loadTerminals` fills the `terminals` table off `gem/infrastructure`
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

**live s2 and s3.** the sentinels are live layers: the archive's s2
clusters (`data-desk/flares`) are not read, and the ui says hotspots, not
flares. s2 by day and s3 by night are both drawn, in one key group with vnf
(`S2/S3/VNF hotspots`). a `#flare=` link waits for the view's reads to hold
its site (`until`).

both come from burnoff's service (its `serve/` on the jump host, at
`https://dev.datadesk.eco`, `?api=` on the page naming another) over
duckdb's quack protocol: `FROM sites(w, s, e, n, 'a', 'b')` for s2 and
`s3_sites` for s3, each one row of geojson (`flaring/service.js`, the
`@quack-protocol/sdk` client vendored in `vendor/quack/` with flechette,
its one dependency, loaded on the first call; a pool of four connections,
as the client queues a connection's statements; `fetch` passed bound, as
the client calls it as its own method and a browser refuses that). the
service reads the scenes off eodata in region and keeps them, so a view it
has read answers in under a second. `flaring/live.js` is one module for
both: `live(spec)` makes an instrument (`s2`, `s3`), and the specs hold
what differs. s2 is read from z12 in 0.1° blocks, s3 from z9 in 0.5°
blocks (the service takes up to 1°: it reads a granule once for all a
box's cells); each block asks the last 30 days 10 at a time, then back to
180 days a month at a time, the view's middle first, four in flight. an
open card asks its site's last 90 days, and a scroll past its rows' end
90 more, back to 2022-01-25 (s2) or 2018-06-01 (s3). where the service
fails, s2 falls back to burnoff's detector in the browser (`fallback.js`,
`vendor/burnoff/`, google's sentinel-2 mirror); s3 has none. `?asof=`
reads as if on a past date, for a service whose mirror stops short of
today (a local one off meeo's).

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
flare 327, 308, 301. kind `s2` (its ids still `live:`, as the service
names them) draws, clusters and filters on s2's stops (`key.js`, `layers.js`
band) and opens the s2 card (`card/s2.js`, `liveBody` with s3's), named
by every detection it lists, cloudy ones too, whose title says Loading… in
grey until every scene of the year has looked at the site (`loading`), and
where a date draws the detector's own pixels, each on the ramp by its b12 inside a hairline outline, as a
plume mask is drawn. the table's s2 tab says Detections loading, not No rows
in view, while the view's search is not done (`busy`; a live redraw
sends `fx-rows`). one line at the map's top right says what is still being
read, the newest read's (`status`, `shell/ui.js`; `watch`, `live.js`): the engine at start, each
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

an s3 site is burnoff's `s3sites.sql`: hotspots linked within 750 m,
never two of one granule, named by the mean rounded to 250 m
(`s3:<lat>,<lon>`). the l1b places s3a ~250 m east of a flare and s3b
~350 m west (`docs/s3.md`), so the mean moves more than s2's as nights
come, up to 1 km for a site of few nights, while distinct sites stand 790 m
or more apart: a site joins one held within 600 m, never two of one answer
(`absorb`). a night is clear where the 0.02° square under the site was half
clear or more; a site is drawn lit on two nights; its radiant heat reads on
vnf's MW stops (its mean was 0.87 of vnf's at 432 sites in 2023 q1), and
its card (`card/s3.js`) shows planck's temperature where vnf's shows
MCM/d, as jz-rh is calibrated on viirs, and where a night draws a 500 m
pixel a hotspot as an s2 date draws its pixels: a flare is tens of metres,
so a cluster is one fire spread by the optics, and burnoff's `px` is its
brightest pixel centred on the corrected place, on the MW stops by the
hotspot's heat (a saturated one, which has none, at the top). kind `s3` draws, clusters and filters on its own
stops (`layers.js` band, `key.js`).

from z10 each hotspot carries its instrument, S2, S3 or VNF, up and right of
it: an image set in the page's inter at 300 (`ensureLabel`, `shell/map.js`)
in a layer of its own over the family's source (`tagLayer`, `layers.js`),
as gl text takes only the basemap's sdf glyphs, which are not inter. the
intro names the three groups of facilities whose outlines the map holds, as
text. the old burnoff map (`~/Tools/burnoff-map`) did
this with l2a cogs, a stac search, every band of every 256 px block of every
scene, and a crdt shared over webrtc.

a card's ⓘ opens what its kind shows (each body's `about`) in the modal
the intro uses (`openModal`, `shell/ui.js`), which opens at once and
shuts into the ⓘ that raised it. a click groups only the markings within
2 px of it as ‹ n/N ›. the panels' fold is the kernel's (200 ms, `toggle`
fired once still).

**hands.** `h` turns on the camera and traces the hands it sees over the
map, never the camera's picture (`hands.js`). mediapipe's hand landmarker
runs in a module worker (`hands.worker.js`, the wasm's es module build, the
gpu delegate on an offscreen canvas) and takes each frame as a transferred
VideoFrame, one in flight, so the map's thread does no inference. a pinch,
thumb tip to index tip under 0.3 of the palm and held to 0.45, grabs the
globe and drags it; two pinch, zoom and turn; a drag let go spins on.

## layout

```
web/
  config.js          the declaration: sources, layers, the one refresh path,
                     quarter availability, the table's tabs, deep links
  about.js           the intro and its sources
  heat.js            the far surface, below z5, in sql
  layers.js          marking / ramp / colour policy and the key's bands;
                     FLARES and FAMILIES, the layer ids.
                     shape categorises, colour is measurement
  key.js             the key: a group of bands per family
  sites.js           data-desk/sites, the outlines a detection sits in
  hands.js           the camera's hands, traced, grabbing the globe; its
                     landmarker in hands.worker.js
  card/              one header, one body per feature kind
    index.js         the registry, the shared series card, liveBody,
                     reselectCurrentFeature
    overlays.js      the open card's map overlays
    chart.js         the intensity chart
    s2.js s3.js vnf.js plume.js   the bodies
  flaring/
    render.js        MODE: the scale each instrument reads on, the S2 floor
    flares.js        vnf in sql: the reducer, vnf(), the terminals,
                     availability, the series
    live.js          s2 and s3 off burnoff's service, live(spec) each
    service.js       the quack pool
    fallback.js      s2's detector in the browser, where the service fails
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

**one reducer.** vnf's window goes through `reduce` in `flaring/flares.js`, a
subquery over `unnest(quarters)`. it returns null, not 0, for any field absent
from any quarter in the window (`count(q.x) = count(*)`): summing that as zero
turns "we never counted the passes" into "no pass was ever made". keep it the
single path.

**do not wire through the published `persistence` column** for the card's
rate: the app recomputes over exactly the ticked quarters, and the published
value would stop the quarter picker affecting the number.

**the null branches stay split.** a live site with no rate is unrated and
drawn; in VNF a null persistence is a finding — no clear night — and the
flare is dropped: `readVNF` (`flares.js`) keeps `persistence IS NOT NULL`,
in sql, not a layer filter. the old slider at 0.25 sank the whole archive
when S2 coalesced to 0.

**intensity is the key's.** there is no persistence slider: it only hid
flares. B12 reflectance and radiant heat
are not one scale. `MODE.s2.floor` is the published quality gate (a constant,
on the site's *average*; VNF has none), and the key's rows filter above it, on
the *maximum*, at exactly the breaks `flareIcon` steps at — `flareBands` in
`layers.js` keeps the two in step. a row passes a feature it is no statement
about (`p.kind !== kind || …`, `key.js`), so switching a group off drops that
family and nothing else.

**floors:** `minLooks` (10 clear looks) for S2 and S3 (`live.js`),
`COVERAGE_MIN = 0.8` for VNF (`flares.js`). below them, publish no rate; the card shows an em dash.

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

- `eog/flares`, `eog/detections` — VNF sites and their nightly detections.
  flares carries `quarters`: `quarter, days, observations, clear,
  detections, detections_clear, rh_sum, rh_max`. `data-desk/flares`, the
  archive's S2 clusters, is not read: the sentinels are live; nor is
  `eog/observations`.
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
  held the engine and every lane behind it. the join tests each outline's
  box before `ST_DWithin`, with the points cast to double (a literal is a
  decimal), so it is a range join, not a nested loop: 6.4k outlines by
  5.3k points at the permian from z10 took 3.6 s, now 0.5 s. the same
  points in the same box are not asked again, and a label is drawn when
  its facility is first lit, not for every outline (2.8k held the page
  1.9 s). it names no detection, so a
  flare's facility is what the reader sees it inside. a facility's label
  is its name over its sector, kind and operator, each said once
  (`siteLabel`), set at 300 up and right of its vertex furthest up and
  right (`sites-label`), and drawn only while the facility is lit. the
  same statement lists the detections each outline holds, for one
  selection whatever made it (`show`, `sites.js`): a card's detection
  (`choose`) or a click on an outline, held until a click elsewhere or on
  it again (the card to come will open there). it lights the facilities
  holding it and what they hold, shows their labels, leaves the other
  outlines faint and the other markings faded, and dims the imagery
  outside those outlines (`dimOutside`). a hover lights the same way while
  nothing is selected, dims nothing, and takes the pointer. `shade` is the
  one writer of the markings' opacities and the label's filter, which an
  open flaring card's grey also goes through.
