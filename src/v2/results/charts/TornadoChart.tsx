import { scaleLinear } from 'd3-scale';
import { DASH, usdPerT } from '../../../lib/format';
import type { TornadoResult, TornadoRow } from '../../../model/tornado';
import { tornadoRangeText } from '../../../pages/MinePage/copy';
import { TORNADO_LABELS, usdPrice } from '../copy';
import { barProgress, useMorph } from '../motion';
import { DataTable, growX } from './frame';
import { labelPos, rowLayout } from './RowBars';

/** The mockup shows the six inputs with the widest swing (`tornado().top6`). */
export const TORNADO_ROWS = 6;

const BAR_PX = 16;
const ROW_PX = 34;
const TOP_PX = 4;
const VALUE_ROOM_PX = 54;
const BASE_LABEL_PX = 20;
const CORNER_PX = 2;
const VALUE_GAP_PX = 6;

const UNITS = { price: usdPrice };

export function tornadoRowLabel(r: TornadoRow): string {
  return `${TORNADO_LABELS[r.key]}, ${tornadoRangeText(r, UNITS)}`;
}

export interface TornadoChartProps {
  width: number;
  tornado: TornadoResult;
  elapsedMs: number;
}

/** What moves the break-even most: each input at its low and high value, one at a time, either side of the base. */
export function TornadoChart({ width, tornado, elapsedMs }: TornadoChartProps) {
  const rows = tornado.rows.slice(0, TORNADO_ROWS);
  const nan = (v: number | null) => (v === null ? Number.NaN : v);
  const values = useMorph([
    nan(tornado.baseUsdPerT),
    ...rows.flatMap((r) => [nan(r.lowCaseUsdPerT), nan(r.highCaseUsdPerT)]),
  ]);
  const base = values[0];
  const finite = values.filter((v) => !Number.isNaN(v));
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);

  const l = rowLayout(width, {
    labels: rows.map(tornadoRowLabel),
    barPx: BAR_PX,
    rowPx: ROW_PX,
    topPx: TOP_PX,
    valueRoomLeftPx: VALUE_ROOM_PX,
    valueRoomRightPx: VALUE_ROOM_PX,
  });
  const x = scaleLinear()
    .domain([lo, hi === lo ? lo + 1 : hi])
    .range([l.plotLeft, l.plotRight]);
  const baseX = x(base);
  const plotBottom = l.height(rows.length);
  const lab = labelPos(l);
  const caption = `The ${rows.length} inputs that move the break-even most, each at a low and a high value`;

  const bar = (v: number, y: number, kind: 'low' | 'high', k: number) => {
    if (Number.isNaN(v)) return null;
    const end = x(v);
    const right = v >= base;
    return (
      <g key={kind}>
        <rect
          className={`v2r-tornado-${kind}`}
          x={Math.min(baseX, end)}
          y={y}
          width={Math.max(1, Math.abs(end - baseX))}
          height={BAR_PX}
          rx={CORNER_PX}
          transform={growX(baseX, k)}
        />
        <text
          className="v2r-value v2r-value--small"
          x={right ? end + VALUE_GAP_PX : end - VALUE_GAP_PX}
          y={y + BAR_PX / 2 + 4}
          textAnchor={right ? 'start' : 'end'}
          opacity={k}
        >
          {usdPerT(v)}
        </text>
      </g>
    );
  };

  return (
    <div className="v2r-figure">
      <svg
        className="v2r-svg"
        width={width}
        height={plotBottom + BASE_LABEL_PX}
        role="img"
        aria-label={caption}
        data-testid="tornado-svg"
      >
        {rows.map((r, i) => {
          const y = l.barY(i);
          const low = values[1 + 2 * i];
          const high = values[2 + 2 * i];
          const k = barProgress(elapsedMs, i);
          // The longer bar first, so a shorter one on the same side stays visible on top of it.
          const order: ('low' | 'high')[] =
            Math.abs((Number.isNaN(low) ? base : low) - base) >= Math.abs((Number.isNaN(high) ? base : high) - base)
              ? ['low', 'high']
              : ['high', 'low'];
          return (
            <g key={r.key} data-testid="tornado-row" data-key={r.key}>
              <text className="v2r-row-label" x={lab.x} y={l.labelY(i)} textAnchor={lab.anchor}>
                {tornadoRowLabel(r)}
              </text>
              {order.map((kind) => bar(kind === 'low' ? low : high, y, kind, k))}
            </g>
          );
        })}
        {Number.isNaN(base) ? null : (
          <>
            <line className="v2r-axis" x1={baseX} x2={baseX} y1={TOP_PX} y2={plotBottom} />
            <text className="v2r-ref-label" x={baseX} y={plotBottom + 14} textAnchor="middle">
              {`Base ${usdPerT(base)}`}
            </text>
          </>
        )}
      </svg>
      <DataTable
        caption={caption}
        head={['Input', 'Break-even, low value', 'Break-even, high value']}
        rows={rows.map((r) => ({
          key: r.key,
          cells: [
            tornadoRowLabel(r),
            r.lowCaseUsdPerT === null ? DASH : usdPerT(r.lowCaseUsdPerT),
            r.highCaseUsdPerT === null ? DASH : usdPerT(r.highCaseUsdPerT),
          ],
        }))}
      />
    </div>
  );
}
