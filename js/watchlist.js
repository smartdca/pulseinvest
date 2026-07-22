// ============================================================
// watchlist.js — 自選清單模組
// 從 index.html 拆分而出(round46 架構瘦身,第三批),邏輯逐行原樣搬移,未做任何修改。
// 依賴:score-engine(fetchData/calculateDynamicDCA等,定義於index.html)、
// PA_COLORS等paper-allocation相關全域變數(定義於index.html,本檔案之後位置)、
// pushScheduleSync(push相關,定義於index.html)
// ============================================================

function renderWLSparkline(ticker, closes, targetId) {
  const wrap = $(targetId || `wl-spark-${ticker}`);
  if(!wrap || !closes || closes.length < 20) return;
  const maxPts = 150;
  const step = Math.max(1, Math.floor(closes.length / maxPts));
  const pts = [];
  for(let i = 0; i < closes.length; i += step) pts.push(closes[i]);
  if(pts[pts.length-1] !== closes[closes.length-1]) pts.push(closes[closes.length-1]);
  const W = 300, H = 36;
  const minV = Math.min(...pts), maxV = Math.max(...pts);
  const range = maxV - minV || 1;
  const toX = i => (i / (pts.length - 1)) * W;
  const toY = v => ((maxV - v) / range) * (H - 6) + 1;
  let d = pts.map((v,i) => `${i===0?'M':'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const fillD = d + ` L${W},${H} L0,${H} Z`;
  const isUp = pts[pts.length-1] >= pts[0];
  const lineColor = isUp ? '#2d7a4f' : '#b83232';
  const endYear = new Date().getFullYear();
  const startYear = endYear - Math.round(closes.length / 252);
  wrap.innerHTML = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="display:block;">
    <defs><linearGradient id="wlg-${ticker}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${fillD}" fill="url(#wlg-${ticker})" stroke="none"/>
    <path d="${d}" fill="none" stroke="${lineColor}" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>
  <div style="display:flex;justify-content:space-between;margin-top:2px;">
    <span style="font-size:9.5px;font-family:var(--font-sans);color:var(--ink3);">${startYear}</span>
    <span style="font-size:9.5px;font-family:var(--font-sans);color:var(--ink3);">${endYear}</span>
  </div>`;
}

function saveToWatchlist() {
  // round46新增:自選清單是Silver Bean會員專屬功能,不是standalone環境先擋下、引導加入主畫面
  if (typeof requireSilverBean === 'function' && !requireSilverBean()) return;
  const ticker = $('ticker').value.trim().toUpperCase();
  const zh = currentLang === 'zh';
  if(!ticker) return;

  // Check max items
  if(watchlist.length >= WL_MAX_ITEMS) {
    showUpgradeModal();
    return;
  }

  if(!watchlist.find(w => w.ticker===ticker)) {
    // round12: no more per-asset $ input on homepage — real allocation now happens
    // at the portfolio level (Watchlist budget bar / baseline %). This per-item
    // budget is only an internal seed value for the score/multiplier preview.
    const storedBudget = paGetBudget();
    const seedBudget = storedBudget.original > 0
      ? Math.round(storedBudget.original / (watchlist.length + 1))
      : PA_INTERNAL_BUDGET;
    watchlist.push({ticker, budget: seedBudget});
    try { localStorage.setItem('pi_watchlist', JSON.stringify(watchlist)); } catch(e) {}
    pushScheduleSync();

    // round50新增:GA4事件——成功加入自選清單
    if (typeof gtag !== 'undefined') {
      gtag('event', 'add_to_watchlist', { event_category: 'watchlist', ticker: ticker, watchlist_size_after: watchlist.length });
    }

    // Full re-render: new portfolio allocation UI (budget bar/donut/baseline%)
    // needs to recompute across the whole watchlist, not just the new card.
    const list = $('wlList');
    if(list && $('wlPanel').classList.contains('show')) {
      renderWatchlist(false);
    }

    const btn = $('btnSave');
    if (btn) {
      btn.classList.add('saved');
      btn.innerHTML = '✓ <span>' + (zh?'已加入自選清單':'Saved to Watchlist') + '</span>';
      btn.disabled = true;
    }
  }
}

// ── WATCHLIST CACHE (daily) ──
const wlCache = {};
// round42新增:calculateDynamicDCA()內部會打/api/score跟/api/fmp-fundamentals,
// 這兩支都完全沒有做每日快取——wlCache只快取Yahoo價格資料,不含這段。
// 結果是每次renderWatchlist()/acctFetchOneHolding()執行(每次切分頁就會跑一次),
// 都會重新打一次FMP,即使股價資料本身當天已經快取過。這裡補上同一套「當天不重算」的快取,
// key只用ticker(不含budget,因為calculateDynamicDCA的budget參數只影響baseAmount這個
// 衍生欄位,score/multiplier/pfcf等核心結果不受budget影響,可以安全跨情境共用同一份快取)。
const wlScoreCache = {};
const WL_FORCE_KEY = 'wl_force_updates';
const WL_MAX_FORCE = 3; // max forced updates per hour
const WL_MAX_ITEMS = 5; // round41暫時測試用:原本3(free tier limit),先開到5檔測試token重用/載入狀況,測完再決定要不要正式開放

// round42新增:calculateDynamicDCA()的快取包裝——同一天內同一支ticker只算一次,
// 直接複用renderWatchlist()跟acctFetchOneHolding()共用同一份快取,budget異動時只重算baseAmount。
async function calculateDynamicDCACached(ticker, rsi, ddPct, rsiHistory, vixData, budget, maxDrawdown, currentDeviation, ma200wDeviationHistory, dividendYield, instrumentType, forceRefresh) {
  const today = getToday();
  const cached = wlScoreCache[ticker];
  if (!forceRefresh && cached && cached.date === today) {
    const d = cached.data;
    const baseAmount = d.triggered ? Math.round(budget * d.baseMultiplier / 10) * 10 : budget;
    return { ...d, budget, baseAmount };
  }
  const result = await calculateDynamicDCA(ticker, rsi, ddPct, rsiHistory, vixData, budget, maxDrawdown, currentDeviation, ma200wDeviationHistory, dividendYield, instrumentType);
  wlScoreCache[ticker] = { date: today, data: result };
  return result;
}

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function canForceUpdate() {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  let log = [];
  try { log = JSON.parse(localStorage.getItem(WL_FORCE_KEY) || '[]'); } catch(e) {}
  // Keep only timestamps within last hour
  log = log.filter(t => now - t < hour);
  if(log.length >= WL_MAX_FORCE) return false;
  log.push(now);
  try { localStorage.setItem(WL_FORCE_KEY, JSON.stringify(log)); } catch(e) {}
  return true;
}

// round:抓資料完全沒有逾時機制,萬一某一支的網路請求卡住不回應(不是失敗,是永遠
// 掛著),會讓整個依序迴圈卡死在那裡,後面的資產全部不會繼續處理。加一個逾時保護,
// 超過時間就當作這支失敗,讓迴圈往下一支繼續,不要讓整批都被一支卡住的資產拖垮。
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function fetchWLData(ticker, forceRefresh) {
  const today = getToday();
  const cached = wlCache[ticker];
  if(!forceRefresh && cached && cached.date === today) return cached.data;
  const [data, vix] = await withTimeout(Promise.all([fetchData(ticker), fetchVIX()]), 12000);
  wlCache[ticker] = { date: today, data: { data, vix } };
  return { data, vix };
}

function handleRefreshWL() {
  const zh = currentLang === 'zh';
  if(!canForceUpdate()) {
    // round21修正:原本的btnRefreshWL按鈕已經被滑動carousel裡的按鈕取代,
    // 這裡改成用alert提示節流訊息,不再去操作某個特定按鈕的DOM(避免找不到元素報錯)。
    alert(zh ? '⏳ 請稍後再更新' : '⏳ Please wait before refreshing');
    return;
  }
  renderWatchlist(true);
}

// PA_COLORS defined below in paRenderAllocation section
let paHoldings = [];        // [{ticker, score, mult, badge, marketState, triggered, vol, rsiPct, drawdown, vix, blackSwan, fetchFailed}]
let paManualOverride = null; // {ticker, amount}
let paBaselineSource = 'current'; // 'current' | 'suggested'
let paChosenMap = {};
let paSuggestedMap = {};
let paCurrentMap = {};
// Which tile is driving the result below — 'budget' (default, raw
// recurring budget) or 'ai' (full AI Strategy plan). The two are
// independent and never sync into each other — this is purely for
// comparing scenarios.
let paViewMode = 'budget';
let paOriginalBudget = 0;
let paLastAlloc = {};

// ── round:自選清單卡片展開/收合邏輯(單一展開,展開新的自動收合舊的) ──
let paExpandedTicker = null;

// ── round:renderWatchlist()多輪同時執行防呆——切換分頁進出自選清單頁時,
// 可能觸發renderWatchlist()被連續呼叫多次,舊的一輪(依序抓資料迴圈)還沒跑完,
// 新的一輪又開始搶著畫面,兩邊互相干擾會導致畫面卡在只跑完第一張。
// 用一個遞增版本號,讓「過期」的那一輪自己偵測到、提早結束,不繼續往下跑。
let renderWatchlistRunId = 0;

function paToggleExpand(ticker) {
  const area = $(`pa-expand-${ticker}`);
  const hint = $(`pa-hint-${ticker}`);
  if (!area) return;

  const willOpen = paExpandedTicker !== ticker;

  // 先收合目前展開的那一張(如果有,且不是同一張)
  if (paExpandedTicker && paExpandedTicker !== ticker) {
    const prevArea = $(`pa-expand-${paExpandedTicker}`);
    const prevHint = $(`pa-hint-${paExpandedTicker}`);
    if (prevArea) prevArea.classList.remove('open');
    if (prevHint) prevHint.textContent = prevHint.dataset.closedText || prevHint.textContent;
  }

  area.classList.toggle('open', willOpen);
  const zh = currentLang === 'zh';
  if (hint) hint.textContent = willOpen
    ? (zh ? '👆 點卡片收合 ▴' : '👆 Tap to collapse ▴')
    : (zh ? '👆 點卡片查看完整報表 ▾' : '👆 Tap to view full report ▾');

  paExpandedTicker = willOpen ? ticker : null;

  if (willOpen) {
    renderExpandedReport(ticker, `pa-expand-inner-${ticker}`);
  }
}

async function renderWatchlist(forceRefresh) {
  const myRunId = ++renderWatchlistRunId;
  const list = $('wlList');
  const zh = currentLang === 'zh';
  list.innerHTML = '';
  if (watchlist.length === 0) {
    list.innerHTML = `<div class="wl-empty">${zh ? '自選清單為空。計算後點「加入自選清單」。' : 'No items saved. Calculate a stock and tap Save to Watchlist.'}</div>`;
    $('paBudgetCard').style.display = 'none';
    $('paDonutCard').style.display = 'none';
    $('paPillCard').style.display = 'none';
    // round33修正:空清單時paRenderAllocation()根本不會跑(它開頭就return),carousel從來沒被
    // 渲染過,三張圓餅圖中心會永遠停在K線loading動畫——這裡要主動渲染一次,把loader換成0/空狀態。
    paHoldings = [];
    if (typeof renderPortfolioCarousel === 'function') renderPortfolioCarousel();
    return;
  }
  $('paBudgetCard').style.display = 'grid';
  $('paDonutCard').style.display = 'grid';

  // round:自選清單卡片點擊行為改版——原本點卡片(整張,排除滑桿)會導向AI策略分頁重算,
  // 現在改成展開/收合這支資產的完整歷史報表(expand-report.js)。舊的重算行為不保留
  // (Henry確認過:分數等資訊卡片上已經有了,重算頁面沒有增量價值)。
  // 一次只能展開一張——展開新的會自動收合上一張,理由:①畫面可預期不會無限拉長
  // ②historical-score.js運算量不小,避免使用者一次觸發多個重的API請求。
  for (const item of watchlist) {
    const card = document.createElement('div');
    card.className = 'pa-card';
    card.id = `pa-card-${item.ticker}`;
    card.onclick = (e) => {
      if (e.target.closest('.pa-slider, .pa-slider-step, .wl-remove')) return;
      paToggleExpand(item.ticker);
    };
    card.innerHTML = `
      <div class="pa-card-top">
        <div class="wl-logo" id="pa-logo-${item.ticker}" style="width:40px;height:40px;"></div>
        <div class="wl-info">
          <div class="wl-ticker-row">
            <span class="wl-ticker" style="font-size:16px;">${item.ticker}</span>
            <span class="wl-badge hold" id="pa-badge-${item.ticker}" style="opacity:.4;">…</span>
          </div>
          <div class="pa-price" id="pa-price-${item.ticker}"></div>
        </div>
        <div class="pa-score-chip">
          <div class="pa-score-num low" id="pa-score-num-${item.ticker}">—</div>
          <div class="pa-score-lbl">DCA Score</div>
        </div>
      </div>
      <div class="wl-spark" id="pa-spark-${item.ticker}"></div>
      <div class="pa-alloc-row">
        <span class="pa-alloc-amt" id="pa-amt-${item.ticker}">$0</span>
        <span class="pa-alloc-pct" id="pa-pct-${item.ticker}">0%</span>
      </div>
      <div class="pa-slider-row">
        <button type="button" class="pa-slider-step" aria-label="-" onclick="event.stopPropagation();paSliderStep('${item.ticker}',-1)">−</button>
        <input class="pa-slider" id="pa-slider-${item.ticker}" type="range" min="0" max="100" step="0.1" value="0"
          oninput="paOnSliderInput('${item.ticker}', this.value)" onchange="paOnSliderChange('${item.ticker}', this.value)">
        <button type="button" class="pa-slider-step" aria-label="+" onclick="event.stopPropagation();paSliderStep('${item.ticker}',1)">＋</button>
      </div>
      <div class="er-expand-hint" id="pa-hint-${item.ticker}">👆 點卡片查看完整報表 ▾</div>
      <div class="pa-expand-area" id="pa-expand-${item.ticker}">
        <div class="pa-expand-inner" id="pa-expand-inner-${item.ticker}"></div>
      </div>`;
    list.appendChild(card);
    $(`pa-logo-${item.ticker}`).appendChild(createLogoImg(item.ticker, 38));
  }

  // Sequential fetch with 200ms gap
  paHoldings = [];
  for (const item of watchlist) {
    // 每次迭代開頭先檢查:如果在這期間又有新的一輪renderWatchlist()被觸發,
    // 代表這一輪已經過期,直接停手,把畫面讓給新的那一輪,不要繼續搶著畫。
    if (myRunId !== renderWatchlistRunId) return;
    // round:暫時性除錯用——一開始處理這支資產就先標記「處理中」,方便分辨
    // 「這支根本還沒輪到」跟「已經開始處理、卡在等待中」兩種狀況。之後確認問題後拿掉。
    const debugScoreEl = $(`pa-score-num-${item.ticker}`);
    if (debugScoreEl) debugScoreEl.textContent = '…';
    let h = { ticker: item.ticker, score: 0, mult: 1.0, badge: 'normal', marketState: 'Normal', triggered: false, vol: 0.3,
      rsiPct: null, drawdown: null, vix: null, blackSwan: false, fetchFailed: false, currentDeviation: null };
    try {
      const { data, vix } = await fetchWLData(item.ticker, forceRefresh);
      const result = await calculateDynamicDCACached(item.ticker, data.rsi, data.drawdown, data.rsiHistory, vix, item.budget, data.maxDrawdown, data.currentDeviation, data.ma200wDeviationHistory, data.dividendYield, data.instrumentType, forceRefresh);
      h.score = result.score || 0;
      h.mult = result.triggered ? result.baseMultiplier : 1.0;
      h.triggered = result.triggered;
      h.marketState = result.marketState;
      h.vol = data.history && data.history.length >= 20 ? calcAnnualVol(data.history) : 0.3;
      // round14新增:補存陪審團組合模式要用的原始指標——RSI用百分位(0-100,跟單一資產navigateToJury格式一致)、
      // drawdown用原始%、vix用result算好的值(跟fetchWLData拿到的是同一份market-wide VIX)、blackSwan沿用既有isBlackSwan()判定結果
      h.rsiPct = Math.round((result.prsi || 0) * 100);
      h.drawdown = data.drawdown;
      h.vix = result.vix;
      h.blackSwan = !!result.blackSwan;
      // round23新增:低於長期均線多少(負值=在均線之下),給calcBaselineWeights()的趨勢濾網用——
      // 抓資料的時候本來就已經算出這個數字(算分數要用),這裡只是多存一份,不是多打API。
      h.currentDeviation = data.currentDeviation;

      // 抓資料是非同步的,await期間也可能被新一輪取代——寫進DOM前再確認一次沒有過期。
      if (myRunId !== renderWatchlistRunId) return;

      renderWLSparkline(item.ticker, data.history, `pa-spark-${item.ticker}`);
      const scoreNumEl = $(`pa-score-num-${item.ticker}`);
      if (scoreNumEl) { scoreNumEl.textContent = h.score.toFixed(0); scoreNumEl.className = `pa-score-num ${h.score >= 60 ? 'high' : 'low'}`; }
      const priceEl = $(`pa-price-${item.ticker}`);
      if (priceEl && data.price) priceEl.textContent = `${parseFloat(data.price).toFixed(2)} ${data.currency||'USD'}`;
      const badgeEl = $(`pa-badge-${item.ticker}`);
      if (badgeEl) {
        if (h.triggered) { badgeEl.textContent = zh ? '加碼時機' : 'BUY SIGNAL'; badgeEl.className = 'wl-badge buy'; }
        else if (h.marketState === 'Elevated' || h.marketState === 'High') { badgeEl.textContent = zh ? '高位觀望' : 'HOLD'; badgeEl.className = 'wl-badge hold'; }
        else {
          const stateZh = { 'Normal': '正常定投', 'Dip': '回調中', 'Bear Market': '熊市', 'Elevated': '高位觀望', 'Black Swan': '🦢 黑天鵝' };
          badgeEl.textContent = zh ? (stateZh[h.marketState] || h.marketState) : h.marketState.toUpperCase();
          badgeEl.className = 'wl-badge normal';
        }
        badgeEl.style.opacity = '1';
      }
    } catch (e) {
      // round14新增:抓取/計算失敗時明確標記fetchFailed=true,而不是讓score停在預設值0
      // ——navigateToJuryPortfolio()看到這個旗標時會把該持股整支跳過,不計入加權平均,
      // 避免「抓資料失敗」被誤判成「Score 0分、極度超買」而不合理地拉低組合分數。
      h.fetchFailed = true;
      const amtEl = $(`pa-amt-${item.ticker}`);
      // round:暫時性除錯用——把真實的錯誤訊息也印出來,方便定位問題,之後確認原因後要拿掉。
      const errMsg = (e && e.message) ? e.message : (e && e.name) ? e.name : String(e);
      if (amtEl) { amtEl.textContent = (zh ? '載入失敗: ' : 'Failed: ') + errMsg; amtEl.style.color = 'var(--ink3)'; amtEl.style.fontSize = '11px'; }
      console.error(`[watchlist ${item.ticker}] fetch/calc error:`, e);
    }
    paHoldings.push(h);
    // round39新增:原本carousel圓餅圖要等整個序列迴圈跑完才畫一次(3支資產=最長要等10秒+才有畫面)。
    // 改成每抓完一支就立刻重畫——renderPortfolioCarousel()是純讀取paHoldings渲染,不寫localStorage、
    // 不會誤觸paPillCard/setup sheet那段有副作用的基準%比對邏輯,可以放心在迴圈中重複呼叫。
    if (typeof renderPortfolioCarousel === 'function') renderPortfolioCarousel();
    await new Promise(r => setTimeout(r, 200));
  }
  if (myRunId !== renderWatchlistRunId) return; // 過期就不要再動baseline這些全域狀態

  // ── Compute baseline %: detect added/removed tickers vs stored baseline ──
  const tickers = watchlist.map(w => w.ticker);
  const stored = paGetBaselinePct();
  const storedKeys = Object.keys(stored).sort().join(',');
  const tickerKeys = [...tickers].sort().join(',');
  paSuggestedMap = calcBaselineWeights(paHoldings.map(h => ({ ticker: h.ticker, vol: h.vol, dev: h.currentDeviation })), getAgeBand());
  paCurrentMap = paMergedCurrentBaseline(tickers);

  if (Object.keys(stored).length === 0) {
    // First time — open setup sheet to collect budget + baseline %
    paSaveBaselinePct(paSuggestedMap);
    paCurrentMap = { ...paSuggestedMap };
    $('paPillCard').style.display = 'none';
    paBaselineSource = 'current';
  } else if (storedKeys !== tickerKeys) {
    $('paPillCard').style.display = 'block';
  } else {
    $('paPillCard').style.display = 'none';
    paBaselineSource = 'current';
  }
  paChosenMap = paBaselineSource === 'suggested' ? paSuggestedMap : paCurrentMap;

  // ── Budget ──
  const budgetStore = paGetBudget();
  paOriginalBudget = (budgetStore.original && budgetStore.original > 0) ? budgetStore.original : PA_INTERNAL_BUDGET;
  if (!budgetStore.original) paSaveBudget({ ...budgetStore, original: paOriginalBudget });

  paRenderAllocation(null);

  // First-time setup sheet: only trigger if user hasn't completed setup yet.
  // Guard with a runtime flag so repeated renderWatchlist calls (e.g. after saveToWatchlist) don't re-open the sheet.
  if (!localStorage.getItem('pi_setup_done') && !window._paSetupSheetShown) {
    window._paSetupSheetShown = true;
    setTimeout(() => openBaselineSheet(), 200);
  }

  // Re-sort cards by score (highest first)
  const cards = [...list.querySelectorAll('.pa-card')];
  cards.sort((a, b) => {
    const ta = paHoldings.findIndex(h => a.id === `pa-card-${h.ticker}`);
    const tb = paHoldings.findIndex(h => b.id === `pa-card-${h.ticker}`);
    return (paHoldings[tb]?.score || 0) - (paHoldings[ta]?.score || 0);
  });
  cards.forEach(c => list.appendChild(c));
}


function removeFromWatchlist(ticker) {
  if (typeof requireSilverBean === 'function' && !requireSilverBean()) return;
  watchlist = watchlist.filter(w => w.ticker !== ticker);
  try { localStorage.setItem('pi_watchlist', JSON.stringify(watchlist)); } catch(e) {}
  pushScheduleSync();
  // round50新增:GA4事件——成功從自選清單移除
  if (typeof gtag !== 'undefined') {
    gtag('event', 'remove_from_watchlist', { event_category: 'watchlist', ticker: ticker, watchlist_size_after: watchlist.length });
  }
  renderWatchlist();
}
