# -*- coding: utf-8 -*-
"""
DCAcafé 資產頁生成器
────────────────────────────────────────────────────────────────
把「共用版面」跟「每支資產的專屬內容」分開，組出 asset/*.html。

  scripts/asset-template.html   共用版面(樣式、版面、共用文案、引擎)
  assets-data/xxxx.html         這一支的專屬內容(約 140 行)
          ↓  這支程式
  asset/xxxx.html               英文版頁面(產物，不要手改)
          ↓  scripts/build-i18n.py(既有，不變)
  zh/asset/xxxx.html + chrome.js + sitemap.xml

新增一支資產：只要新增 assets-data/xxxx.html，推上去 CI 自動完成其餘。
改共用版面：只改 scripts/asset-template.html，所有資產頁自動重生。

asset/ 底下的檔案是產物，改了下次會被蓋掉。

── 資料檔格式 ──────────────────────────────────────────────────
  <!--EN-HEAD-->  … 英文 head 文案 …  <!--/EN-HEAD-->
  <!--ZH-HEAD     … 中文 head 文案 …  ZH-HEAD-->
  <!--ASSET-->    … COPY.asset 的 JS 物件 …  <!--/ASSET-->
  <!--STATIC      … 嵌進原始 HTML 的英文靜態內容 …  STATIC-->   ← 選填

  ZH-HEAD 區塊照抄進產物，交給 build-i18n.py 處理，格式不要改。
────────────────────────────────────────────────────────────────
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TPL = os.path.join(ROOT, 'scripts', 'asset-template.html')
DATADIR = os.path.join(ROOT, 'assets-data')
OUTDIR = os.path.join(ROOT, 'asset')

AUTOGEN = ('<!-- \u26a0 \u9019\u652f\u6a94\u662f scripts/build-assets.py \u81ea\u52d5\u7522\u751f\u7684\uff0c'
           '\u4e0d\u8981\u624b\u6539\u3002\u7248\u9762\u8981\u6539 scripts/asset-template.html\uff0c'
           '\u9019\u4e00\u652f\u7684\u5167\u5bb9\u8981\u6539 assets-data/%s\u3002 -->')


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


def die(msg):
    raise SystemExit('[build-assets] ' + msg)


def grab(name, src, pattern, what):
    """取出資料檔的一個區塊，找不到就整支停下來，不要產出半殘的頁面。"""
    m = re.search(pattern, src, re.S)
    if not m:
        die('%s \u627e\u4e0d\u5230 %s \u5340\u584a' % (name, what))
    return m.group(1).strip('\n')


# ── STATIC 區塊:給不執行 JS 的爬蟲看的內容 ────────────────────────────
#
# 為什麼需要:ChatGPT / Claude / Perplexity 這類 AI 爬蟲不執行 JS,
# 讀到的是原始 HTML。而頁面上看得到的資產內容全部由 JS 載入後才替換,
# 所以在它們眼中每一支資產頁都長得跟當初抽範本的那一頁一樣
# (TSLA 頁被讀成「AAPL、Apple Inc.」)。Google 會執行 JS 所以看起來沒事,
# 但那個前提只涵蓋 Google。
#
# 這個區塊把「不會變動的內容」直接寫成 HTML,生成時嵌進產物。
# 即時數字(分數/股價/漲跌幅)刻意不寫,範本裡留「—」給 JS 填 ——
# 寫死會過期,而過期的金融數字比空著更糟:空著看得出來,過期看不出來。
#
# 格式:
#   <!--STATIC
#   @H1@
#   ...一行或多行內容...
#   @LOGO@
#   ...
#   STATIC-->
#
# 只認「整行剛好是 @欄位@」當分隔,內容本身不解讀、原樣搬運,
# 所以文案裡有引號、HTML 標籤都不會出問題。
# 簡體字自檢用。不求窮盡,收常見且容易誤入的那些;寧可漏抓,不要誤殺
# (例如「著/着」兩岸都用,不列入)。抓到就擋建置 —— 錯字上線比建置失敗難處理。
SIMPLIFIED_RE = re.compile(
    '[\u806a\u8681\u9759\u53d8\u9645\u4ea7\u8d44\u5e94\u8fd9\u4e3a\u4f1a\u8bf4\u6765\u65f6'
    '\u957f\u5bf9\u7ecf\u8fc7\u73b0\u5b9e\u4e70\u5356\u4ef7\u5173\u6570\u636e\u52a8\u5355'
    '\u53cc\u4e2a\u4eec\u4e48\u7c7b\u70b9\u7ebf\u94b1\u94f6\u5e01\u98ce\u9669\u6743\u8ba4'
    '\u8bc6\u8bfb\u5199\u6ca1\u83b7\u51b3\u62e9\u6807\u9898\u56fe\u663e\u8bbe\u8ba1\u5f00'
    '\u95ed\u6362\u8f6c\u8fdb\u8fd0\u5f55\u603b\u7ed3\u7eed\u6742\u7b80\u4f53\u8f83]')

STATIC_FIELDS = ('H1', 'LOGO', 'TICKER', 'COMPANY', 'INTRO_EYEBROW', 'INTRO_BODY',
                 'CHART_BODY', 'FAQ_ITEMS')


def parse_static(src):
    m = re.search(r'<!--STATIC\b.*?\n(.*?)\nSTATIC-->', src, re.S)
    if not m:
        return None
    out, cur = {}, None
    for line in m.group(1).split('\n'):
        t = line.strip()
        if len(t) > 2 and t.startswith('@') and t.endswith('@') and t[1:-1] in STATIC_FIELDS:
            cur = t[1:-1]
            out[cur] = []
        elif cur is not None:
            out[cur].append(line)
    return dict((k, '\n'.join(v).strip('\n')) for k, v in out.items())


def static_defaults(ticker):
    """沒有 STATIC 區塊時的中性備援。

    重點是「中性」:寧可寫得籠統,也不要留下別支資產的名字。
    籠統只是沒幫助,寫錯公司名是實質傷害。
    """
    t = ticker.split('-')[0]
    faq = (
        '<div class="faq-item">'
        '<button class="faq-q">Is DCAcaf\u00e9\u2019s score for {T} investment advice?'
        '<span class="faq-chev">\u25be</span></button>'
        '<div class="faq-a"><p>No. DCAcaf\u00e9 is a data tool that helps you think through '
        'the timing and sizing of investing in {T}; every decision is your own. '
        'Past performance doesn\u2019t indicate future results.</p></div></div>'
    ).replace('{T}', t)
    return {
        'H1': '%s DCA Score and dollar-cost-averaging signals' % t,
        'LOGO': t[:1],
        'TICKER': t,
        'COMPANY': '\u2014',
        'INTRO_EYEBROW': 'Explore %s' % t,
        'INTRO_BODY': '<p>DCA Score folds drawdown, the 200-week average, RSI and valuation '
                      'into a single 0\u2013100 reading for %s, so dollar-cost averaging leans in '
                      'when the market offers a better entry.</p>' % t,
        'CHART_BODY': '<p>Ten years of %s price with the DCA Score line on top \u2014 '
                      'how far it has run, and how hard the market has knocked it down along '
                      'the way.</p>' % t,
        'FAQ_ITEMS': faq,
    }


def build(name, data, tpl):
    en = grab(name, data, r'<!--EN-HEAD.*?-->\n(.*?)\n<!--/EN-HEAD-->', 'EN-HEAD')
    zh = grab(name, data, r'(<!--ZH-HEAD.*?ZH-HEAD-->)', 'ZH-HEAD')
    asset = grab(name, data, r'<!--ASSET.*?-->\n(.*?)\n<!--/ASSET-->', 'ASSET')

    # 回測連結用的代號:有 query 用 query(例如 BTC-USD),沒有就用 ticker
    m = re.search(r"\bquery:\s*'([^']+)'", asset) or re.search(r"\bticker:\s*'([^']+)'", asset)
    if not m:
        die('%s \u7684 ASSET \u5340\u584a\u627e\u4e0d\u5230 ticker' % name)
    query = m.group(1)

    # 顯示用代號(給 STATIC 備援與 @TICKER@ 用):一律取 ticker,不取 query
    mt = re.search(r"\bticker:\s*'([^']+)'", asset)
    ticker = mt.group(1) if mt else query

    slug = name[:-5] if name.endswith('.html') else name
    # 三個大區塊必須恰好一個;@QUERY@ 可以出現多次(href 與 data-query 都要)
    for token, val in (('<!--@EN-HEAD@-->', en),
                       ('<!--@ZH-HEAD@-->', zh),
                       ('<!--@ASSET@-->', asset)):
        if tpl.count(token) != 1:
            die('\u7bc4\u672c\u88e1\u7684 %s \u4e0d\u662f\u6070\u597d\u4e00\u500b' % token)
        tpl = tpl.replace(token, val)
    if tpl.count('@QUERY@') < 1:
        die('\u7bc4\u672c\u88e1\u627e\u4e0d\u5230 @QUERY@')
    tpl = tpl.replace('@QUERY@', query)

    # STATIC:有就用,沒有就套中性備援(絕不留下別支資產的內容)
    static = parse_static(data) or {}
    fallback = static_defaults(ticker)
    for f in STATIC_FIELDS:
        val = static.get(f) or fallback[f]
        token = '@%s@' % f
        if tpl.count(token) != 1:
            die('\u7bc4\u672c\u88e1\u7684 %s \u4e0d\u662f\u6070\u597d\u4e00\u500b' % token)
        tpl = tpl.replace(token, val)

    # 產物開頭加註記,提醒不要手改
    tpl = tpl.replace('<html lang="en">',
                      (AUTOGEN % name) + '\n<html lang="en">', 1)

    # 硬規則自檢:產物裡不得出現簡體字
    # (2026-09 實際發生:資料檔裡混進「聪/蚁/静」,會出現在中文版的分享卡片上)
    zh_bad = SIMPLIFIED_RE.search(tpl)
    if zh_bad:
        die('%s \u7684\u7522\u7269\u51fa\u73fe\u7c21\u9ad4\u5b57\uff1a%s' % (name, zh_bad.group(0)))

    # 硬規則自檢:產物裡不得出現日期
    bad = re.search(r'20\d{2}-\d{2}-\d{2}', tpl)
    if bad:
        die('%s \u7684\u7522\u7269\u51fa\u73fe\u65e5\u671f\uff1a%s' % (name, bad.group(0)))

    # 自檢:產物裡不得殘留未替換的 token
    left = re.search(r'@(?:%s)@' % '|'.join(STATIC_FIELDS), tpl)
    if left:
        die('%s \u7684\u7522\u7269\u6b98\u7559 token\uff1a%s' % (name, left.group(0)))
    return tpl


def main():
    if not os.path.isfile(TPL):
        die('\u627e\u4e0d\u5230 scripts/asset-template.html')
    if not os.path.isdir(DATADIR):
        die('\u627e\u4e0d\u5230 assets-data/ \u76ee\u9304')
    tpl = read(TPL)

    names = sorted(f for f in os.listdir(DATADIR) if f.endswith('.html'))
    if not names:
        die('assets-data/ \u88e1\u6c92\u6709 .html')

    changed, nostatic = [], []
    for n in names:
        src = read(os.path.join(DATADIR, n))
        if not parse_static(src):
            nostatic.append(n)
        out = build(n, src, tpl)
        if write(os.path.join(OUTDIR, n), out):
            changed.append('asset/' + n)

    # 資料檔被刪掉時,對應的產物也要清掉
    if os.path.isdir(OUTDIR):
        for f in os.listdir(OUTDIR):
            if f.endswith('.html') and f not in names:
                os.remove(os.path.join(OUTDIR, f))
                changed.append('- asset/' + f)

    print('[build-assets] \u8cc7\u7522 %d \u652f\uff1a%s' % (len(names), ', '.join(names)))
    print('[build-assets] \u66f4\u65b0\uff1a%s' % (', '.join(changed) if changed else '\u7121\u8b8a\u5316'))
    if nostatic:
        # 不擋建置:沒有 STATIC 只是少了給爬蟲看的內容,頁面本身完全正常。
        print('[build-assets] \u26a0 \u7f3a STATIC \u5340\u584a\uff08\u5957\u4e2d\u6027\u5099\u63f4\uff09\uff1a%s'
              % ', '.join(nostatic))


if __name__ == '__main__':
    main()
