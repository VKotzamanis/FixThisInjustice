# Product

<!-- impeccable:product-schema 1 -->

<!--
Written 2026-11-04 by an agent without an interview: impeccable init asks the user, but this run
had no question channel and the owner asks for rulings, not questions (AGENTS.md, Owner). Every
fact below is sourced from repo files or the lead's brief; lines marked [inferred] are the agent's
reading and must be confirmed by the owner before they constrain a decision.
-->

## Platform

web

Installed PWA (Add to Home Screen) on iPhone Safari and Android Chrome; also usable as a browser tab. Mobile web, not native: the platform stays a web page in TypeScript (owner, `docs/private/owner-feedback/restart-2026-10-18.md`, Q4).

## Users

- Primary: the owner, a recreational lifter, logging his own gym sessions on his phone (owner feedback 2026-11-04: "help me with my gym").
- Secondary: people he shares the link with; they mix iPhone and Android (AGENTS.md, Owner). The intro addresses them as friends who got the link from him (`src/content/introSlides.ts`, owner's prose).
- No accounts, no coach role, no admin.

## Product Purpose

A training log that plans the next session, runs it set by set (load, reps, one-tap effort, rest timer), adjusts the next prescription from what was logged, and keeps body mass, intake and attendance history. Success: the user can start, log and finish a session at the gym without the app getting in the way, and comes back to the next one. The owner's bar is "AAA tier quality"; his current verdict is "barely functional" (`docs/private/owner-feedback/phone-week-2026-11-04.md`).

## Positioning

- Personal and local: one document in the user's own browser, nothing on a server, anonymous to others (restart-2026-10-18, D1).
- A loud, owner-made identity (the limelight "brat version", his own pixel character "her") instead of the neutral fitness-app look.
- Prescriptions and health numbers only from cited sources (AGENTS.md rule 1).

## Operating Context

- Usage scene (from the lead's brief): one hand, between sets, often sweaty or chalked fingers; bright gym light or a dim corner; the phone lies on a bench or in a hand while the other hand holds a bar or bottle. Glances last seconds; the next tap must be findable without reading.
- Screens 320 to 412 CSS px wide (iPhone SE class to large Android); portrait only in practice [inferred: no landscape layout exists or was tested].
- Rest periods of 60 to 180 s are the main dwell time; rest games run inside them (`docs/design/rest-games.md`).
- Installed PWA: no browser back button on iOS, system back gesture on Android; status bar drawn over the page (`index.html` black-translucent + `viewport-fit=cover`).
- Sessions can cross midnight or be left open; the app must recover (spec R1).

## Capabilities and Constraints

- Views: Today, Plan, Train, Targets, Log, Atlas (specimen card collection), Settings (with data export/import), setup wizard, intro, boot sequence, rest games.
- Stack: React 19, TypeScript, Vite, Zustand, Zod; offline; strict CSP (scripts self only, images self and data:).
- Data lives only in the browser (`fti.v3`, moving to IndexedDB per spec R13). Old documents and exports must keep loading (AGENTS.md rule 7).
- Colours only through tokens (`src/ui/styles/tokens.css`, AGENTS.md rule 5). Copy is the owner's; wording is out of scope for design work (owner: "Do not focus on the text").
- No sound files ship; no reminder Worker deployed; no rest alarm with the screen locked (web limit, `docs/ARCHITECTURE.md`).
- Undecided: which views are primary in navigation (ruled in `docs/design/p4-design-brief.md`, owner may overrule); whether the rest alarm obeys the sounds switch (audit C11, owner ruling pending).

## Brand Commitments

- The limelight skin is the only skin and is pinned by the owner ("Only limelight for now. The 'brat version'", restart-2026-10-18, D4).
- "Her": the owner's own pixel character (`src/assets/sprite/`); she replaces any mascot; the app icon is her frame 0.
- Approved art set in `src/assets/art/` (owner review 2026-10-18); new art goes through an owner review page first.
- The owner's voice in copy (lower case, playful, profane in places) is his; agents do not rewrite it (AGENTS.md rule 4).

## Evidence on Hand

- Alpha fixture with synthetic data: `docs/feedback/alpha-fixture.json`.
- Engineering audit with reproduced defects: `docs/private/audit-2026-11-04/` (gitignored).
- Design critique with screenshots: `docs/design/critique-2026-11-04.md`, images in `docs/private/design-2026-11-04/` (gitignored).
- No usage analytics, no user testing beyond the owner's week on his phone; nothing tested on real iOS or Android hardware by an agent. Do not cite user numbers that do not exist.

## Product Principles

1. The set in front of the user wins: during a session nothing (toast, game, banner, header) may cover or push away the next Log control.
2. Never lose what the user typed or did: state survives tab switches, back gestures, relaunches and midnight.
3. Personality lives in the frame, not in the friction: the brat look decorates chrome and moments; controls stay plain, large and where the thumb expects them.
4. Honest numbers: no invented health figures, no animated or faded quantities.
5. Phone first, both platforms: every decision is checked at 320 px and on iOS and Android behaviour.

## Accessibility & Inclusion

- WCAG 2.1 AA contrast on every computed text pair; the limelight palette's measured ratios are the rule set (`tokens.css:154-163`).
- Touch targets at least 44 x 44 CSS px; text-entry controls at least 16 px font (iOS zoom).
- `prefers-reduced-motion` honoured everywhere; no flashing above 3 Hz (rest-over pulse is 2 Hz).
- Colour never carries state alone (shape or word as well).
