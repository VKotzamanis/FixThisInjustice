# Asset spec, 2026-10-18 (supersedes sizes/colours in 2026-09-06-asset-prompts.md)

Agent-facing. Owner asked: generate the missing art with Codex + ChatGPT image generation; body-fat first.
Prompts below are complete; paste per image. Older prompt file stays as background for intent.

## What changed since 2026-09-06
- Female body-fat row is 20/25/30/35/40/45 % (code, ROADMAP B4, Gallagher 2000). `bf-female-15` dropped, `bf-female-45` added.
- One skin (limelight). App icon ground = `#8ace00` (`--lime`, now `theme_color`), figure `#000000`. Old ruling `#a3e635` is void.
- Generator: Codex `image_generation` (ChatGPT image model), not agy.

## Pipeline (every pictogram/silhouette)
1. Generate raster: pure black (#000000) shapes on pure white (#FFFFFF), no grey, no shadow, no text. Square 1024x1024 unless stated; body-fat as one 6-figure sheet per sex, 1536x1024.
2. Copy original into `agy-artifacts/gen-2026-10-18/<id>-raw.png` (kept for provenance).
3. Threshold to 1-bit (`magick in.png -colorspace gray -threshold 50% out.pbm`), slice if a sheet, trace: `potrace -s --flat -t 8 -a 1 -O 0.4 out.pbm -o <id>.svg`.
4. Normalise SVG: one `<path fill="currentColor">`, tight `viewBox` per the batch, no width/height attrs, no `<metadata>`, under 6 KB each.
5. Check at real size on lime and on black: renders at listed CSS px, reads at a glance, no specks (despeckle `-t`), no holes unless intended.
6. Final files: `src/assets/art/<id>.svg` (imported as raw string, inlined so `currentColor` works; CSP-safe, no network).

## Batch BF — body-fat silhouettes (12) — PRIORITY
- Render slot: `.wiz-chart-frame .wiz-placeholder-frame` 44x76 CSS px (`src/ui/setup/setup.css:905`), six per row on a phone. Final `viewBox="0 0 44 76"`; figure height 72 units, feet on y=74, centred.
- Rows: male `bf-male-10,15,20,25,30,35`; female `bf-female-20,25,30,35,40,45`.
- Generate ONE sheet per sex so pose, scale and proportions stay consistent; slice into 6 equal columns.
- Labels are a design choice tied to Gallagher 2000 bands (`src/content/bodyFatChart.ts`); the picture is "rough orientation, not a measurement" (`BODY_FAT_CHART_INTRO`). Do not add anatomical detail that implies precision.

### Prompt BF-M (1536x1024)
A clean reference sheet of six full-body front-view silhouettes of the same generic adult man, standing in a row left to right, evenly spaced, each in its own equal-width column with clear white space between figures. Identical pose in all six: standing straight, facing forward, feet a little apart, arms hanging slightly away from the body so the waist outline is clearly visible, head level. Identical height and scale in all six: every head top on the same line, every pair of feet on the same baseline. Only the body shape changes from left to right, showing increasing body fat: 1) very lean, broad shoulders, narrow waist, clear V-taper; 2) lean athletic, slight taper; 3) average, waist about as wide as the hips, taper gone; 4) soft, waist slightly wider than hips, belly beginning to round outward, fuller chest and upper arms; 5) heavy, belly clearly rounded and the widest part of the torso, thicker arms and thighs, fuller face outline; 6) very heavy, large round belly dominating the torso, thick limbs, wide neck. Fat gains go mostly to the belly and waist, typical of men. Flat solid pure black silhouettes on a pure white background: no outlines inside the shapes, no muscles, no navel, no face, no hair detail, no clothing, no shading, no gradient, no ground shadow, no floor line. Simple, generic, modest, non-sexualised, like a medical-chart pictogram. No text, no numbers, no labels anywhere.

### Prompt BF-F (1536x1024)
A clean reference sheet of six full-body front-view silhouettes of the same generic adult woman, standing in a row left to right, evenly spaced, each in its own equal-width column with clear white space between figures. Identical pose in all six: standing straight, facing forward, feet a little apart, arms hanging slightly away from the body so the waist and hip outline is clearly visible, head level, hair drawn as a simple short rounded shape close to the head. Identical height and scale in all six: every head top on the same line, every pair of feet on the same baseline. Only the body shape changes from left to right, showing increasing body fat: 1) lean athletic, defined narrow waist, slim hips and thighs; 2) fit, clear waist, slightly fuller hips; 3) average, soft waist curve, fuller hips and thighs; 4) fuller, shallow waist curve, rounder hips, thighs and upper arms; 5) heavy, waist almost as wide as the hips, rounded belly, thick thighs and arms; 6) very heavy, little to no waist curve, wide rounded belly and hips, thick limbs. Fat gains go to hips and thighs first, then the belly, typical of women. Flat solid pure black silhouettes on a pure white background: no outlines inside the shapes, no muscles, no navel, no face, no clothing details, no shading, no gradient, no ground shadow, no floor line. Simple, generic, modest, non-sexualised, like a medical-chart pictogram. No text, no numbers, no labels anywhere.

## Batch A — slider pictograms (8)
- Slots: `.wiz-placeholder-frame` 64x64 CSS px and slider tick `.wiz-slider-tick-icon` 20x20 (`setup.css:466,724`). Final `viewBox="0 0 64 64"`, subject inside 4..60. Must read at 20 px: no part thinner than ~3 units at 64.
- Ids: `comfort-1-starting`, `comfort-2-machines`, `comfort-3-freeweights`, `equip-1-bodyweight`, `equip-2-home-bodyweight`, `equip-3-home`, `equip-4-full-home`, `equip-5-full-gym`.
- Prompt template (1024x1024): "A single bold pictogram icon of <SUBJECT>, centred on a square canvas with generous even margins, filling about 80 percent of it. Flat solid pure black shape on a pure white background, thick chunky forms, hard clean edges, no thin lines, no internal detail, no gradient, no shadow, no floor line, in the style of an international public-information sign that stays readable at 20 pixels. No text, no numbers, no letters."
- SUBJECT per id: comfort-1 "a generic person in side view bending forward in a calm toe-touch stretch"; comfort-2 "a seated cable weight machine in side view with a vertical weight stack, a seat and a cable arm, no person"; comfort-3 "a generic person in side view holding a barbell with two round plates locked out straight overhead"; equip-1 "an exercise mat lying flat with one end rolled into a cylinder, three-quarter view"; equip-2 "one hexagonal dumbbell beside a skipping rope coiled into a simple loop"; equip-3 "two hexagonal dumbbells resting on a small two-tier rack, side view"; equip-4 "a squat rack with an empty barbell on its hooks and one hexagonal dumbbell standing beside it, side view"; equip-5 "a squat rack with a barbell loaded with three thick plates on each side, side view".

## Batch T — tape-site diagrams (4)
- Slot: `.wiz-site` 64x64 frame. Final `viewBox="0 0 64 64"`. Line art, so trace keeps strokes as thin filled shapes; stroke ~2.5 units at 64.
- Ids: `tape-neck`, `tape-abdomen-male`, `tape-abdomen-female`, `tape-hip`.
- Prompt template (1024x1024): "A simple instruction-manual diagram: <SUBJECT>. Bold black outline drawing only, one uniform thick stroke weight, no fill, no shading, no facial features, no anatomy detail, on a pure white background, centred with even margins. The measuring tape is drawn as a solid black horizontal band, clearly thicker than the body outline, with its two ends slightly overlapping. No text, no numbers, no ruler markings, no letters."
- SUBJECT: neck "a generic head and neck in right-facing side profile, cropped from mid-head to the top of the shoulders, a measuring tape wrapped horizontally around the neck just below the Adam's apple"; abdomen-male "a generic male torso front view cropped from mid-chest to hips, a measuring tape wrapped horizontally around the belly at navel height"; abdomen-female "a generic female torso front view cropped from mid-chest to hips, a measuring tape wrapped horizontally around the narrowest part of the waist, just above the navel"; hip "a generic lower torso and hips in side profile cropped from waist to mid-thigh, a measuring tape wrapped horizontally around the hips at the most protruding point of the buttocks".

## Batch I — app icon + notification badge
- Files: `public/icons/icon-512.png` (512, purpose any), `icon-192.png`, `icon-maskable-512.png` (all content inside the central 80 % circle), `apple-touch-icon-180.png` (new; `index.html` currently reuses 192), `notification-badge-96.png` (white/alpha silhouette on transparent, `src/sw.ts:75`).
- Generate 1024x1024; downscale with Lanczos. Maskable = same art scaled to 80 % on full `#8ace00` square.
- Prompt (1024x1024): "A bold flat app icon on a solid flat lime green background, exact colour #8ACE00 filling the whole square. In the centre, a chunky original cartoon stick-figure character with a round head and thick limbs pressing a barbell straight overhead at full lockout, one thick bar with a round plate at each end, knees slightly bent for effort. The figure and barbell are solid flat black #000000, thick rounded strokes, kept inside the central 70 percent of the canvas. Exactly two colours, no gradient, no shadow, no outline glow, no texture, no other objects. Must read as one shape at 48 pixels. No text, no letters, no numbers."
- Badge: from the same art, black figure only, converted to white on transparent, 96x96, figure fills ~85 %.

## Batch G — Atlas category glyphs (8), lower priority
- No render slot yet (needs `SpecimenCard` wiring). Final `viewBox="0 0 48 48"`, readable at 24 px.
- Use Batch A template; SUBJECT: anatomy "a front view of a ribcage and pelvis outline, no skull, no limbs"; biology "a cell: an oval with a smaller solid circle offset inside"; biomechanics "a lever: one straight bar, a round pivot at one end, a short arrow pushing at the other"; history "an hourglass"; nutrition "a round plate with a fork laid across it"; recovery "a crescent moon"; supplements "a two-part capsule pill drawn as one shape with a gap across its middle"; training "a single hexagonal dumbbell, side view".

## Not generated (owner-owned)
- `reset-cookies-icon`: owner said he supplies it (register r2.19).
- `sprite-subsection-marker`: owner's own pixel sprite layers exist in `agy-artifacts/SpriteAI_Vasileios/`; no generation.

## Wiring (after art passes review)
- Replace `ArtworkPlaceholder` frames and chart placeholders with inlined SVG (`currentColor`), keep frame sizes so nothing reflows; tests per asset id.
- `vite.config.ts` manifest icons, `index.html` apple-touch-icon, `src/sw.ts` badge.
- Atlas glyphs: add a category glyph to `SpecimenCard` rendering (`AtlasView.tsx`).
- Mascot wiring ruled yes 2026-09-06 (`mascotLifting` Today hero, `mascotCrown` beside `WeekStamp`), never done: include.
- Measure precache before/after in KiB.
