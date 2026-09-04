# -*- coding: utf-8 -*-
"""
DCAcafé 資產頁中英雙網址產生器
────────────────────────────────────────────────────────────────
唯一的來源是 asset/*.html（同時就是線上的英文版）。
這支程式讀它，產出三樣東西：

  1. zh/asset/*.html   中文版頁面
  2. chrome.js         更新 ZH_READY-ASSETS 區塊（部落格那區由 generate_blog.py 管）（頁尾才知道哪些頁有中文版）
  3. sitemap.xml       更新資產頁區塊（中英各一筆，各帶完整 hreflang）

你要做的事只有一件：上傳 asset/xxx.html。其餘由 GitHub Actions 跑這支自動完成。
zh/ 底下的檔案是產物，改了下次會被蓋掉。

來源檔必須具備（照 aapl.html 複製就有）：
  · <html lang="en">
  · <link rel="canonical" href="https://dcacafe.com/asset/xxx.html">
  · <!--ZH-HEAD … ZH-HEAD--> 中文 head 區塊
  · <script>window.DCA_LANG='en';window.DCA_LANG_LOCKED=true;</script>
────────────────────────────────────────────────────────────────
"""
import io, os, re, sys, datetime

ROOT     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETDIR = os.path.join(ROOT, 'asset')

# 根目錄的雙語頁面（非資產頁）。加一支就在這裡加一行，來源檔要有 ZH-HEAD 區塊。
# 2026-09-03:learn.html 加入——學習空間從 index.html 的分頁抽成獨立頁面。
# 2026-09-04:backtest.html 加入——歷史回測從 index.html 的分頁抽成獨立頁面。
ROOT_PAGES = ['trending.html', 'insights.html', 'privacy.html', 'learn.html', 'backtest.html']
ZHDIR    = os.path.join(ROOT, 'zh', 'asset')
CHROME   = os.path.join(ROOT, 'chrome.js')
SITEMAP  = os.path.join(ROOT, 'sitemap.xml')
SITE     = 'https://dcacafe.com'
TODAY    = datetime.date.today().isoformat()

AUTOGEN = ('<!-- \u26a0 \u9019\u652f\u6a94\u662f scripts/build-i18n.py \u81ea\u52d5\u7522\u751f\u7684\uff0c'
           '\u4e0d\u8981\u624b\u6539\u3002\u8981\u6539\u8acb\u6539 asset/%s\uff0c\u63a8\u4e0a\u53bb\u6703\u91cd\u65b0\u7522\u4e00\u6b21\u3002 -->')


def read(p):
    return io.open(p, encoding='utf-8').read()


def write(p, s):
    d = os.path.dirname(p)
    if d and not os.path.isdir(d):
        os.makedirs(d)
    old = read(p) if os.path.exists(p) else None
    if old == s:
        return False
    io.open(p, 'w', encoding='utf-8').write(s)
    return True


# ── 從 <!--ZH-HEAD … ZH-HEAD--> 取出中文 head ────────────────────
ZHBLOCK = re.compile(r'<!--ZH-HEAD.*?ZH-HEAD-->\s*', re.S)


def pick(block, pattern):
    m = re.search(pattern, block)
    return m.group(1) if m else None


def parse_zh_head(block):
    return {
        'title': pick(block, r'<title>(.*?)</title>'),
        'desc':  pick(block, r'<meta name="description" content="(.*?)">'),
        'ogt':   pick(block, r'<meta property="og:title" content="(.*?)">'),
        'ogd':   pick(block, r'<meta property="og:description" content="(.*?)">'),
        'twt':   pick(block, r'<meta name="twitter:title" content="(.*?)">'),
        'twd':   pick(block, r'<meta name="twitter:description" content="(.*?)">'),
    }


def sub_once(h, pattern, repl, where):
    h2, n = re.subn(pattern, lambda m: repl, h, count=1)
    if n != 1:
        raise SystemExit('[build-i18n] %s \u627e\u4e0d\u5230\u6216\u4e0d\u552f\u4e00\uff1a%s' % (where, pattern))
    return h2


def build_zh(name, src, rel):
    """name 顯示用；rel 是相對站根的路徑，例如 asset/aapl.html"""
    m = ZHBLOCK.search(src)
    if not m:
        raise SystemExit('[build-i18n] %s \u7f3a\u5c11 <!--ZH-HEAD ... ZH-HEAD--> \u5340\u584a' % name)
    zh = parse_zh_head(m.group(0))
    for k, v in zh.items():
        if not v:
            raise SystemExit('[build-i18n] %s \u7684 ZH-HEAD \u5340\u584a\u7f3a\u4e86 %s' % (name, k))

    en_url = '%s/%s' % (SITE, rel)          # rel 例如 'asset/aapl.html' 或 'trending.html'
    zh_url = '%s/zh/%s' % (SITE, rel)

    h = ZHBLOCK.sub('', src, count=1)                       # 中文版不需要留這段
    h = sub_once(h, r'<html lang="en">',
                 '%s\n<html lang="zh-Hant">' % (AUTOGEN % name), 'html lang')
    h = sub_once(h, r'<title>.*?</title>',
                 '<title>%s</title>' % zh['title'], 'title')
    h = sub_once(h, r'<meta name="description" content=".*?">',
                 '<meta name="description" content="%s">' % zh['desc'], 'description')
    h = sub_once(h, r'<meta property="og:title" content=".*?">',
                 '<meta property="og:title" content="%s">' % zh['ogt'], 'og:title')
    h = sub_once(h, r'<meta property="og:description" content=".*?">',
                 '<meta property="og:description" content="%s">' % zh['ogd'], 'og:description')
    h = sub_once(h, r'<meta name="twitter:title" content=".*?">',
                 '<meta name="twitter:title" content="%s">' % zh['twt'], 'twitter:title')
    h = sub_once(h, r'<meta name="twitter:description" content=".*?">',
                 '<meta name="twitter:description" content="%s">' % zh['twd'], 'twitter:description')
    h = sub_once(h, re.escape('<link rel="canonical" href="%s">' % en_url),
                 '<link rel="canonical" href="%s">' % zh_url, 'canonical')
    h = sub_once(h, re.escape('<meta property="og:url" content="%s">' % en_url),
                 '<meta property="og:url" content="%s">' % zh_url, 'og:url')
    h = sub_once(h, r'<meta property="og:locale" content="en_US">',
                 '<meta property="og:locale" content="zh_TW">\n'
                 '<meta property="og:locale:alternate" content="en_US">', 'og:locale')
    h = sub_once(h, re.escape("window.DCA_LANG='en'"),
                 "window.DCA_LANG='zh'", 'DCA_LANG')
    return h


# ── chrome.js 的 ZH_READY 清單 ──────────────────────────────────
def update_chrome(names, roots):
    src = read(CHROME)
    # 每筆都帶結尾逗號，chrome.js 陣列末尾有哨兵 '' 收尾
    body = ''.join("    '/asset/%s',\n" % n for n in names)
    body += ''.join("    '/%s',\n" % n for n in roots)
    new = re.sub(
        r'(/\* ZH_READY-ASSETS-START \*/\n).*?(  /\* ZH_READY-ASSETS-END \*/)',
        lambda m: m.group(1) + body + m.group(2), src, count=1, flags=re.S)
    if new == src and 'ZH_READY-ASSETS-START' not in src:
        raise SystemExit('[build-i18n] chrome.js \u627e\u4e0d\u5230 ZH_READY-ASSETS-START/END \u6a19\u8a18')
    return write(CHROME, new)


# ── sitemap.xml 的資產頁區塊 ────────────────────────────────────
def update_sitemap(names, roots):
    src = read(SITEMAP)
    rels = ['asset/' + n for n in names] + list(roots)
    out = []
    for rel in rels:
        en_url = '%s/%s' % (SITE, rel)
        zh_url = '%s/zh/%s' % (SITE, rel)
        freq, prio = ('daily', '0.9') if rel.startswith('asset/') else ('weekly', '0.8')
        alts = ('    <xhtml:link rel="alternate" hreflang="en" href="%s"/>\n'
                '    <xhtml:link rel="alternate" hreflang="zh-Hant" href="%s"/>\n'
                '    <xhtml:link rel="alternate" hreflang="x-default" href="%s"/>\n'
                ) % (en_url, zh_url, en_url)
        for loc in (en_url, zh_url):
            out.append('  <url>\n'
                       '    <loc>%s</loc>\n'
                       '    <lastmod>%s</lastmod>\n'
                       '    <changefreq>%s</changefreq>\n'
                       '    <priority>%s</priority>\n'
                       '%s'
                       '  </url>\n' % (loc, TODAY, freq, prio, alts))
    body = '\n'.join(out)
    new = re.sub(
        r'(  <!-- ASSETS-START -->\n).*?(  <!-- ASSETS-END -->)',
        lambda m: m.group(1) + body + m.group(2), src, count=1, flags=re.S)
    if new == src and 'ASSETS-START' not in src:
        raise SystemExit('[build-i18n] sitemap.xml \u627e\u4e0d\u5230 ASSETS-START/END \u6a19\u8a18')
    return write(SITEMAP, new)


def main():
    if not os.path.isdir(ASSETDIR):
        raise SystemExit('[build-i18n] \u627e\u4e0d\u5230 asset/ \u76ee\u9304')
    names = sorted(f for f in os.listdir(ASSETDIR) if f.endswith('.html'))
    if not names:
        raise SystemExit('[build-i18n] asset/ \u88e1\u6c92\u6709 .html')

    changed = []
    for n in names:
        zh = build_zh(n, read(os.path.join(ASSETDIR, n)), 'asset/' + n)
        if write(os.path.join(ZHDIR, n), zh):
            changed.append('zh/asset/' + n)

    # 根目錄的雙語頁面
    done_roots = []
    for n in ROOT_PAGES:
        src = os.path.join(ROOT, n)
        if not os.path.exists(src):
            print('[build-i18n] 跳過(找不到) %s' % n)
            continue
        zh = build_zh(n, read(src), n)
        done_roots.append(n)
        if write(os.path.join(ROOT, 'zh', n), zh):
            changed.append('zh/' + n)

    # 已被刪除的資產頁,對應的中文版也要清掉
    if os.path.isdir(ZHDIR):
        for f in os.listdir(ZHDIR):
            if f.endswith('.html') and f not in names:
                os.remove(os.path.join(ZHDIR, f))
                changed.append('- zh/asset/' + f)

    if update_chrome(names, done_roots):
        changed.append('chrome.js')
    if update_sitemap(names, done_roots):
        changed.append('sitemap.xml')

    print('[build-i18n] \u8cc7\u7522\u9801 %d \u652f\uff1a%s' % (len(names), ', '.join(names)))
    print('[build-i18n] \u66f4\u65b0\uff1a%s' % (', '.join(changed) if changed else '\u7121\u8b8a\u5316'))


if __name__ == '__main__':
    main()
