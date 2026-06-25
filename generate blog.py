#!/usr/bin/env python3
"""
generate_blog.py
Reads posts.json and generates:
  - blog/[slug].html  for each post
  - blog/index.json   a lightweight feed for the homepage card widget
"""

import json
import os
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent
POSTS_FILE = ROOT / "posts.json"
BLOG_DIR = ROOT / "blog"
BLOG_DIR.mkdir(exist_ok=True)

# ── Load posts ─────────────────────────────────────────────────────────────
with open(POSTS_FILE, encoding="utf-8") as f:
    posts = json.load(f)

# Sort newest first
posts.sort(key=lambda p: p["date"], reverse=True)

# ── Shared CSS ─────────────────────────────────────────────────────────────
SHARED_CSS = """
:root{--bg:#f7f5f0;--bg2:#eeeae2;--surface:#fff;--border:#e0dbd0;--ink:#1a1814;--ink2:#6b6560;--ink3:#aba69e;--accent:#c8813a;--al:#f5ead8;--green:#2d7a4f;--font-sans:-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display','Helvetica Neue',Arial,sans-serif;}
*{box-sizing:border-box;margin:0;padding:0;}
body{background:var(--bg);color:var(--ink);font-family:var(--font-sans);font-size:16px;-webkit-font-smoothing:antialiased;}
nav{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--surface);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:100;box-shadow:0 1px 8px rgba(0,0,0,.05);}
.nav-logo{display:flex;align-items:center;text-decoration:none;}
.lang-bar-nav{display:flex;gap:8px;}
.wrap{max-width:680px;margin:0 auto;padding:0 22px 80px;}
.article-hero{padding:36px 0 0;}
.article-category{display:inline-flex;align-items:center;gap:6px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--accent);font-weight:700;font-family:var(--font-sans);margin-bottom:14px;}
.article-category::before{content:'';width:18px;height:1.5px;background:var(--accent);display:inline-block;}
.breadcrumb{display:block;font-size:13px;color:var(--ink2);text-decoration:none;font-family:var(--font-sans);margin-bottom:12px;}
.breadcrumb:active{color:var(--accent);}
.article-title{font-family:var(--font-sans);font-weight:700;font-size:clamp(24px,5vw,34px);line-height:1.15;letter-spacing:-.4px;margin-bottom:14px;}
.article-title em{font-style:normal;color:var(--accent);}
.article-subtitle{font-size:16px;line-height:1.65;color:var(--ink2);margin-bottom:22px;}
.article-meta{display:flex;align-items:center;gap:10px;padding:14px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin-bottom:28px;flex-wrap:wrap;}
.meta-date{font-size:12px;color:var(--ink3);font-family:var(--font-sans);font-variant-numeric:tabular-nums;}
.meta-tag{font-size:11px;font-weight:600;font-family:var(--font-sans);background:var(--al);color:var(--accent);padding:3px 10px;border-radius:20px;}
.meta-read{font-size:12px;color:var(--ink3);font-family:var(--font-sans);font-variant-numeric:tabular-nums;margin-left:auto;}
.lang-bar{display:flex;gap:8px;margin-bottom:28px;}
.lang-btn{padding:5px 16px;border-radius:20px;border:1px solid var(--border);background:transparent;font-size:12px;font-weight:500;color:var(--ink2);cursor:pointer;font-family:var(--font-sans);transition:all .2s;}
.lang-btn.active{background:var(--ink);color:#fff;border-color:var(--ink);}
.hero-img{width:100%;border-radius:16px;overflow:hidden;margin-bottom:32px;aspect-ratio:16/9;}
.hero-img img{width:100%;height:100%;object-fit:cover;display:block;}
.article-body{font-size:16px;line-height:1.78;color:#2a2622;}
.article-body p{margin-bottom:18px;}
.article-body strong{font-weight:600;color:var(--ink);}
.article-body h2{font-family:var(--font-sans);font-weight:700;font-size:22px;line-height:1.25;margin:36px 0 14px;letter-spacing:-.3px;color:var(--ink);}
.article-body h2 em{font-style:normal;color:var(--accent);}
.pullquote{border-left:3px solid var(--accent);padding:14px 18px;margin:28px 0;background:var(--al);border-radius:0 12px 12px 0;}
.pullquote p{font-family:var(--font-sans);font-weight:700;font-size:18px;line-height:1.5;color:var(--ink);margin:0;}
.pullquote p em{font-style:normal;color:var(--accent);}
.inline-img{width:100%;border-radius:12px;overflow:hidden;margin:28px 0;aspect-ratio:16/9;}
.inline-img img{width:100%;height:100%;object-fit:cover;display:block;}
.source-note{font-size:11px;color:var(--ink3);font-family:var(--font-sans);margin-top:32px;padding-top:20px;border-top:1px solid var(--border);}
.article-footer{margin-top:40px;padding-top:28px;border-top:1px solid var(--border);}
.disclaimer{margin-top:20px;font-size:11px;color:var(--ink3);line-height:1.6;font-family:var(--font-sans);}
.zh-content{display:none;}
.en-content{display:block;}
#shareToast{position:fixed;bottom:84px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--ink);color:#fff;padding:10px 20px;border-radius:24px;font-size:13px;font-family:var(--font-sans);opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;z-index:1000;box-shadow:0 4px 20px rgba(0,0,0,.25);}
#shareToast.show{opacity:1;transform:translateX(-50%) translateY(0);}
.tab-bar{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:200;display:flex;align-items:center;background:rgba(26,24,20,.9);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:40px;padding:5px 6px;gap:2px;width:fit-content;box-shadow:0 8px 32px rgba(0,0,0,.32),0 2px 8px rgba(0,0,0,.2),inset 0 1px 0 rgba(255,255,255,.08);}
.tab-btn{flex:none;padding:7px 26px;border:none;background:transparent;border-radius:32px;font-size:11px;font-weight:500;color:rgba(255,255,255,.45);cursor:pointer;transition:all .22s;display:flex;flex-direction:column;align-items:center;gap:2px;white-space:nowrap;-webkit-tap-highlight-color:transparent;}
.tab-btn.active{background:rgba(255,255,255,.13);color:#fff;}
.tab-btn svg{width:18px;height:18px;}
.tab-btn.liked svg{fill:var(--accent);stroke:var(--accent);}
.tab-like-count{font-variant-numeric:tabular-nums;}
.site-footer{background:var(--bg2);border-top:1px solid var(--border);padding:28px 20px 40px;margin-top:30px;}
.site-footer-inner{max-width:520px;margin:0 auto;}
.site-footer-top{display:flex;flex-direction:column;gap:12px;margin-bottom:20px;background:#fff;padding:14px 16px;border-radius:10px;}
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
.footer-spacer{height:96px;}
"""

# ── Block renderer ─────────────────────────────────────────────────────────
def render_blocks(blocks):
    html = ""
    for b in blocks:
        t = b["type"]
        if t == "p":
            html += f'<p>{b["content"]}</p>\n'
        elif t == "h2":
            html += f'<h2>{b["content"]}</h2>\n'
        elif t == "pullquote":
            html += f'<div class="pullquote"><p>{b["content"]}</p></div>\n'
        elif t == "image":
            html += f'<div class="inline-img"><img src="{b["src"]}" alt="{b["alt"]}" loading="lazy"></div>\n'
        elif t == "source":
            html += f'<p class="source-note">{b["content"]}</p>\n'
    return html

# ── Generate article pages ─────────────────────────────────────────────────
for post in posts:
    slug = post["slug"]
    date_str = post["date"]
    
    body_en = render_blocks(post["body_en"])
    body_zh = render_blocks(post["body_zh"])
    title_zh_js = post["title_zh"].replace("'", "\\'")
    subtitle_zh_js = post["subtitle_zh"].replace("'", "\\'")
    subtitle_en_js = post["subtitle_en"].replace("'", "\\'")
    title_en_js = post["title_en"].replace("'", "\\'")
    category_en_js = post["category_en"].replace("'", "\\'")
    tag_en_js = post["tag_en"].replace("'", "\\'")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{post['title_en']} — DCAcafé</title>
<meta name="description" content="{post['subtitle_en']}">
<link rel="canonical" href="https://dcacafe.com/blog/{slug}.html">
<link rel="icon" type="image/png" href="../IMG_9104.png">
<link rel="apple-touch-icon" href="../IMG_9104.png">
<meta property="og:type" content="article">
<meta property="og:url" content="https://dcacafe.com/blog/{slug}.html">
<meta property="og:title" content="{post['title_en']}">
<meta property="og:description" content="{post['subtitle_en']}">
<meta property="og:image" content="{post['hero_image']}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{post['title_en']}">
<meta name="twitter:description" content="{post['subtitle_en']}">
<meta name="twitter:image" content="{post['hero_image']}">
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "{post['title_en']}",
  "description": "{post['subtitle_en']}",
  "image": "{post['hero_image']}",
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
    "@id": "https://dcacafe.com/blog/{slug}.html"
  }}
}}
</script>
<style>{SHARED_CSS}</style>
</head>
<body>
<nav>
  <a class="nav-logo" href="../index.html">
    <img src="../IMG_9110.png" alt="DCAcafé" height="30" style="display:inline-block;vertical-align:middle;max-width:150px;object-fit:contain;" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'">
    <span style="display:none;font-family:var(--font-sans);font-weight:700;font-size:19px;">DCA<span style="color:#c8813a;">café</span></span>
  </a>
  <div class="lang-bar-nav">
    <button class="lang-btn active" id="navLangEn" onclick="setLang('en',event)">EN</button>
    <button class="lang-btn" id="navLangZh" onclick="setLang('zh',event)">中文</button>
  </div>
</nav>
<div class="wrap">
  <article>
    <div class="article-hero">
      <a href="../insights.html" class="breadcrumb" id="breadcrumb">← Insights</a>
      <div class="article-category" id="cat">{post['category_en']}</div>
      <h1 class="article-title" id="ttl">{post['title_en']}</h1>
      <p class="article-subtitle" id="sub">{post['subtitle_en']}</p>
      <div class="article-meta">
        <span class="meta-date">{date_str}</span>
        <span class="meta-tag" id="tag">{post['tag_en']}</span>
        <span class="meta-read" id="read">{post['read_time']} min read</span>
      </div>
    </div>
    <div class="hero-img">
      <img src="{post['hero_image']}" alt="{post['title_en']}" loading="eager">
    </div>
    <div class="en-content article-body">
{body_en}
    </div>
    <div class="zh-content article-body">
{body_zh}
    </div>
    <div class="article-footer">
      <p class="disclaimer" id="articleDisclaimer">This article is for informational purposes only and does not constitute financial or investment advice. Past performance is not indicative of future results. · {post['hero_image_credit']}</p>
    </div>
  </article>
</div>
<footer class="site-footer">
  <div class="site-footer-inner">
    <div class="site-footer-top">
      <a class="footer-brand" href="../index.html" style="text-decoration:none;">
        <img src="../IMG_9110.png" alt="DCAcafé" height="20" style="max-width:110px;object-fit:contain;" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-block'">
        <span style="display:none;font-family:var(--font-sans);font-weight:700;font-size:15px;color:var(--ink);">DCA<span style="color:var(--accent);">cafe</span></span>
      </a>
      <div class="footer-links" style="display:flex;align-items:center;justify-content:space-between;width:100%;">
        <div style="display:flex;gap:20px;align-items:center;">
          <a href="../insights.html" id="footerInsightsLink">Insights</a>
          <a href="../privacy.html" id="footerPrivacyLink">Privacy Policy</a>
        </div>
        <div style="display:flex;gap:14px;align-items:center;">
          <a href="mailto:help@dcacafe.com" aria-label="Contact Us" style="display:flex;align-items:center;line-height:1;text-decoration:none;"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="#6e6e73"><path d="M22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6zm-2 0-8 5-8-5h16zm0 12H4V8l8 5 8-5v10z"/></svg></a>
          <button onclick="openInstallModal()" aria-label="Add to Home Screen" style="background:none;border:none;padding:0;cursor:pointer;display:flex;align-items:center;"><span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;background:#fff;border:1px solid #d1d1d6;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.12);"><img src="../IMG_9104.png" alt="DCAcafé" style="width:24px;height:24px;object-fit:contain;display:block;"></span></button>
        </div>
      </div>
    </div>
    <div class="footer-divider"></div>
    <div class="footer-bottom">
      <div class="footer-copy" id="footerCopy">© 2026 DCAcafé. All rights reserved.</div>
    </div>
    <div class="footer-disclaimer" id="footerDisclaimer">DCAcafe is an informational tool only and does not constitute financial or investment advice. All investment decisions are made solely at your own risk. Past performance is not indicative of future results. Market data provided by Yahoo Finance.</div>
  </div>
</footer>

<div id="installModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:flex-end;justify-content:center;">
  <div style="background:#fff;border-radius:20px 20px 0 0;padding:28px 24px 48px;width:100%;max-width:480px;">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:24px;">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:14px;overflow:hidden;flex-shrink:0;background:#fff;border:1px solid #d1d1d6;box-shadow:0 1px 3px rgba(0,0,0,0.12);"><img src="../IMG_9104.png" style="width:44px;height:44px;object-fit:contain;display:block;"></span>
      <div>
        <img src="../IMG_9110.png" alt="DCAcafé" style="height:22px;max-width:140px;object-fit:contain;display:block;">
        <div style="font-family:var(--font-sans);font-size:13px;color:#6e6e73;margin-top:4px;">圍繞你而設計的投資體驗。</div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:16px;">
      <div style="display:flex;align-items:flex-start;gap:14px;">
        <div style="background:#c8813a;color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--font-sans);font-size:12px;font-weight:700;flex-shrink:0;">1</div>
        <p style="font-family:var(--font-sans);font-size:14px;color:#1c1c1e;line-height:1.5;padding-top:3px;">點下方工具列的 <strong style="color:#c8813a;">分享</strong> 圖示（方框加向上箭頭）</p>
      </div>
      <div style="display:flex;align-items:flex-start;gap:14px;">
        <div style="background:#c8813a;color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--font-sans);font-size:12px;font-weight:700;flex-shrink:0;">2</div>
        <p style="font-family:var(--font-sans);font-size:14px;color:#1c1c1e;line-height:1.5;padding-top:3px;">往下滑，點選 <strong style="color:#c8813a;">「加入主畫面」</strong></p>
      </div>
      <div style="display:flex;align-items:flex-start;gap:14px;">
        <div style="background:#c8813a;color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--font-sans);font-size:12px;font-weight:700;flex-shrink:0;">3</div>
        <p style="font-family:var(--font-sans);font-size:14px;color:#1c1c1e;line-height:1.5;padding-top:3px;">點右上角 <strong style="color:#c8813a;">「新增」</strong>，完成！桌面會出現 DCAcafé 圖示。</p>
      </div>
    </div>
    <button onclick="closeInstallModal()" style="display:block;width:100%;margin-top:24px;background:#f2f2f7;border:none;border-radius:12px;padding:14px;font-family:var(--font-sans);font-size:15px;font-weight:600;color:#1c1c1e;cursor:pointer;">知道了</button>
  </div>
</div>

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
<script>
const POST_SLUG = '{slug}';
const PROXY_BASE = 'https://proxy-three-mu-47.vercel.app';

const zh={{
  cat:'{post['category_zh']}',
  ttl:'{title_zh_js}',
  sub:'{subtitle_zh_js}',
  tag:'{post['tag_zh']}',
  read:'{post['read_time']} 分鐘閱讀',
  like:'讚',
  share:'分享',
  copied:'已複製連結',
  breadcrumb:'← 投資見解',
  footerInsights:'投資見解',
  footerPrivacy:'隱私政策',
  footerCopy:'© 2026 DCAcafé 版權所有',
  footerDisclaimer:'DCAcafé 僅供參考，不構成任何投資建議。所有投資決策風險由使用者自行承擔。過去績效不代表未來結果。市場數據來源：Yahoo Finance。',
  articleDisclaimer:'本文僅供參考，不構成任何財務或投資建議。過去表現不代表未來結果。· 照片來源：André François McKenzie / Unsplash'
}};
const en={{
  cat:'{category_en_js}',
  ttl:'{title_en_js}',
  sub:'{subtitle_en_js}',
  tag:'{tag_en_js}',
  read:'{post['read_time']} min read',
  like:'Like',
  share:'Share',
  copied:'Link copied',
  breadcrumb:'← Insights',
  footerInsights:'Insights',
  footerPrivacy:'Privacy Policy',
  footerCopy:'© 2026 DCAcafé. All rights reserved.',
  footerDisclaimer:'DCAcafe is an informational tool only and does not constitute financial or investment advice. All investment decisions are made solely at your own risk. Past performance is not indicative of future results. Market data provided by Yahoo Finance.',
  articleDisclaimer:'This article is for informational purposes only and does not constitute financial or investment advice. Past performance is not indicative of future results. · {post['hero_image_credit']}'
}};

let currentLang = localStorage.getItem('dcacafe_lang') || 'en';

function applyLang(lang){{
  const isZh = lang === 'zh';
  document.querySelector('.en-content').style.display = isZh ? 'none' : 'block';
  document.querySelector('.zh-content').style.display = isZh ? 'block' : 'none';
  document.getElementById('navLangEn').classList.toggle('active', !isZh);
  document.getElementById('navLangZh').classList.toggle('active', isZh);
  const d = isZh ? zh : en;
  document.getElementById('cat').textContent = d.cat;
  document.getElementById('ttl').textContent = d.ttl;
  document.getElementById('sub').textContent = d.sub;
  document.getElementById('tag').textContent = d.tag;
  document.getElementById('read').textContent = d.read;
  document.getElementById('likeLabel').textContent = d.like;
  document.getElementById('shareLabel').textContent = d.share;
  document.getElementById('breadcrumb').textContent = d.breadcrumb;
  document.getElementById('footerInsightsLink').textContent = d.footerInsights;
  document.getElementById('footerPrivacyLink').textContent = d.footerPrivacy;
  document.getElementById('footerCopy').textContent = d.footerCopy;
  document.getElementById('footerDisclaimer').textContent = d.footerDisclaimer;
  document.getElementById('articleDisclaimer').textContent = d.articleDisclaimer;
}}

function setLang(lang,e){{
  currentLang = lang;
  localStorage.setItem('dcacafe_lang', lang);
  applyLang(lang);
}}

applyLang(currentLang);

// ── PWA Install Modal ───────────────────────────────────────────────────
function openInstallModal(){{
  var m=document.getElementById('installModal');
  if(m){{ m.style.display='flex'; }}
}}
function closeInstallModal(){{
  var m=document.getElementById('installModal');
  if(m) m.style.display='none';
}}
document.getElementById('installModal').addEventListener('click', function(e){{
  if(e.target===this) closeInstallModal();
}});

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

fetch(`${{PROXY_BASE}}/api/like?slug=${{POST_SLUG}}`)
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

  fetch(`${{PROXY_BASE}}/api/like`, {{
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
    gtag('event', 'share_click', {{article: POST_SLUG}});
  }}
  const shareData = {{
    title: document.title,
    text: currentLang === 'zh' ? zh.sub : en.sub,
    url: 'https://dcacafe.com/blog/{slug}.html'
  }};
  if(navigator.share){{
    navigator.share(shareData).then(()=>{{
      if(typeof gtag === 'function'){{
        gtag('event', 'share_complete', {{article: POST_SLUG}});
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
</body>
</html>"""

    out_path = BLOG_DIR / f"{slug}.html"
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

# ── Generate sitemap.xml ───────────────────────────────────────────────────
# Static pages + all blog posts
today = max((p["date"] for p in posts), default="2026-06-16")
sitemap_entries = [
    ("https://dcacafe.com/", today, "weekly", "1.0"),
    ("https://dcacafe.com/insights.html", today, "weekly", "0.8"),
]
for post in posts:
    sitemap_entries.append((
        f"https://dcacafe.com/blog/{post['slug']}.html",
        post["date"],
        "monthly",
        "0.7"
    ))

sitemap_xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
sitemap_xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
for loc, lastmod, freq, prio in sitemap_entries:
    sitemap_xml += "  <url>\n"
    sitemap_xml += f"    <loc>{loc}</loc>\n"
    sitemap_xml += f"    <lastmod>{lastmod}</lastmod>\n"
    sitemap_xml += f"    <changefreq>{freq}</changefreq>\n"
    sitemap_xml += f"    <priority>{prio}</priority>\n"
    sitemap_xml += "  </url>\n"
sitemap_xml += "</urlset>\n"

sitemap_path = ROOT / "sitemap.xml"
with open(sitemap_path, "w", encoding="utf-8") as f:
    f.write(sitemap_xml)
print(f"✓ Generated {sitemap_path}")

print(f"\nDone. {len(posts)} post(s) processed.")
