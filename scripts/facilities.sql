-- web/facilities.json, the intro's worldmap points, off data-desk/sites: every
-- outline's centre on the dd worldmap's mollweide (x in ±2√2, y in ±√2, as
-- vendor/dd/worldmap.js projects), one point per 0.02 of it, about a pixel,
-- as one svg path. `make facilities` writes it; nothing reads the archive
-- for it at load
.mode list
.headers off
SET VARIABLE bucket = 'https://s3.WAW3-2.cloudferro.com/data-desk-archive';
CREATE TEMP TABLE s AS SELECT lon, lat
FROM read_parquet(getvariable('bucket') || '/data-desk/sites/data.parquet');
CREATE TEMP TABLE p AS
SELECT DISTINCT round(2 * sqrt(2) / pi() * radians(lon) * cos(t) / .02) AS x,
       round(-sqrt(2) * sin(t) / .02) AS y
FROM (SELECT lon, list_reduce(range(8), lambda t, i: t - (2 * t + sin(2 * t)
          - pi() * sin(f)) / (2 + 2 * cos(2 * t)), f) AS t
      FROM (SELECT lon, radians(greatest(-89.9, least(89.9, lat))) AS f
            FROM s));
SELECT to_json({
  points: (SELECT string_agg(printf('M%g %gh0', x * .02, y * .02), ''
                             ORDER BY y, x)
           FROM p)});
