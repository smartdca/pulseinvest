# -*- coding: utf-8 -*-
"""
DCAcafé 連結與版號守門員
────────────────────────────────────────────────────────────────
由 GitHub Actions 每次推送時執行。抓到違規就讓建置失敗、擋下這次推送。

擋三件事:

  ① 寫死指向「有中文版的頁面」的連結
     中文使用者點下去會掉到英文版。正確做法是走 window.dcaHref()
     (它在 chrome.js,判斷邏輯全站只有一份)。

  ② 共用檔的版號在各頁面不一致
     同一支檔被當成兩個不同檔案抓兩份,結果是「某些頁面拿到新版、
     某些拿到舊版」,症狀會是「改好了一半」,非常難查。

  ③ 版號字串帶日期
     站台硬規則:任何檔案不出現日期,包含藏在版號裡的。

用法:python3 scripts/check-links.py
     全部通過印一行 OK;有問題印出檔名行號並以 exit code 1 結束。
────────────────────────────────────────────────────────────────
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 掃描範圍:會產生連結的檔案。asset/ 與 zh/ 底下是產物,由範本決定,不重複掃。
SCAN_DIRS = ['', 'scripts', 'js']
SKIP_DIRS = {'asset', 'zh', 'node_modules', '.git', '.github', 'blog', 'assets-data'}
SCAN_EXT = ('.html', '.js', '.py')

# 有中文版的頁面。這份清單的真正來源是 chrome.js 的 ZH_READY(由 CI 維護),
# 這裡只取「根目錄頁面」那幾支當作靜態檢查的依據,資產頁與部落格另外用樣式比對。
ZH_PAGES = ['trending.html', 'insights.html', 'privacy.html', 'learn.html', 'backtest.html']

# 這些寫法代表已經過語言判斷,不算違規
SAFE_TOKENS = ('dcaHref', 'LHREF', 'fhref(', 'langHref', 'data-href')

# 刻意寫死、且確認安全的地方,在那一行或前三行內加上 lang-ok 註記就會跳過。
# 只有兩種情況可以用:
#   (a) 相對路徑本來就會跟著語言走(例如 /zh/insights.html 連 blog/x.html)
#   (b) 靜態 href 只是備援,JS 在顯示前會用 dcaHref 覆寫
# 加註記時務必在旁邊寫清楚是哪一種,否則下一個人無從判斷。
OPT_OUT = 'lang-ok'

# 有中文版的連結樣式
LINK_RE = re.compile(
    r'''(?:href\s*=\s*["'`]|location\.href\s*=\s*["'`]|location\.assign\(["'`]|window\.open\(["'`])'''
    r'''(/?(?:%s|asset/[\w{}$.-]+\.html|blog/[\w{}$.-]+\.html)[^"'`]*)'''
    % '|'.join(p.replace('.', r'\.') for p in ZH_PAGES)
)

VER_RE = re.compile(r'(?:src|href)="([^"?]*(?:/|^)(?:js/[\w.-]+\.js|css/[\w.-]+\.css|chrome\.js|assets\.js))(\?v=([\w.]+))?"')
DATE_RE = re.compile(r'\?v=\d{6,}')


def iter_files():
    for d in SCAN_DIRS:
        full = os.path.join(ROOT, d) if d else ROOT
        if not os.path.isdir(full):
            continue
        for name in sorted(os.listdir(full)):
            path = os.path.join(full, name)
            if os.path.isdir(path):
                continue
            if name.endswith(SCAN_EXT):
                yield path


def rel(path):
    return os.path.relpath(path, ROOT)


def check():
    problems = []
    versions = {}          # 版號值 → [出處]
    missing_ver = []

    for path in iter_files():
        try:
            src = io.open(path, encoding='utf-8').read()
        except Exception:
            continue
        lines = src.split('\n')

        # ── ① 寫死的連結 ──
        for m in LINK_RE.finditer(src):
            ln = src[:m.start()].count('\n') + 1
            line = lines[ln - 1]
            if any(tok in line for tok in SAFE_TOKENS):
                continue
            near = '\n'.join(lines[max(0, ln - 4):ln])
            if OPT_OUT in near:
                continue
            problems.append(
                '%s:%d  \u5beb\u6b7b\u7684\u9023\u7d50 %s\n'
                '        \u2192 \u6539\u7528 dcaHref()\uff0c\u6216\u52a0 data-href \u4ea4\u7d66 syncNavHrefs()'
                % (rel(path), ln, m.group(1)))

        # ── ②③ 版號 ──
        # 只掃 .html / .py:版號是寫在 <script src>/<link href> 上的,
        # .js 檔裡出現的那些是註解文字,不是真的引用。
        if not path.endswith(('.html', '.py')):
            continue
        for m in VER_RE.finditer(src):
            ln = src[:m.start()].count('\n') + 1
            asset, ver = m.group(1), m.group(3)
            if ver is None:
                missing_ver.append('%s:%d  %s \u6c92\u6709\u7248\u865f' % (rel(path), ln, asset))
            else:
                versions.setdefault(ver, []).append('%s:%d' % (rel(path), ln))

        for m in DATE_RE.finditer(src):
            ln = src[:m.start()].count('\n') + 1
            problems.append(
                '%s:%d  \u7248\u865f\u5e36\u65e5\u671f %s\n'
                '        \u2192 \u6539\u6210\u7d14\u6578\u5b57\uff0c\u4f8b\u5982 ?v=5'
                % (rel(path), ln, m.group(0)))

    problems += missing_ver

    if len(versions) > 1:
        detail = '\n'.join(
            '        ?v=%s  \u2190 %s' % (v, ', '.join(where[:4]) + (' \u2026' if len(where) > 4 else ''))
            for v, where in sorted(versions.items()))
        problems.append(
            '\u5171\u7528\u6a94\u7684\u7248\u865f\u4e0d\u4e00\u81f4\uff0c\u5168\u7ad9\u5fc5\u9808\u540c\u4e00\u500b\u503c\uff1a\n' + detail)

    return problems, versions


def main():
    problems, versions = check()
    if problems:
        print('[check-links] \u2717 \u767c\u73fe %d \u500b\u554f\u984c\uff0c\u5df2\u64cb\u4e0b\u9019\u6b21\u63a8\u9001\uff1a\n' % len(problems))
        for p in problems:
            print('  ' + p)
        print('\n  \u898f\u5247\u8aaa\u660e\u898b HANDOFF_\u8cc7\u7522\u9801\u4ea4\u4ed8\u7269\u8b8a\u66f4.md')
        sys.exit(1)
    v = list(versions.keys())[0] if versions else '(\u7121)'
    print('[check-links] \u2713 \u9023\u7d50\u5168\u90e8\u8d70\u8a9e\u8a00\u5224\u65b7\uff1b\u5168\u7ad9\u5171\u7528\u6a94\u7248\u865f\u7d71\u4e00\u70ba ?v=%s' % v)


if __name__ == '__main__':
    main()
