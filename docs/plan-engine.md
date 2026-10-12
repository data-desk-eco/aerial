# handover: the archive and the engine do the work

goal: delete aerial front-end code by setting the archive up properly and
investing in the duckdb lite build. aerial should be a thin layer between
maplibre and the archive: a reader builds one statement, the engine does the
rest (see "the engine does the work" in `CLAUDE.md`, and commit f679345, which
moved every reader to sql).

three repos, in this order. each phase ships on its own and leaves aerial green.

## phase 1: lite build (`~/Tools/duckdb-wasm-lite`, release `lite.6`)

1. **h3, statically linked.** pin `isaacbrodsky/h3-duckdb` in `pins`. it is a
   C-API extension (`DUCKDB_EXTENSION_ENTRYPOINT`), so it needs no source
   surgery, but duckdb only starts C-API extensions from a dll:
   `DuckDBExtensionLoadState` and `ExtensionAccess` are private to
   `src/main/extension/extension_load.cpp`. add ~15 lines to
   `patches/duckdb.patch` exposing a helper that runs an `_init_c_api` function
   pointer against a `DatabaseInstance`, and an `h3/h3_extension.cc` stub
   mirroring `spatial/spatial_extension.cc`. build the archive with h3's
   wasm path (`DUCKDB_WASM_EXTENSION=ON`, `scripts/bundle_h3.sh` bundles libh3)
   and link it in `build.sh` beside spatial. risk: the C API version h3-duckdb
   declares vs the pinned 2.0 main; if refused, build against the pin with
   `DUCKDB_EXTENSION_API_VERSION_UNSTABLE`.
2. **a data range cache** (`PLAN.md`, "evaluate a range cache"). footers are
   cached already; completed data ranges are not, so a repeated read refetches
   them (aerial: 1,858 ms cold, 280 ms again for a card; ~1.2 s every time for
   the six-table candidate read). a small bounded LRU in `browser/async_io.cc`
   keyed by (file, offset, length), dropped in `dropFile`.
3. tests in `test/accept.mjs`: `h3_latlng_to_cell`, `h3_grid_disk`,
   `h3_cell_to_parent` against the stock extension's output; a repeated ranged
   scan issues no second fetch. `node scripts/size.mjs` and record the delta in
   `baseline.json` (expect ~+100 KB brotli; say if it is more). update
   `CONTRACT.md` and the readme. cut the release.

## phase 2: archive (`~/data-desk/etl`)

1. **partition by `cell`** (the res-1 h3 cell the archive already uses) every
   `infrastructure` table and `data-desk/detections`, as `eog/detections` is.
   one table per etl job stays the rule: this is layout, not a new table. no
   halo rows. `index.json` then says `"cell"` for those providers.
   measured today, a 6 km candidate box costs 13–16 row groups and 14–16 MB
   (osm row groups are 51,200 rows spanning ~10° of longitude) for ~600 rows.
2. **sizes in `index.json`**, per object (per partition where partitioned), so
   aerial picks whole fetch vs ranged read without a probing GET.
3. **`bounds` as geometry** (geoparquet) rather than wkt text: nature trace's
   wkt is 7.6 of its 9.4 MB detections object.
4. keep each `*.checks.sql` passing, add checks for the partition key and the
   index sizes. say in the commit which consumers outside aerial read these
   tables whole, and check they still work through the index.

## phase 3: aerial (this repo)

1. `make vendor` to `lite.6` (bump `DUCKDB_TAG` in `scripts/vendor.sh` and
   `DUCKDB_RELEASE` in `shell/engine.js`; `rm -rf web/vendor` first, the
   sentinel ignores the tag).
2. **candidates** (`methane/candidates.js`): the cells under the card's rect
   in sql (corners and centre, `h3_latlng_to_cell(…, 1)`, distinct; a ≤20 km
   box is 1–3 res-1 cells), each provider's object per cell via `objects(…,
   { key })`, fetched whole where `index.json` says it is under the cap.
3. **series** (`flaring/flares.js` `series`): `data-desk/detections` by cell
   like eog. then delete `memoised()` and its budget from `shell/data.js`:
   the engine's range cache and whole-object buffers replace it.
4. **cell from sql**: compute a site's cell in the statement where a card
   needs it, so `cell` is no longer plumbed through builders. rewrite the
   "no H3 in the browser" invariant in `CLAUDE.md` as "the cell is computed in
   sql, never in js".
5. **prefetch** (`shell/data.js`): read sizes from `index.json`; drop the
   probe-and-cancel in `prefetchData`.
6. **plumes**: read `bounds` in the main projection again if the geometry form
   is small enough (measure), drop `plumeBounds`, and draw a card's footprint
   from `ST_AsGeoJSON(bounds)`.
7. **optional, measure first**: readers return a FeatureCollection string
   built in sql (`ST_AsGeoJSON`, `json_group_array`) straight to `setData`,
   retiring `fc()` and most of `engine.js`'s arrow-to-rows converter. the
   shell and cards read features as objects, so it may only pay for layers
   no card reads.

## rules for the agent

- read `CLAUDE.md` first; its invariants were arrived at through incidents.
  `make test` (needs the duckdb cli with spatial; it will need h3 too) and
  `make audit` must pass, and check every change in the browser with
  `~/data-desk/skills/browser/browse`: the map at
  `#map=11/25.92/51.55`, an s2 card, a vnf card, a plume card with candidates.
- report timings before and after for: first paint, a candidate read cold and
  repeated, an s2 card series cold and repeated.
- minimal code, 80 columns, lowercase comments. one commit per step, directly
  on main, lowercase messages.

## outcome (2026-10-11)

phase 1 shipped as `v2.0.0-alpha1-lite.6`. duckdb already has
`LoadStaticCAPIExtension`; its only gap was a null `get_api`, which the patch
fills with `ExtensionAccess::GetAPI` (one line, not fifteen). h3 compiles
against the pinned duckdb's own c-api headers and costs 39 KB brotli
(4,475,694 in all). the range cache keys a landed range by file name, offset
and length (an id is reallocated whenever the last handle closes), holds 32 MB
least recently used, and `dropFile`, `dropFiles` and a re-registered name drop
it. acceptance: three h3 cases (the archive's own `cell`, row for row) and a
repeated scan that reads none of its 8 ranges again.

phase 2: osm, ogim, mapstand, netl and epa `infrastructure` are one object per
cell, 10,000-row hilbert groups; a 6 km box reads 0.16 MB of osm at ras laffan
against 1.46 MB before. `index.json` carries `sizes` (59.6 KB compact, from
16.5). three items were measured and not done:

- `gem` stays one object. aerial names flares after its 205 export terminals,
  in 54 of 353 cells, and a whole read of it is 1.9 MB.
- `data-desk/detections` stays one object: its 84 plumes would cost the plume
  layer a footer read in each of 56 cells.
- `bounds` as geometry is 6.5 MB against 7.6 of wkt, not small enough for the
  main projection, so `plumeBounds` stays and the contract keeps varchar.

whole-object readers changed to `**/data.parquet` over anonymous s3: the
etl's own (`sql/archive.sql`), bricolage's archive skill (one read per
provider: `union_by_name` read every cell's footer, and `near()` went from
19–35 s to 0.9 s on the jump host), and mine-plans. ch4id and venezuela
already globbed on origin.

phase 3: 3.6 is the `bounds` item above. 3.7 does not pay: building the
FeatureCollection in sql took 715–750 ms and a 33 MB string for 99,934
plumes, against 432 ms of rows and 5 ms of `fc()`.

timings, local server against the live archive, `#map=11/25.92/51.55`,
three runs each:

| | before (lite.5) | after (lite.6, cells) |
|---|---|---|
| first paint | 2.7–3.2 s | 2.4–2.6 s |
| candidates, ras laffan, cold | 5.5–6.0 s | 3.3–3.5 s |
| candidates, again | 1.2–1.5 s | 0.22–0.24 s |
| s2 series, cold | 2.4–3.3 s | 2.4–2.7 s |
| s2 series, again | 0 (js memo) | 85–91 ms (range cache) |
