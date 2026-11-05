// src/ui/components/confirmWord.ts
//
// The word master plan section 3 fixes for every destructive confirmation. One source (rule 2):
// it was declared in both DataSection.tsx and ExportView.tsx, and LoadRecovery.tsx imported it
// from DataSection, which pulled the whole Settings data section into the main chunk (audit E09).
export const CONFIRM_WORD = 'DELETE';
