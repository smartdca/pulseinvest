#!/usr/bin/env python3
"""Build a sponsor-wrapped train for Live (station-test) from the standard train pictures.

The wrap is a template: a new sponsor only needs its own logo (SVG), link and body colour.

    python3 scripts/live-ad-train.py --name tv \
        --logo media/live/ads/tradingview/full-logo-white.svg \
        --url "https://www.tradingview.com/?aff_id=1173907" --body black

Output: station-test/trains/<name>/  seg0 w0..w5 door rear (each with a _b motion-blur twin), at --scale times the
standard size. w0..w5 are the six window sections of a car, left to right as seen when the train has stopped:
  w0 plain wrap | w1 destination sign kept | w2-w4 the big logo | w5 the QR sticker (with a small "AD")
Needs: numpy scipy pillow qrcode cairosvg
"""
import argparse, io, os
import numpy as np
import cairosvg, qrcode
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import map_coordinates, uniform_filter1d

ap = argparse.ArgumentParser()
ap.add_argument('--name', required=True)
ap.add_argument('--logo', required=True, help='full logo (mark + name) as SVG, one colour')
ap.add_argument('--url', required=True)
ap.add_argument('--body', choices=['black', 'white'], default='black')
ap.add_argument('--scale', type=int, default=2)
ap.add_argument('--root', default=os.path.join(os.path.dirname(__file__), '..', 'station-test', 'trains'))
A = ap.parse_args()
SRC = os.path.join(A.root, 'standard'); OUT = os.path.join(A.root, A.name); os.makedirs(OUT, exist_ok=True)
SC = A.scale; DARK = A.body == 'black'
FONT = '/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf'

# ---- geometry of the standard pictures (car-image pixels) ----
V2x = -1672.0                      # vanishing point the page uses to chain sections
VPx, VPy = -1722.0, 356.0          # where the car side's horizontal lines meet, in the pictures themselves
AB = (-0.135-0.145)/(-0.1198-0.13) # vertical stretch the page applies to the pictures
LW = np.log((600-V2x)/(345-V2x))   # one window section, in log units
BAND0, BAND1 = 0.047, 0.127        # body band below the windows (v = t*AB)
BC = (BAND0+BAND1)/2

# ---- artwork laid out flat: x = G (log units along the car), y = v ----
R = 5000; VMIN, VMAX = -0.16, 0.16
GW, GH = int(6*LW*R)+2, int((VMAX-VMIN)*R)
gx = lambda G: int(round(G*R)); gy = lambda v: int(round((v-VMIN)*R))

def svg_cov(path, width):
    png = cairosvg.svg2png(url=path, output_width=width)
    im = Image.open(io.BytesIO(png)).convert('RGBA')
    a = np.asarray(im).astype(float); cov = a[..., 3]/255
    ys, xs = np.where(cov > 0.02)
    return Image.fromarray((cov*255).astype('uint8')).crop((xs.min(), ys.min(), xs.max()+1, ys.max()+1))

def fit(im, h, wmax):
    """scale to height h (v units), or narrower so it is no wider than wmax (G units)"""
    w = im.width*h/im.height
    if w > wmax: h *= wmax/w; w = wmax
    return im.resize((max(1, int(w*R)), max(1, int(h*R))), Image.LANCZOS)

lock = svg_cov(A.logo, 4000)
# the mark alone = everything left of the widest empty column gap
la = np.asarray(lock) > 20; cols = la.any(0)
gaps, run = [], None
for x, c in enumerate(cols):
    if not c and run is None: run = x
    if c and run is not None: gaps.append((x-run, run, x)); run = None
mark = lock.crop((0, 0, max(gaps)[1], lock.height)) if gaps else lock

def layer(): return Image.new('L', (GW, GH), 0)
art, panel, qrl, adl = layer(), layer(), layer(), layer()
def paste(L, im, cxG, cyv, anchor='c'):
    x = gx(cxG) - (im.width if anchor == 'r' else im.width//2)
    L.paste(255, (x, gy(cyv)-im.height//2), im)

# big logo: between the destination sign and the QR, as large as the band allows, kept clear of the sign
lk = fit(lock, 0.056, 0.36)
paste(art, lk, 3.5*LW + 0.007, BC)
# QR sticker on the section nearest the camera
q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=0, box_size=1)
q.add_data(A.url); q.make(fit=True)
mods = np.array(q.get_matrix(), dtype=bool); n = mods.shape[0]
SIDE = 0.074; quiet = SIDE*2/(n+4); ps = int(SIDE*R)
pan = Image.new('L', (ps, ps), 0); ImageDraw.Draw(pan).rounded_rectangle((0, 0, ps-1, ps-1), radius=int(ps*0.06), fill=255)
paste(panel, pan, 5.5*LW, BC)
qs = int((SIDE-2*quiet)*R)
paste(qrl, Image.fromarray((mods*255).astype('uint8')).resize((qs, qs), Image.NEAREST), 5.5*LW, BC)
# "AD" just above the sticker, right-aligned to it
f = ImageFont.truetype(FONT, int(0.0105*R)); t = Image.new('L', (int(0.05*R), int(0.016*R)), 0)
ImageDraw.Draw(t).text((t.width, t.height//2), 'AD', font=f, fill=255, anchor='rm')
paste(adl, t, 5.5*LW + SIDE/2, BAND0 - 0.0115, anchor='r')
LAY = [np.asarray(x).astype(float)/255 for x in (art, panel, qrl, adl)]

# QR click area in w5 picture pixels (1x), for the page
qx = (345 - V2x)*np.exp(0.5*LW) - (345 - V2x)                 # centre of the section in G -> picture x
qcar = 345 + qx; qt = BC/AB; qy = VPy + qt*(qcar - VPx)
hw = (qcar - V2x)*SIDE/2; hh = SIDE/AB/2*(qcar - VPx)
print('QR hit box (w5, 1x px): x=%d y=%d w=%d h=%d' % (qx-hw, qy-hh, 2*hw, 2*hh))

def sample(L, G, v):
    return map_coordinates(L, [(v-VMIN)*R, G*R], order=1, mode='constant', cval=0)

# ---- painting ----
def load(name):
    im = Image.open(os.path.join(SRC, name+'.webp')).convert('RGBA')
    big = im.resize((im.width*SC, im.height*SC), Image.LANCZOS)
    return np.asarray(big).astype(float), im.size

def rrect_mask(px, py, rects):
    m = np.zeros(px.shape, bool)
    for x0, y0, x1, y1, r in rects:
        dx = np.maximum(np.maximum(x0+r-px, px-(x1-r)), 0); dy = np.maximum(np.maximum(y0+r-py, py-(y1-r)), 0)
        m |= (px >= x0) & (px <= x1) & (py >= y0) & (py <= y1) & (dx*dx+dy*dy <= r*r)
    return m

def win_mask(px, t, rects):   # rounded rects in (picture x, t*2100) space, follows the car's perspective
    return rrect_mask(px, t*2100, [(x0, a*2100, x1, b*2100, r) for x0, x1, a, b, r in rects])

def poly_mask(shape, polys):
    m = Image.new('L', (shape[1], shape[0]), 0); d = ImageDraw.Draw(m)
    for p in polys: d.polygon([(x*SC, y*SC) for x, y in p], fill=255)
    return np.asarray(m) > 0

def recolor(rgb):
    L = rgb @ [0.299, 0.587, 0.114]
    base = (7 + 0.12*L + 0.55*np.maximum(0, L-205)) if DARK else (150 + 0.42*L)
    return L, np.repeat(base[..., None], 3, -1)

def save(name, rgba, blur=41):
    res = np.clip(rgba, 0, 255).astype('uint8')
    Image.fromarray(res).save(os.path.join(OUT, name+'.webp'), quality=90, method=6)
    a = res[..., 3:].astype(float)/255; pre = res[..., :3]*a; k = blur*SC
    pb = uniform_filter1d(pre, k, axis=1, mode='nearest'); ab = uniform_filter1d(a, k, axis=1, mode='nearest')
    rb = np.where(ab > 1e-3, pb/np.maximum(ab, 1e-3), 0)
    Image.fromarray(np.dstack([np.clip(rb, 0, 255), a*255]).astype('uint8')).save(os.path.join(OUT, name+'_b.webp'), quality=86, method=6)

def paint(name, out, x0, keep, G0=None, extra=None, blur=41):
    im, _ = load(name)
    H, W = im.shape[:2]
    py, px = np.mgrid[0:H, 0:W].astype(float); px = (px+0.5)/SC; py = (py+0.5)/SC
    cx = x0 + px; t = (py - VPy)/(cx - VPx)
    rgb = im[..., :3]; L, body_c = recolor(rgb)
    body = (im[..., 3] > 0) & ~keep(px, py, t, rgb)
    if G0 is not None:
        G = G0 + np.log((cx - V2x)/(345 - V2x)); v = t*AB
        a, pn, qq, ad = (sample(Lr, G, v) for Lr in LAY)
        fg = (255*np.clip(0.8+0.2*L/165, 0.75, 1.0)) if DARK else np.full(L.shape, 18.0)
        body_c = body_c*(1-a[..., None]) + fg[..., None]*a[..., None]
        sticker = 250*np.clip(L/170, 0.85, 1.05)*(1-qq) + 12*qq
        body_c = body_c*(1-pn[..., None]) + sticker[..., None]*pn[..., None]
        adc = 150 if DARK else 90
        body_c = body_c*(1-ad[..., None]) + adc*ad[..., None]
    if extra is not None: body_c = extra(body_c, px, py, L)
    out_rgb = rgb.copy(); out_rgb[body] = body_c[body]
    save(out, np.dstack([out_rgb, im[..., 3]]), blur)

def yellow(rgb, py, y_min=560):
    """the yellow door threshold strips (kept); flags and stickers higher up are wrapped over"""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (r > b + 40) & (g > 0.55*r) & (r - b > 0.25*r) & (py > y_min)

WIN = [(12, 175, -0.0732, 0.0242, 15)]
SIGN = [[(2, 455), (254, 465), (254, 543), (2, 526)]]
for p in range(6):
    src = 'wins' if p == 1 else 'win'
    def keep(px, py, t, rgb, p=p):
        k = win_mask(px, t, WIN)
        if p == 1: k |= poly_mask(px.shape, SIGN)
        return k
    paint(src, 'w%d' % p, 345, keep, G0=p*LW)

DOOR = [(68, 151, -0.0745, 0.0255, 13), (186, 277, -0.0745, 0.0255, 13)]
paint('door', 'door', 600, lambda px, py, t, rgb: win_mask(px, t, DOOR) | yellow(rgb, py))

REAR = [(76, 200, 132, 402, 12), (140, 200, 202, 402, 12)]
paint('rear', 'rear', 80, lambda px, py, t, rgb: rrect_mask(px, py, REAR) | yellow(rgb, py))

# cab: side windows, windscreen with headlights and the undercarriage stay as photographed
CAB_RECTS = [(63, 197, 228, 410, 16), (374, 174, 461, 419, 12), (496, 167, 589, 419, 12), (782, 151, 883, 419, 10)]
CAB_POLYS = [[(992, 58), (1250, 92), (1385, 138), (1455, 250), (1482, 430), (1466, 528), (1300, 574), (1180, 566),
              (1102, 494), (1086, 400), (1026, 196)],
             [(860, 688), (1510, 640), (1510, 840), (980, 840)]]
cab_lock = fit(lock, 0.050, 0.33)
cab_layer = layer()
# the cab side runs from picture x 30 to 850 (car x 320..1140); centre the logo there
g_lo = np.log((290+30-V2x)/(345-V2x)); g_hi = np.log((290+850-V2x)/(345-V2x))
cab_art = Image.new('L', (int((g_hi-g_lo+0.2)*R), GH), 0)
cab_art.paste(255, (int(((g_hi-g_lo)/2+0.1)*R)-cab_lock.width//2, gy(BC)-cab_lock.height//2), cab_lock)
CAB = np.asarray(cab_art).astype(float)/255
markF = mark.resize((int(mark.width*58*SC/mark.height), 58*SC), Image.LANCZOS)
def cab_extra(body_c, px, py, L):
    H, W = px.shape
    # side logo
    G = np.log((290+px - V2x)/(345 - V2x)) - g_lo + 0.1; v = (py - VPy)/(290+px - VPx)*AB
    a = map_coordinates(CAB, [(v-VMIN)*R, G*R], order=1, mode='constant', cval=0)
    a[px > 870] = 0
    fg = (255*np.clip(0.8+0.2*L/165, 0.75, 1.0)) if DARK else np.full(L.shape, 18.0)
    body_c = body_c*(1-a[..., None]) + fg[..., None]*a[..., None]
    # front face: the mark on the panel between the windscreen and the bumper
    m = Image.new('L', (W, H), 0)
    m.paste(255, (int(1296*SC - markF.width/2), int(616*SC - markF.height/2)), markF)
    b = np.asarray(m).astype(float)/255
    return body_c*(1-b[..., None]) + fg[..., None]*b[..., None]
paint('seg0', 'seg0', 290, lambda px, py, t, rgb: rrect_mask(px, py, CAB_RECTS) | poly_mask(px.shape, CAB_POLYS) | yellow(rgb, py),
      extra=cab_extra, blur=20)
print('done ->', OUT)
