import type { ExplainTerm } from '../../model/explain';
import { pct, tonnes, usdM, usdPerT } from '../../lib/format';
import { Eyebrow } from '../../ui';
import { mineHref } from '../../app/router';
import { MINE_ID, num, shareText, usdWhole, workedCase } from './worked';
import './doc.css';

const TECH_NAME = { power: 'Gas engines', flare: 'Enclosed flare', rto: 'Regenerative thermal oxidiser' } as const;

function termValue(t: ExplainTerm): string {
  if (t.unit === 'fraction') return pct(t.value, 0);
  if (t.unit === 'tCO2e') return tonnes(t.value);
  return usdM(t.value);
}

export function MethodPage() {
  const w = workedCase();
  const { drained, thresholds: th, result, explanation } = w;
  const moonidihHref = mineHref(MINE_ID);
  const closureYear = w.mine.closureYear;

  return (
    <div className="page-width doc-page">
      <header className="doc-head">
        <Eyebrow>Method</Eyebrow>
        <h1 className="t-h1">How the model works</h1>
        <p className="t-lede">
          A plain-language guide for mine planners: how the model turns a mine&rsquo;s methane into carbon credits, and
          into one number, the credit price needed to break even.
        </p>
      </header>

      <div className="doc-body">
        <section className="doc-section" aria-labelledby="m-does">
          <h2 className="t-h2" id="m-does">
            What the model does
          </h2>
          <p>
            For one mine, the model estimates the methane it gives off each year, how much can be captured and destroyed,
            what the equipment costs, and what credits and electricity would earn. It then asks one question: what
            credit price makes the project&rsquo;s net present value (NPV) equal to zero? That is the break-even price.
          </p>
          <p>
            Results are indicative, at pre-feasibility level, and not investment advice. Inputs tagged Dummy are
            placeholders until data arrives from the Central Mine Planning and Design Institute (CMPDI) and Coal India.
          </p>
        </section>

        <section className="doc-section" aria-labelledby="m-streams">
          <h2 className="t-h2" id="m-streams">
            The three gas streams
          </h2>
          <p>A mine has up to three streams of methane. Each is costed and credited on its own, then summed.</p>
          <div className="doc-table-wrap">
            <table className="doc-table">
              <caption className="sr-only">The three gas streams and how each is destroyed</caption>
              <thead>
                <tr>
                  <th scope="col">Stream</th>
                  <th scope="col">What it is</th>
                  <th scope="col">How it is destroyed</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Drained gas</th>
                  <td>Gas pulled from the seams or the goaf (the caved area behind the face) by boreholes.</td>
                  <td>
                    Gas engines making power from {shareText(th.powerMinConc)} methane, if the mine can use the power.
                    Otherwise an enclosed flare, from {shareText(th.flareMinConc)}.
                  </td>
                </tr>
                <tr>
                  <th scope="row">Ventilation air methane (VAM)</th>
                  <td>Methane carried out in the main ventilation air, at a fraction of a percent.</td>
                  <td>
                    A regenerative thermal oxidiser (RTO) when methane is {shareText(th.rtoMinConc)} or more. Below
                    that the page says &ldquo;Too dilute to destroy&rdquo;.
                  </td>
                </tr>
                <tr>
                  <th scope="row">Abandoned mine methane (AMM)</th>
                  <td>Gas that keeps seeping from sealed workings after closure, falling each year.</td>
                  <td>The same rule as drained gas.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            The closure year decides which years have drained gas and ventilation air, and which only abandoned mine
            methane. Gas between {shareText(th.explosiveLower)} and {shareText(th.explosiveUpper)} methane in air
            can explode. The model warns about it and never offers to transport or use it.
          </p>
        </section>

        <section className="doc-section" aria-labelledby="m-credits">
          <h2 className="t-h2" id="m-credits">
            From gas to credits
          </h2>
          <p>
            Each tonne of methane destroyed earns credits for the warming avoided, minus the carbon dioxide made by
            burning it. The emission reduction (ER) formula, in tonnes of carbon dioxide equivalent (tCO2e):
          </p>
          <p className="doc-formula">
            ER = gas &times; capture share &times; tonnes per Mm&sup3; &times; destruction efficiency &times; (GWP
            &minus; CO<sub>2</sub> from burning)
          </p>
          <p>
            GWP is the global warming potential: the tonnes of carbon dioxide one tonne of methane equals over a hundred
            years. Here it is {num(w.gwp)}, and burning a tonne of methane makes{' '}
            {num(drained.co2PerCh4)} tonnes of carbon dioxide.
          </p>
          <p>
            Moonidih&rsquo;s drained gas, first year: {num(drained.ch4Mm3)} Mm&sup3; &times;{' '}
            {shareText(drained.captureEff)} captured &times; {num(drained.tonnesPerMm3)} t per Mm&sup3; &times;{' '}
            {shareText(drained.destructionEff)} destroyed &times; {num(drained.netTco2ePerTCh4)} ={' '}
            <span className="num">{tonnes(drained.erTco2e)}</span> of credits. Over {w.creditingYears} years the whole
            mine earns <span className="num">{tonnes(result.erTotalTco2e)}</span>.
          </p>
        </section>

        <section className="doc-section" aria-labelledby="m-costs">
          <h2 className="t-h2" id="m-costs">
            Costs and revenue
          </h2>
          <ul>
            <li>
              <strong>Build cost.</strong> Equipment sized on the peak year, a monitoring kit and a contingency of{' '}
              {shareText(w.contingency)}. Moonidih: <span className="num">{usdM(result.capexUsd)}</span>.
            </li>
            <li>
              <strong>Running cost.</strong> Upkeep for each technology and for drainage.
            </li>
            <li>
              <strong>Credit revenue.</strong> Credits &times; (price &times; (1 &minus; broker share) &minus; issuance
              fee). The broker keeps {shareText(w.brokerShare)}; the fee is{' '}
              <span className="num">{usdPerT(w.issuanceFeeUsdPerT)}</span> a credit.
            </li>
            <li>
              <strong>Electricity.</strong> Gas engines sell power at <span className="num">{usdPerT(w.powerPriceUsdPerMwh)}</span>{' '}
              per MWh, the grid power the mine avoids.
            </li>
            <li>
              <strong>Monitoring, reporting and verification (MRV).</strong>{' '}
              <span className="num">{usdWhole(w.verificationCostUsdPerYr)}</span> each year, and{' '}
              <span className="num">{usdWhole(w.validationCostUsd)}</span> once in the first year.
            </li>
          </ul>
        </section>

        <section className="doc-section" aria-labelledby="m-breakeven">
          <h2 className="t-h2" id="m-breakeven">
            The break-even price
          </h2>
          <p>
            NPV rises in a straight line with the credit price, so the break-even has a closed form: everything the
            project costs, divided by the credits it earns after the broker&rsquo;s share, both in today&rsquo;s money
            (discounted at {shareText(w.discountRate)} a year, in real terms).
          </p>
          <p className="doc-formula">
            break-even price = (build cost + running cost + MRV + fees &minus; electricity sold) &divide; (credits kept
            after the broker)
          </p>
          <p>
            On the default inputs Moonidih breaks even at{' '}
            <span className="num">{explanation.breakevenUsdPerT === null ? '–' : usdPerT(explanation.breakevenUsdPerT)}</span>{' '}
            a tonne when it closes in {closureYear}.
            {w.targetClosureYear !== null && w.targetBreakevenUsdPerT !== null ? (
              <>
                {' '}
                If it mines at its FY2026-27 target output it closes in {w.targetClosureYear} and the break-even is{' '}
                <span className="num">{usdPerT(w.targetBreakevenUsdPerT)}</span>.
              </>
            ) : null}{' '}
            Negative means electricity alone pays for it. Try your own inputs in the{' '}
            <a href={moonidihHref}>Moonidih model</a>.
          </p>
        </section>

        <section className="doc-section" aria-labelledby="m-credit-rules">
          <h2 className="t-h2" id="m-credit-rules">
            What counts for credits
          </h2>
          <ul>
            <li>
              <strong>Regulatory surplus.</strong> A reduction the law already requires earns no credits. Drainage is
              required for safety in gassy mines (Degree II and III on the Directorate General of Mines Safety, DGMS,
              scale); destroying the gas is not. A &ldquo;destruction mandated&rdquo; flag sets a stream&rsquo;s credits to
              zero and keeps its costs.
              {w.mandatedBreakevenUsdPerT !== null ? (
                <>
                  {' '}
                  Mandated at Moonidih, the break-even would be{' '}
                  <span className="num">{usdPerT(w.mandatedBreakevenUsdPerT)}</span>.
                </>
              ) : null}
            </li>
            <li>
              <strong>ACM0008.</strong> Verra&rsquo;s coal mine methane methodology. v1 credits methane destruction only.
            </li>
            <li>
              <strong>CCTS.</strong> India&rsquo;s Carbon Credit Trading Scheme, the likely second market. Only Verra
              credits are sellable today.
            </li>
            <li>
              <strong>Benchmark only.</strong> {w.benchmarkLabels.join(', ')} are benchmarks. Coal India cannot sell
              into them.
            </li>
          </ul>
        </section>

        <section className="doc-section" aria-labelledby="m-leaves-out">
          <h2 className="t-h2" id="m-leaves-out">
            What v1 leaves out
          </h2>
          <ul>
            <li>Gas sales, tax and depreciation.</li>
            <li>Credit for grid electricity displaced, and emissions from RTO fan power.</li>
            <li>Reuse of engines on abandoned mine methane after closure. v1 costs them twice.</li>
            <li>Surface wells ahead of the highwall, which could make opencast methane abatable.</li>
            <li>Real mine data. Every gas input is a placeholder until CMPDI and Coal India data arrives.</li>
            <li>
              One quirk, kept to match the reference model: drainage upkeep is still charged after the mine closes.
            </li>
          </ul>
        </section>

        <section className="doc-section" aria-labelledby="m-closure">
          <h2 className="t-h2" id="m-closure">
            How closure years were estimated
          </h2>
          <p>The map and model use a reserve run-out year, not an announced closure date. The workbook has five steps:</p>
          <ol>
            <li>
              Start from the extractable reserve on 31 March 2024, from the Lok Sabha reply
              {w.workbook.reserve2024Mt !== null ? (
                <>
                  {' '}
                  (Moonidih: <span className="num">{num(w.workbook.reserve2024Mt)} Mt</span>)
                </>
              ) : null}
              .
            </li>
            <li>Take away the output since then, from the Coal India production portal.</li>
            <li>
              Divide what is left by the FY2025-26 output
              {w.workbook.rateMtPerYr !== null ? (
                <>
                  {' '}
                  (Moonidih: <span className="num">{num(w.workbook.rateMtPerYr)} Mt</span> a year)
                </>
              ) : null}
              .
            </li>
            <li>
              Add the years left to the date to get the run-out year
              {w.workbook.runoutYear !== null ? (
                <>
                  {' '}
                  (Moonidih: <span className="num">{w.workbook.runoutYear}</span>)
                </>
              ) : null}
              .
            </li>
            <li>
              Repeat at the FY2026-27 target output
              {w.workbook.yearAtTarget !== null ? (
                <>
                  {' '}
                  (Moonidih: <span className="num">{w.workbook.yearAtTarget}</span>)
                </>
              ) : null}{' '}
              and at the environmental clearance (EC) capacity, as checks.
            </li>
          </ol>
        </section>

        <section className="doc-section" aria-labelledby="m-positions">
          <h2 className="t-h2" id="m-positions">
            Positions on the map are approximate
          </h2>
          <p>
            No source gives mine coordinates. The map places each of the {w.operatingMines} operating mines near the
            centre of its coalfield, with a small offset. A dot shows the coalfield, not the shaft.
          </p>
        </section>
      </div>

      <details className="doc-details">
        <summary>Technical detail</summary>
        <div className="doc-details-body">
          <div>
            <h3>Timeline</h3>
            <p>
              Active years = closure year &minus; start year + 1, held between zero and the crediting period. The
              remaining years are post-closure. Production is held flat until closure unless a yearly series is given.
            </p>
          </div>
          <div>
            <h3>Gas</h3>
            <p>
              Liberated gas = production &times; specific emission (m&sup3; per tonne). Drained and ventilation shares
              split it. Measured volumes beat derived ones. Moonidih uses measured volumes.
            </p>
          </div>
          <div>
            <h3>Abandoned mine methane</h3>
            <p className="doc-formula">q(k) = q<sub>0</sub> &divide; (1 + b &middot; D &middot; k)<sup>1/b</sup></p>
            <p>
              k counts years after closure. q<sub>0</sub> is a share of the last active year&rsquo;s gas
              {w.mine.amm ? (
                <>
                  : {shareText(w.mine.amm.fAmm)} at Moonidih, with D = {num(w.mine.amm.declineD)} a year and b ={' '}
                  {num(w.mine.amm.hyperbolicB)}
                </>
              ) : null}
              . A flooding factor can cut the flow from a chosen year.
            </p>
          </div>
          <div>
            <h3>Sizing and cash flow</h3>
            <p>
              Engines are sized on peak captured gas, a flare on peak volume, and an RTO on peak airflow. Year 0 is the
              build year: cash = &minus;build cost. Each later year: cash = credit revenue + electricity &minus; running
              cost &minus; MRV. IRR (internal rate of return) is found by scanning discount rates for the first sign
              change in NPV and then bisecting. Payback is the first year cumulative cash is not negative.
            </p>
          </div>
          <div>
            <h3>Moonidih break-even terms</h3>
            <div className="doc-table-wrap">
              <table className="doc-table">
                <caption className="sr-only">The terms of the Moonidih break-even formula</caption>
                <thead>
                  <tr>
                    <th scope="col">Term</th>
                    <th scope="col" className="num-col">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...explanation.numerator, ...explanation.denominator].map((t) => (
                    <tr key={t.key}>
                      <th scope="row">{t.label}</th>
                      <td className="num-col num">{termValue(t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3>Moonidih streams</h3>
            <div className="doc-table-wrap">
              <table className="doc-table">
                <caption className="sr-only">Technology, credits and break-even for each Moonidih stream</caption>
                <thead>
                  <tr>
                    <th scope="col">Stream</th>
                    <th scope="col">Technology</th>
                    <th scope="col" className="num-col">
                      Credits
                    </th>
                    <th scope="col" className="num-col">
                      Break-even
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.streams.map((s) => (
                    <tr key={s.kind}>
                      <th scope="row">{s.label}</th>
                      <td>{s.tech === null ? 'Too dilute to destroy' : TECH_NAME[s.tech]}</td>
                      <td className="num-col num">{s.tech === null ? '–' : tonnes(s.erTotalTco2e)}</td>
                      <td className="num-col num">{s.breakevenUsdPerT === null ? '–' : usdPerT(s.breakevenUsdPerT)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="doc-note">
              A stream&rsquo;s own break-even leaves out the shared monitoring, MRV and fees, so it is lower than the mine
              total. A stream that is too dilute to destroy has no break-even.
            </p>
          </div>
        </div>
      </details>
    </div>
  );
}
