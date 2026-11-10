// a project's points, drawn over the map behind ?project=<name>: a static
// geojson in projects/ (drainage: coal-mine-drainage scripts/aerial.sql),
// a white waypoint each, named on hover; an upcast shaft (kind "shaft") is
// a cyan triangle

import { hover } from './vendor/dd/dd.js';
import { ensureMark } from './shell/map.js';
import { DD, PIN } from './layers.js';

const ICON = `waypoint-${DD.white}`, SHAFT = `triangle-${DD.cyan}`;
const TEXT = {
    drainage: p => p.kind === 'shaft'
        ? [p.company, 'upcast shaft', p.t_h == null
            ? `no per-shaft figure (${p.year})`
            : `${p.t_h} t/h ventilation methane (${p.year})`]
        : [p.company, 'drainage location', p.basis,
            `plumes since 2025: ${p.plumes ?? 'none'}`],
};

export function initProject(map) {
    const name = new URLSearchParams(location.search).get('project');
    if (!TEXT[name]) return;
    [ICON, SHAFT].forEach(i => ensureMark(map, i));
    map.addSource('project', { type: 'geojson',
        data: new URL(`./projects/${name}.geojson`, import.meta.url).href });
    map.addLayer({ id: 'project', type: 'symbol', source: 'project',
        layout: { ...PIN, 'icon-size': 1.4, 'icon-image':
            ['match', ['get', 'kind'], 'shaft', SHAFT, ICON] } });
    hover(map, 'project', p => ({ heading: p.site,
        text: TEXT[name](p).filter(Boolean).join(' · ') }));
}
