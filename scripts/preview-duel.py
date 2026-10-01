# -*- coding: utf-8 -*-
"""
首頁對決卡預覽：用本機的 repo（真的 index.html + 真的 CSS）在 Chromium 裡截圖，
推上線之前先自己看。不會改任何檔案。

用法（在 repo 根目錄）：
  python3 scripts/preview-duel.py <輸出資料夾>
      → duel-mobile.png（390 寬、3 倍）與 duel-desktop.png（1440 寬）
  python3 scripts/preview-duel.py <輸出資料夾> --spy-mobile 20,19,18,17,16,15 --spy-desktop 48,46,44,42,40,38
      → 右側 S&P 500 字級的選項圖（A、B、C…），讓 Henry 挑。手機、桌機分兩張、分兩次傳。

注意：
- 這裡是 Chromium，不是 iPhone Safari。最後仍以 Henry 手機實機為準。
- 對外網路一律擋掉，資料卡片會是空的；只看版面。
- 首次造訪會有年齡／免責遮罩，這裡預先寫入 dcacafe_disclaimer_ack 讓它不出現
  （版本字串要跟 index.html 的 DM_VERSION 一致）。
"""
import sys, os, io, argparse, asyncio, threading, functools, http.server, socketserver
from PIL import Image, ImageDraw, ImageFont
from playwright.async_api import async_playwright

ACK = "localStorage.setItem('dcacafe_disclaimer_ack', JSON.stringify({version:'v1'}))"
VIEWS = {'mobile': ({'width': 390, 'height': 844}, 3), 'desktop': ({'width': 1440, 'height': 900}, 1)}

def serve(root):
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a, **k):
            pass
    h = functools.partial(Quiet, directory=root)
    s = socketserver.TCPServer(('127.0.0.1', 0), h)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s.server_address[1]

async def open_page(b, port, view, css=None):
    vp, dpr = VIEWS[view]
    pg = await b.new_page(viewport=vp, device_scale_factor=dpr)
    await pg.add_init_script(ACK)
    await pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith('http://127.0.0.1') else r.continue_())
    await pg.goto(f'http://127.0.0.1:{port}/index.html', wait_until='domcontentloaded')
    if css:
        await pg.add_style_tag(content=css)
    await pg.wait_for_timeout(2000)
    el = await pg.query_selector('.duel-card-frame')
    await pg.evaluate('(e)=>window.scrollTo(0, e.getBoundingClientRect().top+window.scrollY-120)', el)
    await pg.wait_for_timeout(2000)
    return pg, el

async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('outdir')
    ap.add_argument('--spy-mobile'); ap.add_argument('--spy-desktop')
    a = ap.parse_args()
    os.makedirs(a.outdir, exist_ok=True)
    port = serve(os.getcwd())
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 28)
    except OSError:
        font = ImageFont.load_default()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        opts = {'mobile': a.spy_mobile, 'desktop': a.spy_desktop}
        if not any(opts.values()):
            for v in VIEWS:
                pg, el = await open_page(b, port, v)
                await el.screenshot(path=os.path.join(a.outdir, f'duel-{v}.png')); await pg.close()
        for v, sizes in opts.items():
            if not sizes:
                continue
            tiles = []
            for n, fs in enumerate(sizes.split(',')):
                pg, el = await open_page(b, port, v, f'.duel-wm-spy{{font-size:{fs}px !important}}')
                png = await el.screenshot(); await pg.close()
                im = Image.open(io.BytesIO(png)).convert('RGB')
                t = Image.new('RGB', (im.width, im.height + 50), 'white'); t.paste(im, (0, 50))
                ImageDraw.Draw(t).text((12, 10), f'{chr(65 + n)}  S&P 500 {fs}px', fill=(200, 0, 0), font=font)
                tiles.append(t)
            W = max(t.width for t in tiles)
            out = Image.new('RGB', (W, sum(t.height + 10 for t in tiles)), (230, 230, 230)); y = 0
            for t in tiles:
                out.paste(t, (0, y)); y += t.height + 10
            out.save(os.path.join(a.outdir, f'spy-options-{v}.png'))
        await b.close()
    print('ok ->', a.outdir)

if __name__ == '__main__':
    asyncio.run(main())
