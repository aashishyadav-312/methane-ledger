/*
 * The static SVG layers of the v2 map, memoised by data: they render once and zooming never re-renders them.
 * Geometry is in map units; dots and labels keep their screen size through CSS variables the controller sets
 * (`--dot-scale` is 1 / sqrt(zoom), `--inv-k` is 1 / k).
 */
import { memo } from 'react';
import { DRAW_ORDER } from '../../components/map/bands';
import type { MineV2 } from '../contracts';
import type { MapDataV2 } from './data';
import type { PlacedLabel } from './geometry';
import { DOT_SIZES, LABELS } from './motion';

export function dotRadius(mine: Pick<MineV2, 'band'>): number {
  return mine.band === 'nodate' ? DOT_SIZES.nodate : DOT_SIZES.operating;
}

export const BaseLayer = memo(function BaseLayer({ data }: { data: MapDataV2 }) {
  return (
    <>
      <path className="mmv2-land" d={data.outline} />
      {data.coalStates.map((s) => (
        <path key={s.name} className="mmv2-coal" d={s.d} />
      ))}
      <path className="mmv2-boundary" d={data.outline} />
    </>
  );
});

export const CitiesLayer = memo(function CitiesLayer({ data }: { data: MapDataV2 }) {
  return (
    <g className="mmv2-cities" aria-hidden="true">
      {data.cities.map((c) => (
        <g key={c.name}>
          <circle className="mmv2-city mmv2-scaled" cx={c.x} cy={c.y} r={DOT_SIZES.city} />
          <text
            className="mmv2-city-label"
            x={c.x}
            y={c.y}
            dx={`${c.side === 'w' ? -LABELS.cityGapEm : LABELS.cityGapEm}em`}
            dy={`${LABELS.centreDyEm}em`}
            textAnchor={c.side === 'w' ? 'end' : 'start'}
          >
            {c.name}
          </text>
        </g>
      ))}
    </g>
  );
});

/** Bands whose dots can show a hollow centre (nodate dots are hollow already). */
export const HOLLOW_BANDS = ['by2031', 'by2036', 'by2050', 'after2050'] as const;
const BAND_TOKEN_VAR: Record<(typeof HOLLOW_BANDS)[number], string> = {
  by2031: 'var(--band-2031)',
  by2036: 'var(--band-2036)',
  by2050: 'var(--band-2050)',
  after2050: 'var(--band-after)',
};

/** The paint server id for a band's hollow fill, unique to one map. */
export const hollowId = (uid: string, band: string) => `${uid}-hollow-${band}`;

/**
 * Hollow centres for coalfield-placed dots: a radial gradient with hard stops (paper inside, band colour outside),
 * so the dot stays a single element. CSS swaps it in past zoom 4.
 */
export const HollowDefs = memo(function HollowDefs({ uid }: { uid: string }) {
  return (
    <defs>
      {HOLLOW_BANDS.map((band) => (
        <radialGradient key={band} id={hollowId(uid, band)}>
          <stop offset="0" style={{ stopColor: 'var(--paper)' }} />
          <stop offset={DOT_SIZES.hollowRatio} style={{ stopColor: 'var(--paper)' }} />
          <stop offset={DOT_SIZES.hollowRatio} style={{ stopColor: BAND_TOKEN_VAR[band] }} />
          <stop offset="1" style={{ stopColor: BAND_TOKEN_VAR[band] }} />
        </radialGradient>
      ))}
    </defs>
  );
});

const fillClass = (m: MineV2) =>
  `mmv2-fill mmv2-band-${m.band}${m.positionQuality === 'coalfield' ? ' is-approx' : ''}`;

/* Each ordinary mine is one circle, so a zoom frame restyles as few elements as possible. */
export const DotsLayer = memo(function DotsLayer({
  data,
  selectedId,
}: {
  data: MapDataV2;
  selectedId: string | null;
}) {
  const rank = new Map(DRAW_ORDER.map((band, i) => [band, i]));
  const ordered = data.mines
    .filter((m) => m.id !== selectedId)
    .sort((a, b) => (rank.get(a.band) ?? 0) - (rank.get(b.band) ?? 0));
  return (
    <>
      <g className="mmv2-closed-layer">
        {data.closed.map((m, i) => (
          <circle
            key={i}
            className="mmv2-closed mmv2-scaled"
            cx={m.x}
            cy={m.y}
            r={DOT_SIZES.closed}
            data-closed={i}
          />
        ))}
      </g>
      {ordered.map((m) => (
        <circle
          key={m.id}
          className={`mmv2-dot mmv2-scaled ${fillClass(m)}`}
          cx={m.x}
          cy={m.y}
          r={dotRadius(m)}
          data-id={m.id}
        />
      ))}
    </>
  );
});

/** The selected mine with its ink ring, drawn last in its own layer so the dimming of the others never reaches it. */
export function SelectedLayer({ mine }: { mine: MineV2 | null }) {
  if (!mine) return <g className="mmv2-sel-layer" />;
  return (
    <g className="mmv2-sel-layer">
      <g key={mine.id} className="mmv2-dot mmv2-scaled is-sel" data-id={mine.id}>
        <circle className="mmv2-ring" cx={mine.x} cy={mine.y} r={DOT_SIZES.operating * DOT_SIZES.ringRatio} />
        <circle className={fillClass(mine)} cx={mine.x} cy={mine.y} r={dotRadius(mine) * DOT_SIZES.selectedRatio} />
      </g>
    </g>
  );
}

export const LabelsLayer = memo(function LabelsLayer({ labels }: { labels: readonly PlacedLabel[] }) {
  return (
    <g className="mmv2-labels" aria-hidden="true">
      {labels.map((l) => {
        const fontPx = l.selected ? LABELS.selectedFontPx : LABELS.fontPx;
        const gapEm = l.gapPx / fontPx;
        return (
          <text
            key={l.id}
            className={l.selected ? 'mmv2-label is-sel' : 'mmv2-label'}
            x={l.x}
            y={l.y}
            dx={`${l.anchor === 'end' ? -gapEm : gapEm}em`}
            dy={`${LABELS.centreDyEm}em`}
            textAnchor={l.anchor}
          >
            {l.name}
          </text>
        );
      })}
    </g>
  );
});
