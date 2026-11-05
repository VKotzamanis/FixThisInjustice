// src/ui/views/train/restGameRoute.ts
//
// F14 (audit E09): the rest-game sheet, its picker and the five families load as their own
// chunk the first time a rest offers a game, not with Train. Precached like every chunk, so a
// rest offline still opens it. A failed load shows lazyRoute's retry panel in the sheet's place;
// the rest timer is untouched either way (docs/design/rest-games.md constraint 1).
import { lazyRoute } from '../../../app/lazyRoute';

const sheetRoute = lazyRoute('rest-games', () => import('./RestGameSheet').then((m) => m.RestGameSheet));

export const RestGameSheet = sheetRoute.Component;

/** For tests that open the sheet and query it at once. */
export const preloadRestGames = sheetRoute.preload;
