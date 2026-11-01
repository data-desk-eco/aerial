-- the data-desk-s3 tables in eog's shape, a proposal for the etl
-- (etl/providers/data-desk/burnoff): from site_runs (site id, granule dir,
-- sat, t, s3_detect(dir, site ± 0.01°)) and s3sites (id, lat, lon). its
-- output passed sql/tables/flares.checks.sql on 2023 q1 (docs/s3.md). the
-- shared flares schema, `quarters` built the way eog's is.
load h3; load spatial; set geometry_always_xy = true;
create or replace macro cell(lat, lon) as h3_h3_to_string(h3_latlng_to_cell(lat, lon, 1));
-- the local evening a look belongs to: s3 passes at about 22:00 local
create or replace macro night_of(ts, lon) as
    (ts + to_microseconds((lon / 15 * 3600e6)::bigint) - interval 12 hour)::date;
create or replace macro quarter_of(day) as date_trunc('quarter', day)::DATE;
create or replace macro persistence(active_days, observations) as
    try_cast(active_days as DOUBLE) / nullif(observations, 0);

-- a site's night: read if a granule saw it by night (no error, the sun down);
-- clear if the box's pixels around any hotspot were half or more clear. a
-- night read twice (two granules, two platforms) is its clearest look
create or replace table s3_nights as
select s.id site_id, night_of(r.t, s.lon) "date", s.lat, s.lon,
       bool_or(r.r.error is null and r.r.sza >= 90
               and (r.r.clear is not null or len(r.r.hotspots) > 0)) AS observed,
       bool_or(r.r.clear >= 0.5) AS clear,
       max(r.r.clear) AS cloudfree,
       count(*) AS looks,
       arg_max(regexp_extract(r.dir, '[^/]+$'), coalesce(r.r.clear, 0)) AS scene
from site_runs r join s3sites s using (id)
group by all;

-- a site's detection on a night: its hotspots in the box on the granule
-- whose sum is greatest, summed (a dense complex is several hotspots)
create or replace table s3_dets as
select site_id, "date", any_value(lat) AS lat, any_value(lon) AS lon,
       arg_max(sat, rh) AS satellite, arg_max(scene, rh) AS scene,
       max(rh)::FLOAT AS rh_mw, arg_max(temp, rh)::FLOAT AS temp_k,
       arg_max(px, rh)::INT AS pixels, arg_max(conf, rh) AS confirmed
from (select s.id site_id, night_of(r.t, s.lon) "date", r.sat,
             regexp_extract(r.dir, '[^/]+$') AS scene,
             sum(h.rh) AS rh, sum(h.rh * h.temperature) / nullif(sum(h.rh) filter (h.temperature is not null), 0) AS temp,
             sum(h.pixels) AS px, bool_and(h.confirmed) AS conf,
             avg(h.lat) AS lat, avg(h.lon) AS lon
      from site_runs r join s3sites s using (id), unnest(r.r.hotspots) u(h)
      group by all)
group by all;

copy (
  select 'DS3:' || site_id || ':' || "date" id, 'data-desk-s3' provider, 'flare' AS kind,
         site_id, "date", year("date")::INT "year", d.lat, d.lon, cell(s.lat, s.lon) AS cell,
         true AS valid, satellite, scene, rh_mw, temp_k, pixels, confirmed, 'og' AS sector
  from s3_dets d join s3sites s on s.id = d.site_id
  order by cell, site_id, "date"
) to 'arch/data-desk-s3/detections/data.parquet' (format parquet, compression zstd);

create or replace table quarters as
select n.site_id, quarter_of(n."date") AS quarter,
       count(*)::INT AS days,
       count(*) filter (n.observed)::INT AS observations,
       count(*) filter (n.observed and n.clear)::INT AS clear,
       count(d.site_id)::INT AS detections,
       count(d.site_id) filter (n.clear)::INT AS detections_clear,
       round(coalesce(sum(d.rh_mw), 0), 2) AS rh_sum,
       round(coalesce(max(d.rh_mw), 0), 2) AS rh_max
from s3_nights n left join s3_dets d using (site_id, "date")
group by 1, 2;

copy (
  select s.id, 'data-desk-s3' provider, 'flare' AS kind, s.lat, s.lon, cell(s.lat, s.lon) AS cell,
         NULL::VARCHAR AS country, NULL::VARCHAR AS detail,
         l.first_seen, l.last_seen, coalesce(l.detections, 0)::INT AS detections,
         coalesce(l.active_days, 0)::INT AS active_days, h.observations,
         persistence(coalesce(l.active_days, 0), h.observations) AS persistence,
         l.score, []::VARCHAR[] AS flags, q.quarters
  from s3sites s
  left join (select site_id, min("date") AS first_seen, max("date") AS last_seen, count(*) AS detections,
                    count(distinct "date") AS active_days, round(avg(rh_mw), 2)::DOUBLE AS score
             from s3_dets group by 1) l on l.site_id = s.id
  left join (select site_id, count(*) filter (observed)::INT observations from s3_nights group by 1) h on h.site_id = s.id
  left join (select site_id, list({'quarter': quarter, 'days': days, 'observations': observations,
                    'clear': clear, 'detections': detections, 'detections_clear': detections_clear,
                    'rh_sum': rh_sum, 'rh_max': rh_max} order by quarter) AS quarters
             from quarters group by 1) q on q.site_id = s.id
  order by cell, s.id
) to 'arch/data-desk-s3/flares/data.parquet' (format parquet, compression zstd);
