import { lazy, Suspense } from 'react';
import { mineHref } from '../../app/router';
import { BAND_LABEL, BAND_TOKEN, LEGEND_ORDER, bandVar, subsidiaryName, typeLabel } from '../../components/map/bands';
import type { MapData, MapMine } from '../../data/schemas';
import { Button, Eyebrow, LegendList, LegendRow } from '../../ui';
import { mapData, mineRecord } from './data';
import './MapPage.css';

/** The mine the page starts people on (PLAN_V1 Step 5). */
const START_MINE_ID = 'bccl-moonidih';

// The map and the mine table ship in their own chunk. The hero and legend render at once, so the H1 is there to
// take focus on route change.
const loadMap = () => import('../../components/map');
const MineMap = lazy(() => loadMap().then((m) => ({ default: m.MineMap })));
const MineBrowser = lazy(() => loadMap().then((m) => ({ default: m.MineBrowser })));

const ROMAN = ['', 'I', 'II', 'III'] as const;

function mapAriaLabel(data: MapData, start: MapMine, coalfield: string): string {
  const counts = LEGEND_ORDER.map((band) => `${BAND_LABEL[band]}, ${data.bands[band]}`).join('; ');
  return (
    `Map of India showing Coal India mines coloured by expected closure. Mines per band: ${counts}. ` +
    `${start.name}, in the ${coalfield} coalfield, is highlighted. Browse all mines, below the map, lists them.`
  );
}

function Legend({ data }: { data: MapData }) {
  return (
    <div className="map-legend">
      <div className="map-legend-head">
        <h2 className="map-legend-title" id="legend-title">
          Expected closure
        </h2>
        <span className="num map-legend-unit" aria-hidden="true">
          mines
        </span>
      </div>
      <LegendList label="Expected closure, number of mines">
        {LEGEND_ORDER.map((band) => (
          <LegendRow key={band} swatch={BAND_TOKEN[band]} label={BAND_LABEL[band]} count={data.bands[band]} />
        ))}
      </LegendList>
      <p className="map-legend-note">
        Closure periods are estimated from remaining reserves and current output: the year the reserve would run out.
        Mine positions are approximate, placed by coalfield.
      </p>
    </div>
  );
}

/** On phones the "Start here" card sits below the map (design/Landing-Mobile.dc.html). */
function StartCard({ mine, coalfield, degree }: { mine: MapMine; coalfield: string; degree: string | null }) {
  const meta = [
    subsidiaryName(mine.company),
    `${coalfield}, ${mine.state}`,
    degree ? `${typeLabel(mine.type)}, Degree ${degree}` : typeLabel(mine.type),
  ].join(' · ');
  return (
    <div className="map-start-card card">
      <div className="map-start-card-head">
        <span className="map-start-card-dot" style={{ background: bandVar(mine.band) }} aria-hidden="true" />
        <div className="map-start-card-text">
          <Eyebrow>Start here</Eyebrow>
          <span className="map-start-card-name">{mine.name}</span>
          <span className="map-start-card-meta">{meta}</span>
        </div>
      </div>
      <Button href={mineHref(mine.id)} arrow className="map-start-card-btn">
        Open the model
      </Button>
    </div>
  );
}

const STEPS = [
  {
    title: 'Pick a mine',
    body: 'Start with a gassy underground mine. Each mine carries its gas grade, remaining reserve and expected closure year.',
  },
  {
    title: 'Set the assumptions',
    body: 'Change the gas flow, the closure year, flaring or power, and the price a credit might fetch. The answer updates as you move.',
  },
  {
    title: 'Read the break-even',
    body: 'See the credit price that covers the project, its return, and which buyers and finance structures could carry it.',
  },
] as const;

function HowItWorks() {
  return (
    <section className="map-steps" aria-labelledby="steps-title">
      <div className="page-width map-steps-inner">
        <h2 className="t-h2 map-steps-title" id="steps-title">
          One mine at a time, from gas flow to a credit price.
        </h2>
        <ol className="map-steps-list">
          {STEPS.map((s, i) => (
            <li key={s.title} className="map-step">
              <span className="num map-step-n" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="map-step-title">{s.title}</h3>
              <p className="map-step-body">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function MapPage() {
  const data = mapData();
  const start = data.mines.find((m) => m.id === START_MINE_ID);
  if (!start) throw new Error(`mines_map.json has no mine "${START_MINE_ID}"`);
  const record = mineRecord(START_MINE_ID);
  const coalfield = record?.coalfield ?? start.field;
  const degree = record?.dgmsDegree ? ROMAN[record.dgmsDegree] : null;
  const aspectRatio = `${data.viewBox[2]} / ${data.viewBox[3]}`;
  const zoom = Math.round(data.lens.box[2] / data.lens.window[2]);

  return (
    <>
      <section className="page-width map-hero">
        <div className="map-intro">
          <div className="map-intro-text">
            <Eyebrow>Coal India · mine methane</Eyebrow>
            <h1 className="t-h1">Which closing mines can pay for their own methane?</h1>
            <p className="t-lede map-lede">
              Every Coal India mine, coloured by when it is expected to close. Open a mine to see what capturing its
              methane would cost, and the carbon credit price that would cover it.
            </p>
          </div>
          <div className="map-actions">
            <Button href={mineHref(START_MINE_ID)} arrow>
              Open {start.name}
            </Button>
            <a className="map-method-link" href="#/method">
              How the model works
            </a>
          </div>
        </div>

        <Legend data={data} />

        <div className="map-figure">
          <Suspense fallback={<div className="map-frame-placeholder" style={{ aspectRatio }} />}>
            <MineMap
              data={data}
              startMine={start}
              lensLabel={`${coalfield} coalfield, ${zoom}× closer`}
              ariaLabel={mapAriaLabel(data, start, coalfield)}
            />
          </Suspense>
        </div>

        <StartCard mine={start} coalfield={coalfield} degree={degree} />
      </section>

      <Suspense fallback={null}>
        <MineBrowser data={data} />
      </Suspense>

      <HowItWorks />
    </>
  );
}
