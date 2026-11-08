#!/usr/bin/env python3
"""Repaint the near yellow tactile strip of the Live platform pictures in a sponsor's floor colour.
The sponsor logo itself is drawn by the page (station-test/index.html, floor strip ad), so only the tiles change here.

    python3 scripts/live-floor-base.py --dir station-test --colour white      # writes *_fw.webp

Reads platform_w.webp, platform_w_night.webp, platform_w_band4k.webp in --dir and writes them with suffix _fw (white)
or _fb (black). The tile texture (dots, joints, grime) is kept as shading.
Needs: numpy pillow
"""
import argparse, os
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--dir', required=True)
ap.add_argument('--colour', choices=['white', 'black'], default='white')
A = ap.parse_args()
SFX = '_fw' if A.colour == 'white' else '_fb'
KT = (0.178600938, 2229.35673 - 7)   # track-side edge of the near strip, platform picture px
KB = (0.209079357, 2270.06190 + 3)   # platform-side edge

def repaint(name, scale=1, y0=0, by_colour=True):
    """scale, y0: how this picture maps onto the 2600x3840 platform picture (x/scale, y/scale + y0)"""
    im = Image.open(os.path.join(A.dir, name + '.webp')).convert('RGB')
    a = np.asarray(im).astype(float)
    H, W = a.shape[:2]
    py, px = np.mgrid[0:H, 0:W].astype(float)
    X = px/scale; Y = py/scale + y0
    band = (Y >= KT[0]*X + KT[1]) & (Y <= KB[0]*X + KB[1])
    r, b = a[..., 0], a[..., 2]
    paint = band & (r > b + 12) if by_colour else band   # the night picture is too dark to tell the yellow apart
    L = a @ [0.299, 0.587, 0.114]
    Lm = np.median(L[paint])
    if A.colour == 'white':
        v = np.clip(Lm*1.35 + (L - Lm)*0.9, 0, 255)
    else:
        v = np.clip(Lm*0.18 + (L - Lm)*0.25, 0, 255)
    out = a.copy()
    for c in range(3):
        ch = out[..., c]; ch[paint] = v[paint]
    dst = os.path.join(A.dir, name + SFX + '.webp')
    Image.fromarray(out.astype('uint8')).save(dst, quality=86 if scale == 1 else 82, method=6)
    print(name, '->', os.path.basename(dst), 'tiles:', int(paint.sum()), 'px, median', round(Lm))

repaint('platform_w')
repaint('platform_w_night', by_colour=False)
repaint('platform_w_band4k', scale=2, y0=1100)
