# Recovered 2026-09-06 from the round-3 subagent transcript (agent-a1583ab60ee8fc851, task
# "Round 3 combined brat-stan skin with plan") — it ran once from a /tmp scratchpad on 2026-09-01,
# produced the four committed agy-artifacts/mascot-*-256.png files, and was never saved as a file
# until now. Described in prose in docs/design/round3/2026-09-01-round3-plan.md sections 4.2/5.1.
# Re-running it against the same *-raw.jpg inputs reproduces the committed PNGs byte-for-byte.

from PIL import Image
import numpy as np, os, sys
from scipy import ndimage

PAL = np.array([
    [0x00,0x00,0x00],[0x24,0x24,0x24],[0x6D,0x6D,0x6D],[0xC9,0xC9,0xC9],
    [0xFC,0xA3,0xBE],[0xBB,0x5F,0x7B],[0xFF,0xFF,0xFF],
], dtype=np.int32)

def key_background(a, tol=72):
    """Self-calibrating chroma key: sample the four corners of the flat field and mask
    every pixel within `tol` of that colour. Robust to the generator picking a slightly
    different lime each run, which a hard-coded green-dominance test is not."""
    H,W,_ = a.shape
    patches = np.concatenate([a[0:16,0:16].reshape(-1,3), a[0:16,W-16:].reshape(-1,3),
                              a[H-16:,0:16].reshape(-1,3), a[H-16:,W-16:].reshape(-1,3)])
    ref = np.median(patches, axis=0)
    d = np.sqrt(((a - ref)**2).sum(-1))
    return d < tol, ref

def process(src, dst, size=256):
    im = Image.open(src).convert('RGB'); a = np.asarray(im).astype(np.int32)
    bg, ref = key_background(a)
    frac = bg.mean()
    assert 0.25 < frac < 0.90, f'{src}: background fraction {frac:.3f} implausible (ref {ref})'
    fg = ndimage.binary_closing(ndimage.binary_opening(~bg, np.ones((3,3))), np.ones((3,3)))
    ys,xs = np.nonzero(fg)
    y0,y1,x0,x1 = ys.min(), ys.max()+1, xs.min(), xs.max()+1
    side = int(max(y1-y0, x1-x0)*1.06); H,W = fg.shape
    sy0, sx0 = (y0+y1)//2 - side//2, (x0+x1)//2 - side//2
    rgb = np.zeros((side,side,3)); alph = np.zeros((side,side))
    for yy in range(side):
        gy = sy0+yy
        if gy < 0 or gy >= H: continue
        xa, xb = max(0,-sx0), min(side, W-sx0)
        rgb[yy,xa:xb] = a[gy, sx0+xa:sx0+xb]; alph[yy,xa:xb] = fg[gy, sx0+xa:sx0+xb]*255.0
    pm = rgb*(alph[...,None]/255.0)
    d = lambda z: np.asarray(Image.fromarray(z.astype(np.uint8)).resize((size,size),Image.BOX), dtype=float)
    pm2 = np.dstack([d(pm[...,i]) for i in range(3)]); a2 = d(alph); op = a2 >= 110
    with np.errstate(divide='ignore',invalid='ignore'):
        un = np.where(a2[...,None]>0, pm2*255.0/np.maximum(a2,1)[...,None], 0)
    px = np.clip(un,0,255).astype(np.int32)
    snap = PAL[(((px[:,:,None,:]-PAL[None,None,:,:])**2).sum(-1)).argmin(-1)].astype(np.uint8)
    Image.fromarray(np.dstack([snap,(op*255).astype(np.uint8)]),'RGBA').save(dst, optimize=True)
    print(f'{os.path.basename(dst):26s} bgfrac {frac:.3f} ref {tuple(int(v) for v in ref)}  '
          f'{os.path.getsize(dst):5d} B  {len({tuple(v) for v in snap[op]})} colours')

if __name__ == '__main__':
    for n in ['lifting','resting','flop','crown']:
        process(f'agy-artifacts/mascot-{n}-raw.jpg', f'agy-artifacts/mascot-{n}-256.png')
