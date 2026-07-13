// ============================================================
// portfolio-carousel.js — 首頁組合輪播卡片模組(pcar*)
// 從 index.html 拆分而出(round46 架構瘦身,第四批),邏輯逐行原樣搬移,未做任何修改。
// 依賴:paHoldings等全域變數(定義於index.html)、renderAccountCarouselSlide(acct相關,定義於index.html)
// ============================================================

// Both tiles and per-card sliders need "how much $ is currently in play" —
// this mirrors the same paViewMode branch used at the top of
// paRenderAllocation, kept in sync so slider drags convert %→$ correctly
// regardless of which scenario (budget/AI) is active.
// ══════════════════════════════════════════════════════════════
// 滑動式組合切換(round21新增) — 手動設定/AI建議/我的虛擬帳戶三張slide
// ══════════════════════════════════════════════════════════════
let pcarActiveIdx = 0;

function pcarOnScroll() {
  const car = $('pcarCarousel');
  if (!car || !car.children.length) return;
  const slideW = car.children[0].getBoundingClientRect().width + 10;
  const idx = Math.round(car.scrollLeft / slideW);
  document.querySelectorAll('#pcarDots .pcar-dot').forEach((d,i) => d.classList.toggle('active', i===idx));
  if (idx !== pcarActiveIdx) {
    pcarActiveIdx = idx;
    pcarShowDetailForSlide(idx);
  }
}

// round22新增:下面的細節區(含滑桿的完整資產卡片)不放進carousel裡橫滑,固定在carousel外面,
// 內容跟著上面選到哪一張切換——避免滑桿的左右拖曳手勢跟carousel的橫滑手勢互相打架。
// idx 0/1(手動設定/AI建議)直接沿用既有的#wlList,只是切換paViewMode;
// idx 2(虛擬帳戶)換成帳戶自己的卡片,顯示在#pcarAcctDetail。
function pcarShowDetailForSlide(idx) {
  const wlListEl = $('wlList');
  const acctDetailEl = $('pcarAcctDetail');
  if (idx === 2) {
    if (wlListEl) wlListEl.style.display = 'none';
    if (acctDetailEl) acctDetailEl.style.display = 'block';
    acctState = acctEnsureInit();
    if (Object.keys(acctHoldingsData).length === 0 && acctState.holdings.length) {
      acctFetchHoldingsData().then(() => {
        acctRenderCardsInto('pcarAcctDetail');
        renderAccountCarouselSlide();
      });
    } else {
      acctRenderCardsInto('pcarAcctDetail');
    }
  } else {
    if (acctDetailEl) acctDetailEl.style.display = 'none';
    if (wlListEl) wlListEl.style.display = 'block';
    paViewMode = idx === 1 ? 'ai' : 'budget';
    paManualOverride = null;
    if (paHoldings.length) paRenderAllocation(null);
  }
}

function pcarDrawMiniDonut(wrapId, entries /* [{color,pct}] */) {
  const wrap = $(wrapId);
  if (!wrap) return;
  if (!entries.length) { wrap.style.background = 'var(--bg2)'; return; }
  let acc = 0;
  const stops = entries.map(e => {
    const from = acc, to = acc + e.pct;
    acc = to;
    return `${e.color} ${from}% ${to}%`;
  }).join(',');
  wrap.style.background = `conic-gradient(${stops})`;
}

function pcarMiniListHtml(rows /* [{ticker,score,amt}] */, zh) {
  if (!rows.length) return `<div class="pcar-mini-empty">${zh?'目前沒有資產':'No holdings'}</div>`;
  return rows.map(r => {
    const high = r.score >= 60;
    return `<div class="pcar-mini-card">
      <div class="pcar-mini-score ${high?'high':'low'}">${r.score.toFixed(0)}</div>
      <div class="pcar-mini-t">${r.ticker}</div>
      <div class="pcar-mini-amt">$${Math.round(r.amt).toLocaleString()}</div>
    </div>`;
  }).join('');
}

// round23新增:沒有開過虛擬帳戶的人,carousel只顯示2張(手動設定/AI建議),
// 第三張(虛擬帳戶)整個隱藏,不用反灰——反灰會讓人以為點了會有反應,其實沒帳戶點進去是空的。
// 用acctLoad()(純檢查,不會像acctEnsureInit()一樣自動幫你開一個)判斷帳戶存不存在。
function pcarUpdateAcctVisibility() {
  const hasAccount = !!acctLoad();
  const slide = $('pcarSlideAcct');
  const dot = $('pcarDotAcct');
  if (slide) slide.style.display = hasAccount ? '' : 'none';
  if (dot) dot.style.display = hasAccount ? '' : 'none';
}

let pcarNudgePlayed = false;
// round25新增(D方案):carousel第一次有內容可看時,自己輕輕滑一下再滑回來,
// 用實際捲動示範「這裡可以滑」,只播一次,不會一直動、不會佔用額外UI空間。
function pcarPlayNudgeOnce() {
  if (pcarNudgePlayed) return;
  const car = $('pcarCarousel');
  if (!car || car.scrollWidth <= car.clientWidth + 4) return; // 沒有東西可以滑就不用演
  pcarNudgePlayed = true;
  setTimeout(() => {
    car.scrollTo({ left: 46, behavior: 'smooth' });
    setTimeout(() => car.scrollTo({ left: 0, behavior: 'smooth' }), 420);
  }, 500);
}

function renderPortfolioCarousel() {
  pcarUpdateAcctVisibility();
  const zh = currentLang === 'zh';
  pcarPlayNudgeOnce();

  // ── Slide 1: 手動設定 —— 直接讀paHoldings/paLastAlloc,跟自選清單本來的資料同一份 ──
  if (paHoldings.length) {
    const total1 = paHoldings.reduce((s,h) => s + (paLastAlloc[h.ticker]||0), 0) || 1;
    const entries1 = paHoldings.map((h,i) => ({ color: PA_COLORS[i%PA_COLORS.length], pct: (paLastAlloc[h.ticker]||0)/total1*100 }));
    pcarDrawMiniDonut('pcarDonutManual', entries1);
    $('pcarManualCount').textContent = paHoldings.length;
    $('pcarLegendManual').innerHTML = paHoldings.map((h,i) => `
      <div class="pcar-legend-row"><span class="pcar-legend-dot" style="background:${PA_COLORS[i%PA_COLORS.length]}"></span><span class="pcar-legend-t">${h.ticker}</span><span class="pcar-legend-p">${((paLastAlloc[h.ticker]||0)/total1*100).toFixed(0)}%</span></div>`).join('');
  } else {
    pcarDrawMiniDonut('pcarDonutManual', []);
    $('pcarManualCount').textContent = '0';
    $('pcarLegendManual').innerHTML = '';
  }

  // ── Slide 2: AI建議 —— 針對同一批資產,即時算一次calcBaselineWeights(),純顯示、不能編輯 ──
  if (paHoldings.length) {
    const aiWeights = calcBaselineWeights(paHoldings.map(h => ({ ticker: h.ticker, vol: h.vol, dev: h.currentDeviation })), getAgeBand());
    const refBudget = paOriginalBudget > 0 ? paOriginalBudget : 0;
    const entries2 = paHoldings.map((h,i) => ({ color: PA_COLORS[i%PA_COLORS.length], pct: aiWeights[h.ticker] || 0 }));
    pcarDrawMiniDonut('pcarDonutAI', entries2);
    $('pcarAICount').textContent = paHoldings.length;
    $('pcarLegendAI').innerHTML = paHoldings.map((h,i) => `
      <div class="pcar-legend-row"><span class="pcar-legend-dot" style="background:${PA_COLORS[i%PA_COLORS.length]}"></span><span class="pcar-legend-t">${h.ticker}</span><span class="pcar-legend-p">${(aiWeights[h.ticker]||0).toFixed(0)}%</span></div>`).join('');
  } else {
    pcarDrawMiniDonut('pcarDonutAI', []);
    $('pcarAICount').textContent = '0';
    $('pcarLegendAI').innerHTML = '';
  }

  renderAccountCarouselSlide();
}
