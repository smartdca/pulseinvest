// DCAcafé — /api/ticker-score
// Accepts ?ticker=AAPL, fetches Yahoo Finance data server-side,
// computes percentiles, runs the score formula, returns result.
// Designed for blog article DCA Score chips (no Turnstile needed).
// Protected by: IP rate limit (30/min) + CDN edge cache (1hr).

// ── 2026-07-23:公式改成跟 /api/score 共用同一份 ────────────────────────────
// 背景:這支原本自己抄了一份 calcScore。當初這麼做是有原因的——那時 score.js
// 還沒有 export calcScore,要共用就得先改核心計分檔案,風險較高。
// 但 round17 加入 P/FCF 估值因子時只改了 score.js,這份抄出來的沒人記得同步,
// 於是同一支美股在部落格 chip 與主站會算出不同分數。實測差距最大可達 18 分,
// 足以跨過 60 分門檻(= 有沒有 BUY SIGNAL 會翻掉),不是小數點誤差。
//
// 現在 score.js 已經為了趨勢圖(historical-score.js)加上 export,共用門檻等於零,
// 當初擋著的理由已經不存在,所以把抄出來的那份刪掉、直接 import。
import { calcScore, calcMultiplier, calcSignalLights } from './score.js';

// ── 2026-07-24 第三步:接上 P/FCF ★ 這一步才讓 chip 與主站的數字一致 ──────────
// 前兩步的狀態:
//   ① 07-23 消滅第二份公式(結構修正,數字沒變)
//   ② 07-24 CDN 邊緣快取(流量保護,數字沒變)
//   ③ 本次:接上 P/FCF —— 落差從最大 18 分收斂到 1 分以內
//
// 【為什麼不能直接打 FMP】
// FMP 免費方案 250 calls/day,且跟主站共用同一份額度。本端點完全公開、無 Turnstile,
// 讀者流量會直接換算成 FMP 消耗,一篇文章紅起來就爆。
//
// 【解法:季度共用快取 + 股價比例還原】★ 整個設計的核心
// P/FCF = 市值 ÷ 自由現金流。分母一季才變一次,分子(股價)每天在變。
// 所以快取時一併存下「當時的股價」,之後任何一天都能還原:
//     今天的 P/FCF = 快取當時的 P/FCF × (今天股價 ÷ 快取當時股價)
// 股價從 Yahoo 即時抓(免費、無額度),FMP 那半邊 90 天才碰一次。
// 這讓快取放到一季也不犧牲準確度 —— 數字仍然是「今天的」,不是「上次更新那天的」。
//
// 【額度數學】
// 每支股票每季 1 次 FMP → 理論上限 250 × 90 = 22,500 支不重複代號,
// 比全美上市家數還多。這個限制實務上碰不到。
//
// 【還原時超出區間怎麼辦 —— 剛好與主站行為一致,不是近似】
// 若今天的 P/FCF 跌破快取當時的 rangeLow,我們夾到百分位 1(最便宜)。
// 主站即時重算時,rangeLow = Math.min(...annuals, current) 會等於今天的值,
// 算出來同樣是 1。高檔那側同理會是 0。所以夾擠是精確重現,不是誤差。
import { getPfcfCache, setPfcfCache, getBasicCache, setBasicCache } from './sheets.js';
import { computePfcfSnapshot } from './fmp-fundamentals.js';

// 一季。之所以不是「永久」:FMP 的 key-metrics 只有 5 筆年度資料,
// 新的財報年度進來時整個區間(rangeLow/rangeHigh)會變,90 天確保跟得上。
const PFCF_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// 基本數據季快取(EPS/營收/毛利…一季才變一次;PE/市值/殖利率讀取時用當下股價還原)
const BASIC_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const FMP_API_KEY = process.env.FMP_API_KEY;
const FMP_BASE = 'https://financialmodelingprep.com/stable';

// ⚠️ 必須跟 fmp-fundamentals.js 的 handler 用同一組正則。
// 主站的 fetchPfcfData 會經過那個 handler、被這條正則擋下(例:BRK-A 有連字號,
// 拿不到 P/FCF)。這裡若不套同一條,BRK-A 在主站沒有估值面、在 chip 卻有,
// 兩邊又會不一致 —— 這正是本輪要根除的問題。
const FMP_TICKER_RE = /^[A-Z.]{1,10}$/;

// ── 2026-07-24:CDN 邊緣快取 ────────────────────────────────────────────────
// 原本用 `const cache = new Map()` 存 1 小時。但 Vercel serverless 每個 instance
// 各自持有一份 Map,冷啟動就清空、流量上來會同時跑多個 instance 互不相通,
// 結果大部分讀者還是會真的執行到函式、真的去打 Yahoo。已移除,改用 CDN。
//
// 【為什麼要下三個標頭而不是一個】
// Vercel 會在回應送到瀏覽器前把 s-maxage 拿掉、改寫成
// `public, max-age=0, must-revalidate`,所以從手機端根本觀測不到快取有沒有生效;
// 而且一旦沒生效,站上表現完全正常、不會報錯 —— 要等到文章爆紅、Yahoo 回 429、
// chip 整排變 N/A 才會發現。失敗是無聲的,所以用結構把不確定性消掉,不靠測試。
//
// 【為什麼要有 DEGRADED 這一檔】★ 本輪新增
// 若某支股票「本來該有 P/FCF、但這次沒拿到」(FMP 掛掉/額度用盡/Sheets 讀不到),
// 算出來的是缺估值面的舊式分數。這種分數若被 CDN 存滿一小時,等於本輪修好的
// bug 每次 FMP 打嗝就固定復發一小時。給它 5 分鐘,錯誤狀態很快自己修復,
// 同時又不會讓 FMP 故障期間每個讀者都去重打一次。
const CACHE_SUCCESS = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=600';
const CACHE_DEGRADED = 'public, max-age=0, s-maxage=300';
const CACHE_NONE = 'no-store';

// 一次設定三個標頭。所有回傳路徑一律走這支,避免日後新增分支時漏設其中一個。
function setCache(res, value) {
  res.setHeader('Cache-Control', value);
  res.setHeader('CDN-Cache-Control', value);
  res.setHeader('Vercel-CDN-Cache-Control', value);
}

// ── Rate limiting ────────────────────────────────────────────────
// ⚠️ 已知限制(本輪刻意不動):這個 Map 跟被移除的快取是同一種病——
// 跨 instance 不共用,實際擋不住分散流量。但加了 CDN 之後大部分請求根本進不到
// 函式,這層的壓力自然變小。要真正修它得引入外部儲存,屬於另一件事。
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 30;
const rateLimit = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimit.set(ip, { start: now, count: 1 });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// ── Math helpers (mirrors index.html) ───────────────────────────
function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMA(closes, period) {
  const result = [];
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

function calcRSIPercentile(history, current) {
  if (history.length === 0) return 0.5;
  return history.filter(r => r <= current).length / history.length;
}

function isBlackSwan(drawdown, vix) {
  return drawdown <= -20 && vix >= 40;
}

// ── P/FCF 取得:先讀快取,沒中才打 FMP ────────────────────────────────────
// 回傳 { hasPfcf, pfcfPercentile, degraded }
//   degraded=true 代表「這支本來該有 P/FCF,但這次沒拿到」——呼叫端據此縮短 CDN 快取。
//   非股票(ETF/加密貨幣/貴金屬)或代號格式不符,是正常的「本來就沒有」,degraded=false。
// ⚠️ 這整段任何一步失敗都只是退回 hasPfcf:false,絕不 throw ——
//    估值面是加分項,不能因為它壞掉就讓整排 chip 顯示 N/A。
async function resolvePfcf(ticker, currentPrice, instrumentType) {
  // 非股票類本來就沒有財報,不是降級
  if (instrumentType !== 'EQUITY') return { hasPfcf: false, degraded: false };
  // 跟主站被同一條正則擋下的代號(例:BRK-A),兩邊行為必須一致
  if (!FMP_TICKER_RE.test(ticker)) return { hasPfcf: false, degraded: false };
  if (!(currentPrice > 0)) return { hasPfcf: false, degraded: true };

  // ── 1. 先讀共用快取 ──
  try {
    const cached = await getPfcfCache(ticker);
    if (cached) {
      const age = Date.now() - new Date(cached.updatedAt).getTime();
      const span = cached.rangeHigh - cached.rangeLow;
      if (Number.isFinite(age) && age >= 0 && age < PFCF_TTL_MS && span > 0) {
        // 從存下來的百分位反推當時的 P/FCF:
        //   percentile = (high - current) / (high - low)  ⇒  current = high - percentile × (high - low)
        const pfcfAtCache = cached.rangeHigh - cached.pfcfPercentile * span;
        if (pfcfAtCache > 0) {
          // 用股價比例還原到今天。兩個股價都來自 Yahoo,幣別自然相消,不需要換匯。
          const pfcfToday = pfcfAtCache * (currentPrice / cached.priceAtCache);
          const pct = (cached.rangeHigh - pfcfToday) / span;
          return {
            hasPfcf: true,
            pfcfPercentile: Math.max(0, Math.min(1, pct)),
            pfcfValue: pfcfToday,
            degraded: false,
          };
        }
      }
      // 走到這裡 = 過期或資料異常,往下走重新抓
    }
  } catch (e) {
    console.error('resolvePfcf cache read error:', e);
    // 讀快取失敗不放棄,往下試著直接打 FMP
  }

  // ── 2. 快取沒中/過期 → 當場打 FMP,順便寫回快取 ──
  // 刻意不選「先回傳舊式分數、之後再補」:那會讓每季快取到期後的那一小時,
  // 所有讀者都看到缺估值面的分數,等於這個 bug 每季固定復發一次。
  // 代價只有一季一次、某一位讀者多等 1–2 秒。
  try {
    const snap = await computePfcfSnapshot(ticker);
    if (!snap.hasPfcf) {
      // insufficient_data / degenerate_range 是這支股票「本質上算不出來」,
      // 跟主站行為一致,不算降級;其餘(fetch_failed 等)才是暫時性故障。
      const structural = snap.reason === 'insufficient_data' || snap.reason === 'degenerate_range';
      return { hasPfcf: false, degraded: !structural };
    }

    // 寫入失敗不影響本次結果,只是下一位讀者會再打一次 FMP
    await setPfcfCache(ticker, {
      pfcfPercentile: snap.pfcfPercentile,
      rangeLow: snap.rangeLow,
      rangeHigh: snap.rangeHigh,
      priceAtCache: currentPrice,
    });

    return { hasPfcf: true, pfcfPercentile: snap.pfcfPercentile, pfcfValue: snap.currentPfcf, degraded: false };
  } catch (e) {
    console.error('resolvePfcf fetch error:', e);
    return { hasPfcf: false, degraded: true };
  }
}

// ── Data fetcher ─────────────────────────────────────────────────
async function fetchYahoo(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Yahoo fetch failed: ${res.status}`);
  return res.json();
}

// ── 基本數據(FMP,放寬顯示授權後改走這條)──────────────────────────
// 只存季度穩定的原始值,PE/市值/殖利率由 computeTickerScore 用當下股價還原。
// ⚠️ FMP /stable 各端點的欄位名可能與此處猜測略有出入 —— 用多候選 + fallback 防呆,
//    抓不到的欄位回 null(部分缺不影響其他欄位),整體失敗才 degraded。
async function fmpGet(path) {
  const url = `${FMP_BASE}/${path}${path.includes('?') ? '&' : '?'}apikey=${FMP_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FMP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) throw new Error('FMP empty/invalid');
  return data;
}

async function computeBasicSnapshot(ticker, debug = false) {
  if (!FMP_API_KEY) return { ok: false, reason: 'server_not_configured' };
  // 單支失敗回 null,不拖垮整包(key-metrics-ttm 已知會通,其餘盡力而為)
  const tryGet = async (path) => { try { return await fmpGet(path); } catch (e) { return null; } };
  const [km, ratios, income] = await Promise.all([
    tryGet(`key-metrics-ttm?symbol=${ticker}`),
    tryGet(`ratios-ttm?symbol=${ticker}`),
    tryGet(`income-statement?symbol=${ticker}&limit=2`),
  ]);
  if (!km && !ratios && !income) return { ok: false, reason: 'all_failed' };

  const k = (km && km[0]) || {}, r = (ratios && ratios[0]) || {}, i0 = (income && income[0]) || {}, i1 = (income && income[1]) || {};
  const pick = (o, ...keys) => { for (const key of keys) { const v = o[key]; if (typeof v === 'number' && Number.isFinite(v)) return v; } return null; };
  const growth = (a, b) => (a != null && b != null && b !== 0) ? (a - b) / Math.abs(b) : null;

  const epsI = pick(i0, 'epsdiluted', 'eps');
  const epsPrev = pick(i1, 'epsdiluted', 'eps');
  const revI = pick(i0, 'revenue');
  const revPrev = pick(i1, 'revenue');

  const snap = {
    ok: true,
    // EPS/PE/市值/殖利率:優先 key-metrics-ttm(已知會通)
    eps: epsI ?? pick(k, 'netIncomePerShareTTM'),
    epsGrowth: growth(epsI, epsPrev),
    revenue: revI,
    revenueGrowth: growth(revI, revPrev),
    grossMargin: pick(r, 'grossProfitMarginTTM', 'grossProfitMargin'),
    netMargin: pick(r, 'netProfitMarginTTM', 'netProfitMargin') ?? pick(k, 'netProfitMarginTTM'),
    dividendYield: pick(k, 'dividendYieldTTM') ?? pick(r, 'dividendYieldTTM', 'dividendYielTTM'),
    divPerShare: pick(k, 'dividendPerShareTTM') ?? pick(r, 'dividendPerShareTTM'),
    sharesOut: pick(i0, 'weightedAverageShsOutDil', 'weightedAverageShsOut'),
    // 備援:市值/PE 若無法用股價還原,直接用 FMP 現成值
    marketCapFallback: pick(k, 'marketCapTTM', 'marketCap'),
    peFallback: pick(k, 'peRatioTTM', 'priceToEarningsRatioTTM'),
  };
  if (debug) {
    snap._debug = {
      kmKeys: Object.keys(k), ratiosKeys: Object.keys(r), incomeKeys: Object.keys(i0),
      kmOk: !!km, ratiosOk: !!ratios, incomeOk: !!income,
    };
  }
  return snap;
}

// 快取優先;命中且未過期直接回,否則打 FMP 再寫回。任何失敗回 {ok:false, degraded}。
async function resolveBasic(ticker, instrumentType, debug = false) {
  if (instrumentType !== 'EQUITY') return { ok: false, degraded: false };
  if (!FMP_TICKER_RE.test(ticker)) return { ok: false, degraded: false };
  if (!debug) {
    try {
      const cached = await getBasicCache(ticker);
      if (cached) {
        const age = Date.now() - new Date(cached.updatedAt).getTime();
        if (Number.isFinite(age) && age >= 0 && age < BASIC_TTL_MS) {
          return { ok: true, data: cached.data, degraded: false };
        }
      }
    } catch (e) { console.error('resolveBasic cache read:', e); }
  }
  try {
    const snap = await computeBasicSnapshot(ticker, debug);
    if (!snap.ok) return { ok: false, degraded: true };
    const { ok, reason, _debug, ...data } = snap;
    if (!debug) await setBasicCache(ticker, data); // debug 模式不寫快取
    return { ok: true, data, degraded: false, _debug };
  } catch (e) {
    return { ok: false, degraded: true };
  }
}

// ── 加密資產專屬指標(2026新增)──────────────────────────────────
// 只在 CRYPTOCURRENCY 觸發;三個外部來源平行抓、各自 try/catch;任何一項失敗回 null
// (前端那張卡就不顯示),整個函式絕不 throw、絕不影響股票路徑。
// 波動度用「已抓的 10y 日收盤」自算(不多打)。市值/流通量/總量上限/ATH 用 CoinGecko markets
// (Yahoo v7 quote 需 crumb 拿不到,已棄用)。情緒用 alternative.me。
// CoinGecko id 對應(加密代碼 → CoinGecko id)。CoinGecko 不認 "BTC-USD",用自己的 id。
// ⚠️ 新增幣種時在這裡補一筆(如 'ETH-USD':'ethereum');查不到就跳過市值那排,不拖垮。
const COINGECKO_ID = { 'BTC-USD': 'bitcoin', 'ETH-USD': 'ethereum' };

async function resolveCrypto(ticker, closes) {
  const out = { marketCap: null, circulatingSupply: null, maxSupply: null, volume24h: null,
                ath: null, athDate: null, athFromCurrent: null, volatility: null, fearGreed: null };
  const current = closes[closes.length - 1];

  // 年化波動度(自算,加密以 365 天年化)
  try {
    const rets = [];
    for (let i = 1; i < closes.length; i++) { const r = Math.log(closes[i] / closes[i - 1]); if (Number.isFinite(r)) rets.push(r); }
    if (rets.length > 30) {
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      const varc = rets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / rets.length;
      out.volatility = Math.round(Math.sqrt(varc) * Math.sqrt(365) * 1000) / 10;
    }
  } catch (e) { /* 波動度算不出就 null */ }

  // 兩個外部來源平行抓(市值/ATH 走 CoinGecko、情緒走 alternative.me),互不阻塞、互不拖垮。
  const cgId = COINGECKO_ID[ticker] || null;
  const [cgR, fngR] = await Promise.allSettled([
    cgId ? fetchYahoo(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${cgId}`) : Promise.reject('no-cg-id'),
    fetchYahoo('https://api.alternative.me/fng/?limit=1'),
  ]);

  // 市值 / 流通量 / 總量上限 / 24h 量 / ATH(全部走 CoinGecko;查不到 id 或失敗就 null)
  if (cgR.status === 'fulfilled') { try {
    const it = Array.isArray(cgR.value) ? cgR.value[0] : null;
    if (it) {
      out.marketCap = (typeof it.market_cap === 'number') ? it.market_cap : null;
      out.circulatingSupply = (typeof it.circulating_supply === 'number') ? it.circulating_supply : null;
      out.maxSupply = (typeof it.max_supply === 'number' && it.max_supply > 0) ? it.max_supply : null;
      out.volume24h = (typeof it.total_volume === 'number') ? it.total_volume : null;
      // ATH:用 CoinGecko 盤中真高點(比 Yahoo 週線收盤準),距高點也直接給
      if (typeof it.ath === 'number' && it.ath > 0) {
        out.ath = it.ath;
        if (typeof it.ath_change_percentage === 'number') out.athFromCurrent = Math.round(it.ath_change_percentage * 10) / 10;
        if (it.ath_date) { const d = new Date(it.ath_date); if (!isNaN(d)) out.athDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
      }
    }
  } catch (e) {} }

  // Crypto Fear & Greed(alternative.me,0–100 + 分類)
  if (fngR.status === 'fulfilled') { try {
    const d = fngR.value?.data?.[0];
    if (d && d.value != null) out.fearGreed = { value: +d.value, label: d.value_classification || '' };
  } catch (e) {} }

  return out;
}

async function computeTickerScore(ticker, full = false, debug = false) {
  // Fetch ticker data (10yr daily) and VIX (5yr daily) in parallel
  const [tickerData, vixData] = await Promise.all([
    fetchYahoo(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=10y&interval=1d`),
    fetchYahoo('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=5y&interval=1d'),
  ]);

  // Parse ticker
  const result = tickerData?.chart?.result?.[0];
  if (!result) throw new Error('unsupported');
  const closes = (result.indicators.quote[0].close || []).filter(c => c != null && c > 0);
  if (closes.length < 20) throw new Error('unsupported');

  // Yahoo 免費附帶的資產類型(EQUITY / ETF / CRYPTOCURRENCY / INDEX ...),
  // 跟 index.html 用的是同一個欄位,不靠寫死的代號清單去猜。
  const instrumentType = result.meta?.instrumentType || '';
  // 幣別同樣是 Yahoo chart 免費附帶的欄位,不需要額外請求。
  // 非美元資產(例:0050.TW)少了這個,價格會變成沒有單位的裸數字。
  const currency = result.meta?.currency || '';

  // RSI + RSI history
  const rsi = calculateRSI(closes, 14);
  const rsiHistory = [];
  for (let i = 14; i < closes.length - 1; i++) {
    rsiHistory.push(calculateRSI(closes.slice(Math.max(0, i - 14), i + 1), Math.min(14, i)));
  }
  const prsi = calcRSIPercentile(rsiHistory, rsi);

  // 52-week drawdown
  const currentPrice = closes[closes.length - 1];
  const high52 = Math.max(...closes.slice(-252));
  const drawdown = ((currentPrice - high52) / high52) * 100;

  // Historical max drawdown
  let maxDrawdown = 0;
  let peak = closes[0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > peak) peak = closes[i];
    const dd = (closes[i] - peak) / peak * 100;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }
  maxDrawdown = Math.min(maxDrawdown, -20);
  const ddDenom = Math.abs(maxDrawdown || -40);
  const ddPercentile = Math.min(1, Math.abs(drawdown) / ddDenom);

  // 200-week MA
  const MA200W_PERIOD = 1000;
  const hasEnoughData = closes.length >= MA200W_PERIOD;
  const ma200wArr = hasEnoughData ? calculateMA(closes, MA200W_PERIOD) : [];
  const ma200w = ma200wArr.length > 0 ? ma200wArr[ma200wArr.length - 1] : null;
  const ma200wDeviationHistory = [];
  if (hasEnoughData) {
    for (let i = 0; i < ma200wArr.length; i++) {
      const priceAtBar = closes[i + MA200W_PERIOD - 1];
      if (ma200wArr[i] > 0) ma200wDeviationHistory.push(priceAtBar / ma200wArr[i] - 1);
    }
  }
  const currentDeviation = ma200w ? (currentPrice / ma200w - 1) : null;
  const hasMa = !!(ma200wDeviationHistory.length > 0 && currentDeviation !== null);
  let maPercentile = 0.5;
  if (hasMa) {
    maPercentile = ma200wDeviationHistory.filter(d => d >= currentDeviation).length / ma200wDeviationHistory.length;
  }

  // VIX
  const vixCloses = (vixData?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(c => c != null && c > 0);
  const vix = vixCloses.length > 0 ? vixCloses[vixCloses.length - 1] : 20;
  const vixPercentile = vixCloses.length > 0
    ? vixCloses.filter(v => v <= vix).length / vixCloses.length
    : 0.5;

  const blackSwan = isBlackSwan(drawdown, vix);

  // P/FCF(2026-07-24新增):股票類才會真的去拿,其餘安靜退回 hasPfcf:false,
  // calcScore 走既有的 hasMa && !hasPfcf 分支,行為跟本輪之前完全相同。
  const pfcf = await resolvePfcf(ticker.toUpperCase(), currentPrice, instrumentType);

  const score = calcScore({
    prsi, ddPercentile, vixPercentile, maPercentile, hasMa,
    pfcfPercentile: pfcf.hasPfcf ? pfcf.pfcfPercentile : 0.5,
    hasPfcf: pfcf.hasPfcf,
  });
  const triggered = score >= 60;

  // _degraded 不回傳給前端(chip 不需要知道),只讓 handler 決定快取長度
  //
  // price / currency:給浮動快速查詢(js/quick-score.js)用的。
  // 它要顯示的就是 Logo/代號/價格/分數四樣,分數已經在這裡,價格也早就算出來了
  // (currentPrice 來自同一份 chart 資料),一併回傳等於零成本。
  // 少了這兩個欄位,那個元件就得自己再打一次 Yahoo —— 那正是本輪要消滅的東西。
  // 這兩個欄位是「加上去」的,chip 讀的仍然只有 score,不受影響。
  const base = {
    ticker: ticker.toUpperCase(),
    score, triggered, blackSwan,
    price: currentPrice,
    currency,
    _degraded: pfcf.degraded,
  };

  // chip 路徑(預設):除了上面新增的 price / currency 之外,結構與先前相同。
  if (!full) return base;

  // ── full=1(資產頁專用):加回五因子細項＋倍數＋基本數據 ──
  const lights = calcSignalLights({
    prsi, ddPercentile, vixPercentile, maPercentile, hasMa,
    pfcfPercentile: pfcf.hasPfcf ? pfcf.pfcfPercentile : 0.5, hasPfcf: pfcf.hasPfcf,
  });

  const factors = {
    ma:   { hasMa, value: hasMa ? Math.round(currentDeviation * 1000) / 10 : null, percentile: hasMa ? maPercentile : null, light: lights.ma200w || null },
    rsi:  { value: Math.round(rsi), percentile: prsi, light: lights.rsi },
    dd:   { value: Math.round(drawdown * 10) / 10, percentile: ddPercentile, light: lights.dd },
    vix:  { value: Math.round(vix * 10) / 10, percentile: vixPercentile, light: lights.vix },
    pfcf: { hasPfcf: pfcf.hasPfcf, value: pfcf.hasPfcf ? Math.round(pfcf.pfcfValue * 10) / 10 : null, percentile: pfcf.hasPfcf ? pfcf.pfcfPercentile : null, light: lights.pfcf || null },
  };

  const multiplier = calcMultiplier(score);

  // 價格型(股價/漲跌/52週高低)從已抓的 chart 資料算,不多打 Yahoo。
  const prevClose = closes.length >= 2 ? closes[closes.length - 2] : currentPrice;
  const change = currentPrice - prevClose;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;
  const low52 = Math.min(...closes.slice(-252));

  // 財報型走 FMP 季快取,價格型用 chart。PE/市值/殖利率用當下股價還原(季快取也不失準)。
  let basic, basicDegraded = false;
  const basicRes = await resolveBasic(ticker.toUpperCase(), instrumentType, debug);
  const priceFields = { price: currentPrice, change, changePct, high52, low52 };
  if (basicRes.ok) {
    const d = basicRes.data || {};
    basic = {
      ...priceFields,
      marketCap: (d.sharesOut != null) ? currentPrice * d.sharesOut : (d.marketCapFallback ?? null),
      peTTM: (d.eps != null && d.eps > 0) ? Math.round((currentPrice / d.eps) * 10) / 10 : (d.peFallback != null ? Math.round(d.peFallback * 10) / 10 : null),
      eps: d.eps ?? null,
      epsGrowth: d.epsGrowth ?? null,
      revenue: d.revenue ?? null,
      revenueGrowth: d.revenueGrowth ?? null,
      grossMargin: d.grossMargin ?? null,
      netMargin: d.netMargin ?? null,
      dividendYield: (d.divPerShare != null && currentPrice > 0) ? d.divPerShare / currentPrice : (d.dividendYield ?? null),
      partial: false,
    };
  } else {
    basicDegraded = basicRes.degraded === true;
    basic = { ...priceFields, partial: true };
  }

  base._degraded = pfcf.degraded || basicDegraded;
  // 加密專屬指標(只加密才抓;股票一律 null,結構多一個欄位、前端忽略)
  const crypto = (instrumentType === 'CRYPTOCURRENCY') ? await resolveCrypto(ticker.toUpperCase(), closes) : null;

  return { ...base, multiplier, factors, basic, crypto, updatedAt: new Date().toISOString(), ...(debug && basicRes._debug ? { _debugBasic: basicRes._debug } : {}) };
}

// ── Handler ──────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://dcacafe.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    setCache(res, CACHE_NONE);
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET') {
    setCache(res, CACHE_NONE);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';
  if (!checkRateLimit(ip)) {
    setCache(res, CACHE_NONE);
    res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    return;
  }

  const ticker = (req.query.ticker || '').trim().toUpperCase();
  if (!ticker || !/^[A-Z0-9.\-^=]{1,10}$/.test(ticker)) {
    setCache(res, CACHE_NONE);
    res.status(400).json({ error: 'Invalid ticker' });
    return;
  }

  try {
    const full = req.query.full === '1' || req.query.full === 'true';
    const debug = req.query.debug === '1';
    const data = await computeTickerScore(ticker, full, debug);
    const degraded = data._degraded === true;
    delete data._degraded; // 內部旗標,不外流

    // ★ 完整結果快取 1 小時;缺估值面的降級結果只快取 5 分鐘;debug 一律不快取。
    setCache(res, debug ? CACHE_NONE : (degraded ? CACHE_DEGRADED : CACHE_SUCCESS));
    res.status(200).json(data);
  } catch (e) {
    // ★ 任何失敗都不快取。Yahoo 恢復後,下一個讀者就會拿到正常結果,
    //   不會被卡在錯誤畫面一小時。
    setCache(res, CACHE_NONE);
    if (e.message === 'unsupported') {
      res.status(400).json({ error: 'unsupported' });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
}
