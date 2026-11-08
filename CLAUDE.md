# Aerial

Aerial shows two types of oil and gas emissions on one map: gas that the
industry burns (flaring) and gas that it leaks (methane). `README` describes
the layers and their sources.

Aerial reads data and draws it. It does not publish data or detect
hotspots. The Data Desk archive and the burnoff service supply the data.
The one exception is `/review`. On that page, a reviewer accepts or rejects
each new methane attribution, and `worker/review.js` keeps the result.

## Commands

```bash
make serve     # static server on :8000
make test      # the flaring rate rules and other tests, in node
make audit     # the UI against the Data Desk design system, headless
make vendor    # vendor MapLibre, DuckDB-Wasm, the dd kernel and Inter again
make dist      # build the GitHub Pages artifact and run its assertions
```

`make test` needs the DuckDB CLI with the spatial extension. `make audit`
needs the browser tool in the Data Desk repository. Each push to `main`
deploys the site.

## Design rules

- Do not add npm, a framework or a build step. The libraries are in
  `web/vendor/`. All other code uses browser built-ins.
- Use DuckDB for the data work. A reader makes one SQL statement, and the
  engine filters, aggregates, joins and sorts. JavaScript controls only the
  DOM and the map. Keep session state in a DuckDB table, not in a
  JavaScript array.
- `web/config.js` declares the app for `mount()` in `web/shell/app.js`.
- Do not write an archive object name in a module. The `data-bucket` meta
  tag gives the bucket. The archive's `index.json` gives the object and
  the partitions of each table.
- The live S2 and S3 layers come from the burnoff service through
  `quack_query` (`web/flaring/service.js`). The `?api=` parameter selects
  a different service.
- Build the UI from the elements in `web/vendor/dd/dd.js`, and style them
  only with `--dd-*` tokens. Change those elements in the Data Desk design
  repository, not in `web/vendor/`. `make audit` fails on each deviation
  that `AUDIT` in `web/layers.js` does not declare.
- Do not name a detection after a facility near it. A detection connects to
  a facility only on the map (`web/sites.js`) or through a confirmed
  attribution.

## Layout

```
web/
  config.js     the app declaration: sources, layers, refresh, deep links
  about.js      the introduction and its sources
  heat.js       the surface below zoom 5
  layers.js     markers, color ramp and the bands of the key
  key.js        the key
  sites.js      facility outlines
  hands.js      map control with hand gestures (type "hands")
  card/         a header and one body for each feature type
  flaring/      VNF reads, live S2 and S3 reads, the scales
  methane/      plumes, attributions, candidate sources, overlay, masks
  shell/        the map shell, the DuckDB worker and archive reads
  review/       the /review page
  vendor/       vendored libraries
worker/         the review API and its D1 schema
scripts/        vendor, dist and serve scripts
test/           node tests
docs/           design notes and measurements
```

## Invariants

These rules come from production incidents. Code that breaks one of them
can still run without errors.

- Persistence is a ratio. Its numerator and denominator must count the same
  looks. `clear` counts the cloud-free looks, and its only numerator is
  `detections_clear`. Do not divide `detections` by `clear`. Do not use
  `observations` in place of `clear`.
- Each VNF window goes through `reduce` in `web/flaring/flares.js`. If a
  field is missing in a quarter of the window, the result is null, not 0.
- The app calculates the rate for the selected quarters. Do not use the
  published `persistence` column.
- A live site without a rate is drawn as unrated. A VNF site with null
  persistence had no clear night, and `readVNF` removes it in SQL.
- S2 and S3 need 10 clear looks (`minLooks`, `web/flaring/live.js`). VNF
  needs 0.8 coverage (`COVERAGE_MIN`). Below these floors, a card shows an
  em dash in place of a rate.
- VNF has no intensity floor. S2 has one quality gate, `MODE.s2.floor`, on
  the mean B12 of a site.
- The key filters at the same breaks that `flareIcon` uses. `flareBands`
  in `web/layers.js` keeps the two the same.
- Each layer refreshes through `refresh(id)` in `web/config.js`, which
  calls `reselectCurrentFeature()`. Add each new layer to `READS`.
- MCM/d is `rh_mw × 0.0315` (JZ-RH, Zhizhin et al. 2025). Set it only in
  `RH_TO_MCM` (`web/flaring/render.js`). Do not show EOG's `flow_mcm`.
- Identifiers are VARCHAR. Do not convert them with `Number()`. Do not
  match features on coordinates.
- Calculate H3 cells in SQL with `h3_latlng_to_cell_string`, not in
  JavaScript.
- Aerial does not read `eog/observations`. The `quarters` list in
  `eog/flares` contains the looks.
- All layers use one color ramp on three scales: B12 for S2, MW for S3 and
  VNF, t/hr for methane. Shape shows burned or leaked gas. Color shows only
  intensity. A plume without a rate is gray and is in no band.
- Each DuckDB connection (a lane) runs its statements in sequence. The map
  uses the default lane, and cards use `lane: 'card'`. Add a lane only
  when work must not wait behind other work.
- Each connection sets `geometry_always_xy`. Without it, the spatial
  sphere functions take latitude first.
- Objects smaller than 8 MB load whole when the page loads (`prefetchData`,
  `web/shell/data.js`). Larger objects use range reads. Do not make the
  first paint wait for a range read (`docs/cold-load.md`).

## Archive tables

The Data Desk ETL publishes these tables. Its `*.checks.sql` files state
what a reader can rely on.

- `eog/flares`: VNF sites, each with a `quarters` list of quarterly counts.
- `eog/detections`: the nightly detections of a VNF site, read for a card.
- `<provider>/detections`: methane plumes. `valid` is false where the
  producer does not trust the retrieval.
- `<provider>/infrastructure`: candidate sources, one object for each H3
  resolution 1 cell.
- `data-desk/attributions`: plume-to-source attributions.
- `data-desk/sites`: OpenStreetMap outlines of industrial facilities.

## Commits

Use conventional commits: `type(scope): subject`, on one line of less than 72
characters. The types are `feat`, `fix`, `perf`, `refactor`, `docs`,
`test` and `chore`. The scope is the module or layer, for example `live`,
`heat` or `card`. Put the reason, the measurements and the checks in the
body. Before a push, squash or remove each experiment that a later commit
reverts.
