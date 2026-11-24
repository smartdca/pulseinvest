import asyncio, json, os, sys
from playwright.async_api import async_playwright

REPO = '/home/claude/pulseinvest'
OUT = '/home/claude/cards/out'
os.makedirs(OUT, exist_ok=True)
D = json.load(open('/home/claude/cards/data.json'))

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1350px;background:#0d0b09;font-family:'Inter','Inter Display',system-ui,sans-serif;color:#fff;-webkit-font-smoothing:antialiased}
.card{position:relative;width:1080px;height:1350px;overflow:hidden;background:#0d0b09}
.glow{position:absolute;border-radius:50%;filter:blur(120px)}
.top{position:absolute;left:72px;right:72px;top:64px;display:flex;justify-content:space-between;align-items:center}
.brand{font-weight:800;font-size:38px;letter-spacing:-.5px}
.brand b{color:#c8813a;font-weight:800}
.pill{border:2px solid #c8813a;color:#e0a55c;border-radius:999px;padding:10px 26px;font-weight:800;font-size:28px;letter-spacing:.14em}
.foot{position:absolute;left:72px;right:72px;bottom:56px;display:flex;justify-content:space-between;align-items:center;font-size:30px;color:#9a948a;font-weight:600}
.dots{display:flex;gap:12px}.dots i{width:14px;height:14px;border-radius:50%;background:#3a352f;display:block}.dots i.on{background:#c8813a}
.eyebrow{font-weight:800;font-size:32px;letter-spacing:.2em;color:#e0a55c}
.h{font-weight:900;letter-spacing:-.03em;line-height:1.02}
"""

def dots(n):
    return '<div class="dots">' + ''.join('<i class="%s"></i>' % ('on' if i == n else '') for i in range(1, 6)) + '</div>'

def frame(n, body, extra=''):
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}{extra}</style></head><body>
<div class="card">
<div class="glow" style="left:-260px;top:150px;width:760px;height:760px;background:rgba(226,35,26,.42)"></div>
<div class="glow" style="right:-260px;top:150px;width:760px;height:760px;background:rgba(47,107,74,.55)"></div>
<div class="top"><div class="brand">DCA<b>caf&eacute;</b></div><div class="pill">WEEKLY SHOWDOWN</div></div>
{body}
<div class="foot"><span>dcacafe.com</span>{dots(n)}</div>
</div></body></html>"""

def card1():
    a, b = D['lead'], D['rival_bench']
    return frame(1, f"""

<div style="position:absolute;left:0;top:0;width:1080px;height:1350px;pointer-events:none;z-index:5">
<div style="position:absolute;left:380px;top:300px;width:320px;height:320px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.55) 0%,rgba(255,200,190,.18) 40%,transparent 70%);filter:blur(10px)"></div>
<svg width="1080" height="1350" style="position:absolute;left:0;top:0;filter:drop-shadow(0 0 8px currentColor)" ><g style="filter:blur(.6px)"><polyline points="384,430 396,424 409,453 421,456 433,445 445,458 458,463 470,470" fill="none" stroke="#ff6a5f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><polyline points="384,500 395,517 406,520 417,494 429,498 440,525 451,525 462,520" fill="none" stroke="#ff6a5f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><polyline points="384,560 398,556 411,570 425,569 439,580 453,585 466,572 480,590" fill="none" stroke="#ff9a90" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><polyline points="696,430 685,427 674,429 663,444 653,442 642,445 631,461 620,470" fill="none" stroke="#6dffb0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><polyline points="696,500 687,507 677,513 668,518 658,526 649,522 639,531 630,520" fill="none" stroke="#6dffb0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><polyline points="696,560 684,573 672,577 660,570 648,567 636,562 624,587 612,585" fill="none" stroke="#aaffd0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g></svg>
<svg width="1080" height="1350" style="position:absolute;left:0;top:0"><defs><linearGradient id="bm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><filter id="bg"><feGaussianBlur stdDeviation="7"/></filter></defs>
<line x1="478" y1="250" x2="602" y2="680" stroke="url(#bm)" stroke-width="16" filter="url(#bg)" opacity=".9"/><line x1="478" y1="250" x2="602" y2="680" stroke="url(#bm)" stroke-width="3.5"/></svg>
<div style="position:absolute;left:405px;top:372px;width:270px;text-align:center;font-weight:900;font-style:italic;font-size:200px;line-height:1;letter-spacing:-.06em;color:transparent;background:linear-gradient(90deg,rgba(255,110,100,.75),rgba(255,110,100,0) 38%,rgba(90,235,150,0) 62%,rgba(90,235,150,.75)),linear-gradient(165deg,#ffffff 0%,#c9ccd4 30%,#7d818b 52%,#e9ebf0 72%,#ffffff 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-stroke:5px rgba(255,255,255,.92);paint-order:stroke fill;filter:drop-shadow(-16px 0 22px rgba(255,60,50,.85)) drop-shadow(16px 0 22px rgba(60,230,130,.85))">VS</div>
<i style="position:absolute;left:492px;top:523px;width:2px;height:2px;border-radius:50%;background:#fff;box-shadow:0 0 6px 2px #fff;opacity:0.91"></i><i style="position:absolute;left:705px;top:533px;width:2px;height:2px;border-radius:50%;background:#fff;box-shadow:0 0 6px 2px #fff;opacity:0.54"></i><i style="position:absolute;left:430px;top:502px;width:2px;height:2px;border-radius:50%;background:#6dffb0;box-shadow:0 0 6px 2px #6dffb0;opacity:0.91"></i><i style="position:absolute;left:627px;top:517px;width:5px;height:5px;border-radius:50%;background:#fff;box-shadow:0 0 15px 5px #fff;opacity:0.79"></i><i style="position:absolute;left:656px;top:486px;width:3px;height:3px;border-radius:50%;background:#fff;box-shadow:0 0 9px 3px #fff;opacity:0.71"></i><i style="position:absolute;left:350px;top:430px;width:2px;height:2px;border-radius:50%;background:#fff;box-shadow:0 0 6px 2px #fff;opacity:0.79"></i><i style="position:absolute;left:441px;top:386px;width:5px;height:5px;border-radius:50%;background:#fff;box-shadow:0 0 15px 5px #fff;opacity:0.53"></i><i style="position:absolute;left:600px;top:597px;width:3px;height:3px;border-radius:50%;background:#6dffb0;box-shadow:0 0 9px 3px #6dffb0;opacity:0.73"></i><i style="position:absolute;left:675px;top:417px;width:3px;height:3px;border-radius:50%;background:#fff;box-shadow:0 0 9px 3px #fff;opacity:0.85"></i><i style="position:absolute;left:547px;top:588px;width:3px;height:3px;border-radius:50%;background:#6dffb0;box-shadow:0 0 9px 3px #6dffb0;opacity:0.86"></i><i style="position:absolute;left:473px;top:638px;width:5px;height:5px;border-radius:50%;background:#fff;box-shadow:0 0 15px 5px #fff;opacity:0.71"></i><i style="position:absolute;left:545px;top:393px;width:4px;height:4px;border-radius:50%;background:#6dffb0;box-shadow:0 0 12px 4px #6dffb0;opacity:0.52"></i><i style="position:absolute;left:423px;top:330px;width:3px;height:3px;border-radius:50%;background:#ff7b6e;box-shadow:0 0 9px 3px #ff7b6e;opacity:0.85"></i><i style="position:absolute;left:376px;top:391px;width:2px;height:2px;border-radius:50%;background:#6dffb0;box-shadow:0 0 6px 2px #6dffb0;opacity:0.92"></i><i style="position:absolute;left:705px;top:424px;width:2px;height:2px;border-radius:50%;background:#fff;box-shadow:0 0 6px 2px #fff;opacity:0.87"></i><i style="position:absolute;left:468px;top:580px;width:3px;height:3px;border-radius:50%;background:#6dffb0;box-shadow:0 0 9px 3px #6dffb0;opacity:0.86"></i><i style="position:absolute;left:653px;top:400px;width:3px;height:3px;border-radius:50%;background:#6dffb0;box-shadow:0 0 9px 3px #6dffb0;opacity:0.58"></i><i style="position:absolute;left:605px;top:500px;width:3px;height:3px;border-radius:50%;background:#ff7b6e;box-shadow:0 0 9px 3px #ff7b6e;opacity:0.87"></i><i style="position:absolute;left:324px;top:565px;width:2px;height:2px;border-radius:50%;background:#6dffb0;box-shadow:0 0 6px 2px #6dffb0;opacity:0.58"></i><i style="position:absolute;left:431px;top:512px;width:4px;height:4px;border-radius:50%;background:#fff;box-shadow:0 0 12px 4px #fff;opacity:0.93"></i><i style="position:absolute;left:511px;top:565px;width:4px;height:4px;border-radius:50%;background:#ff7b6e;box-shadow:0 0 12px 4px #ff7b6e;opacity:0.98"></i><i style="position:absolute;left:606px;top:520px;width:3px;height:3px;border-radius:50%;background:#fff;box-shadow:0 0 9px 3px #fff;opacity:0.51"></i><i style="position:absolute;left:595px;top:398px;width:2px;height:2px;border-radius:50%;background:#ff7b6e;box-shadow:0 0 6px 2px #ff7b6e;opacity:0.57"></i><i style="position:absolute;left:340px;top:434px;width:3px;height:3px;border-radius:50%;background:#ff7b6e;box-shadow:0 0 9px 3px #ff7b6e;opacity:0.85"></i><i style="position:absolute;left:335px;top:449px;width:4px;height:4px;border-radius:50%;background:#fff;box-shadow:0 0 12px 4px #fff;opacity:0.95"></i><i style="position:absolute;left:589px;top:298px;width:4px;height:4px;border-radius:50%;background:#6dffb0;box-shadow:0 0 12px 4px #6dffb0;opacity:0.70"></i><i style="position:absolute;left:707px;top:543px;width:3px;height:3px;border-radius:50%;background:#fff;box-shadow:0 0 9px 3px #fff;opacity:0.53"></i><i style="position:absolute;left:568px;top:530px;width:5px;height:5px;border-radius:50%;background:#ff7b6e;box-shadow:0 0 15px 5px #ff7b6e;opacity:0.53"></i><i style="position:absolute;left:647px;top:462px;width:3px;height:3px;border-radius:50%;background:#fff;box-shadow:0 0 9px 3px #fff;opacity:0.81"></i><i style="position:absolute;left:648px;top:495px;width:3px;height:3px;border-radius:50%;background:#6dffb0;box-shadow:0 0 9px 3px #6dffb0;opacity:0.82"></i><i style="position:absolute;left:735px;top:426px;width:2px;height:2px;border-radius:50%;background:#6dffb0;box-shadow:0 0 6px 2px #6dffb0;opacity:0.56"></i><i style="position:absolute;left:258px;top:476px;width:4px;height:4px;border-radius:50%;background:#6dffb0;box-shadow:0 0 12px 4px #6dffb0;opacity:0.66"></i><i style="position:absolute;left:685px;top:580px;width:4px;height:4px;border-radius:50%;background:#ff7b6e;box-shadow:0 0 12px 4px #ff7b6e;opacity:0.91"></i><i style="position:absolute;left:582px;top:505px;width:3px;height:3px;border-radius:50%;background:#ff7b6e;box-shadow:0 0 9px 3px #ff7b6e;opacity:0.85"></i><i style="position:absolute;left:743px;top:384px;width:2px;height:2px;border-radius:50%;background:#ff7b6e;box-shadow:0 0 6px 2px #ff7b6e;opacity:0.85"></i><i style="position:absolute;left:529px;top:560px;width:3px;height:3px;border-radius:50%;background:#fff;box-shadow:0 0 9px 3px #fff;opacity:0.89"></i><i style="position:absolute;left:304px;top:431px;width:3px;height:3px;border-radius:50%;background:#ff7b6e;box-shadow:0 0 9px 3px #ff7b6e;opacity:0.81"></i><i style="position:absolute;left:596px;top:315px;width:3px;height:3px;border-radius:50%;background:#fff;box-shadow:0 0 9px 3px #fff;opacity:0.91"></i><i style="position:absolute;left:532px;top:383px;width:3px;height:3px;border-radius:50%;background:#6dffb0;box-shadow:0 0 9px 3px #6dffb0;opacity:0.87"></i><i style="position:absolute;left:782px;top:452px;width:3px;height:3px;border-radius:50%;background:#6dffb0;box-shadow:0 0 9px 3px #6dffb0;opacity:0.60"></i><i style="position:absolute;left:423px;top:404px;width:3px;height:3px;border-radius:50%;background:#ff7b6e;box-shadow:0 0 9px 3px #ff7b6e;opacity:0.54"></i><i style="position:absolute;left:680px;top:529px;width:3px;height:3px;border-radius:50%;background:#ff7b6e;box-shadow:0 0 9px 3px #ff7b6e;opacity:0.74"></i><i style="position:absolute;left:744px;top:450px;width:4px;height:4px;border-radius:50%;background:#fff;box-shadow:0 0 12px 4px #fff;opacity:0.95"></i><i style="position:absolute;left:422px;top:575px;width:4px;height:4px;border-radius:50%;background:#fff;box-shadow:0 0 12px 4px #fff;opacity:0.89"></i><i style="position:absolute;left:540px;top:349px;width:4px;height:4px;border-radius:50%;background:#fff;box-shadow:0 0 12px 4px #fff;opacity:0.89"></i><i style="position:absolute;left:419px;top:598px;width:4px;height:4px;border-radius:50%;background:#6dffb0;box-shadow:0 0 12px 4px #6dffb0;opacity:0.70"></i>
</div>
<div style="position:absolute;left:72px;top:305px;width:310px;height:310px;border-radius:70px;overflow:hidden;box-shadow:0 30px 80px rgba(226,35,26,.45)"><img src="file://{REPO}/logo/sndk.png" style="width:100%;height:100%;display:block"></div>
<div style="position:absolute;right:72px;top:305px;width:310px;height:310px;border-radius:70px;overflow:hidden;box-shadow:0 30px 80px rgba(47,107,74,.55);outline:2px solid rgba(255,255,255,.12)"><img src="file://{REPO}/logo/spy.png" style="width:100%;height:100%;display:block"></div>

<img src="file://{REPO}/img/duel-wordmark-sndk.png" style="position:absolute;left:72px;top:660px;width:310px;height:auto">
<div class="h" style="position:absolute;right:72px;top:654px;width:310px;text-align:center;font-size:64px;letter-spacing:-.04em">S&amp;P 500</div>
<div class="h" style="position:absolute;left:72px;right:72px;top:860px;font-size:116px">Who really<br>comes out<br><span style="color:#e0a55c">ahead?</span></div>
""")


import json as _j
T=_j.load(open('/home/claude/cards/trace.json'))
def _series(pts):
    xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
    out=[]
    for x in range(0,774):
        if x<xs[0]: out.append(ys[0]); continue
        if x>xs[-1]: out.append(ys[-1]); continue
        import bisect
        i=bisect.bisect_left(xs,x)
        if xs[i]==x: out.append(ys[i])
        else:
            x0,x1,y0,y1=xs[i-1],xs[i],ys[i-1],ys[i]; out.append(y0+(y1-y0)*(x-x0)/(x1-x0))
    k=4; sm=[]
    for i in range(len(out)):
        a=max(0,i-k); b=min(len(out),i+k+1); sm.append(sum(out[a:b])/(b-a))
    sm[0]=out[0]; sm[-1]=out[-1]
    return sm
def chart_svg():
    o=_series(T['o']); g=_series(T['g'])
    start=o[0]
    for i in range(0,30): g[i]=start+(g[30]-start)*(i/30.0)
    # g early overlap: align start
    W=936; sc=W/773.0
    ymin=min(min(o),min(g)); ymax=start
    scy=500.0/(ymax-ymin); H=500+20
    def path(v):
        return ' '.join(('M' if i==0 else 'L')+'%.1f %.1f'%(i*sc,(v[i]-ymin)*scy+10) for i in range(0,len(v),3))+' L%.1f %.1f'%(772*sc,(v[-1]-ymin)*scy+10)
    oe=((o[-1]-ymin)*scy+10); ge=((g[-1]-ymin)*scy+10)
    return H, f"""<svg width="{W+40}" height="{H+20}" viewBox="-20 -10 {W+40} {H+20}" style="overflow:visible">
<defs><filter id="gl"><feGaussianBlur stdDeviation="9"/></filter></defs>
<path d="{path(o)}" fill="none" stroke="#ff4a3d" stroke-width="16" opacity=".55" filter="url(#gl)" stroke-linecap="round" stroke-linejoin="round"/>
<path d="{path(g)}" fill="none" stroke="#4fd18b" stroke-width="12" opacity=".4" filter="url(#gl)" stroke-linecap="round"/>
<path d="{path(o)}" fill="none" stroke="#ff5a4d" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
<path d="{path(g)}" fill="none" stroke="#5fe0a0" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="{772*sc:.1f}" cy="{oe:.1f}" r="16" fill="#ff5a4d"/><circle cx="{772*sc:.1f}" cy="{ge:.1f}" r="16" fill="#5fe0a0"/>
</svg>""", oe, ge

def card2():
    H, svg, oe, ge = chart_svg()
    return frame(2, f"""
<div style="position:absolute;left:72px;right:72px;top:215px"><div class="h" style="font-size:104px">Same rules.<br><span style="color:#e0a55c">Same start.</span></div>
<div style="font-size:36px;color:#b5aea3;margin-top:34px;font-weight:600;line-height:1.4">$500 a month &middot; Smart DCA on both<br>{D['period']}</div></div>
<div style="position:absolute;left:72px;top:700px">{svg}</div>
<div style="position:absolute;left:72px;top:{700+10+oe-70:.0f}px;font-size:46px;font-weight:900;color:#ff6a5f;width:700px">SanDisk</div>
<div style="position:absolute;left:72px;top:{700+10+ge+30:.0f}px;font-size:46px;font-weight:900;color:#6fd69a">S&amp;P 500</div>
""")

def card3():
    r = D['result']
    def panel(name, color, val, ret):
        return f'<div style="flex:1;border-radius:40px;background:rgba(255,255,255,.06);border:2px solid rgba(255,255,255,.12);padding:60px 40px"><div style="font-size:38px;font-weight:900;color:{color}">{name}</div><div style="font-size:92px;font-weight:900;margin-top:44px;letter-spacing:-.03em;line-height:1">{val}</div><div style="font-size:66px;font-weight:800;margin-top:32px;color:{color}">{ret}</div></div>'
    a, b = r['rows'][0], r['rows'][1]
    return frame(3, f"""
<div style="position:absolute;left:72px;right:72px;top:215px"><div class="eyebrow">THE RESULTS</div>
<div class="h" style="font-size:104px;margin-top:22px">Where $500<br><span style="color:#e0a55c">a month landed.</span></div>
<div style="display:flex;gap:30px;margin-top:110px">{panel('SanDisk','#ff6a5f',a[1],b[1])}{panel('S&amp;P 500','#6fd69a',a[2],b[2])}</div>
<div style="font-size:34px;color:#b5aea3;margin-top:44px;font-weight:600">Final value &middot; and return on money put in</div></div>
""")

def card4():
    r = D['result']
    return frame(4, f"""
<div style="position:absolute;left:72px;right:72px;top:215px"><div class="eyebrow">THE OTHER SIDE</div>
<div class="h" style="font-size:104px;margin-top:22px">It wasn&rsquo;t<br>a smooth ride.</div>
<div style="margin-top:90px"><div style="font-size:190px;font-weight:900;color:#ff6a5f;letter-spacing:-.04em;line-height:1">{r['dd']}</div>
<div style="font-size:38px;color:#d8d2c8;font-weight:600;margin-top:18px;line-height:1.3">SanDisk&rsquo;s deepest drop<br>from a 12-month high</div></div>
<div style="margin-top:90px;border-radius:34px;background:rgba(200,129,58,.14);border:2px solid rgba(200,129,58,.55);padding:34px 40px;display:flex;justify-content:space-between;align-items:center">
<div><div style="font-size:30px;color:#e0a55c;font-weight:800;letter-spacing:.1em">SANDISK DCA SCORE</div><div style="font-size:32px;color:#b5aea3;margin-top:8px;font-weight:600">{r['score_asof']}</div></div>
<div style="font-size:96px;font-weight:900;line-height:1">{r['score']}</div></div>
<div style="font-size:28px;color:#8f897f;margin-top:34px;font-weight:600">Only 1.8 years of history. Past results do not predict future ones.</div></div>
""")

def card5():
    w = D['whatif']
    items = ''
    for tag, q in w:
        items += f'<div style="border-radius:34px;background:rgba(255,255,255,.07);border:2px solid rgba(255,255,255,.14);padding:36px 42px;margin-top:34px"><div style="font-size:26px;font-weight:800;letter-spacing:.2em;color:#e0a55c">{tag}</div><div class="h" style="font-size:52px;margin-top:14px;letter-spacing:-.02em;line-height:1.15">{q}</div></div>'
    return frame(5, f"""
<div style="position:absolute;left:72px;right:72px;top:215px"><div class="eyebrow">WHAT IF I&hellip;</div><div class="h" style="font-size:140px;color:#e0a55c;margin-top:14px">Your turn.</div>
{items}
<div style="margin-top:60px;font-size:40px;font-weight:800;line-height:1.3">Change the rules. Run your own showdown.</div></div>
""")

async def main():
    which = sys.argv[1:] or ['1','2','3','4','5']
    fn = {'1': card1, '2': card2, '3': card3, '4': card4, '5': card5}
    async with async_playwright() as p:
        br = await p.chromium.launch(args=['--allow-file-access-from-files'])
        pg = await br.new_page(viewport={'width': 1080, 'height': 1350})
        for k in which:
            html = fn[k]()
            path = f'/home/claude/cards/c{k}.html'
            open(path, 'w').write(html)
            await pg.goto('file://' + path)
            await pg.wait_for_timeout(400)
            await pg.screenshot(path=f'{OUT}/card{k}.png')
            print('ok', k)
        await br.close()
asyncio.run(main())
