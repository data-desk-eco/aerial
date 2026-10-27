-- web/facilities.json, the intro's facility counts and worldmap points, off
-- data-desk/sites: four groups of kinds, counted in thousands, and every
-- outline's centre on the dd worldmap's mollweide (x in ±2√2, y in ±√2, as
-- vendor/dd/worldmap.js projects), one point per 0.02 of it, about a pixel,
-- as one svg path. `make facilities` writes it; nothing reads the archive
-- for it at load
.mode list
.headers off
SET VARIABLE bucket = 'https://s3.WAW3-2.cloudferro.com/data-desk-archive';
CREATE TEMP TABLE s AS SELECT kind, lon, lat
FROM read_parquet(getvariable('bucket') || '/data-desk/sites/data.parquet');
CREATE TEMP TABLE g(o INT, g VARCHAR, kinds VARCHAR[]);
INSERT INTO g VALUES
    (1, 'refineries', ['refinery']),
    (2, 'oil & gas sites', ['processing_plant', 'lng_terminal',
        'oil_gas_facility', 'well_pad', 'compressor_station', 'pump_station',
        'oil_terminal', 'gas_storage', 'gas_terminal']),
    (3, 'waste sites', ['landfill', 'wastewater_plant']),
    (4, 'heavy industry', NULL);
CREATE TEMP TABLE p AS
SELECT DISTINCT round(2 * sqrt(2) / pi() * radians(lon) * cos(t) / .02) AS x,
       round(-sqrt(2) * sin(t) / .02) AS y
FROM (SELECT lon, list_reduce(range(8), lambda t, i: t - (2 * t + sin(2 * t)
          - pi() * sin(f)) / (2 + 2 * cos(2 * t)), f) AS t
      FROM (SELECT lon, radians(greatest(-89.9, least(89.9, lat))) AS f
            FROM s));
SELECT to_json({
  counts: (SELECT list(round(n / 1e3)::INT || 'k ' || g ORDER BY o)
           FROM (SELECT g.o, g.g, count(*) AS n
                 FROM s JOIN g ON list_contains(g.kinds, s.kind)
                   OR (g.kinds IS NULL AND NOT EXISTS (SELECT 1 FROM g h
                       WHERE list_contains(h.kinds, s.kind)))
                 GROUP BY g.o, g.g)),
  points: (SELECT string_agg(printf('M%g %gh0', x * .02, y * .02), ''
                             ORDER BY y, x)
           FROM p)});
