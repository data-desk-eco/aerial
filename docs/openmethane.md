# open methane for regions of interest

can aerial carry a layer from [open methane](https://github.com/openmethane/openmethane),
built for a region we choose in the data desk etl? checked 2026-10-20 against
the repository at its head commit, `openmethane-prior`, the public data store
`openmethane.s3.amazonaws.com`, and one month of TROPOMI over the Permian.

## the answer

- **the full method, no, not now.** outside Australia the prior has no
  inventory to spread, so the inversion has nothing to correct. the global
  prior (EDGAR) is a proposal upstream, not code: `openmethane-prior` #220 and
  #221, both open. the inversion is also mid-repair upstream (below), and what
  it makes is a 10 km monthly flux, not something on a site.
- **the published Australian outputs, no.** six months of 2023 (CC BY-NC 4.0),
  and in them the posterior hardly moves off the prior.
- **one part of the method, yes.** the alerts statistic, the mean XCH4 near a
  cell less the mean around it, needs only TROPOMI soundings when it is
  compared against the cell's own history rather than a CMAQ run. it is one
  DuckDB statement, it runs anywhere, and over the Permian it puts the
  hottest cells on the Delaware basin. a sketch of the pipeline and the layer
  is at the end.

## what open methane is

a 4D-Var inversion. `openmethane-prior` grids a bottom-up estimate; WRF
supplies the weather; CMAQ carries the prior forward to the columns TROPOMI
should have seen; the CMAQ adjoint carries the misfit back; L-BFGS-B repeats
that (`MAX_ITERATIONS`, 20) until the monthly per-cell multipliers on the
prior settle. two products:

| product | grain | made by |
|---|---|---|
| `posterior-emissions.nc` | domain grid (10 km, Lambert conformal), one period mean, kg/m²/s | monthly workflow: the inversion |
| `alerts.nc` | domain grid, one day: `alerts` (1, 0, NaN) and `obs_enhancement` (ppb) | daily forward run, then `create_alerts.py` |

the code is Apache 2.0. the images are public (`ghcr.io/openmethane/*`,
`linux/amd64` only); the CMAQ adjoint source is not.

## what running it for a region takes

1. **a domain.** a WRF `namelist.wps` in `setup-wrf/domains/`, a WRF and MCIP
   run to make `geo_em.d01.nc` and `GRIDCRO2D`, then `create_prior_domain.py`.
   upstream calls this "the most involved part of the process".
2. **a prior for the domain.** this is the blocker. the sectors are the
   Australian inventory spread on Australian proxies (NGER, Safeguard, NPI,
   ABS land use). only fire (GFAS), wetlands and termites are global.
   #221 would add EDGAR's 0.1° sectors and a `global` preset; until it lands
   we would write that prior ourselves, and EDGAR lags the present by a year
   or more.
3. **every day of the period.** WRF, the prior, the TROPOMI fetch, MCIP and
   ICON/BCON from CAMS, then a CMAQ forward run. it needs an ADS account for
   CAMS and GFAS, and about 20 GB of WRF geography once.
4. **the monthly inversion.** CMAQ forward and adjoint once per iteration.
   upstream says a full `aust10km` month (454 × 430 cells) "will take many
   hours to days on a workstation"; a 300 km region is about 900 cells,
   much cheaper, and much more at the mercy of its boundary.

the CloudFerro bulk worker could run the images. the cost is the method,
not the machine:

- **the inversion is under repair.** #242 (closed 2026-10-07): the June 2024
  run set the 658 largest prior cells, 17.4% of the prior mass, to exactly
  zero. #268 (closed 2026-10-19): the CAMS EAC4 boundary field is 110–120 ppb
  low and wrong in shape, which a one-number-a-month correction cannot remove.
  #249 (open): TROPOMI columns fall ~290 ppb per unit SWIR aerosol optical
  depth, "of comparable size to the signal we are trying to retrieve".
- **a small domain is mostly boundary.** CAMS supplies everything that blows
  in; #268 is that field.
- **the product does not land on a site.** a cell is 100 km², a month long,
  and its sector split comes from the prior alone (`outputs.md`). aerial's
  question is which facility, and when.

## the published outputs

`openmethane.s3.amazonaws.com` holds `aust10km` only:

| prefix | coverage | object |
|---|---|---|
| `emissions/monthly/aust10km/` | 2023-01 to 2023-06, uploaded 2024-10-08 | 1.6 MB each |
| `alerts/daily/aust10km/` | 2023-01-01 to 2023-06-30, 181 days | 14–26 MB each |

June 2023, over 195,220 finite cells: the posterior total is 18.28 Tg/yr
against the prior's 18.45, and the per-cell ratio of posterior to prior has
1st, 50th and 99th percentiles of 0.989, 1.000 and 1.018. that month the
inversion barely moved the inventory, so as a layer it would be the
Australian inventory on a 10 km grid. the alerts for 2023-06-15: 730 cells
flagged, 46,919 assessed and clear, 147,571 not assessable (NaN). the data
store licence is CC BY-NC 4.0 and its readme asks users to contact
research@openmethane.org first.

## the statistic that travels

`map_enhance` in `src/openmethane/postproc/alerts.py`, for each land cell and
day: the mean XCH4 of soundings within 0.2° (the near field) less the mean
of those 0.2–1.0° away (the far field), distances in plain degrees. a
regional offset from the model or the boundary cancels; a local source does
not. the alert is `|obs − baseline mean| > 1 σ`, two-sided, with a cell
needing 30 baseline days with a value (`ALERTS_COUNT_THRESHOLD`). the baseline mean
is the *simulated* enhancement over the period, and only that half needs
WRF, CMAQ and the prior. the σ is already observed.

take the baseline from the observations too and the model drops out. the
question changes from "more than the inventory predicts" to "more than this
cell usually shows, or more than its neighbours". a standing source no
inventory knows about shows as a persistent positive mean; the alert flag
shows only change.

### prototype: the Permian, June 2024

region `POLYGON((-104.5 30.5, -100.5 30.5, -100.5 33.5, -104.5 33.5, …))`,
soundings read 1° beyond it for the far field. upstream's three filters
(`qa_value > 0.5`, SWIR albedo > 0.03, SWIR AOD < 0.07), H3 resolution 5 for
the cells.

| step | measure |
|---|---|
| CDSE catalogue (OFFL, footprint crosses the region) | 41 granules, 2.53 GB, from `meeo-s5p` |
| granules with soundings in the padded box | 34, on 29 days |
| soundings, then passing the filters | 68,792, then 39,200 (2.5 MB of parquet) |
| decode (netCDF4 to parquet, 5 granules) | 0.45 s |
| cells, cell-days, days | 429, 6,180, 27 |
| median soundings in a near field | 14 |
| the statement, end to end | 2.5 s |

the monthly mean enhancement of the 402 cells with at least 8 days, in
quintiles, against the VNF sites within each cell's near field
(`eog/flares`, quarter 2024-Q2):

| quintile | mean enhancement (ppb) | VNF sites (mean) | quarter's `rh_sum`, MW (median) |
|---:|---:|---:|---:|
| 1 | −3.8 | 29.5 | 33 |
| 2 | −1.7 | 26.7 | 27 |
| 3 | −0.2 | 23.8 | 5 |
| 4 | 1.3 | 45.9 | 56 |
| 5 | 4.0 | 74.7 | 233 |

of the eight hottest cells (6.3–7.3 ppb; mean over standard error 2.6–4.9),
six are in the Delaware basin (30.8–31.3 N, 103.5–103.7 W, and 32.5 N,
104.1 W) and two in the Midland basin (32.6–32.7 N, 101.8 W). across cells the
correlation with the log of radiant heat is 0.12: flaring is a proxy for
production, not for leaks, and a month of TROPOMI is noisy (σ 7.3 ppb a
cell-day).

the hazards are the retrieval's:

- **artefacts of the same size.** #249 puts the highest AOD decile
  (0.037–0.130) 11.7 ppb low, and the 0.07 cutoff removes only part of it;
  albedo and terrain do the same. a
  simulated baseline does not fix these either. compare a cell with itself
  across quarters, not with a cell over different ground.
- **a basin, not a site.** a 0.2° near field is about 20 km. single
  facilities sit under the noise unless they are super-emitters, which
  `sron/detections` already carries as plumes.
- **ppb, not t/h.** no wind, no mass. it cannot share the plume key's scale.

the statement, as run:

```sql
CREATE TABLE s AS SELECT lat, lon, xch4, time_utc[:10]::DATE AS day
  FROM 'pq/*.parquet' WHERE qa > 0.5 AND albedo > 0.03 AND aod < 0.07;
CREATE TABLE c AS SELECT cell, h3_cell_to_lat(cell) AS lat,
    h3_cell_to_lng(cell) AS lon
  FROM (SELECT unnest(h3_polygon_wkt_to_cells_string(region, 5)) AS cell);
SELECT c.cell, s.day,
    avg(xch4) FILTER (r < 0.2) - avg(xch4) FILTER (r >= 0.2) AS enh,
    count(*) FILTER (r < 0.2) AS n_near, count(*) FILTER (r >= 0.2) AS n_far
  FROM c JOIN s ON abs(s.lat - c.lat) < 1 AND abs(s.lon - c.lon) < 1,
    LATERAL (SELECT sqrt((s.lat - c.lat)^2 + (s.lon - c.lon)^2) AS r)
  WHERE r < 1 GROUP BY ALL HAVING n_near > 0 AND n_far > 0;
```

the decode keeps every finite sounding in the box and applies no filter:
`PRODUCT/{latitude, longitude, methane_mixing_ratio_bias_corrected, qa_value,
time_utc}` and `PRODUCT/SUPPORT_DATA/DETAILED_RESULTS/{surface_albedo_SWIR,
aerosol_optical_thickness_SWIR}`.

## if we build it

**raw.** a granule is ~64 MB and the world is ~0.9 GB a day (14 granules,
2024-06-15), ~330 GB a year; the soundings over a region are a thousandth of
the granules. that is the case the `etl-pipelines` amendment covers, so it
would be the third documented projection, beside ERA5 and the frozen passes:
`copernicus/s5p/run=nightly/`, one parquet per granule, its key the granule
name. keep one product per orbit, the later processor version, as upstream's
`select_one_per_orbit` does (RPRO to 2022-07-25, OFFL after). the bulk worker
is in WAW3-2 beside `eodata`, which holds Sentinel-5P too; whether it reads
faster than the `meeo-s5p` mirror is untested.

**table.** `data-desk/enhancements`, one row per H3 res-5 `cell` and `day`:
`enh`, `n_near`, `n_far`, `region`. like `flares`, a per-cell `quarters`
struct (`days`, `enh_sum`, `enh_sq`, `n_near`) lets aerial use one reducer
over the ticked quarters: null where a quarter is missing, and no rate below
a floor on days, as `MIN_LOOKS` is for S2. a region-year is ~430 cells, small
enough for the prefetch tier.

**layer.** a fourth family: each H3 hexagon (its boundary from
`h3_cell_to_boundary_wkt` in sql, never in js) filled on the dd ramp in ppb.
a cell is an area, so it is a new shape and an `AUDIT` line in `layers.js`.
it would draw beneath the points and fade out by z10, where a 20 km near
field is wider than the view.

**before any of that.** a year over two or three regions, so a cell has a
history to differ from, scored against `sron/detections` and the S2 and VNF
flare series per cell and quarter. if the quarterly mean does not follow
what those already show, the layer adds nothing aerial does not have.

## revisit the full method when

- `openmethane-prior` #221 merges with a domain run outside Australia, and
- upstream publishes a monthly run, after #242, #249 and #268, in which the
  posterior moves off the prior where the observations constrain it.
