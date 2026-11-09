// a project's points, drawn over the map behind ?project=<name>: a static
// geojson in projects/, a white waypoint each, named on hover

import { hover } from './vendor/dd/dd.js';
import { ensureMark } from './shell/map.js';
import { DD, PIN } from './layers.js';

const ICON = `waypoint-${DD.white}`;
const TEXT = {
    drainage: p => [p.mine, p.company, `${p.plumes ?? '—'} plumes at site`,
        `${p.drainage_plumes ?? '—'} from drainage`,
        p.score && `attribution ${p.score}`],
};

export function initProject(map) {
    const name = new URLSearchParams(location.search).get('project');
    if (!TEXT[name]) return;
    ensureMark(map, ICON);
    map.addSource('project', { type: 'geojson',
        data: new URL(`./projects/${name}.geojson`, import.meta.url).href });
    map.addLayer({ id: 'project', type: 'symbol', source: 'project',
        layout: { ...PIN, 'icon-image': ICON, 'icon-size': 1.4 } });
    hover(map, 'project', p => ({ heading: p.site,
        text: TEXT[name](p).filter(Boolean).join(' · ') }));
}
