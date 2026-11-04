// the intro: what the map holds, where it comes from, and the works it
// stands on, each a line under Sources linked by its doi or its page

const link = (href, text) => `<a href="${href}" target="_blank">${text}</a>`;

// [authors (year). title. <i>venue</i>., url]
const SOURCES = [
    ['Aybar, C. et al. (2022). CloudSEN12, a global dataset for semantic '
        + 'understanding of cloud and cloud shadow in Sentinel-2. '
        + '<i>Scientific Data 9, 782</i>.',
        'https://doi.org/10.1038/s41597-022-01878-2'],
    ['Batchu, V. V. et al. (2026). Global monitoring of methane point '
        + 'sources using deep learning on hyperspectral radiance '
        + 'measurements from EMIT. <i>Proceedings of the National Academy '
        + 'of Sciences</i>.', 'https://doi.org/10.1073/pnas.2612145123'],
    ['Caseiro, A. et al. (2018). Persistent hot spot detection and '
        + 'characterisation using SLSTR. <i>Remote Sensing 10, 1118</i>.',
        'https://doi.org/10.3390/rs10071118'],
    ['Caseiro, A. et al. (2020). Gas flaring activity and black carbon '
        + 'emissions in 2017 derived from the Sentinel-3A Sea and Land '
        + 'Surface Temperature Radiometer. <i>Earth System Science Data 12, '
        + '2137–2155</i>.', 'https://doi.org/10.5194/essd-12-2137-2020'],
    ['Duren, R. M. et al. (2025). The Carbon Mapper emissions monitoring '
        + 'system. <i>Atmospheric Measurement Techniques 18, 6933–6975</i>.',
        'https://doi.org/10.5194/amt-18-6933-2025'],
    ['Elvidge, C. D. et al. (2013). VIIRS Nightfire: satellite pyrometry at '
        + 'night. <i>Remote Sensing 5, 4423–4449</i>.',
        'https://doi.org/10.3390/rs5094423'],
    ['Global Energy Monitor (2026). Global Energy Monitor trackers: oil and '
        + 'gas, LNG, pipelines, coal, steel, cement and power. '
        + '<i>Datasets</i>.', 'https://globalenergymonitor.org'],
    ['Haklay, M. and Weber, P. (2008). OpenStreetMap: user-generated street '
        + 'maps. <i>IEEE Pervasive Computing 7, 12–18</i>.',
        'https://doi.org/10.1109/MPRV.2008.80'],
    ['Jervis, D. et al. (2025). Global energy sector methane emissions '
        + 'estimated by using facility-level satellite observations. '
        + '<i>Science</i>.', 'https://doi.org/10.1126/science.adv3183'],
    ['Marchese, F. et al. (2019). A multi-channel algorithm for mapping '
        + 'volcanic thermal anomalies by means of Sentinel-2 MSI and '
        + 'Landsat-8 OLI data. <i>Remote Sensing 11, 2876</i>.',
        'https://doi.org/10.3390/rs11232876'],
    ['Mateo-García, G. et al. (2025). Artificial intelligence for methane '
        + 'detection: from continuous monitoring to verified mitigation. '
        + '<i>arXiv:2511.21777</i>.', 'https://arxiv.org/abs/2511.21777'],
    ['Omara, M. et al. (2023). Developing a spatially explicit global oil '
        + 'and gas infrastructure database for characterizing methane '
        + 'emission sources at high resolution. <i>Earth System Science '
        + 'Data 15, 3761–3790</i>.',
        'https://doi.org/10.5194/essd-15-3761-2023'],
    ['Raasveldt, M. and Mühleisen, H. (2019). DuckDB: an embeddable '
        + 'analytical database. <i>Proceedings of the 2019 International '
        + 'Conference on Management of Data (SIGMOD), 1981–1984</i>.',
        'https://doi.org/10.1145/3299869.3320212'],
    ['Rose, K. et al. (2018). Development of an open global oil and gas '
        + 'infrastructure inventory and geodatabase. <i>NETL-TRS-6-2018, '
        + 'National Energy Technology Laboratory</i>.',
        'https://doi.org/10.18141/1427573'],
    ['Schuit, B. J. et al. (2023). Automated detection and monitoring of '
        + 'methane super-emitters using satellite data. <i>Atmospheric '
        + 'Chemistry and Physics 23, 9071–9098</i>.',
        'https://doi.org/10.5194/acp-23-9071-2023'],
    ['US EPA (2026). Greenhouse Gas Reporting Program facilities. '
        + '<i>Envirofacts</i>.', 'https://www.epa.gov/ghgreporting'],
    ['Varon, D. J. et al. (2018). Quantifying methane point sources from '
        + 'fine-scale satellite observations of atmospheric methane plumes. '
        + '<i>Atmospheric Measurement Techniques 11, 5673–5686</i>.',
        'https://doi.org/10.5194/amt-11-5673-2018'],
    ['Zhizhin, M. et al. (2026). VIIRS Nightfire super-resolution method '
        + 'for multiyear cataloging of natural gas flaring sites: '
        + '2012–2025. <i>Remote Sensing 18, 314</i>.',
        'https://doi.org/10.3390/rs18020314'],
];

export const ABOUT = `
    <div class="region-row">
        <div class="fx-fine"><div class="fx-secondary">Facility coverage:
            </div>Fossil fuels<br>Industrial<br>Waste</div>
        <svg id="modal-worldmap"></svg>
    </div>
    <div class="fx-intro">
        <p>Aerial is a research tool designed for facility-level attribution
            of satellite emissions observations. Use it to investigate a
            specific facility or to browse point source emissions
            globally.</p>
        <p>In addition to ${link('https://github.com/data-desk-eco/burnoff',
            'hotspot detections')} from Sentinel-2 by day and Sentinel-3 by
            night, the map aggregates methane plumes and detections
            published by ${link('https://methanedata.unep.org/', 'UN IMEO')},
            ${link('https://data.carbonmapper.org/', 'Carbon Mapper')},
            ${link('https://earth.sron.nl/methane-emissions/', 'SRON')} and
            ${link('https://eogdata.mines.edu/products/vnf/', 'EOG')} and
            overlays them on facility boundaries derived from ${link(
            'https://globalenergymonitor.org/projects/'
            + 'global-gas-infrastructure-tracker/',
            'Global Energy Monitor')}, ${link(
            'https://doi.org/10.5281/zenodo.7466757', 'EDF')}, ${link(
            'https://edx.netl.doe.gov/dataset/global-oil-gas-features-database',
            'NETL')} and ${link('https://www.openstreetmap.org/copyright',
            'OpenStreetMap')} data.</p>
        <p>Firm attribution of an observation to a facility requires further
            research. Experimentally, we use a system of ${link(
            'https://github.com/data-desk-eco/bricolage', 'research agents')}
            running DeepSeek-V4.1-Flash to publish attributions for all
            newly observed high-resolution methane plumes.</p>
        <p class="fx-fine fx-secondary">Design by ${link(
            'https://mikaeldahlen.com/', 'Mikael Dahlén')}.</p>
    </div>
    <details class="methods fx-fine">
        <summary class="fx-secondary"><svg viewBox="0 0 8 4"><path
            d="M.5.5 4 3.5l3.5-3"/></svg>Sources</summary>
        <div class="methods-list fx-secondary">${SOURCES.map(([t, u]) =>
            `<p>${t} ${link(u, u.replace('https://', ''))}</p>`).join('')}
        </div>
    </details>`;
