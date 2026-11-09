import { useId, useMemo, useState } from 'react';
import type { BandKey, MapData, MapMine } from '../../data/schemas';
import { mineHref } from '../../app/router';
import { Chip } from '../../ui';
import { BAND_LABEL, bandVar, subsidiaryName, typeLabel } from './bands';
import { filterMines, OPERATING_BANDS, sortMines, type SortDir, type SortKey } from './browse';
import { pointForMine } from './geometry';
import { hoverStore } from './hoverStore';
import { MAP_FRAME_ID } from './MineMap';

function BandDot({ band }: { band: BandKey }) {
  return band === 'nodate' ? (
    <span className="band-dot band-dot-hollow" aria-hidden="true" />
  ) : (
    <span className="band-dot" style={{ background: bandVar(band) }} aria-hidden="true" />
  );
}

function ChevronIcon() {
  return (
    <svg
      className="browse-chevron"
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

interface SortHeaderProps {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}

function SortHeader({ label, column, sortKey, sortDir, onSort }: SortHeaderProps) {
  const active = sortKey === column;
  const ariaSort = active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th scope="col" aria-sort={ariaSort}>
      <button type="button" className="th-sort" onClick={() => onSort(column)}>
        {label}
        <span className="th-sort-mark" aria-hidden="true">
          {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  );
}

function MineName({ data, mine }: { data: MapData; mine: MapMine }) {
  if (mine.modelled) {
    return (
      <a className="mine-link" href={mineHref(mine.id)}>
        {mine.name}
        <span className="sr-only">, open the model</span>
      </a>
    );
  }
  const show = () => {
    const { x, y } = pointForMine(data, mine);
    hoverStore.set({ key: `list-${mine.id}`, target: { kind: 'mine', mine }, x, y, source: 'list' });
  };
  const hide = () => {
    if (hoverStore.get()?.key === `list-${mine.id}`) hoverStore.set(null);
  };
  return (
    <button
      type="button"
      className="mine-locate"
      onFocus={show}
      onBlur={hide}
      onClick={() => {
        show();
        document.getElementById(MAP_FRAME_ID)?.scrollIntoView({ block: 'center' });
      }}
    >
      {mine.name}
      <span className="sr-only">, show on the map</span>
    </button>
  );
}

/**
 * "Browse all mines": the keyboard and screen-reader path through the map. A table of the operating mines,
 * sortable, with band filter chips. Closed by default, and rendered only once opened.
 */
export function MineBrowser({ data }: { data: MapData }) {
  const [open, setOpen] = useState(false);
  const [bands, setBands] = useState<ReadonlySet<BandKey>>(() => new Set());
  const [sortKey, setSortKey] = useState<SortKey>('runout');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const regionId = useId();
  const titleId = useId();
  const total = data.mines.length;

  const rows = useMemo(
    () => sortMines(filterMines(data.mines, bands), sortKey, sortDir),
    [data.mines, bands, sortKey, sortDir],
  );

  function onSort(key: SortKey) {
    if (key === sortKey) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function toggleBand(band: BandKey, on: boolean) {
    const next = new Set(bands);
    if (on) next.add(band);
    else next.delete(band);
    setBands(next);
  }

  return (
    <section className="browse page-width" aria-labelledby={titleId}>
      <h2 className="browse-title" id={titleId}>
        <button
          type="button"
          className="browse-toggle"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => setOpen(!open)}
        >
          <span>Browse all mines</span>
          <span className="browse-count num">{total} operating</span>
          <ChevronIcon />
        </button>
      </h2>
      <div id={regionId} className="browse-body" hidden={!open}>
        {open ? (
          <>
            <div className="chip-row browse-chips" role="group" aria-label="Filter by expected closure">
              {OPERATING_BANDS.map((band) => (
                <Chip key={band} pressed={bands.has(band)} onPressedChange={(on) => toggleBand(band, on)}>
                  <BandDot band={band} />
                  {BAND_LABEL[band]}
                  <span className="num browse-chip-count">{data.bands[band]}</span>
                </Chip>
              ))}
            </div>
            <p className="browse-status" aria-live="polite">
              Showing <span className="num">{rows.length}</span> of <span className="num">{total}</span> operating
              mines. Closed mines are on the map only.
            </p>
            <div className="browse-scroll" role="region" aria-label="Operating mines table" tabIndex={0}>
              <table className="browse-table">
                <thead>
                  <tr>
                    <SortHeader label="Mine" column="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <th scope="col">Subsidiary</th>
                    <th scope="col">State</th>
                    <th scope="col">Type</th>
                    <SortHeader
                      label="Run-out year"
                      column="runout"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={onSort}
                    />
                    <th scope="col">Expected closure</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id} data-mine-id={m.id}>
                      <th scope="row">
                        <MineName data={data} mine={m} />
                      </th>
                      <td>
                        <abbr title={subsidiaryName(m.company)}>{m.company}</abbr>
                      </td>
                      <td>{m.state}</td>
                      <td>{typeLabel(m.type)}</td>
                      <td className="num browse-year">{m.runoutLabel}</td>
                      <td>
                        <span className="browse-band">
                          <BandDot band={m.band} />
                          {BAND_LABEL[m.band]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
