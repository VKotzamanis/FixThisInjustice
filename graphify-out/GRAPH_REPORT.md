# Graph Report - /home/vx/Desktop/Claude/FixThisInjustice  (2026-09-01)

## Corpus Check
- 5 files · ~125,127 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 751 nodes · 942 edges · 91 communities (43 shown, 48 thin omitted)
- Extraction: 87% EXTRACTED · 12% INFERRED · 1% AMBIGUOUS · INFERRED: 111 edges (avg confidence: 0.66)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Training & Nutrition Citations
- Plan Store & Data-Model Findings
- App Shell, Theme & Core UI
- File Inventory & Security Findings
- Fun Mechanics & Toast Findings
- Specimen Card Peer-Review Findings
- Infrastructure & Deploy Research
- Master Plan & Requirements Map
- Views & Unit Conversion Findings
- Train & Today View Findings
- PWA Native-Wrapper Research
- PWA Manifest
- BMR/TDEE Equation Citations
- Shared Chrome Components
- Design Canvas (dev tool)
- Hydration & Stimulant Findings
- Training Volume Findings
- Form Cue & Supplement Safety
- Progression & Deload Findings
- Body-Fat Method Citations
- Cutscene & Toast Feedback
- Nutrition Target Findings
- Script Loading and Globals Fragility
- Training Split Citations
- App Root
- Rest Interval Citations
- Reminder Delivery Options
- Creatine Dosing Citations
- Activity Multiplier Citations
- Load Increment Citations
- Protein Target Citations
- Export View
- Deployment Paths
- Platform Choice Decision
- Caloric Surplus Citations
- Train View and Rest Timer
- Tone Requirement
- Energy Requirement Citations
- Training-to-Failure Citations
- Equipment Increment Rules
- Backup and Restore
- Push Library Options
- Atlas View
- Log View
- Plan View
- Protocols View
- Today View
- Video Search Query Design
- State Refactor Candidate
- ACSM Progression Citations
- Immune & Overtraining Citations
- Vitamin D Guideline Citations
- Push-Up Kinetics Citations
- 1RM Prediction Citations
- 3500-kcal Rule Citations
- Squat Biomechanics Citations
- Protein Meta-Analysis Correction
- Neural Adaptation Citations
- Anatomy Reference Citations
- Strongman History Citations
- Creatine-Caffeine Trial Citations
- Service Worker Shell
- Shared Chrome Module File
- TypeScript Version Choice
- A46 Stale Closure Bug
- A47 Monotonic Counter Bug
- A56 Dev Build in Production
- A57 Non-Idempotent Drop RNG
- A58 Drop Rarity Exhaustion
- A66 Silent 404 Cache Bug
- A71 Video Modal Persistence Gap
- EpochMs Branded Type
- IsoWeekday Branded Type
- Kg Branded Type
- LocalTime Branded Type
- Ml Branded Type
- Code Review Document Root
- Seconds Branded Type
- TimeZone Branded Type
- NASEM 2023 DRI Citation
- Keyboard Inset Property
- Auto-Progression Algorithm
- Coach Feedback Logic
- Form Cues Modal
- Build Toolchain Migration
- Almanac ExerciseRow
- Prototype Console ExerciseRow
- Protocol ExerciseRow

## God Nodes (most connected - your core abstractions)
1. `Content Peer-Review Sources` - 132 edges
2. `Section 5: The 42 Specimen Cards Review` - 43 edges
3. `Deliverable 2: Generic-User Engine Recommended Equations` - 29 edges
4. `FTI Console PWA Security Review (2026-09-01)` - 25 edges
5. `usePlanStore()` - 19 edges
6. `Infrastructure and Toolchain Sources` - 18 edges
7. `Prototype Console App Component` - 16 edges
8. `App()` - 15 edges
9. `AppState` - 15 edges
10. `Almanac App Component` - 14 edges

## Surprising Connections (you probably didn't know these)
- `usePlanStore()` --semantically_similar_to--> `WeeklyReview`  [INFERRED] [semantically similar]
  console-store.jsx → docs/review/2026-09-01-code-review.md
- `A32 — RestTimer is component-local, destroyed by any navigation` --references--> `App()`  [EXTRACTED]
  docs/review/2026-09-01-code-review.md → console-app.jsx
- `A54 — Two keydown listeners bind the same key` --references--> `App()`  [EXTRACTED]
  docs/review/2026-09-01-code-review.md → console-app.jsx
- `A72 — Nav/hotkey documentation drift` --references--> `App()`  [EXTRACTED]
  docs/review/2026-09-01-code-review.md → console-app.jsx
- `A25 — makeCoachLine's PR branch compares weight only, ignoring reps/unit` --references--> `makeCoachLine()`  [EXTRACTED]
  docs/review/2026-09-01-code-review.md → console-store.jsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **BMR/RMR Predictive Equation Family** — references_mifflin_stjeor_1990, references_roza_shizgal_1984, references_harris_benedict_1918, references_cunningham_1980, references_cunningham_1991, references_frankenfield_2005_review [INFERRED 0.85]
- **US Navy Circumference Body-Fat Method Evidence Chain** — references_hodgdon_beckett_1984_men, references_hodgdon_beckett_1984_women, references_dod_instruction_1308_3_2002, references_potter_2022_navy_vs_dxa_marines, references_merrill_2020_navy_vs_dxa_general, references_friedl_vogel_1997_circumference_validity [INFERRED 0.85]
- **Deload and Taper Protocol Evidence Base** — references_bell_2023_deload_delphi_consensus, references_rogerson_2024_deload_survey, references_coleman_2024_deload_rct, references_pancar_2026_deload_rct, references_bosquet_2007_taper_meta, references_pritchard_2015_taper_review [INFERRED 0.85]
- **Platform-choice decision family (PWA vs Capacitor vs Expo)** — docs_plans_2026_09_01_00_master_plan_platform_stay_pwa_vite, docs_plans_2026_09_01_00_master_plan_platform_capacitor_native, docs_plans_2026_09_01_00_master_plan_platform_expo_rewrite [INFERRED 0.85]
- **Reminder-delivery decision family (Worker cron vs zero-server vs Durable Object)** — docs_plans_2026_09_01_00_master_plan_reminders_cloudflare_worker_webpush, docs_plans_2026_09_01_00_master_plan_reminders_zero_server, docs_plans_2026_09_01_00_master_plan_reminders_durable_object_alarms [INFERRED 0.85]
- **Date/time library decision family (date-fns+tz vs Temporal vs Luxon)** — docs_plans_2026_09_01_00_master_plan_dates_date_fns_tz, docs_plans_2026_09_01_00_master_plan_temporal_api, docs_plans_2026_09_01_00_master_plan_luxon [INFERRED 0.85]
- **Unit handling inconsistency (kg vs lb) across the app** — docs_review_2026_09_01_code_review_a1, docs_review_2026_09_01_code_review_a2, docs_review_2026_09_01_code_review_a3, docs_review_2026_09_01_code_review_a4, docs_review_2026_09_01_code_review_a5, docs_review_2026_09_01_code_review_a6, docs_review_2026_09_01_code_review_a7 [EXTRACTED 1.00]
- **UTC-vs-local-date boundary bugs** — docs_review_2026_09_01_code_review_a8, docs_review_2026_09_01_code_review_a9, docs_review_2026_09_01_code_review_a10, docs_review_2026_09_01_code_review_a35 [EXTRACTED 1.00]
- **Persistence and data-loss defects** — docs_review_2026_09_01_code_review_a41, docs_review_2026_09_01_code_review_a42, docs_review_2026_09_01_code_review_a43, docs_review_2026_09_01_code_review_a44 [EXTRACTED 1.00]
- **Failure pattern: wrong journal attached to the right paper** — docs_review_2026_09_01_content_peer_review_card_c002, docs_review_2026_09_01_content_peer_review_card_c004, docs_review_2026_09_01_content_peer_review_card_c008, docs_review_2026_09_01_content_peer_review_card_c013, docs_review_2026_09_01_content_peer_review_card_r007, docs_review_2026_09_01_content_peer_review_card_u007, docs_review_2026_09_01_content_peer_review_card_c014, docs_review_2026_09_01_content_peer_review_card_u009 [EXTRACTED 1.00]
- **Failure pattern: real, topically-adjacent paper but the number came from elsewhere** — docs_review_2026_09_01_content_peer_review_card_c005, docs_review_2026_09_01_content_peer_review_card_c011, docs_review_2026_09_01_content_peer_review_card_c014, docs_review_2026_09_01_content_peer_review_card_c015, docs_review_2026_09_01_content_peer_review_card_r005, docs_review_2026_09_01_content_peer_review_card_u008 [EXTRACTED 1.00]
- **Failure pattern: card cites a paper that argues the opposite** — docs_review_2026_09_01_content_peer_review_card_c004, docs_review_2026_09_01_content_peer_review_card_c011, docs_review_2026_09_01_content_peer_review_card_u013, docs_review_2026_09_01_content_peer_review_card_r001, docs_review_2026_09_01_content_peer_review_card_r005 [EXTRACTED 1.00]
- **Missing runtime schema validation across state boundaries** — docs_review_2026_09_01_security_review_c1_unvalidated_import, docs_review_2026_09_01_security_review_m5_no_schema_version, docs_review_2026_09_01_security_review_m6_unbounded_setlog_values, docs_review_2026_09_01_security_review_m7_watertarget_unbounded_loop [EXTRACTED 1.00]
- **CSP meta tag as shared mitigation point for clickjacking and postMessage exposure** — docs_review_2026_09_01_security_review_m1_no_csp, docs_review_2026_09_01_security_review_h2_unconfirmed_data_wipe, docs_review_2026_09_01_security_review_m8_unauth_postmessage [EXTRACTED 1.00]
- **Verified-absent security issue classes** — docs_review_2026_09_01_security_review_i1_no_xss_sink, docs_review_2026_09_01_security_review_i2_no_prototype_pollution, docs_review_2026_09_01_security_review_i3_no_telemetry, docs_review_2026_09_01_security_review_i4_no_secrets, docs_review_2026_09_01_security_review_url_injection_absent, docs_review_2026_09_01_security_review_insecure_transport_absent [EXTRACTED 1.00]
- **Notification & Cutscene Feedback System** — project_summary_boot_sequence, project_summary_phase_transition_cutscene, project_summary_milestone_toast, project_summary_specimen_drop_toast, project_summary_telemetry_coach_toast, project_summary_undo_toast, project_summary_pwa_update_toast, index_fun_mechanics_toast_ui [EXTRACTED 1.00]
- **Video Reference Resilience Chain (search-query field + Invidious fallback)** — project_summary_video_search_query_field, project_summary_newpipe_intent_urls, project_summary_piped_video_source, project_summary_invidious_video_modal, index_vmod_search_ui, index_vmod_instance_ui [EXTRACTED 1.00]
- **Deployment-Doc Drift Cluster (DEPLOY.md vs PROJECT_SUMMARY.md conflicting claims)** — deploy_console_html_as_app_entry, project_summary_index_html_as_entry_point, deploy_upload_file_list, project_summary_known_deployment_gotchas, deploy_export_view_hotkey_6, project_summary_export_view [INFERRED 0.75]
- **Parallel Visual Theme Explorations of the Reconditioning Plan UI** — prototype_almanac_app, prototype_console_app, prototype_protocol_app [INFERRED 0.85]
- **Console Production Feature Set** — console_module, console_sw_registration, console_video_modal, console_gamification_layer, console_mobile_first_pass [INFERRED 0.75]
- **UIs Sharing the Reconditioning Program Data** — console_reconditioning_program, console_module, prototype_almanac_app, prototype_console_app, prototype_protocol_app [INFERRED 0.85]

## Communities (91 total, 48 thin omitted)

### Community 0 - "Training & Nutrition Citations"
Cohesion: 0.02
Nodes (99): ACSM 2007 (Exercise and Fluid Replacement Position Stand), Antonio 2021 (Common Creatine Misconceptions), Aragon & Schoenfeld 2013 (Nutrient Timing Review), Athenaeus, Deipnosophistae 10.412 (Theagenes of Thasos Ox Story), Baz-Valle 2022 (Weekly Volume Review, Hum Kinet), Belay 2008 (Coffee Bean Caffeine Content, Food Chemistry), Bell 2023 (Deload Delphi Consensus, Sports Med Open), Bhutani 2017 (Two-Week Body-Weight-Change Composition) (+91 more)

### Community 1 - "Plan Store & Data-Model Findings"
Cohesion: 0.05
Nodes (61): ComplianceGrid(), defaultState(), isoDaysBetween(), isoOffset(), loadV2(), makeCoachLine(), parseReps(), programPosition() (+53 more)

### Community 2 - "App Shell, Theme & Core UI"
Cohesion: 0.06
Nodes (46): Gamification / Fun Mechanics Layer, Mobile-First Responsive Pass, Console App Shell (console.html), 24-Week Reconditioning Program, PWA Offline Support (Service Worker Registration), Console CRT Production Theme, Exercise Video Modal (NewPipe-first), Checklist() (+38 more)

### Community 3 - "File Inventory & Security Findings"
Cohesion: 0.09
Nodes (46): console-app.jsx, console-content.js, console-fun.jsx, VyvanseCurve(), console-store.jsx, console-today-extras.jsx, console-train.jsx, submit() (+38 more)

### Community 4 - "Fun Mechanics & Toast Findings"
Cohesion: 0.05
Nodes (24): App(), TWEAK_DEFAULTS, buildTelemetryMsg(), ErrorBoundary, PhaseTransition(), SpecimenDrop(), useKonamiCode(), INSTANCES (+16 more)

### Community 5 - "Specimen Card Peer-Review Findings"
Cohesion: 0.05
Nodes (38): Card c001: MPS elevated 24-48h; 20-40g protein across 3-5 meals, Card c002: stretch>contraction; slow eccentrics produce more hypertrophy per joule, Card c003: Epley 1RM formula w*(1+reps/30); 100x5->116kg; ~5% accurate, Card c004: 1996 caffeine/creatine paper used 5mg/kg co-ingested; modern reviews find no interaction, Card c006: 8h sleep raises T 10-15% vs 5h; GH in 4-5 pulses; one bad night costs 4-6% strength, Card c008: DOMS is not a proxy for training quality, Card c009: protein TEF 25-30%; net 600 of 800 kcal, Card c011: tonnage is a useful stimulus proxy; ~6 million kg cumulative (+30 more)

### Community 6 - "Infrastructure & Deploy Research"
Cohesion: 0.06
Nodes (38): Code-Review Finding A50 (Babel preset-env), @babel/standalone Production Warning, Cloudflare Cron-Limit Wording Conflict, Cloudflare KV Delete API, Cloudflare KV Read API, Cloudflare KV Write API, Cloudflare nodejs_compat Flag, Cloudflare Scheduled Handler API (+30 more)

### Community 7 - "Master Plan & Requirements Map"
Cohesion: 0.07
Nodes (36): AppState (root persisted state shape), Clickjacking mitigation: confirmations, not CSP frame-ancestors, Dates: date-fns 4 + @date-fns/tz, explicit IANA zone everywhere, IndexedDB for all app state (rejected alternative), Luxon (rejected alternative), FixThisInjustice v2 Master Plan, MotivationState (missed-week video trigger state), PlanTemplate (calendar-free plan structure) (+28 more)

### Community 8 - "Views & Unit Conversion Findings"
Cohesion: 0.09
Nodes (21): suggestedLoad(), ExportView(), TodayView(), A1 — Load increment/plateau threshold unit mismatch, A22 — suggestedLoad uses last 2 sets, not last 2 sessions, A23 — suggestedLoad has no week/session boundary; scrubbing corrupts suggestion, A24 — Exact float equality gates the progression rule, A3 — Delta-vs-baseline hard-codes 210 lb (+13 more)

### Community 9 - "Train & Today View Findings"
Cohesion: 0.09
Nodes (22): COMPOUND_LIFTS, MealTracker(), PushupTodayCard(), QuickWeightLog(), SkipSession(), ExerciseCard(), PushupQuickLog(), RestTimer() (+14 more)

### Community 10 - "PWA Native-Wrapper Research"
Cohesion: 0.12
Nodes (18): Video modal Invidious instance bar (.vmod-instance), Invidious-only video modal, NewPipe intent URLs (tried, abandoned), Piped video source (tried, abandoned), Android 14 Exact Alarm Restriction, Apple Developer Program Fee, Capacitor iOS Build Requirement, Capacitor Local Notifications API (+10 more)

### Community 11 - "PWA Manifest"
Cohesion: 0.13
Nodes (14): background_color, categories, description, display, icons, name, orientation, scope (+6 more)

### Community 12 - "BMR/TDEE Equation Citations"
Cohesion: 0.21
Nodes (13): Cunningham JJ (1991), Body composition as a determinant of energy expenditure, Am J Clin Nutr 54(6):963-969, DOI 10.1093/ajcn/54.6.963 (verified), Cunningham (1991) FFM-based RMR equation (default when body fat is known), '8x8' (eight glasses of water a day) rule — REJECTED, Frankenfield DC (2013), Bias and accuracy of resting metabolic rate equations, Clin Nutr 32(6):976-982, DOI 10.1016/j.clnu.2013.03.022 (verified), Deliverable 2: Generic-User Engine Recommended Equations, Hall KD et al. (2011), Quantification of the effect of energy imbalance on bodyweight, The Lancet 378(9793):826-837, DOI 10.1016/S0140-6736(11)60812-X (verified), Hall dynamic energy-balance replacement rule — ADOPTED replacement for the 3,500 kcal/lb rule, Harris-Benedict / Roza-Shizgal RMR equation — REJECTED (+5 more)

### Community 13 - "Shared Chrome Components"
Cohesion: 0.18
Nodes (7): Boot(), Setup(), Spotlight(), VIEWS, A68 — Boot sequence hard-codes one subject's anthropometry, A72 — Nav/hotkey documentation drift, Setup screen collects only one field (programme start date) — nothing can be personalised (blocking problem)

### Community 14 - "Design Canvas (dev tool)"
Cohesion: 0.18
Nodes (4): DC, DCArtboardFrame(), DCCtx, dcExport()

### Community 15 - "Hydration & Stimulant Findings"
Cohesion: 0.23
Nodes (12): Content Peer Review — FixThisInjustice Training App (2026-09-01), Card c007 'Vyvanse and the heart': LDX raises HR 5-15bpm, SBP 3-7mmHg — MUST BE DELETED (Section 7, medical content), Card c013 'Hydration and Vyvanse': amphetamines reduce thirst; 3-4 L/day; dehydration causes headaches — MUST BE DELETED (Section 7, medical content), Grgic J et al. (2017), Eur J Sport Sci 17(8):983-993, DOI 10.1080/17461391.2017.1340524 (verified; commonly circulated ...1372855 returns 404), Flat 3.5 L/day fluid target for everyone is WRONG and sex-invariant, Section 3: Hydration Targets Review, Intra-session '500 ml between sets' instruction has a route to acute harm (WRONG — highest-severity finding), IOM (2005), Dietary Reference Intakes for Water..., DOI 10.17226/10925 (verified) (+4 more)

### Community 16 - "Training Volume Findings"
Cohesion: 0.20
Nodes (11): ACSM (2009), Progression Models in Resistance Training for Healthy Adults, Med Sci Sports Exerc 41(3):687-708, DOI 10.1249/mss.0b013e3181915670 (verified, PMID 19204579), Phase-2 bench milestone is arithmetically impossible under the app's own progression rule (WRONG), Card c005: 10-20 sets/wk optimal volume; curve flattens at 22-25 sets, Currier BS et al. (2026), ACSM Position Stand: Resistance Training Prescription, Med Sci Sports Exerc 58(4):851-872, DOI 10.1249/mss.0000000000003897 (verified) — supersedes ACSM 2009, Weekly direct-set volume and frequency for four muscle groups fall below evidence floors (WRONG), Fractional weekly set-counting rule (direct set=1.0, indirect set=0.5) — ADOPTED, Pelland JC et al. (2025), The Resistance Training Dose Response, Sports Medicine 56(2):481-505, DOI 10.1007/s40279-025-02344-w (verified), Schoenfeld BJ, Ogborn D, Krieger JW (2017), Dose-response relationship between weekly volume and hypertrophy, J Sports Sci 35(11):1073-1082, DOI 10.1080/02640414.2016.1210197 (verified) (+3 more)

### Community 17 - "Form Cue & Supplement Safety"
Cohesion: 0.18
Nodes (11): Card c010: deep squats produce less knee shear than partial squats, Heavy row explicitly permits form breakdown ('cheat' reps) on the heaviest loaded hip-hinge (WRONG, unsafe), Form-cue lookup key mismatch silently drops cues for one exercise (WRONG, silent failure), Section 6: Form Cue Safety Spot-Check, Leg-press 90-degree ROM cap cue contradicts the app's own specimen card c010 on squat depth (PARTIALLY), Magnesium glycinate top-of-range dose exceeds the supplemental UL (WRONG at the top of the range), No warm-up protocol, readiness screening, or contraindication language anywhere in the reviewed files (WRONG — omission), Streak logic credits rest days with no actual logging (WRONG) (+3 more)

### Community 18 - "Progression & Deload Findings"
Cohesion: 0.22
Nodes (10): Autoregulated deload timing with a 4-8 week calendar backstop — recommended replacement for fixed deload cadence, Fixed deload cadence (weeks 6/12/18/24) is UNSUPPORTED by the deload literature, Deload load reduction is never applied, and the direction is backwards (WRONG), Plateau-detection band (±1.0 lb over 3 points) is far narrower than natural weight noise (WRONG), Plateau response (150 kcal cut, wait 2 weeks) cannot resolve its own signal from noise, Progression engine contains two internal rule/implementation mismatches (WRONG), Section 2.2: Progression Rules Review, Rest-timer default is too short and scoped incorrectly (WRONG) (+2 more)

### Community 19 - "Body-Fat Method Citations"
Cohesion: 0.22
Nodes (9): Deurenberg P, Weststrate JA, Seidell JC (1991), Br J Nutr 65(2):105-114, DOI 10.1079/bjn19910073 (verified), Deurenberg BMI-based body-fat equation — REJECTED, Hodgdon JA, Beckett MB (1984), Prediction of Percent Body Fat for U.S. Navy Men, NHRC Report 84-11, DOI 10.21236/ada143890 (verified), Hodgdon JA, Beckett MB (1984), ...for U.S. Navy Women, NHRC Report 84-29, DOI 10.21236/ada146456 (verified), Jackson AS, Pollock ML (1978/1980) skinfold equations, Br J Nutr 40(3):497-504 DOI 10.1079/bjn19780152 and Med Sci Sports Exerc 12(3):175-182 DOI 10.1249/00005768-198023000-00009 (both verified), Jackson-Pollock skinfold body-fat method — REJECTED, Merrill Z, Chambers A, Cham R (2020), Obes Sci Pract 6(2):189-195, DOI 10.1002/osp4.392 (verified), Potter AW et al. (2022), Front Physiol 13:868627, DOI 10.3389/fphys.2022.868627 (verified) — Navy method bias vs DXA, and the published female-equation typo (+1 more)

### Community 20 - "Cutscene & Toast Feedback"
Cohesion: 0.25
Nodes (8): Fun-mechanics toast/cutscene CSS block, Boot sequence cutscene, Milestone toast (50/100/250/500/1000 sets), Phase transition cutscene, PWA update toast, Specimen drop toast, Telemetry / coach toast, Undo toast (6s window)

### Community 21 - "Nutrition Target Findings"
Cohesion: 0.29
Nodes (7): Daily energy and protein targets are literals derived from no stated equation and no user input (PARTIALLY), Garthe I et al. (2011), Effect of Two Different Weight-Loss Rates on Body Composition and Strength/Power, Int J Sport Nutr Exerc Metab 21(2):97-104, DOI 10.1123/ijsnem.21.2.97 (verified), Helms ER, Aragon AA, Fitschen PJ / Helms ER, Zinn C, Rowlands DS, Brown SR (2014), natural bodybuilding contest prep nutrition reviews, J Int Soc Sports Nutr 11:20 DOI 10.1186/1550-2783-11-20 and Int J Sport Nutr Exerc Metab 24(2):127-138 DOI 10.1123/ijsnem.2013-0054 (both verified), Section 1: Nutrition Targets Review, Taper mechanism claim is physiologically backwards (WRONG), Weight curve endpoint contradicts stated target (WRONG), Fat-loss rate: 0.5-1.0 %BW/week, 0.7% best supported — ADOPTED

### Community 22 - "Script Loading and Globals Fragility"
Cohesion: 0.40
Nodes (6): Black-Screen-After-Deploy Troubleshooting, Script loading order (React/Babel-standalone, no build step), Inline Babel script fetch-race bug, Inline <App/> script block approach (abandoned), React Context refactor candidate, window.* globals for cross-file communication

### Community 23 - "Training Split Citations"
Cohesion: 0.33
Nodes (6): Baz-Valle E et al. (2022), J Hum Kinet 81:199-210, DOI 10.2478/hukin-2022-0017 (verified), Baz-Valle 12-20 sets/week as a universal default — REJECTED (narrower population than needed), Card u005: 2x/wk gives ~3.1% more growth than 1x in trained lifters; 3x adds nothing, Currier BS et al. (2023), Bayesian network meta-analysis of resistance training prescription, Br J Sports Med 57(18):1211-1220, DOI 10.1136/bjsports-2023-106807 (verified), Schoenfeld BJ, Grgic J, Krieger J (2019), How many times per week should a muscle be trained, J Sports Sci 37(11):1286-1295, DOI 10.1080/02640414.2018.1555906 (verified), Split-selection engine keyed to available training days, 2-6 — ADOPTED

### Community 24 - "App Root"
Cohesion: 0.50
Nodes (5): DEPLOY.md claim: console.html is the app, index.html is a dev-only design canvas, index.html app shell (CSS + script-tag entry point), console.html / index.html duplication issue, ~1200 lines of CSS inlined in index.html, PROJECT_SUMMARY.md claim: index.html is the entry point

### Community 25 - "Rest Interval Citations"
Cohesion: 0.60
Nodes (5): de Salles BF et al. (2009), Rest Interval between Sets in Strength Training, Sports Med 39(9):765-777, DOI 10.2165/11315230-000000000-00000 (verified; commonly circulated 10.2165/00007256-200939090-00003 returns 404), Grgic J, Schoenfeld BJ, Skrepnik M, Davies TB, Mikulic P (2018), Effects of Rest Interval Duration, Sports Med 48(1):137-151, DOI 10.1007/s40279-017-0788-x (verified), Rest-interval defaults stratified by load class (180-300s heavy compound / 120-180s moderate / 60-90s isolation) — ADOPTED, with an honest limit stated, Schoenfeld BJ, Pope ZK, Benik FM et al. (2016), Longer Interset Rest Periods Enhance Strength and Hypertrophy, J Strength Cond Res 30(7):1805-1812, DOI 10.1519/JSC.0000000000001272 (verified), 30-60 s 'hypertrophy rest' default — REJECTED

### Community 26 - "Reminder Delivery Options"
Cohesion: 0.67
Nodes (4): ReminderInstant (computed push reminder record), Reminders: Web Push sent by a Cloudflare Worker cron, Durable Object alarms instead of cron + KV, Zero-server reminders: calendar export or ntfy

### Community 27 - "Creatine Dosing Citations"
Cohesion: 0.67
Nodes (4): Antonio J et al. (2021), Common questions and misconceptions about creatine supplementation, J Int Soc Sports Nutr 18(1), DOI 10.1186/s12970-021-00412-w (verified), Creatine dosed by body mass, not sex — ADOPTED, Creatine ethyl ester and buffered creatine (Kre-Alkalyn) — REJECTED, Kreider RB et al. (2017), ISSN position stand: creatine supplementation, J Int Soc Sports Nutr 14:18, DOI 10.1186/s12970-017-0173-z (verified)

### Community 28 - "Activity Multiplier Citations"
Cohesion: 0.50
Nodes (4): Black AE et al. (1996), Eur J Clin Nutr 50(2):72-92, PMID 8641250 (no DOI exists) — source of the non-ambulant 1.2 PAL anchor, FAO/WHO/UNU (2004) activity/PAL bands — ADOPTED, FAO/WHO/UNU (2004), Human Energy Requirements, FAO Food and Nutrition Technical Report Series No. 1, Table 5.3 (no DOI, verified against primary PDF), Ubiquitous gym-ladder multipliers 1.2/1.375/1.55/1.725/1.9 — REJECTED

### Community 29 - "Load Increment Citations"
Cohesion: 0.67
Nodes (4): Double progression with a %-of-load increment and an equipment-floor guard clause — ADOPTED, Flat +2.5 kg progression increment violates the 2-10% guideline band at both ends (WRONG), Velocity-based autoregulation as the progression trigger — REJECTED (on instrumentation, not evidence), Zourdos MC et al. (2016), J Strength Cond Res 30(1):267-275, DOI 10.1519/JSC.0000000000001049 (verified) — RIR-based RPE scale validated against bar velocity

### Community 30 - "Protein Target Citations"
Cohesion: 0.67
Nodes (4): Jager R et al. (2017), ISSN Position Stand: protein and exercise, J Int Soc Sports Nutr 14:20, DOI 10.1186/s12970-017-0177-8 (verified), Morton RW et al. (2018), meta-regression of protein supplementation, Br J Sports Med 52(6):376-384, DOI 10.1136/bjsports-2017-097608 (verified), Protein targets with denominators kept strictly separate (BW vs FFM) — ADOPTED, 0.8 g/kg RDA protein floor — REJECTED

### Community 31 - "Export View"
Cohesion: 0.67
Nodes (3): DEPLOY.md claim: Export is nav item 6 / hotkey 6, Export view CSS block, EXPORT view

### Community 32 - "Deployment Paths"
Cohesion: 0.67
Nodes (3): GitHub Pages Browser-Only Deployment Path, Netlify Drag-and-Drop Deployment Path, Live deployment: GitHub Pages

### Community 33 - "Platform Choice Decision"
Cohesion: 1.00
Nodes (3): Capacitor native wrapper, Expo / React Native rewrite, Platform: stay a web PWA, replace the toolchain

### Community 34 - "Caloric Surplus Citations"
Cohesion: 0.67
Nodes (3): Garthe I, Raastad T, Sundgot-Borgen J (2011), Appl Physiol Nutr Metab 36(4):547-554, DOI 10.1139/h11-051 (verified), Muscle-gain surplus ~350-500 kcal/day — weakly evidenced, stated as such, Slater GJ et al. (2019), Is an Energy Surplus Required to Maximize Skeletal Muscle Hypertrophy, Front Nutr 6:131, DOI 10.3389/fnut.2019.00131 (verified)

### Community 35 - "Train View and Rest Timer"
Cohesion: 0.67
Nodes (3): TRAIN view CSS block, Rest timer (vibrate + Web Audio beep), TRAIN view

### Community 36 - "Tone Requirement"
Cohesion: 0.67
Nodes (3): Clinical / scientific / honest tone requirement, 'Greek statue' tone framing (rejected), Tone rule (Working With This Codebase)

### Community 37 - "Energy Requirement Citations"
Cohesion: 0.67
Nodes (3): Black et al. 1996 (Doubly-Labelled-Water PAL Limits, Eur J Clin Nutr), FAO/WHO/UNU 2004 (Human Energy Requirements Report), NASEM 2023 (Dietary Reference Intakes for Energy)

### Community 38 - "Training-to-Failure Citations"
Cohesion: 0.67
Nodes (3): Grgic 2022 (Failure vs. Non-Failure Training Meta-Analysis, JSHS), Refalo 2023 (Proximity-to-Failure Hypertrophy Meta-Analysis, Sports Med), Refalo 2025 (Proximity-to-Failure Perceptual Responses)

### Community 39 - "Equipment Increment Rules"
Cohesion: 0.67
Nodes (3): IPF Technical Rulebook 2026, IWF Technical Competition and Rules Regulations 2020, Rogue Fitness Plate/Dumbbell Increment Specs

## Ambiguous Edges - Review These
- `DEPLOY.md claim: console.html is the app, index.html is a dev-only design canvas` → `PROJECT_SUMMARY.md claim: index.html is the entry point`  [AMBIGUOUS]
  DEPLOY.md · relation: conceptually_related_to
- `DEPLOY.md claim: console.html is the app, index.html is a dev-only design canvas` → `index.html app shell (CSS + script-tag entry point)`  [AMBIGUOUS]
  index.html · relation: conceptually_related_to
- `DEPLOY.md claim: Export is nav item 6 / hotkey 6` → `EXPORT view`  [AMBIGUOUS]
  DEPLOY.md · relation: conceptually_related_to
- `DEPLOY.md deploy file list (internally inconsistent count)` → `Known deployment gotchas`  [AMBIGUOUS]
  DEPLOY.md · relation: conceptually_related_to
- `Specimen card drop mechanic (Atlas)` → `Deliberately not built (accounts, food DB, wearables, music, RPG mechanics)`  [AMBIGUOUS]
  PROJECT_SUMMARY.md · relation: conceptually_related_to
- `:root CSS custom properties (phosphor design tokens)` → `theme-color meta tag (#00ff88)`  [AMBIGUOUS]
  index.html · relation: conceptually_related_to
- `Trexler & Smith-Ryan 2015 (Creatine+Caffeine Review)` → `Trexler 2016 (Creatine/Caffeine No-Interaction Trial)`  [AMBIGUOUS]
  REFERENCES.md · relation: conceptually_related_to
- `Suprak 2011 (Push-Up Variant Body-Mass Support, JSC)` → `Ebben 2011 (Kinetic Analysis of Push-Up Variations)`  [AMBIGUOUS]
  REFERENCES.md · relation: conceptually_related_to
- `Thomas Topham (Historical Strongman)` → `Webster 1976, The Iron Game`  [AMBIGUOUS]
  REFERENCES.md · relation: conceptually_related_to

## Knowledge Gaps
- **345 isolated node(s):** `TWEAK_DEFAULTS`, `DC`, `DCCtx`, `name`, `short_name` (+340 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **48 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `DEPLOY.md claim: console.html is the app, index.html is a dev-only design canvas` and `PROJECT_SUMMARY.md claim: index.html is the entry point`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `DEPLOY.md claim: console.html is the app, index.html is a dev-only design canvas` and `index.html app shell (CSS + script-tag entry point)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `DEPLOY.md claim: Export is nav item 6 / hotkey 6` and `EXPORT view`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `DEPLOY.md deploy file list (internally inconsistent count)` and `Known deployment gotchas`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Specimen card drop mechanic (Atlas)` and `Deliberately not built (accounts, food DB, wearables, music, RPG mechanics)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `:root CSS custom properties (phosphor design tokens)` and `theme-color meta tag (#00ff88)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Trexler & Smith-Ryan 2015 (Creatine+Caffeine Review)` and `Trexler 2016 (Creatine/Caffeine No-Interaction Trial)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._