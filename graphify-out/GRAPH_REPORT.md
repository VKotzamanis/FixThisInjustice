# Graph Report - .  (2026-09-02)

## Corpus Check
- 252 files · ~806,661 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2962 nodes · 7132 edges · 257 communities (158 shown, 99 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 65 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Skin Copy Tables
- Copy Hooks and Formatting
- App Shell and Selectors
- Civil Dates and ICS Export
- Legacy v2 Migration
- Copy Tables and Skins
- Setup Wizard and Unit Input
- Security Review Findings
- Reminders and Motivation Plans
- Master Plan Amendments
- Zod State Schema
- Exercise Library
- Plan Generator
- Split Templates
- Skin Icons
- Content Review Cards
- Motivation Video Assets
- Design Rounds and References
- Test Arbitraries
- Push Payload and SW Handlers
- Training Store Actions
- Schedule Fixtures and Today
- Nutrition and Summary Export
- Store Boot and Recovery
- Readiness Screening
- Store Profile Actions
- Migration Wizard Tests
- Persistence and Legacy Keys
- Reminder Worker
- Fun Mechanics Plan
- Ui Plan Browse
- Worker Package
- Schedule
- Components Form Cues Modal
- Root Build Config
- Root Build Config
- Training Progression
- Views Log View
- Store Schedule Selectors
- Components Toast Queue
- Root Build Config
- Review Content Peer Review
- Store Schedule Actions
- Test Index
- Components Time Capsule
- Reminders Client
- Schedule Calendar
- Test Fixtures
- Views Train View
- Audio Chime
- Schedule Cursor
- Train Exercise Card
- Schedule Weekly
- Test Push
- Scripts Inline Icons
- Domain Types
- App Reminder Sync
- Training Hydration
- Domain Units
- Ui Plan Focus
- Root Build Config
- Components Spotlight
- Store Training
- Ui Hotkeys
- Workflows Ci
- Plans Master Plan
- Plans Master Plan
- Plans Log Export Migration Cutover
- Worker Tsconfig
- App Root Error Boundary
- Fun Specimens
- Schedule Calendar
- Components Compliance Grid
- Components Reminder Settings Panel
- Views Atlas View
- Reminders Client
- Setup Wizard
- Plans Training Session
- Review Code Review
- Review Content Peer Review
- Reminders Instants
- Format Plan
- Store Reminder Actions
- Views Export View
- Plans Master Plan
- Review Content Peer Review
- Plans Calendar Cursor
- Domain Schema
- Store Schedule Actions
- Skins Sfx
- Views Targets View
- Components Reminder Settings Panel
- Plans Master Plan
- Plans Master Plan
- Plans Log Export Migration Cutover
- Review Content Peer Review
- Review Content Peer Review
- Review Content Peer Review
- Review Content Peer Review
- Content Specimen Cards
- Store Fun Actions
- Plans Training Session
- Skins Sfx
- Components Spotlight
- Review Code Review
- Plans Master Plan
- Root Build Config
- Domain Bodyfat
- Training Rest Timer
- Store Motivation Actions
- Plans Calendar Cursor
- Plans Master Plan
- Review Code Review
- Review Content Peer Review
- Fun Rng
- Store Motivation Actions
- Components Konami Overlay
- Hooks Use Wake Lock
- Settings Data Section
- Review Code Review
- Skins Sfx
- Root Build Config
- App Update Prompt
- Skins Sfx
- Plans Foundation
- Review Code Review
- Review Content Peer Review
- Root Build Config
- Scripts Check No Emoji
- Plans Calendar Cursor
- Audio Chime
- Plans Log Export Migration Cutover
- Plans Training Session
- Eslint Config
- Worker Tsconfig
- Skins Tokens
- Plans Training Session
- Plans Profile Nutrition Plan
- Plans Profile Nutrition Plan
- Config Video Instances
- Skins Sfx
- Plans Profile Nutrition Plan
- Plans Profile Nutrition Plan
- Plans Profile Nutrition Plan
- Plans Profile Nutrition Plan
- Plans Profile Nutrition Plan
- Plans Profile Nutrition Plan
- Plans Profile Nutrition Plan
- Review Code Review
- Review Code Review
- Plans Training Session
- Root Build Config
- Root Build Config
- Domain Ids
- Root Build Config
- Plans Profile Nutrition Plan
- Plans Profile Nutrition Plan
- Plans Profile Nutrition Plan
- Plans Profile Nutrition Plan
- Plans Reminders
- Review Code Review
- Root Build Config
- Root Build Config
- Root Build Config
- Root Build Config
- Root Build Config
- Root Build Config
- Root Build Config
- Root Build Config
- Root Build Config
- Root Build Config
- Root Build Config
- Root Build Config
- Scripts Check Dist Csp
- Scripts Check Media Size
- Scripts Check Sfx Size
- Config Env D
- Store Session Restore
- Test Raw D
- Review Security Review
- Docs Deploy Cutover Note
- Design Ui Redesign
- Round2 Plan
- Plans Foundation
- Plans Foundation
- Plans Foundation
- Plans Profile Nutrition Plan
- Plans Motivation Video
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Code Review
- Review Content Peer Review
- Index
- Plans Calendar Cursor
- Plans Training Session
- Plans Training Session

## God Nodes (most connected - your core abstractions)
1. `useAppStore` - 135 edges
2. `FORMAT` - 129 edges
3. `copy()` - 93 edges
4. `useCopy()` - 82 edges
5. `LocalDate` - 67 edges
6. `AppState` - 58 edges
7. `useCopyOverrides()` - 49 edges
8. `EpochMs` - 49 edges
9. `SkinId` - 47 edges
10. `makeAppState()` - 45 edges

## Surprising Connections (you probably didn't know these)
- `CI gate: CSP meta tag present in dist/index.html` --implements--> `Clickjacking: confirmations, not CSP frame-ancestors`  [EXTRACTED]
  .github/workflows/ci.yml → docs/plans/2026-09-01-00-master-plan.md
- `CI gate: frame-src anti-drift (dist matches src/config/videoInstances.ts)` --implements--> `Clickjacking: confirmations, not CSP frame-ancestors`  [EXTRACTED]
  .github/workflows/ci.yml → docs/plans/2026-09-01-00-master-plan.md
- `CI gate: frame-src anti-widening (host list matches master plan §3's six approved hosts)` --implements--> `Clickjacking: confirmations, not CSP frame-ancestors`  [EXTRACTED]
  .github/workflows/ci.yml → docs/plans/2026-09-01-00-master-plan.md
- `A20 — 'max' disables load progression instead of triggering AMRAP handling` --references--> `suggestedLoad()`  [EXTRACTED]
  docs/review/2026-09-01-code-review.md → docs/review/2026-09-01-security-review.md
- `lib` --extends--> `ES2022`  [EXTRACTED]
  worker/tsconfig.json → tsconfig.app.json

## Import Cycles
- 2-file cycle: `src/content/copy.board.ts -> src/content/copy.ts -> src/content/copy.board.ts`
- 2-file cycle: `src/content/copy.limelight.ts -> src/content/copy.ts -> src/content/copy.limelight.ts`
- 3-file cycle: `src/domain/migrations/index.ts -> src/domain/migrations/v2.ts -> src/domain/schema.ts -> src/domain/migrations/index.ts`

## Hyperedges (group relationships)
- **Platform choice decision family** — docs_plans_2026_09_01_00_master_plan_platform_stay_pwa_vite, docs_plans_2026_09_01_00_master_plan_platform_capacitor_native, docs_plans_2026_09_01_00_master_plan_platform_expo_rewrite [EXTRACTED 1.00]
- **Web Push reminder pipeline** — docs_plans_2026_09_01_00_master_plan_reminders_cloudflare_worker_webpush, docs_plans_2026_09_01_00_master_plan_compute_reminder_instants, docs_plans_2026_09_01_00_master_plan_worker_http_contract, docs_plans_2026_09_01_00_master_plan_worker_cron_dedupe, docs_plans_2026_09_01_00_master_plan_push_library_pushforge, docs_plans_2026_09_01_00_master_plan_sw_push_handling [EXTRACTED 1.00]
- **Missed-week motivation flow** — docs_plans_2026_09_01_00_master_plan_close_weeks, docs_plans_2026_09_01_00_master_plan_pending_motivation, docs_plans_2026_09_01_00_master_plan_custom_video_assets, docs_plans_2026_09_01_00_master_plan_motivation_single_dismiss, docs_plans_2026_09_01_00_master_plan_motivation_miss_window_14d, docs_plans_2026_09_01_00_master_plan_motivation_muted_autoplay_tap_to_unmute [INFERRED 0.85]
- **P1 pure domain layer modules** — docs_plans_2026_09_01_01_foundation_typestypescript, docs_plans_2026_09_01_01_foundation_unitsmodule, docs_plans_2026_09_01_01_foundation_datesmodule, docs_plans_2026_09_01_01_foundation_schemamodule [INFERRED 0.85]
- **Nutrition engine RMR/TDEE citation chain** — docs_plans_2026_09_01_02_profile_nutrition_plan_nutritionengine, docs_plans_2026_09_01_02_profile_nutrition_plan_mifflinstjeor, docs_plans_2026_09_01_02_profile_nutrition_plan_cunningham, docs_plans_2026_09_01_02_profile_nutrition_plan_activityfactor [EXTRACTED 1.00]
- **Reject-rather-than-fabricate design philosophy** — docs_plans_2026_09_01_01_foundation_schemamodule, docs_plans_2026_09_01_01_foundation_persistencemodule, docs_plans_2026_09_01_02_profile_nutrition_plan_evidenceledger [INFERRED 0.75]
- **Today View Schedule Action Pipeline** — src_ui_views_todayview_tsx, src_store_scheduleactions_ts, src_domain_schedule_cursor_ts [INFERRED 0.85]
- **Set-Log to Progression-Advice to Coach-Line Loop** — src_domain_training_progression_ts_suggestedprogression, src_domain_training_coach_ts_coachline, src_ui_views_train_exercisecard_tsx [INFERRED 0.85]
- **Clock-Independent State Recomputation Pattern** — attendance_driven_plan_cursor, absolute_instant_rest_timer, iso_weekly_review_closure [INFERRED 0.80]
- **Single-send Web Push delivery flow (schedule + push + cron tick)** — docs_plans_2026_09_01_05_reminders_schedule_ts, docs_plans_2026_09_01_05_reminders_index_ts, docs_plans_2026_09_01_05_reminders_push_ts [EXTRACTED 1.00]
- **Missed-week motivation popup flow (trigger + asset resolution + gate)** — docs_plans_2026_09_01_06_motivation_video_trigger_ts, docs_plans_2026_09_01_06_motivation_video_assets_ts, docs_plans_2026_09_01_06_motivation_video_motivation_gate_tsx [EXTRACTED 1.00]
- **Client-side reminder schedule sync flow (instants + client sync + effect)** — docs_plans_2026_09_01_05_reminders_instants_ts, docs_plans_2026_09_01_05_reminders_client_ts, docs_plans_2026_09_01_05_reminders_reminder_sync_tsx [EXTRACTED 1.00]
- **P7 architecture: domain modules + presentation layers** — docs_plans_2026_09_01_07_log_export_migration_cutover_v2plan_ts, docs_plans_2026_09_01_07_log_export_migration_cutover_v2_ts, docs_plans_2026_09_01_07_log_export_migration_cutover_build_summary, docs_plans_2026_09_01_07_log_export_migration_cutover_build_ics, docs_plans_2026_09_01_07_log_export_migration_cutover_migration_wizard, docs_plans_2026_09_01_07_log_export_migration_cutover_log_view, docs_plans_2026_09_01_07_log_export_migration_cutover_export_view, docs_plans_2026_09_01_07_log_export_migration_cutover_settings_destructive [EXTRACTED 1.00]
- **P8 architecture: content, mechanics, presentation layers** — docs_plans_2026_09_01_08_fun_mechanics_specimen_cards_ts, docs_plans_2026_09_01_08_fun_mechanics_specimens_ts, docs_plans_2026_09_01_08_fun_mechanics_rng_ts, docs_plans_2026_09_01_08_fun_mechanics_store_fun_actions, docs_plans_2026_09_01_08_fun_mechanics_toast_queue [EXTRACTED 1.00]
- **Phase cutscene and milestone celebration flow** — docs_plans_2026_09_01_08_fun_mechanics_blocks_ts, docs_plans_2026_09_01_08_fun_mechanics_phase_transition, docs_plans_2026_09_01_08_fun_mechanics_milestone_toast, docs_plans_2026_09_01_08_fun_mechanics_toast_queue [INFERRED 0.85]
- **All four round-one UI directions compared side by side** — docs_design_2026_09_01_ui_redesign_ui_direction_console_evolved_with_b_data_layer, docs_design_2026_09_01_ui_redesign_ui_direction_clinical_dashboard, docs_design_2026_09_01_ui_redesign_ui_direction_editorial_protocol, docs_design_2026_09_01_ui_redesign_ui_direction_coach_board [EXTRACTED 1.00]
- **All four round-two skin directions (E, F, G, H) sharing one token+copy-table architecture** — docs_design_round2_2026_09_01_design_e_brat_summer_design_e_brat_summer, docs_design_round2_2026_09_01_design_f_stan_twitter_design_f_stan_twitter, docs_design_round2_2026_09_01_design_g_pocket_pet_design_g_pocket_pet, docs_design_round2_2026_09_01_design_h_departures_board_design_h_departures_board [EXTRACTED 1.00]
- **Unit handling inconsistency (kg vs lb) across the app** — docs_review_2026_09_01_code_review_a1, docs_review_2026_09_01_code_review_a2, docs_review_2026_09_01_code_review_a3, docs_review_2026_09_01_code_review_a4, docs_review_2026_09_01_code_review_a5, docs_review_2026_09_01_code_review_a6, docs_review_2026_09_01_code_review_a7 [EXTRACTED 1.00]
- **UTC-vs-local-date boundary bugs** — docs_review_2026_09_01_code_review_a8, docs_review_2026_09_01_code_review_a9, docs_review_2026_09_01_code_review_a10, docs_review_2026_09_01_code_review_a35 [EXTRACTED 1.00]
- **Persistence and data-loss defects** — docs_review_2026_09_01_code_review_a41, docs_review_2026_09_01_code_review_a42, docs_review_2026_09_01_code_review_a43, docs_review_2026_09_01_code_review_a44 [EXTRACTED 1.00]
- **Failure pattern: wrong journal attached to the right paper** — docs_review_2026_09_01_content_peer_review_card_c002, docs_review_2026_09_01_content_peer_review_card_c004, docs_review_2026_09_01_content_peer_review_card_c008, docs_review_2026_09_01_content_peer_review_card_c013, docs_review_2026_09_01_content_peer_review_card_r007, docs_review_2026_09_01_content_peer_review_card_u007, docs_review_2026_09_01_content_peer_review_card_c014, docs_review_2026_09_01_content_peer_review_card_u009 [EXTRACTED 1.00]
- **Failure pattern: real, topically-adjacent paper but the number came from elsewhere** — docs_review_2026_09_01_content_peer_review_card_c005, docs_review_2026_09_01_content_peer_review_card_c011, docs_review_2026_09_01_content_peer_review_card_c014, docs_review_2026_09_01_content_peer_review_card_c015, docs_review_2026_09_01_content_peer_review_card_r005, docs_review_2026_09_01_content_peer_review_card_u008 [EXTRACTED 1.00]
- **Failure pattern: card cites a paper that argues the opposite** — docs_review_2026_09_01_content_peer_review_card_c004, docs_review_2026_09_01_content_peer_review_card_c011, docs_review_2026_09_01_content_peer_review_card_u013, docs_review_2026_09_01_content_peer_review_card_r001, docs_review_2026_09_01_content_peer_review_card_r005 [EXTRACTED 1.00]
- **Missing runtime schema validation across state boundaries** — docs_review_2026_09_01_security_review_c1_unvalidated_import, docs_review_2026_09_01_security_review_m5_no_schema_version, docs_review_2026_09_01_security_review_m6_unbounded_setlog_values, docs_review_2026_09_01_security_review_m7_watertarget_unbounded_loop [EXTRACTED 1.00]
- **CSP meta tag as shared mitigation point for clickjacking and postMessage exposure** — docs_review_2026_09_01_security_review_m1_no_csp, docs_review_2026_09_01_security_review_h2_unconfirmed_data_wipe, docs_review_2026_09_01_security_review_m8_unauth_postmessage [EXTRACTED 1.00]
- **Verified-absent security issue classes** — docs_review_2026_09_01_security_review_i1_no_xss_sink, docs_review_2026_09_01_security_review_i2_no_prototype_pollution, docs_review_2026_09_01_security_review_i3_no_telemetry, docs_review_2026_09_01_security_review_i4_no_secrets, docs_review_2026_09_01_security_review_url_injection_absent, docs_review_2026_09_01_security_review_insecure_transport_absent [EXTRACTED 1.00]

## Communities (257 total, 99 thin omitted)

### Community 0 - "Skin Copy Tables"
Cohesion: 0.07
Nodes (53): copyFor(), SKIN_COPY, setSkin(), blockOf(), BlockStats, BlockStatsSource, currentBlockIndex(), isBlockBoundary() (+45 more)

### Community 1 - "Copy Hooks and Formatting"
Cohesion: 0.08
Nodes (44): FORMAT, useCopy(), useCopyOverrides(), describeMiss(), bodyMassLossFraction(), exceedsDehydrationThreshold(), ExerciseRecords, Boot() (+36 more)

### Community 2 - "App Shell and Selectors"
Cohesion: 0.09
Nodes (42): App(), LoadErrorBanner(), SaveErrorBanner(), SaveErrorCopy, useHydrateOnce(), ViewShell(), ViewSwitch(), useWeeklyClose() (+34 more)

### Community 3 - "Civil Dates and ICS Export"
Cohesion: 0.08
Nodes (48): addDays(), assertValidDate(), assertValidTimeZone(), compareLocalDate(), daysBetween(), deviceTimeZone(), formatUtcMidnight(), instantOf() (+40 more)

### Community 4 - "Legacy v2 Migration"
Cohesion: 0.08
Nodes (40): migrate(), MigrateResult, Migration, MIGRATIONS, applyMigration(), ApplyMigrationResult, blankState(), compareCustomDayKeys() (+32 more)

### Community 5 - "Copy Tables and Skins"
Cohesion: 0.07
Nodes (29): BOARD_COPY, DEFAULT_COPY, LIMELIGHT_COPY, ABORT_KEYS, ALL_TABLES, COMMIT_KEYS, LENGTH_EXEMPT, OVERRIDE_TABLES (+21 more)

### Community 6 - "Setup Wizard and Unit Input"
Cohesion: 0.08
Nodes (45): input(), DEFAULT_BARBELL_STEP, DEFAULT_DUMBBELL_STEP, DEFAULT_STACK_STEP, loadUnit(), massUnit(), parseDecimal(), storedLoadKg() (+37 more)

### Community 7 - "Security Review Findings"
Cohesion: 0.08
Nodes (46): console-app.jsx, console-content.js, console-fun.jsx, console-store.jsx, console-today-extras.jsx, console-train.jsx, submit(), embedUrl (+38 more)

### Community 8 - "Reminders and Motivation Plans"
Cohesion: 0.06
Nodes (47): src/domain/reminders/client.ts, Cron Trigger (one-minute tick), CSP connect-src tightened to Worker origin, build/cspPlugin.ts, DeviceRecord, DST-aware reminder instant computation, fti-reminders Cloudflare Worker, worker/src/index.ts (+39 more)

### Community 9 - "Master Plan Amendments"
Cohesion: 0.06
Nodes (42): Master Plan (2026-09-01), Accent color reconciliation (#a3e635), Amendment A1: units gate value correction, Amendment A3: stepFor micro-plate unit gap, Amendment A4: formatLoad em-dash output, Amendment A5: exact US fluid ounce constant, Amendment A6: isValidLocalTime addition, Amendment A7: StoreStatus and reportSaveResult additions (+34 more)

### Community 10 - "Zod State Schema"
Cohesion: 0.05
Nodes (40): RFC-1035, ActivityLevelSchema, AssignmentStatusSchema, AvailabilitySchema, AvailabilitySlotSchema, CardIdSchema, EpochMsSchema, EquipmentSchema (+32 more)

### Community 11 - "Exercise Library"
Cohesion: 0.06
Nodes (27): EXERCISE_BY_ID, EXERCISE_TABLE, EXERCISES, MUSCLE_GROUPS, AMRAP, CANONICAL_IDS, DURATION, HEAVY (+19 more)

### Community 12 - "Plan Generator"
Cohesion: 0.10
Nodes (35): generatedPlan(), bandFor(), buildBlocks(), buildSessionExercises(), CARDIO_PREFERENCE, cardioExercise(), generatePlan(), GOAL_LABEL (+27 more)

### Community 13 - "Split Templates"
Cohesion: 0.05
Nodes (35): BAND_MUSCLES, CALF, CORE_HANG, CORE_PLANK, CORE_WHEEL, CURL_A, CURL_B, DEADLIFT (+27 more)

### Community 14 - "Skin Icons"
Cohesion: 0.10
Nodes (24): Icon(), ICON_FOR_KEY, IconProps, SkinLabel(), LIMELIGHT_ICONS, LimelightIconName, ICON_BYTES, ILLUSTRATION_BYTES (+16 more)

### Community 15 - "Content Review Cards"
Cohesion: 0.05
Nodes (38): Card c001: MPS elevated 24-48h; 20-40g protein across 3-5 meals, Card c002: stretch>contraction; slow eccentrics produce more hypertrophy per joule, Card c003: Epley 1RM formula w*(1+reps/30); 100x5->116kg; ~5% accurate, Card c004: 1996 caffeine/creatine paper used 5mg/kg co-ingested; modern reviews find no interaction, Card c006: 8h sleep raises T 10-15% vs 5h; GH in 4-5 pulses; one bad night costs 4-6% strength, Card c008: DOMS is not a proxy for training quality, Card c009: protein TEF 25-30%; net 600 of 800 kcal, Card c011: tonnage is a useful stimulus proxy; ~6 million kg cumulative (+30 more)

### Community 16 - "Motivation Video Assets"
Cohesion: 0.09
Nodes (21): AssetDb, deleteCustomVideo(), getCustomVideoMeta(), getCustomVideoUrl(), NO_REVOKE(), probeBundledVideo(), resetAssetDbForTests(), resolveVideoSrc() (+13 more)

### Community 17 - "Design Rounds and References"
Cohesion: 0.06
Nodes (37): Design A - Console, evolved (phosphor-on-black, docked action band, compliance strip, rest ring), Design B - Clinical dashboard (light ground, signed delta, sparklines, bullet bars), Design C - Editorial protocol (printed-card layout, footnotes, engraved rest dial), Design D - Coach board (filled slab labels, stacked progress bar, unit toggle), B - Clinical dashboard (rejected), D - Coach board (rejected as a whole, adopted in parts), Adopt A - Console evolved as shell, take B's data layer (round-one recommendation), C - Editorial protocol (rejected) (+29 more)

### Community 18 - "Test Arbitraries"
Cohesion: 0.06
Nodes (35): anyAvailability, anyBodyMassEntry, anyEpochMs, anyExercise, anyHydrationEntry, anyId, anyIntakeEntry, anyIsoWeekday (+27 more)

### Community 19 - "Push Payload and SW Handlers"
Cohesion: 0.10
Nodes (21): boundedString(), isRecord(), notificationClickTarget(), parsePushPayload(), PushPayload, resolveClickUrl(), safePath(), VALID (+13 more)

### Community 20 - "Training Store Actions"
Cohesion: 0.08
Nodes (25): RestTimer, startRest(), EpochMs, clearSessionMirror(), EMPTY_SESSION, initialSession(), loadSessionMirror(), MirrorSchema (+17 more)

### Community 21 - "Schedule Fixtures and Today"
Cohesion: 0.09
Nodes (29): LABELS, seed(), seed(), seedLongAgo(), emptyState(), labelMultiset(), labelsOf(), makeAvailability() (+21 more)

### Community 22 - "Nutrition and Summary Export"
Cohesion: 0.12
Nodes (32): buildSummary(), compareCodePoint(), field(), pad(), sanitizeForColumn(), ACTIVITY_BAND, ACTIVITY_FACTOR, BEVERAGE_TARGET_ML (+24 more)

### Community 23 - "Store Boot and Recovery"
Cohesion: 0.09
Nodes (22): defaultState(), documentWithCreatedAt(), makeState(), container, updateServiceWorker, cancelPendingSave(), canPersist(), flushSave() (+14 more)

### Community 24 - "Readiness Screening"
Cohesion: 0.08
Nodes (22): READINESS_QUESTIONS, ReadinessQuestion, ProfileSchema, Profile, Answer, ReadinessResult, ReadinessScreen(), NO (+14 more)

### Community 25 - "Store Profile Actions"
Cohesion: 0.06
Nodes (8): Availability, IntakeEntry, AppActions, expectDocumentConsistent(), FIXED_NOW, nutritionMock, planTemplate(), replacementTemplate()

### Community 26 - "Migration Wizard Tests"
Cohesion: 0.10
Nodes (22): reminderConfig, seedLegacy(), seedReviews(), SERIALIZE_FAILURE, makeAvailability(), makeBlankState(), makePlan(), makeProfile() (+14 more)

### Community 27 - "Persistence and Legacy Keys"
Cohesion: 0.14
Nodes (28): clearAssetStorage(), clearStorage(), deleteLegacyV2(), exportJson(), hasAnyLegacyKey(), hasLegacyV2(), importJson(), ImportResult (+20 more)

### Community 28 - "Reminder Worker"
Cohesion: 0.16
Nodes (25): RFC-9110, corsHeaders(), deviceKey(), DeviceLoad, fetch(), forbidden(), handleDelete(), handleFetch() (+17 more)

### Community 29 - "Fun Mechanics Plan"
Cohesion: 0.08
Nodes (29): P8 Fun Mechanics Plan, AtlasView.tsx, attemptSpecimenDraw(), src/domain/fun/blocks.ts (currentBlockIndex, crossedMilestones, blockStats), Boot.tsx (generic boot sequence), Specimen card c007 - Vyvanse and the heart (dropped), Specimen card c012 - Vietnamese coffee chemistry (dropped), Specimen card c013 - Hydration and Vyvanse (dropped) (+21 more)

### Community 30 - "Ui Plan Browse"
Cohesion: 0.16
Nodes (25): PlanBlock, selectCursor(), selectPlan(), Bounds, browseWeek(), clamp(), emit(), getBrowsedWeek() (+17 more)

### Community 31 - "Worker Package"
Cohesion: 0.07
Nodes (26): @cloudflare/workers-types, @pushforge/builder, dependencies, @pushforge/builder, description, devDependencies, @cloudflare/workers-types, typescript (+18 more)

### Community 32 - "Schedule"
Cohesion: 0.18
Nodes (24): RFC-9562, base64UrlOctets(), boundedString(), DeviceRecord, emptySent(), hasError(), isHttpsUrl(), isRecordObject() (+16 more)

### Community 33 - "Components Form Cues Modal"
Cohesion: 0.11
Nodes (13): FORM_CUES, FormCue, FORM_CUE_IDS, CueRequest, FormCuesModal(), FormCuesModalApi, FormCuesModalContext, Opener() (+5 more)

### Community 34 - "Root Build Config"
Cohesion: 0.08
Nodes (25): date-fns, @date-fns/tz, @fontsource/dm-mono, @fontsource/space-mono, @fontsource-variable/archivo, @fontsource-variable/geist, @fontsource-variable/jetbrains-mono, idb (+17 more)

### Community 35 - "Root Build Config"
Cohesion: 0.08
Nodes (25): eslint, @eslint/js, eslint-plugin-react-hooks, fake-indexeddb, globals, devDependencies, eslint, @eslint/js (+17 more)

### Community 36 - "Training Progression"
Cohesion: 0.14
Nodes (23): compareSetOrder(), CompletedSet, e1RMOrNull(), extendReps(), INCREMENT_FRACTION, isPerformedSet(), metCountText(), PerformedSet (+15 more)

### Community 37 - "Views Log View"
Cohesion: 0.13
Nodes (20): weeklyAmrapMax(), useActiveCursor(), useActiveProfileId(), useCursor(), latestBodyMassEntry(), nutritionInputFor(), useNutritionTargets(), AmrapSpark() (+12 more)

### Community 38 - "Store Schedule Selectors"
Cohesion: 0.15
Nodes (23): cached(), CacheEntry, calendarCache, documentSlices(), EMPTY_DAYS, EMPTY_LABELS, EMPTY_REVIEWS, labelCache (+15 more)

### Community 39 - "Components Toast Queue"
Cohesion: 0.14
Nodes (19): enqueue(), evictionIndex(), payloadKey(), selectVisible(), Probe(), Toast, TOAST_DURATION_MS, TOAST_PRIORITY (+11 more)

### Community 40 - "Root Build Config"
Cohesion: 0.08
Nodes (23): build/cspPlugin.test.ts, build/cspPlugin.ts, ES2023, node, src/config/videoInstances.ts, vite.config.ts, compilerOptions, allowImportingTsExtensions (+15 more)

### Community 41 - "Review Content Peer Review"
Cohesion: 0.11
Nodes (23): Antonio J et al. (2021), Common questions and misconceptions about creatine supplementation, J Int Soc Sports Nutr 18(1), DOI 10.1186/s12970-021-00412-w (verified), Black AE et al. (1996), Eur J Clin Nutr 50(2):72-92, PMID 8641250 (no DOI exists) — source of the non-ambulant 1.2 PAL anchor, Creatine dosed by body mass, not sex — ADOPTED, Creatine ethyl ester and buffered creatine (Kre-Alkalyn) — REJECTED, Cunningham JJ (1991), Body composition as a determinant of energy expenditure, Am J Clin Nutr 54(6):963-969, DOI 10.1093/ajcn/54.6.963 (verified), Cunningham (1991) FFM-based RMR equation (default when body fat is known), FAO/WHO/UNU (2004) activity/PAL bands — ADOPTED, FAO/WHO/UNU (2004), Human Energy Requirements, FAO Food and Nutrition Technical Report Series No. 1, Table 5.3 (no DOI, verified against primary PDF) (+15 more)

### Community 42 - "Store Schedule Actions"
Cohesion: 0.16
Nodes (17): notOffered(), remainingLabelsThisWeek(), AppState, attempt(), createScheduleActions(), DOMAIN_FUNCTIONS, isDomainMinted(), messageOf() (+9 more)

### Community 43 - "Test Index"
Cohesion: 0.11
Nodes (13): KvListResult, drained(), instant(), InterleavedKv, loadReal(), MemoryKv, putBody(), putRequest() (+5 more)

### Community 44 - "Components Time Capsule"
Cohesion: 0.13
Nodes (14): copy(), TimeCapsuleSchema, SpotlightButton(), at(), dateField(), noteField(), openWriteDialog(), sealButton() (+6 more)

### Community 45 - "Reminders Client"
Cohesion: 0.11
Nodes (14): isInstalledPwa(), isPushSupported(), PushAvailability, config, ConfigOverride, keyBytes(), KEYS, mediaQueryList() (+6 more)

### Community 46 - "Schedule Calendar"
Cohesion: 0.18
Nodes (21): assignmentsByDate(), assignToday(), CalendarDay, consumesASession(), gateReason(), nextServedDate(), pickIndex(), projectedCalendar() (+13 more)

### Community 47 - "Test Fixtures"
Cohesion: 0.16
Nodes (14): e1RM(), IDENTITY_BLOCK, session(), timedSet(), BENCH_PRESS, makeExercise(), makeSet(), nextId() (+6 more)

### Community 48 - "Views Train View"
Cohesion: 0.12
Nodes (15): Exercise, LoggedSet, PlannedExercise, AmrapSparkProps, PRListProps, ExerciseCardProps, CURL, dismissAllToasts() (+7 more)

### Community 49 - "Audio Chime"
Cohesion: 0.10
Nodes (7): FakeAudioContext, FakeAudioParam, FakeGainNode, FakeOscillator, loadChime(), RampPoint, RefusingAudioContext

### Community 50 - "Schedule Cursor"
Cohesion: 0.24
Nodes (18): computeReminderInstants(), advanceCursor(), assignmentFor(), completeSession(), isPaused(), isTerminal(), nextSession(), resolve() (+10 more)

### Community 51 - "Train Exercise Card"
Cohesion: 0.16
Nodes (18): CoachLine, formatDelta(), lifetimeBest(), OVER_BAND, BODYWEIGHT_ADVICE, HOLD_AT_60, render(), UNDER_BAND (+10 more)

### Community 52 - "Schedule Weekly"
Cohesion: 0.15
Nodes (18): closeWeeks(), maxDate(), minDate(), pauseOverlapsWeek(), ATHENS_MON_0001, ATHENS_SUN_2359, closedWeekStarts(), KI_MON_0001 (+10 more)

### Community 53 - "Test Push"
Cohesion: 0.13
Nodes (14): RFC-8292, Env, endpointDigest(), PushEnv, PushOutcome, sendPush(), RFC-8030, PushSubscriptionRecord (+6 more)

### Community 54 - "Scripts Inline Icons"
Cohesion: 0.19
Nodes (18): ART_DIR, ART_OUT, buildIconsModule(), buildIllustrationsModule(), camel(), ICON_DIR, ICON_OUT, inline() (+10 more)

### Community 55 - "Domain Types"
Cohesion: 0.16
Nodes (11): NOW, BodyMassEntry, LoadClass, Modality, ReminderInstant, SessionKind, UnitSystem, BodyMassChart() (+3 more)

### Community 56 - "App Reminder Sync"
Cohesion: 0.12
Nodes (11): ReminderSync(), scheduleInputsChanged(), config, DEVICE, FRESH, seed(), subscribeMock, SYNCED (+3 more)

### Community 57 - "Training Hydration"
Cohesion: 0.16
Nodes (10): activeAssignment(), HydrationCue, latestMark(), preSessionMass(), AT_1200_LOCAL, AT_1759_LOCAL, AT_1800_LOCAL, HydrationEntry (+2 more)

### Community 58 - "Domain Units"
Cohesion: 0.22
Nodes (15): achievableLoad(), displayLoad(), displayMass(), formatLoad(), formatMass(), formatVolume(), stepFor(), anyLoadKg (+7 more)

### Community 59 - "Ui Plan Focus"
Cohesion: 0.18
Nodes (15): planRowDomId(), emit(), getPending(), listeners, requestPlanFocus(), subscribe(), usePendingPlanFocus(), usePlanRowFocus() (+7 more)

### Community 60 - "Root Build Config"
Cohesion: 0.11
Nodes (18): compilerOptions, exactOptionalPropertyTypes, isolatedModules, jsx, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+10 more)

### Community 61 - "Components Spotlight"
Cohesion: 0.21
Nodes (14): digitFor(), CopyKey, buildSpotlightItems(), filterSpotlightItems(), Spotlight(), SpotlightArgs, SpotlightItem, isViewId() (+6 more)

### Community 62 - "Store Training"
Cohesion: 0.24
Nodes (15): BodyMassEntrySchema, ExerciseSchema, HydrationEntrySchema, LoggedSetSchema, inventoryOf(), requireProfile(), applyAddCustomExercise(), applyAddHydration() (+7 more)

### Community 63 - "Ui Hotkeys"
Cohesion: 0.20
Nodes (12): ALWAYS_ACTIVE, HotkeyApi, HotkeyContext, HotkeyProvider(), HotkeyScope, isTextEntry(), normalizeCombo(), OFF_SWITCH_EXEMPT (+4 more)

### Community 64 - "Workflows Ci"
Cohesion: 0.17
Nodes (16): Deploy cutover: one manual step, Manual step: Settings -> Pages -> Source: GitHub Actions, Clickjacking: confirmations, not CSP frame-ancestors, Capacitor native wrapper, Expo / React Native rewrite, Platform: stay a web PWA, replace the toolchain, CI gate: build hygiene (no inline <script>, no unpkg/text-babel), CI gate: CSP meta tag present in dist/index.html (+8 more)

### Community 65 - "Plans Master Plan"
Cohesion: 0.16
Nodes (16): achievableLoad plate quantisation, ACSM 2009 progression band, Bosquet 2007 tapering, Deload block cuts volume, not load, e1RM by the Epley formula, Nested equipment tiers, Exercise library and canonical ids, Direct/secondary mover fractional set counting (+8 more)

### Community 66 - "Plans Master Plan"
Cohesion: 0.20
Nodes (16): AppState root document type, Content Security Policy meta tag, Dates: date-fns 4 + @date-fns/tz with an explicit IANA zone, src/domain/dates.ts civil-date boundary, Gated destructive-action confirmation, Build-failing lint gates, v2 to v3 data migration, P1 Foundation plan (+8 more)

### Community 67 - "Plans Log Export Migration Cutover"
Cohesion: 0.18
Nodes (16): applyMigration(), AppState.customExercises (new slice), AppState.notes (new slice), New store key fti.v3, legacyDateOf(), legacyExerciseIdAt(), legacyIdForName(), legacyTargetSets() (+8 more)

### Community 68 - "Worker Tsconfig"
Cohesion: 0.12
Nodes (16): @cloudflare/workers-types, compilerOptions, exactOptionalPropertyTypes, isolatedModules, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 69 - "App Root Error Boundary"
Cohesion: 0.14
Nodes (6): downloadText(), createObjectURL, revokeObjectURL, Props, RootErrorBoundary, State

### Community 70 - "Fun Specimens"
Cohesion: 0.30
Nodes (14): SpecimenRarity, seededRng, drawSpecimen(), drawSpecimenForLoggedSet(), expectedRarityShares(), OrdinalKeyedInventory, recordSpecimenDraw(), specimenRngForLoggedSet() (+6 more)

### Community 71 - "Schedule Calendar"
Cohesion: 0.15
Nodes (14): expectOrdinalInvariant(), expectValid(), LABELS, MWF, pausePlan(), expectValid(), AppStateSchema, parseState() (+6 more)

### Community 72 - "Components Compliance Grid"
Cohesion: 0.19
Nodes (13): AssignmentStatus, IsoWeekday, buildStatusIndex(), completedInWeek(), ComplianceGrid(), ComplianceGridProps, ComplianceMark, MARK_BORDER (+5 more)

### Community 73 - "Components Reminder Settings Panel"
Cohesion: 0.20
Nodes (12): DEFAULT_REMINDER_SETTINGS, LEAD_MINUTE_CHOICES, readEnv(), RESOLVED_REMINDER_API, resolveReminderApiBase(), SubscribeFailure, failureCopy(), permissionDenied() (+4 more)

### Community 74 - "Views Atlas View"
Cohesion: 0.17
Nodes (10): SPECIMEN_CARDS, allText(), BASE_SET, firstHittingOrdinal(), seed(), seedAtOrdinal(), makeInventory(), ACQUIRED_AT (+2 more)

### Community 75 - "Reminders Client"
Cohesion: 0.23
Nodes (14): base64UrlToBytes(), bytesToBase64Url(), deviceUrl(), lastSyncIsFresh(), LegacyStandaloneNavigator, randomSecret(), readSubscriptionFields(), sameApplicationServerKey() (+6 more)

### Community 76 - "Setup Wizard"
Cohesion: 0.22
Nodes (10): READINESS_INSERT_INDEX, answerReadiness(), fillImperialWizard(), fillImperialWizardToAvailability(), fillImperialWizardToGoal(), FIXED_NOW, imperialBodyStep(), MEDICAL_PATTERN (+2 more)

### Community 77 - "Plans Training Session"
Cohesion: 0.14
Nodes (13): ACSM (2009) Progression Models in Resistance Training, de Salles et al. (2009) Rest Interval Between Sets, Double Progression Engine, Grgic et al. (2018) Rest Interval Sports Med 48(1), Legacy Coach Ladder, Schoenfeld et al. (2016) Rest Interval JSCR 30(7), coachLine(), suggestedProgression() (+5 more)

### Community 78 - "Review Code Review"
Cohesion: 0.15
Nodes (14): A34 — Hydration target is a fixed cup count with volume only implied in a label, A45 — defaultState() is not the real state shape, AppState, Availability, AvailabilitySlot, BodyMassEntry, MotivationalAsset, MotivationVideoState (+6 more)

### Community 79 - "Review Content Peer Review"
Cohesion: 0.16
Nodes (14): Autoregulated deload timing with a 4-8 week calendar backstop — recommended replacement for fixed deload cadence, Fixed deload cadence (weeks 6/12/18/24) is UNSUPPORTED by the deload literature, Deload load reduction is never applied, and the direction is backwards (WRONG), Double progression with a %-of-load increment and an equipment-floor guard clause — ADOPTED, Flat +2.5 kg progression increment violates the 2-10% guideline band at both ends (WRONG), Plateau-detection band (±1.0 lb over 3 points) is far narrower than natural weight noise (WRONG), Plateau response (150 kcal cut, wait 2 weeks) cannot resolve its own signal from noise, Progression engine contains two internal rule/implementation mismatches (WRONG) (+6 more)

### Community 80 - "Reminders Instants"
Cohesion: 0.21
Nodes (11): stateWith(), CAP_LEADS, EVERY_WEEKDAY, makeState(), relocated(), SETTINGS, availability(), makeAppState() (+3 more)

### Community 81 - "Format Plan"
Cohesion: 0.34
Nodes (12): exerciseName(), formatDayOfMonth(), formatPrescription(), formatRest(), formatSeconds(), formatSets(), formatWeekday(), WEEKDAY_ABBR (+4 more)

### Community 82 - "Store Reminder Actions"
Cohesion: 0.21
Nodes (9): device(), FixtureOptions, PushDevice, ReminderSettings, createReminderActions(), ReminderActionDeps, ReminderActions, sameSettings() (+1 more)

### Community 83 - "Views Export View"
Cohesion: 0.22
Nodes (11): backUpInPanel(), check(), click(), DEVICE, downloads, liveTeardowns, NOW, replaceButton() (+3 more)

### Community 84 - "Plans Master Plan"
Cohesion: 0.21
Nodes (12): closeWeeks weekly review evaluation, IndexedDB-backed custom motivation video, MDN media containers and codecs tables, Media formats: MP4/H.264/AAC and .m4a or MP3, Motivation miss window of 14 days, Motivation clip: muted autoplay, tap to unmute, Motivation modal has one Dismiss control, P3 Calendar and plan cursor (+4 more)

### Community 85 - "Review Content Peer Review"
Cohesion: 0.21
Nodes (12): Card c007 'Vyvanse and the heart': LDX raises HR 5-15bpm, SBP 3-7mmHg — MUST BE DELETED (Section 7, medical content), Card c013 'Hydration and Vyvanse': amphetamines reduce thirst; 3-4 L/day; dehydration causes headaches — MUST BE DELETED (Section 7, medical content), '8x8' (eight glasses of water a day) rule — REJECTED, Flat 3.5 L/day fluid target for everyone is WRONG and sex-invariant, Section 3: Hydration Targets Review, Intra-session '500 ml between sets' instruction has a route to acute harm (WRONG — highest-severity finding), IOM (2005), Dietary Reference Intakes for Water..., DOI 10.17226/10925 (verified), IOM (2005) sex-specific fluid baseline — ADOPTED (+4 more)

### Community 86 - "Plans Calendar Cursor"
Cohesion: 0.18
Nodes (9): Half-Open Pause Interval [from, to), PlannedSession Positional Ordinal Invariant, Pick-Today Swap Reshuffle, useWeeklyClose.ts, assignToday(), pausePlan(), resumePlan(), skipSession() (+1 more)

### Community 87 - "Domain Schema"
Cohesion: 0.20
Nodes (7): anyAppState, PlannedSessionSchema, Equal, FIXTURES, legacyDocument(), legacyProfile(), oneProfileDocument()

### Community 88 - "Store Schedule Actions"
Cohesion: 0.24
Nodes (3): LocalDate, UiPrefs, ScheduleActions

### Community 89 - "Skins Sfx"
Cohesion: 0.30
Nodes (9): createSfxPlayer(), SFX_NAMES, SfxBuffer, sfxMap(), SfxName, sfxUrl(), SKIN_BYTES, useFirstGestureUnlock() (+1 more)

### Community 90 - "Views Targets View"
Cohesion: 0.21
Nodes (7): AsciiBar, BENCH_ONLY_PLAN, FIXED_NOW, kcalField(), PROFILE, proteinField(), typeIntake()

### Community 91 - "Components Reminder Settings Panel"
Cohesion: 0.17
Nodes (8): availabilityMock, config, DEVICE, subscribeMock, SYNCED, syncMock, toggle(), unsubscribeMock

### Community 92 - "Plans Master Plan"
Cohesion: 0.22
Nodes (11): bryc jshash PRNGs reference, Copy contract, Default-skin copy rules, mulberry32 PRNG, P8 Fun mechanics and skins, P9 Prose pass, Specimen PRNG: splitmix32 via seededRng, Round-three design plan (+3 more)

### Community 93 - "Plans Master Plan"
Cohesion: 0.22
Nodes (11): computeReminderInstants, P5 Reminders, pushAvailability three-state readiness, Push library: @pushforge/builder, Reminder lead offset measured in elapsed time, Reminders: Web Push sent by a Cloudflare Worker cron, Durable Object alarms instead of cron + KV, Zero-server reminders: calendar export or ntfy (+3 more)

### Community 94 - "Plans Log Export Migration Cutover"
Cohesion: 0.22
Nodes (8): P7 Log Export Migration Cutover Plan, computeRecords(), ConfirmDestructive component, src/ui/download.ts (downloadText), ExportView.tsx, LogView.tsx, SettingsView destructive block / ConfirmDestructive, calendar.ts (Projected Calendar Module)

### Community 95 - "Review Content Peer Review"
Cohesion: 0.22
Nodes (11): Content Peer Review — FixThisInjustice Training App (2026-09-01), de Salles BF et al. (2009), Rest Interval between Sets in Strength Training, Sports Med 39(9):765-777, DOI 10.2165/11315230-000000000-00000 (verified; commonly circulated 10.2165/00007256-200939090-00003 returns 404), Grgic J et al. (2017), Eur J Sport Sci 17(8):983-993, DOI 10.1080/17461391.2017.1340524 (verified; commonly circulated ...1372855 returns 404), Grgic J, Schoenfeld BJ, Skrepnik M, Davies TB, Mikulic P (2018), Effects of Rest Interval Duration, Sports Med 48(1):137-151, DOI 10.1007/s40279-017-0788-x (verified), Rest-interval defaults stratified by load class (180-300s heavy compound / 120-180s moderate / 60-90s isolation) — ADOPTED, with an honest limit stated, Schoenfeld BJ, Pope ZK, Benik FM et al. (2016), Longer Interset Rest Periods Enhance Strength and Hypertrophy, J Strength Cond Res 30(7):1805-1812, DOI 10.1519/JSC.0000000000001272 (verified), 30-60 s 'hypertrophy rest' default — REJECTED, Ebben (2011) Push-Up Load Regression (+3 more)

### Community 96 - "Review Content Peer Review"
Cohesion: 0.20
Nodes (11): ACSM (2009), Progression Models in Resistance Training for Healthy Adults, Med Sci Sports Exerc 41(3):687-708, DOI 10.1249/mss.0b013e3181915670 (verified, PMID 19204579), Phase-2 bench milestone is arithmetically impossible under the app's own progression rule (WRONG), Card c005: 10-20 sets/wk optimal volume; curve flattens at 22-25 sets, Currier BS et al. (2026), ACSM Position Stand: Resistance Training Prescription, Med Sci Sports Exerc 58(4):851-872, DOI 10.1249/mss.0000000000003897 (verified) — supersedes ACSM 2009, Weekly direct-set volume and frequency for four muscle groups fall below evidence floors (WRONG), Fractional weekly set-counting rule (direct set=1.0, indirect set=0.5) — ADOPTED, Pelland JC et al. (2025), The Resistance Training Dose Response, Sports Medicine 56(2):481-505, DOI 10.1007/s40279-025-02344-w (verified), Schoenfeld BJ, Ogborn D, Krieger JW (2017), Dose-response relationship between weekly volume and hypertrophy, J Sports Sci 35(11):1073-1082, DOI 10.1080/02640414.2016.1210197 (verified) (+3 more)

### Community 97 - "Review Content Peer Review"
Cohesion: 0.18
Nodes (11): Card c010: deep squats produce less knee shear than partial squats, Heavy row explicitly permits form breakdown ('cheat' reps) on the heaviest loaded hip-hinge (WRONG, unsafe), Form-cue lookup key mismatch silently drops cues for one exercise (WRONG, silent failure), Section 6: Form Cue Safety Spot-Check, Leg-press 90-degree ROM cap cue contradicts the app's own specimen card c010 on squat depth (PARTIALLY), Magnesium glycinate top-of-range dose exceeds the supplemental UL (WRONG at the top of the range), No warm-up protocol, readiness screening, or contraindication language anywhere in the reviewed files (WRONG — omission), Streak logic credits rest days with no actual logging (WRONG) (+3 more)

### Community 98 - "Review Content Peer Review"
Cohesion: 0.20
Nodes (11): Daily energy and protein targets are literals derived from no stated equation and no user input (PARTIALLY), Garthe I et al. (2011), Effect of Two Different Weight-Loss Rates on Body Composition and Strength/Power, Int J Sport Nutr Exerc Metab 21(2):97-104, DOI 10.1123/ijsnem.21.2.97 (verified), Helms ER, Aragon AA, Fitschen PJ / Helms ER, Zinn C, Rowlands DS, Brown SR (2014), natural bodybuilding contest prep nutrition reviews, J Int Soc Sports Nutr 11:20 DOI 10.1186/1550-2783-11-20 and Int J Sport Nutr Exerc Metab 24(2):127-138 DOI 10.1123/ijsnem.2013-0054 (both verified), Jager R et al. (2017), ISSN Position Stand: protein and exercise, J Int Soc Sports Nutr 14:20, DOI 10.1186/s12970-017-0177-8 (verified), Morton RW et al. (2018), meta-regression of protein supplementation, Br J Sports Med 52(6):376-384, DOI 10.1136/bjsports-2017-097608 (verified), Section 1: Nutrition Targets Review, Protein targets with denominators kept strictly separate (BW vs FFM) — ADOPTED, 0.8 g/kg RDA protein floor — REJECTED (+3 more)

### Community 99 - "Content Specimen Cards"
Cohesion: 0.29
Nodes (9): CARDS_WITHOUT_DOI, DROPPED_CARD_IDS, RARITY_WEIGHT, SPECIMEN_BY_ID, SPECIMEN_CATEGORIES, SPECIMEN_RARITIES, SpecimenCategory, SpecimenSource (+1 more)

### Community 100 - "Store Fun Actions"
Cohesion: 0.25
Nodes (5): SpecimenCard, TimeCapsule, createFunActions(), FunActionDeps, FunActions

### Community 101 - "Plans Training Session"
Cohesion: 0.20
Nodes (11): completeSession(), coach.ts, progression.ts, restTimer.ts, store/selectors.ts, store/sessionMirror.ts, ui/audio/chime.ts, ui/hooks/useWakeLock.ts (+3 more)

### Community 102 - "Skins Sfx"
Cohesion: 0.18
Nodes (3): SfxDeps, Harness, skinOfUrl()

### Community 103 - "Components Spotlight"
Cohesion: 0.22
Nodes (6): args(), Harness(), LABELS, MWF, planOfState(), seed()

### Community 104 - "Review Code Review"
Cohesion: 0.27
Nodes (10): suggestedLoad(), A1 — Load increment/plateau threshold unit mismatch, A22 — suggestedLoad uses last 2 sets, not last 2 sessions, A23 — suggestedLoad has no week/session boundary; scrubbing corrupts suggestion, A24 — Exact float equality gates the progression rule, A6 — Export is the only (one-way, unlabeled) unit conversion, displayLoad(), LOAD_INCREMENT constant (+2 more)

### Community 105 - "Plans Master Plan"
Cohesion: 0.24
Nodes (10): FixThisInjustice v2 Master Plan, 2026-09-01 code review, P7 Log, export, migration and cutover, Personal-data CI grep gate, REFERENCES.md source log, 2026-09-01 security review, Specimen draw keyed by set ordinal, State management: Zustand with selectors (+2 more)

### Community 106 - "Root Build Config"
Cohesion: 0.20
Nodes (10): scripts, build, dev, icons:build, lint, preview, test, test:tz (+2 more)

### Community 107 - "Domain Bodyfat"
Cohesion: 0.36
Nodes (8): estimateBodyFatNavy(), NAVY_SEE_PCT, NAVY_SITE_LABEL, navyBodyDensity(), NavyTapeInput, positive(), man, woman

### Community 108 - "Training Rest Timer"
Cohesion: 0.40
Nodes (8): extend(), remainingS(), totalS(), useRestTimer(), vibrate(), notifyRestOver(), RestTimerPanel(), VIBRATE_PATTERN

### Community 109 - "Store Motivation Actions"
Cohesion: 0.24
Nodes (6): MotivationState, createMotivationActions(), handleBacklog(), isUnhandledMiss(), MotivationActionDeps, MotivationActions

### Community 110 - "Plans Calendar Cursor"
Cohesion: 0.22
Nodes (8): Absolute-Instant Rest Timer, Attendance-Driven Plan Cursor, P3 Calendar Cursor Plan, P4 Training Session Plan, ISO Weekly Review Closure, cursor.ts (Plan Cursor Module), closeWeeks(), Zourdos et al. (2016) Borg CR-10 RPE Anchor

### Community 111 - "Plans Master Plan"
Cohesion: 0.25
Nodes (9): ACSM 2007 exercise and fluid replacement, Activity level has three members, 2026-09-01 content peer review, Cunningham RMR equation, FAO/WHO/UNU 2004 PAL bands, Hydration cue without a fixed between-set volume, IOM 2005 beverage share, Mifflin-St Jeor RMR equation (+1 more)

### Community 112 - "Review Code Review"
Cohesion: 0.25
Nodes (9): A26 — Positional custom-exercise indices re-attribute sets on delete, A28 — Derived context frozen into every persisted set, A40 — s.streak is dead state, A42 — localStorage quota failure is swallowed silently, A60 — Bodyweight and timed work cannot be logged as a real set at all, A62 — SkipSession writes to a key nothing reads, Exercise, LoggedSet (+1 more)

### Community 113 - "Review Content Peer Review"
Cohesion: 0.22
Nodes (9): Deurenberg P, Weststrate JA, Seidell JC (1991), Br J Nutr 65(2):105-114, DOI 10.1079/bjn19910073 (verified), Deurenberg BMI-based body-fat equation — REJECTED, Hodgdon JA, Beckett MB (1984), Prediction of Percent Body Fat for U.S. Navy Men, NHRC Report 84-11, DOI 10.21236/ada143890 (verified), Hodgdon JA, Beckett MB (1984), ...for U.S. Navy Women, NHRC Report 84-29, DOI 10.21236/ada146456 (verified), Jackson AS, Pollock ML (1978/1980) skinfold equations, Br J Nutr 40(3):497-504 DOI 10.1079/bjn19780152 and Med Sci Sports Exerc 12(3):175-182 DOI 10.1249/00005768-198023000-00009 (both verified), Jackson-Pollock skinfold body-fat method — REJECTED, Merrill Z, Chambers A, Cham R (2020), Obes Sci Pract 6(2):189-195, DOI 10.1002/osp4.392 (verified), Potter AW et al. (2022), Front Physiol 13:868627, DOI 10.3389/fphys.2022.868627 (verified) — Navy method bias vs DXA, and the published female-equation typo (+1 more)

### Community 114 - "Fun Rng"
Cohesion: 0.33
Nodes (5): seedFromString(), splitmix32(), systemRng(), referenceSplitmix32(), t()

### Community 115 - "Store Motivation Actions"
Cohesion: 0.31
Nodes (6): stateOf(), missOn(), review(), seed(), makeState(), makeProfile()

### Community 116 - "Components Konami Overlay"
Cohesion: 0.31
Nodes (5): CODE, KonamiOverlay(), CODE, Listener(), useKonamiCode()

### Community 117 - "Hooks Use Wake Lock"
Cohesion: 0.28
Nodes (5): FakeSentinel, FakeWakeLock, useWakeLock(), wakeLockApi(), WakeLockStatus

### Community 118 - "Settings Data Section"
Cohesion: 0.28
Nodes (5): confirmButton(), downloads, NOW, panel(), typeWord()

### Community 119 - "Review Code Review"
Cohesion: 0.25
Nodes (8): A16 — setsForWeek returns a 2-set target for exercises with no set count, A17 — setsForWeek ignores weekly volume ramp for fixed-count exercises, A19 — parseReps treats durations as repetitions, A20 — 'max' disables load progression instead of triggering AMRAP handling, PlannedExercise, PlannedSession, PlanTemplate, Prescription

### Community 121 - "Root Build Config"
Cohesion: 0.29
Nodes (6): engines, node, name, private, type, version

### Community 122 - "App Update Prompt"
Cohesion: 0.48
Nodes (5): getSnapshot(), listeners, notifyUpdateReady(), subscribe(), UpdatePrompt()

### Community 124 - "Plans Foundation"
Cohesion: 0.40
Nodes (6): Amendment A2: tsconfig.app.json addition, Amendment A9: CSP frame-src host list reconciliation, CI/CD GitHub Pages deployment workflows, Build-time CSP meta-tag generation (cspPlugin), Vite/React/TypeScript PWA toolchain scaffold, src/config/videoInstances.ts single source for CSP frame-src

### Community 125 - "Review Code Review"
Cohesion: 0.33
Nodes (6): A10 — isoOffset returns previous day in positive-UTC-offset zones, A35 — Hydration day boundary is UTC (compounds A8), A8 — todayISO returns UTC date, not local date, A9 — isoDaysBetween loses a day across spring-forward DST, HydrationEntry, LocalDate (type)

### Community 126 - "Review Content Peer Review"
Cohesion: 0.33
Nodes (6): Baz-Valle E et al. (2022), J Hum Kinet 81:199-210, DOI 10.2478/hukin-2022-0017 (verified), Baz-Valle 12-20 sets/week as a universal default — REJECTED (narrower population than needed), Card u005: 2x/wk gives ~3.1% more growth than 1x in trained lifters; 3x adds nothing, Currier BS et al. (2023), Bayesian network meta-analysis of resistance training prescription, Br J Sports Med 57(18):1211-1220, DOI 10.1136/bjsports-2023-106807 (verified), Schoenfeld BJ, Grgic J, Krieger J (2019), How many times per week should a muscle be trained, J Sports Sci 37(11):1286-1295, DOI 10.1080/02640414.2018.1555906 (verified), Split-selection engine keyed to available training days, 2-6 — ADOPTED

### Community 127 - "Root Build Config"
Cohesion: 0.33
Nodes (6): DOM, DOM.Iterable, ES2022, WebWorker, lib, lib

### Community 128 - "Scripts Check No Emoji"
Cohesion: 0.40
Nodes (5): files, isEmoji(), PATHSPECS, TEXT_DEFAULT_MARKS, tracked

### Community 129 - "Plans Calendar Cursor"
Cohesion: 0.33
Nodes (4): scheduleSelectors.ts, SessionIndicator.tsx, TopBar.tsx, PlanView.tsx

### Community 130 - "Audio Chime"
Cohesion: 0.47
Nodes (5): audioContextConstructor(), chime(), getAudioContext(), playChime(), Window

### Community 131 - "Plans Log Export Migration Cutover"
Cohesion: 0.60
Nodes (5): DEPLOY.md (deleted), legacy/ directory (deleted at cutover), PROJECT_SUMMARY.md (deleted), Task 7: docs, legacy removal, CI gate, cutover, README.md

### Community 132 - "Plans Training Session"
Cohesion: 0.40
Nodes (5): '8x8' Daily Water Rule, IOM (2005) DRI for Water, Potassium, Sodium, Chloride, Sulfate, Legacy Flat 3.5 L Daily Fluid Rule, dailyBeverageTargetML(), Valtin (2002) 'Drink at Least Eight Glasses' Myth

### Community 133 - "Eslint Config"
Cohesion: 0.40
Nodes (4): noQualifiedLocalStorage, noQualifiedSessionStorage, noToISOString, restrictedGlobals

### Community 134 - "Worker Tsconfig"
Cohesion: 0.40
Nodes (4): src/**/*.ts, test/**/*.ts, include, vitest.config.ts

### Community 135 - "Skins Tokens"
Cohesion: 0.40
Nodes (3): BASE, BOARD, LIMELIGHT

### Community 137 - "Plans Training Session"
Cohesion: 0.50
Nodes (4): Sawka et al. (2007) Exercise and Fluid Replacement, Legacy '500 mL Between Sets' Instruction, No Fixed Hydration Volume / Drink-to-Thirst Cue, hydrationCue()

### Community 138 - "Plans Profile Nutrition Plan"
Cohesion: 0.50
Nodes (4): de Salles 2009, Grgic 2018, Sports Med, Rest interval rule by load class (180/120/90s), Schoenfeld 2016, J Strength Cond Res

### Community 139 - "Plans Profile Nutrition Plan"
Cohesion: 0.50
Nodes (4): Helms 2014, Int J Sport Nutr Exerc Metab 24(2):127-138, Jager 2017, J Int Soc Sports Nutr 14:20, Morton 2018, Br J Sports Med 52(6):376-384, Protein target rules (body-mass vs FFM denominators)

### Community 142 - "Plans Profile Nutrition Plan"
Cohesion: 0.67
Nodes (3): FAO/WHO/UNU PAL activity-factor bands, FAO/WHO/UNU 2004, Human Energy Requirements, Table 5.3, Gym PAL ladder 1.2/1.375/1.55/1.725/1.9 (rejected)

### Community 143 - "Plans Profile Nutrition Plan"
Cohesion: 0.67
Nodes (3): Antonio 2021, J Int Soc Sports Nutr, Creatine dosing rule, Kreider 2017, J Int Soc Sports Nutr

### Community 144 - "Plans Profile Nutrition Plan"
Cohesion: 0.67
Nodes (3): Bell 2023, Sports Med Open, Coleman 2024, PeerJ, Four-week deload cadence (calendar backstop)

### Community 145 - "Plans Profile Nutrition Plan"
Cohesion: 0.67
Nodes (3): Fat-loss rate prescription (0.7% BW/week), Garthe 2011, Int J Sport Nutr Exerc Metab 21(2):97-104, Helms 2014, J Int Soc Sports Nutr 11:20

### Community 146 - "Plans Profile Nutrition Plan"
Cohesion: 0.67
Nodes (3): Frankenfield 2013, Clin Nutr, Mifflin et al. 1990, Am J Clin Nutr 51(2):241-247, Mifflin-St Jeor RMR equation

### Community 147 - "Plans Profile Nutrition Plan"
Cohesion: 0.67
Nodes (3): Garthe 2011, Appl Physiol Nutr Metab 36(4):547-554, Muscle-gain energy surplus (500 kcal/day), Slater 2019, Front Nutr 6:131

### Community 148 - "Plans Profile Nutrition Plan"
Cohesion: 0.67
Nodes (3): Hall 2011, Lancet, Independent computation of intake target and expected rate, 3500 kcal/lb conversion rule (rejected)

### Community 149 - "Review Code Review"
Cohesion: 0.67
Nodes (3): A11 — Program advances on wall-clock time alone; skipped days unrecoverable, A12 — Before-start/after-end branches produce unread plausible-wrong states, PlanCursor

### Community 150 - "Review Code Review"
Cohesion: 0.67
Nodes (3): A7 — Imprecise lb-to-kg divisor, KG_PER_LB constant, toStoredLoad()

### Community 151 - "Plans Training Session"
Cohesion: 0.67
Nodes (3): Epley (1985) Poundage Chart, Reynolds et al. (2006) 1RM Estimation Error, e1RM()

### Community 153 - "Root Build Config"
Cohesion: 0.67
Nodes (3): vite/client, vite-plugin-pwa/client, types

## Ambiguous Edges - Review These
- `Security Review (2026-09-01)` → `Amendment A8: personal-data grep identifier list gap`  [AMBIGUOUS]
  docs/plans/2026-09-01-01-foundation.md · relation: references

## Knowledge Gaps
- **913 isolated node(s):** `FixThisInjustice Console Forensic Code Review`, `A2 — Body-mass entry silently rejects kg values`, `A3 — Delta-vs-baseline hard-codes 210 lb`, `A4 — Body-mass chart fixed lb axis`, `A5 — Coach feedback unit-labelled kg vs unlabelled deadbands` (+908 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **99 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Security Review (2026-09-01)` and `Amendment A8: personal-data grep identifier list gap`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `useAppStore` connect `App Shell and Selectors` to `Skin Copy Tables`, `Copy Hooks and Formatting`, `Copy Tables and Skins`, `Setup Wizard and Unit Input`, `Exercise Library`, `Skin Icons`, `Motivation Video Assets`, `Training Store Actions`, `Schedule Fixtures and Today`, `Store Boot and Recovery`, `Readiness Screening`, `Store Profile Actions`, `Migration Wizard Tests`, `Persistence and Legacy Keys`, `Ui Plan Browse`, `Views Log View`, `Store Schedule Selectors`, `Components Toast Queue`, `Components Time Capsule`, `Test Fixtures`, `Views Train View`, `Train Exercise Card`, `App Reminder Sync`, `Ui Plan Focus`, `Components Spotlight`, `Ui Hotkeys`, `App Root Error Boundary`, `Components Reminder Settings Panel`, `Views Atlas View`, `Setup Wizard`, `Format Plan`, `Views Export View`, `Skins Sfx`, `Views Targets View`, `Components Reminder Settings Panel`, `Components Spotlight`, `Training Rest Timer`, `Store Motivation Actions`, `Components Konami Overlay`, `Settings Data Section`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `AppState` connect `Store Schedule Actions` to `Skin Copy Tables`, `Copy Hooks and Formatting`, `App Shell and Selectors`, `Legacy v2 Migration`, `Zod State Schema`, `Skin Icons`, `Motivation Video Assets`, `Test Arbitraries`, `Training Store Actions`, `Schedule Fixtures and Today`, `Nutrition and Summary Export`, `Store Boot and Recovery`, `Store Profile Actions`, `Migration Wizard Tests`, `Persistence and Legacy Keys`, `Ui Plan Browse`, `Views Log View`, `Store Schedule Selectors`, `Reminders Client`, `Schedule Calendar`, `Views Train View`, `Schedule Cursor`, `Schedule Weekly`, `Domain Types`, `Training Hydration`, `Ui Plan Focus`, `Store Training`, `Schedule Calendar`, `Reminders Client`, `Reminders Instants`, `Store Reminder Actions`, `Domain Schema`, `Store Fun Actions`, `Components Spotlight`, `Store Motivation Actions`, `Store Motivation Actions`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `LocalDate` connect `Store Schedule Actions` to `Copy Hooks and Formatting`, `App Shell and Selectors`, `Civil Dates and ICS Export`, `Legacy v2 Migration`, `Test Arbitraries`, `Training Store Actions`, `Schedule Fixtures and Today`, `Store Boot and Recovery`, `Readiness Screening`, `Store Profile Actions`, `Migration Wizard Tests`, `Training Progression`, `Views Log View`, `Store Schedule Selectors`, `Store Schedule Actions`, `Components Time Capsule`, `Schedule Calendar`, `Views Train View`, `Schedule Cursor`, `Schedule Weekly`, `Domain Types`, `Training Hydration`, `Store Training`, `Schedule Calendar`, `Components Compliance Grid`, `Reminders Instants`, `Format Plan`, `Store Reminder Actions`, `Store Motivation Actions`, `Store Motivation Actions`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `FixThisInjustice Console Forensic Code Review`, `A2 — Body-mass entry silently rejects kg values`, `A3 — Delta-vs-baseline hard-codes 210 lb` to the rest of the system?**
  _913 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Skin Copy Tables` be split into smaller, more focused modules?**
  _Cohesion score 0.0650103519668737 - nodes in this community are weakly interconnected._
- **Should `Copy Hooks and Formatting` be split into smaller, more focused modules?**
  _Cohesion score 0.07960199004975124 - nodes in this community are weakly interconnected._