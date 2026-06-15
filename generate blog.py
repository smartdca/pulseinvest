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
:root{--bg:#f7f5f0;--bg2:#eeeae2;--surface:#fff;--border:#e0dbd0;--ink:#1a1814;--ink2:#6b6560;--ink3:#aba69e;--accent:#c8813a;--al:#f5ead8;--green:#2d7a4f;}
*{box-sizing:border-box;margin:0;padding:0;}
body{background:var(--bg);color:var(--ink);font-family:'DM Sans',sans-serif;font-size:16px;-webkit-font-smoothing:antialiased;}
nav{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:var(--surface);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:100;box-shadow:0 1px 8px rgba(0,0,0,.05);}
.nav-logo{font-family:'DM Serif Display',serif;font-size:20px;letter-spacing:-.3px;text-decoration:none;color:var(--ink);}
.nav-logo span{color:var(--accent);}
.nav-back{font-size:12px;color:var(--ink2);text-decoration:none;font-family:'DM Mono',monospace;}
.nav-back:hover{color:var(--accent);}
.wrap{max-width:680px;margin:0 auto;padding:0 20px 80px;}
.article-hero{padding:36px 0 0;}
.article-category{display:inline-flex;align-items:center;gap:6px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--accent);font-weight:600;font-family:'DM Mono',monospace;margin-bottom:14px;}
.article-category::before{content:'';width:18px;height:1.5px;background:var(--accent);display:inline-block;}
.article-title{font-family:'DM Serif Display',serif;font-size:clamp(24px,5vw,34px);line-height:1.15;letter-spacing:-.4px;margin-bottom:14px;}
.article-title em{font-style:normal;color:var(--accent);}
.article-subtitle{font-size:16px;line-height:1.65;color:var(--ink2);margin-bottom:22px;}
.article-meta{display:flex;align-items:center;gap:10px;padding:14px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin-bottom:28px;flex-wrap:wrap;}
.meta-date{font-size:12px;color:var(--ink3);font-family:'DM Mono',monospace;}
.meta-tag{font-size:11px;font-weight:600;font-family:'DM Mono',monospace;background:var(--al);color:var(--accent);padding:3px 10px;border-radius:20px;}
.meta-read{font-size:12px;color:var(--ink3);font-family:'DM Mono',monospace;margin-left:auto;}
.lang-bar{display:flex;gap:8px;margin-bottom:28px;}
.lang-btn{padding:5px 16px;border-radius:20px;border:1px solid var(--border);background:transparent;font-size:12px;font-weight:500;color:var(--ink2);cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .2s;}
.lang-btn.active{background:var(--ink);color:#fff;border-color:var(--ink);}
.hero-img{width:100%;border-radius:16px;overflow:hidden;margin-bottom:32px;aspect-ratio:16/9;}
.hero-img img{width:100%;height:100%;object-fit:cover;display:block;}
.article-body{font-size:16px;line-height:1.78;color:#2a2622;}
.article-body p{margin-bottom:18px;}
.article-body strong{font-weight:600;color:var(--ink);}
.article-body h2{font-family:'DM Serif Display',serif;font-size:22px;line-height:1.25;margin:36px 0 14px;letter-spacing:-.3px;color:var(--ink);}
.article-body h2 em{font-style:normal;color:var(--accent);}
.pullquote{border-left:3px solid var(--accent);padding:14px 18px;margin:28px 0;background:var(--al);border-radius:0 12px 12px 0;}
.pullquote p{font-family:'DM Serif Display',serif;font-size:18px;line-height:1.5;color:var(--ink);margin:0;}
.pullquote p em{font-style:normal;color:var(--accent);}
.inline-img{width:100%;border-radius:12px;overflow:hidden;margin:28px 0;aspect-ratio:16/9;}
.inline-img img{width:100%;height:100%;object-fit:cover;display:block;}
.source-note{font-size:11px;color:var(--ink3);font-family:'DM Mono',monospace;margin-top:32px;padding-top:20px;border-top:1px solid var(--border);}
.article-footer{margin-top:40px;padding-top:28px;border-top:1px solid var(--border);}
.back-link{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--ink2);text-decoration:none;font-family:'DM Mono',monospace;}
.back-link:hover{color:var(--accent);}
.disclaimer{margin-top:20px;font-size:11px;color:var(--ink3);line-height:1.6;font-family:'DM Mono',monospace;}
.zh-content{display:none;}
.en-content{display:block;}
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

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{post['title_en']} — DCAcafe</title>
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
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>{SHARED_CSS}</style>
</head>
<body>
<nav>
  <a class="nav-logo" href="../index.html">DCA<span>cafe</span></a>
  <a class="nav-back" href="../index.html">← Insights</a>
</nav>
<div class="wrap">
  <article>
    <div class="article-hero">
      <div class="article-category" id="cat">{post['category_en']}</div>
      <h1 class="article-title" id="ttl">{post['title_en']}</h1>
      <p class="article-subtitle" id="sub">{post['subtitle_en']}</p>
      <div class="article-meta">
        <span class="meta-date">{date_str}</span>
        <span class="meta-tag" id="tag">{post['tag_en']}</span>
        <span class="meta-read">{post['read_time']} min read</span>
      </div>
    </div>
    <div class="lang-bar">
      <button class="lang-btn active" onclick="setLang('en',event)">EN</button>
      <button class="lang-btn" onclick="setLang('zh',event)">中文</button>
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
      <a class="back-link" href="../index.html">← Insights</a>
      <p class="disclaimer">This article is for informational purposes only and does not constitute financial or investment advice. Past performance is not indicative of future results. · {post['hero_image_credit']}</p>
    </div>
  </article>
</div>
<script>
const zh={{
  cat:'{post['category_zh']}',
  ttl:'{title_zh_js}',
  sub:'{subtitle_zh_js}',
  tag:'{post['tag_zh']}'
}};
function setLang(lang,e){{
  document.querySelectorAll('.lang-btn').forEach(b=>b.classList.remove('active'));
  e.target.classList.add('active');
  const isZh=lang==='zh';
  document.querySelector('.en-content').style.display=isZh?'none':'block';
  document.querySelector('.zh-content').style.display=isZh?'block':'none';
  if(isZh){{
    document.getElementById('cat').textContent=zh.cat;
    document.getElementById('ttl').textContent=zh.ttl;
    document.getElementById('sub').textContent=zh.sub;
    document.getElementById('tag').textContent=zh.tag;
  }} else {{
    document.getElementById('cat').textContent='{post['category_en']}';
    document.getElementById('ttl').textContent='{post['title_en']}';
    document.getElementById('sub').textContent='{post['subtitle_en']}';
    document.getElementById('tag').textContent='{post['tag_en']}';
  }}
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
        "hero_image": post["hero_image"],
        "read_time": post["read_time"]
    })

feed_path = BLOG_DIR / "index.json"
with open(feed_path, "w", encoding="utf-8") as f:
    json.dump(feed, f, ensure_ascii=False, indent=2)
print(f"✓ Generated {feed_path}")
print(f"\nDone. {len(posts)} post(s) processed.")
