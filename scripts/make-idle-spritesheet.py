# Builds an idle-animation sprite sheet from a SINGLE source frame, procedurally, so a one-off
# character sprite (e.g. one 32x32 PNG) gets a simple "alive" loop without hand-drawing extra
# frames or risking the frame-to-frame drift that separate AI generations of the same character
# produce (see docs/design/round3/2026-09-01-round3-plan.md 4.2: "one sheet, not sixteen prompts",
# rejected mixing generations for exactly this reason).
#
# Technique: a vertical bob (sine-wave offset of the whole sprite, amplitude in px) across N
# frames, looping cleanly back to frame 0 — "the easiest and most common strategy for idle
# animations" per general pixel-art practice (moving the character up/down a pixel or two reads
# as breathing at animation speed). No AI generation, no manual redraw, fully deterministic.

import argparse, math, os
from PIL import Image


def build_bob_frames(src: Image.Image, n_frames: int, amplitude_px: int):
    """Returns a list of RGBA frames, each the source sprite offset vertically by
    round(amplitude_px * sin(2*pi*i/n_frames)), on a canvas padded by amplitude_px on
    top and bottom so the bob never clips."""
    w, h = src.size
    pad = amplitude_px
    frame_w, frame_h = w, h + 2 * pad
    frames = []
    for i in range(n_frames):
        offset = round(amplitude_px * math.sin(2 * math.pi * i / n_frames))
        canvas = Image.new('RGBA', (frame_w, frame_h), (0, 0, 0, 0))
        canvas.paste(src, (0, pad - offset), src)
        frames.append(canvas)
    return frames


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('src', help='source sprite PNG (single frame)')
    ap.add_argument('--frames', type=int, default=8, help='frame count (default 8)')
    ap.add_argument('--amplitude', type=int, default=1, help='bob amplitude in px (default 1)')
    ap.add_argument('--frame-ms', type=int, default=120, help='ms per frame in the GIF preview')
    ap.add_argument('--out-dir', default=None, help='output directory (default: alongside src)')
    args = ap.parse_args()

    src = Image.open(args.src).convert('RGBA')
    frames = build_bob_frames(src, args.frames, args.amplitude)
    frame_w, frame_h = frames[0].size

    out_dir = args.out_dir or os.path.dirname(os.path.abspath(args.src))
    base = os.path.splitext(os.path.basename(args.src))[0]
    base = base.replace(' ', '-').replace('(', '').replace(')', '')

    sheet = Image.new('RGBA', (frame_w * len(frames), frame_h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * frame_w, 0), f)
    sheet_path = os.path.join(out_dir, f'{base}-idle-sheet.png')
    sheet.save(sheet_path, optimize=True)

    gif_path = os.path.join(out_dir, f'{base}-idle-preview.gif')
    gif_frames = [f.convert('RGBA') for f in frames]
    gif_frames[0].save(
        gif_path, save_all=True, append_images=gif_frames[1:],
        duration=args.frame_ms, loop=0, disposal=2, transparency=0,
    )

    print(f'frames        {len(frames)}')
    print(f'frame size    {frame_w}x{frame_h} (source was {src.size[0]}x{src.size[1]}, '
          f'padded {args.amplitude}px top+bottom for the bob)')
    print(f'sheet         {sheet_path}  ({sheet.size[0]}x{sheet.size[1]}, '
          f'{os.path.getsize(sheet_path)} B)')
    print(f'gif preview   {gif_path}  ({os.path.getsize(gif_path)} B)')


if __name__ == '__main__':
    main()
