// src/ui/views/train/restGameHost.ts
//
// What the game sheet tells the game inside it (P6). A context rather than a prop, so every game
// keeps the one RestGameProps contract and stays free of the store (Task 10 scans for that).
import { createContext, useContext } from 'react';
import type { UnitSystem } from '../../../domain/types';

export interface RestGameHost {
  /** The profile's units, for Plate Math's plates and bar. */
  units: UnitSystem;
  /** True while the sheet is minimised: the round runs on, but takes no hardware keys. */
  hidden: boolean;
  /** Minimises the sheet; null where nothing can hide the game (a test, an older host). */
  onHide: (() => void) | null;
  /** Ruling R2: the remaining REST, as the rest bar formats it ("1:30"), for the title row; null: none. */
  restClock: string | null;
}

export const DEFAULT_REST_GAME_HOST: RestGameHost = { units: 'metric', hidden: false, onHide: null, restClock: null };

export const RestGameHostContext = createContext<RestGameHost>(DEFAULT_REST_GAME_HOST);

export function useRestGameHost(): RestGameHost {
  return useContext(RestGameHostContext);
}
