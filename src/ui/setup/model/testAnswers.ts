// src/ui/setup/model/testAnswers.ts
//
// Test-only: a complete answer set every step accepts (synthetic values, no personal data).
// Imported by the model tests; nothing in the app imports it.
import type { SetupAnswers } from '../../../domain/types';
import { initialAnswers } from './answers';

export function validAnswers(over: Partial<SetupAnswers> = {}): SetupAnswers {
  const base = initialAnswers();
  return {
    ...base,
    timezone: 'America/Chicago',
    displayName: 'Tester',
    sex: 'male',
    ageYears: '30', // [years]
    heightM: '1', // [m]
    heightCm: '78', // [cm]
    mass: '80', // [kg]
    bodyFatMode: 'known',
    bodyFatPct: '', // optional with a stated sex
    sessionsPerWeek: 3,
    weeklySessionTarget: '3',
    days: {
      ...base.days,
      1: { enabled: true, startTime: '07:30', durationMin: '60' },
      3: { enabled: true, startTime: '18:00', durationMin: '45' },
      5: { enabled: true, startTime: '07:30', durationMin: '60' },
    },
    ...over,
  };
}
