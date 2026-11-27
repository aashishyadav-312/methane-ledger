import { useMemo } from 'react';
import { mineHref } from '../../app/router';
import { mapData } from '../../pages/MapPage/data';
import { MineSearch } from '../search';
import type { SearchableMine } from '../search';
import { MinePage } from '../../pages/MinePage';

/*
 * Slots: the two views of the v2 shell that later steps replace.
 *
 *   HomeV2   the map-first home (Step 6 builds it in src/v2/home and swaps the import here)
 *   MineView the home with a mine chosen (`#/mine/:id`; Step 6 as well)
 *
 * Until then the shell shows a plain page with the working search box, and the v1 mine page, so every route
 * resolves and the app stays usable at /v2/.
 */

/** The mines the search box reads. Step 6 passes the v2 mines through the Step 3 map adapter instead. */
function useSearchableMines(): SearchableMine[] {
  return useMemo(() => mapData().mines, []);
}

export function HomeV2() {
  const mines = useSearchableMines();
  return (
    <div className="v2-home-slot">
      <h1 className="t-h1">Which closing mines can pay for their own methane?</h1>
      <p className="t-lede">
        Find any of Coal India&apos;s {mines.length} operating mines by name. Open one to see what capturing its methane
        would cost, and the carbon credit price that would cover it.
      </p>
      <MineSearch
        mines={mines}
        onSelect={(id) => {
          window.location.hash = mineHref(id);
        }}
      />
    </div>
  );
}

/** Where `#/mine/:id` lands until Step 6: the v1 mine page, inside the v2 shell. */
export function MineView() {
  return <MinePage />;
}

/** The layout the shell uses for the mine route. Step 6 changes it to `'map'` when it replaces `MineView`. */
export const MINE_LAYOUT = 'page' as const;
