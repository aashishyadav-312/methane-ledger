import { routeHref } from '../../../app/router';
import { getMapData, getPrices, listMines } from '../../../data/load';
import { Eyebrow } from '../../../ui';
import '../../../pages/MethodPage/doc.css';
import { DATA_REQUEST_EMAIL, RESEARCH_SOURCES } from '../../../pages/SourcesPage/sources';
import { gemSource, positionCounts } from '../mineFacts';
import '../pages.css';

const MOONIDIH_ID = 'bccl-moonidih';
const GEM_URL = 'https://globalenergymonitor.org/projects/global-coal-mine-tracker/';

function Link({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/** The Sources page inside v2: the v1 page with the map positions corrected, plus Global Energy Monitor and the estimates. */
export function SourcesV2() {
  const map = getMapData();
  const moonidih = listMines().find((m) => m.id === MOONIDIH_ID);
  const priceDates = [...new Set(getPrices().flatMap((p) => (p.asOf === null ? [] : [p.asOf])))];
  const siteUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const positions = positionCounts();
  const gem = gemSource();

  return (
    <div className="page-width doc-page">
      <header className="doc-head">
        <Eyebrow>Sources</Eyebrow>
        <h1 className="t-h1">Where the data comes from</h1>
        <p className="t-lede">
          What each part of the site rests on, who made it, and how to cite or correct it. Results are indicative, at
          pre-feasibility level, and not investment advice.
        </p>
      </header>

      <div className="doc-body">
        <section className="doc-section" aria-labelledby="s-data">
          <h2 className="t-h2" id="s-data">
            Data provenance
          </h2>
          <ul>
            <li>
              <strong>Closure years.</strong> The workbook CIL_Mine_Closure_Timeline_v5.xlsx, built by Aashish Yadav from
              the Lok Sabha reserves (Unstarred Question 4259, 26 March 2025) and the Coal India production portal, read
              on 11 October 2026. A closure year is the reserve run-out year at FY2025-26 output, not an announced date.
              See <a href={routeHref('/method')}>how closure years were estimated</a>.
            </li>
            <li>
              <strong>Closed mines.</strong> Annexure II of the same Lok Sabha reply, read from its text.
            </li>
            <li>
              <strong>Boundaries.</strong> From <Link href="https://github.com/datameet/maps">DataMeet</Link> community
              maps, based on Survey of India boundaries. The map data was generated on {map.generatedAt.slice(0, 10)}.
            </li>
            <li>
              <strong>Mine positions.</strong> {positions.gem} of the {positions.total} operating mines are placed at the
              coordinates in the Global Energy Monitor Global Coal Mine Tracker. The other {positions.coalfield} are
              placed by coalfield and are approximate. See <a href={routeHref('/method')}>Mine positions on the Method
              page</a>.
            </li>
            <li>
              <strong>Moonidih.</strong> The mine&rsquo;s setting comes from the Global Methane Initiative (GMI) profile and
              the sealed-areas study listed below. Its gas, cost and capture inputs are placeholders tagged Dummy until
              CMPDI and Coal India data arrives.
              {moonidih && moonidih.sources.length > 0 ? (
                <>
                  {' '}
                  Linked from its record:{' '}
                  {moonidih.sources.map((s, i) => (
                    <span key={s.url}>
                      {i > 0 ? ', ' : null}
                      <Link href={s.url}>{s.label}</Link>
                    </span>
                  ))}
                  .
                </>
              ) : null}
            </li>
            <li>
              <strong>Every other mine.</strong> The inputs are estimates built from the mine&rsquo;s real output and
              closure year, with gas set by its coalfield, and tagged Estimated inputs. See{' '}
              <a href={routeHref('/method')}>how every mine gets inputs</a>, and{' '}
              <a href={routeHref('/assumptions')}>Assumptions</a> for each value and its source.
            </li>
            <li>
              <strong>Prices.</strong> From our research document, read {priceDates.join(' and ')}. No public price exists
              yet for coal mine methane credits, so every price is a benchmark or an estimate. See{' '}
              <a href={routeHref('/assumptions')}>Assumptions</a> for each value, its source and its quality tag.
            </li>
          </ul>
        </section>

        <section className="doc-section" aria-labelledby="s-gem" data-testid="sources-gem">
          <h2 className="t-h2" id="s-gem">
            Global Energy Monitor
          </h2>
          <p>
            Mine coordinates, and a mine-level methane estimate we show as a comparison, come from the{' '}
            <Link href={GEM_URL}>Global Coal Mine Tracker</Link> of Global Energy Monitor.
          </p>
          <p data-testid="gem-licence">{gem}</p>
          <p>
            We matched each Coal India mine to a tracker entry by name and state. The estimate is never a model input.
            Its method is gas content at mining depth times an emission factor, described on the{' '}
            <Link href="https://gem.wiki/Estimating_methane_emissions_from_coal_mines">Global Energy Monitor wiki</Link>.
          </p>
        </section>

        <section className="doc-section" aria-labelledby="s-research">
          <h2 className="t-h2" id="s-research">
            Research sources
          </h2>
          <ul>
            {RESEARCH_SOURCES.map((s) => (
              <li key={s.label}>{s.url === null ? s.label : <Link href={s.url}>{s.label}</Link>}</li>
            ))}
          </ul>
        </section>

        <section className="doc-section" aria-labelledby="s-cite">
          <h2 className="t-h2" id="s-cite">
            How to cite
          </h2>
          <p>
            Yadav, A. Methane Ledger: which closing Coal India mines can pay for their own methane. Nicholas Institute,
            Duke University. Draft for the Ranchi workshop, January 2027. {siteUrl}
          </p>
        </section>

        <section className="doc-section" aria-labelledby="s-contact">
          <h2 className="t-h2" id="s-contact">
            Send us data
          </h2>
          <p>
            If you hold mine data that could replace a placeholder or an estimate, or you find an error, write to{' '}
            <a href={`mailto:${DATA_REQUEST_EMAIL}`}>{DATA_REQUEST_EMAIL}</a>. The{' '}
            <a href={routeHref('/data')}>Data page</a> shows the template to fill in.
          </p>
        </section>
      </div>
    </div>
  );
}
