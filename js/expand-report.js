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

let erResizeHandler = null;

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
    const redraw = () => {
      erDrawOverlayChart(data.series, `er-overlay-${ticker}`);
      erDrawMainChart(data.series, stats, `er-main-${ticker}`);
    };
    redraw();
    // 座標軸標籤是依容器實際寬度定位的,轉向或視窗變動後要重畫,否則會錯位。
    // 只留最後一個展開的卡片的handler(展開新的會蓋掉舊的,收合時也不影響)。
    if (erResizeHandler) window.removeEventListener('resize', erResizeHandler);
    let t = null;
    erResizeHandler = () => { clearTimeout(t); t = setTimeout(redraw, 180); };
    window.addEventListener('resize', erResizeHandler);
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
// ── 年份標籤:先取每年第一個資料點,再把靠太近的丟掉 ──
// 改版前是「每個年份都畫一個標籤」,十年份擠在約280px裡,每個只分到25px,必然重疊
// (而且資產若在年中才進入視窗,那一年的起點會跟下一年幾乎貼在一起,例如2016/2017)。
// 改成間距不足就跳過之後,不論資產有10年還是3年,標籤都會落在4~6個,永遠不會擠。
function erPickYearTicks(series, plotW, minGapPx) {
  const firstIdx = {};
  series.forEach((d, i) => { const y = d.week.slice(0, 4); if (!(y in firstIdx)) firstIdx[y] = i; });
  const N = series.length;
  const kept = [];
  let lastX = -1e9;
  Object.keys(firstIdx).sort().forEach(y => {
    const x = (firstIdx[y] / (N - 1)) * plotW;
    if (x - lastX >= minGapPx) { kept.push({ year: y, idx: firstIdx[y], x }); lastX = x; }
  });
  return kept;
}

// ── 座標軸標籤用HTML畫,不放進SVG ──
// 改版前所有文字都是SVG <text>,而SVG是照「340單位寬」畫、卡片實際只有約300px,
// 整張被等比縮小約0.9倍 → font-size="8" 在螢幕上只剩7px出頭,幾乎讀不了。
// 改成HTML之後文字吃真正的CSS px,不管卡片多寬都不會再被縮放;SVG只負責畫線,
// 而且viewBox直接設成實際像素尺寸(1單位=1px),線條粗細也不會失真。
function erPlaceLabels(plotEl, items) {
  plotEl.querySelectorAll('.er-ylab').forEach(e => e.remove());
  items.forEach(it => {
    const el = document.createElement('div');
    el.className = 'er-ylab ' + (it.side === 'left' ? 'er-ylab-l' : 'er-ylab-r');
    el.textContent = it.text;
    el.style.top = it.top + 'px';
    if (it.color) el.style.color = it.color;
    plotEl.appendChild(el);
  });
}

function erPlaceXLabels(rowEl, ticks, offsetLeft) {
  rowEl.innerHTML = '';
  ticks.forEach(t => {
    const el = document.createElement('div');
    el.className = 'er-xlab';
    el.textContent = t.year;
    el.style.left = (offsetLeft + t.x) + 'px';
    rowEl.appendChild(el);
  });
}

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
          <div style="position:absolute;top:-5px;left:${Math.max(2, Math.min(98, s.scoreRankPct))}%;width:16px;height:16px;border-radius:50%;background:#fff;border:2.5px solid #1d1d1f;margin-left:-8px;"></div>
        </div>
        <div style="text-align:center;margin-top:8px;">
          <div style="font-size:24px;font-weight:750;color:#fff;line-height:1.1;">${s.scoreRankPct.toFixed(0)}%</div>
          <div style="font-size:10.5px;color:rgba(255,255,255,0.6);margin-top:2px;">${zh ? '的時間比現在貴' : 'of the time was pricier'}</div>
        </div>
      </div>
    </div>
    <div class="er-verdict">
      ${zh
        ? `現在價格 $${last.price},DCA Score ${s.todayScore}分,比過去${s.years.toFixed(1)}年裡${s.scoreRankPct.toFixed(0)}%的時間都更便宜。回顧這段期間,系統總共標記出${s.episodeCount}次獨立的加碼機會${s.longestEpisode ? `,最長一次連續${s.longestEpisode.weeks}週` : ''}。若照這套訊號動態調整投入金額,任選2年區間比較,${s.winRate !== null ? s.winRate.toFixed(0) : '—'}%的區間報酬率都優於固定定額。`
        : `Current price $${last.price}, DCA Score ${s.todayScore}, cheaper than ${s.scoreRankPct.toFixed(0)}% of the past ${s.years.toFixed(1)} years.`
      }
    </div>
  </div>

  <div class="er-card">
    <div class="er-card-title">${ticker} · DCA Score vs ${zh ? '價格' : 'Price'}</div>
    <div class="er-legend">
      <span class="er-legend-item"><span class="er-swatch" style="background:var(--accent);"></span>${zh ? 'DCA Score(4週平均)' : 'Score (4wk avg)'}</span>
      <span class="er-legend-item"><span class="er-swatch" style="background:#3a3a3c;"></span>${zh ? '價格(對數)' : 'Price (log)'}</span>
    </div>
    <div class="er-plot" id="er-overlay-${ticker}-plot" style="height:184px;padding:10px 46px 6px 34px;">
      <svg id="er-overlay-${ticker}" preserveAspectRatio="none"></svg>
    </div>
    <div class="er-xrow" id="er-overlay-${ticker}-x"></div>
  </div>

  <div class="er-card">
    <div class="er-card-title">${zh ? '價格 · 系統何時建議加碼' : 'Price · when the system suggested buying more'}</div>
    <div class="er-legend">
      <span class="er-legend-item"><span class="er-swatch" style="background:#f0d9bb;"></span>60-70</span>
      <span class="er-legend-item"><span class="er-swatch" style="background:#e5bd8c;"></span>70-80</span>
      <span class="er-legend-item"><span class="er-swatch" style="background:#d69f5c;"></span>80-90</span>
      <span class="er-legend-item"><span class="er-swatch" style="background:#c8813a;"></span>90+</span>
    </div>
    <div class="er-plot" id="er-main-${ticker}-plot" style="height:224px;padding:10px 12px 6px 42px;">
      <svg id="er-main-${ticker}" preserveAspectRatio="none"></svg>
    </div>
    <div class="er-xrow" id="er-main-${ticker}-x"></div>
    <div class="er-extreme-row">
      <div class="er-extreme-box" style="background:var(--al);">
        <div class="er-extreme-lbl">${zh ? `${Math.round(s.years)}年內最高分` : `${Math.round(s.years)}-yr high`}</div>
        <div class="er-extreme-val" style="color:var(--accent);">${s.highWeek.score}${zh ? '分' : ''}</div>
        <div class="er-extreme-sub">${s.highWeek.week} · $${s.highWeek.price}</div>
      </div>
      <div class="er-extreme-box" style="background:var(--bg2);">
        <div class="er-extreme-lbl">${zh ? `${Math.round(s.years)}年內最低分` : `${Math.round(s.years)}-yr low`}</div>
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
// 2026-07-23改版:座標軸文字改用HTML(見上方 erPlaceLabels 註解),SVG只畫線。
// viewBox直接設成容器的實際像素尺寸,1單位=1px,所以線寬與間距都不會被縮放。
function erDrawOverlayChart(series, svgId) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  const plot = svg.parentElement;                 // .er-plot(padding即為座標軸留白)
  const xrow = document.getElementById(svgId + '-x');
  const PADL = 34, PADR = 46, PADT = 10, PADB = 6;

  const cw = Math.max(80, plot.clientWidth - PADL - PADR);
  const ch = Math.max(60, plot.clientHeight - PADT - PADB);

  const N = series.length;
  const scores = series.map(d => d.score);
  const smooth = scores.map((_, i) => {
    const s = scores.slice(Math.max(0, i - 3), i + 1);
    return s.reduce((a, b) => a + b, 0) / s.length;
  });
  const prices = series.map(d => d.price);
  const pMin = Math.min(...prices), pMax = Math.max(...prices);

  svg.setAttribute('viewBox', `0 0 ${cw} ${ch}`);
  const gx  = i => (i / (N - 1)) * cw;
  const gyS = s => (1 - s / 100) * ch;
  const gyP = p => (1 - (Math.log(p) - Math.log(pMin)) / (Math.log(pMax) - Math.log(pMin))) * ch;

  let scorePath = '', pricePath = '';
  series.forEach((d, i) => {
    const c = i === 0 ? 'M' : 'L';
    scorePath += `${c}${gx(i).toFixed(1)},${gyS(smooth[i]).toFixed(1)} `;
    pricePath += `${c}${gx(i).toFixed(1)},${gyP(d.price).toFixed(1)} `;
  });

  const ticks = erPickYearTicks(series, cw, 42);
  let grid = '';
  ticks.forEach(t => {
    grid += `<line x1="${t.x.toFixed(1)}" y1="0" x2="${t.x.toFixed(1)}" y2="${ch}" stroke="#f0f0f2" stroke-width="1" stroke-dasharray="2,2"/>`;
  });

  svg.innerHTML = `${grid}
    <line x1="0" y1="${gyS(60).toFixed(1)}" x2="${cw}" y2="${gyS(60).toFixed(1)}" stroke="#e6e6ea" stroke-width="1" stroke-dasharray="3,3"/>
    <path d="${pricePath}" fill="none" stroke="#3a3a3c" stroke-width="1.3" opacity="0.5"/>
    <path d="${scorePath}" fill="none" stroke="var(--accent)" stroke-width="2.2"/>`;

  const labels = [];
  [0, 50, 100].forEach(v => labels.push({ side: 'left', text: String(v), top: PADT + gyS(v), color: 'var(--accent)' }));
  [pMin, Math.sqrt(pMin * pMax), pMax].forEach(p => labels.push({ side: 'right', text: '$' + Math.round(p), top: PADT + gyP(p) }));
  erPlaceLabels(plot, labels);
  if (xrow) erPlaceXLabels(xrow, ticks, PADL);
}

// ── F圖(價格線+加碼強度區塊+極值標註) ──
function erDrawMainChart(series, stats, svgId) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  const plot = svg.parentElement;
  const xrow = document.getElementById(svgId + '-x');
  const PADL = 42, PADR = 12, PADT = 10, PADB = 6;

  const cw = Math.max(80, plot.clientWidth - PADL - PADR);
  const ch = Math.max(60, plot.clientHeight - PADT - PADB);

  const N = series.length;
  const prices = series.map(d => d.price);
  const pMin = Math.min(...prices), pMax = Math.max(...prices);

  svg.setAttribute('viewBox', `0 0 ${cw} ${ch}`);
  const gx = i => (i / (N - 1)) * cw;
  const barW = cw / N;
  const gyP = p => (1 - (Math.log(p) - Math.log(pMin)) / (Math.log(pMax) - Math.log(pMin))) * ch;

  let bands = '';
  series.forEach((d, i) => {
    const c = erColorForScore(d.score);
    if (c) bands += `<rect x="${(gx(i) - barW / 2).toFixed(1)}" y="0" width="${(barW + 0.5).toFixed(1)}" height="${ch}" fill="${c}" opacity="0.85"/>`;
  });

  const yTicks = [pMin, Math.sqrt(pMin * pMax), pMax];
  let gridY = '';
  yTicks.forEach(p => {
    gridY += `<line x1="0" y1="${gyP(p).toFixed(1)}" x2="${cw}" y2="${gyP(p).toFixed(1)}" stroke="#f0f0f2" stroke-width="1"/>`;
  });

  const ticks = erPickYearTicks(series, cw, 42);
  let gridX = '';
  ticks.forEach(t => {
    gridX += `<line x1="${t.x.toFixed(1)}" y1="0" x2="${t.x.toFixed(1)}" y2="${ch}" stroke="#f0f0f2" stroke-width="1" stroke-dasharray="2,2"/>`;
  });

  let pricePath = '';
  series.forEach((d, i) => { pricePath += `${i === 0 ? 'M' : 'L'}${gx(i).toFixed(1)},${gyP(d.price).toFixed(1)} `; });

  const lastX = gx(N - 1), lastY = gyP(series[N - 1].price);

  const zh = typeof currentLang !== 'undefined' ? currentLang === 'zh' : true;
  let annotation = '';
  if (stats.longestEpisode) {
    const a = series.findIndex(d => d.week === stats.longestEpisode.start);
    const b = series.findIndex(d => d.week === stats.longestEpisode.end);
    if (a >= 0 && b >= 0) {
      const mid = Math.round((a + b) / 2);
      const label = stats.longestEpisode.weeks + (zh ? '週' : 'w');
      annotation = `
        <line x1="${gx(a).toFixed(1)}" y1="3" x2="${gx(b).toFixed(1)}" y2="3" stroke="#1d1d1f" stroke-width="1.2"/>
        <text x="${gx(mid).toFixed(1)}" y="15" text-anchor="middle" font-size="11" font-weight="650" fill="#1d1d1f">${label}</text>`;
    }
  }

  svg.innerHTML = `${bands}${gridY}${gridX}
    <path d="${pricePath}" fill="none" stroke="#3a3a3c" stroke-width="1.6" opacity="0.55"/>
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3.5" fill="#3a3a3c"/>
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="6" fill="none" stroke="#3a3a3c" stroke-width="1" opacity="0.4"/>
    ${annotation}`;

  erPlaceLabels(plot, yTicks.map(p => ({ side: 'left', text: '$' + Math.round(p), top: PADT + gyP(p) })));
  if (xrow) erPlaceXLabels(xrow, ticks, PADL);

  // 摘要卡的成長迷你走勢圖(跟主圖用同一份資料)
  // 改版前是用 querySelector('[id^="er-growth-spark-"]') 抓「全文件第一個」,
  // 一次只展開一張卡時剛好沒事,但那是巧合。改成用ticker精準指定。
  const ticker = svgId.replace('er-main-', '');
  const spark = document.getElementById('er-growth-spark-' + ticker);
  if (spark) {
    const minV = pMin, maxV = pMax, range = (maxV - minV) || 1;
    const gW = 120, gH = 40;
    const tx = i => (i / (prices.length - 1)) * gW;
    const ty = v => gH - ((v - minV) / range) * gH;
    const line = prices.map((v, i) => `${i === 0 ? 'M' : 'L'}${tx(i).toFixed(1)},${ty(v).toFixed(1)}`).join(' ');
    const color = prices[prices.length - 1] >= prices[0] ? '#7dd3a0' : '#e08a7a';
    spark.innerHTML = `
      <path d="${line} L${gW},${gH} L0,${gH} Z" fill="${color}" opacity="0.5"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="1.5"/>`;
  }
}
