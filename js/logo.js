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
// 【台股補強】(實測:Brandfetch 查得到台積電 2330.TW,代碼與 ISIN 兩種都行;
//   查不到 0050 這類台股 ETF,中小型股也常常沒有)
//   · 台股 ETF:改查「發行投信」的 Logo(Brandfetch 網域路徑),對照表在 TW_ETF_ISSUER。
//   · 台股個股:代碼查不到時,自動改用 ISIN 再查一次(ISIN 由代碼換算,不用另外查)。
//     這一步是全站生效的:不管哪一頁自己設了什麼 onerror,都會先補查一次 ISIN,
//     ISIN 也查不到才輪到那一頁原本的文字後備。
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

// 台股 ETF → 發行投信網域。新增 ETF 時在這裡加一行;查不到的投信照樣會走文字後備。
const TW_ETF_ISSUER = {
  '0050': 'yuantafunds.com', '0056': 'yuantafunds.com', '00713': 'yuantafunds.com', '00940': 'yuantafunds.com',
  '006208': 'fubon.com', '0052': 'fubon.com',
  '00878': 'cathaysite.com.tw', '00881': 'cathaysite.com.tw',
  '00919': 'capitalfund.com.tw',
  '00929': 'fhtrust.com.tw',
  '00939': 'ezmoney.com.tw'
};

// 2330.TW → '2330';不是台股代碼回傳 null
function twCode(raw) {
  const m = String(raw || '').toUpperCase().match(/^(\d{4,6}[A-Z]?)\.(TW|TWO)$/);
  return m ? m[1] : null;
}

// 台股個股代碼 → ISIN(TW + 000 + 四位代碼 + 00 + 檢查碼)。例:2330 → TW0002330008
function twIsin(code) {
  if (!/^\d{4}$/.test(code)) return null;
  const body = 'TW000' + code + '00';
  const digits = body.split('').map(c => parseInt(c, 36)).join('');
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = +digits[digits.length - 1 - i];
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return body + ((10 - sum % 10) % 10);
}

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
  const px0 = logoPixels(size);
  // 台股 ETF 直接查發行投信(用代碼一定查不到)
  const tw = twCode(raw);
  if (tw && TW_ETF_ISSUER[tw]) {
    return LOGO_BASE + '/domain/' + TW_ETF_ISSUER[tw]
         + '/w/' + px0 + '/h/' + px0 + '/' + LOGO_FALLBACK + '?c=' + LOGO_CLIENT_ID;
  }
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
  // 貼滿到邊、不留內距:外框有圓角且會裁切,所以圖自帶的底色會直接變成圓角,
  // 看起來像一顆 app 圖示。留內距的話中間那圈縫隙會露出我們自己的底色,
  // 就變成「圓角框裡塞一個方塊」。cover 會裁掉極少量邊緣,這是取捨。
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
  img.onerror = () => showTickerFallback(img, ticker);
  img.src = url;
  wrap.appendChild(img);
  return wrap;
}

// ── 台股個股:代碼查不到時,全站自動改用 ISIN 補查一次 ──────────────────
// 用「捕獲階段」監聽圖片載入失敗:這個監聽會比圖片自己的 onerror 先執行。
// 只有「Brandfetch 代碼路徑 + 台股四位數代碼 + 還沒補查過」這種情況才介入。
//
// 做法:先攔下這次錯誤,另外用一張看不見的測試圖去載 ISIN 網址——
//   · 測試圖載入成功 → 才把畫面上的圖換成 ISIN 網址(一定載得出來)
//   · 測試圖也失敗   → 對原本的圖重新發出一次錯誤,交還給那一頁原本的文字後備
// 上一版是直接改畫面上那張圖的網址,再指望它「第二次失敗」時觸發文字後備,
// 實測在 iOS Safari 上第二次失敗沒有交接成功,留下破圖。這版不改畫面上的圖,
// 確定 ISIN 有圖才換,沒圖就明確觸發原本的後備,不依賴第二次載入事件。
window.addEventListener('error', function (ev) {
  const img = ev.target;
  if (!img || img.tagName !== 'IMG' || img.dataset.logoIsinTried) return;
  const src = img.currentSrc || img.src || '';
  const m = src.match(/cdn\.brandfetch\.io\/ticker\/([^/]+)\/w\/(\d+)\/h\/(\d+)\//);
  if (!m) return;
  const code = twCode(decodeURIComponent(m[1]));
  const isin = code && twIsin(code);
  if (!isin) return;
  img.dataset.logoIsinTried = '1';
  ev.stopImmediatePropagation();
  const isinUrl = LOGO_BASE + '/isin/' + isin + '/w/' + m[2] + '/h/' + m[3] + '/' + LOGO_FALLBACK + '?c=' + LOGO_CLIENT_ID;
  const probe = new Image();
  probe.onload = function () { img.src = isinUrl; };
  probe.onerror = function () { img.dispatchEvent(new Event('error')); };
  probe.src = isinUrl;
}, true);
