// ============================================================
// logo.js — Ticker Logo 快取與自動查詢模組
// 從 index.html 拆分而出(round46 架構瘦身),邏輯逐行原樣搬移,未做任何修改。
// 依賴:LOGO_DOMAIN_MAP(全域物件,定義於 index.html,本檔案載入前已存在)、PROXY(全域常數,定義於 index.html 稍後位置——因函式為非同步呼叫，執行當下 PROXY 已完成賦值，順序無虞)
// ============================================================

// ── Logo 永久快取（單一裝置 localStorage，越用越完整）──
// 說明：第一次成功查到某 ticker 的 domain 後就存起來，之後同一台裝置
// 重整頁面會直接讀快取、跳過第三方查詢，避免每次都依賴不穩定的外部服務。
// 注意：這只是「這台裝置」的快取，不同使用者第一次查詢仍會各自打一次第三方服務。
const LOGO_CACHE_KEY = 'dcacafe_logo_cache_v1';
function loadLogoCache() {
  try {
    const raw = localStorage.getItem(LOGO_CACHE_KEY);
    if(raw) Object.assign(LOGO_DOMAIN_MAP, JSON.parse(raw));
  } catch(e) { /* localStorage 不可用（例如 Safari 隱私瀏覽）就略過快取 */ }
}
function saveLogoToCache(ticker, domain) {
  try {
    const raw = localStorage.getItem(LOGO_CACHE_KEY);
    const cached = raw ? JSON.parse(raw) : {};
    cached[ticker] = domain;
    localStorage.setItem(LOGO_CACHE_KEY, JSON.stringify(cached));
  } catch(e) { /* 略過（例如儲存空間已滿或隱私瀏覽） */ }
}
loadLogoCache();

function getLogoUrl(ticker) {
  const t = ticker.toUpperCase().replace('-USD','');
  const domain = LOGO_DOMAIN_MAP[t] || LOGO_DOMAIN_MAP[t.replace('-','')] || null;
  if(domain) return `https://cdn.tickerlogos.com/${domain}`;
  return null; // trigger auto-lookup
}

// Auto-lookup domain when logo fails

async function autoLookupLogo(ticker, imgEl) {
  try {
    // round9修正:原本直接把完整ticker(例如XRP-USD)送進搜尋API,但API資料庫裡的symbol
    // 是不含交易對後綴的XRP,永遠比對不到,直接掉到文字後備。先去掉常見交易對後綴再查。
    const cleanTicker = ticker.toUpperCase().replace(/-USD[TC]?$/, '');
    const searchUrl = `https://www.allinvestview.com/api/logo-search/?q=${cleanTicker}`;
    // 2026-07-23:補上 x-turnstile-token。這支經過 api/proxy.js,而 proxy 是「沒帶 token
    // 一律 403」——原本這裡沒帶,導致所有需要即時查詢的 logo(尚未進 localStorage 快取的
    // 新資產)都吃 403、掉到文字後備。已快取過的資產因為不打網路所以看起來正常,
    // 這就是「logo 有時跑得出來、有時跑不出來」的原因。跟回測/代碼搜尋是同一個 bug。
    if (typeof turnstileToken !== 'undefined' && !turnstileToken && typeof ensureTurnstileToken === 'function') {
      await ensureTurnstileToken(4000);
    }
    const headers = (typeof turnstileToken !== 'undefined' && turnstileToken)
      ? { 'x-turnstile-token': turnstileToken } : {};
    const res = await fetch(`${PROXY}?url=${encodeURIComponent(searchUrl)}`, { headers });
    if(!res.ok) { showTickerFallback(imgEl, ticker); return; }
    const data = await res.json();
    // Find the best match - exact symbol match first
    const match = data.results && (
      data.results.find(r => r.symbol === cleanTicker) ||
      data.results.find(r => r.website && r.website !== 'nan' && r.website.includes('http'))
    );
    if(match && match.website && match.website !== 'nan') {
      // Clean domain: remove http://, https://, www.
      let domain = match.website
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0];
      // Cache it
      LOGO_DOMAIN_MAP[cleanTicker] = domain;
      saveLogoToCache(cleanTicker, domain);
      const newUrl = `https://cdn.tickerlogos.com/${domain}`;
      imgEl.src = newUrl;
      imgEl.onerror = () => showTickerFallback(imgEl, ticker);
    } else {
      showTickerFallback(imgEl, ticker);
    }
  } catch(e) {
    showTickerFallback(imgEl, ticker);
  }
}

function showTickerFallback(imgEl, ticker) {
  const parent = imgEl.parentElement;
  if(parent) parent.innerHTML = `<span style="font-size:10px;font-weight:700;color:var(--ink2);">${ticker.slice(0,4)}</span>`;
}

function createLogoImg(ticker, size=44) {
  const url = getLogoUrl(ticker);
  const r = size <= 40 ? 8 : 12;
  const wrap = document.createElement('div');
  wrap.style.cssText = `width:${size}px;height:${size}px;border-radius:${r}px;border:1px solid var(--border);overflow:hidden;background:var(--bg2);flex-shrink:0;display:flex;align-items:center;justify-content:center;`;
  if(url) {
    const img = document.createElement('img');
    img.src = url;
    img.style.cssText = `width:100%;height:100%;object-fit:contain;padding:${size<=40?3:4}px;`;
    img.onerror = () => autoLookupLogo(ticker, img);
    wrap.appendChild(img);
  } else {
    // No domain in map, go straight to lookup
    const img = document.createElement('img');
    img.style.cssText = `width:100%;height:100%;object-fit:contain;padding:${size<=40?3:4}px;`;
    wrap.appendChild(img);
    autoLookupLogo(ticker, img);
  }
  return wrap;
}
