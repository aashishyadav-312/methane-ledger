import type { RefObject } from 'react';
import type { MineMapHandle } from './MineMapV2';
import { ZOOM_STEP_FACTOR } from './motion';

/** Zoom in, zoom out and all of India, on `--glass` (V2-Home). Each acts on the map through its ref. */
export function ZoomControls({ map, className }: { map: RefObject<MineMapHandle | null>; className?: string }) {
  return (
    <div role="group" aria-label="Map zoom" className={className ? `mmv2-zoom ${className}` : 'mmv2-zoom'}>
      <button type="button" className="mmv2-zoom-btn" aria-label="Zoom in" onClick={() => map.current?.zoomBy(ZOOM_STEP_FACTOR)}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M8 3v10M3 8h10" />
        </svg>
      </button>
      <button
        type="button"
        className="mmv2-zoom-btn"
        aria-label="Zoom out"
        onClick={() => map.current?.zoomBy(1 / ZOOM_STEP_FACTOR)}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M3 8h10" />
        </svg>
      </button>
      <button type="button" className="mmv2-zoom-btn" aria-label="Show all of India" onClick={() => void map.current?.showAll()}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
        </svg>
      </button>
    </div>
  );
}
