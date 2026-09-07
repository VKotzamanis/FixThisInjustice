# Guide: animating a hand-drawn sprite with layers and script deformation

How to take a small pixel-art character (or any low-res sprite) and give it simple motion — a
slide, a bob, a reactive jolt, a sway — without hand-drawing every frame and without AI-generating
frames one at a time. Written from the sunglasses-slide-and-jolt animation built for
`agy-artifacts/SpriteAI_Vasileios/`, which is the worked example in section 10. Every technique
and every pitfall below is something that actually happened while building that one animation, not
generic advice.

No pixel-art skill is assumed. Drawing the source layers is the one part that stays manual;
everything after that is a deterministic script.

---

## 1. When this fits, and when it doesn't

**Fits:** a small sprite (icon-scale, 32x32 in the worked example) needs a short, simple reaction
or idle motion — a slide, a bob, a sway, a snap-back — built from parts that already exist in the
art (hair, an accessory, a limb).

**Does not fit:**
- A genuinely new pose or expression that isn't implied by moving existing parts (e.g. a mouth
  shape that was never drawn). That needs new art, drawn by hand, not deformation.
- A full multi-limb cycle (walking, running). That's real skeletal rigging (Spine, DragonBones,
  or a bone system in an engine) — a different tool for a different problem.
- Reaching for AI generation to produce each frame separately. This project tried that pattern
  once already for a 16-icon sheet and rejected it on the record (`docs/design/round3/2026-09-01-round3-plan.md`
  §4.2): separate generations of the same subject drift in colour and proportion, and the seam
  shows. The fix there was one generation sliced into pieces; the fix here is one drawing
  deformed by a script. Same principle: generate or draw the reference once, then transform it
  deterministically — never regenerate per frame.

## 2. The core idea

A moving character is not one image with several versions. It's several **layers**, each a
transparent-background PNG on the *same* canvas, that a script composites per frame with
different offsets or deformations. No new artwork exists per frame — only new arithmetic.

```
frame(t) = base_layer
         + accessory_layer.shift(offset(t))
         + moving_part_layer.deform(params(t))
```

Nothing here needs a game engine or a live shader. The frames are pre-rendered once into a sprite
sheet, the same as if they'd been hand-drawn — the difference is only in how they were produced.

## 3. Preparing source layers

This is the part a script can't do for you, and the one rule that matters most:

**Every layer is the same canvas size, at the same position, transparent everywhere except its
own content.** Not cropped to its own bounding box. If a hair layer is cropped tight to the hair's
own pixels, the offset needed to put it back in the right place relative to the face is lost —
every later step has to guess it back. Full canvas, every layer, always.

Beyond that:

- **Split by what moves independently.** Things that always move together belong in one layer.
  Things that need their own offset, their own reveal, or their own deformation get their own
  file. In the worked example: the head (static), the sunglasses (slides), the hair (sways) are
  three files for exactly that reason.
- **Draw what's actually supposed to be there — don't rely on later invention.** If an accessory
  will slide away and reveal something underneath (eyes under sunglasses, say), draw that
  something on the base layer now, at the position it will be revealed at. The first version of
  this exact animation skipped this and hand-invented two dark pixel dashes for "eyes" that were
  never drawn anywhere — it looked wrong because it *was* wrong: pixels with no source.
- **The static-backing trick, when a layer will be deformed.** If a layer is going to shift or
  warp away from its rest position, bake a *second, static* copy of the same content into the
  layer underneath it. When the moving copy pulls away from register, the gap reveals the static
  copy — not bare canvas, not whatever happens to be further down the stack. This is why the
  worked example's hair exists twice: once baked into the static base (`HairAndFace`), once again
  as its own movable layer (`OnlyHair`) on top. A sway can never expose skin or an accessory this
  way, because there's always hair behind the hair.
- **Export as true RGBA with real alpha, not a near-white fill standing in for empty space.**
  Some export paths fill "nothing here" with an opaque off-white instead of `alpha=0`. Check this
  before trusting a layer (section 4) — it looks identical to transparency in most image viewers
  and is invisible until you composite it on top of something and get a solid block where you
  expected to see through.

## 4. Verify layers before animating anything

Composite the layers in the intended stack order at rest, and diff the result against a reference
image of what the character should look like fully assembled — before writing a single frame of
animation.

```python
import numpy as np
from PIL import Image

def composite(*layers):
    base = Image.new("RGBA", layers[0].size, (0, 0, 0, 0))
    for l in layers:
        base.alpha_composite(l)
    return np.array(base)

made = composite(base_layer, accessory_layer, moving_layer)
ref = np.array(reference_image)

visible = ref[..., 3] > 10          # only compare pixels the reference actually shows
diff = np.any(made[visible] != ref[visible], axis=-1)
print(f"{diff.sum()} differing px of {visible.sum()} visible")
```

**The gotcha that will waste real time: don't compare raw RGB at fully-transparent pixels.** A
`(0,0,0,0)` pixel and a `(9,7,6,0)` pixel render identically — both invisible — but a naive
`np.array_equal` on the whole array flags them as different. This produced two false "reconstruction
failed" alarms while building the worked example, both traced to comparing colour values that
don't matter because nothing is drawn there. Always mask to `alpha > 0` (or, for a hard cutoff,
`alpha >= 40`) before comparing.

A small number of differing pixels (low single digits to low tens, out of several hundred visible)
is normal for hand-drawn layers exported separately — minor shading drift between files, not a
defect. A large or spatially concentrated diff means real misalignment: stop and fix the source
layers rather than trying to code around it.

## 5. Two deformation techniques, and when to use each

### Rigid offset (translate)

Move an entire layer by `(dx, dy)`. Use for: whole-object slides (an accessory sliding down a
face), simple idle bobs (the whole sprite moving up/down to read as breathing).

```python
def offset_frame(layer, dx, dy, canvas_size, pad):
    canvas = Image.new("RGBA", (canvas_size[0] + 2*pad, canvas_size[1] + 2*pad), (0,0,0,0))
    canvas.alpha_composite(layer, (pad + dx, pad + dy))
    return canvas
```

**Gotcha: pick an amplitude large enough to keep adjacent frames distinct.** A sine-wave bob with
amplitude 1px on an 8-frame loop only produces three achievable integer offsets (-1, 0, 1), so
several frames come out pixel-identical. GIF encoders silently merge identical adjacent frames —
the file ends up with fewer frames than requested, at the wrong durations, with no error. This
happened on the very first version of the idle-bob script in this project; the fix was amplitude
2px, which gives five distinct positions across the same 8 frames and no adjacent duplicates.
**Always verify frame count after export** (`PIL.Image.open(path).n_frames`, or iterate with
`ImageSequence.Iterator` and count) — don't assume the count you asked for is the count you got.

### Row-shear (a displacement/mesh warp, simplified)

Shift each row of a layer sideways by an amount that's zero at an anchor point and grows toward a
free end. This is the standard technique for cloth, capes, tails, and hair in 2D animation — the
same principle as mesh-deform or vertex-displacement systems in game engines, just precomputed
into static frames instead of applied live.

```python
def shear_layer(layer, amplitude, anchor_row, max_row, curve=1.3, pad=4):
    w, h = layer.size
    src = np.array(layer)
    canvas = np.zeros((h + 2*pad, w + 2*pad, 4), dtype=np.uint8)
    for y in range(h):
        t = min(max(0.0, (y - anchor_row) / (max_row - anchor_row)), 1.0)
        dx = round(amplitude * (t ** curve))
        canvas[y + pad, pad + dx : pad + dx + w] = src[y]
    return Image.fromarray(canvas, "RGBA")
```

- `anchor_row`: the row where the part is rooted (a hairline, a shoulder) — zero shear here.
- `max_row`: the part's own lowest row — full shear here.
- `curve > 1`: the free end whips proportionally more than a straight linear ramp; `curve = 1` is
  a plain linear ramp if that reads better for a given shape.

Composite the sheared layer **on top of** its own static backing (section 3) so a gap at the edge
of the shear reveals more of the same part, never something else.

## 6. Composing a frame sequence

Frame count matters less than timing. A two-frame idle already reads as alive; six to eight frames
is a comfortable ceiling for a simple reaction before added frames stop paying for themselves —
four well-timed frames beat twelve evenly-timed ones. Spend the budget on **hold durations**, not
frame count: a rest or "look at this" beat wants 400-700ms, a snap or slide wants 80-120ms.

The shape used for a reactive animation (slide → reveal → react → settle) in the worked example:

| Frame | What moves | Typical duration |
| --- | --- | --- |
| Rest | nothing | long hold (400-700ms) |
| Action | the sliding part, partway | short (80-120ms) |
| Hold | the sliding part, fully moved, revealing whatever was underneath | long hold |
| Reaction | a rigid offset on the whole thing plus a deformation on the reacting part | short |
| Settle | the deformation overshoots slightly and starts to relax | short-medium |
| Rest | nothing — identical to frame 1 | long hold |

**Verify the loop closes exactly**, don't eyeball it:

```python
assert np.array_equal(np.asarray(frames[0]), np.asarray(frames[-1]))
```

A sequence that's meant to return to its start and doesn't will re-trigger with a visible pop.

## 7. Output formats

- **Sprite sheet**: a horizontal strip PNG, one fixed frame size, RGBA. This is what a game or a
  web page actually uses — stepped via CSS `background-position` with `steps()`, or blitted frame
  by frame from a `<canvas>`. Always set `image-rendering: pixelated` wherever it renders, or the
  browser will smooth the hard pixel edges.
- **GIF**: for a human to preview the motion before it's wired into anything. Pass a duration
  *list*, one value per frame, not a single shared number. Verify it landed correctly the same way
  as the frame-count check in section 5 — read the file back and print each frame's `duration`
  rather than trusting the value passed to `save()`.
- **Not SVG.** Pixel art's identity is a hard grid at a fixed resolution; SVG paths scale smoothly
  and lose that unless every pixel is hand-drawn as its own `<rect>`, which is a worse PNG with
  extra steps. Frame-based sprite animation is a raster problem in every reference on the subject,
  not a vector one.

## 8. A reusable script skeleton

```python
import numpy as np
from PIL import Image

def load(path):
    return Image.open(path).convert("RGBA")

def build_frame(layers_with_offsets, canvas_size, pad):
    """layers_with_offsets: list of (PIL.Image, dx, dy) composited bottom to top."""
    w, h = canvas_size
    canvas = Image.new("RGBA", (w + 2*pad, h + 2*pad), (0, 0, 0, 0))
    for layer, dx, dy in layers_with_offsets:
        canvas.alpha_composite(layer, (pad + dx, pad + dy))
    return canvas

def export(frames, durations, sheet_path, gif_path):
    fw, fh = frames[0].size
    sheet = Image.new("RGBA", (fw * len(frames), fh), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * fw, 0), f)
    sheet.save(sheet_path, optimize=True)
    frames[0].save(gif_path, save_all=True, append_images=frames[1:],
                    duration=durations, loop=0, disposal=2)
    # verify, don't assume — see sections 5 and 6
    assert np.array_equal(np.asarray(frames[0]), np.asarray(frames[-1])), "loop does not close"
    from PIL import ImageSequence
    got = list(ImageSequence.Iterator(Image.open(gif_path)))
    assert len(got) == len(frames), f"GIF has {len(got)} frames, expected {len(frames)}"
```

Define a `plan = [(dx, dy, shear_amount, duration_ms), ...]` list per animation (see the worked
example's `scripts/make-sunglasses-jolt-spritesheet.py` for the full version with a slide, a hold,
a jolt, and a shear-based hair reaction), and build each frame from it in one line.

## 9. Pitfalls checklist

| Pitfall | What it looks like | Real incident |
| --- | --- | --- |
| Comparing RGB at `alpha=0` pixels | A reconstruction check fails even though the images render identically | Two false "mismatch" alarms while verifying layer partitions in this project |
| Sine amplitude too small for the frame count | GIF has fewer frames than requested, wrong durations, no error | Idle-bob script, 1px amplitude on 8 frames, silently merged to 4 |
| Colour-based segmentation of one flattened image | A "cut here" boundary that doesn't exist gets guessed, and the guess is visibly wrong | The first sunglasses-slide attempt recoloured part of the hairstyle to skin because hair and glasses share identical colours |
| Inventing content with no source | Looks arbitrary because it is | Hand-drawn eye dashes with no underlying art, in the same first attempt |
| Regenerating each frame with AI | Visible drift in colour/proportion between frames | Rejected on the record for the icon sheet in round 3; the reason this whole layer approach exists |
| Trusting `duration=` or a frame count without reading the file back | A parameter silently doesn't do what was asked | Both gotchas above were only caught by reading the exported file back, not by the code that wrote it |

## 10. Worked example

`scripts/make-sunglasses-jolt-spritesheet.py`, reading layers from and writing output to
`agy-artifacts/SpriteAI_Vasileios/`, builds a 6-frame reaction — sunglasses slide down
revealing hand-drawn eyes, hold, a head-jolt with a row-sheared hair reaction, settle, return to
start — from three owner-drawn layers: `HairandFace_32x32px.png` (static base, includes the real
eyes), `Sunglasses_32x32px.png` (the sliding accessory), `OnlyHair_32x32px.png` (the row-sheared
overlay, backed by the hair already baked into the base per section 3's static-backing trick).
Every check in sections 4-6 runs inside that script and prints its result before the sheet or GIF
is written.
