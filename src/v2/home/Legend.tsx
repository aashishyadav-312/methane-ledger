import type { MapDataV2 } from '../map';
import type { MineV2 } from '../contracts';

const BANDS: { band: MineV2['band']; label: string }[] = [
  { band: 'by2031', label: 'By 2031' },
  { band: 'by2036', label: '2032 to 2036' },
  { band: 'by2050', label: '2037 to 2050' },
  { band: 'after2050', label: 'After 2050' },
  { band: 'nodate', label: 'No date' },
];

/** The compact legend card of V2-Home: one swatch per closure band, with its count from the data. */
export function Legend({ data }: { data: MapDataV2 }) {
  const counts = new Map<MineV2['band'], number>();
  for (const m of data.mines) counts.set(m.band, (counts.get(m.band) ?? 0) + 1);
  const gem = data.mines.filter((m) => m.positionQuality === 'gem').length;
  const total = data.mines.length;
  const note =
    gem === 0
      ? 'When each mine’s coal runs out at current output. Dots are placed by coalfield and are approximate.'
      : gem === total
        ? 'When each mine’s coal runs out at current output. Dots are at Global Coal Mine Tracker positions.'
        : `When each mine’s coal runs out at current output. ${gem} of ${total} dots are at Global Coal Mine Tracker positions; the rest are placed by coalfield and are approximate.`;

  return (
    <div className="v2-legend" data-testid="v2-legend">
      <ul className="v2-legend-rows" aria-label="Closure bands">
        {BANDS.map(({ band, label }) => (
          <li key={band}>
            <span className={`v2-dot v2-dot--${band}`} aria-hidden="true" />
            {label} <span className="num v2-legend-count">{counts.get(band) ?? 0}</span>
          </li>
        ))}
        <li className="v2-legend-closed">
          <span className="v2-legend-swatch-closed" aria-hidden="true" />
          Closed <span className="num v2-legend-count">{data.closed.length}</span>
        </li>
      </ul>
      <p className="v2-legend-note">{note}</p>
    </div>
  );
}
