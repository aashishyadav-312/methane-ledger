import { AssumptionsPage } from '../../../pages/AssumptionsPage';
import { Tag } from '../../../ui';
import '../pages.css';
import { estimationGroups, type EstimationGroup } from './estimationRows';

function GroupTable({ group }: { group: EstimationGroup }) {
  return (
    <div className="doc-table-wrap">
      <table className="doc-table assume-table">
        <caption>{group.title}</caption>
        <thead>
          <tr>
            <th scope="col">Assumption</th>
            <th scope="col">Value</th>
            <th scope="col">Unit</th>
            <th scope="col">Source</th>
            <th scope="col">Quality</th>
          </tr>
        </thead>
        <tbody>
          {group.rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">{r.label}</th>
              <td className="assume-value">
                <span className="num">{r.valueText}</span>
              </td>
              <td>{r.unit}</td>
              <td className="assume-source">{r.source}</td>
              <td>
                <Tag kind={r.quality} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The estimation parameters: the inputs every mine without a record is given (PLAN_V2 Appendix B). */
function EstimationSection() {
  const groups = estimationGroups();
  return (
    <div className="page-width doc-page">
      <div className="doc-body">
        <section className="doc-section" aria-labelledby="a-estimation" data-testid="estimation-table">
          <h2 className="t-h2" id="a-estimation">
            Estimated inputs for every mine
          </h2>
          <p className="doc-note">
            A mine without a record gets its inputs from these values, together with its real output and closure year.
            Every one is a first estimate, tagged Estimated, until a mine-wise DGMS list and measured gas data arrive. A
            mine with a record, which today is Moonidih, never uses them. The Method page explains how they combine.
          </p>
          {groups.map((g) => (
            <GroupTable key={g.id} group={g} />
          ))}
        </section>
      </div>
    </div>
  );
}

/** The Assumptions page inside v2: the v1 tables, then the estimation parameters. */
export function AssumptionsV2() {
  return (
    <div className="v2-pages-stack">
      <AssumptionsPage />
      <EstimationSection />
    </div>
  );
}
