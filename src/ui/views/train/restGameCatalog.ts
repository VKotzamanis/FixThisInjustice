// src/ui/views/train/restGameCatalog.ts
//
// Family -> the two keys that name it and the component that plays it (P6). Each game exports its
// own keys (`*_COPY`), so the picker and the game's frame read one source (AGENTS rule 2).
import type { ComponentType } from 'react';
import type { RestGameFamily } from '../../../domain/fun/restGames';
import { GYM_ANAGRAM_COPY, GymAnagramGame } from './GymAnagramGame';
import { PLATE_MATH_COPY, PlateMathGame } from './PlateMathGame';
import { REACTION_COPY, ReactionGame } from './ReactionGame';
import type { RestGameCopy, RestGameProps } from './restGameProps';
import { REST_WORD_COPY, RestWordGame } from './RestWordGame';
import { SEQUENCE_RECALL_COPY, SequenceRecallGame } from './SequenceRecallGame';

export interface RestGameEntry extends RestGameCopy {
  Component: ComponentType<RestGameProps>;
}

export const REST_GAME_CATALOG: Readonly<Record<RestGameFamily, RestGameEntry>> = {
  restWord: { ...REST_WORD_COPY, Component: RestWordGame },
  plateMath: { ...PLATE_MATH_COPY, Component: PlateMathGame },
  reaction: { ...REACTION_COPY, Component: ReactionGame },
  sequenceRecall: { ...SEQUENCE_RECALL_COPY, Component: SequenceRecallGame },
  gymAnagram: { ...GYM_ANAGRAM_COPY, Component: GymAnagramGame },
};
