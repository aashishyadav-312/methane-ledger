import { HomeV2 } from '../home';

/*
 * Slots: the two views of the v2 shell that later steps fill.
 *
 *   HomeV2   the map-first home (Step 6, src/v2/home)
 *   MineView the home with a mine chosen (`#/mine/:id`)
 *
 * Both are the same component, so moving between `#/` and `#/mine/:id` keeps the map, its zoom and the smog
 * mounted: React sees the same element type in the same place.
 */
export { HomeV2, HomeV2 as MineView };

/** The mine route is the home with a mine chosen, so it uses the full-screen map layout too. */
export const MINE_LAYOUT = 'map' as const;
