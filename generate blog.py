#!/usr/bin/env python3
"""
generate_blog.py
Reads posts.json and generates:
  - blog/[slug].html  for each post
  - blog/index.json   a lightweight feed for the homepage card widget
"""

import json
import os
import re
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent
POSTS_FILE = ROOT / "posts.json"
BLOG_DIR = ROOT / "blog"
BLOG_DIR.mkdir(exist_ok=True)
ZH_BLOG_DIR = ROOT / "zh" / "blog"
ZH_BLOG_DIR.mkdir(parents=True, exist_ok=True)

# ── Load posts ─────────────────────────────────────────────────────────────
with open(POSTS_FILE, encoding="utf-8") as f:
    posts = json.load(f)

# Sort newest first
posts.sort(key=lambda p: p["date"], reverse=True)

# ── Shared CSS ─────────────────────────────────────────────────────────────
SHARED_CSS = """
:root{--bg:#fbfbfd;--bg2:#f5f5f7;--surface:#fff;--border:#e6e6ea;--ink:#1d1d1f;--ink2:#6e6e73;--ink3:#9a9a9f;--accent:#c8813a;--al:#faf3e8;--green:#1c7a45;--gl:#e6f5ec;--font-sans:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Helvetica Neue',Arial,sans-serif;--sh:0 1px 2px rgba(0,0,0,.04),0 8px 24px rgba(0,0,0,.05);--sh-lg:0 4px 12px rgba(0,0,0,.05),0 16px 48px rgba(0,0,0,.08);}
*{box-sizing:border-box;margin:0;padding:0;}
body{background:var(--bg);color:var(--ink);font-family:var(--font-sans);font-size:16px;-webkit-font-smoothing:antialiased;letter-spacing:-.1px;}
nav{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:var(--surface);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:100;box-shadow:0 1px 8px rgba(0,0,0,.05);}
.nav-logo{display:flex;align-items:center;text-decoration:none;}
.lang-bar-nav{display:flex;gap:8px;}
.wrap{max-width:680px;margin:0 auto;padding:0 22px 80px;}
.article-hero{padding:38px 0 0;}
.article-category{display:inline-flex;align-items:center;gap:6px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--accent);font-weight:650;font-family:var(--font-sans);margin-bottom:15px;}
.article-category::before{content:'';width:18px;height:1.5px;background:var(--accent);display:inline-block;}
.breadcrumb{display:block;font-size:13px;color:var(--ink2);text-decoration:none;font-family:var(--font-sans);margin-bottom:13px;}
.breadcrumb:active{color:var(--accent);}
.article-title{font-family:var(--font-sans);font-weight:650;font-size:clamp(24px,5vw,34px);line-height:1.15;letter-spacing:-.6px;margin-bottom:15px;}
.article-title em{font-style:normal;color:var(--accent);}
.article-subtitle{font-size:16px;line-height:1.6;color:var(--ink2);margin-bottom:24px;}
.article-meta{display:flex;align-items:center;gap:10px;padding:15px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin-bottom:30px;flex-wrap:wrap;}
.meta-date{font-size:12px;color:var(--ink3);font-family:var(--font-sans);font-variant-numeric:tabular-nums;}
.meta-date-label{opacity:.7;margin-right:2px;}
.meta-tag{font-size:11px;font-weight:600;font-family:var(--font-sans);background:var(--al);color:var(--accent);padding:3px 10px;border-radius:20px;}
.meta-read{font-size:12px;color:var(--ink3);font-family:var(--font-sans);font-variant-numeric:tabular-nums;}
.lang-bar{display:flex;gap:8px;margin-bottom:30px;}
.lang-btn{padding:6px 16px;border-radius:20px;border:1px solid var(--border);background:transparent;font-size:12px;font-weight:500;color:var(--ink2);cursor:pointer;font-family:var(--font-sans);transition:all .25s cubic-bezier(.4,0,.2,1);}
.lang-btn.active{background:var(--ink);color:#fff;border-color:var(--ink);}
.hero-img{width:100%;border-radius:20px;overflow:hidden;margin-bottom:34px;aspect-ratio:16/9;}
.hero-img img{width:100%;height:100%;object-fit:cover;display:block;}
.article-body{font-size:16px;line-height:1.78;color:#3a3a3c;}
.article-body p{margin-bottom:19px;}
.article-body strong{font-weight:600;color:var(--ink);}
.article-body h2{font-family:var(--font-sans);font-weight:650;font-size:22px;line-height:1.25;margin:38px 0 15px;letter-spacing:-.4px;color:var(--ink);}
.article-body h2 em{font-style:normal;color:var(--accent);}
.pullquote{border-left:3px solid var(--accent);padding:15px 19px;margin:30px 0;background:var(--al);border-radius:0 14px 14px 0;}
.pullquote p{font-family:var(--font-sans);font-weight:650;font-size:18px;line-height:1.5;color:var(--ink);margin:0;}
.pullquote p em{font-style:normal;color:var(--accent);}
.inline-img{width:100%;border-radius:14px;overflow:hidden;margin:30px 0;aspect-ratio:16/9;}
.inline-img img{width:100%;height:100%;object-fit:cover;display:block;}
.source-note{font-size:11px;color:var(--ink3);font-family:var(--font-sans);margin-top:34px;padding-top:21px;border-top:1px solid var(--border);}
.article-footer{margin-top:42px;padding-top:29px;border-top:1px solid var(--border);}
.disclaimer{margin-top:20px;font-size:11px;color:var(--ink3);line-height:1.6;font-family:var(--font-sans);}
.zh-content{display:none;}
.en-content{display:block;}
#shareToast{position:fixed;bottom:86px;left:50%;transform:translateX(-50%) translateY(20px);background:rgba(29,29,31,.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#fff;padding:11px 21px;border-radius:24px;font-size:13px;font-family:var(--font-sans);opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;z-index:1000;box-shadow:0 4px 20px rgba(0,0,0,.2);}
#shareToast.show{opacity:1;transform:translateX(-50%) translateY(0);}
.tab-bar{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);z-index:200;display:flex;align-items:center;background:rgba(29,29,31,.78);backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);border-radius:44px;padding:5px 6px;gap:2px;width:fit-content;box-shadow:0 12px 36px rgba(0,0,0,.28),0 2px 8px rgba(0,0,0,.16),inset 0 1px 0 rgba(255,255,255,.08);}
.tab-btn{flex:none;padding:8px 26px;border:none;background:transparent;border-radius:36px;font-size:11px;font-weight:500;color:rgba(255,255,255,.5);cursor:pointer;transition:all .25s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;align-items:center;gap:3px;white-space:nowrap;-webkit-tap-highlight-color:transparent;}
.tab-btn.active{background:rgba(255,255,255,.16);color:#fff;}
.tab-btn svg{width:18px;height:18px;}
.tab-btn.liked svg{fill:var(--accent);stroke:var(--accent);}
.tab-like-count{font-variant-numeric:tabular-nums;}
.site-footer{background:var(--bg2);border-top:1px solid var(--border);padding:30px 20px 44px;margin-top:34px;}
.site-footer-inner{max-width:520px;margin:0 auto;}
.site-footer-top{display:flex;flex-direction:column;gap:12px;margin-bottom:22px;background:var(--surface);padding:15px 17px;border-radius:14px;box-shadow:var(--sh);}
.footer-brand{display:flex;align-items:center;flex-shrink:0;}
.footer-brand span{color:var(--accent);}
.footer-links{display:flex;gap:20px;flex-wrap:wrap;align-items:center;}
.footer-links a{font-size:14px;color:var(--ink2);text-decoration:none;}
.footer-links a:hover{color:var(--ink);}
.site-footer-top a{-webkit-text-decoration:none;text-decoration:none;background:transparent !important;color:var(--ink2) !important;font-size:14px;white-space:nowrap;}
.footer-divider{height:1px;background:var(--border);margin-bottom:16px;}
.footer-bottom{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;}
.footer-copy{font-size:11px;color:var(--ink3);font-family:var(--font-sans);}
.footer-disclaimer{font-size:11px;color:var(--ink3);line-height:1.6;margin-top:12px;}
.ticker-row-wrap{margin:0 0 24px;}
.ticker-row-label{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--ink3);font-family:var(--font-sans);font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:5px;}
.ticker-row-label .tooltip-wrap{vertical-align:middle;}
.ticker-row{display:flex;gap:6px;overflow-x:auto;-ms-overflow-style:none;scrollbar-width:none;}
.ticker-row::-webkit-scrollbar{display:none;}
.dca-chip{display:inline-flex;align-items:center;gap:5px;flex-shrink:0;max-width:110px;font-size:12px;font-weight:600;font-family:var(--font-sans);background:var(--bg2);color:var(--ink2);padding:5px 12px;border-radius:20px;text-decoration:none;border:1px solid var(--border);transition:background .2s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dca-chip:active{background:var(--al);}
.dca-chip-score{font-variant-numeric:tabular-nums;font-weight:650;}
.dca-chip.triggered{background:var(--gl);color:var(--green);border-color:transparent;}
.dca-chip.triggered .dca-chip-score{color:var(--green);}
.dca-chip.unavailable{opacity:.55;}
.dca-chip.unavailable .dca-chip-score{font-weight:500;}
.footer-spacer{height:96px;}
.listen-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.listen-btn{display:inline-flex;align-items:center;gap:6px;background:var(--al);color:var(--accent);border:none;border-radius:20px;padding:6px 13px;font-size:12px;font-weight:600;font-family:var(--font-sans);cursor:pointer;-webkit-tap-highlight-color:transparent;margin-left:auto;}
.listen-btn svg{width:14px;height:14px;}
.highlight-active{background:linear-gradient(transparent 60%, var(--al) 60%);}
.listen-bar{position:fixed;bottom:26px;left:50%;transform:translate(-50%,120px);opacity:0;pointer-events:none;z-index:300;display:flex;align-items:center;gap:2px;background:rgba(29,29,31,.86);backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);border-radius:30px;padding:8px 10px 8px 16px;box-shadow:0 12px 36px rgba(0,0,0,.28),0 2px 8px rgba(0,0,0,.16),inset 0 1px 0 rgba(255,255,255,.08);transition:transform .3s cubic-bezier(.4,0,.2,1),opacity .3s;}
.listen-bar.show{transform:translate(-50%,0);opacity:1;pointer-events:auto;}
.listen-title{font-size:12px;color:rgba(255,255,255,.55);max-width:100px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-right:8px;}
.listen-ctrl-btn{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:transparent;border:none;color:#fff;cursor:pointer;-webkit-tap-highlight-color:transparent;}
.listen-ctrl-btn.play-pause{width:36px;height:36px;background:rgba(255,255,255,.15);}
.listen-ctrl-btn svg{width:16px;height:16px;}
.listen-ctrl-btn.play-pause svg{width:18px;height:18px;}
.speed-btn{font-size:11px;font-weight:600;color:rgba(255,255,255,.75);background:rgba(255,255,255,.1);border:none;border-radius:14px;padding:5px 9px;margin-left:2px;cursor:pointer;font-family:var(--font-sans);min-width:34px;}
.voice-btn{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:transparent;border:none;color:#fff;cursor:pointer;-webkit-tap-highlight-color:transparent;}
.voice-btn svg{width:15px;height:15px;}
.listen-close{color:rgba(255,255,255,.4);margin-left:4px;}
.voice-panel{position:fixed;bottom:82px;left:50%;transform:translateX(-50%);z-index:301;background:rgba(29,29,31,.94);backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);border-radius:16px;padding:8px;box-shadow:0 12px 36px rgba(0,0,0,.28);width:260px;max-height:280px;overflow-y:auto;display:none;}
.voice-panel.show{display:block;}
.voice-panel-title{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.4);padding:8px 10px 6px;}
.voice-option{display:flex;align-items:center;justify-content:space-between;padding:9px 10px;border-radius:10px;font-size:13px;color:rgba(255,255,255,.85);cursor:pointer;-webkit-tap-highlight-color:transparent;}
.voice-option:active{background:rgba(255,255,255,.08);}
.voice-option.selected{background:rgba(200,129,58,.25);color:#fff;}
.voice-option.selected::after{content:'✓';color:var(--accent);font-weight:700;margin-left:8px;}
.voice-option-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tooltip-wrap{position:relative;display:inline-flex;align-items:center;}
.tooltip-icon{cursor:pointer;font-size:16px;line-height:1;user-select:none;-webkit-user-select:none;}
.tooltip-bubble{
  display:none;position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);
  background:#1d1d1f;color:#f5f5f7;font-size:12px;line-height:1.6;
  padding:11px 15px;border-radius:12px;width:240px;
  border:none;
  box-shadow:var(--sh-lg);
  font-family:var(--font-sans);z-index:500;
}
.tooltip-bubble::after{
  content:'';position:absolute;top:100%;left:var(--arrow-left, 50%);transform:translateX(-50%);
  border:6px solid transparent;border-top-color:#1d1d1f;
}
.tooltip-bubble.arrow-flip::after{
  top:auto;bottom:100%;
  border-top-color:transparent;border-bottom-color:#1d1d1f;
}
.tooltip-wrap.open .tooltip-bubble{display:block;}

/* ═══════════════════════════════════════════════════════════════
   桌機版(2026-08-20新增)—— 這支範本原本只有手機版。跟Henry確認過的
   方向:頁首/頁尾改用chrome.js共用元件(HTML結構那邊處理,這裡只管CSS);
   底部兩條膠囊列(讚/分享、朗讀控制)維持浮動在畫面下方,不搬去側邊欄,
   只是桌機版重新調整樣式——這是風險最低的做法,語音面板的定位邏輯
   全部沒有改動,不用重新驗證那一大段複雜的JS。
   ═══════════════════════════════════════════════════════════════ */
@media (min-width: 960px) {
  /* 內文閱讀寬度:不比照首頁1100px那種寬版,文章本身需要一個「舒適閱讀
     寬度」上限,太寬的一行字閱讀體驗反而差。 */
  .wrap { max-width: 720px; padding: 0 40px 100px; }
  .article-hero { padding: 56px 0 0; }
  .article-category { font-size: 12px; letter-spacing: 2.5px; margin-bottom: 20px; }
  .breadcrumb { display: none; }
  /* DCA Score chips桌機版明確強制同一行,不換行(2026-08-20新增)——
     桌機閱讀欄寬度(720px)已經足夠容納最多3個chip,不需要像手機那樣
     靠overflow-x:auto橫向捲動。2026-08-20再修正:「DCA SCORE」標籤本身
     跟後面的chip列,原本是各自一行(label先, chip另起一行),Henry要的是
     標籤+chip全部擠在同一排——.ticker-row-wrap改成flex row,標籤不換行
     縮到內容寬度,chip列接在後面。 */
  .ticker-row-wrap { display: flex; align-items: center; gap: 14px; }
  .ticker-row-label { margin-bottom: 0; flex-shrink: 0; white-space: nowrap; }
  .ticker-row { flex-wrap: nowrap; overflow-x: visible; }
  .dca-chip { max-width: none; }
  .article-title { font-size: 42px; line-height: 1.14; letter-spacing: -.8px; margin-bottom: 20px; }
  .article-subtitle { font-size: 19px; line-height: 1.65; margin-bottom: 30px; }
  .article-meta { padding: 18px 0; margin-bottom: 36px; }
  .meta-date, .meta-read { font-size: 13px; }
  .meta-tag { font-size: 12px; padding: 4px 12px; }
  .hero-img { margin-bottom: 42px; }
  .article-body { font-size: 18px; line-height: 1.85; }
  .article-body p { margin-bottom: 24px; }
  .article-body h2 { font-size: 27px; margin: 48px 0 18px; }
  .pullquote { padding: 20px 26px; margin: 38px 0; }
  .pullquote p { font-size: 21px; }

  /* 讚/分享膠囊列:維持浮動在畫面下方,只是桌機版稍微放大、留更多下緣
     間距(桌機沒有iPhone底部安全區域的問題,不用貼那麼緊)。 */
  .tab-bar { bottom: 32px; padding: 7px 8px; }
  .tab-btn { padding: 10px 30px; font-size: 12px; }

  /* 朗讀控制列:同樣維持浮動+平常隱藏、點了才顯示(邏輯完全不動),
     只放大尺寸跟間距,桌機滑鼠操作需要的點擊區域比手指觸控更寬鬆。 */
  .listen-bar { bottom: 32px; padding: 10px 14px 10px 20px; gap: 4px; }
  .listen-title { font-size: 13px; max-width: 140px; margin-right: 10px; }
  .listen-ctrl-btn { width: 34px; height: 34px; }
  .listen-ctrl-btn.play-pause { width: 42px; height: 42px; }
  .speed-btn { font-size: 12px; padding: 6px 11px; }
}
"""

# ── Block renderer ─────────────────────────────────────────────────────────
def render_blocks(blocks, prefix):
    html = ""
    idx = 0
    for b in blocks:
        t = b["type"]
        if t == "p":
            html += f'<p id="{prefix}{idx}" class="listen-block">{b["content"]}</p>\n'
            idx += 1
        elif t == "h2":
            html += f'<h2 id="{prefix}{idx}" class="listen-block">{b["content"]}</h2>\n'
            idx += 1
        elif t == "pullquote":
            html += f'<div class="pullquote"><p>{b["content"]}</p></div>\n'
        elif t == "image":
            _isrc = b["src"] if b["src"].startswith("http") else "/blog/" + b["src"]
            html += f'<div class="inline-img"><img src="{_isrc}" alt="{b["alt"]}" loading="lazy"></div>\n'
        elif t == "source":
            html += f'<p class="source-note">{b["content"]}</p>\n'
    return html

# ── Generate article pages ─────────────────────────────────────────────────
for post in posts:
    slug = post["slug"]
    date_str = post["date"]
    
    body_en = render_blocks(post["body_en"], "en-")
    body_zh = render_blocks(post["body_zh"], "zh-")
    title_zh_js = post["title_zh"].replace("'", "\\'")
    subtitle_zh_js = post["subtitle_zh"].replace("'", "\\'")
    subtitle_en_js = post["subtitle_en"].replace("'", "\\'")
    title_en_js = post["title_en"].replace("'", "\\'")
    category_en_js = post["category_en"].replace("'", "\\'")
    tag_en_js = post["tag_en"].replace("'", "\\'")

    tickers = post.get("tickers", [])[:3]
    if tickers:
        chips = "".join(
            f'<a href="https://dcacafe.com/?ticker={t}" class="dca-chip" data-ticker="{t}" target="_blank" rel="noopener" onclick="if(typeof gtag===\'function\'){{gtag(\'event\',\'dca_score_chip_click\',{{article_slug:POST_SLUG,ticker:\'{t}\'}});}}">{t} <span class="dca-chip-score">--</span></a>'
            for t in tickers
        )
        ticker_row_html = f'<div class="ticker-row-wrap"><div class="ticker-row-label">DCA Score <span class="tooltip-wrap" onclick="toggleTooltip(this,event);event.stopPropagation();"><span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:var(--al);border:1px solid var(--accent);font-size:9px;font-weight:700;color:var(--accent);cursor:pointer;">?</span><span class="tooltip-bubble score-info-bubble" style="width:220px;text-transform:none;letter-spacing:normal;font-weight:400;"></span></span></div><div class="ticker-row">{chips}</div></div>'
    else:
        ticker_row_html = ""

    hero_src = post['hero_image'] if post['hero_image'].startswith('http') else f"/blog/{post['hero_image']}"
    hero_abs = hero_src if hero_src.startswith('http') else 'https://dcacafe.com' + hero_src
    for lang in ("en", "zh"):
        html_lang = "zh-Hant" if lang == "zh" else "en"
        L_title = post["title_zh"] if lang == "zh" else post["title_en"]
        L_sub   = post["subtitle_zh"] if lang == "zh" else post["subtitle_en"]
        L_cat   = post["category_zh"] if lang == "zh" else post["category_en"]
        L_tag   = post["tag_zh"] if lang == "zh" else post["tag_en"]
        own_url = f"https://dcacafe.com/{'zh/' if lang == 'zh' else ''}blog/{slug}.html"
        locale_meta = ('<meta property="og:locale" content="zh_TW">\n<meta property="og:locale:alternate" content="en_US">'
                       if lang == "zh" else '<meta property="og:locale" content="en_US">')
        hreflang_links = ('<link rel="alternate" hreflang="en" href="https://dcacafe.com/blog/%s.html">\n'
                          '<link rel="alternate" hreflang="zh-Hant" href="https://dcacafe.com/zh/blog/%s.html">\n'
                          '<link rel="alternate" hreflang="x-default" href="https://dcacafe.com/blog/%s.html">') % (slug, slug, slug)
        dca_lang_script = "<script>window.DCA_LANG='%s';window.DCA_LANG_LOCKED=true;</script>" % lang
        html = f"""<!DOCTYPE html>
<html lang="{html_lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!-- 桌機預覽開關(2026-08-20新增,跟index.html/insights.html同一套機制,
     共用localStorage key,三頁狀態互通):網址加 ?desktop=1 → 強制 1200
     版面;?desktop=0 → 還原手機版。必須放在viewport之後、CSS之前。 -->
<script>
(function(){{
  try{{
    var s = location.search || '';
    if(/[?&]desktop=0(\\b|$)/.test(s)){{ localStorage.removeItem('forceDesktop'); }}
    else if(/[?&]desktop=1(\\b|$)/.test(s)){{ localStorage.setItem('forceDesktop','1'); }}
    if(localStorage.getItem('forceDesktop')==='1'){{
      var vp = document.querySelector('meta[name="viewport"]');
      if(vp){{ vp.setAttribute('content','width=1200'); }}
      document.documentElement.setAttribute('data-preview-desktop','1');
    }}
  }}catch(e){{}}
}})();
</script>
<title>{L_title} — DCAcafé</title>
<meta name="description" content="{L_sub}">
<link rel="canonical" href="{own_url}">
{hreflang_links}
{locale_meta}
{dca_lang_script}
<link rel="icon" type="image/png" href="/IMG_9104.png">
<link rel="apple-touch-icon" href="/IMG_9104.png">
<meta property="og:type" content="article">
<meta property="og:url" content="{own_url}">
<meta property="og:title" content="{L_title}">
<meta property="og:description" content="{L_sub}">
<meta property="og:image" content="{hero_abs}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{L_title}">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-Z1JDQB1HTQ"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){{dataLayer.push(arguments);}}
  gtag('js', new Date());
  gtag('config', 'G-Z1JDQB1HTQ');
</script>
<meta name="twitter:description" content="{L_sub}">
<meta name="twitter:image" content="{hero_abs}">
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "{L_title}",
  "description": "{L_sub}",
  "image": "{hero_abs}",
  "datePublished": "{date_str}",
  "dateModified": "{date_str}",
  "author": {{
    "@type": "Organization",
    "name": "DCAcafé",
    "url": "https://dcacafe.com/"
  }},
  "publisher": {{
    "@type": "Organization",
    "name": "DCAcafé",
    "logo": {{
      "@type": "ImageObject",
      "url": "https://dcacafe.com/IMG_9104.png"
    }}
  }},
  "mainEntityOfPage": {{
    "@type": "WebPage",
    "@id": "{own_url}"
  }}
}}
</script>
<style>{SHARED_CSS}</style>
</head>
<body>
<!-- 共用頁首(chrome.js注入)——2026-08-20改用共用元件,不再自己刻一份。
     以後chrome.js改一次(例如加選單項目),首頁/insights.html/所有文章頁
     會一起套用,不用三個地方各改一次。 -->
<div id="siteHeader"></div>
<div class="wrap">
  <article>
    <div class="article-hero">
      <a href="/insights.html" class="breadcrumb" id="breadcrumb">← Insights</a>
      <div class="article-category" id="cat">{L_cat}</div>
      <h1 class="article-title" id="ttl">{L_title}</h1>
      <p class="article-subtitle" id="sub">{L_sub}</p>
      <div class="article-meta">
        <span class="meta-date"><span class="meta-date-label" id="dateLabel">📅</span> {date_str}</span>
        <span class="meta-tag" id="tag">{L_tag}</span>
        <button class="listen-btn" onclick="startListen()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
          <span id="listenBtnLabel">Listen</span>
        </button>
        <span class="meta-read" id="read">{post['read_time']} min</span>
      </div>
      {ticker_row_html}
    </div>
    <div class="hero-img">
      <img src="{hero_src}" alt="{L_title}" loading="eager">
    </div>
    <div class="en-content article-body">
{body_en}
    </div>
    <div class="zh-content article-body">
{body_zh}
    </div>
    {ticker_row_html}
    <div class="article-footer">
      <p class="disclaimer" id="articleDisclaimer">This article is for informational purposes only and does not constitute financial or investment advice. Past performance is not indicative of future results. · {post['hero_image_credit']}</p>
    </div>
  </article>
</div>
<!-- 共用頁尾(chrome.js注入,含安裝彈窗,不用另外刻一份installModal) -->
<div id="siteFooter"></div>

<div class="footer-spacer"></div>
<div class="tab-bar">
  <button class="tab-btn" id="likeBtn" onclick="toggleLike()" aria-label="Like">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
    <span id="likeLabel">Like</span><span class="tab-like-count" id="likeCount"></span>
  </button>
  <button class="tab-btn" onclick="sharePost()" aria-label="Share">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
    <span id="shareLabel">Share</span>
  </button>
</div>

<div class="listen-bar" id="listenBar">
  <span class="listen-title" id="listenTitle"></span>
  <button class="listen-ctrl-btn" onclick="skipParagraph(-1)" aria-label="Previous">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"></path></svg>
  </button>
  <button class="listen-ctrl-btn play-pause" id="playPauseBtn" onclick="togglePlayPause()" aria-label="Play/Pause">
    <svg id="playIcon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>
    <svg id="pauseIcon" viewBox="0 0 24 24" fill="currentColor" style="display:none"><path d="M6 5h4v14H6zm8 0h4v14h-4z"></path></svg>
  </button>
  <button class="listen-ctrl-btn" onclick="skipParagraph(1)" aria-label="Next">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"></path></svg>
  </button>
  <button class="speed-btn" id="speedBtn" onclick="cycleSpeed()">1x</button>
  <button class="voice-btn" onclick="toggleVoicePanel()" aria-label="Choose voice">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line></svg>
  </button>
  <button class="listen-ctrl-btn listen-close" onclick="stopListen()" aria-label="Close">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
  </button>
</div>
<div class="voice-panel" id="voicePanel">
  <div class="voice-panel-title" id="voicePanelTitle">Voice</div>
  <div id="voiceList"></div>
</div>
<script>
const POST_SLUG = '{slug}';
const PROXY_BASE = 'https://proxy-three-mu-47.vercel.app';

const zh={{
  cat:'{post['category_zh']}',
  ttl:'{title_zh_js}',
  sub:'{subtitle_zh_js}',
  tag:'{post['tag_zh']}',
  read:'{post['read_time']} min',
  like:'讚',
  share:'分享',
  copied:'已複製連結',
  breadcrumb:'← 投資見解',
  footerInsights:'投資見解',
  footerPrivacy:'隱私政策',
  footerCopy:'© 2026 DCAcafé 版權所有',
  footerDisclaimer:'DCAcafé 僅供參考，不構成任何投資建議。所有投資決策風險由使用者自行承擔。過去績效不代表未來結果。市場數據來源：Yahoo Finance。',
  articleDisclaimer:'本文僅供參考，不構成任何財務或投資建議。過去表現不代表未來結果。· 照片來源：André François McKenzie / Unsplash',
  scoreInfo:'DCA Score 是我們的獨家 AI 演算法，綜合市場技術面訊號（長期趨勢、超買超賣、回撤幅度、市場恐慌情緒）與部分資產的估值面數據，計算出的 0–100 分綜合指標，並持續透過研究反覆優化精進。'
}};
const en={{
  cat:'{category_en_js}',
  ttl:'{title_en_js}',
  sub:'{subtitle_en_js}',
  tag:'{tag_en_js}',
  read:'{post['read_time']} min',
  like:'Like',
  share:'Share',
  copied:'Link copied',
  breadcrumb:'← Insights',
  footerInsights:'Insights',
  footerPrivacy:'Privacy Policy',
  footerCopy:'© 2026 DCAcafé. All rights reserved.',
  footerDisclaimer:'DCAcafe is an informational tool only and does not constitute financial or investment advice. All investment decisions are made solely at your own risk. Past performance is not indicative of future results. Market data provided by Yahoo Finance.',
  articleDisclaimer:'This article is for informational purposes only and does not constitute financial or investment advice. Past performance is not indicative of future results. · {post['hero_image_credit']}',
  scoreInfo:'DCA Score is our proprietary AI algorithm — a 0–100 composite metric combining technical market signals (long-term trend, overbought/oversold, drawdown, market fear) with valuation data for eligible assets, continuously refined through ongoing research.'
}};

let currentLang = (window.DCA_LANG === 'zh') ? 'zh' : 'en';

if(typeof gtag === 'function'){{
  gtag('event', 'article_view', {{article_slug: POST_SLUG, lang: currentLang}});
}}

function applyLang(lang){{
  const isZh = lang === 'zh';
  document.querySelector('.en-content').style.display = isZh ? 'none' : 'block';
  document.querySelector('.zh-content').style.display = isZh ? 'block' : 'none';
  const d = isZh ? zh : en;
  document.getElementById('cat').textContent = d.cat;
  document.getElementById('ttl').textContent = d.ttl;
  document.getElementById('sub').textContent = d.sub;
  document.getElementById('tag').textContent = d.tag;
  document.getElementById('read').textContent = d.read;
  document.getElementById('likeLabel').textContent = d.like;
  document.getElementById('shareLabel').textContent = d.share;
  document.getElementById('breadcrumb').textContent = d.breadcrumb;
  document.getElementById('articleDisclaimer').textContent = d.articleDisclaimer;
  const listenBtnLabel = document.getElementById('listenBtnLabel');
  if(listenBtnLabel) listenBtnLabel.textContent = isZh ? '朗讀本文' : 'Listen';
  if(document.getElementById('listenBar').classList.contains('show')){{
    stopListen();
  }}
  document.querySelectorAll('.score-info-bubble').forEach(el => el.textContent = d.scoreInfo);
}}

// 2026-08-20改用chrome.js的hook機制(跟insights.html同一套模式)——
// chrome.js的語言鈕按下時會呼叫window.applyPageLang(lang),不再是這支
// 範本自己刻的setLang(lang,e)綁在自己的nav按鈕上(nav已經改用chrome.js)。
window.applyPageLang = applyLang;
applyLang(currentLang);

// 桌機限定(2026-08-20新增):nav在chrome.js的桌機覆寫裡是position:fixed,
// 脫離文件流——下面的.wrap需要補上對應的頂部留白,不然文章標題會被nav
// 蓋住。動態量測nav高度,不寫死px(比照insights.html/index.html同一套
// syncNavOffset模式)。chrome.js非同步注入nav,用短暫輪詢等它插入DOM。
function syncArticleNavOffset() {{
  const wrap = document.querySelector('.wrap');
  if (!wrap) return;
  if (window.innerWidth < 960) {{ wrap.style.paddingTop = ''; return; }}
  const nav = document.querySelector('#siteHeader nav');
  const navH = nav ? nav.getBoundingClientRect().height : 0;
  wrap.style.paddingTop = navH + 'px';
}}
function waitForNavThenSyncArticle(triesLeft) {{
  const nav = document.querySelector('#siteHeader nav');
  if (nav || triesLeft <= 0) {{ syncArticleNavOffset(); return; }}
  setTimeout(() => waitForNavThenSyncArticle(triesLeft - 1), 50);
}}
waitForNavThenSyncArticle(20);
let articleNavResizeTimer = null;
window.addEventListener('resize', () => {{
  clearTimeout(articleNavResizeTimer);
  articleNavResizeTimer = setTimeout(syncArticleNavOffset, 150);
}});

// ── Read-aloud ───────────────────────────────────────────────────────────
const synth = window.speechSynthesis;
let listenParas = [];
let listenIdx = 0;
let listenPlaying = false;
let listenSpeeds = [1, 1.25, 1.5, 0.75];
let listenSpeedIdx = 0;
let availableVoices = [];
let selectedVoice = null;
const listenLabels = {{
  en: {{ title: 'Article', voiceTitle: 'Voice', btn: 'Listen' }},
  zh: {{ title: '文章', voiceTitle: '選擇語音', btn: '朗讀本文' }}
}};

function getListenParas(){{
  const isZh = currentLang === 'zh';
  const container = document.querySelector(isZh ? '.zh-content' : '.en-content');
  return Array.from(container.querySelectorAll('.listen-block'));
}}

function loadVoices(){{
  if(!synth) return;
  availableVoices = synth.getVoices();
  const isZh = currentLang === 'zh';
  availableVoices.sort((a,b) => {{
    const aMatch = isZh ? a.lang.startsWith('zh') : a.lang.startsWith('en');
    const bMatch = isZh ? b.lang.startsWith('zh') : b.lang.startsWith('en');
    return (aMatch ? 0 : 1) - (bMatch ? 0 : 1);
  }});
  if(!selectedVoice && availableVoices.length){{
    selectedVoice = availableVoices.find(v => isZh ? v.lang.startsWith('zh') : v.lang.startsWith('en')) || availableVoices[0];
  }}
}}
if(synth){{ synth.onvoiceschanged = loadVoices; loadVoices(); }}

function renderVoiceList(){{
  const list = document.getElementById('voiceList');
  if(!availableVoices.length){{ list.innerHTML = ''; return; }}
  list.innerHTML = availableVoices.map((v,i) => `
    <div class="voice-option ${{selectedVoice && v.name===selectedVoice.name ? 'selected':''}}" onclick="pickVoice(${{i}})">
      <span class="voice-option-name">${{v.name}} (${{v.lang}})</span>
    </div>
  `).join('');
}}

function pickVoice(i){{
  selectedVoice = availableVoices[i];
  renderVoiceList();
  document.getElementById('voicePanel').classList.remove('show');
  if(listenPlaying) speakCurrent();
}}

function toggleVoicePanel(){{
  renderVoiceList();
  document.getElementById('voicePanel').classList.toggle('show');
}}

function highlightListenPara(el){{
  listenParas.forEach(p => p.classList.remove('highlight-active'));
  if(el){{
    el.classList.add('highlight-active');
    el.scrollIntoView({{behavior:'smooth', block:'center'}});
  }}
}}

function speakCurrent(){{
  if(!synth || !listenParas.length) return;
  synth.cancel();
  const el = listenParas[listenIdx];
  highlightListenPara(el);
  const utter = new SpeechSynthesisUtterance(el.textContent);
  if(selectedVoice) utter.voice = selectedVoice;
  utter.lang = selectedVoice ? selectedVoice.lang : (currentLang === 'zh' ? 'zh-TW' : 'en-US');
  utter.rate = listenSpeeds[listenSpeedIdx];
  utter.onend = () => {{
    if(listenIdx < listenParas.length - 1){{
      listenIdx++;
      speakCurrent();
    }} else {{
      stopListen();
    }}
  }};
  synth.speak(utter);
  listenPlaying = true;
  updatePlayPauseIcon();
}}

function startListen(){{
  if(!synth) return;
  listenParas = getListenParas();
  if(!listenParas.length) return;
  listenIdx = 0;
  document.getElementById('listenTitle').textContent = listenLabels[currentLang].title;
  document.getElementById('voicePanelTitle').textContent = listenLabels[currentLang].voiceTitle;
  document.getElementById('listenBar').classList.add('show');
  loadVoices();
  speakCurrent();
}}

function togglePlayPause(){{
  if(!synth) return;
  if(listenPlaying){{
    synth.pause();
    listenPlaying = false;
  }} else {{
    if(synth.paused){{ synth.resume(); }} else {{ speakCurrent(); }}
    listenPlaying = true;
  }}
  updatePlayPauseIcon();
}}

function updatePlayPauseIcon(){{
  document.getElementById('playIcon').style.display = listenPlaying ? 'none' : 'block';
  document.getElementById('pauseIcon').style.display = listenPlaying ? 'block' : 'none';
}}

function skipParagraph(dir){{
  if(!listenParas.length) return;
  listenIdx = Math.max(0, Math.min(listenParas.length - 1, listenIdx + dir));
  speakCurrent();
}}

function cycleSpeed(){{
  listenSpeedIdx = (listenSpeedIdx + 1) % listenSpeeds.length;
  document.getElementById('speedBtn').textContent = listenSpeeds[listenSpeedIdx] + 'x';
  if(listenPlaying) speakCurrent();
}}

function stopListen(){{
  if(synth) synth.cancel();
  listenPlaying = false;
  document.getElementById('listenBar').classList.remove('show');
  document.getElementById('voicePanel').classList.remove('show');
  listenParas.forEach(p => p.classList.remove('highlight-active'));
}}

// ── Tooltip (round17 final fix, synced from index.html) ──────────────────
function toggleTooltip(el, e) {{
  if (e) e.stopPropagation();
  else if (typeof event !== 'undefined') event.stopPropagation();
  document.querySelectorAll('.tooltip-wrap.open').forEach(t => {{ if(t!==el) t.classList.remove('open'); }});
  const opening = !el.classList.contains('open');
  el.classList.toggle('open');
  // 直接用視窗座標定位並夾在螢幕邊界內——不管中英文字長短、圖示落在畫面哪個位置，
  // 泡泡永遠不會切邊，也不會跟底部固定的讚/分享列疊在一起。箭頭永遠對準圖示。
  if (opening) {{
    const bubble = el.querySelector('.tooltip-bubble');
    const icon = el.querySelector('.tooltip-icon, [style*="border-radius:50%"]') || el;
    if (bubble) {{
      const margin = 12;
      const bottomBarReserve = 100; // 底部固定的讚/分享列高度,泡泡不能被它蓋住
      const bw = bubble.offsetWidth || 240;
      const bh = bubble.offsetHeight || 60;
      const iconRect = icon.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let left = iconRect.left + iconRect.width / 2 - bw / 2;
      left = Math.max(margin, Math.min(vw - bw - margin, left));

      let top = iconRect.top - bh - 8; // 預設開在圖示上方
      let flipped = false;
      const spaceBelow = vh - bottomBarReserve - iconRect.bottom - 8;
      if (top < margin) {{
        top = iconRect.bottom + 8; flipped = true;
      }} else if (bh > spaceBelow && top >= margin) {{
        // 上方空間更充足時優先往上開,避免蓋到底部固定列
      }}
      // 若往下開會超出底部固定列預留區,強制改回往上開(只要上方放得下)
      if (flipped && (top + bh) > (vh - bottomBarReserve) && (iconRect.top - bh - 8) >= margin) {{
        top = iconRect.top - bh - 8; flipped = false;
      }}

      bubble.style.position = 'fixed';
      bubble.style.left = left + 'px';
      bubble.style.top = top + 'px';
      bubble.style.right = 'auto';
      bubble.style.bottom = 'auto';
      bubble.style.transform = 'none';
      bubble.classList.toggle('arrow-flip', flipped);

      const arrowLeft = Math.max(14, Math.min(bw - 14, iconRect.left + iconRect.width / 2 - left));
      bubble.style.setProperty('--arrow-left', arrowLeft + 'px');
    }}
  }}
}}
document.addEventListener('click', () => {{
  document.querySelectorAll('.tooltip-wrap.open').forEach(t => t.classList.remove('open'));
}});

// ── DCA Score chips ─────────────────────────────────────────────────────
document.querySelectorAll('.dca-chip').forEach(async chip => {{
  const ticker = chip.dataset.ticker;
  const scoreEl = chip.querySelector('.dca-chip-score');
  try {{
    const res = await fetch(`${{PROXY_BASE}}/api/ticker-score?ticker=${{ticker}}`);
    if(!res.ok) {{
      if(scoreEl) scoreEl.textContent = 'N/A';
      chip.classList.add('unavailable');
      return;
    }}
    const data = await res.json();
    if(scoreEl) scoreEl.textContent = Math.round(data.score);
    chip.classList.add(data.triggered ? 'triggered' : 'normal');
  }} catch(e) {{
    if(scoreEl) scoreEl.textContent = 'N/A';
    chip.classList.add('unavailable');
  }}
}});

// PWA Install Modal 邏輯已經搬到chrome.js(window.openInstallModal/
// closeInstallModal,含點擊背景關閉),這裡不用重複刻一份——2026-08-20
// 移除,原本這裡對#installModal呼叫addEventListener會因為元素已經不在
// 這支範本裡(改用chrome.js注入)而噴null錯誤。

// ── Like button ──────────────────────────────────────────────────────────
let deviceId = localStorage.getItem('dcacafe_device_id');
if(!deviceId){{
  deviceId = (crypto.randomUUID ? crypto.randomUUID() : (Date.now()+'-'+Math.random()));
  localStorage.setItem('dcacafe_device_id', deviceId);
}}

function renderLikeCount(count){{
  const el = document.getElementById('likeCount');
  el.textContent = (count && count > 0) ? (' ' + count) : '';
}}

function setLikedUI(liked){{
  document.getElementById('likeBtn').classList.toggle('liked', liked);
}}

fetch(`${{PROXY_BASE}}/api/like-calendar?type=like&slug=${{POST_SLUG}}`)
  .then(r => r.json())
  .then(d => {{
    renderLikeCount(d.count);
    const likedKey = `liked_${{POST_SLUG}}`;
    setLikedUI(localStorage.getItem(likedKey) === '1');
  }})
  .catch(()=>{{}});

function toggleLike(){{
  const likedKey = `liked_${{POST_SLUG}}`;
  const alreadyLiked = localStorage.getItem(likedKey) === '1';
  const action = alreadyLiked ? 'unlike' : 'like';

  setLikedUI(!alreadyLiked);

  fetch(`${{PROXY_BASE}}/api/like-calendar?type=like`, {{
    method: 'POST',
    headers: {{'Content-Type': 'application/json'}},
    body: JSON.stringify({{ slug: POST_SLUG, deviceId, action }})
  }})
  .then(r => r.json())
  .then(d => {{
    localStorage.setItem(likedKey, alreadyLiked ? '0' : '1');
    renderLikeCount(d.count);
  }})
  .catch(()=>{{
    // Revert UI on failure
    setLikedUI(alreadyLiked);
  }});
}}

// ── Share button ─────────────────────────────────────────────────────────
function sharePost(){{
  if(typeof gtag === 'function'){{
    gtag('event', 'article_share', {{article: POST_SLUG, method: 'click'}});
  }}
  const shareData = {{
    title: document.title,
    text: currentLang === 'zh' ? zh.sub : en.sub,
    url: '{own_url}'
  }};
  if(navigator.share){{
    navigator.share(shareData).then(()=>{{
      if(typeof gtag === 'function'){{
        gtag('event', 'article_share', {{article: POST_SLUG, method: 'complete'}});
      }}
    }}).catch(()=>{{}});
  }} else {{
    navigator.clipboard.writeText(shareData.url).then(showToast).catch(()=>{{}});
  }}
}}

function showToast(){{
  let t=document.getElementById('shareToast');
  if(!t){{
    t=document.createElement('div');
    t.id='shareToast';
    document.body.appendChild(t);
  }}
  t.textContent = currentLang === 'zh' ? zh.copied : en.copied;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2000);
}}
</script>
<script src="/chrome.js"></script>
</body>
</html>"""

        out_dir = ZH_BLOG_DIR if lang == "zh" else BLOG_DIR
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{slug}.html"
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"✓ Generated {out_path}")

# ── Generate blog/index.json (homepage feed) ───────────────────────────────
feed = []
for post in posts:
    feed.append({
        "slug": post["slug"],
        "date": post["date"],
        "tag_en": post["tag_en"],
        "tag_zh": post["tag_zh"],
        "title_en": post["title_en"],
        "title_zh": post["title_zh"],
        "teaser_en": post["teaser_en"],
        "teaser_zh": post["teaser_zh"],
        "hero_image": post["hero_image"] if post["hero_image"].startswith("http") else f"blog/{post['hero_image']}",
        "read_time": post["read_time"]
    })

feed_path = BLOG_DIR / "index.json"
with open(feed_path, "w", encoding="utf-8") as f:
    json.dump(feed, f, ensure_ascii=False, indent=2)
print(f"✓ Generated {feed_path}")

# ── Update sitemap.xml (ONLY the BLOG-START/END block — never rebuild whole file) ──
sitemap_path = ROOT / "sitemap.xml"
sm = sitemap_path.read_text(encoding="utf-8")
blog_urls = ""
for post in posts:
    en_url = f"https://dcacafe.com/blog/{post['slug']}.html"
    zh_url = f"https://dcacafe.com/zh/blog/{post['slug']}.html"
    hl = (
        f'    <xhtml:link rel="alternate" hreflang="en" href="{en_url}"/>\n'
        f'    <xhtml:link rel="alternate" hreflang="zh-Hant" href="{zh_url}"/>\n'
        f'    <xhtml:link rel="alternate" hreflang="x-default" href="{en_url}"/>\n'
    )
    for loc in (en_url, zh_url):
        blog_urls += (
            "  <url>\n"
            f"    <loc>{loc}</loc>\n"
            f"    <lastmod>{post['date']}</lastmod>\n"
            "    <changefreq>monthly</changefreq>\n"
            "    <priority>0.7</priority>\n"
            f"{hl}"
            "  </url>\n\n"
        )
new_sm = re.sub(
    r'(  <!-- BLOG-START -->\n).*?(  <!-- BLOG-END -->)',
    lambda m: m.group(1) + blog_urls + m.group(2),
    sm, count=1, flags=re.S,
)
if new_sm == sm and "<!-- BLOG-START -->" not in sm:
    raise SystemExit("sitemap.xml 找不到 BLOG-START/END 標記，已中止(不重建整份)")
sitemap_path.write_text(new_sm, encoding="utf-8")
print("✓ Updated sitemap.xml (BLOG block only)")

# ── Update chrome.js ZH_READY-BLOG block (ONLY that block) ──
chrome_path = ROOT / "chrome.js"
csrc = chrome_path.read_text(encoding="utf-8")
zbody = "".join("    '/blog/%s.html',\n" % p["slug"] for p in posts)
new_c = re.sub(
    r'(/\* ZH_READY-BLOG-START \*/\n).*?(  /\* ZH_READY-BLOG-END \*/)',
    lambda m: m.group(1) + zbody + m.group(2),
    csrc, count=1, flags=re.S,
)
if new_c == csrc and "ZH_READY-BLOG-START" not in csrc:
    raise SystemExit("chrome.js 找不到 ZH_READY-BLOG-START/END 標記，已中止")
chrome_path.write_text(new_c, encoding="utf-8")
print("✓ Updated chrome.js (ZH_READY-BLOG block only)")

print(f"\nDone. {len(posts)} post(s) -> {len(posts)*2} pages (en + zh).")
