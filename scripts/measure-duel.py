# -*- coding: utf-8 -*-
"""
首頁對決卡：量左側 wordmark 與右側 S&P 500 的「實際字高」，判斷兩邊是否等高。

為什麼要這支：目測、或自己在截圖上框座標去量，都會量錯（框到徽章的底邊、
門檻設得不一樣，結論就不同）。這支直接問瀏覽器兩個元素在哪裡，
只截那一塊、用同一個門檻找「有墨水的列」，手機與桌機各量一次。

用法（在 repo 根目錄，跟 preview-duel.py 一樣用本機的 index.html）：
  python3 scripts/measure-duel.py

輸出：每個版本各一行，左右兩邊的「上緣、下緣、字高」（單位：CSS px，手機是 3 倍截圖換算回來）。
判斷：上緣差、下緣差都 ≤ 0.34 CSS px（= 手機截圖 1 個像素）才算等高。

規則（Henry 定案）：右側 S&P 500 是標準，字級不動。
不等高時改 assets.js 那一筆的 duelWmFit（只影響該主角的 wordmark，見 HANDOFF 每週新增資產.md）。
"""
import os, io, sys, asyncio, threading, functools, http.server, socketserver
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright

ACK = "localStorage.setItem('dcacafe_disclaimer_ack', JSON.stringify({version:'v1'}))"
VIEWS = {'mobile': ({'width': 390, 'height': 844}, 3), 'desktop': ({'width': 1440, 'height': 900}, 3)}
INK = 128   # 灰階低於這個值算「有墨水」(兩邊都是深色字、白底)

def serve(root):
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a, **k):
            pass
    s = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=root))
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s.server_address[1]

def ink_rows(png, dpr, top_css):
    # 從截圖正中間那一列往上、往下找「連續有墨水的列」。
    # 不能直接取全部有墨水的列：多截的邊界會碰到上方徽章的底邊（實際發生過，量成右邊比較高）。
    a = np.asarray(Image.open(io.BytesIO(png)).convert('L'))
    ink = (a < INK).any(1)
    c = len(ink) // 2
    if not ink[c]:
        near = np.where(ink)[0]
        if not len(near):
            return None
        c = near[np.argmin(abs(near - c))]
    t = c
    while t > 0 and ink[t - 1]:
        t -= 1
    btm = c
    while btm < len(ink) - 1 and ink[btm + 1]:
        btm += 1
    return top_css + t / dpr, top_css + (btm + 1) / dpr

async def measure(b, port, view):
    vp, dpr = VIEWS[view]
    pg = await b.new_page(viewport=vp, device_scale_factor=dpr)
    await pg.add_init_script(ACK)
    await pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith('http://127.0.0.1') else r.continue_())
    await pg.goto(f'http://127.0.0.1:{port}/index.html', wait_until='domcontentloaded')
    await pg.wait_for_timeout(2000)
    el = await pg.query_selector('.duel-card-frame')
    await pg.evaluate('(e)=>window.scrollTo(0, e.getBoundingClientRect().top+window.scrollY-120)', el)
    await pg.wait_for_timeout(2000)
    out = {}
    for name, sel in (('wordmark', '#duelWordmarkAsset img'), ('S&P 500', '.duel-wm-spy')):
        r = await pg.evaluate('(s)=>{const e=document.querySelector(s); if(!e) return null; const b=e.getBoundingClientRect(); return [b.left,b.top,b.width,b.height];}', sel)
        if not r:
            out[name] = None; continue
        x, y, w, h = r
        pad = 6   # 多截一點，transform 放大後的字可能超出原本的盒子
        clip = {'x': x - pad, 'y': y - pad, 'width': w + 2 * pad, 'height': h + 2 * pad}
        png = await pg.screenshot(clip=clip)
        out[name] = ink_rows(png, dpr, y - pad)
    await pg.close()
    return out

async def main():
    port = serve(os.getcwd())
    ok = True
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for v in VIEWS:
            m = await measure(b, port, v)
            L, R = m['wordmark'], m['S&P 500']
            if not L or not R:
                print(v, '量不到', m); ok = False; continue
            dt, db = L[0] - R[0], L[1] - R[1]
            same = abs(dt) <= 0.34 and abs(db) <= 0.34
            ok &= same
            print('%-7s 左 %.2f–%.2f（高 %.2f）  右 %.2f–%.2f（高 %.2f）  上緣差 %+.2f  下緣差 %+.2f  %s' % (
                v, L[0], L[1], L[1] - L[0], R[0], R[1], R[1] - R[0], dt, db, '✓ 等高' if same else '✗ 不等高'))
        await b.close()
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    asyncio.run(main())
