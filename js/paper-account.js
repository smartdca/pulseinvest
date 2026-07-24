// ============================================================
// paper-account.js — 我的虛擬帳戶(acct*)模組
// 從 index.html 拆分而出(2026-07-24 瘦身②),邏輯逐行原樣搬移,未做任何修改。
//
// 依賴(定義於別處,皆為執行時才呼叫,無載入順序問題):
//   index.html  — $, currentLang, T, PROXY, PA_COLORS, miniArcGauge,
//                 fetchData, calculateDynamicDCA, getAgeBand 等
//   watchlist.js— paHoldings, paOriginalBudget, calcBaselineWeights
//   ui-widgets.js — pickArcGauge
// 被誰使用:
//   portfolio-carousel.js — acctLoad / acctEnsureInit / acctHoldingsData /
//                           acctFetchHoldingsData / acctRenderCardsInto /
//                           renderAccountCarouselSlide
//   push-notify.js        — acctLoad(pushCollectTickers 內)
//
// ⚠️ 本檔必須維持在 index.html 原本的位置載入,且排在 push-notify.js 之前。
// ============================================================

// 帳戶那張slide獨立刷新(因為它的資料來源是acctState/acctHoldingsData,不是paHoldings,
// 抓資料時機也不一樣——帳戶還沒開過(acctState為null)的時候先顯示空狀態,不硬猜資料)。
// round24新增:帳戶識別標籤用代碼前幾碼(去掉PDCA-前綴,取第一段),不是目標描述——
// 之後接實體券商帳戶,同一個function只要多帶一個type參數,就能印出「實體－xxxx」,不用另外寫。
function acctCodeLabel(code, type) {
  type = type || (currentLang === 'zh' ? '虛擬' : 'Virtual');
  if (!code) return type;
  const seg = code.replace(/^PDCA-/, '').trim().split(/\s+/)[0] || '';
  return `${type}－${seg}`;
}

function renderAccountCarouselSlide() {
  const zh = currentLang === 'zh';
  const holdings = (acctState && acctState.holdings) ? acctState.holdings : [];
  const titleEl = $('pcarAcctTitle');
  if (titleEl) titleEl.textContent = acctState ? acctCodeLabel(acctState.code) : (zh?'我的虛擬帳戶':'My Account');
  const budgetEl = $('pcarBudgetAcct');
  if (budgetEl) budgetEl.textContent = '$' + Math.round(acctState ? acctState.budget : 0).toLocaleString();

  if (!holdings.length) {
    pcarDrawMiniDonut('pcarDonutAcct', []);
    $('pcarAcctCount').textContent = '0';
    $('pcarLegendAcct').innerHTML = '';
    return;
  }
  const total3 = holdings.reduce((s,h) => s + h.pct, 0) || 1;
  const entries3 = holdings.map((h,i) => ({ color: PA_COLORS[i%PA_COLORS.length], pct: h.pct/total3*100 }));
  pcarDrawMiniDonut('pcarDonutAcct', entries3);
  $('pcarAcctCount').textContent = holdings.length;
  $('pcarLegendAcct').innerHTML = holdings.map((h,i) => `
    <div class="pcar-legend-row"><span class="pcar-legend-dot" style="background:${PA_COLORS[i%PA_COLORS.length]}"></span><span class="pcar-legend-t">${h.ticker}</span><span class="pcar-legend-p">${(h.pct/total3*100).toFixed(0)}%</span></div>`).join('');
}

// ══════════════════════════════════════════════════════════════
// 我的虛擬帳戶(acctPanel) — round20新增
//
// 設計原則:這個面板不重新抓資料、不重新算分數。分數/價格/走勢圖/組合配置
// 全部直接讀用renderWatchlist()已經算好的paHoldings/paLastAlloc,這裡只是
// 「用另一種版面呈現同一份資料」,呼叫openAccountPanel()的當下會主動觸發
// renderWatchlist()一次,確保資料是新的,但不會另外起一條抓資料管線。
//
// 已知限制(暫時性,等後端做出來要回頭處理):
// 1. 沒有真正的帳戶後端——身份代碼/投入節奏/交易紀錄現在存在這支裝置的
//    localStorage,換裝置或清瀏覽器資料會遺失,之後要接上真後端才能跨裝置同步。
// 2. 大師會診只能顯示同意度數字,顯示不出完整的大師評語文字——因為評語文字
//    在jury.html裡的MASTERS資料庫(88位大師、快3000行),不值得為了這裡的
//    小卡片把整個資料庫複製一份進index.html,所以「查看完整意見」一律導去
//    jury.html本人,不在這個面板內展開。
// 3. 「確認執行本期投入」按鈕目前是no-op(用alert代替)——沒有後端可以真的
//    記錄這筆執行,先把UI流程做完整,接上後端時只要換掉acctConfirmExecute()
//    這個函式的內容,其他都不用動。
// ══════════════════════════════════════════════════════════════

const ACCT_LS_KEY = 'dcacafe_paper_account';
const WEEKDAY_ZH = {1:'一',2:'二',3:'三',4:'四',5:'五'};
const WEEKDAY_EN = {1:'Mon',2:'Tue',3:'Wed',4:'Thu',5:'Fri'};

function acctLoad() {
  try {
    const raw = localStorage.getItem(ACCT_LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return null;
}
function acctSave(state) {
  try { localStorage.setItem(ACCT_LS_KEY, JSON.stringify(state)); } catch(e) {}
}
function acctGenerateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 排除容易看錯的0/O/1/I
  let s = 'PDCA-';
  for (let i = 0; i < 12; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
    if (i === 3 || i === 7) s += ' ';
  }
  return s;
}

// 目前沒有真正的「開戶」流程會寫入後端,這裡先用預設值起一個本機帳戶。
// 之後confirm.html的「確認建立虛擬帳戶」真的接上後端時,這裡要改成優先讀
// 後端回來的帳戶資料,本機localStorage降級為快取,不是唯一真相來源。
function acctEnsureInit() {
  let state = acctLoad();
  if (!state) {
    // round21修正:帳戶要有「自己的」持股清單,開戶當下凍結,之後不會因為自選清單
    // 加減資產就跟著變動(這是Henry抓到的一個重要問題——自選清單本來就該是自由試算場)。
    // 目前沒有真正的開戶流程,先用「當下自選清單的內容」當作模擬的開戶快照;
    // 之後confirm.html真的接上後端時,這裡要改成讀後端真正的開戶資料。
    const totalAlloc = paHoldings.reduce((s,h) => s + (paLastAlloc[h.ticker] || 0), 0) || 1;
    const snapshotHoldings = paHoldings.length
      ? paHoldings.map(h => ({ ticker: h.ticker, pct: Math.round((paLastAlloc[h.ticker]||0) / totalAlloc * 1000) / 10 }))
      : [];
    state = {
      code: acctGenerateCode(),
      createdAt: new Date().toISOString().slice(0,10),
      budget: paOriginalBudget > 0 ? paOriginalBudget : 20000,
      goalLabel: '長期資產累積',
      years: 10,
      strategy: 'dca', // 'dca' | 'all_in' — 開戶當下選的,不是每個帳戶都必然是DCA
      freqWeeks: 2,
      weekday: 3, // 1=一...5=五(JS的Date.getDay()剛好0=日,所以1-5直接對應一到五)
      lastFreqChange: null,
      holdings: snapshotHoldings, // [{ticker, pct}] — 帳戶自己的持股,不是自選清單的參照
      history: [] // 之後接後端才會有真正的執行紀錄,現在永遠是空的
    };
    acctSave(state);
    pushScheduleSync();
  }
  return state;
}

let acctState = null;
let acctHoldingsData = {}; // ticker -> 這個帳戶自己抓回來的分數/價格資料(跟paHoldings同樣的形狀,但是獨立一份)
let acctExecBase = 0, acctExecCap = 0;
let acctPendingWeekday = null;

// 跟renderWatchlist()裡組裝paHoldings用的是同一套底層引擎(fetchWLData/calculateDynamicDCA),
// 只是這裡不觸碰任何自選清單的DOM/全域變數——帳戶的持股清單完全獨立於paHoldings。
// 同一個ticker如果剛好也在自選清單裡,fetchWLData本身有同一天快取,不會重複打API。
async function acctFetchOneHolding(ticker, budget, forceRefresh) {
  let h = { ticker, score: 0, mult: 1.0, badge: 'normal', marketState: 'Normal', triggered: false, vol: 0.3,
    rsiPct: null, drawdown: null, vix: null, blackSwan: false, fetchFailed: false, price: null, currency: 'USD', history: [], currentDeviation: null };
  try {
    const { data, vix } = await fetchWLData(ticker, forceRefresh);
    const result = await calculateDynamicDCACached(ticker, data.rsi, data.drawdown, data.rsiHistory, vix, budget, data.maxDrawdown, data.currentDeviation, data.ma200wDeviationHistory, data.dividendYield, data.instrumentType, forceRefresh);
    h.score = result.score || 0;
    h.mult = result.triggered ? result.baseMultiplier : 1.0;
    h.triggered = result.triggered;
    h.marketState = result.marketState;
    h.vol = data.history && data.history.length >= 20 ? calcAnnualVol(data.history) : 0.3;
    h.rsiPct = Math.round((result.prsi || 0) * 100);
    h.drawdown = data.drawdown;
    h.vix = result.vix;
    h.blackSwan = !!result.blackSwan;
    h.price = data.price;
    h.currency = data.currency;
    h.history = data.history;
    h.currentDeviation = data.currentDeviation;
  } catch(e) {
    h.fetchFailed = true;
  }
  return h;
}

async function acctFetchHoldingsData() {
  acctHoldingsData = {};
  if (!acctState || !acctState.holdings || !acctState.holdings.length) return;
  for (const hold of acctState.holdings) {
    acctHoldingsData[hold.ticker] = await acctFetchOneHolding(hold.ticker, acctState.budget, false);
    await new Promise(r => setTimeout(r, 150));
  }
}

// 把acctState.holdings + acctHoldingsData包成跟paHoldings一樣的形狀,
// 讓computePortfolioWeighted()/navigateToJuryPortfolio()可以直接重複使用,不用另外寫一份公式。
function acctSource() {
  const holdings = acctState.holdings.map(hd => ({
    ...(acctHoldingsData[hd.ticker] || { ticker: hd.ticker, fetchFailed: true }),
    ticker: hd.ticker
  }));
  const pctOf = {};
  acctState.holdings.forEach(hd => { pctOf[hd.ticker] = hd.pct; });
  return {
    holdings,
    allocOf: (ticker) => acctState.budget * ((pctOf[ticker] || 0) / 100),
    budget: acctState.budget,
    // round28新增:健診表單要自動帶入的欄位,不用使用者重填(目標類型/年限鎖定跟著帳戶走)
    goalType: acctState.goalType,
    years: acctState.years,
    strategy: acctState.strategy,
    income: acctState.income,
    riskTolerance: acctState.riskTolerance,
    timeHorizon: acctState.timeHorizon
  };
}

function openAccountPanel() {
  // round46新增:虛擬帳戶是Silver Bean會員專屬功能
  if (typeof requireSilverBean === 'function' && !requireSilverBean()) return;
  // round29新增:帳戶面板不是switchTab()管的四個分頁之一,要另外記,不然重新整理會漏記
  try { localStorage.setItem('dcacafe_last_tab', 'account'); } catch(e) {}
  ['aPanel','wlPanel','btPanel','learnPanel'].forEach(id => {
    const el = $(id);
    if (el) { el.style.display = 'none'; el.classList.remove('show'); }
  });
  ['tabA','tabW','tabB','tabL'].forEach(id => $(id) && $(id).classList.remove('active'));
  const panel = $('acctPanel');
  panel.style.display = 'block';
  panel.classList.add('show');
  window.scrollTo({top:0, behavior:'smooth'});

  acctState = acctEnsureInit();
  renderAccountStaticParts();
  renderAccountCarouselSlide(); // 先用已存的pct畫一次,不用等分數抓完

  // 關鍵的一步:面板本身只是display切換,不會自動觸發抓資料——
  // 一定要主動呼叫acctFetchHoldingsData(),不然畫面是空的。這裡抓的是
  // 帳戶自己的持股清單,不是自選清單的paHoldings。
  acctFetchHoldingsData().then(() => {
    renderAccountPanel();
    renderAccountCarouselSlide(); // 分數抓完後,carousel第三張的分數也要跟著更新
  });
}

function closeAccountPanel() {
  switchTab('watchlist', false);
}

// round25新增:刪除/關閉帳戶——目前沒有後端,「刪除」就是把本機localStorage清掉,
// 帳戶(含開戶當下凍結的持股清單)整個消失,回到跟從沒開過帳戶一樣的狀態。
// 之後接上真後端,這裡要多一支API呼叫去真的刪掉伺服器端的紀錄,不能只清本機。
function acctDeleteConfirm() {
  const zh = currentLang === 'zh';
  const msg = zh
    ? '確定要刪除這個虛擬帳戶嗎？帳戶代碼、投入設定都會清除，無法復原。'
    : 'Delete this virtual account? Your account code and settings will be permanently removed.';
  if (!confirm(msg)) return;
  try { localStorage.removeItem(ACCT_LS_KEY); } catch(e) {}
  acctState = null;
  acctHoldingsData = {};
  closeAccountPanel();
  if (typeof pcarUpdateAcctVisibility === 'function') pcarUpdateAcctVisibility();
}

function renderAccountPanel() {
  const zh = currentLang === 'zh';
  if (!acctState.holdings.length) {
    $('acctDonutCard').style.display = 'none';
    $('acctAssetList').innerHTML = `<div class="acct-empty"><div class="acct-empty-ic">◎</div><div class="acct-empty-title">${zh?'這個帳戶還沒有資產':'No holdings in this account yet'}</div><div class="acct-empty-body">${zh?'虛擬帳戶目前沒有可以顯示的持股。':'Nothing to show for this account yet.'}</div></div>`;
    renderAccountJuryCard(null);
    return;
  }

  // round27:組合綜合分數卡併進大師會診卡,不再獨立顯示——用computePortfolioWeighted()配上
  // 帳戶自己的持股來源算,不是另外發明的公式,算完直接傳給renderAccountJuryCard()一起呈現。
  const weighted = computePortfolioWeighted(acctSource());

  drawAcctDonut();
  acctRenderCardsInto('acctAssetList');
  renderAccountExecCard(weighted);
  renderAccountJuryCard(weighted);
  renderAccountPerfCard(); // 這裡的acctHoldingsData才是抓完的真實價格,重畫一次確保市值準確
}

// round22新增:資產卡片組裝邏輯抽成獨立函式,接受任意目標容器id——
// acctPanel本身的#acctAssetList,還有自選清單頁carousel的#pcarAcctDetail,共用同一份,不重複寫。
function acctRenderCardsInto(containerId) {
  const zh = currentLang === 'zh';
  const container = $(containerId);
  if (!container) return;
  if (!acctState || !acctState.holdings.length) {
    container.innerHTML = `<div class="acct-empty"><div class="acct-empty-ic">◎</div><div class="acct-empty-title">${zh?'這個帳戶還沒有資產':'No holdings in this account yet'}</div></div>`;
    return;
  }
  const totalPct = acctState.holdings.reduce((s,h) => s + h.pct, 0) || 100;
  const sorted = [...acctState.holdings].sort((a,b) => {
    const sa = (acctHoldingsData[a.ticker]||{}).score || 0;
    const sb = (acctHoldingsData[b.ticker]||{}).score || 0;
    return sb - sa;
  });
  container.innerHTML = sorted.map((hd) => {
    const origIdx = acctState.holdings.indexOf(hd);
    const data = acctHoldingsData[hd.ticker] || {};
    const color = PA_COLORS[origIdx % PA_COLORS.length];
    const pct = (hd.pct / totalPct * 100).toFixed(0);
    const score = data.score || 0;
    const high = score >= 60;
    const amt = Math.round(acctState.budget * (hd.pct/100));
    const badgeClass = data.triggered ? 'buy' : ((data.marketState==='Elevated'||data.marketState==='High') ? 'hold' : 'normal');
    const badgeText = data.fetchFailed ? (zh?'讀取失敗':'Failed')
      : data.triggered ? (zh?'加碼時機':'BUY SIGNAL')
      : (data.marketState==='Elevated'||data.marketState==='High') ? (zh?'高位觀望':'HOLD')
      : (zh ? ({'Normal':'正常定投','Dip':'回調中','Bear Market':'熊市','Elevated':'高位觀望','Black Swan':'🦢 黑天鵝'}[data.marketState]||data.marketState||'') : (data.marketState||''));
    return `
    <div class="wl-card" style="border-left:4px solid ${color};padding-left:11px;">
      <div class="wl-score-col">
        <div class="acct-score-ring ${high?'high':'low'}"><div class="num">${score.toFixed(0)}</div></div>
        <div class="wl-score-lbl">DCA SCORE</div>
        <span class="wl-badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="wl-logo" id="${containerId}-logo-${hd.ticker}"></div>
      <div class="wl-info">
        <div class="wl-ticker-row"><span class="wl-ticker">${hd.ticker}</span><span style="margin-left:6px;color:var(--ink3);font-size:11px;">${zh?'配置':''} ${pct}%</span></div>
        <div class="wl-spark" id="${containerId}-spark-${hd.ticker}"></div>
        <div class="wl-amount-row"><div class="wl-amount">$${amt.toLocaleString()}</div><div class="wl-mult ${data.mult>1?'up':''}">${data.mult ? data.mult.toFixed(2)+'×' : ''}</div></div>
      </div>
    </div>`;
  }).join('');

  // logo/走勢圖沿用既有函式補上(跟自選清單同一套,不是重畫)
  sorted.forEach(hd => {
    const logoDiv = $(`${containerId}-logo-${hd.ticker}`);
    if (logoDiv && typeof createLogoImg === 'function') logoDiv.appendChild(createLogoImg(hd.ticker, 44));
    const data = acctHoldingsData[hd.ticker];
    if (data && data.history && typeof renderWLSparkline === 'function') renderWLSparkline(hd.ticker, data.history, `${containerId}-spark-${hd.ticker}`);
  });
}

// 跟paDonut/carousel裡的圓餅圖同一套畫法,只是資料來源換成acctState.holdings,不是paLastAlloc。
function drawAcctDonut() {
  const canvas = $('acctDonut');
  const wrap = $('acctDonutWrap');
  if (!canvas || !wrap) return;
  $('acctDonutCard').style.display = 'grid';
  const dpr = window.devicePixelRatio || 2;
  const cssSize = 118;
  canvas.style.width = cssSize + 'px';
  canvas.style.height = cssSize + 'px';
  wrap.style.width = cssSize + 'px';
  wrap.style.height = cssSize + 'px';
  canvas.width = cssSize * dpr;
  canvas.height = cssSize * dpr;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr, dpr);
  const cx = cssSize/2, cy = cssSize/2;
  const R = cssSize * 0.5, r = cssSize * 0.5 * 0.87, gap = 0.02;
  const totalPct = acctState.holdings.reduce((s,h) => s + h.pct, 0) || 1;
  let startAngle = -Math.PI/2;
  acctState.holdings.forEach((hd, i) => {
    const pct = hd.pct / totalPct;
    const sweep = pct * Math.PI*2 - gap;
    if (sweep <= 0) return;
    ctx.beginPath();
    ctx.arc(cx, cy, R, startAngle, startAngle+sweep);
    ctx.arc(cx, cy, r, startAngle+sweep, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = PA_COLORS[i % PA_COLORS.length];
    ctx.fill();
    startAngle += sweep + gap;
  });
  $('acctDonutCount').textContent = acctState.holdings.length;
  $('acctLegend').innerHTML = acctState.holdings.map((hd,i) => `
    <div class="pa-legend-row">
      <span class="pa-legend-dot" style="background:${PA_COLORS[i%PA_COLORS.length]}"></span>
      <span class="pa-legend-ticker">${hd.ticker}</span>
      <span class="pa-legend-pct">${(hd.pct/totalPct*100).toFixed(0)}%</span>
    </div>`).join('');
}

// ── 大師會診卡:讀上一次健診結果(sessionStorage,同一個瀏覽分頁內才有),不即時重算。
//    只能顯示同意度數字,顯示不出完整評語文字(見檔案開頭的已知限制說明2)。 ──
// round27:組合綜合分數卡併進這張——用miniArcGauge()儀表(跟jury.html同一套視覺,不是圓餅圖)
// 顯示目前組合分數,文案改成「要不要聽大師怎麼說再執行這期定投」,按鈕永遠都在。
function renderAccountJuryCard(weighted) {
  const zh = currentLang === 'zh';
  const card = $('acctJuryCard');
  if (!card) return;

  const score = weighted ? Math.max(0, Math.min(100, weighted.weightedScore)) : null;
  const gaugeHtml = score != null
    ? miniArcGauge(score/100, ['red','amber','green','green'], 108, false)
    : '';

  const scoreLine = score != null
    ? (zh ? `你目前資產組合的分數是 <b>${score.toFixed(0)}</b> 分` : `Your portfolio score right now is <b>${score.toFixed(0)}</b>`)
    : (zh ? '這個帳戶還沒有分數可以顯示' : 'No score yet for this account');
  const promptLine = zh
    ? '先聽聽大師們怎麼說，再完成這一期的定投？'
    : 'Hear what the masters say before completing this period\'s investment?';

  const btnLabel = zh ? '🩺 前往定期健檢' : '🩺 Go to checkup';

  card.innerHTML = `
    <div class="acct-gauge-row">
      <div class="acct-gauge-wrap">${gaugeHtml}</div>
      <div class="acct-gauge-text">
        <div class="acct-gauge-score">${scoreLine}</div>
        <div class="acct-gauge-prompt">${promptLine}</div>
      </div>
    </div>
    <button class="act-btn" onclick="navigateToJuryPortfolio(acctSource())" style="width:100%;margin-top:12px;">${btnLabel}</button>`;
}

// ── 確認本期投入:滑桿上下限沿用paOriginalBudget~weightedMult,跟confirm.html同一套規則 ──
function renderAccountExecCard(weighted) {
  if (!weighted) return;
  const base = acctState.budget; // round21修正:改用帳戶自己的基準預算,不是自選清單的paOriginalBudget
  const cap = Math.max(base, Math.round(base * weighted.weightedMult));
  acctExecBase = base;
  acctExecCap = cap;
  const zh = currentLang === 'zh';
  $('acctBaseLabel').textContent = (zh?'基準 $':'Base $') + Math.round(base).toLocaleString();
  $('acctCapLabel').textContent = (zh?'AI建議上限 $':'AI cap $') + cap.toLocaleString();
  $('acctExecCap').textContent = (zh?'上限 $':'Cap $') + cap.toLocaleString();
  const slider = $('acctExecSlider');
  slider.min = base; slider.max = cap;
  const aiOn = $('acctAiToggle').checked;
  slider.value = aiOn ? cap : base;
  slider.disabled = aiOn;
  $('acctExecAmt').textContent = '$' + Math.round(slider.value).toLocaleString();
  acctSyncExecButton();
}
function acctOnAiToggle() {
  const aiOn = $('acctAiToggle').checked;
  const slider = $('acctExecSlider');
  slider.disabled = aiOn;
  if (aiOn) slider.value = acctExecCap;
  $('acctExecAmt').textContent = '$' + Math.round(slider.value).toLocaleString();
}
function acctOnSliderInput() {
  $('acctExecAmt').textContent = '$' + Math.round($('acctExecSlider').value).toLocaleString();
}
// round32新增:「調整策略」直接開「動態資產配置策略中心」sheet(不用先導去自選清單頁再找入口)——
// 這是一個全螢幕fixed的overlay,不管底下是帳戶面板還是自選清單都能開,關閉後就回到原本那一頁。
// 是否要把改完的結果同步回帳戶,改成sheet裡的「同時套用到虛擬帳戶」勾選項處理(見bpOnConfirm()),
// 不再需要banner/旗標這一整套「先去改、回來才問」的機制。
function acctAdjustStrategy() {
  openBaselineSheet(true);
}

function acctConfirmExecute() {
  if (acctIsLocked()) return; // 防呆:按鈕理論上已經disabled,這裡再擋一次
  const zh = currentLang === 'zh';
  const amount = Math.round($('acctExecSlider').value);

  const msg = zh
    ? `確定要記錄本期投入 $${amount.toLocaleString()} 嗎？`
    : `Confirm this period's investment of $${amount.toLocaleString()}?`;
  if (!confirm(msg)) return;

  // round38:每個持股多存一個「投入當下的價格」快照——之後帳戶績效卡要靠這個
  // 回推「當初買了多少股」,才能拿現在的價格算出目前市值。沒抓到價格(fetchFailed)
  // 的資產,price存null,績效計算那邊會知道要用近似值處理,不會硬算出錯的數字。
  const holdingsSnapshot = acctState.holdings.map(h => ({
    ticker: h.ticker,
    pct: h.pct,
    price: (acctHoldingsData[h.ticker] && !acctHoldingsData[h.ticker].fetchFailed) ? acctHoldingsData[h.ticker].price : null
  }));
  const execDate = new Date().toISOString().slice(0, 10);
  acctState.history.push({
    date: execDate,
    amount: amount,
    holdings: holdingsSnapshot
  });
  acctSave(acctState);

  // 背後留底(fire-and-forget):本機localStorage才是畫面顯示的主要來源,
  // 這支API失敗也不能擋住使用者已經完成的本機記錄流程,不await、不擋畫面更新。
  fetch('https://proxy-three-mu-47.vercel.app/api/sheets?table=paper-account-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: acctState.code,
      date: execDate,
      amount: amount,
      holdings: holdingsSnapshot
    })
  }).catch(() => {}); // 留底失敗只默默忽略,不影響使用者

  acctSyncExecButton();
  renderAccountHistoryCard();
  renderAccountPerfCard();
  renderAccountStaticParts(); // 「下次投入」日期要跟著這筆新紀錄重新計算

  // round38新增:確認完直接捲動到「投資歷史」卡片,不用使用者自己往下找剛記錄的那一筆
  const histTitle = $('t-accthistlbl');
  if (histTitle) histTitle.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── 唯讀基本資訊 + 投入節奏 ──
function renderAccountStaticParts() {
  if (!acctState) return;
  const zh = currentLang === 'zh';
  $('acctIdCode').textContent = acctState.code;
  $('acctBudgetVal').textContent = '$' + Math.round(acctState.budget).toLocaleString() + (zh?' /期':' /period');
  $('acctGoalVal').textContent = acctState.goalLabel + '・' + acctState.years + (zh?'年':'yrs');
  $('acctStrategyVal').textContent = acctState.strategy === 'all_in' ? (zh?'All-in（一次性）':'All-in') : (zh?'定期定投（DCA）':'DCA');
  // round36:「頻率・星期」不再用表格式的「標籤:值」,改成一句生活化的話——
  // 每1週:「固定每個星期二執行定投」;大於1週:「固定在星期二定投,每 3 週執行一次」。
  $('acctRhythmMain').innerHTML = acctRhythmSentence();
  const next = acctNextInvestDate();
  $('acctNextDate').textContent = next.dateStr;
  $('acctNextDays').textContent = next.daysLabel;
  acctSyncExecButton();
  renderAccountHistoryCard();
  renderAccountPerfCard();
}

function acctRhythmSentence() {
  const zh = currentLang === 'zh';
  const w = acctState.weekday, f = acctState.freqWeeks;
  const EN_FULL = {1:'Monday',2:'Tuesday',3:'Wednesday',4:'Thursday',5:'Friday'};
  if (zh) {
    return f === 1
      ? `固定每個<span class="dow">星期${WEEKDAY_ZH[w]}</span>執行定投`
      : `固定在<span class="dow">星期${WEEKDAY_ZH[w]}</span>定投，每 ${f} 週執行一次`;
  }
  return f === 1
    ? `Invests every <span class="dow">${EN_FULL[w]}</span>`
    : `Invests on <span class="dow">${EN_FULL[w]}s</span>, every ${f} weeks`;
}

// round37修正:改用真正的錨點回推——有投入紀錄就用「最後一次真正投入的日期」,
// 沒有的話(還沒投過第一筆)退回用開戶日createdAt當基準點,再用freqWeeks往後推算,
// 不再是只保證星期對、忽略「每N週」的簡化版。
function acctLastInvestDate() {
  if (!acctState.history || !acctState.history.length) return null;
  const last = acctState.history[acctState.history.length - 1];
  const d = new Date(last.date + 'T00:00:00');
  return isNaN(d) ? null : d;
}
function acctNextInvestDate() {
  const zh = currentLang === 'zh';
  const today = new Date();
  today.setHours(0,0,0,0);
  const targetDow = acctState.weekday;
  const freqDays = Math.max(1, acctState.freqWeeks) * 7;

  const anchor = acctLastInvestDate() || new Date((acctState.createdAt || today.toISOString().slice(0,10)) + 'T00:00:00');
  let d = new Date(anchor);
  d.setDate(d.getDate() + freqDays);
  // 頻率/星期若中途被改過,錨點推算出來的日期可能跟目前設定的星期幾對不上——
  // 這時往前找最近一個符合目前星期幾設定的日子,不會晚於推算出的日期。
  while (d.getDay() !== targetDow) d.setDate(d.getDate() - 1);
  // 保底:算出來的日期不能落在今天以前(比如頻率剛被改短),至少是明天起最近一個符合星期幾的日子。
  if (d <= today) {
    d = new Date(today);
    d.setDate(d.getDate() + 1);
    while (d.getDay() !== targetDow) d.setDate(d.getDate() + 1);
  }
  const dateStr = d.toISOString().slice(0,10).replace(/-/g,'/');
  const days = Math.round((d - today) / 86400000);
  return { date: d, dateStr, daysLabel: zh ? `${days}天後` : `in ${days}d` };
}
// 本期是否已投入:完全沒紀錄過 → 一定沒鎖(這就是第一次定投);
// 有紀錄過 → 看「下一次可投入日期」是不是還沒到,還沒到就鎖住。
function acctIsLocked() {
  if (!acctState.history || !acctState.history.length) return false;
  const next = acctNextInvestDate();
  const today = new Date(); today.setHours(0,0,0,0);
  return next.date > today;
}
function acctSyncExecButton() {
  const btn = $('t-acctconfirmbtn');
  if (!btn || !acctState) return;
  const zh = currentLang === 'zh';
  if (acctIsLocked()) {
    btn.disabled = true;
    btn.style.opacity = '0.45';
    btn.style.background = 'var(--border)';
    btn.style.color = 'var(--ink3)';
    btn.textContent = zh ? '已完成' : 'Completed';
  } else {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.background = 'var(--ink)';
    btn.style.color = '#fff';
    btn.textContent = zh ? '確認執行' : 'Confirm';
  }
}
function renderAccountHistoryCard() {
  const card = $('acctHistCard');
  if (!card || !acctState) return;
  const zh = currentLang === 'zh';
  if (!acctState.history || !acctState.history.length) {
    card.innerHTML = `
      <div class="acct-empty">
        <div class="acct-empty-ic">◷</div>
        <div class="acct-empty-title">${zh ? '還沒有任何投入紀錄' : 'No investments yet'}</div>
        <div class="acct-empty-body">${zh ? '完成第一次投入後，每一期的執行紀錄會累積在這裡。' : "Once you make your first investment, each period's record will show up here."}</div>
      </div>`;
    return;
  }
  card.innerHTML = acctState.history.slice().reverse().map(h => `
    <div class="acct-hist-row">
      <div class="acct-hist-date">${h.date}</div>
      <div class="acct-hist-note">${zh ? '定期投入' : 'Scheduled investment'}</div>
      <div class="acct-hist-amt">$${Math.round(h.amount).toLocaleString()}</div>
    </div>`).join('');
}

// round38新增:累積投入 vs 目前市值。用每筆history紀錄裡存的「投入當下價格」
// 回推股數,再乘上acctHoldingsData(帳戶面板開啟時抓的目前價格)算出目前市值。
// 舊資料(round38之前测试留下的,沒有price快照)沒辦法回推股數,退回用「投入金額
// 本身」當作那筆的市值(等於顯示打平),不是真的算出賺賠——這是資料缺口造成的
// 已知限制,不是計算邏輯錯誤。
function acctComputePerf() {
  let totalInvested = 0, currentValue = 0, hasApprox = false;
  (acctState.history || []).forEach(entry => {
    totalInvested += entry.amount;
    (entry.holdings || []).forEach(h => {
      const allocAmt = entry.amount * (h.pct / 100);
      const curPrice = (acctHoldingsData[h.ticker] && !acctHoldingsData[h.ticker].fetchFailed) ? acctHoldingsData[h.ticker].price : null;
      if (h.price && curPrice) {
        const shares = allocAmt / h.price;
        currentValue += shares * curPrice;
      } else {
        currentValue += allocAmt; // 缺價格資料,近似值:視為打平
        hasApprox = true;
      }
    });
  });
  return { totalInvested, currentValue, gain: currentValue - totalInvested,
    gainPct: totalInvested > 0 ? (currentValue - totalInvested) / totalInvested * 100 : 0, hasApprox };
}
function renderAccountPerfCard() {
  const card = $('acctPerfCard');
  if (!card || !acctState) return;
  const zh = currentLang === 'zh';
  if (!acctState.history || !acctState.history.length) {
    card.innerHTML = `
      <div class="acct-empty">
        <div class="acct-empty-ic">◷</div>
        <div class="acct-empty-title">${zh ? '還沒有任何投入紀錄' : 'No investments yet'}</div>
        <div class="acct-empty-body">${zh ? '第一次投入完成後，這裡會顯示累積投入跟目前市值的對照。' : "Once you make your first investment, this will show your accumulated investment vs current market value."}</div>
      </div>`;
    return;
  }
  const perf = acctComputePerf();
  const gainClass = perf.gain < 0 ? 'acct-perf-gain neg' : 'acct-perf-gain';
  const gainSign = perf.gain >= 0 ? '+' : '';
  const approxNote = perf.hasApprox
    ? (zh ? '部分較早的紀錄缺少當時價格資料，以投入金額近似顯示，不代表實際損益。' : "Some earlier records are missing price data and are shown at cost as an approximation, not actual gain/loss.")
    : (zh ? '市值依目前資產價格即時計算，僅供參考。' : 'Current value is calculated from live prices, for reference only.');
  card.innerHTML = `
    <div class="acct-perf-top">
      <div class="acct-perf-block">
        <div class="acct-perf-lbl">${zh ? '累積投入' : 'Total invested'}</div>
        <div class="acct-perf-val">$${Math.round(perf.totalInvested).toLocaleString()}</div>
      </div>
      <div class="acct-perf-block">
        <div class="acct-perf-lbl">${zh ? '目前市值' : 'Current value'}</div>
        <div class="acct-perf-val hl">$${Math.round(perf.currentValue).toLocaleString()}</div>
      </div>
    </div>
    <div class="${gainClass}">${gainSign}$${Math.round(Math.abs(perf.gain)).toLocaleString()}<span class="pct">${gainSign}${perf.gainPct.toFixed(1)}%</span></div>
    <div class="acct-perf-note">${approxNote}</div>`;
}

// ── 投入節奏調整(bottom sheet,六個月冷卻) ──
function openFreqSheet() {
  renderFreqSheetBody();
  $('acctSheetBackdrop').classList.add('show');
}
function closeFreqSheet() {
  $('acctSheetBackdrop').classList.remove('show');
}
function acctCanAdjustFreq() {
  if (!acctState.lastFreqChange) return true;
  const monthsSince = (new Date() - new Date(acctState.lastFreqChange)) / (1000*60*60*24*30);
  return monthsSince >= 6;
}
function renderFreqSheetBody() {
  const zh = currentLang === 'zh';
  const body = $('acctSheetBody');
  if (acctCanAdjustFreq()) {
    acctPendingWeekday = acctState.weekday;
    body.innerHTML = `
      <div class="acct-cooldown-ok">✓ ${zh?'現在可以調整':'You can adjust now'}</div>
      <span class="acct-field-label">${zh?'投入頻率':'Frequency'}</span>
      <select id="acctFreqSelect">
        ${[1,2,4,8].map(w => `<option value="${w}" ${w===acctState.freqWeeks?'selected':''}>${zh?`每 ${w} 週`:`Every ${w}w`}</option>`).join('')}
      </select>
      <span class="acct-field-label">${zh?'投入星期':'Weekday'}</span>
      <div class="acct-weekday-seg">
        ${[1,2,3,4,5].map(w => `<button class="${w===acctState.weekday?'active':''}" onclick="acctPickDay(this,${w})">${zh?WEEKDAY_ZH[w]:WEEKDAY_EN[w]}</button>`).join('')}
      </div>
      <div class="acct-sheet-btn-row">
        <button class="act-btn" onclick="closeFreqSheet()" style="width:100%;">${zh?'取消':'Cancel'}</button>
        <button class="act-btn" onclick="acctConfirmFreq()" style="width:100%;background:var(--ink);color:#fff;">${zh?'確認調整':'Confirm'}</button>
      </div>`;
  } else {
    const last = new Date(acctState.lastFreqChange);
    const nextOk = new Date(last); nextOk.setMonth(nextOk.getMonth()+6);
    const daysLeft = Math.max(0, Math.ceil((nextOk - new Date())/86400000));
    body.innerHTML = `
      <div class="acct-cooldown-lock">🔒 ${zh?`距離上次調整未滿6個月，還要等 ${daysLeft} 天`:`Locked for ${daysLeft} more days`}</div>
      <div style="font-size:12px;color:var(--ink3);line-height:1.7;font-family:var(--font-sans);">${acctRhythmSentence()}<br>${zh?'下次可調整日':'Next eligible'}：${nextOk.toISOString().slice(0,10).replace(/-/g,'/')}</div>
      <div class="acct-sheet-btn-row" style="margin-top:16px;"><button class="act-btn" onclick="closeFreqSheet()" style="width:100%;">${zh?'關閉':'Close'}</button></div>`;
  }
}
function acctPickDay(btn, w) {
  btn.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  acctPendingWeekday = w;
}
function acctConfirmFreq() {
  const sel = $('acctFreqSelect');
  acctState.freqWeeks = parseInt(sel.value, 10);
  if (acctPendingWeekday) acctState.weekday = acctPendingWeekday;
  acctState.lastFreqChange = new Date().toISOString().slice(0,10);
  acctSave(acctState);
  acctPendingWeekday = null;
  closeFreqSheet();
  renderAccountStaticParts();
}

// ── 身份代碼:複製/QR/分享 ──
function copyAccountCode() {
  const zh = currentLang === 'zh';
  if (navigator.clipboard) {
    navigator.clipboard.writeText(acctState.code).then(() => alert(zh?'已複製代碼':'Code copied')).catch(()=>{});
  }
}
function showAccountQR() {
  const zh = currentLang === 'zh';
  // TODO:之後接jsQR產生真正的QR圖片,現在先用文字代替,不要擋流程
  alert((zh?'（開發中）QR產生功能之後再接，先用文字代碼：':'(In development) QR coming later. Code: ') + acctState.code);
}
function shareAccountCode() {
  const zh = currentLang === 'zh';
  if (navigator.share) {
    navigator.share({ title: 'DCAcafe', text: (zh?'我的虛擬帳戶代碼：':'My account code: ') + acctState.code }).catch(()=>{});
  } else {
    copyAccountCode();
  }
}

// ── 提醒設定:常駐按鈕,依當下頻率/星期即時產生連結,不是一次性彈窗 ──
function addToGoogleCalendar() {
  const next = acctNextInvestDate();
  const d = next.date;
  const startStr = d.toISOString().slice(0,10).replace(/-/g,'');
  const endD = new Date(d); endD.setDate(endD.getDate()+1);
  const endStr = endD.toISOString().slice(0,10).replace(/-/g,'');
  const zh = currentLang === 'zh';
  const title = encodeURIComponent(zh ? 'DCAcafé 投入提醒' : 'DCAcafé Investment Reminder');
  const details = encodeURIComponent(zh ? '記得依照你的虛擬帳戶設定執行本期投入' : "Time to review this period's DCA investment.");
  const recur = encodeURIComponent(`RRULE:FREQ=WEEKLY;INTERVAL=${acctState.freqWeeks}`);
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${details}&recur=${recur}`;
  window.open(url, '_blank');
}
// round35修正:原本用blob+download在瀏覽器本機產生.ics——iOS Safari會把它當一般不明檔案
// 丟進檔案App,開啟選單裡連行事曆的選項都沒有,使用者直接卡死。改成開Proxy的
// calendar-reminder endpoint(伺服器以text/calendar回應),iOS會直接跳出「加入行事曆」
// 的原生確認畫面,跟Google那顆一樣一步到位。
// 2026-07-21更新:原獨立的api/calendar-reminder.js已合併進api/like-calendar.js
// (為了騰出Vercel Hobby方案的function名額給api/alpaca.js),網址改用?type=ics分流。
function addToIcsCalendar() {
  const params = new URLSearchParams({
    type: 'ics',
    freq: acctState.freqWeeks,
    day: acctState.weekday,
    lang: currentLang
  });
  window.location.href = 'https://proxy-three-mu-47.vercel.app/api/like-calendar?' + params.toString();
}

// (paper-allocation.js 已涵蓋: paGetActiveBudget ~ paSelectPill)
// (watchlist.js 已涵蓋: removeFromWatchlist)
