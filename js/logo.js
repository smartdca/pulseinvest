// ============================================================
// logo.js — Ticker Logo 模組(全站唯一的 logo 來源)
//
// 【怎麼用】
//   createLogoImg(ticker, size) → 回傳一個包好的方塊元素,直接 appendChild
//   getLogoUrl(ticker, size)    → 只要網址時用這支
//
// 【為什麼整個重寫】
//   舊版是兩步:先問第三方「這個代號的公司網域是什麼」,拿到網域再去圖庫抓圖。
//   兩步都會失敗,而且失敗時很安靜(掉到文字後備,不報錯),所以壞了不會有人知道。
//   實測舊來源:AAPL 因為一個「網址必須有 http 開頭」的判斷被擋掉、
//   BTC 會撈到一家同名的澳洲公司、台股代號直接回空結果。
//   現在改成一步:網址直接帶代號,對方自己解析。少掉四個會出錯的環節。
//
// 【三層,由上而下】
//   ① assets.js 的 DCA_LOGO_IMG —— 自己放的本地圖,優先於一切。
//      台股 ETF 這類外部服務查不到的,就在那裡指一張圖。
//   ② Brandfetch —— 個股/ETF 走 ticker 路徑,加密貨幣走 crypto 路徑。
//   ③ 文字後備 —— 上面都沒有時顯示代號前幾個字。
//
// 【刻意不做快取】
//   舊版把查到的網域存進 localStorage。那是「每台裝置各存一份」,換裝置、
//   無痕視窗就等於全新,這正是「別人第一次來都沒圖」的原因。
//   現在的網址是固定的,瀏覽器和 CDN 自己會處理,不需要我們存。
//   對方的使用條款也要求直接連網址,不要下載或轉存。
//
// 【依賴】
//   window.DCA_LOGO_IMG(/assets.js)—— 沒有也能跑,以 || {} 兜底。
//   window.DCA_ASSETS (/assets.js)—— 只用來認加密貨幣,沒有也能跑。
//   不依賴 PROXY、不依賴 Turnstile,所以任何頁面載入就能用。
// ============================================================

// 公開金鑰,設計上就是放在網頁裡給瀏覽器讀的,跟密碼不同。
const LOGO_CLIENT_ID = '1id2WDtIC6Z6ifyEB9h';
const LOGO_BASE = 'https://cdn.brandfetch.io';

// fallback/404:查不到時要對方回「找不到」,不要回一張空白圖。
// 這一點很重要 —— 回空白圖的話圖片算是載入成功,onerror 不會觸發,
// 我們的文字後備永遠不會啟動,畫面上就是一塊白,比破圖還難看。
const LOGO_FALLBACK = 'fallback/404';

// 要幾 px 的圖:用顯示尺寸的兩倍(高解析螢幕才不會糊),夾在 64～512 之間。
function logoPixels(size) {
  const px = Math.round((Number(size) || 128) * 2);
  return Math.max(64, Math.min(512, px));
}

// 加密貨幣要走另一條路徑。走錯的話 BTC 會撈到同名的上市公司。
// 判斷依據有兩個:代號帶交易對後綴(BTC-USD),或 assets.js 標了 cat:'crypto'。
function isCryptoTicker(raw) {
  const t = String(raw || '').toUpperCase();
  if (/-USD[TC]?$/.test(t)) return true;
  const bare = t.replace(/-USD[TC]?$/, '');
  const list = window.DCA_ASSETS || [];
  return list.some(a =>
    a && a.cat === 'crypto' &&
    (String(a.ticker || '').toUpperCase() === bare ||
     String(a.query || '').toUpperCase() === t)
  );
}

function getLogoUrl(ticker, size) {
  const raw = String(ticker || '').toUpperCase();
  if (!raw) return null;
  const bare = raw.replace(/-USD[TC]?$/, '');

  // ① 本地圖優先。命中就直接回傳,不碰任何外部服務。
  const local = (window.DCA_LOGO_IMG || {})[bare] || (window.DCA_LOGO_IMG || {})[raw];
  if (local) return local;

  // ② 外部來源。個股/ETF 用完整代號(例如 BRK-B 要保留減號),加密用去後綴的。
  const route = isCryptoTicker(raw) ? 'crypto' : 'ticker';
  const symbol = route === 'crypto' ? bare : raw;
  const px = logoPixels(size);
  return LOGO_BASE + '/' + route + '/' + encodeURIComponent(symbol)
       + '/w/' + px + '/h/' + px + '/' + LOGO_FALLBACK
       + '?c=' + LOGO_CLIENT_ID;
}

// ③ 文字後備。整個外框換成代號前幾個字,不留破圖。
function showTickerFallback(imgEl, ticker) {
  const parent = imgEl && imgEl.parentElement;
  if (parent) {
    parent.innerHTML = '<span style="font-size:10px;font-weight:700;color:var(--ink2);">'
      + String(ticker || '').slice(0, 4) + '</span>';
  }
}

// 相容用。舊版這支負責「圖抓不到時去查網域」,現在網址一次就決定了,
// 沒有第二次機會可以試 —— 所以它只剩下「把圖換成正確網址,失敗就顯示文字」。
// 站上仍有幾處在呼叫它(例如首頁本週精選那張主打卡),保留可避免那些地方報錯。
function autoLookupLogo(ticker, imgEl) {
  if (!imgEl) return;
  const url = getLogoUrl(ticker);
  if (!url) { showTickerFallback(imgEl, ticker); return; }
  imgEl.onerror = () => showTickerFallback(imgEl, ticker);
  imgEl.src = url;
}

function createLogoImg(ticker, size = 44) {
  const r = size <= 40 ? 8 : 12;
  const wrap = document.createElement('div');
  wrap.style.cssText = `width:${size}px;height:${size}px;border-radius:${r}px;border:1px solid var(--border);overflow:hidden;background:var(--bg2);flex-shrink:0;display:flex;align-items:center;justify-content:center;`;

  const url = getLogoUrl(ticker, size);
  if (!url) {
    wrap.innerHTML = '<span style="font-size:10px;font-weight:700;color:var(--ink2);">'
      + String(ticker || '').slice(0, 4) + '</span>';
    return wrap;
  }

  const img = document.createElement('img');
  img.style.cssText = `width:100%;height:100%;object-fit:contain;padding:${size <= 40 ? 3 : 4}px;`;
  img.onerror = () => showTickerFallback(img, ticker);
  img.src = url;
  wrap.appendChild(img);
  return wrap;
}
