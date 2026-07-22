// ============================================================
// expand-report.js — 自選清單卡片展開的完整歷史報表
// 呼叫 historical-score.js API,取得任一ticker的真實批次資料後,
// 在前端動態算出所有衍生統計(成長%/年化/歷史百分位/60分門檻相對位置/
// 滾動窗口勝率/加碼機會事件/極值週),並畫出疊線圖跟F圖。
//
// 依賴:$() 全域helper(定義於index.html)、createLogoImg()(定義於logo.js)
// 呼叫方式:renderExpandedReport(ticker, containerId) — containerId是要塞入
// 報表HTML的目標div id,呼叫端(watchlist.js的card.onclick)負責控制展開/收合。
// ============================================================

const EXPAND_REPORT_API = 'https://proxy-three-mu-47.vercel.app/api/historical-score';

// ── 跟score.js的calcMultiplier完全一致的公式(這裡只是拿來做歷史模擬用,不影響正式分數計算) ──
function erCalcMultiplier(score) {
  if (score < 60) return 1.0;
  return Math.round((1.0 + ((score - 60) / 40) * 0.8) * 100) / 100;
}

// ── 主入口:展開卡片時呼叫這支 ──
async function renderExpandedReport(ticker, containerId) {
  const container = $(containerId);
  if (!container) return;
  const zh = typeof currentLang !== 'undefined' ? currentLang === 'zh' : true;

  container.innerHTML = `<div class="er-loading">${zh ? '查詢中,首次查詢可能要等10幾秒…' : 'Loading, first query may take a while…'}</div>`;

  try {
    const res = await fetch(`${EXPAND_REPORT_API}?ticker=${encodeURIComponent(ticker)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API error');
    if (!data.series || data.series.length < 20) throw new Error('Not enough data');

    const stats = erComputeStats(data.series);
    container.innerHTML = erBuildHTML(ticker, data, stats, zh);
    erDrawOverlayChart(data.series, `er-overlay-${ticker}`);
    erDrawMainChart(data.series, stats, `er-main-${ticker}`);
  } catch (e) {
    container.innerHTML = `<div class="er-error">${zh ? '查詢失敗,請稍後再試' : 'Failed to load, please try again'}</div>`;
    console.error('renderExpandedReport error:', e);
  }
}

// ── 所有衍生統計的計算(對應前面mockup用Python算過的邏輯,這裡改寫成正式JS版) ──
function erComputeStats(series) {
  const n = series.length;
  const WINDOW_YEARS = 52 * 2; // 2年滾動窗口(跟mockup驗證時同一個設定)
  const FORWARD_WEEKS = 13;    // 3個月(跟前面驗證時同一個設定,未來若要恢復分數分組報酬卡可沿用)
  const RELPOS_WINDOW = 52;    // 相對位置用近1年(52週)高低區間

  // 成長% + 年化
  const first = series[0], last = series[n - 1];
  const firstDate = new Date(first.week + 'T00:00:00Z');
  const lastDate = new Date(last.week + 'T00:00:00Z');
  const years = (lastDate - firstDate) / (1000 * 60 * 60 * 24 * 365.25);
  const growth = (last.price - first.price) / first.price * 100;
  const cagr = years > 0 ? (Math.pow(last.price / first.price, 1 / years) - 1) * 100 : 0;

  // 今天分數的歷史百分位排名(倒數X% = 贏過歷史上多少%的週)
  const todayScore = last.score;
  const allScores = series.map(s => s.score);
  const scoreRankPct = allScores.filter(s => s <= todayScore).length / n * 100;

  // 相對位置(每一週,依trailing 52週高低算0-1位置),用於60分門檻卡跟觸發統計
  const withRelPos = series.map((r, i) => {
    const start = Math.max(0, i - RELPOS_WINDOW + 1);
    const windowPrices = series.slice(start, i + 1).map(x => x.price);
    const high = Math.max(...windowPrices), low = Math.min(...windowPrices);
    const relPos = high === low ? 0.5 : (r.price - low) / (high - low);
    return { ...r, relPos };
  });
  const triggered = withRelPos.filter(r => r.score >= 60);
  const notTriggered = withRelPos.filter(r => r.score < 60);
  const avg = arr => arr.length ? arr.reduce((a, r) => a + r.relPos, 0) / arr.length : null;
  const relPosTriggered = avg(triggered);
  const relPosNotTriggered = avg(notTriggered);

  // 滾動窗口勝率(動態加碼 vs 固定定額,用報酬率比較,不是成本基礎)
  let wins = 0, totalWindows = 0, roiDiffs = [];
  for (let start = 0; start <= n - WINDOW_YEARS; start++) {
    const windowSlice = series.slice(start, start + WINDOW_YEARS);
    const endPrice = windowSlice[windowSlice.length - 1].price;
    let fixedShares = 0, fixedInvested = 0, smartShares = 0, smartInvested = 0;
    windowSlice.forEach(r => {
      fixedShares += 1000 / r.price;
      fixedInvested += 1000;
      const mult = erCalcMultiplier(r.score);
      const invest = 1000 * mult;
      smartShares += invest / r.price;
      smartInvested += invest;
    });
    const fixedRoi = (fixedShares * endPrice - fixedInvested) / fixedInvested * 100;
    const smartRoi = (smartShares * endPrice - smartInvested) / smartInvested * 100;
    totalWindows++;
    if (smartRoi > fixedRoi) wins++;
    roiDiffs.push(smartRoi - fixedRoi);
  }
  const winRate = totalWindows ? (wins / totalWindows * 100) : null;
  const avgRoiDiff = roiDiffs.length ? roiDiffs.reduce((a, b) => a + b, 0) / roiDiffs.length : null;

  // 具體金額範例:每月投入NT$10,000,全期間累積(不是滾動窗口,是完整資料期間)
  const MONTHLY = 10000;
  const WEEKLY_EQUIV = MONTHLY * 12 / 52;
  let fixedSharesFull = 0, fixedInvestedFull = 0, smartSharesFull = 0, smartInvestedFull = 0;
  series.forEach(r => {
    fixedSharesFull += WEEKLY_EQUIV / r.price;
    fixedInvestedFull += WEEKLY_EQUIV;
    const mult = erCalcMultiplier(r.score);
    const invest = WEEKLY_EQUIV * mult;
    smartSharesFull += invest / r.price;
    smartInvestedFull += invest;
  });
  const fixedValueFull = fixedSharesFull * last.price;
  const smartValueFull = smartSharesFull * last.price;
  const dollarDiff = smartValueFull - fixedValueFull;

  // 加碼機會事件(連續觸發週合併成一次事件)
  const episodes = [];
  let curStart = null;
  series.forEach((r, i) => {
    const t = r.score >= 60;
    if (t && curStart === null) curStart = i;
    else if (!t && curStart !== null) { episodes.push({ start: curStart, end: i - 1 }); curStart = null; }
  });
  if (curStart !== null) episodes.push({ start: curStart, end: n - 1 });
  let longestEpisode = null;
  episodes.forEach(e => {
    const weeks = e.end - e.start + 1;
    if (!longestEpisode || weeks > longestEpisode.weeks) {
      longestEpisode = { start: series[e.start].week, end: series[e.end].week, weeks };
    }
  });

  // 客觀極值週(史上最高分/最低分)
  let highWeek = series[0], lowWeek = series[0];
  series.forEach(r => {
    if (r.score > highWeek.score) highWeek = r;
    if (r.score < lowWeek.score) lowWeek = r;
  });

  return {
    years, growth, cagr, todayScore, scoreRankPct,
    triggeredCount: triggered.length, totalWeeks: n,
    relPosTriggered, relPosNotTriggered,
    winRate, avgRoiDiff, dollarDiff, monthlyBudget: MONTHLY,
    fixedValueFull, smartValueFull,
    longestEpisode, episodeCount: episodes.length,
    highWeek, lowWeek,
  };
}

// ── 分數→加碼強度色階(跟F圖圖例一致) ──
function erColorForScore(score) {
  if (score < 60) return null;
  if (score < 70) return '#f0d9bb';
  if (score < 80) return '#e5bd8c';
  if (score < 90) return '#d69f5c';
  return '#c8813a';
}

// ── 組出完整報表HTML ──
function erBuildHTML(ticker, data, s, zh) {
  const last = data.series[data.series.length - 1];
  const hasPfcfAny = data.series.some(r => r.hasPfcf);
  const growthSign = s.growth >= 0 ? '+' : '';
  const cagrSign = s.cagr >= 0 ? '+' : '';
  const growthColor = s.growth >= 0 ? '#7dd3a0' : '#e08a7a';
  const relPosPct = (1 - (s.relPosTriggered ?? 0.5)) * 100; // 顯示用:越高越便宜的位置百分比,僅供dot定位參考

  const dollarSign = s.dollarDiff >= 0 ? '' : '-';
  const dollarAbs = Math.abs(Math.round(s.dollarDiff / 1000) * 1000);

  return `
  <div class="er-summary">
    <div class="er-ticker">${ticker} · ${zh ? '你的自選清單資產' : 'Your watchlist asset'}</div>
    <div class="er-price">$${last.price}</div>
    <div class="er-grid">
      <div class="er-box" style="position:relative;overflow:hidden;">
        <div class="er-lbl">${zh ? '近' : ''}${s.years.toFixed(1)}${zh ? '年成長' : 'yr growth'}</div>
        <svg id="er-growth-spark-${ticker}" width="100%" height="40" viewBox="0 0 120 40" preserveAspectRatio="none" style="position:absolute;bottom:0;left:0;opacity:0.35;"></svg>
        <div style="position:relative;text-align:center;padding-top:4px;">
          <div style="font-size:24px;font-weight:750;color:${growthColor};line-height:1.1;">${growthSign}${s.growth.toFixed(0)}%</div>
          <div style="font-size:10.5px;color:rgba(255,255,255,0.6);margin-top:2px;">${zh ? '年化' : 'CAGR'} ${cagrSign}${s.cagr.toFixed(1)}%</div>
        </div>
      </div>
      <div class="er-box">
        <div class="er-lbl">${zh ? '歷史定位(貴↔便宜)' : 'Historical position'}</div>
        <div style="margin-top:14px;position:relative;">
          <div style="height:10px;border-radius:6px;background:linear-gradient(to right, #c25b4a, #e0b088, #9fc999, #4a9d6e);"></div>
          <div style="position:absolute;top:-5px;left:${Math.max(2, Math.min(98, 100 - s.scoreRankPct))}%;width:16px;height:16px;border-radius:50%;background:#fff;border:2.5px solid #1d1d1f;margin-left:-8px;"></div>
        </div>
        <div style="text-align:center;font-size:20px;font-weight:750;margin-top:10px;color:#fff;">${zh ? '倒數' : 'Bottom'} ${s.scoreRankPct.toFixed(0)}%</div>
      </div>
    </div>
    <div class="er-verdict">
      ${zh
        ? `現在價格 $${last.price},DCA Score ${s.todayScore}分,是過去${s.years.toFixed(1)}年裡倒數${s.scoreRankPct.toFixed(0)}%的分數。回顧這段期間,系統總共標記出${s.episodeCount}次獨立的加碼機會${s.longestEpisode ? `,最長一次連續${s.longestEpisode.weeks}週` : ''}。若照這套訊號動態調整投入金額,任選2年區間比較,${s.winRate !== null ? s.winRate.toFixed(0) : '—'}%的區間報酬率都優於固定定額。`
        : `Current price $${last.price}, DCA Score ${s.todayScore}, ranking at the bottom ${s.scoreRankPct.toFixed(0)}% over the past ${s.years.toFixed(1)} years.`
      }
    </div>
  </div>

  <div class="er-card">
    <div class="er-card-title">${ticker} · DCA Score vs ${zh ? '價格' : 'Price'}</div>
    <div class="er-legend">
      <span class="er-legend-item"><span class="er-swatch" style="background:var(--accent);"></span>${zh ? 'DCA Score(4週平均)' : 'Score (4wk avg)'}</span>
      <span class="er-legend-item"><span class="er-swatch" style="background:#3a3a3c;"></span>${zh ? '價格(對數)' : 'Price (log)'}</span>
    </div>
    <svg id="er-overlay-${ticker}" width="100%" height="180" viewBox="0 0 340 180"></svg>
  </div>

  <div class="er-card">
    <div class="er-card-title">${zh ? '價格 · 系統何時建議加碼' : 'Price · when the system suggested buying more'}</div>
    <div class="er-legend">
      <span class="er-legend-item"><span class="er-swatch" style="background:#f0d9bb;"></span>60-70</span>
      <span class="er-legend-item"><span class="er-swatch" style="background:#e5bd8c;"></span>70-80</span>
      <span class="er-legend-item"><span class="er-swatch" style="background:#d69f5c;"></span>80-90</span>
      <span class="er-legend-item"><span class="er-swatch" style="background:#c8813a;"></span>90+</span>
    </div>
    <svg id="er-main-${ticker}" width="100%" height="230" viewBox="0 0 340 230"></svg>
    <div class="er-extreme-row">
      <div class="er-extreme-box" style="background:var(--al);">
        <div class="er-extreme-lbl">${zh ? '史上最高分' : 'All-time high score'}</div>
        <div class="er-extreme-val" style="color:var(--accent);">${s.highWeek.score}${zh ? '分' : ''}</div>
        <div class="er-extreme-sub">${s.highWeek.week} · $${s.highWeek.price}</div>
      </div>
      <div class="er-extreme-box" style="background:var(--bg2);">
        <div class="er-extreme-lbl">${zh ? '史上最低分' : 'All-time low score'}</div>
        <div class="er-extreme-val">${s.lowWeek.score}${zh ? '分' : ''}</div>
        <div class="er-extreme-sub">${s.lowWeek.week} · $${s.lowWeek.price}</div>
      </div>
    </div>
  </div>

  <div class="er-card">
    <div class="er-card-title">${zh ? '系統喊加碼時,價格真的比較便宜嗎?' : 'Is the price really cheaper when the system says buy?'}</div>
    <div style="position:relative;margin:46px 8px 8px;">
      <div style="height:14px;border-radius:8px;background:linear-gradient(to right, #c25b4a, #e0b088, #9fc999, #4a9d6e);"></div>
      <div style="position:absolute;top:-34px;left:${((s.relPosNotTriggered ?? 0.8) * 100).toFixed(0)}%;width:90px;margin-left:-45px;text-align:center;">
        <div style="font-size:11px;color:var(--ink2);font-weight:650;">${zh ? '沒建議加碼時' : 'No signal'}</div>
        <div style="width:12px;height:12px;border-radius:50%;background:#1d1d1f;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.25);margin:4px auto 0;"></div>
      </div>
      <div style="position:absolute;top:-34px;left:${((s.relPosTriggered ?? 0.3) * 100).toFixed(0)}%;width:90px;margin-left:-45px;text-align:center;">
        <div style="font-size:11px;color:var(--accent);font-weight:650;">${zh ? '建議加碼時' : 'Signal on'}</div>
        <div style="width:12px;height:12px;border-radius:50%;background:var(--accent);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.25);margin:4px auto 0;"></div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10.5px;color:var(--ink3);">
      <span>😥 ${zh ? '貴' : 'Expensive'}</span><span>😊 ${zh ? '便宜' : 'Cheap'}</span>
    </div>

    <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:14px;display:flex;align-items:center;gap:14px;">
      <div style="font-size:32px;font-weight:750;color:var(--accent);flex-shrink:0;">${s.winRate !== null ? s.winRate.toFixed(0) : '—'}%</div>
      <div style="font-size:12px;color:var(--ink2);line-height:1.5;">${zh
        ? `的2年區間,照著訊號動態加碼報酬率都贏固定定額。每月投1萬,累積下來多賺 <b style="color:var(--ink);">${dollarSign}${(dollarAbs/10000).toFixed(1)}萬</b>。`
        : `of 2-year windows show dynamic investing outperforming fixed DCA. Extra gain: <b style="color:var(--ink);">${dollarSign}$${dollarAbs.toLocaleString()}</b>.`
      }</div>
    </div>
    <div class="er-disclaimer">${zh
      ? '以現行公式回溯歷史資料計算,僅供參考,非投資建議,過去不代表未來。'
      : 'Calculated by backtesting the current formula on historical data. For reference only, not investment advice.'
    }</div>
  </div>
  <div class="er-close-btn" onclick="event.stopPropagation();paToggleExpand('${ticker}')">${zh ? '收合 ▴' : 'Collapse ▴'}</div>
  `;
}

// ── 疊線圖(分數4週平均 vs 價格,雙軸) ──
function erDrawOverlayChart(series, svgId) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  const N = series.length;
  const W = 340, H = 180, padL = 26, padR = 30, padT = 10, padB = 20;
  const chartW = W - padL - padR, chartH = H - padT - padB;

  const scores = series.map(d => d.score);
  const scoresSmooth = scores.map((_, i) => {
    const start = Math.max(0, i - 3);
    const slice = scores.slice(start, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
  const prices = series.map(d => d.price);
  const priceMin = Math.min(...prices), priceMax = Math.max(...prices);

  const gx = i => padL + (i / (N - 1)) * chartW;
  const gyScore = s => padT + (1 - s / 100) * chartH;
  const gyPrice = p => padT + (1 - (Math.log(p) - Math.log(priceMin)) / (Math.log(priceMax) - Math.log(priceMin))) * chartH;

  let scorePath = '', pricePath = '';
  series.forEach((d, i) => {
    const cmd = i === 0 ? 'M' : 'L';
    scorePath += `${cmd}${gx(i).toFixed(1)},${gyScore(scoresSmooth[i]).toFixed(1)} `;
    pricePath += `${cmd}${gx(i).toFixed(1)},${gyPrice(d.price).toFixed(1)} `;
  });
  const y60 = gyScore(60);

  let leftAxis = '';
  [0, 50, 100].forEach(v => { leftAxis += `<text x="${padL - 5}" y="${(gyScore(v) + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="var(--accent)">${v}</text>`; });
  let rightAxis = '';
  [priceMin, Math.sqrt(priceMin * priceMax), priceMax].forEach(p => { rightAxis += `<text x="${W - padR + 5}" y="${(gyPrice(p) + 3).toFixed(1)}" text-anchor="start" font-size="8" fill="#6e6e73">$${Math.round(p)}</text>`; });

  const yearFirstIdx = {};
  series.forEach((d, i) => { const y = d.week.slice(0, 4); if (!(y in yearFirstIdx)) yearFirstIdx[y] = i; });
  let xAxis = '';
  Object.keys(yearFirstIdx).forEach(y => {
    const x = gx(yearFirstIdx[y]);
    xAxis += `<text x="${x.toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="8" fill="#9a9a9f">${y}</text>`;
    xAxis += `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${H - padB}" stroke="#f0f0f2" stroke-width="0.6" stroke-dasharray="2,2"/>`;
  });

  svg.innerHTML = `
    ${leftAxis}${rightAxis}${xAxis}
    <line x1="${padL}" y1="${y60.toFixed(1)}" x2="${W - padR}" y2="${y60.toFixed(1)}" stroke="#e6e6ea" stroke-width="1" stroke-dasharray="3,3"/>
    <path d="${pricePath}" fill="none" stroke="#1d1d1f" stroke-width="1.3" opacity="0.5"/>
    <path d="${scorePath}" fill="none" stroke="var(--accent)" stroke-width="2.2"/>
  `;
}

// ── F圖(價格線+加碼強度區塊+極值標註) ──
function erDrawMainChart(series, stats, svgId) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  const N = series.length;
  const W = 340, H = 230, padL = 34, padR = 8, padT = 10, padB = 22;
  const chartW = W - padL - padR, chartH = H - padT - padB;

  const prices = series.map(d => d.price);
  const priceMin = Math.min(...prices), priceMax = Math.max(...prices);
  const gx = i => padL + (i / (N - 1)) * chartW;
  const barW = chartW / N;
  const gyPrice = p => padT + (1 - (Math.log(p) - Math.log(priceMin)) / (Math.log(priceMax) - Math.log(priceMin))) * chartH;

  let bands = '';
  series.forEach((d, i) => {
    const c = erColorForScore(d.score);
    if (c) bands += `<rect x="${(gx(i) - barW / 2).toFixed(1)}" y="${padT}" width="${(barW + 0.5).toFixed(1)}" height="${chartH}" fill="${c}" opacity="0.85"/>`;
  });

  const yTicks = [priceMin, Math.sqrt(priceMin * priceMax), priceMax];
  let yAxisLabels = '';
  yTicks.forEach(p => {
    const y = gyPrice(p);
    yAxisLabels += `<text x="${padL - 4}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="#9a9a9f">$${Math.round(p)}</text>`;
    yAxisLabels += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="#f0f0f2" stroke-width="0.6"/>`;
  });

  const yearFirstIdx = {};
  series.forEach((d, i) => { const y = d.week.slice(0, 4); if (!(y in yearFirstIdx)) yearFirstIdx[y] = i; });
  let xAxisLabels = '';
  Object.keys(yearFirstIdx).forEach(y => {
    const x = gx(yearFirstIdx[y]);
    xAxisLabels += `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="8" fill="#9a9a9f">${y}</text>`;
    xAxisLabels += `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${H - padB}" stroke="#f0f0f2" stroke-width="0.6" stroke-dasharray="2,2"/>`;
  });

  let pricePath = '';
  series.forEach((d, i) => { const cmd = i === 0 ? 'M' : 'L'; pricePath += `${cmd}${gx(i).toFixed(1)},${gyPrice(d.price).toFixed(1)} `; });

  const lastIdx = N - 1;
  const lastX = gx(lastIdx), lastY = gyPrice(series[lastIdx].price);

  let annotation = '';
  if (stats.longestEpisode) {
    const epStartIdx = series.findIndex(d => d.week === stats.longestEpisode.start);
    const epEndIdx = series.findIndex(d => d.week === stats.longestEpisode.end);
    if (epStartIdx >= 0 && epEndIdx >= 0) {
      const midIdx = Math.round((epStartIdx + epEndIdx) / 2);
      annotation = `
        <line x1="${gx(epStartIdx).toFixed(1)}" y1="${padT + 2}" x2="${gx(epEndIdx).toFixed(1)}" y2="${padT + 2}" stroke="#1d1d1f" stroke-width="1.2"/>
        <text x="${gx(midIdx).toFixed(1)}" y="${padT + 10}" text-anchor="middle" font-size="8.5" font-weight="650" fill="#1d1d1f">${stats.longestEpisode.weeks}週</text>
      `;
    }
  }

  svg.innerHTML = `
    ${yAxisLabels}${xAxisLabels}${bands}
    <path d="${pricePath}" fill="none" stroke="#3a3a3c" stroke-width="1.6" opacity="0.55"/>
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3.5" fill="#3a3a3c"/>
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="6" fill="none" stroke="#3a3a3c" stroke-width="1" opacity="0.4"/>
    ${annotation}
  `;

  // 摘要卡的成長迷你走勢圖也一併畫(跟主圖用同一份資料)
  const growthSparkEl = svg.closest('.er-card') && svg.closest('body').querySelector(`[id^="er-growth-spark-"]`);
  if (growthSparkEl) {
    const minV = Math.min(...prices), maxV = Math.max(...prices);
    const range = (maxV - minV) || 1;
    const gW = 120, gH = 40;
    const gToX = i => (i / (prices.length - 1)) * gW;
    const gToY = v => gH - ((v - minV) / range) * gH;
    const linePath = prices.map((v, i) => `${i === 0 ? 'M' : 'L'}${gToX(i).toFixed(1)},${gToY(v).toFixed(1)}`).join(' ');
    const isUp = prices[prices.length - 1] >= prices[0];
    const color = isUp ? '#7dd3a0' : '#e08a7a';
    growthSparkEl.innerHTML = `
      <path d="${linePath} L${gW},${gH} L0,${gH} Z" fill="${color}" opacity="0.5"/>
      <path d="${linePath}" fill="none" stroke="${color}" stroke-width="1.5"/>
    `;
  }
}
