"""建置前：資產沒有本地 Logo（logo/<slug>.png）時，自動從 Brandfetch 下載一張存進去。
桌面圖示（app/<slug>.png）由 build-assets.py 用這張產生；抓不到就安靜跳過，改用代號文字方塊。
來源跟網站資產頁上即時顯示的 Logo 相同（js/logo.js：個股/ETF 走 ticker/，加密貨幣走 crypto/）。
只在 GitHub Actions 上跑（對話環境連不到 Brandfetch）。不覆蓋任何已存在的 Logo。"""
import io, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATADIR = os.path.join(ROOT, 'assets-data')
LOGODIR = os.path.join(ROOT, 'logo')
CLIENT = '1id2WDtIC6Z6ifyEB9h'   # Brandfetch 公開金鑰（同 js/logo.js）

try:
    from PIL import Image
except ImportError:
    print('[fetch-logos] 沒有 Pillow，跳過'); sys.exit(0)

for f in sorted(os.listdir(DATADIR)):
    if not f.endswith('.html'):
        continue
    slug = f[:-5]
    if os.path.isfile(os.path.join(LOGODIR, slug + '.png')):
        continue
    src = open(os.path.join(DATADIR, f), encoding='utf-8').read()
    m = re.search(r"\bquery:\s*'([^']+)'", src) or re.search(r"\bticker:\s*'([^']+)'", src)
    if not m:
        print('[fetch-logos] %s 找不到代號，跳過' % slug); continue
    code = m.group(1)
    crypto = bool(re.search(r'-USD[TC]?$', code))
    route = 'crypto/' + re.sub(r'-USD[TC]?$', '', code) if crypto else 'ticker/' + code
    url = 'https://cdn.brandfetch.io/%s/w/320/h/320/fallback/404?c=%s' % (route, CLIENT)
    req = urllib.request.Request(url, headers={
        'Referer': 'https://dcacafe.com/',
        'Accept': 'image/avif,image/webp,image/png,image/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'})
    try:
        data = urllib.request.urlopen(req, timeout=30).read()
        im = Image.open(io.BytesIO(data)).convert('RGBA').resize((320, 320), Image.LANCZOS)
    except Exception as e:
        print('[fetch-logos] %s 抓不到（%s），改用代號文字方塊' % (slug, str(e)[:80])); continue
    if im.getchannel('A').getextrema()[0] == 255:
        im = im.convert('RGB')
    os.makedirs(LOGODIR, exist_ok=True)
    im.save(os.path.join(LOGODIR, slug + '.png'), optimize=True)
    print('[fetch-logos] %s ← %s' % (slug, route))
