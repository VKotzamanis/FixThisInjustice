// src/config/export.ts
//
// The .ics export window, in config so the domain can read it without importing a view: the
// programme engine keeps at least this many sessions materialised ahead of the cursor
// (src/domain/plan/engine.ts RUNWAY_SESSIONS).

/** [d] the horizon the .ics covers. The plan's constant: "The calendar holds the next 28 days". */
export const CALENDAR_DAYS = 28;
