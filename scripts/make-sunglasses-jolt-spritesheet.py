# Builds the "sunglasses slide, bored eyes, head-jolt reset" animation from THREE real layer
# PNGs the owner drew by hand, composited bottom to top as: HairAndFace, Sunglasses, OnlyHair.
#
# This replaces an earlier version of this script that hand-authored the eyes and hand-picked a
# glasses bounding box from ONE flattened source image (that source has since been moved to
# Trash). Every pixel here is real — drawn by the owner, not invented — because the three layers
# make every part of the character a separate, independently movable object.
#
# Layer order matters and is deliberate, not arbitrary: hair is baked into BOTH the static
# HairAndFace base AND the movable OnlyHair overlay on top. When OnlyHair is sheared (see
# shear_hair below) and pulls away from its rest position, the gap it leaves reveals the STILL
# hair drawn into HairAndFace underneath — never bare skin or the sunglasses. If the base were
# the hairless Only_face.png instead, a sway could reveal skin through the gap.
#
# The hair "movement" is a row-shear deformation — a displacement/mesh warp, the standard
# technique for cloth/cape/hair sway in 2D animation (Godot's mesh-deform system and shader-based
# vertex displacement both work this way) — not new hand-drawn frames. Each row is shifted
# sideways by an amount that is zero at the scalp (hair stays anchored to the head) and grows
# toward the strand tips (the ends sway the most).

import numpy as np
from PIL import Image

DIR = "agy-artifacts/SpriteAI_Vasileios"
HAIRFACE = f"{DIR}/HairandFace_32x32px.png"
GLASSES = f"{DIR}/Sunglasses_32x32px.png"
HAIR = f"{DIR}/OnlyHair_32x32px.png"
REFERENCE = f"{DIR}/Character_Combined_32x32px.png"  # for the rest-frame sanity check only

ANCHOR_ROW = 8    # hair above this (the crown) does not shear at all
MAX_ROW = 27      # hair's own lowest row (its bbox), where shear is strongest
SHEAR_CURVE = 1.3  # >1 makes the tips whip proportionally more than a straight ramp


def load(path):
    return Image.open(path).convert("RGBA")


def shear_hair(hair: Image.Image, amplitude: float, pad: int):
    """Row-shear the hair layer: each row y shifts horizontally by
    amplitude * ((y - ANCHOR_ROW) / (MAX_ROW - ANCHOR_ROW)) ** SHEAR_CURVE, clamped to 0 above
    the anchor row. Returns a new image on a canvas padded by `pad` on every side."""
    w, h = hair.size
    src = np.array(hair)
    canvas = np.zeros((h + 2 * pad, w + 2 * pad, 4), dtype=np.uint8)
    for y in range(h):
        t = max(0.0, (y - ANCHOR_ROW) / (MAX_ROW - ANCHOR_ROW))
        t = min(t, 1.0)
        dx = round(amplitude * (t ** SHEAR_CURVE))
        canvas[y + pad, pad + dx: pad + dx + w] = src[y]
    return Image.fromarray(canvas, "RGBA")


def main():
    hairface = load(HAIRFACE)
    glasses = load(GLASSES)
    hair = load(HAIR)
    reference = load(REFERENCE)
    w, h = hairface.size

    pad = 4  # room for the head-bob (2px) plus the hair shear (up to ~3px) plus its own margin

    def frame(whole_dy=0, glasses_extra=0, hair_shear=0.0):
        canvas = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
        canvas.alpha_composite(hairface, (pad, pad + whole_dy))
        canvas.alpha_composite(glasses, (pad, pad + whole_dy + glasses_extra))
        sheared_hair = shear_hair(hair, hair_shear, pad)
        canvas.alpha_composite(sheared_hair, (0, whole_dy))
        return canvas

    # Rest-frame sanity check: hairface+glasses+hair at zero offset/shear must closely match the
    # owner's own combined reference (checked against real pixels, not assumed).
    rest = frame()
    rest_cropped = rest.crop((pad, pad, pad + w, pad + h))
    ref_a, made_a = np.array(reference), np.array(rest_cropped)
    vis = ref_a[..., 3] > 10
    diff = np.any(made_a[vis] != ref_a[vis], axis=-1)
    print(f"REST CHECK vs Character_Combined: {diff.sum()} differing px of {vis.sum()} visible "
          f"(expected: small, matches the {10}-px drift measured during the asset review)")

    # (whole_dy, glasses_extra, hair_shear, duration_ms)
    plan = [
        (0, 0, 0.0, 500),   # F0 rest
        (0, 2, 0.0, 90),    # F1 glasses sliding down
        (0, 4, 0.0, 500),   # F2 hold: fully down, the owner's real eyes revealed
        (2, 0, -3.0, 90),   # F3 jolt: head dips, glasses reset, hair shears one way (lagging)
        (0, 0, 1.5, 120),   # F4 hair overshoots the other way catching up
        (0, 0, 0.0, 700),   # F5 = F0 exactly
    ]
    frames = [frame(wd, ge, hs) for wd, ge, hs, _ in plan]
    durations = [d for *_, d in plan]

    identical = np.array_equal(np.asarray(frames[0]), np.asarray(frames[-1]))
    print("F0 == F_last:", identical)

    fw, fh = frames[0].size
    sheet = Image.new("RGBA", (fw * len(frames), fh), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * fw, 0), f)
    sheet_path = f"{DIR}/sunglasses-jolt-sheet.png"
    sheet.save(sheet_path, optimize=True)
    frames[0].save(f"{DIR}/sunglasses-jolt-preview.gif", save_all=True,
                    append_images=frames[1:], duration=durations, loop=0, disposal=2)

    print(f"frames  {len(frames)}  size {fw}x{fh}")
    print(f"sheet   {sheet_path}")


if __name__ == "__main__":
    main()
