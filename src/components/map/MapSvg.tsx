import { memo } from 'react';
import type { MapData, MapMine } from '../../data/schemas';
import { DOT_R, LENS_DOT_R, inWindow, lensOf, minesInDrawOrder, toLens, type ClosedMine } from './geometry';

export interface MapSvgProps {
  data: MapData;
  startMine: MapMine;
  /** Shown next to the lens, for example "Jharia coalfield". */
  lensLabel: string;
  ariaLabel: string;
}

/** City labels sit this far from their dot, in viewBox units (design/Main.dc.html). */
const CITY_LABEL_DX = 7;
const CITY_LABEL_DY = 4;
const CITY_R = 2.6;
/** Lens label inset and Moonidih label offset, in viewBox units (design/Main.dc.html). */
const LENS_LABEL_INSET = 12;
const START_LABEL_DX = 15;
const START_LABEL_DY = 5;

function mineClass(m: Pick<MapMine, 'band'>) {
  return m.band === 'nodate' ? 'map-dot map-dot-nodate' : `map-dot map-dot-${m.band}`;
}

function mineR(m: Pick<MapMine, 'band'>, r: typeof DOT_R | typeof LENS_DOT_R) {
  return m.band === 'nodate' ? r.nodate : r.operating;
}

function Dots({ closed, mines }: { closed: readonly ClosedMine[]; mines: readonly MapMine[] }) {
  return (
    <g>
      {closed.map((m, i) => (
        <circle key={`c${i}`} className="map-dot-closed" cx={m.x} cy={m.y} r={DOT_R.closed} />
      ))}
      {mines.map((m) => (
        <circle key={m.id} className={mineClass(m)} cx={m.x} cy={m.y} r={mineR(m, DOT_R)} />
      ))}
    </g>
  );
}

/**
 * The map, drawn once. It takes only stable props and never subscribes to hover state, so pointer movement does
 * not re-render it.
 */
export const MapSvg = memo(function MapSvg({ data, startMine, lensLabel, ariaLabel }: MapSvgProps) {
  const [vx, vy, vw, vh] = data.viewBox;
  const lens = lensOf(data);
  const ordered = minesInDrawOrder(data.mines, startMine.id);
  const inLens = (p: { x: number; y: number }) => inWindow(lens, p.x, p.y);
  const lensClosed = data.closed.filter(inLens);
  const lensMines = ordered.filter(inLens);
  const [sx, sy] = toLens(lens, startMine.x, startMine.y);
  const clipId = 'map-lens-clip';

  return (
    <svg className="map-svg" viewBox={`${vx} ${vy} ${vw} ${vh}`} role="img" aria-label={ariaLabel}>
      <path className="map-land" d={data.outline} />
      {data.coalStates.map((s) => (
        <path key={s.name} className="map-coal" d={s.d} />
      ))}
      <path className="map-edge" d={data.outline} />

      {data.cities.map((c) => {
        const west = c.side === 'w';
        return (
          <g key={c.name}>
            <circle className="map-city" cx={c.x} cy={c.y} r={CITY_R} />
            <text
              className={west ? 'map-city-label map-city-label-end' : 'map-city-label'}
              x={west ? c.x - CITY_LABEL_DX : c.x + CITY_LABEL_DX}
              y={c.y + CITY_LABEL_DY}
            >
              {c.name}
            </text>
          </g>
        );
      })}

      <Dots closed={data.closed} mines={ordered} />
      <circle className={mineClass(startMine)} cx={startMine.x} cy={startMine.y} r={DOT_R.start} />

      {/* The lens: the window around the start mine's coalfield, redrawn larger. */}
      <rect className="map-lens-window" x={lens.wx} y={lens.wy} width={lens.ww} height={lens.wh} rx="1.5" />
      <path
        className="map-lens-leader"
        d={`M${lens.wx} ${lens.wy + lens.wh}L${lens.bx} ${lens.by}M${lens.wx + lens.ww} ${lens.wy + lens.wh}L${lens.bx + lens.bw} ${lens.by}`}
      />
      <clipPath id={clipId}>
        <rect x={lens.bx} y={lens.by} width={lens.bw} height={lens.bh} rx="10" />
      </clipPath>
      <rect className="map-lens-box" x={lens.bx} y={lens.by} width={lens.bw} height={lens.bh} rx="10" />
      <g clipPath={`url(#${clipId})`}>
        {lensClosed.map((m, i) => {
          const [x, y] = toLens(lens, m.x, m.y);
          return <circle key={`lc${i}`} className="map-dot-closed" cx={x} cy={y} r={LENS_DOT_R.closed} />;
        })}
        {lensMines.map((m) => {
          const [x, y] = toLens(lens, m.x, m.y);
          return <circle key={`l-${m.id}`} className={mineClass(m)} cx={x} cy={y} r={mineR(m, LENS_DOT_R)} />;
        })}
        <circle className="map-start-ring" cx={sx} cy={sy} r={LENS_DOT_R.startRing} />
        <circle className={mineClass(startMine)} cx={sx} cy={sy} r={LENS_DOT_R.start} />
      </g>
      <text className="map-lens-label" x={lens.bx + LENS_LABEL_INSET} y={lens.by + lens.bh - LENS_LABEL_INSET}>
        {lensLabel}
      </text>
      <text className="map-start-label" x={sx + START_LABEL_DX} y={sy + START_LABEL_DY}>
        {startMine.name}
      </text>
    </svg>
  );
});
