import type { MapData, MapMine } from '../../data/schemas';
import { mineHref } from '../../app/router';
import { bandVar, subsidiaryName, typeLabel } from './bands';
import { percentOf } from './geometry';

function Arrow() {
  return (
    <svg
      aria-hidden="true"
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

/** The start mine: a real link over its dot, with the pulse and the "Start here" card. */
export function StartPin({ data, mine }: { data: Pick<MapData, 'viewBox'>; mine: MapMine }) {
  const { left, top } = percentOf(data, mine.x, mine.y);
  return (
    <a className="start-pin" href={mineHref(mine.id)} style={{ left, top, color: bandVar(mine.band) }}>
      <span className="start-pin-target" aria-hidden="true">
        <span className="pulse-ring" />
        <span className="start-pin-dot" />
      </span>
      <span className="pin-card start-pin-card">
        <span className="eyebrow start-pin-eyebrow">Start here</span>
        <span className="pin-card-name">{mine.name}</span>
        <span className="pin-card-meta start-pin-meta">
          <span>
            <abbr title={subsidiaryName(mine.company)}>{mine.company}</abbr> · {typeLabel(mine.type)} · open the model
          </span>
          <Arrow />
        </span>
      </span>
    </a>
  );
}
