// src/content/rmrEquations.ts
//
// Audit G22 (rule 2): the display name of each RMR equation, once. Proper nouns, not skin copy,
// so not CopyKeys. Read by the Targets view and the setup wizard's review.
export const RMR_EQUATION_NAME: Record<'mifflin-st-jeor' | 'cunningham', string> = {
  'mifflin-st-jeor': 'Mifflin-St Jeor',
  cunningham: 'Cunningham',
};
