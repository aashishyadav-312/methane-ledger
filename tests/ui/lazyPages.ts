import { act } from '@testing-library/react';

/**
 * The app loads its About pages, Compare, Data, the gallery and a mine's panel on demand. Tests import them first, so
 * the modules are cached, and then `settle()` lets React's lazy boundaries resolve inside `act`.
 */
export async function preloadLazyPages(): Promise<void> {
  await Promise.all([
    import('../../src/v2/pages/assumptions/AssumptionsV2'),
    import('../../src/v2/pages/compare/CompareV2'),
    import('../../src/v2/pages/data/DataV2'),
    import('../../src/v2/pages/method/MethodV2'),
    import('../../src/v2/pages/sources/SourcesV2'),
    import('../../src/app/UiGallery'),
    import('../../src/v2/home/MineSession'),
  ]);
}

export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
