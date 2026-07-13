// ============================================================
// jury-nav.js — 導向陪審團(Master Jury)資料組裝模組
// 從 index.html 拆分而出(round46 架構瘦身,第三批),邏輯逐行原樣搬移,未做任何修改。
// 依賴:lastJuryCtx/currentLang/currentCalcResult/currentBudget(全域變數,定義於index.html)、
// getLogoUrl(logo.js)、inferAssetCategory/inferRealVolatilityTier/downsampleHistory/renderResult/
// scrollToWithNavOffset(score-engine,定義於index.html)、paHoldings/paLastAlloc(paper-allocation,定義於index.html)
// ============================================================

function navigateToJury() {
  if(!lastJuryCtx) return;
  const asset = inferAssetCategory(lastJuryCtx.ticker, lastJuryCtx.instrumentType);
  const realVolatility = inferRealVolatilityTier(lastJuryCtx.annualVol);
  const budget = $('budget') ? $('budget').value.trim() : '';
  // round9新增:把完整歷史收盤價壓縮成52點,連同起訖年份一起傳給jury.html畫10年走勢圖。
  // 沒有歷史資料(陣列太短或缺失)時就不帶這個參數,jury.html那邊會直接不顯示走勢圖區塊。
  const histCloses = downsampleHistory(lastJuryCtx.history, 52);
  const histStr = histCloses.length >= 10 ? histCloses.join(',') : '';
  const nowYear = new Date().getFullYear();
  const histStartYear = lastJuryCtx.history && lastJuryCtx.history.length
    ? nowYear - Math.round(lastJuryCtx.history.length / 252)
    : '';
  const params = new URLSearchParams({
    ticker: lastJuryCtx.ticker,
    name_en: lastJuryCtx.name,
    name_zh: lastJuryCtx.name,
    asset: asset,
    score: lastJuryCtx.score,
    mult: lastJuryCtx.mult,
    budget: budget,
    logo: getLogoUrl(lastJuryCtx.ticker) || '',
    lang: currentLang,
    // round7補的缺口:這四個是jury.html的市場面文案池需要的真實數值,
    // 對應jury.html裡ctx0讀取的rsi_pct/drawdown/vix/blackSwan這幾個URL參數名稱
    rsi_pct: lastJuryCtx.rsiPct,
    drawdown: lastJuryCtx.drawdown,
    vix: lastJuryCtx.vix,
    blackSwan: lastJuryCtx.blackSwan ? 'true' : 'false',
    // round7修正:真實年化波動率算出來的等級,陪審團那邊有真實值就優先用,不用猜的
    real_volatility: realVolatility
  });
  // round9新增:hist是逗號分隔的52個壓縮取樣價格,histStart/histEnd是圖表x軸要顯示的年份範圍
  if(histStr) {
    params.set('hist', histStr);
    params.set('histStart', histStartYear);
    params.set('histEnd', nowYear);
  }
  // 回頭時直接還原畫面用,不重打API:存完整的data/vix/result,不是只存ticker+budget
  try{
    sessionStorage.setItem('dcacafe_restore', JSON.stringify({
      ticker: currentCalcResult._ticker,
      budget: currentBudget,
      data: currentCalcResult._data,
      vix: currentCalcResult._vix,
      result: currentCalcResult
    }));
  }catch(e){}
  window.location.href = 'jury.html?' + params.toString();
}

// source(選填):{holdings, allocOf, budget} — 沒帶的話沿用預設行為(自選清單的paHoldings/paLastAlloc)。
// 這樣「我的虛擬帳戶」自己的持股也能呼叫同一套加權計算,不用另外寫一份公式,
// 只是換一份持股清單跟金額來源進去。
function computePortfolioWeighted(source) {
  const holdings = source ? source.holdings : paHoldings;
  const allocOf = source ? source.allocOf : (t => paLastAlloc[t] || 0);
  const okHoldings = holdings.filter(h => !h.fetchFailed);
  const failedHoldings = holdings.filter(h => h.fetchFailed);
  if (!okHoldings.length) return null;

  const totalAmt = okHoldings.reduce((s, h) => s + (allocOf(h.ticker) || 0), 0) || 1;
  const weightOf = (h) => (allocOf(h.ticker) || 0) / totalAmt;

  const weightedScore = okHoldings.reduce((s, h) => s + h.score * weightOf(h), 0);
  const weightedMult  = okHoldings.reduce((s, h) => s + h.mult * weightOf(h), 0);
  const weightedRsiPct = okHoldings.reduce((s, h) => s + (h.rsiPct || 0) * weightOf(h), 0);
  const weightedDrawdown = okHoldings.reduce((s, h) => s + (h.drawdown || 0) * weightOf(h), 0);
  const weightedVix = okHoldings.reduce((s, h) => s + (h.vix || 0) * weightOf(h), 0);
  const weightedAnnualVol = okHoldings.reduce((s, h) => s + (h.vol || 0) * weightOf(h), 0);
  const realVolatility = inferRealVolatilityTier(weightedAnnualVol);
  const sorted = [...okHoldings].sort((a, b) => b.score - a.score);
  const blackSwanTickers = okHoldings.filter(h => h.blackSwan).map(h => h.ticker);

  return {
    okHoldings, failedHoldings, sorted, totalAmt, weightOf,
    weightedScore, weightedMult, weightedRsiPct, weightedDrawdown, weightedVix,
    weightedAnnualVol, realVolatility, blackSwanTickers
  };
}

// Portfolio-mode jury entry (Round 14) — called from Watchlist page.
// Passes aggregate portfolio context instead of a single-asset context.
// round21新增:接受選填的source參數,「我的虛擬帳戶」健診時會帶自己的持股清單進來,
// 不帶的話(自選清單頁的「組合策略健檢」按鈕)行為完全跟以前一樣。
function navigateToJuryPortfolio(source) {
  const zh = currentLang === 'zh';
  const holdings = source ? source.holdings : paHoldings;
  if (!holdings.length) {
    alert(zh ? '請先更新自選清單資料' : 'Please update your watchlist first.');
    return;
  }

  const w = computePortfolioWeighted(source);
  if (!w) {
    alert(zh ? '所有持股資料讀取失敗,請重新整理自選清單後再試一次。' : 'All holdings failed to load. Please refresh your watchlist and try again.');
    return;
  }
  const { okHoldings, failedHoldings, sorted, totalAmt, weightOf, weightedScore, weightedMult, weightedRsiPct, weightedDrawdown, weightedVix, realVolatility, blackSwanTickers } = w;

  // 每檔持股完整帶上jury.html做「最高/最低分聚光燈」跟疊圖需要的欄位:
  // TICKER:PCT:SCORE:MULT:RSI:DD:VIX:BLACKSWAN(1/0)
  const holdingsSummary = sorted.map(h => {
    const pct = (weightOf(h) * 100).toFixed(1);
    return [
      h.ticker, pct, h.score.toFixed(0), h.mult.toFixed(2),
      (h.rsiPct != null ? h.rsiPct : ''), (h.drawdown != null ? h.drawdown.toFixed(1) : ''),
      (h.vix != null ? h.vix.toFixed(1) : ''), (h.blackSwan ? '1' : '0')
    ].join(':');
  }).join(',');

  const params = new URLSearchParams({
    mode: 'portfolio',
    score: weightedScore.toFixed(1),
    mult: weightedMult.toFixed(2),
    rsi_pct: weightedRsiPct.toFixed(0),
    drawdown: weightedDrawdown.toFixed(1),
    vix: weightedVix.toFixed(1),
    real_volatility: realVolatility,
    holdings: holdingsSummary,
    blackswan_tickers: blackSwanTickers.join(','),
    budget: Math.round(totalAmt),
    lang: currentLang,
  });

  // round28新增:從帳戶觸發的健診,把表單需要的欄位一起帶過去,jury.html收到齊全資料就會
  // 自動跳過表單、自動送出——不是每次健診都要使用者重填目標類型/年限/金額。
  if (source) {
    params.set('auto', '1');
    if (source.goalType) params.set('goal_type', source.goalType);
    if (source.years != null) params.set('years', source.years);
    if (source.strategy) params.set('strategy', source.strategy);
    if (source.income) params.set('income', source.income);
    params.set('amount', Math.round(source.budget || totalAmt));
    // 有存過的分類結果就一起帶,jury.html收到這兩個就會跳過AI分類那支API直接用
    if (source.riskTolerance) params.set('risk', source.riskTolerance);
    if (source.timeHorizon) params.set('horizon', source.timeHorizon);
  }

  // round14新增:讀取失敗的持股清單也一起傳過去,jury.html負責在畫面上明確告知使用者
  // 「這幾檔沒有被納入這次計算」,不能悄悄跳過不講。
  if (failedHoldings.length) {
    params.set('failed_tickers', failedHoldings.map(h => h.ticker).join(','));
    // round14新增:失敗事件記GA4,暫不建Sheets記錄endpoint(規格未定,延後)
    if (typeof gtag !== 'undefined') {
      gtag('event', 'jury_portfolio_holding_fetch_failed', {
        event_category: 'jury',
        failed_count: failedHoldings.length,
        failed_tickers: failedHoldings.map(h => h.ticker).join(','),
      });
    }
  }

  // Save restore point so back-navigation returns to the right place —
  // watchlist normally, but back to the account panel if triggered from there.
  try {
    sessionStorage.setItem('dcacafe_restore_wl', JSON.stringify({ tab: source ? 'account' : 'watchlist' }));
  } catch(e) {}

  window.location.href = 'jury.html?' + params.toString();
}

function restoreFromJuryReturn(){
  try{
    const saved = sessionStorage.getItem('dcacafe_restore');
    if(!saved) return;
    sessionStorage.removeItem('dcacafe_restore');
    const obj = JSON.parse(saved);
    if(!obj || !obj.ticker || !obj.result) return;
    $('ticker').value = obj.ticker;
    currentCalcResult = obj.result;
    currentCalcResult._data = obj.data;
    currentCalcResult._vix = obj.vix;
    currentCalcResult._ticker = obj.ticker;
    currentBudget = obj.budget;
    // 直接用快取資料重新渲染畫面,不呼叫calculate(),不重打任何API
    renderResult(obj.ticker, obj.budget, obj.data, obj.result, obj.vix);
    if(typeof dismissBrew === 'function') dismissBrew();
    $('result').classList.add('show');
    // round9修正:原本200ms比calculate()的400ms短,容易在logo圖片等非同步內容
    // 還沒載入完成、版面還在跳動時就量測位置,導致最後捲動到的位置偏低(畫面變太高/卡片位置太低)。
    // 改成跟calculate()一致的400ms,讓版面先穩定下來再量測。
    setTimeout(() => { scrollToWithNavOffset($('tickerHeader')); }, 400);
  }catch(e){}
}
