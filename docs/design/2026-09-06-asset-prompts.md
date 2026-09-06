# Asset generation prompts

Ready to paste into `agy` one at a time, per the `image-generation` skill's convention:

```sh
agy -p "Generate an image. <prompt>. Save it as <name>.png"
```

Every prompt already demands "no text" and bans the skill's forbidden keywords
(photorealistic/8K/masterpiece/highly detailed/trending on artstation). None asks for
translucency. See `docs/design/2026-09-06-asset-manifest.md` §0.2 for why these are generated as a
**clean raster reference, then hand-vectorized to SVG** rather than shipped as the raster itself —
every prompt below is written to produce the cleanest possible source for that trace: pure black
shape (or pure black line), pure white ground, no anti-aliasing artefacts to fight, no colour to
discard.

After each generation: locate the file per the skill's "never trust agy's report of where it wrote
the file" section, copy it into `agy-artifacts/icons/`, open it to confirm it is a real image
before vectorizing.

---

## Batch A — Gym Comfort and Equipment Access pictograms (8)

Shared register: `docs/design/2026-09-04-icon-register.csv` rows `comfort-1-starting` through
`equip-5-full-gym`. One consistent pictogram language across all eight so the two sliders read as
a matched family.

### comfort-1-starting

A single generic human figure, gender-neutral, caught mid-stretch: bent forward at the hips,
reaching toward the floor in a calm standing toe-touch, weight settled and unhurried, not straining.
No background scenery at all — the figure sits alone on a flat white ground, the way a sign
pictogram would. Full figure, strict side profile, centered in the frame with even margins on
every side. Render it as a flat solid black silhouette: no internal linework, no gradient, no
shading, no cast shadow, hard clean edges, reduced to the fewest shapes that still read as
"stretching" — the register of an international pictogram sign, not a cartoon and not a photo.
Absolutely no text, no labels, no lettering of any kind.

### comfort-2-machines

A single-stack selectorized gym weight machine — a seated cable machine with a vertical weight
stack at the rear — shown with no person riding it, alone on a flat white ground with no gym
scenery around it. Strict side elevation view, centered, filling most of the frame, drawn simply
enough that the weight stack, the seat and the cable arm are each one clean readable shape rather
than a mechanically accurate rendering. Flat solid black silhouette: no gradient, no shading, no
internal texture, hard clean edges, pictogram register. Absolutely no text, no labels, no lettering
of any kind.

### comfort-3-freeweights

A single generic human figure holding a barbell locked out overhead: standing at the top of a
standing overhead press, arms fully extended straight up, the bar held level above the head, one
clean bar with two plate discs rather than a textured weight stack. No background scenery, the
figure alone on a flat white ground. Full figure and bar both inside the frame, strict side
profile, centered with even margins. Flat solid black silhouette: no gradient, no shading, no
internal linework, hard clean edges, pictogram register. Absolutely no text, no labels, no
lettering of any kind.

### equip-1-bodyweight

A single exercise mat lying flat with one end rolled up into a cylinder, no person and no other
object in frame, alone on a flat white ground. Whichever angle — three-quarter or straight-down —
makes the rolled end and the flat end both read clearly as one continuous mat; centered, filling
most of the frame. Flat solid black silhouette: hard clean edges, no gradient, no shading, no
texture, pictogram register. Absolutely no text, no labels, no lettering of any kind.

### equip-2-home-bodyweight

One hex-head dumbbell and one skipping rope coiled into a simple loop, resting side by side on a
flat white ground, close enough together to read as one grouped icon, no person, no other objects.
Centered, both items fully inside the frame with even margins. Flat solid black silhouette: hard
clean edges, no gradient, no shading, the rope drawn as a simple closed loop rather than a
tangled line. Absolutely no text, no labels, no lettering of any kind.

### equip-3-home

Two hex-head dumbbells resting on a small two-tier home dumbbell rack, no person, alone on a flat
white ground. Side view, centered, the rack and both dumbbells fully inside the frame. Flat solid
black silhouette: hard clean edges, no gradient, no shading, no texture, pictogram register.
Absolutely no text, no labels, no lettering of any kind.

### equip-4-full-home

A squat/power rack — two uprights with a barbell resting across the J-hooks, unloaded — beside one
hex-head dumbbell standing on the floor next to it, no person, alone on a flat white ground. Side
view, rack on one side and dumbbell on the other, both fully inside the frame, composed as one
grouped icon rather than two unrelated objects. Flat solid black silhouette: hard clean edges, no
gradient, no shading. Absolutely no text, no labels, no lettering of any kind.

### equip-5-full-gym

A squat rack with a barbell loaded with several weight plates per side, racked in the J-hooks, no
person, alone on a flat white ground. Side view, centered, the rack and loaded bar filling most of
the frame. Flat solid black silhouette: hard clean edges, no gradient, no shading, the plates drawn
as simple stacked discs rather than individually textured. Absolutely no text, no labels, no
lettering of any kind.

---

## Batch B — Tape-measurement site diagrams (4)

Register rows `tape-neck`, `tape-abdomen-male`, `tape-abdomen-female`, `tape-hip`. A different
register from batch A on purpose: these are instructional diagrams for a self-measurement, not
pictogram icons, so they render as **line drawings, not filled silhouettes** — a filled shape
cannot show a tape band wrapping around a body the way an outline can.

### tape-neck

A generic human head and neck shown in side profile as a simple outline only — no facial features
at all (no eyes, no mouth, no nose detail), just enough of the head, neck and top-of-shoulder shape
to locate the neck in space. A flat measuring tape, drawn as a simple band with its two ends
slightly overlapping, wrapped horizontally around the neck just below the larynx. No background,
isolated on plain white. Cropped from mid-head down to the top of the shoulders, right-facing
profile, the tape band the clear focal element of the drawing. Render as a black line drawing
only, one uniform thin stroke weight throughout, no fill, no shading, no cross-hatching, no colour
— the register of a diagram in an instruction manual. Absolutely no text, no labels, no lettering
of any kind.

### tape-abdomen-male

A generic torso shown as a simple outline only, front view, cropped from mid-chest down to the
hips, no head, no facial features, no muscle definition drawn in — just the outer body contour. A
flat measuring tape, a simple band with its two ends slightly overlapping, wrapped horizontally
around the torso at navel height. No background, isolated on plain white. Front view, centered,
torso filling most of the frame, the tape band the clear focal element. Render as a black line
drawing only, one uniform thin stroke weight, no fill, no shading, no colour, instruction-manual
diagram register. Absolutely no text, no labels, no lettering of any kind.

### tape-abdomen-female

A generic torso shown as a simple outline only, front view, cropped from mid-chest down to the
hips, no head, no facial features, no muscle definition — just the outer body contour with a
female-typical waist-to-hip proportion. A flat measuring tape, a simple band with its two ends
slightly overlapping, wrapped horizontally around the torso at its narrowest point, just above the
navel. No background, isolated on plain white. Front view, centered, torso filling most of the
frame, the tape band the clear focal element. Render as a black line drawing only, one uniform thin
stroke weight, no fill, no shading, no colour, instruction-manual diagram register. Absolutely no
text, no labels, no lettering of any kind.

### tape-hip

A generic torso and hip region shown as a simple outline only, side profile, cropped from the waist
down to mid-thigh, no head, no facial features. A flat measuring tape, a simple band with its two
ends slightly overlapping, wrapped horizontally around the hips at the point of greatest
protrusion. No background, isolated on plain white. Side profile, centered, the hip region filling
most of the frame, the tape band the clear focal element. Render as a black line drawing only, one
uniform thin stroke weight, no fill, no shading, no colour, instruction-manual diagram register.
Absolutely no text, no labels, no lettering of any kind.

---

## Batch C — Male body-fat visual-estimate silhouettes (6)

Register rows `bf-male-10` through `bf-male-35`. **Do not generate the female row yet** — see
manifest §0.1: the register's female percentages (15-40) do not match what
`src/content/bodyFatChart.ts` currently renders (10-35 for both sexes), and generating against the
wrong range wastes the generation. Resolve that code question first.

**Shared framing across all six**, so they read as one matched row rather than six unrelated
images: a generic adult male silhouette, front-facing, standing straight, legs together, arms held
slightly away from the sides so the waistline is unobstructed and reads clearly. Identical pose,
identical camera framing and scale in every one of the six, so only the body outline's proportions
change between them. No background, isolated on plain white, full body from head to feet, centered.
Render as a flat solid black silhouette with no internal linework of any kind — no muscle
striation, no skin texture, no navel, no facial features, no hair detail — and no shading, no
gradient. This is a deliberate low-fidelity, generic register, not an anatomical illustration: the
chart it belongs to is a rough visual comparison, not a measuring instrument, and a more detailed
render would look more precise than the estimate it supports. Absolutely no text, no labels, no
lettering, no percentage numerals baked into the image.

Per-image proportion, changing only the waist-to-shoulder relationship, nothing else about the pose
or framing:

- **bf-male-10**: leanest of the six — a visibly narrower waist than shoulders, the torso's
  silhouette tapering inward at the midsection.
- **bf-male-15**: slightly less taper than bf-male-10 — still narrower at the waist than the
  shoulders, but softer, less pronounced.
- **bf-male-20**: waist roughly level with the hips — an average build, the taper mostly gone.
- **bf-male-25**: a fuller midsection — the waist now reads as the widest point of the torso,
  slightly rounder than the chest above it.
- **bf-male-30**: a broader waist still — clearly the widest point of the whole silhouette, rounder
  than bf-male-25.
- **bf-male-35**: the largest waist in the set — the midsection dominates the silhouette, widest
  and roundest of the six.

---

## Batch D — App icon, PROPOSED direction only (needs the owner's sign-off — manifest §2)

**Do not generate this until the owner has picked a direction (manifest §2, option 1 vs option 2)
or approved this one specifically.** Included so there is something concrete to react to rather
than an open-ended question. This is direction 1 (mascot-derived mark); direction 2 (a fully
abstract mark, no character) has no draft prompt yet because it has no starting concept to draw
from — that would need the owner's own idea of the shape first.

### app-icon-concept-1 (mascot-derived, proposed)

An original stick-figure-style mascot character — no resemblance to any named or copyrighted
character — reduced to a single bold mark: a simple figure with a rounded head and thick limbs,
caught at the top of an overhead barbell press, arms fully extended straight up holding a bar drawn
as one thick horizontal line with two round plates. One knee very slightly bent for a sense of
effort rather than a static stance. The figure sits on a plain flat single-colour ground with no
scenery, no horizon, no props besides the bar, and stays within the inner 80 percent of the canvas
so an OS icon mask can crop the outer edge without cutting into the figure. Centered on a square
1:1 canvas with generous even padding, the whole mark large and bold enough to still read as one
recognizable shape when shrunk to 48 pixels. Render it as a flat, thick-lined mark in two colours
only — a dark figure on a single bright flat background colour, no gradient, no drop shadow, no
photorealism, no fine detail — the reduced geometric register of an app icon or a sports crest, not
an illustration. Absolutely no text, no labels, no lettering of any kind, no additional characters
or props in the scene.

Two colour options to react to, both already the app's own (no new palette to invent): the
limelight skin's own pair, a black figure on the lime ground (`#8ace00` background, `#000000`
figure); or the mascot's original palette from `docs/design/round3/2026-09-01-round3-plan.md` §5
(`#000000`, `#FCA3BE`, `#BB5F7B`, `#6D6D6D`, `#242424`) — e.g. a dark-grey figure on the `#FCA3BE`
ground. State which in the prompt before running it.
