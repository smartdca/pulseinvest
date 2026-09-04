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

  // round(止血):這支從拆檔以來就沒有帶 x-turnstile-token,而 api/proxy.js 是「沒帶token
  // 一律403」。也就是說回測的每一個請求都在 proxy 那一關就被擋下來,一次 Yahoo 都沒打到,
  // 但錯誤被下面那行包裝成「No data for XXX」,看起來像是查無此代碼 —— 追查了很久才發現
  // 問題根本不在資料源。(2026-07-22 實測:連跑三次全部失敗、訊息完全一致。)
  if (!turnstileToken && typeof ensureTurnstileToken === 'function') {
    await ensureTurnstileToken(5000);
  }
  const headers = turnstileToken ? { 'x-turnstile-token': turnstileToken } : {};
  const r = await fetch(url, { headers });

  // round(止血):失敗原因要能分辨,不要再全部收斂成同一句話。
  if (!r.ok) {
    let code = '';
    try { code = (await r.json()).code || ''; } catch(e) {}
    if (r.status === 403) throw new Error('__TURNSTILE__');   // 驗證層擋下,跟資料源無關
    if (r.status === 429) throw new Error('__RATELIMIT__');
    if (r.status === 502) throw new Error('__UPSTREAM__');    // Yahoo 那端真的掛了
    throw new Error('HTTP ' + r.status + (code ? ' / ' + code : ''));
  }

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
//
// round52修正:新增 startIdx 參數。原本的做法是「先把價格切成使用者選的區間,才丟進來算」,
// 但判斷回撤要跟過去12個月的高點比、RSI百分位要跟過去的RSI比 —— 區間最前面那12個月
// 前面沒有資料可比,等於閉著眼睛算,結構上偏向不觸發。實測:同一場 -35% 空頭,
// 落在區間中段會觸發12次,落在區間開頭則是 0 次。
// 改法:prices 傳「完整歷史」,startIdx 之前的只用來累積指標歷史(暖身),不投入、不計次、不畫圖。
function runSmartDCA(prices, budget, monthsPerBar = 1, startIdx = 0) {
  let shares = 0, totalInvested = 0;
  let triggeredMonths = 0;
  let totalMult = 0;
  let investedMonths = 0;
  let maxDrawdown = 0;   // round52新增:區間內最深回撤(負數),用來解釋「為什麼觸發 0 次」
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

    // 暖身區:指標歷史已經累積進去了(上面的rsiHistory.push),但這幾期不屬於回測區間,
    // 不投入、不計入觸發次數、不進圖表資料。
    if(i < startIdx) continue;

    if(dd < maxDrawdown) maxDrawdown = dd;

    const invest = budget * monthsPerBar * finalMult;
    shares += invest / price;
    totalInvested += invest; // 實際投入（含加碼，已乘 monthsPerBar）
    if(triggered || blackSwan) triggeredMonths++;
    totalMult += finalMult;
    investedMonths++;

    vals.push(+(shares * price).toFixed(0));
  }

  const finalPrice = prices[prices.length-1];
  const finalVal = shares * finalPrice;
  const roi = ((finalVal - totalInvested) / totalInvested) * 100;
  const avgMult = (totalMult / Math.max(1, investedMonths)).toFixed(2);

  return { finalVal, totalInvested, roi, vals, triggeredMonths, avgMult, maxDrawdown };
}

// 2026-09-04:「統計格要不要用短標籤 + 純數字」的判斷,獨立成一支給兩處共用。
//   桌機一直都是短格式。backtest.html 這支獨立頁在手機也改用同一套(它把統計格
//   排成 2×2 方格,長文字會把字級壓到看不清),由該頁設 window.BT_SHORT_STATS=true 開啟。
//   index.html 的回測分頁沒有設這個旗標,維持原本的長文字清單,不受影響。
function btUseShortStats() {
  return document.documentElement.clientWidth >= 960 || window.BT_SHORT_STATS === true;
}

function updateBTLabels(zh, r1, r2, ticker, benchmark) {
  // 2026-08-25第六輪:桌機版五格統計要短標籤+純數字,手機維持原本完整文字/日期區間不變。
  // 2026-09-04修正:判斷基準從 window.innerWidth 改成 document.documentElement.clientWidth。
  //   iOS Safari 的 window.innerWidth 回報的是「可視區域」——會跟著使用者縮放變動;
  //   CSS media query 讀的則是「版面寬度」,不受縮放影響。兩者平常一致,但在
  //   ?desktop=1 預覽(用 JS 把 meta viewport 撐成 1200,整頁縮到約 0.32 倍)底下,
  //   只要放大畫面去打字,innerWidth 就會掉到 960 以下,而 CSS 還停在桌機。
  //   結果是「版面是桌機、文字掉回手機版」。clientWidth 跟 CSS media query 同一個
  //   基準,兩邊不會再分岔。真桌機/真手機的行為都跟原本相同。
  const isDesktop = btUseShortStats();

  const invLabel = $('t-btinvested');
  if(invLabel) invLabel.textContent = isDesktop ? (zh ? '$ 投入' : '$ Invested') : (zh ? '總投入金額' : 'Total Invested');
  const monthlyLabel = $('t-btmonthly');
  if(monthlyLabel) monthlyLabel.textContent = zh ? '$ 每月投入' : '$ Monthly';
  const pLabel = $('btPeriodLabel');
  if(pLabel) pLabel.textContent = isDesktop ? (zh ? '年數' : 'Years') : (zh ? '回測期間' : 'Period');
  const tLabel = $('btTriggeredLabel');
  if(tLabel) tLabel.textContent = isDesktop ? (zh ? '觸發月數' : 'Triggered mos.') : (zh ? '觸發加碼月數' : 'Triggered Months');
  const ddLabel = $('btMaxDDLabel');
  if(ddLabel) ddLabel.textContent = isDesktop ? (zh ? '最大 % 回撤' : 'Max % Drawdown') : (zh ? '期間最深回撤' : 'Max Drawdown');

  // Format date: "2021-01" → "Jan 2021"
  function fmtDate(d) {
    if(!d) return '—';
    const [y,m] = d.split('-');
    const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${mNames[parseInt(m)-1]} ${y}`;
  }

  // Period: "Jan 2021 → Jun 2025 (4.5 yrs)"(手機);桌機只留年數純數字
  const ds = btData._dateStart, de = btData._dateEnd, tm = btData._totalMonths;
  const yrsRaw2 = parseFloat(btData._totalYears || (tm / 12).toFixed(1));
  const yrs = yrsRaw2 % 1 === 0 ? Math.round(yrsRaw2).toString() : yrsRaw2.toFixed(1);
  const maxYears = parseInt($('btYears')?.value) || 0;
  if(ds && de) {
    $('btPeriod').textContent = isDesktop
      ? yrs
      : (zh ? `${fmtDate(ds)} — ${fmtDate(de)}（${yrs} 年）` : `${fmtDate(ds)} — ${fmtDate(de)} (${yrs} yrs)`);
  }
  // 2026-09-04:大數字底下的說明句(手機版新增,桌機沒有這個元素,這段自動略過)。
  //   桌機的大數字旁邊就是「Hmm, what if I ...」標題撐著語意,手機是上下堆疊,
  //   一個沒有標籤的金額看不出是什麼,所以補一句話把「誰、多久、這是什麼」講完。
  //   年數只出現在這句話裡,統計格那邊改放每月投入金額,兩邊不重複(2026-09-04定案)。
  const capEl = $('btHeroCaption');
  if(capEl) {
    capEl.textContent = zh
      ? `${ticker} 這 ${yrs} 年來累積的價值`
      : `What ${ticker} became over ${yrs} years`;
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

  // Triggered months:手機「X of Y months」,桌機只留觸發次數純數字
  if(tm) {
    $('btTriggered').textContent = isDesktop
      ? String(r1.triggeredMonths)
      : (zh ? `${r1.triggeredMonths} 個月（共 ${tm} 個月）` : `${r1.triggeredMonths} of ${tm} months`);
  }

  // round52新增:期間最深回撤 —— 觸發次數為 0 時,這一欄就是解釋(手機限定,桌機
  // 卡片太小放不下解釋句,見2026-08-25第八輪:desktop只留純數字,不帶%符號)。
  const ddEl = $('btMaxDD');
  if(ddEl && typeof r1.maxDrawdown === 'number') {
    if(isDesktop) {
      ddEl.textContent = r1.maxDrawdown.toFixed(1);
    } else {
      const ddTxt = `${r1.maxDrawdown.toFixed(1)}%`;
      ddEl.textContent = r1.triggeredMonths === 0
        ? (zh ? `${ddTxt}（未達 -15% 門檻）` : `${ddTxt} (below the -15% threshold)`)
        : ddTxt;
    }
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
  // round52新增:觸發 0 次時,底下三套輪播文案全部會寫出自相矛盾的句子——
  // 「觸發了 0 次加碼訊號,平均每 60 個月出現一次買入機會」「共觸發 0 次加碼,利用市場恐慌
  // 創造了額外的複利空間」。triggerRate 是拿 0 去反推的,本身就沒有意義。
  // 這裡整段獨立處理:誠實說明這段期間沒有出現符合門檻的低點,並且把「不亂加碼」講成優點。
  const noTrigger = triggeredDisplay === 0;
  const ddStr = (r1.maxDrawdown != null) ? `${r1.maxDrawdown.toFixed(1)}%` : '—';
  if(noTrigger) {
    if(zh) {
      text = `在這 ${yrsLabel} 年的回測區間裡，${ticker} 以固定金額持續投入累積了 ${r1.roi.toFixed(1)}% 的總報酬，`
           + `最終資產成長至 ${fmt(r1.finalVal)}；${benchmark} 同期報酬為 ${r2.roi.toFixed(1)}%，期末價值 ${fmt(r2.finalVal)}。`
           + `這段期間 ${ticker} 的最深回撤是 ${ddStr}，沒有達到加碼門檻（距 12 個月高點跌 15% 以上），`
           + `因此每一期都維持在基準金額，結果等同於固定金額定投。`
           + `加碼訊號本來就不是每年都會出現的東西——它只在明顯的低點才成立。`
           + `這段期間沒有出現，不代表機制沒有運作，而是市場沒有給過那樣的價格。`;
    } else {
      text = `Over ${yrsLabel} years, ${ticker} returned ${r1.roi.toFixed(1)}% on a steady monthly investment, `
           + `finishing at ${fmt(r1.finalVal)}. ${benchmark} returned ${r2.roi.toFixed(1)}% over the same period, ending at ${fmt(r2.finalVal)}. `
           + `${ticker}'s deepest drawdown across this window was ${ddStr} — never reaching the add-on threshold `
           + `(a 15% drop from its 12-month high). Every period stayed at the baseline amount, so the outcome matches plain fixed-amount DCA. `
           + `Add-on signals aren't meant to fire every year; they only hold at clear lows. `
           + `None appearing here doesn't mean the mechanism sat idle — it means the market never offered that price.`;
    }
  } else if(zh) {
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
  // 桌機鏡像:跟手機版 #btSummary 同一份內容,搬到圖表後面當全頁總結(見web.css
  // .bt-summary-desktop)。手機沒有 #btSummaryDesktop 這個元素,$()會回傳null,
  // 下面的if保護不會報錯也不影響手機。
  if($('btSummaryDesktop')) $('btSummaryDesktop').innerHTML = text + conclusion;

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

// ══════════════════════════════════════════════════════════════
// 桌機限定:互動核心區數字動畫 + What-if 卡片系統(2026-08-25定案)
// 資料(BT_WHATIF_CARDS)跟渲染/點擊邏輯分離——之後要增加、調整卡片,或把這套卡片
// 元件搬到別的頁面(文章/首頁/行銷)使用,只需要動資料清單本身,不需要改下面的
// 渲染/點擊函式(見討論記錄:不能寫死,避免重工)。
// 手機沒有 #btWhatIfTrack / #btHeroAmount 等元素,所有函式對 $()===null 都有保護,
// 不會報錯,也完全不影響手機任何行為。
// ══════════════════════════════════════════════════════════════

const BT_WHATIF_CARDS = [
  {
    id: 'years', icon: '⏱',
    label: { zh: '更早就開始投？', en: 'Start investing earlier?' },
    type: 'buttons', field: 'btYears', style: 'pill-accent',
    // 概念是「更早開始投」,直接指定絕對年數(取代目前選的年數),不是疊加
    // (2026-08-25第十一輪定案)。
    options: [
      { value: '20', label: { zh: '20年', en: '20yr' } },
      { value: '30', label: { zh: '30年', en: '30yr' } },
    ],
  },
  {
    id: 'budget', icon: '💰',
    label: { zh: '每月多投或少投？', en: 'Invest more or less?' },
    type: 'buttons', field: 'btBudget', style: 'pill-accent',
    // 相對於「目前輸入值」的倍率,點擊當下才換算成實際金額
    options: [
      { mult: 0.9, label: { zh: '-10%', en: '-10%' } },
      { mult: 1.1, label: { zh: '+10%', en: '+10%' } },
    ],
  },
  {
    id: 'benchmark', icon: '🔀',
    label: { zh: '跟其它大盤比比看？', en: 'Try another index?' },
    type: 'buttons', field: 'btBenchmark', style: 'pill-accent',
    // 2026-08-25第十一輪:換對比對象——直接取代btBenchmark,不是自由輸入框。
    options: [
      { value: 'QQQ', label: { zh: 'QQQ', en: 'QQQ' } },
      { value: 'VT',  label: { zh: 'VT',  en: 'VT' } },
    ],
  },
  {
    id: 'ticker', icon: '🔄',
    label: { zh: '改投其他資產？', en: 'Try a different asset?' },
    type: 'buttons', field: 'btTicker', style: 'pill-accent',
    // 2026-08-25第十一輪:換主角本身(不是換對比對象)——直接取代btTicker。
    options: [
      { value: 'GLD', label: { zh: 'GLD', en: 'GLD' } },
      { value: 'BTC-USD', label: { zh: 'BTC', en: 'BTC' } },
    ],
  },
  {
    id: 'more', icon: '👆',
    label: { zh: '想試試別的嗎？', en: 'Try another calculation?' },
    type: 'cta',
  },
  // 之後要加「拆成兩支各投一半」這種需要合併計算引擎的卡片(2026-08-25討論過,
  // 需要新的預算平均切分+多資產加總邏輯,不是現有runBacktest()能直接做的),
  // 等該引擎寫好後在這裡加一筆資料即可,不需要改下面的渲染/點擊邏輯本身。
  // 自由輸入代碼的版本(原本的「換比較對象」input型卡片)留到下次討論再決定要不要加回來。
];

// 通用數字滾動動畫:ease-out(慢慢增加的手感,不是老虎機式高速跳動)。
// 小數字用短時長(900ms)同時觸發同時停止;大數字(核心互動區)用長時長(1700ms),
// 同一時間起跑但明顯晚停,製造「壓軸」的節奏感(2026-08-25已與Henry確認)。
// K縮寫(2026-08-25第九輪):五格統計數字空間很窄,超過1000就縮成「70.5K」這種格式,
// 才能把字級再放大——「1000就是1K」,是整數千位就不留小數,否則留1位小數。
function btFmtK(n) {
  const v = Math.round(n);
  if(Math.abs(v) < 1000) return String(v);
  const k = v / 1000;
  const kRounded = Math.round(k * 10) / 10;
  return (kRounded % 1 === 0 ? kRounded.toFixed(0) : kRounded.toFixed(1)) + 'K';
}

function btCountUp(el, target, opts) {
  if(!el) return;
  opts = opts || {};
  const dur = opts.duration || 1000;
  const decimals = opts.decimals != null ? opts.decimals : 0;
  const prefix = opts.prefix || '';
  const suffix = opts.suffix || '';
  const formatFn = opts.formatFn || null; // 自訂格式化(比如K縮寫),優先於預設toLocaleString
  const startVal = parseFloat(el.dataset.rawVal || '0') || 0;
  const t0 = performance.now();
  function step(now) {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    const val = startVal + (target - startVal) * e;
    el.textContent = prefix + (formatFn ? formatFn(val) : val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })) + suffix;
    if(p < 1) requestAnimationFrame(step);
    else {
      el.textContent = prefix + (formatFn ? formatFn(target) : target.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })) + suffix;
      el.dataset.rawVal = target;
    }
  }
  requestAnimationFrame(step);
}

// 照著 BT_WHATIF_CARDS 清單畫出卡片,'buttons'類型(時間/金額)直接渲染選擇題按鈕,
// 'input'類型(換比較對象)沿用現有 ac-dropdown 自動完成邏輯(acSearch/acSelect)。
function btRenderWhatIfChips(zh, ticker, benchmark, budget, years) {
  const track = $('btWhatIfTrack');
  if(!track) return;
  track.innerHTML = BT_WHATIF_CARDS.map((card, ci) => {
    const labelTxt = zh ? card.label.zh : card.label.en;
    // 第五張「引導卡」(2026-08-25):純文字+手指圖示,點了直接捲回輸入表單,
    // 不屬於選項按鈕邏輯,獨立一個分支。
    if(card.type === 'cta') {
      return `<div class="bt-whatif-card bt-whatif-card-cta" onclick="btWhatIfScrollToInput()">
        <div class="bt-whatif-card-lbl">${labelTxt}</div>
        <div class="bt-whatif-cta-btn-wrap">
          <button class="bt-whatif-opt bt-whatif-opt-accent bt-whatif-opt-go" onclick="event.stopPropagation();btWhatIfScrollToInput()">Go</button>
        </div>
      </div>`;
    }
    // 2026-08-25第十三輪:拿掉「選中後持續變深色」機制——五張卡片的按鈕全部統一
    // 預設淺色,不再比對目前值、不再有任何按鈕停留在深色狀態。深色只在按下當下
    // 透過CSS的:active短暫出現,放開立刻恢復(見web.css)。
    const optClass = card.style === 'pill-accent' ? 'bt-whatif-opt bt-whatif-opt-accent' : 'bt-whatif-opt';
    const btns = card.options.map((opt, oi) => {
      return `<button class="${optClass}" onclick="btWhatIfSelect(${ci},${oi})">${zh?opt.label.zh:opt.label.en}</button>`;
    }).join('');
    return `<div class="bt-whatif-card">
      <div class="bt-whatif-card-lbl"><span class="bt-whatif-ico">${card.icon}</span>${labelTxt}</div>
      <div class="bt-whatif-opts${card.style==='pill-accent' ? ' bt-whatif-opts-row' : ''}">${btns}</div>
    </div>`;
  }).join('');
}

// 2026-08-25:語言切換時由 index.html 的 setLang() 呼叫(比照 buddyApplyLang 等既有模式)。
// 卡片內容是 JS 樣板字串產生的,沒有掛在 t- 翻譯系統上,不會被全站語言切換自動更新,
// 需要這裡手動重繪一次。還沒算過結果(track是空的)就跳過,不用做任何事。
function btWhatIfApplyLang() {
  const track = $('btWhatIfTrack');
  if(!track || !track.children.length) return;
  const zh = currentLang === 'zh';
  const ticker = $('btTicker') ? $('btTicker').value.trim() : '';
  const benchmark = $('btBenchmark') ? $('btBenchmark').value.trim() : '';
  const budget = parseFloat($('btBudget')?.value) || 500;
  const years = parseInt($('btYears')?.value) || 0;
  btRenderWhatIfChips(zh, ticker, benchmark, budget, years);
}

function btWhatIfSelect(cardIdx, optIdx) {
  const card = BT_WHATIF_CARDS[cardIdx];
  const opt = card.options[optIdx];
  if(card.field === 'btBudget') {
    // 唯一的「相對調整」欄位,其餘都是直接指定(value)取代目前值
    const cur = parseFloat($('btBudget').value) || 500;
    $('btBudget').value = Math.max(1, Math.round(cur * opt.mult));
  } else {
    $(card.field).value = opt.value;
  }
  runBacktest();
}

// 「換比較對象」卡片的輸入框選好代碼後,由 index.html 的 acSelect() 呼叫這裡
// (見acSelect內特判 inputId==='btWhatIfBenchInput' 那段):把選到的代碼寫回
// 真正的 btBenchmark 欄位——兩者是同一份表單資料,這裡只是提供另一個輸入入口,
// 不是獨立的第二套資料。
function btWhatIfBenchmarkChosen(symbol) {
  $('btBenchmark').value = symbol;
  runBacktest();
}

function btWhatIfNav(dir) {
  const track = $('btWhatIfTrack');
  if(!track) return;
  const card = track.querySelector('.bt-whatif-card');
  const step = card ? (card.offsetWidth + 14) * 1.2 : 320;
  track.scrollBy({ left: dir * step, behavior: 'smooth' });
}

// 第五張引導卡的點擊行為(2026-08-25):直接捲回輸入表單,讓使用者重新輸入
// 全新的查詢,沿用既有的 scrollToWithNavOffset()(跟首頁「Recalculate」按鈕同一套邏輯)。
function btWhatIfScrollToInput() {
  scrollToWithNavOffset($('btInputCard'));
}

// 左右兩欄底部對齊(2026-08-25第六輪):純CSS Grid的align-self:stretch只能讓格線對齊,
// 沒辦法讓「內容比較少那一欄」的視覺底邊跟著延伸到格線底部(格線本身是被內容比較多的
// 那一欄撐高的)。這裡改用JS實測右欄(大數字+標籤+卡片+箭頭)的實際高度,回頭套用給
// 左欄的四/五格統計列當作最小高度,兩邊底部就會精準對齊,不用硬猜固定數字。
function btSyncRightColumnHeight() {
  // 2026-09-04:基準改用 clientWidth,理由見 updateBTLabels 開頭的說明。
  if(document.documentElement.clientWidth < 960) return; // 桌機限定,手機不套用
  requestAnimationFrame(() => {
    const roiGrid = document.querySelector('.bt-roi-grid');
    const core = $('btCoreInteractive');
    const detailsWrap = $('btDetailsWrap');
    if(!roiGrid || !core || !detailsWrap) return;
    detailsWrap.style.minHeight = ''; // 先清空,避免上一次的高度影響這次量測
    const roiBottom = roiGrid.getBoundingClientRect().bottom;
    const coreBottom = core.getBoundingClientRect().bottom;
    const detailsWrapStyle = getComputedStyle(detailsWrap);
    const marginTop = parseFloat(detailsWrapStyle.marginTop) || 0;
    const targetHeight = coreBottom - roiBottom - marginTop;
    if(targetHeight > 40) {
      detailsWrap.style.minHeight = targetHeight + 'px';
    }
  });
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
    // round52修正:回測引擎要拿「完整共同歷史」去算指標,再用 startIdx 告訴它從哪一期
    // 開始真正投入。只丟切好的區間進去,區間最前面12個月會因為沒有過去資料可比而漏算觸發。
    const fullPrices1 = commonDates.map(d => map1.get(d));
    const fullPrices2 = commonDates.map(d => map2.get(d));
    const chartDates = usedDates;
    const monthsPerBar = 1;
    const dateStart  = chartDates[0];
    const dateEnd    = chartDates[chartDates.length - 1];
    const [sy, sm]   = dateStart.split('-').map(Number);
    const [ey, em]   = dateEnd.split('-').map(Number);
    const totalMonths = (ey - sy) * 12 + (em - sm) + 1;
    const totalYears  = (totalMonths / 12).toFixed(1);
    const limitedBy   = t1.dates.length <= t2.dates.length ? ticker : benchmark;

    // round50新增:GA4事件——成功跑完一次回測(排除掉前面各種throw的失敗情境)
    if (typeof gtag !== 'undefined') {
      gtag('event', 'run_backtest', { event_category: 'backtest', ticker: ticker, years_tested: totalYears });
    }

    const r1 = runSmartDCA(fullPrices1, budget, 1, startIdx);
    const r2 = runSmartDCA(fullPrices2, budget, 1, startIdx);

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

    $('btROI1').style.color = r1.roi >= r2.roi ? 'var(--ink)' : 'var(--ink2)';
    $('btROI2').style.color = r2.roi > r1.roi ? 'var(--ink)' : 'var(--ink2)';

    // Winner: bold border only(手機用,深色卡渲染用class另外處理,見下方)
    const c1 = $('btCard1'), c2 = $('btCard2');
    if(c1 && c2) {
      if(r1.roi >= r2.roi) {
        c1.style.border = '2px solid var(--ink)';
        c2.style.border = '1.5px solid var(--border)';
      } else {
        c2.style.border = '2px solid var(--ink)';
        c1.style.border = '1.5px solid var(--border)';
      }
      // 桌機深色卡「亮燈」對比(2026-08-25第二輪定案):贏家卡加class觸發CSS的
      // 橘光暈+邊框發光,輸家卡維持素面暗色。手機沒有對應CSS規則,class掛著
      // 不影響手機外觀(手機用上面inline border,不吃這兩個class)。
      const winnerEl = r1.roi >= r2.roi ? c1 : c2;
      const loserEl = r1.roi >= r2.roi ? c2 : c1;
      winnerEl.classList.add('bt-card-winner');
      winnerEl.classList.remove('bt-card-loser');
      loserEl.classList.add('bt-card-loser');
      loserEl.classList.remove('bt-card-winner');
    }

    updateBTLabels(zh, r1, r2, ticker, benchmark);

    // 2026-08-25第八輪:$符號從數字搬進固定標籤文字(「$ Invested」「$ Monthly」),
    // 桌機數字本身不帶$;手機#btInvested是共用元素,維持原本帶$的顯示不受影響。
    // 2026-08-25第九輪:桌機數字超過1000用K縮寫(見btFmtK),才擠得出放大字級的空間。
    const isDesktopStats = btUseShortStats();
    if($('btMonthly')) $('btMonthly').textContent = isDesktopStats ? btFmtK(budget) : Math.round(budget).toLocaleString('en-US');

    // 所有「小數字」同一組動畫,同時觸發、同時停止。2026-08-25第十輪:原本900ms
    // 太快,幾乎看不到滾動過程就結束了,拉長到1800ms才看得出來是「算出來的」。
    btCountUp($('btROI1'), r1.roi, { duration: 2800, decimals: 1, prefix: r1.roi>=0?'+':'', suffix: '%' });
    btCountUp($('btVal1'), r1.finalVal, { duration: 2800, decimals: 0, prefix: '$' });
    btCountUp($('btROI2'), r2.roi, { duration: 2800, decimals: 1, prefix: r2.roi>=0?'+':'', suffix: '%' });
    btCountUp($('btVal2'), r2.finalVal, { duration: 2800, decimals: 0, prefix: '$' });
    btCountUp($('btInvested'), r1.totalInvested, { duration: 2800, formatFn: isDesktopStats ? btFmtK : null, decimals: 0, prefix: isDesktopStats ? '' : '$' });

    // 大數字(核心互動區,只剩累積金額,不帶%):比小數字晚停,2026-08-25第十輪
    // 從1700ms拉長到3000ms,壓軸的節奏感要更明顯。
    // 2026-08-25第三輪:超過7位數(千萬以上)改用 $X.XM 縮寫,不然放到最大字級會爆版。
    if(Math.abs(r1.finalVal) >= 10000000) {
      btCountUp($('btHeroAmount'), r1.finalVal / 1000000, { duration: 4500, decimals: 1, prefix: '$', suffix: 'M' });
    } else {
      btCountUp($('btHeroAmount'), r1.finalVal, { duration: 4500, decimals: 0, prefix: '$' });
    }

    $('btResult').style.display = 'block';
    drawBTCharts();
    btRenderWhatIfChips(zh, ticker, benchmark, budget, maxYears);
    btSyncRightColumnHeight();
    // 2026-08-25第七輪:不管是第一次按「Run Backtest」還是之後點What-if卡片,
    // 每次算完都固定捲回同一個位置——原本What-if故意不捲動是想保留「原地互動」的
    // 節奏感,但因為新結果的區塊高度可能跟舊的不一樣(數字、卡片內容都變了),
    // 頁面重新排版後畫面會被推走,反而變成「亂跳」。改成每次都捲回同一套已驗證
    // 正確的位置,結果至少是可預期、一致的。
    setTimeout(() => { scrollToWithNavOffset($('btResult')); }, 300);

  } catch(e) {
    // round(止血):錯誤訊息要讓使用者知道「該怎麼辦」,而不是丟一串技術字串。
    // 驗證失敗是重整就能解決的,資料源掛掉是等一下再試,查無代碼才是真的要改輸入。
    const msgs = {
      '__TURNSTILE__': zh ? '安全驗證已過期,請重新整理頁面後再試一次。'
                          : 'Security check expired. Please refresh the page and try again.',
      '__RATELIMIT__': zh ? '短時間內查詢次數過多,請稍等一分鐘再試。'
                          : 'Too many requests. Please wait a minute and try again.',
      '__UPSTREAM__' : zh ? '資料來源暫時無法連線,請稍後再試。'
                          : 'Data source is temporarily unavailable. Please try again later.',
    };
    alert(msgs[e.message] || ((zh?'回測錯誤：':'Backtest error: ') + e.message));
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
  drawLine(mapped2, '#8b7355', 1.8);
  drawLine(mapped1, '#2d7a4f', 2.5);

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

  drawEndDot(x1, y1, '#2d7a4f');
  drawEndDot(x2, y2, '#8b7355');
  // round40新增:徽章堆疊順序改成依報酬率高低排序(表現較好的放上面),不是固定照ticker1/ticker2。
  if(roi1 >= roi2) {
    drawTopBadge(0, '#2d7a4f', ticker1, roi1, fmt(val1));
    drawTopBadge(1, '#8b7355', ticker2name, roi2, fmt(val2));
  } else {
    drawTopBadge(0, '#8b7355', ticker2name, roi2, fmt(val2));
    drawTopBadge(1, '#2d7a4f', ticker1, roi1, fmt(val1));
  }

  // ── hover/觸控準星(2026-08-25新增):存下這次畫圖用的座標對照表,滑鼠/手指
  // 移動時直接查表算最近的資料點,不用重新跑一次完整的資料處理邏輯。 ──
  BT_CHART_GEO[canvasId] = {
    xDates, n, gx, gy, w, h, padL, padR,
    mapped1raw, mapped2raw, // 原始$金額(hover小框顯示這個,不是growth multiple)
    mapped1, mapped2,       // growth multiple(y座標計算要用這個,跟畫線時的座標系一致)
    ticker1, ticker2: ticker2name,
  };
  btSetupChartHover(canvasId);
}

// ── hover/觸控準星系統(2026-08-25新增,參考 nvda.html 既有的 scrub() 手法,
// 但這裡是 canvas 圖不是 SVG,改用疊在 canvas 上面的絕對定位 DOM 元素
// (掃描線+兩個圓點+浮動數字框),不重畫 canvas 本身。
// 桌機:滑鼠移過就觸發(mousemove,不用按)。手機:按住拖曳才觸發(touchstart/touchmove),
// 跟原本 nvda.html 的觸控行為一致——同一組視覺,兩種裝置各自對應的觸發條件不同。 ──
const BT_CHART_GEO = {};
const BT_CHART_HOVER_BOUND = {};

function btFmtDateYM(d) {
  if(!d) return '';
  const [y, m] = d.split('-');
  const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${mNames[parseInt(m)-1]} ${y}`;
}

function btChartScrub(canvasId, clientX) {
  const geo = BT_CHART_GEO[canvasId];
  const wrap = $(canvasId + 'Wrap');
  if(!geo || !wrap) return;
  const rect = wrap.getBoundingClientRect();
  let fx = (clientX - rect.left - geo.padL) / (geo.w - geo.padL - geo.padR);
  fx = Math.max(0, Math.min(1, fx));
  const idx = Math.max(0, Math.min(geo.n - 1, Math.round(fx * (geo.n - 1))));
  const xpx = geo.gx(idx);
  const v1 = geo.mapped1raw[idx], v2 = geo.mapped2raw[idx];

  const scan = $(canvasId + 'Scan');
  if(scan) { scan.style.left = xpx + 'px'; scan.style.opacity = 1; }

  const dot1 = $(canvasId + 'Dot1'), dot2 = $(canvasId + 'Dot2');
  if(dot1) {
    const m1 = geo.mapped1[idx];
    if(m1 != null) { dot1.style.left = xpx + 'px'; dot1.style.top = geo.gy(m1) + 'px'; dot1.style.background = '#2d7a4f'; dot1.style.opacity = 1; }
    else dot1.style.opacity = 0;
  }
  if(dot2) {
    const m2 = geo.mapped2[idx];
    if(m2 != null) { dot2.style.left = xpx + 'px'; dot2.style.top = geo.gy(m2) + 'px'; dot2.style.background = '#8b7355'; dot2.style.opacity = 1; }
    else dot2.style.opacity = 0;
  }

  const tip = $(canvasId + 'Tip');
  if(tip) {
    const zh = currentLang === 'zh';
    const dateStr = btFmtDateYM(geo.xDates[idx]);
    const line1 = v1 != null ? `${geo.ticker1} <b>${fmt(v1)}</b>` : '';
    const line2 = v2 != null ? `${geo.ticker2} <b>${fmt(v2)}</b>` : '';
    tip.innerHTML = `<div class="d">${dateStr}</div>${line1}${line1 && line2 ? '　' : ''}${line2}`;
    tip.style.opacity = 1;
    let tx = xpx, half = tip.offsetWidth / 2;
    tx = Math.max(half + 4, Math.min(geo.w - half - 4, tx));
    tip.style.left = tx + 'px';
  }
}

function btChartScrubEnd(canvasId) {
  ['Scan', 'Dot1', 'Dot2', 'Tip'].forEach(suffix => {
    const el = $(canvasId + suffix);
    if(el) el.style.opacity = 0;
  });
}

function btSetupChartHover(canvasId) {
  if(BT_CHART_HOVER_BOUND[canvasId]) return; // 只綁一次,重畫圖表不會重複綁
  const wrap = $(canvasId + 'Wrap');
  if(!wrap) return;
  BT_CHART_HOVER_BOUND[canvasId] = true;
  // 桌機:滑鼠移過就觸發,不用按
  wrap.addEventListener('mousemove', e => btChartScrub(canvasId, e.clientX));
  wrap.addEventListener('mouseleave', () => btChartScrubEnd(canvasId));
  // 手機:按住拖曳才觸發(跟nvda.html的scrub()同一套判斷),放開/手指離開才收起
  wrap.addEventListener('touchstart', e => { if(e.touches[0]) btChartScrub(canvasId, e.touches[0].clientX); }, { passive: true });
  wrap.addEventListener('touchmove', e => { if(e.touches[0]) btChartScrub(canvasId, e.touches[0].clientX); }, { passive: true });
  wrap.addEventListener('touchend', () => btChartScrubEnd(canvasId));
}
