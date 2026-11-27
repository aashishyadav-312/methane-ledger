import { scaleLinear } from 'd3-scale';
import { DASH, usdPerT } from '../../../lib/format';
import type { FinancingResult } from '../../../model/financing';
import { structureLabel, usdPrice } from '../copy';
import { STRUCTURE_KEYS, type StructureKey } from '../model';
import { barProgress, countProgress, useMorph } from '../motion';
import { DataTable, growX } from './frame';
import { labelPos, rowLayout } from './RowBars';

const BAR_PX = 18;
const ROW_PX = 36;
const TOP_PX = 4;
const VALUE_ROOM_PX = 58;
const PRICE_LABEL_PX = 20;
const CORNER_PX = 3;
const VALUE_GAP_PX = 8;

export interface StructureRow {
  key: StructureKey;
  label: string;
  breakevenUsdPerT: number | null;
}

export function structureRows(fin: FinancingResult): StructureRow[] {
  return STRUCTURE_KEYS.map((key) => ({ key, label: structureLabel(key, fin), breakevenUsdPerT: fin[key].breakevenUsdPerT }));
}

export interface StructuresChartProps {
  width: number;
  finance: FinancingResult;
  priceUsdPerT: number;
  elapsedMs: number;
}

/** Who could pay: the break-even under each of the five structures, against your price. */
export function StructuresChart({ width, finance, priceUsdPerT, elapsedMs }: StructuresChartProps) {
  const rows = structureRows(finance);
  const values = useMorph([...rows.map((r) => (r.breakevenUsdPerT === null ? Number.NaN : r.breakevenUsdPerT)), priceUsdPerT]);
  const price = values[rows.length];
  const finite = values.slice(0, rows.length).filter((v) => !Number.isNaN(v));
  const lo = Math.min(0, ...finite);
  const hi = Math.max(price, ...finite);

  const l = rowLayout(width, {
    labels: rows.map((r) => r.label),
    barPx: BAR_PX,
    rowPx: ROW_PX,
    topPx: TOP_PX,
    valueRoomLeftPx: lo < 0 ? VALUE_ROOM_PX : 0,
    valueRoomRightPx: VALUE_ROOM_PX,
  });
  const x = scaleLinear()
    .domain([lo, hi === lo ? lo + 1 : hi])
    .range([l.plotLeft, l.plotRight]);
  const plotBottom = l.height(rows.length);
  const height = plotBottom + PRICE_LABEL_PX;
  const lab = labelPos(l);
  const count = countProgress(elapsedMs);
  const caption = `Break-even credit price for each way of paying, against your price of ${usdPrice(priceUsdPerT)}`;

  return (
    <div className="v2r-figure">
      <svg className="v2r-svg" width={width} height={height} role="img" aria-label={caption}>
        <line className="v2r-axis" x1={x(0)} x2={x(0)} y1={TOP_PX} y2={plotBottom} />
        <line className="v2r-cross" x1={x(price)} x2={x(price)} y1={TOP_PX} y2={plotBottom} />
        <text className="v2r-ref-label" x={x(price)} y={plotBottom + 14} textAnchor="middle">
          {`Your price ${usdPrice(priceUsdPerT)}`}
        </text>
        {rows.map((r, i) => {
          const v = values[i];
          const y = l.barY(i);
          const has = !Number.isNaN(v);
          const neg = has && v < 0;
          const k = barProgress(elapsedMs, i);
          return (
            <g key={r.key} data-testid={`structure-${r.key}`}>
              <text className="v2r-row-label" x={lab.x} y={l.labelY(i)} textAnchor={lab.anchor}>
                {r.label}
              </text>
              {has ? (
                <rect
                  className={neg ? 'v2r-bar-good' : 'v2r-bar'}
                  x={Math.min(x(0), x(v))}
                  y={y}
                  width={Math.max(1.5, Math.abs(x(v) - x(0)))}
                  height={BAR_PX}
                  rx={CORNER_PX}
                  transform={growX(x(0), k)}
                />
              ) : null}
              <text
                className="v2r-value"
                data-testid={`structure-${r.key}-value`}
                x={has && neg ? x(v) - VALUE_GAP_PX : x(has ? Math.max(0, v) : 0) + VALUE_GAP_PX}
                y={y + BAR_PX / 2 + 4}
                textAnchor={has && neg ? 'end' : 'start'}
              >
                {has ? usdPerT(v * count) : DASH}
              </text>
            </g>
          );
        })}
      </svg>
      <DataTable
        caption={caption}
        head={['Way of paying', 'Break-even, US$ a tonne']}
        rows={rows.map((r) => ({
          key: r.key,
          cells: [r.label, r.breakevenUsdPerT === null ? DASH : usdPerT(r.breakevenUsdPerT)],
        }))}
      />
    </div>
  );
}
