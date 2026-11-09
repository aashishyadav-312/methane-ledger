// "What it costs" (PLAN_V1 Step 13b): the cost build-up behind the break-even, as two tables. Every figure comes
// from `evaluate`'s `costs` breakdown; the currency follows the page's US$ / ₹ toggle.
import { COST_CATEGORIES, OPEX_TYPES } from '../../model/costs';
import { STREAM_LABELS } from '../../model/constants';
import type { CostBreakdown, CostCategory, CostParams, OpexType, Result, Settings } from '../../model/types';
import { inr, inrCr, pct, usdMillions } from '../../lib/format';
import type { Units } from './units';

const CATEGORY_LABELS: Record<CostCategory, string> = {
  equipment: 'Equipment',
  materials: 'Materials',
  labour: 'Installation labour',
  civil: 'Civil works',
};

const OPEX_LABELS: Record<OpexType, string> = {
  om: 'Operation and maintenance, without staff',
  overhaul: 'Engine overhauls',
  staff: 'Staff',
  insurance: 'Insurance',
  fan_power: 'Fan power for the oxidiser',
  decommissioning: 'Decommissioning, in the last year',
};

type CapexItem = CostBreakdown['capexItems'][number];

/** Row order and names for the capex table. Anything else falls back to the stream and item names. */
const CAPEX_ROWS: { key: string; label: string }[] = [
  { key: 'drained:power', label: 'Engines' },
  { key: 'drained:flare', label: 'Flare' },
  { key: 'drained:drainage', label: 'Drainage' },
  { key: 'vam:rto', label: 'Ventilation-air oxidiser' },
  { key: 'amm:power', label: 'After-closure engines' },
  { key: 'amm:flare', label: 'After-closure flare' },
  { key: 'amm:drainage', label: 'After-closure drainage' },
  { key: 'site:grid_connection', label: 'Grid connection' },
  { key: 'site:monitoring', label: 'Monitoring' },
];

/** USD amounts to two places in millions, so small lines such as monitoring still show. */
const TABLE_USD_DIGITS = 2;

export interface CapexRow {
  key: string;
  label: string;
  byCategory: Record<CostCategory, number>;
  totalUsd: number;
}

const zeroCategories = (): Record<CostCategory, number> =>
  Object.fromEntries(COST_CATEGORIES.map((c) => [c, 0])) as Record<CostCategory, number>;

/** The capex items as table rows: one row per stream and item, split into the four categories. */
export function capexRows(items: CapexItem[]): CapexRow[] {
  const rows = new Map<string, CapexRow>();
  for (const it of items) {
    const key = `${it.stream}:${it.item}`;
    let row = rows.get(key);
    if (row === undefined) {
      const known = CAPEX_ROWS.find((r) => r.key === key);
      const stream = it.stream === 'site' ? 'Site' : STREAM_LABELS[it.stream];
      row = { key, label: known?.label ?? `${stream}: ${it.item}`, byCategory: zeroCategories(), totalUsd: 0 };
      rows.set(key, row);
    }
    row.byCategory[it.category] += it.usd;
    row.totalUsd += it.usd;
  }
  const order = (key: string) => {
    const i = CAPEX_ROWS.findIndex((r) => r.key === key);
    return i < 0 ? CAPEX_ROWS.length : i;
  };
  return [...rows.values()].sort((a, b) => order(a.key) - order(b.key));
}

export interface CostCardProps {
  result: Result;
  settings: Settings;
  costs: CostParams;
  units: Units;
}

export function CostCard({ result, settings, costs, units }: CostCardProps) {
  const breakdown = result.costs;
  const money = (usd: number) =>
    units.currency === 'inr' ? inr(usd, units.usdToInr) : usdMillions(usd, TABLE_USD_DIGITS);

  return (
    <section className="card mine-costs" aria-labelledby="mine-costs-title" data-testid="cost-card">
      <h2 id="mine-costs-title" className="mine-card-title">
        What it costs
      </h2>
      {breakdown === undefined ? (
        <p className="control-note" data-testid="cost-card-v1">
          This view uses v1&apos;s all-in unit costs, which do not split into equipment, materials, labour and civil
          works. Switch the cost basis to the India build-up under All assumptions, Costs, to see the split.
        </p>
      ) : (
        <CostTables
          breakdown={breakdown}
          result={result}
          settings={settings}
          costs={costs}
          units={units}
          money={money}
        />
      )}
    </section>
  );
}

function CostTables({
  breakdown,
  result,
  settings,
  costs,
  units,
  money,
}: CostCardProps & { breakdown: CostBreakdown; money: (usd: number) => string }) {
  const rows = capexRows(breakdown.capexItems);
  const totals = zeroCategories();
  for (const r of rows) for (const c of COST_CATEGORIES) totals[c] += r.byCategory[c];
  const totalUsd = rows.reduce((s, r) => s + r.totalUsd, 0);
  const n = result.years.length;
  const opexRows = OPEX_TYPES.map((t) => ({
    type: t,
    firstUsd: breakdown.opexByType[t][0] ?? 0,
    periodUsd: breakdown.opexByType[t].reduce((a, b) => a + b, 0),
  })).filter((r) => r.periodUsd !== 0);
  const opexFirst = opexRows.reduce((s, r) => s + r.firstUsd, 0);
  const opexPeriod = opexRows.reduce((s, r) => s + r.periodUsd, 0);

  // Headcount from the model's own staff line: staff cost / cost per person.
  const staffUsdPerPerson = settings.usdToInr > 0 ? costs.staffCostInr / settings.usdToInr : 0;
  const staffFirst = breakdown.opexByType.staff[0] ?? 0;
  const peopleFirst = staffUsdPerPerson > 0 ? Math.round(staffFirst / staffUsdPerPerson) : 0;
  const personYears =
    staffUsdPerPerson > 0 ? Math.round(breakdown.opexByType.staff.reduce((a, b) => a + b, 0) / staffUsdPerPerson) : 0;

  return (
    <>
      <h3 className="t-caps mine-costs-sub">Build cost</h3>
      <div className="mine-table-wrap">
        <table className="mine-table mine-cost-table" data-testid="capex-table">
          <thead>
            <tr>
              <th scope="col">Item</th>
              {COST_CATEGORIES.map((c) => (
                <th key={c} scope="col" className="num-col">
                  {CATEGORY_LABELS[c]}
                </th>
              ))}
              <th scope="col" className="num-col">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} data-row={r.key}>
                <th scope="row">{r.label}</th>
                {COST_CATEGORIES.map((c) => (
                  <td key={c} className="num num-col">
                    {r.byCategory[c] === 0 ? '' : money(r.byCategory[c])}
                  </td>
                ))}
                <td className="num num-col">{money(r.totalUsd)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="mine-cost-total" data-row="total">
              <th scope="row">Total</th>
              {COST_CATEGORIES.map((c) => (
                <td key={c} className="num num-col" data-category={c}>
                  {money(totals[c])}
                </td>
              ))}
              <td className="num num-col" data-testid="capex-total">
                {money(totalUsd)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="control-note">
        Includes owner&apos;s costs ({pct(costs.ownersCost, 0)}) and contingency ({pct(settings.contingency, 0)}).
        {settings.grantShare > 0
          ? ` After the ${pct(settings.grantShare, 0)} grant, the project pays ${money(result.capexUsd)}.`
          : ''}
      </p>

      <h3 className="t-caps mine-costs-sub">Running cost</h3>
      <div className="mine-table-wrap">
        <table className="mine-table mine-cost-table" data-testid="opex-table">
          <thead>
            <tr>
              <th scope="col">Cost</th>
              <th scope="col" className="num-col">
                First year
              </th>
              <th scope="col" className="num-col">
                All {n} years
              </th>
            </tr>
          </thead>
          <tbody>
            {opexRows.map((r) => (
              <tr key={r.type} data-row={r.type}>
                <th scope="row">{OPEX_LABELS[r.type]}</th>
                <td className="num num-col">{money(r.firstUsd)}</td>
                <td className="num num-col">{money(r.periodUsd)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="mine-cost-total">
              <th scope="row">Total</th>
              <td className="num num-col">{money(opexFirst)}</td>
              <td className="num num-col">{money(opexPeriod)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="control-note num" data-testid="staff-line">
        Staff: {peopleFirst} {peopleFirst === 1 ? 'person' : 'people'} in the first year × {inrCr(costs.staffCostInr)} a
        person-year, {personYears} person-years over the period, at ₹{units.usdToInr} per $.
      </p>
    </>
  );
}
