# -*- coding: utf-8 -*-
"""
DCAcafé 連結與版號守門員
────────────────────────────────────────────────────────────────
由 GitHub Actions 每次推送時執行。抓到違規就讓建置失敗、擋下這次推送。

設計原則：不猜「哪種寫法是錯的」，而是拿實際存在的檔案來對。
前者要靠人想得到每一種錯法（泡泡頁的連結就是用字串拼接繞過去的）；
後者只問客觀事實——這個網址指得到東西嗎？該有中文版的有沒有帶前綴？

擋七件事：

  ① 連結指向不存在的檔案
     拆頁、改檔名、刪檔之後忘了改連結，這裡會抓到。

  ② 已經拆成獨立頁面的舊錨點（例如 /index.html#backtest）
     頁面還在，但那個區塊早就搬走了，連過去只會停在首頁。

  ③ 指向「有中文版的頁面」卻沒經過語言判斷
     中文使用者點下去會掉到英文版。正確做法是走 window.dcaHref()
     （它在 chrome.js，判斷邏輯全站只有一份）。

  ④ 共用檔的版號不一致、或沒帶版號
     同一支檔被當成兩個不同檔案抓兩份，症狀是「改好了一半」，很難查。

  ⑤ 版號字串帶日期
     站台硬規則：任何檔案不出現日期，包含藏在版號裡的。

  ⑦ 雙語來源頁用了相對路徑
     有 <!--ZH-HEAD--> 區塊的頁面會被複製一份到 /zh/ 底下。
     那份的所在目錄深了一層，css/main.css 會被解讀成 /zh/css/main.css——
     檔案在根目錄確實存在，所以 ⑥ 檢查不出來，線上卻是整頁沒有樣式。
     實際發生過：首頁改成雙語當天，中文版變成一堆純文字。
     這一條要求雙語來源頁的資源路徑一律從站根寫起。

  ⑥ script / link 指向不存在的 JS 或 CSS
     ① 只看得到「頁面之間的連結」，看不到「頁面載入的檔案」。
     實際發生過：index.html 已經指向一支還沒上傳的 js，CI 全綠放行，
     線上是 404、功能完全沒反應，一路到實機才發現。
     這一條把那個缺口補起來——引用了就必須真的存在。

用法：python3 scripts/check-links.py
     全部通過印一行 OK；有問題印出檔名行號並以 exit code 1 結束。

刻意寫死且確認安全的地方，在那一行或前三行加上 lang-ok 註記可跳過，
但務必在旁邊寫清楚理由。
────────────────────────────────────────────────────────────────
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 掃描範圍：會產生連結的來源檔。
# 產物不掃（asset/ 由範本決定、zh/ 由 build-i18n 決定、blog/ 由 generate blog 決定）——
# 掃了只會把同一個問題重複報很多次，真正該修的是產生它們的來源檔。
SCAN_DIRS = ['', 'scripts', 'js']
SCAN_EXT = ('.html', '.js', '.py')
# 這支自己不掃：它的內文就是一堆「錯誤範例」，掃自己只會誤報。
SKIP_NAMES = {'node_modules', '.git', 'check-links.py'}

# 這些行裡的網址本來就該寫死，不是連結：
#   canonical / hreflang / og:url  → 給搜尋引擎的宣告，必須是絕對且固定的
#   LANG_PATHS 之類的語言對照表    → 它本身就是「中英兩個網址」的定義
SKIP_LINE_TOKENS = ('canonical', 'hreflang', 'og:url', 'LANG_PATHS')

# chrome.js 裡由 CI 維護的兩份清單（ZH_READY / FOOTER-ASSETS）不掃：
# 那是「哪些頁有中文版」「頁尾要列哪些資產」的資料定義，不是連結，
# 而且內容由 build-i18n.py 依實際檔案產生，不可能寫錯。
SKIP_BLOCKS = [('ZH_READY-ASSETS-START', 'ZH_READY-ASSETS-END'),
               ('ZH_READY-BLOG-START', 'ZH_READY-BLOG-END'),
               ('FOOTER-ASSETS-START', 'FOOTER-ASSETS-END')]

# 已經拆成獨立頁面的舊錨點：頁面還在，但那個區塊早就搬走了
DEAD_ANCHORS = {
    '/index.html#backtest': '/backtest.html',
    '/index.html#learn': '/learn.html',
    '/#backtest': '/backtest.html',
    '/#learn': '/learn.html',
}

# 這些寫法代表已經過語言判斷。li() 是 chrome.js 的頁尾清單產生器，內部會走 fhref。
SAFE_TOKENS = ('dcaHref', 'LHREF', 'fhref(', 'langHref', 'data-href', 'li(')
OPT_OUT = 'lang-ok'

# 連結樣式。刻意寫得寬：字串拼接的情況只抓得到開頭那一段，
# 但開頭那一段（例如 '/asset/'）已經足夠判斷它指向哪個目錄。
LINK_RE = re.compile(
    r'''(?:href\s*=\s*["'`]|location\.href\s*=\s*["'`]|location\.assign\(["'`]|window\.open\(["'`])'''
    r'''(/[^"'`\s>]*)''')

# 網址不一定寫在 href= 上——也可能當參數傳進函式（chrome.js 的 li('/xxx.html')），
# 或放在陣列裡。所以連「長得像站內路徑的字串」本身都要掃，不管它出現在哪。
# 少了這一條，li('/index.html#backtest') 這種寫法會整個漏掉。
LITERAL_RE = re.compile(r'''["'`](/[\w/.-]*\.html(?:#[\w-]+)?)["'`]''')

# ⑦ 雙語來源頁的相對路徑。排除絕對路徑、外部網址、錨點、樣板變數與 data:。
RELASSET_RE = re.compile(r'\b(?:src|href)="(?!/|https?:|mailto:|tel:|#|\$\{|data:)([^"]+)"')
RELFETCH_RE = re.compile(r"""fetch\(\s*['"`](?!/|https?:|\$\{|data:)([^'"`]+)['"`]""")

VER_RE = re.compile(
    r'(?:src|href)="([^"?]*(?:js/[\w.-]+\.js|css/[\w.-]+\.css|chrome\.js|assets\.js))(\?v=([\w.]+))?"')
DATE_VER_RE = re.compile(r'\?v=\d{6,}')


def rel(path):
    return os.path.relpath(path, ROOT)


def iter_files():
    for d in SCAN_DIRS:
        full = os.path.join(ROOT, d) if d else ROOT
        if not os.path.isdir(full):
            continue
        for name in sorted(os.listdir(full)):
            if name in SKIP_NAMES:
                continue
            path = os.path.join(full, name)
            if os.path.isfile(path) and name.endswith(SCAN_EXT):
                yield path


def blanked(src):
    """把 CI 維護的資料區塊清空，避免把資料定義誤判成連結。"""
    for a, b in SKIP_BLOCKS:
        src = re.sub(re.escape(a) + r'.*?' + re.escape(b),
                     lambda m: '\n' * m.group(0).count('\n'), src, flags=re.S)
    return src


def asset_exists(src_path, asset):
    """script / link 指到的 JS 或 CSS 是不是真的存在。

    路徑有兩種寫法都合法，任一種找得到就算通過：
      /js/x.js   站根絕對路徑（文章頁、資產頁都在子目錄，只能這樣寫）
      js/x.js    相對路徑（首頁這種住在根目錄的檔案）

    範本檔（scripts/asset-template.html）產生出來的頁面不住在 scripts/，
    所以它寫的相對路徑要以站根去解——上面第一種嘗試已經涵蓋這個情況。

    含有樣板變數的字串（generate blog.py 的 f-string）直接放行：
    那不是一個確定的路徑，猜了只會誤報。
    """
    if not asset or '{' in asset or '}' in asset:
        return True
    if asset.startswith(('http://', 'https://', '//')):
        return True
    candidates = [
        os.path.join(ROOT, asset.lstrip('/')),
        os.path.join(os.path.dirname(src_path), asset.lstrip('/')),
    ]
    return any(os.path.isfile(c) for c in candidates)


def real_pages():
    """repo 裡實際存在的頁面路徑，例如 /index.html、/asset/btc.html。"""
    pages = set()
    for d in ['', 'asset', 'blog', 'zh',
              os.path.join('zh', 'asset'), os.path.join('zh', 'blog')]:
        full = os.path.join(ROOT, d) if d else ROOT
        if not os.path.isdir(full):
            continue
        for name in os.listdir(full):
            if name.endswith('.html'):
                prefix = (d.replace(os.sep, '/') + '/') if d else ''
                pages.add('/' + prefix + name)
    return pages


def zh_ready():
    """chrome.js 的 ZH_READY 清單——哪些頁面真的有中文版。"""
    chrome = os.path.join(ROOT, 'chrome.js')
    if not os.path.isfile(chrome):
        return set()
    src = io.open(chrome, encoding='utf-8').read()
    m = re.search(r'var ZH_READY = \[(.*?)\n  \];', src, re.S)
    if not m:
        return set()
    return set(re.findall(r"'(/[^']+)'", m.group(1)))


def check():
    problems = []
    pages = real_pages()
    zh = zh_ready()
    versions = {}
    seen = set()

    for path in iter_files():
        try:
            src = io.open(path, encoding='utf-8').read()
        except Exception:
            continue
        lines = src.split('\n')
        scan = blanked(src)

        found = [(m.start(), m.group(1)) for m in LINK_RE.finditer(scan)]
        found += [(m.start(), m.group(1)) for m in LITERAL_RE.finditer(scan)]
        for pos, url in sorted(set(found)):
            # 用 scan 數行號：blanked() 保留了換行數但字元位置會位移，
            # 拿 src 去數會對不上（曾經害行號全部偏掉 31 行）。
            ln = scan[:pos].count('\n') + 1
            line = lines[ln - 1]
            if OPT_OUT in '\n'.join(lines[max(0, ln - 4):ln]):
                continue
            if any(tok in line for tok in SKIP_LINE_TOKENS):
                continue

            bare = url.split('?')[0]
            if bare in DEAD_ANCHORS:
                problems.append(
                    '%s:%d  舊網址 %s\n'
                    '        → 那個區塊已經拆成獨立頁面，改成 %s'
                    % (rel(path), ln, url, DEAD_ANCHORS[bare]))
                continue

            page = bare.split('#')[0]
            if page == '/':
                page = '/index.html'      # 站根等同首頁，跟 chrome.js 的 hasZh 一致
            if page.endswith('/'):
                # 字串拼接：只看得到前綴，用目錄存在與否判斷
                if not os.path.isdir(os.path.join(ROOT, page.strip('/'))):
                    problems.append('%s:%d  指向不存在的目錄 %s' % (rel(path), ln, page))
                    continue
                needs_zh = any(z.startswith(page) for z in zh)
            elif page.endswith('.html'):
                if page not in pages:
                    key = (rel(path), page)
                    if key in seen:
                        continue
                    seen.add(key)
                    problems.append('%s:%d  指向不存在的檔案 %s' % (rel(path), ln, page))
                    continue
                needs_zh = page in zh
            else:
                continue

            if needs_zh and not page.startswith('/zh/'):
                if not any(tok in line for tok in SAFE_TOKENS):
                    problems.append(
                        '%s:%d  寫死的連結 %s（這頁有中文版）\n'
                        '        → 改用 window.dcaHref()，或加 data-href 交給 syncNavHrefs()'
                        % (rel(path), ln, page))

        # ⑦ 有 ZH-HEAD 區塊 = 這頁會被複製到 /zh/ 底下,資源路徑必須從站根寫起。
        # 用 ZH-HEAD 當判斷依據而不是另外維護一份清單:那個區塊本來就是「這頁有中文版」的標記,
        # 新增雙語頁面時不會忘了同步。
        if path.endswith('.html') and '<!--ZH-HEAD' in src:
            for rx, kind in ((RELASSET_RE, '資源'), (RELFETCH_RE, 'fetch')):
                for m in rx.finditer(src):
                    ln = src[:m.start()].count('\n') + 1
                    if OPT_OUT in '\n'.join(lines[max(0, ln - 4):ln]):
                        continue
                    problems.append(
                        '%s:%d  %s用了相對路徑 %s（這頁有中文版）\n'
                        '        → 改成從站根寫起（前面加一條斜線）。'
                        '中文版在 /zh/ 底下,相對路徑會被解成 /zh/%s 而找不到。'
                        % (rel(path), ln, kind, m.group(1), m.group(1)))


        # 版號只掃 .html / .py（.js 裡出現的是註解文字，不是真的引用）
        if not path.endswith(('.html', '.py')):
            continue
        for m in VER_RE.finditer(src):
            ln = src[:m.start()].count('\n') + 1
            asset, ver = m.group(1), m.group(3)

            # 引用了就必須真的存在。少了這一條，「HTML 改好了、檔案忘了傳」會全綠通過，
            # 線上是 404，而且畫面上通常沒有任何錯誤提示，只是功能安靜地不動。
            if not asset_exists(path, asset):
                problems.append(
                    '%s:%d  載入不存在的檔案 %s\n'
                    '        → 檔案沒上傳，或路徑／檔名不符（線上會是 404）'
                    % (rel(path), ln, asset))

            if ver is None:
                problems.append('%s:%d  %s 沒有版號' % (rel(path), ln, asset))
            else:
                versions.setdefault(ver, []).append('%s:%d' % (rel(path), ln))
        for m in DATE_VER_RE.finditer(src):
            ln = src[:m.start()].count('\n') + 1
            problems.append(
                '%s:%d  版號帶日期 %s\n        → 改成純數字，例如 ?v=5'
                % (rel(path), ln, m.group(0)))

    if len(versions) > 1:
        detail = '\n'.join(
            '        ?v=%s  ← %s' % (v, ', '.join(w[:4]) + (' …' if len(w) > 4 else ''))
            for v, w in sorted(versions.items()))
        problems.append('共用檔的版號不一致，全站必須同一個值：\n' + detail)

    return problems, versions


def main():
    problems, versions = check()
    if problems:
        print('[check-links] ✗ 發現 %d 個問題，已擋下這次推送：\n' % len(problems))
        for p in problems:
            print('  ' + p)
        print('\n  規則說明見 HANDOFF_連結與版號規則.md')
        sys.exit(1)
    v = sorted(versions)[0] if versions else '(無)'
    print('[check-links] ✓ 連結都指得到、載入的檔案都在；共用檔版號統一為 ?v=%s' % v)


if __name__ == '__main__':
    main()

# ── 觸發用。重跑(Re-run)會回到當時的檔案狀態,對已修好的檔案無效,
#    所以要靠一次新的 commit 讓 Actions 在最新狀態上重新執行。
