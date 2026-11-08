#!/usr/bin/env python3
"""Make the window-glass variations for one Live train design, so not every window looks the same.

    python3 scripts/live-train-glass.py --dir station-test/trains/standard --src win --scale 1
    python3 scripts/live-train-glass.py --dir station-test/trains/tv --src w0 --scale 2

Writes glass1..glassN.webp (+ _b motion-blur twins): only the glass of a window section, cut out with soft edges,
with the interior lit a little differently (brighter / warmer / cooler / dimmer, or the car interior mirrored).
The page lays one of them over a window section, chosen at random per window for each train.
Needs: numpy scipy pillow
"""
import argparse, os
import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates, uniform_filter1d, gaussian_filter

ap = argparse.ArgumentParser()
ap.add_argument('--dir', required=True)
ap.add_argument('--src', default='win', help='a window section picture in --dir whose window shows the plain interior')
ap.add_argument('--scale', type=int, default=1)
A = ap.parse_args()
SC = A.scale
X0 = 345.0; VPx, VPy = -1722.0, 356.0
GX0, GX1, GT0, GT1, GR = 31.0, 165.0, -0.0655, 0.0172, 8.0     # inner glass (1x picture px, t), corner radius
MX0, MX1 = 42.0, 154.0                                          # mirrored part: the interior, not the lit frame edges
BOX = (24, 200, 172, 412)                                        # crop written to the files (1x px) - the page uses it
# subtle variations: (gain, red, green, blue, mirror)
VARS = [(1.10, 1.05, 1.00, 0.92, False),   # brighter, warmer
        (0.97, 1.00, 1.00, 1.00, True),    # interior mirrored
        (0.88, 0.96, 1.00, 1.06, False),   # dimmer, cooler
        (1.05, 1.04, 1.00, 0.95, True),    # mirrored, a bit warmer
        (0.74, 1.00, 1.00, 1.00, False)]   # a dim one

im = np.asarray(Image.open(os.path.join(A.dir, A.src+'.webp')).convert('RGBA')).astype(float)
bx0, by0, bx1, by1 = (v*SC for v in BOX)
H, W = by1-by0, bx1-bx0
iy, ix = np.mgrid[0:H, 0:W].astype(float)
px = (ix + bx0 + 0.5)/SC; py = (iy + by0 + 0.5)/SC                  # 1x picture coords
t = (py - VPy)/(X0 + px - VPx)
# rounded glass mask in (px, t*2100), feathered
yy = t*2100; y0, y1 = GT0*2100, GT1*2100
dx = np.maximum(np.maximum(GX0+GR-px, px-(GX1-GR)), 0); dy = np.maximum(np.maximum(y0+GR-yy, yy-(y1-GR)), 0)
inside = (px >= GX0) & (px <= GX1) & (yy >= y0) & (yy <= y1) & (dx*dx+dy*dy <= GR*GR)
mask = gaussian_filter(inside.astype(float), 1.2*SC)
mid = gaussian_filter(((px >= MX0) & (px <= MX1)).astype(float), 4*SC)   # where the mirrored interior shows
rgb = im[..., :3]

def sample(sx, sy):
    return np.stack([map_coordinates(rgb[..., c], [sy*SC-0.5, sx*SC-0.5], order=1, mode='nearest') for c in range(3)], -1)

def save(name, out):
    res = np.clip(out, 0, 255).astype('uint8')
    Image.fromarray(res).save(os.path.join(A.dir, name+'.webp'), quality=88, method=6)
    a = res[..., 3:].astype(float)/255; pre = res[..., :3]*a; k = 41*SC
    pb = uniform_filter1d(pre, k, axis=1, mode='constant'); ab = uniform_filter1d(a, k, axis=1, mode='constant')
    rb = np.where(ab > 1e-3, pb/np.maximum(ab, 1e-3), 0)
    Image.fromarray(np.dstack([np.clip(rb, 0, 255), ab*255]).astype('uint8')).save(os.path.join(A.dir, name+'_b.webp'), quality=84, method=6)

for i, (gain, r, g, b, mirror) in enumerate(VARS, 1):
    if mirror:
        sx = (MX0 + MX1) - px                          # mirror across the glass, keeping the same height on the car
        sy = VPy + t*(X0 + sx - VPx)
        src = sample(sx, sy)*mid[..., None] + sample(px, py)*(1-mid[..., None])
    else:
        src = sample(px, py)
    out = src*gain*np.array([r, g, b])
    save('glass%d' % i, np.dstack([out, mask*255]))
print('glass variations:', len(VARS), 'box', BOX, '->', A.dir)
