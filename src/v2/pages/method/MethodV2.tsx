import { routeHref } from '../../../app/router';
import { getEstimationParams } from '../../../data/estimation';
import { MethodPage } from '../../../pages/MethodPage';
import { num, shareText } from '../../../pages/MethodPage/worked';
import { listMinesV2 } from '../../map/data';
import { coalfieldDisplayName, positionCounts } from '../mineFacts';
import '../pages.css';

/** "How every mine gets inputs": PLAN_V2 Appendix B in five bullets. Every number comes from `data/estimation.json`. */
function InputsSection() {
  const p = getEstimationParams();
  const fieldsByGrade = (grade: 1 | 2 | 3): string[] =>
    Object.entries(p.degreeByField)
      .filter(([, g]) => g === grade)
      .map(([field]) => coalfieldDisplayName(field));
  const list = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
  const mines = listMinesV2();
  const withGem = mines.filter((m) => m.gemMethaneMm3 !== null).length;
  const d1 = p.byDegree['1'];
  const d2 = p.byDegree['2'];
  const d3 = p.byDegree['3'];
  return (
    <section className="doc-section" aria-labelledby="m-inputs" data-testid="method-inputs">
      <h2 className="t-h2" id="m-inputs">
        How every mine gets inputs
      </h2>
      <p>
        Only Moonidih has a record of its own, and its gas inputs are tagged{' '}
        <span className="tag tag-illustrative">Illustrative inputs</span> until measured data arrives. Every other mine
        runs on inputs the site estimates, tagged <span className="tag tag-estimated">Estimated inputs</span>, until
        Coal India or the Central Mine Planning and Design Institute (CMPDI) supplies measured data. A mine with a
        record always uses the record.
      </p>
      <ul>
        <li>
          <strong>Output and closure year are real.</strong> Output is the FY2025-26 output, held flat to closure. The
          closure year is the reserve run-out year from the closure workbook, described above.
        </li>
        <li>
          <strong>Gassiness comes from the coalfield, until a mine-wise list arrives.</strong> The Directorate General of
          Mines Safety (DGMS) grades each mine from Degree I, the least gassy, to Degree III. The site has no mine-wise
          list yet, so a mine takes the grade of its coalfield: Degree III for {list(fieldsByGrade(3))}; Degree II for{' '}
          {list(fieldsByGrade(2))}; Degree I everywhere else.
        </li>
        <li>
          <strong>Methane is output times emission per tonne.</strong> Methane in a year = output &times; underground
          share &times; emission per tonne of coal. Emission per tonne is {num(d1.specificEmissionM3PerT)} m&sup3; at
          Degree I, {num(d2.specificEmissionM3PerT)} at Degree II and {num(d3.specificEmissionM3PerT)} at Degree III,
          and {num(p.opencastSpecificEmissionM3PerT)} in opencast mines. A mixed mine counts{' '}
          {shareText(p.mixedUndergroundShare)} of its output as underground. Of that methane, {shareText(d2.drainedShare)}{' '}
          at Degree II and {shareText(d3.drainedShare)} at Degree III is drained, and the rest leaves in the ventilation
          air. After closure, gas starts at {shareText(p.afterClosure.fAmm)} of the last year&rsquo;s total.
        </li>
        <li>
          <strong>Global Energy Monitor (GEM) is a comparison, not an input.</strong> The Global Coal Mine Tracker gives
          a mine-level methane estimate for {withGem} of the {mines.length} mines. Its method is gas content at mining
          depth times an emission factor. We keep it as a comparison for our own estimate and never use it as a model
          input.
        </li>
        <li>
          <strong>Opencast and Degree I mines are not abatable.</strong> An opencast mine has no concentrated stream to
          capture. A Degree I mine has no drained gas, and its ventilation air holds {shareText(d1.vamConc)} methane,
          below the {shareText(p.oxidiserMinVamConc)} an oxidiser needs. These mines show a reason instead of a
          break-even.
        </li>
      </ul>
      <p>
        <a href={routeHref('/assumptions')}>Every estimation value is on the Assumptions page</a>, with its source.
      </p>
    </section>
  );
}

/** "Mine positions": where the dots come from, with the match count from the data build. */
function PositionsSection() {
  const { gem, coalfield, total } = positionCounts();
  return (
    <section className="doc-section" aria-labelledby="m-positions" data-testid="method-positions">
      <h2 className="t-h2" id="m-positions">
        Mine positions
      </h2>
      <p>
        Of the {total} operating mines, {gem} sit at the coordinates Global Energy Monitor gives for them. We matched
        each Coal India mine to a Global Coal Mine Tracker entry by name and state, and checked that the point lies near
        the mine&rsquo;s coalfield.
      </p>
      <p>
        The other {coalfield} {coalfield === 1 ? 'has' : 'have'} no match, so the map places{' '}
        {coalfield === 1 ? 'it' : 'them'} near the centre of the coalfield, with a small offset. A dot placed that way
        shows the coalfield, not the shaft.
      </p>
    </section>
  );
}

/** The Method page inside v2: the v1 page, with its closing positions section replaced by the two v2 sections. */
export function MethodV2() {
  return (
    <MethodPage
      positionsSection={
        <>
          <InputsSection />
          <PositionsSection />
        </>
      }
    />
  );
}
