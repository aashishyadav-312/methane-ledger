import { useState, useSyncExternalStore } from 'react';
import { getPrices } from '../../data/load';
import { getOverrides, reset, setOverride, subscribe, type Overrides } from '../../state/session';
import { Button, Chip, Eyebrow, Tag } from '../../ui';
import '../MethodPage/doc.css';
import { num } from '../MethodPage/worked';
import { EditableValue } from './EditableValue';
import { constantsTable, settingsTable, techTables, type AssumptionRow, type AssumptionTable } from './rows';
import './AssumptionsPage.css';

function valueText(v: number | number[], unit = ''): string {
  if (unit === 'year') return String(v); // a year has no thousands separator
  return Array.isArray(v) ? v.map((x) => num(x, 6)).join(', ') : num(v, 6);
}

function ValueCell({ row, overrides, editing }: { row: AssumptionRow; overrides: Overrides; editing: boolean }) {
  const override = overrides[row.path];
  const current = typeof override === 'number' ? override : row.value;
  const changed = typeof override === 'number';
  const text = (v: number | number[]) => valueText(v, row.unit);
  if (editing && row.editable && typeof row.value === 'number' && typeof current === 'number') {
    return (
      <>
        <EditableValue path={row.path} label={row.label} unit={row.unit} defaultValue={row.value} value={current} />
        {changed ? <span className="assume-was">was {text(row.value)}</span> : null}
      </>
    );
  }
  return (
    <>
      <span className="num">{text(current)}</span>
      {changed && typeof row.value === 'number' ? <span className="assume-was">was {text(row.value)}</span> : null}
    </>
  );
}

function RowReset({ row, overrides }: { row: AssumptionRow; overrides: Overrides }) {
  if (typeof overrides[row.path] !== 'number') return null;
  return (
    <button
      type="button"
      className="assume-reset"
      aria-label={`Reset ${row.label} to ${valueText(row.value, row.unit)}`}
      onClick={() => setOverride(row.path, undefined)}
    >
      Reset
    </button>
  );
}

function AssumptionTableView({
  table,
  overrides,
  editing,
  captionHidden = false,
}: {
  table: AssumptionTable;
  overrides: Overrides;
  editing: boolean;
  /** Hide the caption when a heading above the table already says it. */
  captionHidden?: boolean;
}) {
  return (
    <div className="doc-table-wrap">
      <table className="doc-table assume-table">
        <caption className={captionHidden ? 'sr-only' : undefined}>{table.title}</caption>
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
          {table.rows.map((row) => (
            <tr key={row.path} data-changed={typeof overrides[row.path] === 'number' ? 'true' : undefined}>
              <th scope="row">{row.label}</th>
              <td className="assume-value">
                <ValueCell row={row} overrides={overrides} editing={editing} />
                {editing ? <RowReset row={row} overrides={overrides} /> : null}
              </td>
              <td>{row.unit}</td>
              <td className="assume-source">{row.source}</td>
              <td>
                <Tag kind={row.quality} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriceTable() {
  const prices = getPrices();
  return (
    <div className="doc-table-wrap">
      <table className="doc-table assume-table">
        <caption>Credit price scenarios</caption>
        <thead>
          <tr>
            <th scope="col">Scenario</th>
            <th scope="col">Price</th>
            <th scope="col">Can Coal India sell here?</th>
            <th scope="col">As of</th>
            <th scope="col">Source</th>
            <th scope="col">Quality</th>
          </tr>
        </thead>
        <tbody>
          {prices.map((p) => (
            <tr key={p.id}>
              <th scope="row">
                {p.label}
                <span className="assume-was">{p.note}</span>
              </th>
              <td>
                {p.priceUsdPerT === null ? (
                  <span>Your own</span>
                ) : (
                  <>
                    <span className="num">{valueText(p.priceUsdPerT.value)}</span>
                    <span className="assume-was">{p.priceUsdPerT.unit}</span>
                  </>
                )}
              </td>
              <td>{p.badge === null ? 'Not applicable' : p.badge.kind === 'benchmark' ? 'Benchmark only' : p.badge.label}</td>
              <td>{p.asOf ?? 'Not applicable'}</td>
              <td className="assume-source">{p.priceUsdPerT === null ? 'Set on the mine page' : p.priceUsdPerT.source}</td>
              <td>{p.priceUsdPerT === null ? null : <Tag kind={p.priceUsdPerT.quality} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AssumptionsPage() {
  const overrides = useSyncExternalStore(subscribe, getOverrides, getOverrides);
  const [editing, setEditing] = useState(false);
  const changed = Object.keys(overrides).length;
  const settings = settingsTable();
  const tech = techTables();
  const constants = constantsTable();

  return (
    <div className="page-width doc-page">
      <header className="doc-head">
        <Eyebrow>Assumptions</Eyebrow>
        <h1 className="t-h1">What the model assumes</h1>
        <p className="t-lede">
          Every input the model uses, with its unit, source and data quality. Tags show how far to trust each one.
          Dummy values are placeholders until real data arrives.
        </p>
        <div className="assume-toolbar">
          <Chip pressed={editing} onPressedChange={setEditing}>
            Change for this session
          </Chip>
          <span className="assume-hint">
            Changes apply to every mine page and last only for this browser tab.
          </span>
        </div>
      </header>

      {changed > 0 ? (
        <div className="assume-banner" role="status">
          <p>
            {changed === 1 ? '1 assumption is' : `${changed} assumptions are`} changed for this session. The mine pages
            use the changed values.
          </p>
          <Button variant="secondary" onClick={reset}>
            Reset all
          </Button>
        </div>
      ) : null}

      <div className="assume-sections">
        <section className="doc-section" aria-labelledby="a-settings">
          <h2 className="t-h2" id="a-settings">
            Settings
          </h2>
          <p className="doc-note">
            The crediting period and credit price have their own controls on the mine page, so only the other settings
            change here. The first crediting year is a model convention.
          </p>
          <AssumptionTableView table={settings} overrides={overrides} editing={editing} captionHidden />
        </section>

        <section className="doc-section" aria-labelledby="a-tech">
          <h2 className="t-h2" id="a-tech">
            Technology library
          </h2>
          {tech.map((table) => (
            <AssumptionTableView key={table.id} table={table} overrides={overrides} editing={editing} />
          ))}
        </section>

        <section className="doc-section" aria-labelledby="a-constants">
          <h2 className="t-h2" id="a-constants">
            Constants
          </h2>
          <AssumptionTableView table={constants} overrides={overrides} editing={editing} captionHidden />
        </section>

        <section className="doc-section" aria-labelledby="a-prices">
          <h2 className="t-h2" id="a-prices">
            Price scenarios
          </h2>
          <p className="doc-note">
            No public price exists yet for coal mine methane credits. These are benchmarks. Only the ones marked
            sellable can be sold by Coal India. Prices are fixed in v1; set any price on the mine page.
          </p>
          <PriceTable />
        </section>
      </div>
    </div>
  );
}
