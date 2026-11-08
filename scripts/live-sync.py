#!/usr/bin/env python3
"""Build live.html from station-test/index.html (the test page is where Live is developed).

    python3 scripts/live-sync.py            # writes live.html and copies the pictures Live needs into media/live/

Keeps live.html's own <head> up to <style> (title, share previews, Chinese head text, language lock, GA4),
points every picture and sound at /media/live/, and swaps the homepage link's tracking tags.
Every replacement must match exactly once, otherwise nothing is written. The Chinese page zh/live.html is made by CI.
"""
import os, re, shutil, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
TEST = os.path.join(ROOT, 'station-test')
MEDIA = os.path.join(ROOT, 'media', 'live')

src = open(os.path.join(TEST, 'index.html'), encoding='utf-8').read()
live = open(os.path.join(ROOT, 'live.html'), encoding='utf-8').read()

# head: live's own, from the start of the file up to <style>
i_live, i_src = live.index('<style>'), src.index('<style>')
out = live[:i_live] + src[i_src:]

def rep(a, b, n=1):
    global out
    c = out.count(a)
    if c != n:
        sys.exit(f'live-sync: expected {n} of {a!r}, found {c}; nothing written')
    out = out.replace(a, b)

M = '/media/live/'
rep('src="platform_w_fw.webp?p=', 'src="' + M + 'platform_w_fw.webp?p=')
rep('src="pillar.webp"', 'src="' + M + 'pillar.webp"')
rep("hi.src='platform_w_band4k'", "hi.src='" + M + "platform_w_band4k'")
rep("want='platform_w'+sfx+fb+'.webp'+PIC_V", "want='" + M + "platform_w'+sfx+fb+'.webp'+PIC_V")
rep("pl.src='pillar'+sfx+'.webp'", "pl.src='" + M + "pillar'+sfx+'.webp'")
rep("dir:'trains/", "dir:'" + M + "trains/", 2)
rep("'platform_bed.mp3'", "'" + M + "platform_bed.mp3'", 2)
rep("'train_cycle.mp3'", "'" + M + "train_cycle.mp3'")
rep('?utm_source=station&utm_medium=board&utm_campaign=station', '?utm_source=live&utm_medium=board&utm_campaign=wall-st-station')
if 'noindex' in out:
    sys.exit('live-sync: noindex found in the result; nothing written')
# every relative picture or sound left would break on /live
# (sponsor file names in ADS are joined to its absolute dir, and '_b.webp' style endings are joined to a full path)
left = [m.group(0) for m in re.finditer(r"""(\w+:)?['"](?!/|https?:|data:|_)[\w./-]+\.(?:webp|mp3|png|jpg|svg)""", out)
        if not (m.group(1) or '').rstrip(':') in ('logoW', 'logoK', 'markW', 'tagW', 'qr')]
if left:
    sys.exit('live-sync: relative paths left: ' + ', '.join(sorted(set(left))))

open(os.path.join(ROOT, 'live.html'), 'w', encoding='utf-8').write(out)

# pictures Live needs: train designs and the floor tile pictures
dst = os.path.join(MEDIA, 'trains')
if os.path.isdir(dst):
    shutil.rmtree(dst)
shutil.copytree(os.path.join(TEST, 'trains'), dst)
for f in os.listdir(TEST):
    if re.fullmatch(r'platform_w.*_f[wb]\.webp', f):
        shutil.copy2(os.path.join(TEST, f), os.path.join(MEDIA, f))
print('live.html written; trains and floor pictures copied to media/live/')
