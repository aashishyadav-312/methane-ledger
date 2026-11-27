import { scaleLinear } from 'd3-scale';
import { usdPerT } from '../../../lib/format';
import type { Waterfall } from '../../../model/waterfall';
import { waterfallSteps } from '../../../pages/MinePage/Results';
import { WATERFALL_LABEL_OVERRIDES } from '../copy';
import { barProgress, countProgress, useMorph } from '../motion';
import { DataTable, growX } from './frame';
import { labelPos, rowLayout } from './RowBars';

const BAR_PX = 16;
const ROW_PX = 30;
const TOP_PX = 4;
const VALUE_ROOM_PX = 62;
const TOTAL_GAP_PX = 8;
const CORNER_PX = 2;
const VALUE_GAP_PX = 8;
/** Parts smaller than half a cent a tonne are left out. */
const MIN_PART_USD_PER_T = 0.005;

export interface WaterfallRow {
  key: string;
  label: string;
  valueUsdPerT: number;
}

/** Build cost first, then every other cost from largest to smallest, then power sold (the mockup's order). */
export function waterfallRows(w: Waterfall): WaterfallRow[] {
  const steps = waterfallSteps(w)
    .filter((s) => Math.abs(s.valueUsdPerT) >= MIN_PART_USD_PER_T)
    .map((s) => ({ ...s, label: WATERFALL_LABEL_OVERRIDES[s.key] ?? s.label }));
  const capex = steps.filter((s) => s.key === 'capex');
  const energy = steps.filter((s) => s.key === 'energy');
  const costs = steps.filter((s) => s.key !== 'capex' && s.key !== 'energy').sort((a, b) => b.valueUsdPerT - a.valueUsdPerT);
  return [...capex, ...costs, ...energy];
}

/** `+$13.21`, `−$15.53`: each part with its sign. */
function signed(v: number): string {
  const text = usdPerT(v);
  return v > 0 && text !== '$0.00' ? `+${text}` : text;
}

export interface WaterfallChartProps {
  width: number;
  waterfall: Waterfall;
  elapsedMs: number;
}

/** What the break-even is made of: each part of P* as a floating bar, ending at the total. */
export function WaterfallChart({ width, waterfall, elapsedMs }: WaterfallChartProps) {
  const rows = waterfallRows(waterfall);
  const values = useMorph([...rows.map((r) => r.valueUsdPerT), waterfall.totalUsdPerT]);
  const total = values[rows.length];
  const starts: number[] = [];
  let run = 0;
  rows.forEach((_, i) => {
    starts.push(run);
    run += values[i];
  });
  const ends = rows.map((_, i) => starts[i] + values[i]);
  const lo = Math.min(0, total, ...starts, ...ends);
  const hi = Math.max(0, total, ...starts, ...ends);

  const l = rowLayout(width, {
    labels: [...rows.map((r) => r.label), 'Break-even'],
    barPx: BAR_PX,
    rowPx: ROW_PX,
    topPx: TOP_PX,
    valueRoomLeftPx: 0,
    valueRoomRightPx: VALUE_ROOM_PX,
  });
  const x = scaleLinear()
    .domain([lo, hi === lo ? lo + 1 : hi])
    .range([l.plotLeft, l.plotRight]);
  const totalIndex = rows.length;
  const totalTop = l.barY(totalIndex) + TOTAL_GAP_PX;
  const height = l.height(rows.length + 1, TOTAL_GAP_PX);
  const lab = labelPos(l);
  const count = countProgress(elapsedMs);
  const caption = 'What the break-even is made of, US$ per tonne of credits';

  return (
    <div className="v2r-figure">
      <svg className="v2r-svg" width={width} height={height} role="img" aria-label={caption}>
        {rows.map((r, i) => {
          const from = starts[i];
          const to = ends[i];
          const k = barProgress(elapsedMs, i);
          const x0 = x(Math.min(from, to));
          const w = Math.max(1, Math.abs(x(to) - x(from)));
          const kind = r.key === 'capex' ? 'v2r-wf-build' : r.valueUsdPerT < 0 ? 'v2r-wf-down' : 'v2r-wf-up';
          return (
            <g key={r.key} data-testid="waterfall-row">
              <text className="v2r-row-label" x={lab.x} y={l.labelY(i)} textAnchor={lab.anchor}>
                {r.label}
              </text>
              <rect
                className={kind}
                x={x0}
                y={l.barY(i)}
                width={w}
                height={BAR_PX}
                rx={CORNER_PX}
                transform={growX(x(from), k)}
              />
              <text className="v2r-value" x={x(Math.max(from, to)) + VALUE_GAP_PX} y={l.barY(i) + BAR_PX / 2 + 4}>
                {signed(values[i] * count)}
              </text>
            </g>
          );
        })}
        <line className="v2r-axis" x1={l.plotLeft} x2={l.plotRight} y1={totalTop - TOTAL_GAP_PX / 2} y2={totalTop - TOTAL_GAP_PX / 2} />
        <g data-testid="waterfall-total">
          <text
            className="v2r-row-label v2r-row-label--strong"
            x={lab.x}
            y={l.labelY(totalIndex) + TOTAL_GAP_PX}
            textAnchor={lab.anchor}
          >
            Break-even
          </text>
          <rect
            className="v2r-wf-total"
            x={x(Math.min(0, total))}
            y={totalTop}
            width={Math.max(1, Math.abs(x(total) - x(0)))}
            height={BAR_PX}
            rx={CORNER_PX}
            transform={growX(x(0), barProgress(elapsedMs, totalIndex))}
          />
          <text className="v2r-value v2r-value--strong" x={x(Math.max(0, total)) + VALUE_GAP_PX} y={totalTop + BAR_PX / 2 + 4}>
            {usdPerT(total * count)}
          </text>
        </g>
      </svg>
      <DataTable
        caption={caption}
        head={['Part', 'US$ per tonne']}
        rows={[
          ...rows.map((r) => ({ key: r.key, cells: [r.label, signed(r.valueUsdPerT)] })),
          { key: 'total', cells: ['Break-even', usdPerT(waterfall.totalUsdPerT)] },
        ]}
      />
    </div>
  );
}
