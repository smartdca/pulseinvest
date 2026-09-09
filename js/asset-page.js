/* ═══════════════════════════════════════════════════════════════════════
   DCAcafé 資產頁 — 引擎
   由 scripts/asset-template.html 抽出，所有資產頁共用同一份。

   ── 依賴關係（動之前務必讀完）─────────────────────────

   本檔「不是」獨立的。它讀一個叫 COPY 的全域常數，而那個常數宣告在
   資產頁自己的內嵌腳本裡（範本第 572 行起）。原因是 COPY 裡面有一半
   是每支資產各自的內容，build-assets.py 在產生頁面時才注入，沒辦法共用。

   所以載入方式有三個條件，缺一個就會壞：

     1. 必須排在宣告 COPY 的那段內嵌腳本「後面」
     2. 不可以加 defer 或 async
        （加了會延到解析完才執行，而 COPY 是內嵌宣告的普通常數，
          兩者的執行順序就不再保證）
     3. 必須排在 chrome.js 「前面」
        chrome.js 之後那段桌機腳本會接手 window.applyPageLang
        （var prevApply = window.applyPageLang），本檔沒先跑完，
        它接到的是 undefined，桌機的 HERO 尺寸與中文斷行會失效

   範本裡已經照這個順序寫好，搬動腳本位置之前請先回來看這段。

   ── 提供給外部的東西 ──────────────────────────────────

     window.applyPageLang(l)   chrome.js 切換語言時呼叫
     window.__heroBean(score)  重畫 HERO 咖啡豆
     ctaGo() / acSearch() / ensureTurnstile()
                               範本底部 CTA 的行內 onclick 會呼叫。
                               這三個是頂層 function 宣告，會掛在 window 上；
                               改成 const 箭頭函式就會壞掉。

   ── 硬規則 ─────────────────────────────────────────

   本檔不得出現任何日期字串。build-assets.py 的日期自檢掃的是 asset/
   底下的產物，JS 抽出來之後就不在它的掃描範圍內了，這裡只能靠人守。
   ═══════════════════════════════════════════════════════════════════════ */

/* ══════════════ i18n 引擎(讀 COPY，驅動全頁雙語)══════════════ */
const asset = COPY.asset, U = COPY.ui, BK = COPY.banks;
let LANG = (window.DCA_LANG === 'zh') ? 'zh' : 'en';   // 由網址鎖定(head 的 DCA_LANG)，不再讀 localStorage
const RERENDER = [];                                    // 各動態區塊註冊自己的重繪
const px = o => (o && typeof o === 'object' && (o.zh !== undefined || o.en !== undefined)) ? o[LANG] : o;
const ip = s => String(s == null ? '' : s).replace(/\{T\}/g, asset.ticker).replace(/\{S\}/g, asset.score);
const R  = o => ip(px(o));                              // resolve = 取語言 + 代入 {T}{S}
const setText = (sel, v) => { const e = document.querySelector(sel); if (e) e.textContent = R(v); };
const setHTML = (sel, v) => { const e = document.querySelector(sel); if (e) e.innerHTML = R(v); };
/* 大標斷行規範:依標點分句,每句包成 white-space:nowrap 的片段,片段之間放可斷點
   (英文=空白、中文=零寬 <wbr>)。這樣需要換行時只會在標點後整句下移,不會一字上一字下。
   只有一句(無標點可分)時回傳原字,交給 CSS 正常換行,避免長句被 nowrap 撐爆。 */
function wrapTitle(str){
  let s = String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  s = s.replace(/([.,!?;:])\s+/g, '$1\u0001');        // 英文句讀 + 空白 → 分段點(空白型)
  s = s.replace(/([。！？，、；：])/g, '$1\u0002');   // 中文全形句讀 → 分段點(零寬型)
  if (s.indexOf('\u0001') < 0 && s.indexOf('\u0002') < 0) return s;  // 無可分句 → 原樣
  let out = '', buf = '';
  const flush = () => { if (buf) { out += '<span class="tw">' + buf + '</span>'; buf = ''; } };
  for (const ch of s) {
    if (ch === '\u0001') { flush(); out += ' '; }
    else if (ch === '\u0002') { flush(); out += '<wbr>'; }
    else buf += ch;
  }
  flush();
  return out;
}
const setTitle = (sel, v) => { const e = document.querySelector(sel); if (e) e.innerHTML = wrapTitle(R(v)); };
function setMeta(name, content, attr) {
  attr = attr || 'name';
  let m = document.head.querySelector('meta[' + attr + '="' + name + '"]');
  if (!m) { m = document.createElement('meta'); m.setAttribute(attr, name); document.head.appendChild(m); }
  m.setAttribute('content', content);
}

function ctaGo(){
  const el = document.getElementById('ctaInput'); if(!el) return;
  const v = (el.value||'').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g,'');
  if(!v){ el.focus(); return; }
  window.location.href = 'https://dcacafe.com/?ticker=' + encodeURIComponent(v);
}

/* ══════════ CTA 代碼自動完成(移植自 index.html)══════════
   · 懶載入:第一次 focus 才 render Turnstile widget(沒互動的訪客看不到驗證框)
   · Yahoo 搜尋走 /api/proxy,需帶 x-turnstile-token,否則後端 403
   · 資產頁的 PROXY(在下方 IIFE 內)是 .../api;這裡自帶 .../api/proxy,不共用
   · Henry 無 console:所有失敗都把原因印在下拉選單裡(ac-loading)以便實機診斷
   · 選代碼 → 直接跳 /?ticker=(首頁自動試算)                                    */
const PROXY_PASS = 'https://proxy-three-mu-47.vercel.app/api/proxy';
const TS_SITEKEY = '0x4AAAAAAD5ffempNdQrGMYm';
let tsToken = null, tsWidgetId = null, tsErr = null;
const acTimers = {};
const acEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// 第一次 focus 才載入 widget;Cloudflare 腳本是 async,還沒到就重試(上限 15 秒)
function ensureTurnstile(){
  if (tsWidgetId !== null) return;
  if (!window.turnstile){
    if (!window.__tsRetry) window.__tsRetry = Date.now();
    if (Date.now() - window.__tsRetry > 15000) return;
    setTimeout(ensureTurnstile, 300); return;
  }
  const box = document.getElementById('ctaTs');
  if (box) box.style.display = 'block';
  try{
    tsWidgetId = window.turnstile.render('#ctaTs', {
      sitekey: TS_SITEKEY, theme: 'auto',
      callback: t => { tsToken = t; tsErr = null; },
      'expired-callback': () => { tsToken = null; tsErr = 'expired'; },
      'error-callback': c => { tsToken = null; tsErr = 'error:' + c; },
      'timeout-callback': () => { tsToken = null; tsErr = 'timeout'; },
    });
  }catch(e){ tsErr = 'render:' + (e && e.message || e); }
}

// 送請求前確保手上有 token(過期就 reset、還沒 render 就 render),最多等 timeoutMs
function ensureToken(timeoutMs){
  return new Promise(res => {
    if (tsToken){ res(tsToken); return; }
    if (tsWidgetId !== null && window.turnstile){ try{ window.turnstile.reset(tsWidgetId); }catch(e){} }
    else ensureTurnstile();
    const start = Date.now();
    const iv = setInterval(() => {
      if (tsToken || Date.now() - start > timeoutMs){ clearInterval(iv); res(tsToken); }
    }, 200);
  });
}

function acDiag(drop, msg){ if (drop){ drop.innerHTML = '<div class="ac-loading">' + msg + '</div>'; drop.classList.add('open'); } }

async function acSearch(inputId, dropId){
  const input = document.getElementById(inputId), drop = document.getElementById(dropId);
  if (!input || !drop) return;
  drop.dataset.linkedInput = inputId;                    // 供外部點擊關閉判斷
  const q = (input.value || '').replace(/[^A-Za-z0-9.\-]/g,'').toUpperCase().trim();
  if (q.length < 1){ drop.classList.remove('open'); return; }
  clearTimeout(acTimers[inputId]);
  acTimers[inputId] = setTimeout(async () => {
    const fq = (input.value || '').replace(/[^A-Za-z0-9.\-]/g,'').toUpperCase().trim();  // debounce 後重清(iOS 可能又補字)
    if (!fq){ drop.classList.remove('open'); return; }
    const zh = LANG === 'zh';
    acDiag(drop, zh ? '搜尋中…' : 'Searching…');
    try{
      if (!tsToken){ acDiag(drop, zh ? '驗證中…' : 'Verifying…'); await ensureToken(5000); }
      if (!tsToken){ acDiag(drop, (zh ? '搜尋暫時無法使用:驗證未完成' : 'Search unavailable: verification pending') + (tsErr ? ' (' + tsErr + ')' : '') + (zh ? '，請點一下驗證框' : ' — tap the checkbox')); return; }
      const yahoo = 'https://query1.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(fq) + '&lang=en-US&region=US&quotesCount=6&newsCount=0';
      const r = await fetch(PROXY_PASS + '?url=' + encodeURIComponent(yahoo), { headers: { 'x-turnstile-token': tsToken } });
      if (!r.ok){ acDiag(drop, (zh ? '搜尋失敗:' : 'Search failed: ') + 'HTTP ' + r.status); return; }
      const data = await r.json();
      const quotes = (data.quotes || []).filter(x => x.symbol && x.quoteType !== 'OPTION').slice(0, 6);
      if (!quotes.length){ acDiag(drop, zh ? '找不到符合的代碼' : 'No matching tickers'); return; }
      drop.innerHTML = quotes.map(qt => {
        const sym = String(qt.symbol).replace(/[^A-Za-z0-9.\-]/g,'').toUpperCase();
        return '<div class="ac-item" onclick="acSelect(\'' + sym + '\')">' +
          '<span class="ac-symbol">' + acEsc(qt.symbol) + '</span>' +
          '<span class="ac-name">' + acEsc(qt.longname || qt.shortname || '') + '</span>' +
          '<span class="ac-exchange">' + acEsc(qt.exchDisp || qt.exchange || '') + '</span></div>';
      }).join('');
      drop.classList.add('open');
    }catch(e){ acDiag(drop, (zh ? '搜尋失敗:' : 'Search failed: ') + (e && e.message || e)); }
  }, 600);
}

// 選代碼 → 直接跳首頁自動試算(跟 ctaGo 同一條路徑)
function acSelect(symbol){
  const v = (symbol || '').toUpperCase().replace(/[^A-Z0-9.\-]/g,'');
  if (!v) return;
  window.location.href = 'https://dcacafe.com/?ticker=' + encodeURIComponent(v);
}

// 點選單/輸入框以外的地方就關閉
document.addEventListener('click', e => {
  document.querySelectorAll('.ac-dropdown.open').forEach(d => {
    const inp = document.getElementById(d.dataset.linkedInput || '');
    if (!d.contains(e.target) && !(inp && inp.contains(e.target))) d.classList.remove('open');
  });
});

function fmtUpdatedUTC(iso){
  if(!iso) return null;
  const d = new Date(iso); if(isNaN(d.getTime())) return null;
  const p = n => String(n).padStart(2,'0');
  return d.getUTCFullYear()+'-'+p(d.getUTCMonth()+1)+'-'+p(d.getUTCDate())+' '+p(d.getUTCHours())+':'+p(d.getUTCMinutes())+' UTC';
}
function applyStatic() {
  document.documentElement.lang = LANG === 'zh' ? 'zh-Hant' : 'en';

  /* NAV */
  const lg = document.querySelector('#nav .lang'); if (lg) lg.textContent = LANG === 'zh' ? 'EN' : '中';
  setText('#nav .login', U.nav.login);

  /* HERO */
  setText('#hero .tkr', asset.ticker);
  setText('#hero .co', asset.company);
  setText('#hero .px', asset.price);
  const chg = document.querySelector('#hero .chg');
  if (chg) { chg.textContent = px(asset.change.txt); chg.className = 'chg ' + asset.change.dir; }
  setText('#hero .sn', asset.score);
  { const sz = document.querySelector('#hero .sz');
    if (sz) {
      if (asset.score >= 60 && asset.multiplier) {
        sz.textContent = px(U.multSuggest).replace('{M}', Number(asset.multiplier).toFixed(1));
        sz.style.color = '#FF9F0A';
      } else {
        sz.textContent = px(U.multKeep);
        sz.style.color = '#8B93A1';
      }
    } }
  setText('#hero .sk', 'DCA SCORE');
  setHTML('#hero .hint', BK.score[asset.tier][LANG][asset.scorePick || 0]);
  const hl = document.getElementById('heroLogo');
  if (hl) {
    /* logo 一律走 js/logo.js,與首頁同一條路徑(本地修補表 → Brandfetch → 文字後備)。
       這裡不再自己拼網址,新增資產也就不必手動填網域。

       createLogoImg() 會自己生一個固定 px 的方塊(含圓角、邊框、底色)。但 hero 這顆的
       大小是 heroFit() 每次重繪時量文字高度動態給的,固定 px 會跟不上,而且框裡再套一個框
       就是那圈白邊的來源。所以把內層攤平成 100%,尺寸與圓角一律交給外層 #hero .logo。
       尺寸傳 128 只影響向對方要幾 px 的圖(取兩倍 = 256),與顯示大小無關,不會蓋掉 heroFit。 */
    hl.innerHTML = '';
    if (typeof createLogoImg === 'function') {
      try {
        const box = createLogoImg(asset.ticker, 128);
        box.style.cssText = 'width:100%;height:100%;border-radius:0;border:none;background:transparent;display:flex;align-items:center;justify-content:center;overflow:hidden;';
        const im = box.querySelector('img');
        if (im) { im.style.cssText = 'width:100%;height:100%;object-fit:cover;padding:0;display:block;'; im.alt = asset.ticker; }
        hl.appendChild(box);
      } catch (e) { hl.textContent = asset.logo; }
    } else { hl.textContent = asset.logo; }
  }
  { const hu = document.getElementById('heroUpdated');
    if (hu) { const t = fmtUpdatedUTC(asset.updatedAt); hu.textContent = t ? (px(U.dataStampLbl) + '\uff1a' + t) : ''; } }

  /* INTRO */
  setText('#intro .eyebrow', U.intro.eyebrow);
  setTitle('#intro .sec-title', U.intro.title);
  const ib = document.querySelector('#intro .body');
  if (ib) ib.innerHTML = asset.intro[LANG].map(p =>
    '<p><span class="lead">' + p.lead + '</span>' + ip(p.body) + '</p>').join('');

  /* FIVE-FACTOR 標題(卡片本體由 RERENDER 處理) */
  setText('#secF .eyebrow', U.factors.eyebrow);
  setTitle('#secF .sec-title', U.factors.title);
  setText('#secF .sec-sub', U.factors.sub);

  /* CHART A */
  setText('#secA .eyebrow', U.chartA.eyebrow);
  setTitle('#secA .sec-title', U.chartA.title);
  const ca = document.querySelector('#secA .chart-intro');
  if (ca) ca.innerHTML = BK.chartAIntro[LANG].map(p => '<p>' + ip(p) + '</p>').join('')
    + '<p class="ax-inlink">' + ip(px(U.chartA.btLink)).replace('{A}',
        '<a href="https://dcacafe.com/?ticker=' + encodeURIComponent(asset.query || asset.ticker) + '#backtest">'
        + px(U.chartA.btLinkA) + '</a>') + '</p>';
  document.querySelectorAll('#caPeriod button').forEach(b =>
    b.textContent = b.dataset.y + (LANG === 'zh' ? ' 年' : ' yr'));
  setText('#secA .tg-price', U.chartA.tPrice);
  setText('#caTgScore', U.chartA.tScore);
  const hn = document.querySelector('#caTgHeat .tg-heat-name'); if (hn) hn.textContent = px(U.chartA.tHeat);
  const eHi = document.querySelector('#secA .ext.hi .ext-lbl');
  const eLo = document.querySelector('#secA .ext.lo .ext-lbl');
  if (eHi) eHi.innerHTML = '<span class="ext-k">DCA Score</span>' + px(U.chartA.hi);
  if (eLo) eLo.innerHTML = '<span class="ext-k">DCA Score</span>' + px(U.chartA.lo);

  /* CHART B 靜態(cbIntro/legend/extremes 由該圖 render 依 LANG 重畫) */
  setText('#secB .eyebrow', U.chartB.eyebrow);
  setTitle('#secB .sec-title', U.chartB.title);
  const mb = document.querySelectorAll('#cbMode button');
  if (mb.length === 2) {
    mb[0].innerHTML = '<b>' + px(U.chartB.mDdT) + '</b><small>' + px(U.chartB.mDdS) + '</small>';
    mb[1].innerHTML = '<b>' + px(U.chartB.mDvT) + '</b><small>' + px(U.chartB.mDvS) + '</small>';
  }
  document.querySelectorAll('#cbPeriod button').forEach(b =>
    b.textContent = b.dataset.y + (LANG === 'zh' ? '年' : 'yr'));

  /* BASIC DATA 標題(卡片由 RERENDER 處理) */
  setText('#secBD .eyebrow', U.basic.eyebrow);
  setTitle('#secBD .sec-title', U.basic.title);
  setText('#secBD .sec-sub', U.basic.sub);
  const bt = document.querySelectorAll('#secBD .block-t');
  if (bt.length === 3) { const w=px(U.basic.bWhat); if(w){bt[0].textContent=w;bt[0].style.display='';}else{bt[0].style.display='none';} bt[1].textContent = px(asset.bEarn || U.basic.bEarn); bt[2].textContent = px(asset.bRisk || U.basic.bRisk); }

  /* CLOSING */
  setText('#closing .eyebrow', U.closing.eyebrow);
  setTitle('#closing .sec-title', U.closing.title);
  setText('#closing .close-p1', BK.closing.p1);
  setText('#closing .close-p2', BK.closing.p2);
  { const bb = document.getElementById('closingBtBtn'); if (bb) bb.textContent = R(U.closing.btBtn) + ' \u2192'; }

  /* FAQ */
  setText('#faq .eyebrow', U.faq.eyebrow);
  setTitle('#faq .sec-title', U.faq.title);
  const fl = document.getElementById('faqList');
  if (fl) fl.innerHTML = asset.faq.map(f =>
    '<div class="faq-item"><button class="faq-q">' + R(f.q) +
    '<span class="faq-chev">\u25be</span></button><div class="faq-a"><p>' + R(f.a) + '</p></div></div>').join('');
  setText('#faq .faq-more', U.faq.more);
  { const zh = LANG === 'zh';
    const setId = (id,t)=>{ const e=document.getElementById(id); if(e) e.textContent=t; };
    setId('relEyebrow', zh?'相關資產':'Related assets');
    setId('relTitle', zh?'同類熱門，即將登場。':'More like this, coming soon.');
    setId('relPh', zh?'更多資產陸續上線':'More assets coming soon'); }
  // FAQPage 結構化資料:從同一份 faq 生成,文字與畫面一致、隨語言同步
  try {
    const ld = { '@context':'https://schema.org', '@type':'FAQPage',
      mainEntity: asset.faq.map(f => ({ '@type':'Question', name: R(f.q),
        acceptedAnswer: { '@type':'Answer', text: R(f.a) } })) };
    let el = document.getElementById('faqLd');
    if (!el) { el = document.createElement('script'); el.type = 'application/ld+json'; el.id = 'faqLd'; (document.head||document.body).appendChild(el); }
    el.textContent = JSON.stringify(ld);
  } catch(e) { console.error('faqLd', e); }

  /* CTA */
  setText('#cta h3', U.cta.h3);
  setText('#cta p', U.cta.p);
  const ci = document.querySelector('#cta .cta-input'); if (ci) ci.placeholder = px(U.cta.ph);
  setText('#cta .btn', U.cta.btn);

  /* FOOTER */
  const fa = document.querySelectorAll('#footer .flinks a');
  if (fa.length === 4) { fa[0].textContent = px(U.footer.about); fa[1].textContent = px(U.footer.blog); fa[2].textContent = px(U.footer.member); fa[3].textContent = px(U.footer.contact); }
  setText('#footer .fdisc', U.footer.disc);
  // 資料更新時間改由 heroUpdated 顯示(見上方)

  /* SEO(title / meta / og / h1 / aria) */
  document.title = R(COPY.seo.title);
  const desc = ip(COPY.seo.description[LANG][COPY.seo.descPick]);
  setMeta('description', desc);
  // 分享(og/twitter)以靜態 head 為單一來源(爬蟲不跑 JS,只讀 head;標題一律英文、不放分數、圖共用首頁圖)。
  // 這裡不再用 JS 覆蓋 og/twitter,避免被切成中文或塞進會過期的分數。每支資產只需改 head 那一段。
  const h1 = document.getElementById('seoH1'); if (h1) h1.textContent = R(COPY.seo.h1);
  const aria = (id, alt) => { const e = document.getElementById(id); if (e) { e.setAttribute('role', 'img'); e.setAttribute('aria-label', R(alt)); } };
  aria('heroBean', COPY.seo.alt.bean); aria('caPlot', COPY.seo.alt.chartA); aria('cbPlot', COPY.seo.alt.chartB);
}

function setLang(l) {
  LANG = l;
  applyStatic();
  RERENDER.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
}

/* ══════════════ 共用假資料(整頁單一真相來源)══════════════ */
const WEEKS=520, MS_W=7*864e5, NOW=Date.now();
const PX=[], TS=[];
(function(){
  let p=95, drift=0.0028;
  const crashes=[[80,-0.024,10],[212,-0.055,7],[300,-0.03,9],[430,-0.02,12],[502,-0.006,12]];
  for(let i=0;i<WEEKS;i++){
    const wob=(Math.sin(i*0.17)+Math.sin(i*0.05)*1.3)*0.007;
    let sh=0; crashes.forEach(([c,m,d])=>{if(i>=c&&i<c+d)sh+=m;});
    p=Math.max(50,p*(1+drift+wob+sh)); PX.push(p); TS.push(NOW-(WEEKS-1-i)*MS_W);
  }
  const f=214/PX[WEEKS-1]; for(let i=0;i<WEEKS;i++) PX[i]=+(PX[i]*f).toFixed(2);
})();
const DD=[],DEV=[],SCORE=[];
for(let i=0;i<WEEKS;i++){let hi=PX[i];for(let j=Math.max(0,i-51);j<=i;j++)hi=Math.max(hi,PX[j]);DD.push((PX[i]/hi-1)*100);}
for(let i=0;i<WEEKS;i++){let s=0,n=0;for(let j=Math.max(0,i-199);j<=i;j++){s+=PX[j];n++;}DEV.push((PX[i]/(s/n)-1)*100);}
(function(){const raw=[];for(let i=0;i<WEEKS;i++){let hi=PX[i];for(let j=Math.max(0,i-51);j<=i;j++)hi=Math.max(hi,PX[j]);raw.push(Math.min(100,Math.max(0,-(PX[i]/hi-1)*300+15)));}
  for(let i=0;i<WEEKS;i++){let s=0,n=0;for(let j=Math.max(0,i-4);j<=Math.min(WEEKS-1,i+4);j++){s+=raw[j];n++;}SCORE.push(Math.round(s/n));}})();
const fmtYM=t=>{const d=new Date(t);return d.getFullYear()+'/'+String(d.getMonth()+1).padStart(2,'0');};

/* ══════════════ HERO 咖啡豆(定值 62)══════════════ */
(function(){
  const PLATE="#0e0f12";
  const Z=[{max:59,main:"#FF453A",light:"#FF7A72"},{max:79,main:"#FF9F0A",light:"#FFC24D"},
           {max:89,main:"#30D158",light:"#5CE68A"},{max:100,main:"#30D158",light:"#5CE68A"}];
  const zone=s=>Z.find(z=>s<=z.max)||Z[Z.length-1];
  const CX=110,CY=110,A=78,B=96,N=2.2,LEAN=30,GAP=11;
  const rp=(x,y,cx,cy,deg)=>{const r=deg*Math.PI/180,dx=x-cx,dy=y-cy;return [cx+dx*Math.cos(r)-dy*Math.sin(r),cy+dx*Math.sin(r)+dy*Math.cos(r)];};
  const P=pts=>pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ")+" Z";
  const PL=pts=>pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
  function outline(){const K=88,pts=[];let minY=1e9,maxY=-1e9;
    for(let i=0;i<=K;i++){const t=-Math.PI/2+i/K*2*Math.PI,ct=Math.cos(t),st=Math.sin(t);
      const x=CX+A*Math.sign(ct)*Math.pow(Math.abs(ct),2/N),y=CY+B*Math.sign(st)*Math.pow(Math.abs(st),2/N);
      const [rx,ry]=rp(x,y,CX,CY,LEAN);if(ry<minY)minY=ry;if(ry>maxY)maxY=ry;pts.push([rx,ry]);}
    return {path:P(pts),yTop:minY,yBot:maxY};}
  function sPts(){const P0=[CX,CY-B],P1=[CX+54,CY-36],P2=[CX-54,CY+36],P3=[CX,CY+B],out=[];
    for(let i=0;i<=26;i++){const t=i/26,u=1-t;
      out.push([u*u*u*P0[0]+3*u*u*t*P1[0]+3*u*t*t*P2[0]+t*t*t*P3[0],u*u*u*P0[1]+3*u*u*t*P1[1]+3*u*t*t*P2[1]+t*t*t*P3[1]]);}return out;}
  function region(side){const s=sPts(),g=GAP/2,far=side<0?CX-320:CX+320,edge=[];
    for(const p of s)edge.push([p[0]+side*g,p[1]]);const poly=[...edge,[far,CY+150],[far,CY-150]];
    return P(poly.map(p=>rp(p[0],p[1],CX,CY,LEAN)));}
  const sEdge=side=>{const s=sPts(),g=GAP/2;return PL(s.map(p=>rp(p[0]+side*g,p[1],CX,CY,LEAN)));};
  function render(s){
    const z=zone(s),o=outline(),lvl=o.yBot-(s/100)*(o.yBot-o.yTop);
    const L=region(-1),R=region(1),eL=sEdge(-1),eR=sEdge(1);
    const AMP=2.6,WL=150,PH=0.7;let waveFill=`M -12 ${lvl.toFixed(1)}`,waveLine='';
    for(let x=-12;x<=252;x+=6){const edge=0.55+0.45*Math.abs((x-CX)/CX);const y=(lvl-AMP*edge*Math.sin((x/WL)*2*Math.PI+PH)).toFixed(1);waveFill+=` L ${x} ${y}`;waveLine+=(x<=-12?'M':'L')+` ${x} ${y}`;}
    waveFill+=` L 252 262 L -12 262 Z`;
    document.getElementById("heroBean").innerHTML=`<svg width="220" height="220" viewBox="0 0 220 220"><defs>
      <radialGradient id="hbbean" cx="0.5" cy="0.42" r="0.66"><stop offset="0" stop-color="#8a5a34"/><stop offset="0.55" stop-color="#6b4526"/><stop offset="1" stop-color="#3b230f"/></radialGradient>
      <clipPath id="hbell"><path d="${o.path}"/></clipPath><clipPath id="hbL"><path d="${L}"/></clipPath><clipPath id="hbR"><path d="${R}"/></clipPath>
      <linearGradient id="hbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${z.light}"/><stop offset="1" stop-color="${z.main}"/></linearGradient>
      <radialGradient id="hbhL" cx="0.32" cy="0.22" r="0.6"><stop offset="0" stop-color="rgba(255,255,255,.5)"/><stop offset="0.6" stop-color="rgba(255,255,255,.05)"/><stop offset="1" stop-color="rgba(255,255,255,0)"/></radialGradient>
      <radialGradient id="hbhR" cx="0.72" cy="0.62" r="0.5"><stop offset="0" stop-color="rgba(255,255,255,.28)"/><stop offset="1" stop-color="rgba(255,255,255,0)"/></radialGradient>
      <filter id="hbgl" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="${z.main}" flood-opacity="0.5"/></filter></defs>
      <g filter="url(#hbgl)"><path d="${o.path}" fill="url(#hbbean)"/></g>
      <g clip-path="url(#hbell)">
        <g clip-path="url(#hbL)"><path d="${waveFill}" fill="url(#hbg)"/><rect x="0" y="0" width="240" height="260" fill="url(#hbhL)"/></g>
        <g clip-path="url(#hbR)"><path d="${waveFill}" fill="url(#hbg)"/><rect x="0" y="0" width="240" height="260" fill="url(#hbhR)"/></g>
        <path d="${waveLine}" fill="none" stroke="${z.light}" stroke-width="1.4" opacity="0.5"/></g>
      <path d="${eL}" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="2" stroke-linecap="round"/>
      <path d="${eR}" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1.6" stroke-linecap="round"/>
      <g clip-path="url(#hbL)"><path d="${o.path}" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="1.5"/></g>
      <g clip-path="url(#hbR)"><path d="${o.path}" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="1.5"/></g></svg>`;
  }
  window.__heroBean = render;
  render(62);
})();

/* ══════════════ 五因子(單一當下狀態)══════════════ */
(function(){
  const RED="#ef4444",GRN="#22c55e",AMB="#f59e0b",REDrgb="239,68,68",GRNrgb="34,197,94";
  const chartCol=d=>d?RED:GRN, chartRgb=d=>d?REDrgb:GRNrgb;
  const goodCol=g=>g==="green"?"#5c9b6b":g==="amber"?"#c08a3a":"#c06a5c";
  const polar=(cx,cy,r,deg)=>{const a=deg*Math.PI/180;return [cx+r*Math.cos(a),cy-r*Math.sin(a)];};
  function arcP(cx,cy,r,a1,a2){const [x1,y1]=polar(cx,cy,r,a1),[x2,y2]=polar(cx,cy,r,a2);
    const large=Math.abs(a1-a2)>180?1:0;return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 0 ${x2.toFixed(1)} ${y2.toFixed(1)}`;}
  function gc(t){const s=[[239,68,68],[245,158,11],[34,197,94]];let a,b,f;
    if(t<.5){a=s[0];b=s[1];f=t/.5;}else{a=s[1];b=s[2];f=(t-.5)/.5;}
    return `rgb(${Math.round(a[0]+(b[0]-a[0])*f)},${Math.round(a[1]+(b[1]-a[1])*f)},${Math.round(a[2]+(b[2]-a[2])*f)})`;}
  function smooth(pts){let d=`M ${pts[0][0]} ${pts[0][1]}`;
    for(let i=0;i<pts.length-1;i++){const p0=pts[i-1]||pts[i],p1=pts[i],p2=pts[i+1],p3=pts[i+2]||p2;
      d+=` C ${(p1[0]+(p2[0]-p0[0])/6).toFixed(1)} ${(p1[1]+(p2[1]-p0[1])/6).toFixed(1)}, ${(p2[0]-(p3[0]-p1[0])/6).toFixed(1)} ${(p2[1]-(p3[1]-p1[1])/6).toFixed(1)}, ${p2[0]} ${p2[1]}`;}return d;}
  function glow(id,pts,down,baselineY){const W=320,H=112,col=chartCol(down),rgb=chartRgb(down),line=smooth(pts);
    const area=line+` L ${pts[pts.length-1][0]} ${H} L ${pts[0][0]} ${H} Z`,[ex,ey]=pts[pts.length-1];
    const base=baselineY!=null?`<line x1="6" y1="${baselineY}" x2="${W-6}" y2="${baselineY}" stroke="#cdcabf" stroke-width="1.2" stroke-dasharray="4 5"/><text x="${W-6}" y="${baselineY-6}" text-anchor="end" fill="#c2beb3" font-size="11" font-family="-apple-system">${LANG==='zh'?'200 週均線':'200-wk avg'}</text>`:"";
    return `<svg viewBox="0 0 ${W} ${H}"><defs><linearGradient id="ar_${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(${rgb},.18)"/><stop offset="1" stop-color="rgba(${rgb},0)"/></linearGradient></defs>${base}<path d="${area}" fill="url(#ar_${id})"/><path d="${line}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round"/><circle cx="${ex}" cy="${ey}" r="4.5" fill="${col}"/></svg>`;}
  const A_START=208,A_SWEEP=236;
  function gauge(frac,greenSide){const W=320,H=150,cx=160,cy=118,r=104,SEG=48;let s="";
    for(let i=0;i<SEG;i++){const a0=A_START-i/SEG*A_SWEEP,a1=A_START-(i+1)/SEG*A_SWEEP,t=(i+.5)/SEG;
      s+=`<path d="${arcP(cx,cy,r,a0,a1)}" fill="none" stroke="${gc(greenSide==='left'?1-t:t)}" stroke-width="13"/>`;}
    const ang=A_START-frac*A_SWEEP,[tx,ty]=polar(cx,cy,r-9,ang),pc=gc(greenSide==='left'?1-frac:frac);
    return `<svg viewBox="0 0 ${W} ${H}">${s}<line x1="${cx}" y1="${cy}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="#2b2b26" stroke-width="3.4" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="7" fill="#2b2b26"/><circle cx="${cx}" cy="${cy}" r="3" fill="${pc}"/></svg>`;}
  function bars(pct){const W=320,H=94,y=30,h=30,x0=8,x1=W-8,inW=x1-x0,lvl=x0+inW*pct;
    return `<svg viewBox="0 0 ${W} ${H}"><defs><linearGradient id="pf" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${RED}"/><stop offset=".5" stop-color="${AMB}"/><stop offset="1" stop-color="${GRN}"/></linearGradient></defs>
      <rect x="${x0}" y="${y}" width="${inW}" height="${h}" rx="7" fill="url(#pf)" opacity=".2"/>
      <rect x="${x0}" y="${y}" width="${(lvl-x0).toFixed(1)}" height="${h}" rx="7" fill="url(#pf)"/>
      <line x1="${lvl.toFixed(1)}" y1="${y-6}" x2="${lvl.toFixed(1)}" y2="${y+h+6}" stroke="#15150f" stroke-width="2.6"/>
      <text x="${x0}" y="${y+h+20}" fill="#bdbab0" font-size="12" font-family="-apple-system">低倍數</text>
      <text x="${x1}" y="${y+h+20}" text-anchor="end" fill="#bdbab0" font-size="12" font-family="-apple-system">高倍數</text></svg>`;}

  // 迷你線端點高度隨百分位:百分位高(機會大)→ 線往上收
  const sparkP=(p)=>{const q=Math.max(0,Math.min(1,p==null?0.5:p)),lo=20,hi=92,endY=hi-(hi-lo)*q;
    return [[12,56],[86,52],[160,50],[234,(52+endY)/2],[308,endY]];};
  const VIZ={
    ma:  (p)=>glow("t",sparkP(p),true,54),
    rsi: (p)=>gauge(Math.max(0,Math.min(1,p==null?0.5:p)),'left'),
    dd:  (p)=>glow("d",sparkP(p),true,null),
    vix: (p)=>gauge(Math.max(0,Math.min(1,p==null?0.5:p)),'left'),
    pfcf:(p)=>bars(Math.max(0,Math.min(1,p==null?0.5:p)))
  };
  const F_ORDER=['ma','rsi','dd','vix','pfcf'];
  function renderFactors(){
    const F=COPY.banks.factors, A=COPY.asset.factors;
    // 加密資產沒有現金流可算,P·FCF 這張卡整張不出現(其餘四張排版不變)
    const ORDER = COPY.asset.isCrypto ? F_ORDER.filter(id => id !== 'pfcf') : F_ORDER;
    document.getElementById("factorGrid").innerHTML=ORDER.map(id=>{
      const meta=F[id], st=A[id], cell=meta[st.color];
      const k=meta.code+' \u00b7 '+px(meta.name);
      return `<div class="card"><div class="k">${k}</div>
        <div class="viz">${VIZ[id](st.percentile)}</div><div class="bignum">${px(st.num)}</div><div class="auxi">${px(st.aux)}</div>
        <div class="hr"></div><div class="analysis" style="color:${goodCol(st.color)}">${px(cell.lab)}</div>
        <div class="fnote">${px(cell.note)}</div></div>`;
    }).join("");
  }
  renderFactors(); RERENDER.push(renderFactors);
})();

// 13 週置中平均(H=6),與 expand-report.js 的 erDrawOverlayChart 完全一致;圖 A/B 共用
function smooth13(arr){ const H=6, out=new Array(arr.length);
  for(let i=0;i<arr.length;i++){ let s=0,c=0; for(let j=Math.max(0,i-H);j<Math.min(arr.length,i+H+1);j++){ s+=arr[j]; c++; } out[i]=s/c; }
  return out; }

/* ══════════════ CHART A ══════════════ */
(function(){
  const buildDataA=()=>PX.map((p,i)=>({t:TS[i],price:p,score:SCORE[i]}));
  const colorForScore=s=>s<60?null:s<70?'#f0d9bb':s<80?'#e5bd8c':s<90?'#d69f5c':'#c8813a';
  const scoreCol=s=>s<60?'#a5a299':s<70?'#d9b47e':s<80?'#d69f5c':s<90?'#c8813a':'#b06a1e';
  const st={years:10,price:true,score:true,heat:false,scoreColor:'#f08a24'};
  const scoreTierColor=s=>s<60?'#e0463c':s<80?'#e0a53a':'#3fa46a';
  const VW=700,VH=264,PADT=22,PADB=20;let GEO=null;
  const $=id=>document.getElementById(id);
  const slice=()=>{const n=Math.min(WEEKS,st.years*52);return buildDataA().slice(WEEKS-n);};
  function render(){
    const dataA=buildDataA();
    const s=slice(),N=s.length,prices=s.map(d=>d.price),pMin=Math.min(...prices),pMax=Math.max(...prices),ch=VH-PADT-PADB;
    const PADL=78,PADR=16,gx=i=>PADL+(i/(N-1))*(VW-PADL-PADR), gyP=p=>PADT+(1-(Math.log(p)-Math.log(pMin))/(Math.log(pMax)-Math.log(pMin)))*ch, gyS=v=>PADT+(1-v/100)*ch, barW=VW/N;
    let bands='';if(st.heat)s.forEach((d,i)=>{const c=colorForScore(d.score);if(c)bands+=`<rect x="${(gx(i)-barW/2).toFixed(1)}" y="${PADT}" width="${(barW+0.6).toFixed(1)}" height="${ch}" fill="${c}" opacity="0.9"/>`;});
    const yT=[pMin,Math.sqrt(pMin*pMax),pMax];let gridY='';yT.forEach(p=>{gridY+=`<line x1="0" y1="${gyP(p).toFixed(1)}" x2="${VW}" y2="${gyP(p).toFixed(1)}" stroke="#efeeea" stroke-width="1"/>`;});
    let priceLine='';if(st.price){let d='';s.forEach((r,i)=>d+=`${i?'L':'M'}${gx(i).toFixed(1)},${gyP(r.price).toFixed(1)} `);priceLine=`<path d="${d}" fill="none" stroke="#3a3a3c" stroke-width="2" opacity="0.9"/>`;}
    const smA=smooth13(s.map(r=>r.score));
    let scoreLine='';if(st.score){let d='';s.forEach((r,i)=>d+=`${i?'L':'M'}${gx(i).toFixed(1)},${gyS(smA[i]).toFixed(1)} `);scoreLine=`<path d="${d}" fill="none" stroke="${st.scoreColor}" stroke-width="2.6"/>`;}
    $('caSvg').innerHTML=`${bands}${gridY}${priceLine}${scoreLine}`;
    GEO={N,s,xf:s.map((_,i)=>gx(i)/VW),pyf:s.map(r=>gyP(r.price)/VH),syf:smA.map(v=>gyS(v)/VH)};
    const plot=$('caPlot');[...plot.querySelectorAll('.ylab')].forEach(e=>e.remove());
    const Hpx=plot.clientHeight,Wpx=plot.clientWidth;
    yT.forEach(p=>{const el=document.createElement('div');el.className='ylab l';el.style.top=(gyP(p)/VH*Hpx)+'px';el.textContent='$'+Math.round(p);plot.appendChild(el);});
    if(st.score){[{v:100},{v:0}].forEach(o=>{const el=document.createElement('div');el.className='ylab r';el.style.top=(gyS(o.v)/VH*Hpx)+'px';el.textContent=o.v;plot.appendChild(el);});}
    const xrow=$('caXrow');xrow.innerHTML='';const oneYr=st.years===1;
    const marks=[];let mk=null;
    s.forEach((r,i)=>{const d=new Date(r.t);const key=oneYr?d.getFullYear()+'-'+d.getMonth():d.getFullYear();if(key!==mk){mk=key;marks.push({i,d});}});
    marks.forEach((m,k)=>{const x=gx(m.i)/VW*Wpx;
      const tk=document.createElement('div');tk.className='xtick';tk.style.left=x+'px';xrow.appendChild(tk);
      if(k===0||k===marks.length-1){const el=document.createElement('div');el.className='xlab '+(k===0?'head':'tail');el.style.left=x+'px';
        el.textContent=oneYr?(m.d.getFullYear()+'/'+String(m.d.getMonth()+1).padStart(2,'0')):m.d.getFullYear();xrow.appendChild(el);}});
    let hs=-1,ls=101,hw=null,lw=null;dataA.forEach(r=>{if(r.score>hs){hs=r.score;hw=r;}if(r.score<ls){ls=r.score;lw=r;}});
    const hiEl=$('caHiScore'),loEl=$('caLoScore');
    hiEl.textContent=hs;hiEl.style.color=scoreTierColor(hs);$('caHiSub').textContent=fmtYM(hw.t)+' · $'+Math.round(hw.price);
    loEl.textContent=ls;loEl.style.color=scoreTierColor(ls);$('caLoSub').textContent=fmtYM(lw.t)+' · $'+Math.round(lw.price);
  }
  function scrub(clientX){if(!GEO)return;const plot=$('caPlot'),rect=plot.getBoundingClientRect();
    let fx=(clientX-rect.left)/rect.width;fx=Math.max(0,Math.min(1,fx));let idx=Math.round(fx*(GEO.N-1));idx=Math.max(0,Math.min(GEO.N-1,idx));
    const Wpx=rect.width,Hpx=rect.height,r=GEO.s[idx],xpx=GEO.xf[idx]*Wpx;
    const scan=$('caScan');scan.style.left=xpx+'px';scan.style.height=Hpx+'px';scan.style.opacity=.6;
    const pdot=$('caPdot'),sdot=$('caSdot');
    if(st.price){pdot.style.left=xpx+'px';pdot.style.top=(GEO.pyf[idx]*Hpx)+'px';pdot.style.background='#3a3a3c';pdot.style.opacity=1;}else pdot.style.opacity=0;
    if(st.score){sdot.style.left=xpx+'px';sdot.style.top=(GEO.syf[idx]*Hpx)+'px';sdot.style.background=st.scoreColor;sdot.style.opacity=1;}else sdot.style.opacity=0;
    const tip=$('caTip');tip.innerHTML=`<div class="d">${fmtYM(r.t)}</div>${LANG==='zh'?'價格':'Price'} <b>$${Math.round(r.price)}</b>　${LANG==='zh'?'分數':'Score'} <b style="color:${scoreCol(r.score)}">${r.score}</b>`;
    tip.style.opacity=1;let tx=xpx,half=tip.offsetWidth/2;tx=Math.max(half+2,Math.min(Wpx-half-2,tx));tip.style.left=tx+'px';}
  const end=()=>['caScan','caPdot','caSdot','caTip'].forEach(id=>$(id).style.opacity=0);
  const plotEl=$('caPlot');
  plotEl.addEventListener('pointerdown',e=>{plotEl.setPointerCapture(e.pointerId);scrub(e.clientX);});
  plotEl.addEventListener('pointermove',e=>{if(e.buttons>0||e.pointerType==='touch'||window.matchMedia('(min-width:960px)').matches)scrub(e.clientX);});
  plotEl.addEventListener('pointerup',end);plotEl.addEventListener('pointerleave',end);
  $('caPeriod').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$('caPeriod').querySelectorAll('button').forEach(x=>x.classList.remove('on'));b.classList.add('on');st.years=+b.dataset.y;render();});
  $('caTgScore').addEventListener('click',()=>{st.score=!st.score;$('caTgScore').classList.toggle('is-on',st.score);render();});
  $('caTgHeat').addEventListener('click',()=>{st.heat=!st.heat;$('caTgHeat').classList.toggle('is-on',st.heat);render();});
  window.addEventListener('resize',render);render();RERENDER.push(render);
})();

/* ══════════════ CHART B ══════════════ */
(function(){
  const st={mode:'dd',years:10};const VW=700,VH=158,PADT=13,PADB=15;let GEO=null;
  const $=id=>document.getElementById(id);
  const G='#3fa46a',AM='#e0a53a',R='#e0463c';
  const ddGood=v=>{const depth=-v;return depth>=20?G:depth>=8?AM:R;};
  const devGood=v=>v<=-5?G:v>=5?R:AM;
  // 對齊 score.js 的訊號燈門檻:percentile ≥0.6 綠 / 0.3–0.6 黃 / <0.3 紅(切百分位，非絕對%)
  // percentile = 該值的「有利程度(=-value，越負越有利)」在全歷史中的排名比例。中間色用黃#e8b53a，與分數線橘拉開。
  const pctFav=(val,arr)=>{const fav=-val;let c=0;for(const v of arr){if(-v<=fav)c++;}return c/arr.length;};
  const pctColor=p=>p>=0.6?'#3fa46a':p>=0.3?'#e8b53a':'#e0463c';
  function render(){
    const n=Math.min(WEEKS,st.years*52),start=WEEKS-n;
    const tsl=TS.slice(start),prl=PX.slice(start),scl=smooth13(SCORE.slice(start)),N=n,isDD=st.mode==='dd';
    const raw=(isDD?DD:DEV).slice(start),main=smooth13(isDD?raw.map(v=>-v):raw),ch=VH-PADT-PADB,PADL=76,PADR=54,gx=i=>PADL+(i/(N-1))*(VW-PADL-PADR);
    let mMin,mMax;if(isDD){mMin=0;mMax=Math.max(...main,1);}else{const a=Math.max(...main,0),b=Math.min(...main,0),pad=(a-b)*0.1||1;mMax=a+pad;mMin=b-pad;}
    const gyM=v=>PADT+(1-(v-mMin)/(mMax-mMin))*ch,gyS=v=>PADT+(1-v/100)*ch;
    let mainSvg='',mline='';
    main.forEach((v,i)=>mline+=(i?'L':'M')+`${gx(i).toFixed(1)},${gyM(v).toFixed(1)} `);
    if(isDD){const area=mline+`L ${gx(N-1).toFixed(1)},${VH} L ${gx(0).toFixed(1)},${VH} Z`;
      mainSvg=`<defs><linearGradient id="cbgd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(58,58,60,.24)"/><stop offset="0.7" stop-color="rgba(58,58,60,.06)"/><stop offset="1" stop-color="rgba(58,58,60,.01)"/></linearGradient></defs><path d="${area}" fill="url(#cbgd)"/><path d="${mline}" fill="none" stroke="#3a3a3c" stroke-width="2.1"/>`;
    }else{const y0=gyM(0),areaTo0=mline+`L ${gx(N-1).toFixed(1)},${y0.toFixed(1)} L ${gx(0).toFixed(1)},${y0.toFixed(1)} Z`;
      mainSvg=`<defs><clipPath id="cbAbove"><rect x="0" y="0" width="${VW}" height="${y0.toFixed(1)}"/></clipPath><clipPath id="cbBelow"><rect x="0" y="${y0.toFixed(1)}" width="${VW}" height="${(VH-y0).toFixed(1)}"/></clipPath>
        <linearGradient id="cbAbG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(63,164,106,.26)"/><stop offset="1" stop-color="rgba(63,164,106,0)"/></linearGradient>
        <linearGradient id="cbBeG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(224,70,60,0)"/><stop offset="1" stop-color="rgba(224,70,60,.26)"/></linearGradient></defs>
        <path d="${areaTo0}" fill="url(#cbAbG)" clip-path="url(#cbAbove)"/><path d="${areaTo0}" fill="url(#cbBeG)" clip-path="url(#cbBelow)"/>
        <line x1="0" y1="${y0.toFixed(1)}" x2="${VW}" y2="${y0.toFixed(1)}" stroke="#c9c6bd" stroke-width="1" stroke-dasharray="4 4"/><path d="${mline}" fill="none" stroke="#7a776f" stroke-width="1.8"/>`;}
    let sline='';scl.forEach((v,i)=>sline+=(i?'L':'M')+`${gx(i).toFixed(1)},${gyS(v).toFixed(1)} `);
    $('cbSvg').innerHTML=mainSvg+`<path d="${sline}" fill="none" stroke="var(--score)" stroke-width="2.2" opacity="0.95"/>`;
    GEO={N,tsl,prl,scl,raw,xf:main.map((_,i)=>gx(i)/VW),mf:main.map(v=>gyM(v)/VH),sf:scl.map(v=>gyS(v)/VH)};
    const plot=$('cbPlot');[...plot.querySelectorAll('.ylab')].forEach(e=>e.remove());
    const addYL=(side,y,txt)=>{const el=document.createElement('div');el.className='ylab '+side;el.style.top=(y/VH*plot.clientHeight)+'px';el.textContent=txt;plot.appendChild(el);};
    if(isDD){[{v:0,t:'0%'},{v:mMax,t:'-'+mMax.toFixed(0)+'%'}].forEach(o=>addYL('l',gyM(o.v),o.t));}
    else{[mMax,0,mMin].forEach(v=>addYL('l',gyM(v),(v>0?'+':'')+v.toFixed(0)+'%'));}
    [{v:100},{v:0}].forEach(o=>addYL('r',gyS(o.v),o.v));
    const Wpx=plot.clientWidth,xrow=$('cbXrow');xrow.innerHTML='';const oneYr=st.years===1;
    const marks=[];let mk=null;
    tsl.forEach((t,i)=>{const d=new Date(t);const key=oneYr?d.getFullYear()+'-'+d.getMonth():d.getFullYear();if(key!==mk){mk=key;marks.push({i,d});}});
    marks.forEach((m,k)=>{const x=gx(m.i)/VW*Wpx;
      const tk=document.createElement('div');tk.className='xtick';tk.style.left=x+'px';xrow.appendChild(tk);
      if(k===0||k===marks.length-1){const el=document.createElement('div');el.className='xlab '+(k===0?'head':'tail');el.style.left=x+'px';
        el.textContent=oneYr?(m.d.getFullYear()+'/'+String(m.d.getMonth()+1).padStart(2,'0')):m.d.getFullYear();xrow.appendChild(el);}});
    $('cbLgd1').innerHTML=isDD?`<i style="background:#3a3a3c"></i>${px(U.chartB.lgDd)}`:`<i style="background:linear-gradient(90deg,#3fa46a,#e0463c)"></i>${px(U.chartB.lgDv)}`;
    $('cbIntro').textContent=ip(px(COPY.banks.chartBIntro[isDD?'dd':'dev']));
    const base=px(isDD?U.chartB.kDd:U.chartB.kDv);
    $('cbE1k').textContent=base;$('cbE2k').textContent=base;
    $('cbE1lbl').textContent=px(isDD?U.chartB.e1Dd:U.chartB.e1Dv);$('cbE2lbl').textContent=px(isDD?U.chartB.e2Dd:U.chartB.e2Dv);
    const arr=isDD?DD:DEV;let ext=0,ei=0;arr.forEach((v,i)=>{if(isDD){if(v<ext){ext=v;ei=i;}}else{if(Math.abs(v)>Math.abs(ext)){ext=v;ei=i;}}});
    const cur=arr[WEEKS-1];
    $('cbE1v').textContent=(ext>0?'+':'')+ext.toFixed(0)+'%';$('cbE1s').textContent=fmtYM(TS[ei])+' · $'+Math.round(PX[ei]);
    $('cbE2v').textContent=(cur>0?'+':'')+cur.toFixed(0)+'%';$('cbE2s').textContent=fmtYM(TS[WEEKS-1])+' · $'+Math.round(PX[WEEKS-1]);
    $('cbE1v').style.color=pctColor(pctFav(ext,arr));$('cbE2v').style.color=pctColor(pctFav(cur,arr));
  }
  function scrub(clientX){if(!GEO)return;const plot=$('cbPlot'),rect=plot.getBoundingClientRect();
    let fx=(clientX-rect.left)/rect.width;fx=Math.max(0,Math.min(1,fx));let idx=Math.round(fx*(GEO.N-1));idx=Math.max(0,Math.min(GEO.N-1,idx));
    const Wpx=rect.width,Hpx=rect.height,xpx=GEO.xf[idx]*Wpx,isDD=st.mode==='dd';
    $('cbScan').style.cssText=`left:${xpx}px;height:${Hpx}px;opacity:.6`;
    let mc=pctColor(pctFav(GEO.raw[idx],isDD?DD:DEV));
    const d1=$('cbD1'),d2=$('cbD2');d1.style.background=mc;
    d1.style.left=xpx+'px';d1.style.top=(GEO.mf[idx]*Hpx)+'px';d1.style.opacity=1;
    d2.style.left=xpx+'px';d2.style.top=(GEO.sf[idx]*Hpx)+'px';d2.style.opacity=1;
    const v=GEO.raw[idx],sc=GEO.scl[idx],kw=isDD?(LANG==='zh'?'回撤':'Drawdown'):(LANG==='zh'?'偏離':'Deviation'),tipCol=pctColor(pctFav(v,isDD?DD:DEV)),tip=$('cbTip');
    tip.innerHTML=`<div class="d">${fmtYM(GEO.tsl[idx])} · $${Math.round(GEO.prl[idx])}</div>${kw} <b style="color:${tipCol}">${v>0?'+':''}${v.toFixed(1)}%</b>　DCA <b style="color:#ffb86b">${Math.round(sc)}</b>`;
    tip.style.opacity=1;let tx=xpx,half=tip.offsetWidth/2;tx=Math.max(half+2,Math.min(Wpx-half-2,tx));tip.style.left=tx+'px';}
  const end=()=>['cbScan','cbD1','cbD2','cbTip'].forEach(id=>$(id).style.opacity=0);
  const plotEl=$('cbPlot');
  plotEl.addEventListener('pointerdown',e=>{plotEl.setPointerCapture(e.pointerId);scrub(e.clientX);});
  plotEl.addEventListener('pointermove',e=>{if(e.buttons>0||e.pointerType==='touch'||window.matchMedia('(min-width:960px)').matches)scrub(e.clientX);});
  plotEl.addEventListener('pointerup',end);plotEl.addEventListener('pointerleave',end);
  $('cbMode').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$('cbMode').querySelectorAll('button').forEach(x=>x.classList.remove('on'));b.classList.add('on');st.mode=b.dataset.m;render();});
  $('cbPeriod').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$('cbPeriod').querySelectorAll('button').forEach(x=>x.classList.remove('on'));b.classList.add('on');st.years=+b.dataset.y;render();});
  window.addEventListener('resize',render);render();RERENDER.push(render);
})();

/* ══════════════ BASIC DATA ══════════════ */
(function(){
  const scard=d=>{if(d.v==null||d.v==='')return '';
    const g=d.g?`<div class="s-g ${d.gUp?'up':'down'}">${d.g}</div>`:'',c=d.c?`--valc:${d.c}`:'';
    return `<div class="scard"><div class="s-head"><div class="s-top">${d.top}</div><div class="s-num" style="${c}"><span class="v">${d.v}</span>${d.u?`<span class="u">${d.u}</span>`:''}</div>${g}</div><div class="s-note">${d.note}</div></div>`;};
  function fillRail(railId,dotsId,arr){const cards=arr.map(scard).filter(Boolean);
    const rail=document.getElementById(railId);rail.innerHTML=cards.join('');
    const dots=document.getElementById(dotsId);dots.innerHTML=cards.map((_,i)=>`<span class="dot${i===0?' on':''}"></span>`).join('');
    rail.onscroll=()=>{const i=Math.round(rail.scrollLeft/(rail.scrollWidth/cards.length));
      dots.querySelectorAll('.dot').forEach((d,k)=>d.classList.toggle('on',k===Math.min(i,cards.length-1)));};}
  const rr=d=>({top:px(d.top),v:px(d.v),u:d.u?px(d.u):'',g:d.g,gUp:d.gUp,c:d.c,note:px(d.note)});
  function renderBasic(){
    const A=COPY.asset;
    document.getElementById('bdIdcard').innerHTML=A.idData.map(d=>`<div class="idrow"><div class="idlbl">${px(d.lbl)}</div><div class="idval">${px(d.val)}</div></div>`).join('');
    fillRail('bdRail1','bdDots1',A.earn.map(rr));
    fillRail('bdRail2','bdDots2',A.risk.map(rr));
  }
  renderBasic(); RERENDER.push(renderBasic);
})();

/* ══════════════ FAQ 手風琴 ══════════════ */
(function(){
  const list=document.getElementById('faqList');if(!list)return;
  list.addEventListener('click',e=>{const q=e.target.closest('.faq-q');if(!q)return;
    q.parentElement.classList.toggle('open');});
})();

/* ══════════════ 語言:接共用 chrome + 初次靜態套字 ══════════════ */
window.applyPageLang = function(l){ LANG = (l === 'zh') ? 'zh' : 'en'; applyStatic(); RERENDER.forEach(function(fn){ try{ fn(); }catch(e){ console.error(e); } }); };

// 相關資產:讀 assets.js(window.DCA_ASSETS)單一來源,列出「自己以外」的資產,連過去。
const relZoneMain = s => s <= 59 ? '#FF453A' : s <= 79 ? '#FF9F0A' : '#30D158';
function relTickerHTML(t){ const m = t.match(/^([^.\-]+)([.\-].+)$/); return m ? `${m[1]}<br><span class="suf">${m[2]}</span>` : t; }
async function loadRelatedScores(){
  await Promise.all([...document.querySelectorAll('#related .hot-score[data-tkr]')].map(async el => {
    try{
      const r = await fetch('https://proxy-three-mu-47.vercel.app/api/ticker-score?ticker=' + encodeURIComponent(el.getAttribute('data-tkr'))).then(x => x.json());
      if(r && typeof r.score === 'number'){ const s = Math.round(r.score); el.textContent = s; el.style.color = relZoneMain(s); }
    }catch(e){}
  }));
}
// 相關資產:完全沿用首頁人氣熱搜 hot-card(橫滑 + 圓點 + 更多卡),讀 assets.js 單一來源。
function renderRelated(){
  /* 相關資產卡的連結要跟著本頁語言走。判斷邏輯統一由 chrome.js 的 window.dcaHref
     提供(它讀 ZH_READY 清單,只有真的有中文版的頁面才加 /zh);還沒載入完就維持
     英文網址,不會壞掉。 */
  const LHREF = p => { try { return (typeof window.dcaHref === 'function') ? window.dcaHref(p) : p; } catch(e){ return p; } };
  const list = document.getElementById('relGrid'), ph = document.getElementById('relPh'), dotsEl = document.getElementById('relDots');
  const eb = document.getElementById('relEyebrow'), tt = document.getElementById('relTitle');
  if(!list) return;
  const zh = LANG === 'zh';
  if(eb) eb.textContent = zh ? '人氣資產' : 'Popular';
  if(tt) tt.innerHTML = wrapTitle(zh ? '熱搜精選，陸續登場。' : 'Popular picks, more soon.');
  const self = (COPY.asset.ticker || '').toUpperCase();
  const arr = (window.DCA_ASSETS || []).filter(a => (a.ticker || '').toUpperCase() !== self);
  if(!arr.length){ list.innerHTML = ''; if(dotsEl){ dotsEl.innerHTML = ''; } if(ph) ph.style.display = ''; return; }
  if(ph) ph.style.display = 'none';
  const moreTxt = zh ? '更多資產<br>持續更新' : 'More assets<br>coming soon';
  list.innerHTML = arr.map(a => {
    // logo 交給 js/logo.js,與首頁人氣熱搜卡同一套,不再自己拼網址。
    return `<a class="hot-card" href="${LHREF('/asset/' + (a.ticker||'').toLowerCase() + '.html')}">`
      + `<div class="hot-logo" data-logo="${a.ticker || ''}"></div>`
      + `<div class="hot-bottom"><div class="hot-brow">`
      + `<div class="hot-tkr">${relTickerHTML(a.ticker)}</div>`
      + `<div class="hot-score" data-tkr="${a.query || a.ticker}">\u00b7\u00b7</div>`
      + `</div></div></a>`;
  }).join('') + `<a class="hot-more" href="${LHREF('/trending.html')}"><div class="plus">\u2192</div><div class="mt">${moreTxt}</div></a>`;
  /* 尺寸是 createLogoImg 寫在元素上的 inline style,CSS 蓋不過去,所以在這裡分桌機/手機給值。
     96 / 54 與首頁 #hotAssetsSection 同值,兩邊卡片才會長得一樣。 */
  list.querySelectorAll('.hot-logo[data-logo]').forEach(el => {
    const tk = el.getAttribute('data-logo');
    const logoPx = (window.matchMedia && window.matchMedia('(min-width:960px)').matches) ? 96 : 54;
    el.innerHTML = '';
    if (typeof createLogoImg === 'function') {
      try { el.appendChild(createLogoImg(tk, logoPx)); }
      catch(e) { el.textContent = (tk || '?').charAt(0); }
    } else { el.textContent = (tk || '?').charAt(0); }
  });
  if(dotsEl){
    const n = arr.length;
    if(n <= 1){ dotsEl.innerHTML = ''; dotsEl.style.display = 'none'; }
    else {
      dotsEl.style.display = '';
      dotsEl.innerHTML = Array.from({length:n}, (_,i) => `<div class="insights-dot${i===0?' active':''}"></div>`).join('');
      list.onscroll = () => { const cardW = list.scrollWidth / (n + 1), idx = Math.min(n - 1, Math.round(list.scrollLeft / cardW));
        dotsEl.querySelectorAll('.insights-dot').forEach((d,k) => d.classList.toggle('active', k === idx)); };
    }
  }
  loadRelatedScores();
}
applyStatic();
renderRelated(); RERENDER.push(renderRelated);

/* ══════════════ 接真實資料(ticker-score full + historical-score)══════════════ */
(function(){
  const PROXY = 'https://proxy-three-mu-47.vercel.app/api';
  const TICKER = COPY.asset.query || COPY.asset.ticker;   // 查詢用代號(加密為 BTC-USD),顯示一律用 COPY.asset.ticker

  const tierFromScore = s => s>=90?'D':s>=80?'C':s>=60?'B':'A';
  const lightToColor = c => c==='yellow'?'amber':(c==='green'?'green':'red');
  const sign = n => (n<0?'\u2212':'+') + Math.abs(n);

  // ── 格式化(雙語)──
  const fmtPct1 = v => (v==null?null:(v<0?'\u2212':'') + Math.abs(v).toFixed(1) + '%');   // 帶號一位小數 %
  const fmtMoney = v => v==null?null:'$'+ (Math.abs(v)>=100? Math.round(v) : v.toFixed(2));
  const fmtMktCap = v => { if(v==null) return null;
    if(v>=1e12) return {zh:(v/1e12).toFixed(2)+' 兆', en:(v/1e12).toFixed(2)+'T'};
    if(v>=1e8)  return {zh:(v/1e8).toFixed(0)+' 億', en:(v/1e9).toFixed(1)+'B'};
    return {zh:String(Math.round(v)), en:String(Math.round(v))}; };
  const fmtRevenue = v => { if(v==null) return null;
    return {zh:(v/1e8).toLocaleString('en-US',{maximumFractionDigits:0})+' 億', en:(v/1e9).toFixed(0)+'B'}; };
  const growthChip = g => (g==null?null:{txt:(g<0?'\u2212':'+')+Math.abs(g*100).toFixed(0)+'%', up:g>=0});
  const marginPct = v => v==null?null:(v*100).toFixed(1);

  /* ── 加密專用格式化 ──────────────────────────────────────────
     幣的顆數量級跟金額不同(千萬級),沿用 fmtMktCap 會壓成「0.20 億」很難讀,
     所以中文走「萬/億」、英文走「M/B」,並把尾數的 .0 去掉(21.0M → 21M)。 */
  const trim0 = s => s.replace(/\.0+$/,'');
  const fmtCoins = v => { if(v==null) return null;
    const en = v>=1e9 ? trim0((v/1e9).toFixed(2))+'B'
             : v>=1e6 ? trim0((v/1e6).toFixed(1))+'M'
             : Math.round(v).toLocaleString('en-US');
    const zh = v>=1e8 ? trim0((v/1e8).toFixed(2))+' 億'
             : v>=1e4 ? Math.round(v/1e4).toLocaleString('en-US')+' 萬'
             : Math.round(v).toLocaleString('en-US');
    return {zh, en}; };
  /* 金額縮寫:沿用卡片既有的「用單位字母吸收長度」語言(市值卡的 兆 / T 就是這樣),
     避免 $126,080 這種七字元數值把卡片撐寬、把字擠出邊界。
     中文走 萬/億(跟市值卡同一套量級),英文走 K/M。
     未滿萬(1e4)就完整寫,例如 $8,432,不做沒必要的簡化。 */
  const fmtDollars = v => { if(v==null) return null;
    const en = v>=1e6 ? '$'+trim0((v/1e6).toFixed(1))+'M'
             : v>=1e4 ? '$'+trim0((v/1e3).toFixed(0))+'K'
             : '$'+Math.round(v).toLocaleString('en-US');
    const zh = v>=1e8 ? '$'+trim0((v/1e8).toFixed(1))+' 億'
             : v>=1e4 ? '$'+trim0((v/1e4).toFixed(1))+' 萬'
             : '$'+Math.round(v).toLocaleString('en-US');
    return {zh, en}; };
  const fmtPct0 = v => v==null?null:((v<0?'\u2212':'')+Math.abs(v).toFixed(0)+'%');
  /* 距歷史高:≤ −30% 視為位置偏深(綠)、> −10% 視為貼近歷史高(紅),中間不上色 */
  const athColor = v => (v==null?null : v<=-30 ? 'var(--up)' : v>-10 ? 'var(--down)' : null);
  /* 恐懼貪婪:直接吃 alternative.me 的官方分類,不自行切數字,分類調整時不會漂掉 */
  const FG_ZH = {'Extreme Fear':'極度恐懼','Fear':'恐懼','Neutral':'中性','Greed':'貪婪','Extreme Greed':'極度貪婪'};
  const fgValue = f => (!f || f.value==null) ? null
    : {zh:(f.value+' '+(FG_ZH[f.label]||f.label||'')).trim(), en:(f.value+' '+(f.label||'')).trim()};
  const fgColor = f => { if(!f || !f.label) return null;
    if(/Fear/i.test(f.label)) return 'var(--up)';
    if(/Greed/i.test(f.label)) return 'var(--down)';
    return null; };

  // ── 把真序列灌進圖表資料(正規化成 WEEKS 長度,索引邏輯不動)──
  function applyRealSeries(series){
    const N = series.length;
    const take = N>=WEEKS ? series.slice(N-WEEKS) : series;
    const pad = WEEKS - take.length;
    PX.length=0; TS.length=0; SCORE.length=0;
    for(let i=0;i<WEEKS;i++){
      const s = take[Math.max(0, i-pad)];
      PX.push(+s.price);
      const t = (typeof s.week==='string') ? new Date(s.week).getTime() : (typeof s.week==='number'&&s.week>1e11 ? s.week : NOW-(WEEKS-1-i)*MS_W);
      TS.push(Number.isFinite(t)? t : NOW-(WEEKS-1-i)*MS_W);
      SCORE.push(Math.round(s.score));
    }
    DD.length=0; DEV.length=0;
    for(let i=0;i<WEEKS;i++){let hi=PX[i];for(let j=Math.max(0,i-51);j<=i;j++)hi=Math.max(hi,PX[j]);DD.push((PX[i]/hi-1)*100);}
    for(let i=0;i<WEEKS;i++){let s=0,n=0;for(let j=Math.max(0,i-199);j<=i;j++){s+=PX[j];n++;}DEV.push((PX[i]/(s/n)-1)*100);}
  }

  // ── 把 ticker-score full 灌進 COPY.asset ──
  const NOW = Date.now(), MS_W = 7 * 864e5;
  let BT = null;

  function applyFull(d){
    const A = COPY.asset;
    A.score = Math.round(d.score);
    A.tier = tierFromScore(A.score);

    const b = d.basic || {};
    if (typeof b.price === 'number') A.price = '$'+b.price.toFixed(2);
    if (typeof b.change === 'number' && typeof b.changePct === 'number') {
      A.change = { txt: sign(+b.change.toFixed(2)) + ' (' + sign(+b.changePct.toFixed(2)) + '%)', dir: b.change<0?'down':'up' };
    }

    // 五因子:顏色＝真燈號、數值＝真值、百分位餵給儀表(label/note 由顏色帶出;aux 維持描述)
    const f = d.factors || {};
    const setF = (id, color, num, pct) => { if(!A.factors[id]) return; if(color) A.factors[id].color=color; if(num!=null) A.factors[id].num=num; if(pct!=null) A.factors[id].percentile=pct; };
    if (f.ma  && f.ma.hasMa)   setF('ma',  lightToColor(f.ma.light),  (f.ma.value>=0?'+':'\u2212')+Math.abs(f.ma.value).toFixed(0)+'%', f.ma.percentile);
    if (f.rsi)                 setF('rsi', lightToColor(f.rsi.light), String(Math.round(f.rsi.value)), f.rsi.percentile);
    if (f.dd)                  setF('dd',  lightToColor(f.dd.light),  (f.dd.value<0?'\u2212':'')+Math.abs(f.dd.value).toFixed(0)+'%', f.dd.percentile);
    if (f.vix)                 setF('vix', lightToColor(f.vix.light), (f.vix.value).toFixed(1), f.vix.percentile);
    if (f.pfcf && f.pfcf.hasPfcf) setF('pfcf', lightToColor(f.pfcf.light), {zh:f.pfcf.value.toFixed(0)+' 倍', en:f.pfcf.value.toFixed(0)+'\u00d7'}, f.pfcf.percentile);

    // 基本數據:固定欄位,某格缺就顯示「更新中」(不留白、不放假值)
    const UPD = {zh:'更新中', en:'Updating\u2026'};
    const mk = (top, v, opts) => { const o = Object.assign({top}, opts||{}); if(v==null){ o.v=UPD; delete o.u; delete o.g; delete o.gUp; delete o.c; } else { o.v=v; } return o; };

    // ── 加密模式:沒有財報,兩排改吃 d.crypto 的 8 張卡 ──
    // 與股票版的差別:缺值的卡「整張不出現」而不是顯示「更新中」,因為加密的欄位
    // (例如 maxSupply)本來就可能為 null,顯示「更新中」會誤導成暫時性故障。
    const C = d.crypto;
    if (C) {
      A.isCrypto = true;
      A.bEarn = {zh:'規模與流通', en:'Size & supply'};
      A.bRisk = {zh:'位置與情緒', en:'Position & sentiment'};
      const ck = (top, v, opts) => (v==null ? null : Object.assign({top, v}, opts||{}));
      A.earn = [
        ck({zh:'市值',en:'Market cap'}, fmtMktCap(C.marketCap),
           {note:{zh:'這顆幣整體值多少。',en:'What the whole coin is worth.'}}),
        ck({zh:'流通量',en:'Circulating supply'}, fmtCoins(C.circulatingSupply),
           {note:{zh:'目前已經流通在市場上的數量。',en:'How many coins are out there now.'}}),
        ck({zh:'總量上限',en:'Max supply'}, fmtCoins(C.maxSupply),
           {note:{zh:'永遠不會超過的發行上限。',en:'The cap it can never exceed.'}}),
        ck({zh:'24h 成交量',en:'24h volume'}, fmtMktCap(C.volume24h),
           {note:{zh:'一天之內換手多少。',en:'How much changes hands in a day.'}}),
      ].filter(Boolean);
      A.risk = [
        ck({zh:'距歷史高',en:'vs. all-time high'}, fmtPct0(C.athFromCurrent),
           {c:athColor(C.athFromCurrent), note:{zh:'離史上最高還有多遠。',en:'How far below its record.'}}),
        // 日期不放 unit 欄:它跟數字同一行、baseline 對齊,會把卡片撐得比其他張寬。
        // 改寫進說明文字,卡片結構維持「標題 / 數字 / 說明」三層,跟其餘七張一致。
        ck({zh:'歷史最高',en:'All-time high'}, fmtDollars(C.ath),
           {note: C.athDate
              ? {zh:'史上最高價,出現在 '+C.athDate+'。', en:'Its highest price, reached in '+C.athDate+'.'}
              : {zh:'史上最高價。', en:'Its highest price.'}}),
        ck({zh:'年化波動',en:'Annualized volatility'}, C.volatility!=null?String(Math.round(C.volatility)):null,
           {u:{zh:'%',en:'%'}, c:(C.volatility!=null && C.volatility>=70)?'var(--down)':null,
            note:{zh:'數字越大,起伏越劇烈。',en:'Bigger number, wilder swings.'}}),
        ck({zh:'市場情緒',en:'Fear & Greed'}, fgValue(C.fearGreed),
           {c:fgColor(C.fearGreed), note:{zh:'市場現在偏恐懼,還是偏貪婪。',en:'Whether the market leans fearful or greedy.'}}),
      ].filter(Boolean);
    } else {
    const epsG = growthChip(b.epsGrowth), revG = growthChip(b.revenueGrowth);
    A.earn = [
      mk({zh:'公司整體值多少',en:'What the whole company is worth'}, fmtMktCap(b.marketCap), {note:{zh:'規模越大通常越穩健。',en:'Bigger size usually means steadier.'}}),
      mk({zh:'本益比 P/E',en:'P/E ratio'}, b.peTTM!=null?String(b.peTTM):null, {u:{zh:'倍',en:'\u00d7'}, note:{zh:'市場願意為它每賺 1 元付的價格。',en:'What the market pays per 1 of earnings.'}}),
      mk({zh:'每股盈餘 EPS',en:'Earnings per share'}, b.eps!=null?b.eps.toFixed(2):null, {u:{zh:'美元',en:'USD'}, g:epsG&&epsG.txt, gUp:epsG&&epsG.up, note:{zh:'每股一年賺多少。',en:'What each share earns a year.'}}),
      mk({zh:'年營收',en:'Annual revenue'}, fmtRevenue(b.revenue), {g:revG&&revG.txt, gUp:revG&&revG.up, note:{zh:'一整年做多少生意。',en:'Business done in a year.'}}),
      mk({zh:'淨利率',en:'Net margin'}, b.netMargin!=null?marginPct(b.netMargin):null, {u:{zh:'%',en:'%'}, note:{zh:'每做 100 元生意實拿多少。',en:'Kept out of every 100 in sales.'}}),
    ];
    A.risk = [
      mk({zh:'殖利率',en:'Dividend yield'}, b.dividendYield!=null?(b.dividendYield*100).toFixed(2):null, {u:{zh:'%',en:'%'}, note:{zh:'每年股息約佔股價的比例。',en:'Yearly dividend as a share of price.'}}),
      mk({zh:'52 週最高',en:'52-week high'}, b.high52!=null?fmtMoney(b.high52):null, {c:'var(--up)', note:{zh:'過去一年股價的最高點。',en:'Highest price over the past year.'}}),
      mk({zh:'52 週最低',en:'52-week low'}, b.low52!=null?fmtMoney(b.low52):null, {c:'var(--down)', note:{zh:'過去一年股價的最低點。',en:'Lowest price over the past year.'}}),
      mk({zh:'毛利率',en:'Gross margin'}, b.grossMargin!=null?marginPct(b.grossMargin):null, {u:{zh:'%',en:'%'}, note:{zh:'扣掉成本後每 100 元剩多少。',en:'Left from every 100 after cost of goods.'}}),
    ];
    }

    A.updatedAt = d.updatedAt || null;
    A.multiplier = (typeof d.multiplier === 'number') ? d.multiplier : null;
  }

  // ── 回測引擎(與 /#backtest 同一套,照抄 backtest.js)──
  function calculateRSI(closes, period){ if(closes.length<period+1)return 50; let g=0,l=0;
    for(let i=closes.length-period;i<closes.length;i++){const dv=closes[i]-closes[i-1]; if(dv>0)g+=dv; else l-=dv;}
    const ag=g/period, al=l/period; if(al===0)return 100; return 100-(100/(1+ag/al)); }
  function calcBaseMultiplier(prsi, drawdown, vix){ const ddScore=Math.min(1,Math.max(0,Math.abs(drawdown)/40));
    const composite=(1-prsi)*0.5+ddScore*0.3+Math.min(1,(vix-20)/40)*0.2; return Math.min(Math.round((1.0+composite)*100)/100,1.8); }
  function runSmartDCA(prices, budget, monthsPerBar=1, startIdx=0){
    let shares=0, totalInvested=0; const rsiHistory=[];
    for(let i=0;i<prices.length;i++){
      const price=prices[i];
      const rsiSlice=prices.slice(Math.max(0,i-14),i+1);
      const rsi=calculateRSI(rsiSlice, Math.min(14, rsiSlice.length-1));
      const prsi=rsiHistory.length>0 ? rsiHistory.filter(r=>r<=rsi).length/rsiHistory.length : 0.5;
      rsiHistory.push(rsi);
      const high12=Math.max(...prices.slice(Math.max(0,i-12),i+1));
      const dd=(price-high12)/high12*100;
      const estimatedVix = dd<-20&&prsi<0.2 ? 45 : dd<-10&&prsi<0.35 ? 28 : 18;
      const mult=calcBaseMultiplier(prsi, dd, estimatedVix);
      const triggered = dd<=-15 && prsi<=0.4;
      const blackSwan = dd<=-20 && estimatedVix>=40;
      const finalMult = (triggered||blackSwan) ? mult : 1.0;
      if(i<startIdx) continue;
      const invest=budget*monthsPerBar*finalMult;
      shares+=invest/price; totalInvested+=invest;
    }
    const finalPrice=prices[prices.length-1];
    const finalVal=shares*finalPrice;
    const roi=((finalVal-totalInvested)/totalInvested)*100;
    return { finalVal, totalInvested, roi };
  }
  function monthlyClose(series){
    const out=[]; let lastKey=null;
    for(const s of series){ const p=+s.price; if(!Number.isFinite(p))continue;
      const d=new Date(s.week); const key=d.getFullYear()*12+d.getMonth();
      if(key!==lastKey){ out.push(p); lastKey=key; } else { out[out.length-1]=p; } }
    return out;
  }
  function computeBacktest(series){
    try{
      const monthly=monthlyClose(series);
      if(monthly.length<24) return null;
      const r=runSmartDCA(monthly, 500, 1, 0);
      if(!r || !isFinite(r.finalVal) || !isFinite(r.roi)) return null;
      return { finalVal:r.finalVal, roi:r.roi };
    }catch(e){ console.error('backtest error:', e); return null; }
  }
  function renderBacktest(){
    const el=document.getElementById('closingBt'), btn=document.getElementById('closingBtBtn');
    if(!el||!btn) return;
    if(!BT){ el.style.display='none'; btn.style.display='none'; return; }
    const V='<b>$'+Math.round(BT.finalVal).toLocaleString('en-US')+'</b>';
    const R='<b>'+(BT.roi>=0?'+':'')+BT.roi.toFixed(1)+'%</b>';
    el.innerHTML = px(U.closing.btLine).replace(/\{T\}/g, COPY.asset.ticker).replace('{V}', V).replace('{R}', R);
    /* 回測頁有中文版,連結要跟著本頁語言走。判斷邏輯統一由 chrome.js 的
       window.dcaHref 提供(它讀 ZH_READY 清單);還沒載入完就維持英文網址,不會壞。 */
    try{
      const q = btn.getAttribute('data-query') || COPY.asset.ticker;
      const base = (typeof window.dcaHref === 'function') ? window.dcaHref('/backtest.html') : '/backtest.html';
      btn.setAttribute('href', base + '?ticker=' + encodeURIComponent(q) + '&benchmark=SPY&years=10&run=1');
    }catch(e){}
    el.style.display=''; btn.style.display='';
  }
  RERENDER.push(renderBacktest);

  function redraw(){
    applyStatic();
    RERENDER.forEach(function(fn){ try{ fn(); }catch(e){ console.error(e); } });
    if (window.__heroBean && typeof COPY.asset.score==='number') window.__heroBean(COPY.asset.score);
    /* applyStatic() 是用 innerHTML 覆蓋的,桌機那邊包好的 .nb 斷行段落會整批消失。
       桌機腳本自己的計時器(0/400/1200ms)與 load 事件不保證排在這之後——
       兩支 API 慢一點就全部跑完了,沒有人再把斷行包回去。所以這裡明確補一次。
       分數跨過門檻時整句文案會換掉,那時最看得出來。 */
    if (window.__webSync) window.__webSync();
  }

  let hydrateDone = false;
  function showAssetError(){
    const ld = document.getElementById('assetLoading');
    if (!ld) return;
    const zh = LANG === 'zh';
    ld.innerHTML =
      '<div style="text-align:center;padding:0 30px;max-width:340px;">' +
      '<div style="font-size:18px;font-weight:800;color:var(--ink);margin-bottom:8px;">' + (zh?'資料暫時無法取得':'Data unavailable right now') + '</div>' +
      '<div style="font-size:14px;color:var(--ink2);line-height:1.7;margin-bottom:22px;">' + (zh?'請稍後再試；若持續發生，歡迎回報給我們，我們會盡快處理。':'Please try again shortly. If it keeps happening, let us know and we\u2019ll look into it.') + '</div>' +
      '<button onclick="location.reload()" style="background:var(--ink);color:#fff;border:none;border-radius:999px;padding:11px 24px;font-size:14px;font-weight:700;cursor:pointer;margin-right:8px;">' + (zh?'重新整理':'Reload') + '</button>' +
      '<a href="https://dcacafe.com/#learn" style="display:inline-block;color:var(--ink2);font-size:14px;font-weight:700;text-decoration:none;padding:11px 8px;">' + (zh?'聯絡我們 \u2192':'Contact us \u2192') + '</a>' +
      '</div>';
  }

  async function hydrate(){
    const page = document.querySelector('.page');
    if (page) page.classList.add('loading');
    // K 線動畫一直轉,等資料真的回來為止(不再用短超時判定失敗)。
    // 只有「真的抓不到」才顯示錯誤:兩支都沒回有效資料,或極端情況 20 秒兜底。
    const safety = setTimeout(() => { if (!hydrateDone){ hydrateDone = true; showAssetError(); } }, 20000);
    let ok=false, series=null;
    try{
      const [fR, hR] = await Promise.allSettled([
        fetch(`${PROXY}/ticker-score?ticker=${encodeURIComponent(TICKER)}&full=1`).then(r=>r.json()),
        fetch(`${PROXY}/historical-score?ticker=${encodeURIComponent(TICKER)}`).then(r=>r.json()),
      ]);
      if (hR.status==='fulfilled' && hR.value && Array.isArray(hR.value.series) && hR.value.series.length>=20){
        series = hR.value.series; applyRealSeries(series); ok=true;
      }
      if (fR.status==='fulfilled' && fR.value && typeof fR.value.score==='number'){
        applyFull(fR.value); ok=true;
      }
      if (series) BT = computeBacktest(series);
    }catch(e){ console.error('hydrate error:', e); }
    if (hydrateDone) return;          // 已被 20 秒兜底判定失敗
    hydrateDone = true; clearTimeout(safety);
    if (ok){
      redraw();
      renderBacktest();
      if (page) page.classList.remove('loading');
      const ld = document.getElementById('assetLoading'); if (ld) ld.remove();  // 資料到,移除 K 線層
    } else {
      showAssetError();               // 真的都沒回有效資料 → 錯誤+聯絡
    }
  }
  hydrate();
})();
