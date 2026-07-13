// ============================================================
// backtest.js — 歷史回測模組
// 從 index.html 拆分而出(round46 架構瘦身,第三批),邏輯逐行原樣搬移,未做任何修改。
// 依賴:score engine 的 calculateRSI/calculateMA 等純函式(定義於index.html)
// ============================================================

// ── BACKTEST ──
let btData = {};

async function fetchBTData(ticker, maxYears) {
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=max&interval=1mo`;
  const url = `${PROXY}?url=${encodeURIComponent(yahooUrl)}`;
  const r = await fetch(url);
  const data = await r.json();
  if(!data.chart?.result?.[0]) throw new Error('No data for ' + ticker);
  const result = data.chart.result[0];

  const closes = result.indicators.quote[0].close;
  const timestamps = result.timestamp;
  const rawPrices = [], rawDates = [], rawTs = [];
  closes.forEach((c,i) => {
    if(c!=null&&c>0) {
      rawPrices.push(c);
      const d = new Date(timestamps[i]*1000);
      rawDates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
      rawTs.push(timestamps[i]);
    }
  });

  // Detect granularity from actual timestamp gaps
  let monthsPerBar = 1;
  if(rawTs.length >= 2) {
    const avgGapDays = (rawTs[rawTs.length-1] - rawTs[0]) / (rawTs.length - 1) / 86400;
    if(avgGapDays > 60) monthsPerBar = 3;       // quarterly bars
  }

  let prices = [], dates = [];
  if(monthsPerBar === 3) {
    // Expand 3mo bars into 3 monthly entries
    rawPrices.forEach((price, i) => {
      const [y, m] = rawDates[i].split('-').map(Number);
      for(let offset = 0; offset < 3; offset++) {
        const month = m + offset;
        const year = y + Math.floor((month - 1) / 12);
        const mo = ((month - 1) % 12) + 1;
        dates.push(`${year}-${String(mo).padStart(2,'0')}`);
        prices.push(price);
      }
    });
  } else {
    // Aggregate to one entry per month (handles daily/weekly data: keep last price of each month)
    const monthMap = new Map();
    rawDates.forEach((d, i) => { monthMap.set(d, rawPrices[i]); }); // later entries overwrite → last price wins
    dates = [...monthMap.keys()].sort();
    prices = dates.map(d => monthMap.get(d));
  }

  // Return full data — always one entry per month
  return { prices, dates, monthsPerBar: 1 };
}

// 用我們的公式跑回測（每個月計算指標，決定倍數）
function runSmartDCA(prices, budget, monthsPerBar = 1) {
  let shares = 0, totalInvested = 0;
  let triggeredMonths = 0;
  let totalMult = 0;
  const vals = [];
  const rsiHistory = [];

  for(let i = 0; i < prices.length; i++) {
    const price = prices[i];

    // 計算RSI
    const rsiSlice = prices.slice(Math.max(0, i-14), i+1);
    const rsi = calculateRSI(rsiSlice, Math.min(14, rsiSlice.length-1));

    // 計算P_RSI
    const prsi = rsiHistory.length > 0
      ? rsiHistory.filter(r => r <= rsi).length / rsiHistory.length
      : 0.5;
    rsiHistory.push(rsi);

    // 計算回撤（距12個月高點）
    const high12 = Math.max(...prices.slice(Math.max(0, i-12), i+1));
    const dd = (price - high12) / high12 * 100;

    // VIX：回測時沒有歷史VIX，用RSI和回撤近似
    // 當RSI很低+回撤很深時，估算VIX偏高
    const estimatedVix = dd < -20 && prsi < 0.2 ? 45 : dd < -10 && prsi < 0.35 ? 28 : 18;

    // 套用我們的倍數公式
    const mult = calcBaseMultiplier(prsi, dd, estimatedVix);

    // 觸發條件
    const triggered = dd <= -15 && prsi <= 0.4;
    const blackSwan = dd <= -20 && estimatedVix >= 40;
    const finalMult = (triggered || blackSwan) ? mult : 1.0;

    const invest = budget * monthsPerBar * finalMult;
    shares += invest / price;
    totalInvested += invest; // 實際投入（含加碼，已乘 monthsPerBar）
    if(triggered || blackSwan) triggeredMonths++;
    totalMult += finalMult;

    vals.push(+(shares * price).toFixed(0));
  }

  const finalPrice = prices[prices.length-1];
  const finalVal = shares * finalPrice;
  const roi = ((finalVal - totalInvested) / totalInvested) * 100;
  const avgMult = (totalMult / prices.length).toFixed(2);

  return { finalVal, totalInvested, roi, vals, triggeredMonths, avgMult };
}

function updateBTLabels(zh, r1, r2, ticker, benchmark) {
  const pLabel = $('btPeriodLabel');
  if(pLabel) pLabel.textContent = zh ? '回測期間' : 'Period';
  const tLabel = $('btTriggeredLabel');
  if(tLabel) tLabel.textContent = zh ? '觸發加碼月數' : 'Triggered Months';

  // Format date: "2021-01" → "Jan 2021"
  function fmtDate(d) {
    if(!d) return '—';
    const [y,m] = d.split('-');
    const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${mNames[parseInt(m)-1]} ${y}`;
  }

  // Period: "Jan 2021 → Jun 2025 (4.5 yrs)"
  const ds = btData._dateStart, de = btData._dateEnd, tm = btData._totalMonths;
  const yrsRaw2 = parseFloat(btData._totalYears || (tm / 12).toFixed(1));
  const yrs = yrsRaw2 % 1 === 0 ? Math.round(yrsRaw2).toString() : yrsRaw2.toFixed(1);
  const maxYears = parseInt($('btYears')?.value) || 0;
  if(ds && de) {
    $('btPeriod').textContent = zh
      ? `${fmtDate(ds)} — ${fmtDate(de)}（${yrs} 年）`
      : `${fmtDate(ds)} — ${fmtDate(de)} (${yrs} yrs)`;
  }
  // Show note if actual data is shorter than selected period
  const btPeriodWarn = $('btPeriodWarn');
  const btPeriodTooltip = $('btPeriodTooltip');
  if(btPeriodWarn && btPeriodTooltip) {
    const actualYrs = parseFloat(yrs);
    if(maxYears > 0 && actualYrs < maxYears * 0.95) {
      btPeriodWarn.style.display = 'inline-flex';
      btPeriodTooltip.textContent = zh
        ? `數據最早可追溯至 ${fmtDate(ds)}，已自動調整為實際可用區間（${yrs} 年）`
        : `Data available from ${fmtDate(ds)} only — period adjusted to actual available data (${yrs} yrs)`;
    } else {
      btPeriodWarn.style.display = 'none';
    }
  }

  // Triggered months
  if(tm) {
    $('btTriggered').textContent = zh
      ? `${r1.triggeredMonths} 個月（共 ${tm} 個月）`
      : `${r1.triggeredMonths} of ${tm} months`;
  }



  // ── Rich analysis summary ──
  const diff = r1.roi - r2.roi;
  const yrsRaw = parseFloat(btData._totalYears || (tm ? (tm/12).toFixed(1) : '0'));
  const yrsLabel = yrsRaw % 1 === 0 ? Math.round(yrsRaw).toString() : yrsRaw.toFixed(1);
  const mpb = btData._monthsPerBar || 1;
  const triggeredDisplay = r1.triggeredMonths * mpb;
  const triggerRate = tm ? Math.round(tm / Math.max(triggeredDisplay, 1)) : 0;

  // Analyse vals to find crossover and divergence points
  const v1 = btData.vals1 || [];
  const v2 = btData.vals2 || [];
  const dates = btData.chartDates || [];
  let crossoverDate = null, maxDivYear = null, maxDivRatio = 0;
  let t1LeadFrom = null;
  for(let i = 1; i < v1.length && i < v2.length; i++) {
    if(v1[i] > 0 && v2[i] > 0) {
      const ratio = v1[i] / v2[i];
      if(ratio > maxDivRatio) { maxDivRatio = ratio; maxDivYear = dates[i] ? dates[i].split('-')[0] : null; }
      // First time ticker pulls ahead of benchmark
      if(!t1LeadFrom && v1[i] > v2[i] && v1[i-1] <= v2[i-1]) t1LeadFrom = dates[i] ? dates[i].split('-')[0] : null;
      // Crossover: benchmark catches up to ticker
      if(t1LeadFrom && !crossoverDate && v2[i] > v1[i] && v2[i-1] <= v1[i-1]) crossoverDate = dates[i] ? dates[i].split('-')[0] : null;
    }
  }

  // Detect known black swan years in range
  const startYr = ds ? parseInt(ds.split('-')[0]) : 0;
  const endYr = de ? parseInt(de.split('-')[0]) : 9999;
  const blackSwans = [
    {yr:2001, en:'the dot-com crash (2001)', zh:'科技泡沫崩盤（2001）'},
    {yr:2008, en:'the 2008 financial crisis', zh:'2008年金融海嘯'},
    {yr:2020, en:'the COVID-19 crash (2020)', zh:'2020年新冠疫情崩盤'},
    {yr:2022, en:'the 2022 rate hike selloff', zh:'2022年暴力升息賣壓'},
  ].filter(b => b.yr >= startYr && b.yr <= endYr);
  const bsText = blackSwans.length > 0
    ? (zh ? '期間歷經' + blackSwans.map(b=>b.zh).join('、') + '等重大考驗，' : 'The period included ' + blackSwans.map(b=>b.en).join(', ') + '. ')
    : '';

  const winner = r1.roi > r2.roi ? ticker : benchmark;
  const loser  = r1.roi > r2.roi ? benchmark : ticker;
  const variant = Math.floor(Date.now() / 60000) % 3; // rotates every minute

  let text = '';
  if(zh) {
    const leadStr = t1LeadFrom ? `大約從 ${t1LeadFrom} 年起，${ticker} 開始明顯領先。` : '';
    const divStr  = maxDivYear && maxDivRatio > 1.5 ? `兩者差距在 ${maxDivYear} 年前後達到高峰。` : '';
    const crossStr = crossoverDate ? `值得注意的是，${benchmark} 曾在 ${crossoverDate} 年短暫追上 ${ticker}。` : '';
    if(variant === 0) {
      text = `在這 ${yrsLabel} 年的回測區間裡，${ticker} 透過智能定投累積了 ${r1.roi.toFixed(1)}% 的總報酬，最終資產成長至 ${fmt(r1.finalVal)}；相比之下，${benchmark} 同期報酬為 ${r2.roi.toFixed(1)}%，期末價值 ${fmt(r2.finalVal)}。${bsText}${leadStr}${divStr}${crossStr}智能定投公式在 ${tm} 個月中觸發了 ${triggeredDisplay} 次加碼訊號，平均每 ${triggerRate} 個月出現一次買入機會，平均加碼倍數 ×${r1.avgMult}。長期持續買入加上適時加碼，正是讓複利效果最大化的關鍵。`;
    } else if(variant === 1) {
      text = `把時間拉長到 ${yrsLabel} 年來看，${winner} 的智能定投策略表現更為突出，總報酬達 ${r1.roi > r2.roi ? r1.roi.toFixed(1) : r2.roi.toFixed(1)}%，明顯優於 ${loser} 的 ${r1.roi > r2.roi ? r2.roi.toFixed(1) : r1.roi.toFixed(1)}%。${bsText}在市場動盪時期，定投策略能夠自動在低點積累更多單位，這正是 DCA 相較於一次性投入的核心優勢。我們的 AI 公式在這段期間共觸發 ${triggeredDisplay} 次加碼，利用市場恐慌創造了額外的複利空間。`;
    } else {
      text = `如果 ${yrsLabel} 年前你每個月固定投入，並且在市場訊號出現時適時加碼，結果會是什麼？${ticker} 的智能定投答案是：${fmt(r1.finalVal)}，總報酬 ${r1.roi.toFixed(1)}%。${benchmark} 同期則為 ${fmt(r2.finalVal)}，報酬 ${r2.roi.toFixed(1)}%。${bsText}AI 公式共判斷出 ${triggeredDisplay} 個加碼時機，平均每 ${triggerRate} 個月一次。這些加碼的時間點，往往正是大多數人因為恐懼而想停止投入的時刻。`;
    }
  } else {
    const leadStr = t1LeadFrom ? `Around ${t1LeadFrom}, ${ticker} began pulling meaningfully ahead. ` : '';
    const divStr  = maxDivYear && maxDivRatio > 1.5 ? `The performance gap peaked around ${maxDivYear}. ` : '';
    const crossStr = crossoverDate ? `Notably, ${benchmark} briefly caught up to ${ticker} around ${crossoverDate}. ` : '';
    if(variant === 0) {
      text = `Over ${yrsLabel} years of Smart DCA, ${ticker} compounded to a ${r1.roi.toFixed(1)}% return — growing a monthly ${fmt(btData._budget||0)} investment into ${fmt(r1.finalVal)}. ${benchmark} returned ${r2.roi.toFixed(1)}% over the same period, finishing at ${fmt(r2.finalVal)}. ${bsText}${leadStr}${divStr}${crossStr}The AI formula triggered ${triggeredDisplay} add-on signals across ${tm} months — roughly one opportunity every ${triggerRate} months — at an average multiplier of ×${r1.avgMult}. Staying consistent through every downturn, and adding more when others panicked, is what separates long-term DCA from average investing.`;
    } else if(variant === 1) {
      text = `Stretched over ${yrsLabel} years, the difference between ${ticker} and ${benchmark} tells a compelling story about compounding and patience. ${ticker} delivered ${r1.roi.toFixed(1)}% versus ${benchmark}'s ${r2.roi.toFixed(1)}% — a gap of ${diff>=0?'+':''}${diff.toFixed(1)} percentage points. ${bsText}${leadStr}Our formula identified ${triggeredDisplay} moments to add more over this period, leaning into market weakness rather than running from it. The average add-on multiplier was ×${r1.avgMult}, meaning each signal nudged the portfolio meaningfully ahead.`;
    } else {
      text = `What if you had invested ${fmt(btData._budget||0)} every month for ${yrsLabel} years — and added more whenever our AI said the moment was right? For ${ticker}, the answer is ${fmt(r1.finalVal)}, a ${r1.roi.toFixed(1)}% total return. ${benchmark} reached ${fmt(r2.finalVal)}, returning ${r2.roi.toFixed(1)}%. ${bsText}${divStr}The formula found ${triggeredDisplay} high-conviction entry points across the period — one every ${triggerRate} months on average. These are the moments most investors hesitate. The data suggests that's exactly when you should act.`;
    }
  }
  // Trophy: show on winner card
  const t1 = $('btTrophy1'), t2 = $('btTrophy2');
  const c1 = $('btCard1'),   c2 = $('btCard2');
  if(c1 && c2) {
    if(r1.roi >= r2.roi) {
      c1.style.border = '2.5px solid #b8732a';
      c1.style.boxShadow = '0 0 0 1px rgba(200,129,58,0.3)';
      c2.style.border = '1.5px solid var(--border)';
      c2.style.boxShadow = 'none';
    } else {
      c2.style.border = '2.5px solid #b8732a';
      c2.style.boxShadow = '0 0 0 1px rgba(200,129,58,0.3)';
      c1.style.border = '1.5px solid #a8d8bb';
      c1.style.boxShadow = 'none';
    }
  }

  // Conclusion sentence
  const winnerName = r1.roi >= r2.roi ? ticker : benchmark;
  const loserName  = r1.roi >= r2.roi ? benchmark : ticker;
  const winROI     = r1.roi >= r2.roi ? r1.roi : r2.roi;
  const loseROI    = r1.roi >= r2.roi ? r2.roi : r1.roi;
  const roiGap     = Math.abs(winROI - loseROI);
  const conclusion = zh
    ? `<br><br><strong>結論：</strong>在這段 ${yrsLabel} 年的回測區間內，${winnerName} 是更強的長期定投資產，總報酬領先 ${loserName} 達 ${roiGap.toFixed(1)} 個百分點。當然，過去表現不代表未來，但這樣的數據差距值得在做定投選擇時納入參考。`
    : `<br><br><strong>Bottom line:</strong> Over this ${yrsLabel}-year window, ${winnerName} was the stronger long-term DCA candidate — outperforming ${loserName} by ${roiGap.toFixed(1)} percentage points. Past performance doesn't guarantee future results, but a gap this size is worth weighing when deciding where to direct your monthly investment.`;

  $('btSummary').innerHTML = text + conclusion;

  // Legend + subtitles for both charts
  const roi1Str = (r1.roi>=0?'+':'') + r1.roi.toFixed(1) + '%';
  const roi2Str = (r2.roi>=0?'+':'') + r2.roi.toFixed(1) + '%';
  const rF1 = btData._rFull1, rF2 = btData._rFull2;
  const roiF1Str = rF1 ? (rF1.roi>=0?'+':'') + rF1.roi.toFixed(1) + '%' : roi1Str;
  const roiF2Str = rF2 ? (rF2.roi>=0?'+':'') + rF2.roi.toFixed(1) + '%' : roi2Str;

  // Chart 1 legends
  const setEl = (id, txt) => { const e=$(id); if(e) e.textContent=txt; };
  setEl('btLegend1a', ticker);
  setEl('btLegend2a', benchmark);
  const lb = btData._limitedBy;
  const c1range = ds && de ? `${fmtDate(ds)} — ${fmtDate(de)}` : '';
  setEl('btChart1Range', c1range);

  // Chart 2 legends
  const fd1 = btData.fullDates1, fd2 = btData.fullDates2;
  const fd1s = fd1?.[0], fd1e = fd1?.[fd1.length-1];
  const fd2s = fd2?.[0], fd2e = fd2?.[fd2.length-1];
  const yr1 = fd1s ? fmtDate(fd1s) : '';
  const yr2 = fd2s ? fmtDate(fd2s) : '';
  setEl('btLegend1b', ticker);
  setEl('btLegend2b', benchmark);
  const allStart = fd1s && fd2s ? (fd1s < fd2s ? fd1s : fd2s) : (fd1s||fd2s);
  const allEnd   = fd1e && fd2e ? (fd1e > fd2e ? fd1e : fd2e) : (fd1e||fd2e);
  setEl('btChart2Range', allStart && allEnd ? `${fmtDate(allStart)} — ${fmtDate(allEnd)}` : '');

  // ROI box titles
  setEl('btTickerLabel', ticker);
  setEl('btBenchLabel', benchmark);
}

async function runBacktest() {
  $('btTicker').value = $('btTicker').value.replace(/[^A-Za-z0-9.-]/g,'').toUpperCase();
  $('btBenchmark').value = acNormalizeDelims($('btBenchmark').value).replace(/[^A-Za-z0-9.,\s-]/g,'').toUpperCase();
  const ticker = $('btTicker').value.trim();
  const budget = parseFloat($('btBudget').value) || 500;
  const maxYears = parseInt($('btYears').value) || 0;
  const zh = currentLang === 'zh';

  if(!ticker) { alert(zh?'請輸入股票代號':'Please enter a ticker'); return; }

  // round40新增:對比資產欄位改吃逗號分隔多代碼(最多5個),自動排名取表現最佳者當benchmark。
  const MAX_BT_CANDIDATES = 5;
  let btCandidates = $('btBenchmark').value.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
  btCandidates = [...new Set(btCandidates)];
  if(!btCandidates.length) btCandidates = ['SPY'];
  if(btCandidates.length > MAX_BT_CANDIDATES) btCandidates = btCandidates.slice(0, MAX_BT_CANDIDATES);

  const btn = $('btnRunBT');
  btn.disabled = true;
  btn.innerHTML = `<span class="spin" style="border-top-color:var(--ink);border-color:rgba(0,0,0,.15);"></span>${zh?'計算中…':'Running…'}`;
  $('btResult').style.display = 'none';
  const excludedNote = $('btExcludedNote');
  if(excludedNote) { excludedNote.style.display = 'none'; excludedNote.textContent = ''; }
  const winnerBadge = $('btWinnerBadge');
  if(winnerBadge) { winnerBadge.style.display = 'none'; winnerBadge.textContent = ''; }

  try {
    const t1 = await fetchBTData(ticker, maxYears);
    const t1DateSet = new Set(t1.dates);

    // 平行抓全部候選,單一候選失敗(查無資料/代碼錯誤)不會拖垮其他候選
    const settled = await Promise.allSettled(btCandidates.map(c => fetchBTData(c, maxYears)));

    const survivors = [];   // { ticker, data }
    const excludedList = []; // { ticker, reason: 'fetch' | 'short' }
    settled.forEach((res, i) => {
      const cTicker = btCandidates[i];
      if(res.status !== 'fulfilled') { excludedList.push({ ticker: cTicker, reason: 'fetch' }); return; }
      const overlapMonths = res.value.dates.filter(d => t1DateSet.has(d)).length;
      if(overlapMonths < 12) { excludedList.push({ ticker: cTicker, reason: 'short' }); return; }
      survivors.push({ ticker: cTicker, data: res.value });
    });

    if(!survivors.length) {
      throw new Error(zh
        ? '所有對比代碼都因歷史數據不足被排除，請更換候選。'
        : 'All comparison tickers were excluded due to insufficient history. Please try different tickers.');
    }

    // ── 排名階段:用「你的資產 + 全部存活候選」的最嚴格(最短)共同期間,確保公平比較 ──
    let winner;
    if(survivors.length === 1) {
      winner = survivors[0];
    } else {
      let rankDates = t1.dates.filter(d => survivors.every(s => s.data.dates.includes(d))).sort();
      if(maxYears && maxYears > 0 && rankDates.length) {
        const lastCommon = rankDates[rankDates.length - 1];
        const [ly, lm] = lastCommon.split('-').map(Number);
        const cutoff = `${ly - maxYears}-${String(lm).padStart(2,'0')}`;
        const idx = rankDates.findIndex(d => d >= cutoff);
        rankDates = idx >= 0 ? rankDates.slice(idx + 1) : rankDates;
      }
      let bestRoi = -Infinity;
      survivors.forEach(s => {
        const sMap = new Map();
        s.data.dates.forEach((d, i) => sMap.set(d, s.data.prices[i]));
        const alignedPrices = rankDates.map(d => sMap.get(d));
        const r = runSmartDCA(alignedPrices, budget, 1);
        if(r.roi > bestRoi) { bestRoi = r.roi; winner = s; }
      });
    }

    const benchmark = winner.ticker;

    // 排名結果的UI說明:被排除的候選 + 贏家標籤(候選只有1個時不用顯示「勝出」徽章)
    if(excludedNote && excludedList.length) {
      const lines = excludedList.map(e => {
        const reasonTxt = e.reason === 'short'
          ? (zh ? '與你的資產共同歷史不足 1 年' : 'less than 1 year of common history with your asset')
          : (zh ? '查無資料' : 'no data found');
        return zh ? `已排除：${e.ticker}（${reasonTxt}）` : `Excluded: ${e.ticker} (${reasonTxt})`;
      });
      excludedNote.textContent = lines.join('　');
      excludedNote.style.display = 'block';
    }
    if(winnerBadge && btCandidates.length > 1) {
      winnerBadge.textContent = zh ? `從 ${btCandidates.length} 個對比中勝出` : `Won against ${btCandidates.length} comparisons`;
      winnerBadge.style.display = 'inline-block';
    }

    // ── 以下沿用原本邏輯:「你的資產」vs「贏家」兩方交集,不受其他已淘汰候選拖累共同期間 ──
    const t2 = winner.data;
    const map1 = new Map();
    t1.dates.forEach((d, i) => map1.set(d, t1.prices[i]));
    const map2 = new Map();
    t2.dates.forEach((d, i) => map2.set(d, t2.prices[i]));

    // Dates present in BOTH tickers, sorted chronologically
    const commonDates = t1.dates.filter(d => map2.has(d)).sort();
    if(commonDates.length < 6) {
      throw new Error(zh
        ? `${ticker} 上市時間太短（僅 ${commonDates.length} 個月共同數據），無法進行有意義的回測。請選擇上市超過半年的資產。`
        : `${ticker} has too little history (only ${commonDates.length} months of common data) for a meaningful backtest. Please choose a ticker listed for at least 6 months.`);
    }

    // Apply maxYears cap from the most recent common date
    const lastCommon = commonDates[commonDates.length - 1];
    let startIdx = 0;
    if(maxYears && maxYears > 0) {
      const [ly, lm] = lastCommon.split('-').map(Number);
      const cutoff = `${ly - maxYears}-${String(lm).padStart(2,'0')}`;
      const idx = commonDates.findIndex(d => d >= cutoff);
      // round40修正:原本用>=cutoff找到的月份跟最後一個月「頭尾都算」,1年會變13個月、
      // 5年變61個月...一律多算一個月。往後推一格排除掉這個重複的起始邊界月份,
      // 讓N年正確對應N*12個月。
      startIdx = idx >= 0 ? idx + 1 : 0;
    }
    const usedDates = commonDates.slice(startIdx);

    // Perfectly aligned arrays — same dates, same length, same order
    const prices1    = usedDates.map(d => map1.get(d));
    const prices2    = usedDates.map(d => map2.get(d));
    const chartDates = usedDates;
    const monthsPerBar = 1;
    const dateStart  = chartDates[0];
    const dateEnd    = chartDates[chartDates.length - 1];
    const [sy, sm]   = dateStart.split('-').map(Number);
    const [ey, em]   = dateEnd.split('-').map(Number);
    const totalMonths = (ey - sy) * 12 + (em - sm) + 1;
    const totalYears  = (totalMonths / 12).toFixed(1);
    const limitedBy   = t1.dates.length <= t2.dates.length ? ticker : benchmark;

    const r1 = runSmartDCA(prices1, budget, 1);
    const r2 = runSmartDCA(prices2, budget, 1);

    // Format date for display: "2021-01" → "Jan 2021"
    function fmtDate(d) {
      const [y,m] = d.split('-');
      const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${mNames[parseInt(m)-1]} ${y}`;
    }

    // Store for lang re-render
    btData._ticker = ticker;
    btData._benchmark = benchmark || 'SPY';
    btData._r1 = r1;
    btData._r2 = r2;
    btData._budget = budget;
    btData._dateStart = dateStart;
    btData._dateEnd = dateEnd;
    btData._totalMonths = totalMonths;
    btData._totalYears = totalYears;
    btData._monthsPerBar = monthsPerBar;
    btData._limitedBy = limitedBy;
    btData.tickerPrices = prices1;
    btData.chartDates = chartDates;
    btData.vals1 = r1.vals;
    btData.vals2 = r2.vals;

    // ── Full history (chart 2): each ticker runs its own max data ──
    const rFull1 = runSmartDCA(t1.prices, budget, 1);
    const rFull2 = runSmartDCA(t2.prices, budget, 1);
    btData.fullVals1  = rFull1.vals;
    btData.fullVals2  = rFull2.vals;
    btData.fullDates1 = t1.dates;
    btData.fullDates2 = t2.dates;
    btData._rFull1 = rFull1;
    btData._rFull2 = rFull2;

    // ── Helper: reset logo container and load fresh ──
    function resetLogo(containerId, imgId, ticker) {
      const container = $(containerId);
      if(!container) return;
      // Fully rebuild content to avoid stale img/onerror issues
      container.innerHTML = `<img id="${imgId}" style="width:100%;height:100%;object-fit:contain;padding:2px;">`;
      const img = $(imgId);
      const url = getLogoUrl(ticker);
      if(url) {
        img.src = url;
      } else {
        autoLookupLogo(ticker, img);
        return;
      }
      img.onerror = () => autoLookupLogo(ticker, img);
    }

    // Display logos
    resetLogo('btLogo1', 'btLogoImg1', ticker);
    resetLogo('btLogo2', 'btLogoImg2', benchmark);
    resetLogo('btLegendLogo1a', 'btLegendLogoImg1a', ticker);
    resetLogo('btLegendLogo2a', 'btLegendLogoImg2a', benchmark);
    resetLogo('btLegendLogo1b', 'btLegendLogoImg1b', ticker);
    resetLogo('btLegendLogo2b', 'btLegendLogoImg2b', benchmark);
    $('btTickerLabel').textContent = ticker;
    $('btBenchLabel').textContent = benchmark;

    const roi1pct = (r1.roi>=0?'+':'') + r1.roi.toFixed(1) + '%';
    const roi2pct = (r2.roi>=0?'+':'') + r2.roi.toFixed(1) + '%';
    $('btROI1').textContent = roi1pct;
    $('btROI1').style.color = r1.roi >= r2.roi ? 'var(--ink)' : 'var(--ink2)';
    $('btVal1').textContent = fmt(r1.finalVal);
    $('btROI2').textContent = roi2pct;
    $('btROI2').style.color = r2.roi > r1.roi ? 'var(--ink)' : 'var(--ink2)';
    $('btVal2').textContent = fmt(r2.finalVal);

    // Winner: bold border only
    const c1 = $('btCard1'), c2 = $('btCard2');
    if(c1 && c2) {
      if(r1.roi >= r2.roi) {
        c1.style.border = '2px solid var(--ink)';
        c2.style.border = '1.5px solid var(--border)';
      } else {
        c2.style.border = '2px solid var(--ink)';
        c1.style.border = '1.5px solid var(--border)';
      }
    }

    $('btInvested').textContent = fmt(r1.totalInvested);

    updateBTLabels(zh, r1, r2, ticker, benchmark);

    $('btResult').style.display = 'block';
    drawBTCharts();
    setTimeout(() => { scrollToWithNavOffset($('btResult')); }, 300);

  } catch(e) {
    alert((zh?'回測錯誤：':'Backtest error: ') + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span id="t-btrun">${T[currentLang].btrun}</span>`;
  }
}

function drawBTCharts() {
  drawOneChart({
    canvasId: 'btChart1',
    vals1: btData.vals1,
    vals2: btData.vals2,
    dates1: btData.chartDates,
    dates2: btData.chartDates,  // same aligned dates for both lines
    sameStart: true,
  });
  drawOneChart({
    canvasId: 'btChart2',
    vals1: btData.fullVals1,
    vals2: btData.fullVals2,
    dates1: btData.fullDates1,
    dates2: btData.fullDates2,
    sameStart: false,
  });
}

// Generic chart renderer used for both chart 1 and chart 2
function drawOneChart({ canvasId, vals1, vals2, dates1, dates2, sameStart }) {
  const canvas = $(canvasId);
  if(!canvas || !vals1?.length || !vals2?.length) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.offsetWidth, h = canvas.offsetHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const padL = 42, padR = 14, padT = 50, padB = 32;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  // For chart 2 (different start dates), we map each line to a shared X axis
  // spanning the full combined date range, leaving gaps where a line has no data.
  let xDates; // master date list for X axis
  if(sameStart) {
    xDates = dates1 || [];
  } else {
    // Build union of dates sorted chronologically
    const allDatesSet = new Set([...(dates1||[]), ...(dates2||[])]);
    xDates = [...allDatesSet].sort();
  }
  const n = xDates.length;
  if(n < 2) return;

  // Map each val series onto xDates indices
  function mapVals(vals, dates) {
    if(!vals || !dates) return new Array(n).fill(null);
    const result = new Array(n).fill(null);
    dates.forEach((d, i) => {
      const xi = xDates.indexOf(d);
      if(xi >= 0) result[xi] = vals[i] ?? null;
    });
    return result;
  }
  const mapped1raw = sameStart ? vals1 : mapVals(vals1, dates1);
  const mapped2raw = sameStart ? vals2 : mapVals(vals2, dates2);

  // ── Convert to growth multiple (1.0x = starting value) so both lines stay visible ──
  function toMultiple(mapped) {
    const first = mapped.find(v => v != null);
    if(!first) return mapped;
    return mapped.map(v => v == null ? null : v / first);
  }
  const mapped1 = toMultiple(mapped1raw);
  const mapped2 = toMultiple(mapped2raw);

  const allVals = [...mapped1, ...mapped2].filter(v => v != null && v > 0);
  if(!allVals.length) return;
  const minV = Math.max(0.1, Math.min(...allVals));
  const maxV = Math.max(...allVals);

  // Log scale so both lines stay visible even with 100x differences
  const logMin = Math.log10(minV), logMax = Math.log10(Math.max(maxV, minV * 2));
  const logRange = logMax - logMin || 1;

  const gx = i => padL + (i / (n - 1)) * chartW;
  const gy = v => v > 0 ? padT + (1 - (Math.log10(v) - logMin) / logRange) * chartH : padT + chartH;

  // ── Grid lines (horizontal) ──
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
  for(let i = 0; i <= 4; i++) {
    const y = padT + (i / 4) * chartH;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
  }

  // ── Y-axis labels (log scale) ──
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.font = `9px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = 'right';
  // Pick a few nice round log values to label
  const logTicks = [];
  for(let p = Math.floor(logMin); p <= Math.ceil(logMax); p++) {
    [1, 2, 5].forEach(m => {
      const v = m * Math.pow(10, p);
      if(v >= minV * 0.9 && v <= maxV * 1.1) logTicks.push(v);
    });
  }
  logTicks.slice(0, 5).forEach(v => {
    const y = gy(v);
    if(y < padT || y > padT + chartH) return;
    const label = v >= 100 ? `${Math.round(v)}x` : v >= 10 ? `${v.toFixed(0)}x` : `${v.toFixed(1)}x`;
    ctx.fillText(label, padL - 3, y + 3);
  });

  // ── X-axis: only show first and last year ──
  const yearMarks = [];
  let lastYr = '';
  xDates.forEach((d, i) => {
    const yr = d.split('-')[0];
    if(yr !== lastYr) { yearMarks.push({ yr, i }); lastYr = yr; }
  });
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.font = `10px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = 'center';
  // Only draw first and last
  [yearMarks[0], yearMarks[yearMarks.length-1]].forEach(mark => {
    if(!mark) return;
    const x = gx(mark.i);
    ctx.fillText("'" + mark.yr.slice(2), x, h - 8);
  });

  // ── Draw line helper — all solid ──
  function drawLine(mapped, color, lineWidth) {
    ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
    ctx.setLineDash([]);
    ctx.beginPath();
    let started = false;
    mapped.forEach((v, i) => {
      if(v == null) { started = false; return; }
      if(!started) { ctx.moveTo(gx(i), gy(v)); started = true; }
      else ctx.lineTo(gx(i), gy(v));
    });
    ctx.stroke();
  }

  // ── End-point dot + floating final value label ──
  function drawEndLabel(mapped, color, valStr) {
    let lastI = -1, lastV = null;
    mapped.forEach((v, i) => { if(v != null) { lastI = i; lastV = v; } });
    if(lastI < 0) return;
    const x = gx(lastI), y = gy(lastV);
    // Dot
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    // Label
    ctx.font = `bold 11px -apple-system, BlinkMacSystemFont, sans-serif`;
    const tw = ctx.measureText(valStr).width;
    const bx = Math.min(x + 8, w - padR - tw - 10);
    const by = Math.max(y - 8, padT + 16);
    const bpad = 5;
    ctx.fillStyle = color;
    if(ctx.roundRect) {
      ctx.beginPath(); ctx.roundRect(bx - bpad, by - 13, tw + bpad*2, 17, 3); ctx.fill();
    } else {
      ctx.fillRect(bx - bpad, by - 13, tw + bpad*2, 17);
    }
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(valStr, bx, by);
  }

  // ── Draw the two lines ──
  const r1 = btData._r1, r2 = btData._r2;
  const rF1 = btData._rFull1, rF2 = btData._rFull2;
  // End labels: always use the data that matches what's plotted
  const val1 = sameStart ? (r1?.finalVal||0) : (rF1?.finalVal||0);
  const val2 = sameStart ? (r2?.finalVal||0) : (rF2?.finalVal||0);
  const roi1 = sameStart ? (r1?.roi||0) : (rF1?.roi||0);
  const roi2 = sameStart ? (r2?.roi||0) : (rF2?.roi||0);

  // ticker2 (benchmark) slightly lighter, both solid
  drawLine(mapped2, '#b09070', 1.8);
  drawLine(mapped1, '#1a6b3a', 2.5);

  // Find end points first to avoid overlap
  function getEndPoint(mapped) {
    let lastI = -1, lastV = null;
    mapped.forEach((v, i) => { if(v != null) { lastI = i; lastV = v; } });
    return { i: lastI, v: lastV };
  }
  const ep1 = getEndPoint(mapped1);
  const ep2 = getEndPoint(mapped2);

  // ── End-point dot (stays on the line, pure visual anchor) + top-strip badge (never overlaps the line) ──
  function drawEndDot(x, y, color) {
    if(x < 0 || y == null) return;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  function drawTopBadge(row, color, ticker, roi, valStr) {
    const text = `${ticker} ${roi>=0?'+':''}${roi.toFixed(1)}%  ${valStr}`;
    ctx.font = `bold 10.5px -apple-system, BlinkMacSystemFont, sans-serif`;
    const tw = ctx.measureText(text).width;
    const bpad = 6;
    const boxH = 17;
    const bx = w - padR - tw - bpad * 2;
    const by = 6 + row * (boxH + 5);
    ctx.fillStyle = color;
    if(ctx.roundRect) {
      ctx.beginPath(); ctx.roundRect(bx, by, tw + bpad * 2, boxH, 4); ctx.fill();
    } else {
      ctx.fillRect(bx, by, tw + bpad * 2, boxH);
    }
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(text, bx + bpad, by + 12);
  }

  const x1 = ep1.i >= 0 ? gx(ep1.i) : -1;
  const y1 = ep1.v != null ? gy(ep1.v) : null;
  const x2 = ep2.i >= 0 ? gx(ep2.i) : -1;
  const y2 = ep2.v != null ? gy(ep2.v) : null;

  const ticker1 = btData._ticker || '';
  const ticker2name = btData._benchmark || '';

  drawEndDot(x1, y1, '#1a6b3a');
  drawEndDot(x2, y2, '#b09070');
  // round40新增:徽章堆疊順序改成依報酬率高低排序(表現較好的放上面),不是固定照ticker1/ticker2。
  if(roi1 >= roi2) {
    drawTopBadge(0, '#1a6b3a', ticker1, roi1, fmt(val1));
    drawTopBadge(1, '#b09070', ticker2name, roi2, fmt(val2));
  } else {
    drawTopBadge(0, '#b09070', ticker2name, roi2, fmt(val2));
    drawTopBadge(1, '#1a6b3a', ticker1, roi1, fmt(val1));
  }
}
