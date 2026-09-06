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


def build(name, data, tpl):
    en = grab(name, data, r'<!--EN-HEAD.*?-->\n(.*?)\n<!--/EN-HEAD-->', 'EN-HEAD')
    zh = grab(name, data, r'(<!--ZH-HEAD.*?ZH-HEAD-->)', 'ZH-HEAD')
    asset = grab(name, data, r'<!--ASSET.*?-->\n(.*?)\n<!--/ASSET-->', 'ASSET')

    # 回測連結用的代號:有 query 用 query(例如 BTC-USD),沒有就用 ticker
    m = re.search(r"\bquery:\s*'([^']+)'", asset) or re.search(r"\bticker:\s*'([^']+)'", asset)
    if not m:
        die('%s \u7684 ASSET \u5340\u584a\u627e\u4e0d\u5230 ticker' % name)
    query = m.group(1)

    slug = name[:-5] if name.endswith('.html') else name
    for token, val in (('<!--@EN-HEAD@-->', en),
                       ('<!--@ZH-HEAD@-->', zh),
                       ('<!--@ASSET@-->', asset),
                       ('@QUERY@', query)):
        if tpl.count(token) != 1:
            die('\u7bc4\u672c\u88e1\u7684 %s \u4e0d\u662f\u6070\u597d\u4e00\u500b' % token)
        tpl = tpl.replace(token, val)

    # 產物開頭加註記,提醒不要手改
    tpl = tpl.replace('<html lang="en">',
                      (AUTOGEN % name) + '\n<html lang="en">', 1)

    # 硬規則自檢:產物裡不得出現日期
    bad = re.search(r'20\d{2}-\d{2}-\d{2}', tpl)
    if bad:
        die('%s \u7684\u7522\u7269\u51fa\u73fe\u65e5\u671f\uff1a%s' % (name, bad.group(0)))
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

    changed = []
    for n in names:
        out = build(n, read(os.path.join(DATADIR, n)), tpl)
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


if __name__ == '__main__':
    main()

