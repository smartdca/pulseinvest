// ============================================================
// paper-allocation.js — 傾斜配置金額計算模組(pa*)
// 從 index.html 拆分而出(round46 架構瘦身,第四批),邏輯逐行原樣搬移,未做任何修改。
// 依賴:paHoldings/paChosenMap/paOriginalBudget/paViewMode/paSuggestedMap/paManualOverride/paBaselineSource(全域變數,定義於index.html)、
// renderPortfolioCarousel(portfolio-carousel.js)
// ============================================================

function paGetBaselinePct() {
  try { return JSON.parse(localStorage.getItem('pi_baseline_pct') || '{}'); } catch(e) { return {}; }
}
function paSaveBaselinePct(map) {
  try { localStorage.setItem('pi_baseline_pct', JSON.stringify(map)); } catch(e) {}
}
function paGetBudget() {
  try { return JSON.parse(localStorage.getItem('pi_portfolio_budget') || '{}'); } catch(e) { return {}; }
}
function paSaveBudget(obj) {
  try { localStorage.setItem('pi_portfolio_budget', JSON.stringify(obj)); } catch(e) {}
}

// Merge stored baseline % with current watchlist tickers.
// New tickers (not in storage) default to 0%, per the "no auto-rebalance on add" rule.
// Tickers no longer in watchlist are dropped.
function paMergedCurrentBaseline(tickers) {
  const stored = paGetBaselinePct();
  const merged = {};
  tickers.forEach(t => { merged[t] = stored[t] != null ? stored[t] : 0; });
  return merged;
}

function paTiltedAllocation(holdings, baselineMap, totalBudget, manualOverride) {
  // holdings: [{ticker, mult}]
  // NOTE: caller (paRenderAllocation) only calls this once the baseline %
  // sum is confirmed ≈100%, so totalTilted > 0 is guaranteed here.
  const tilted = holdings.map(h => ({ ticker: h.ticker, raw: (baselineMap[h.ticker] || 0) * (h.mult || 1.0) }));
  const totalTilted = tilted.reduce((s, t) => s + t.raw, 0);
  const finalPct = {};
  tilted.forEach(t => { finalPct[t.ticker] = totalTilted > 0 ? (t.raw / totalTilted) * 100 : 0; });

  if (!manualOverride) {
    const alloc = {};
    holdings.forEach(h => { alloc[h.ticker] = totalBudget * (finalPct[h.ticker] / 100); });
    return { alloc, finalPct };
  }
  const { ticker: ot, amount: oa } = manualOverride;
  const clamped = Math.max(0, Math.min(oa, totalBudget));
  const remaining = totalBudget - clamped;
  const others = holdings.map(h => h.ticker).filter(t => t !== ot);
  const othersPctSum = others.reduce((s, t) => s + (finalPct[t] || 0), 0);
  const alloc = { [ot]: clamped };
  others.forEach(t => { alloc[t] = othersPctSum > 0 ? remaining * (finalPct[t] / othersPctSum) : 0; });
  // Recompute finalPct to match the overridden alloc — otherwise the
  // legend/per-card % would keep showing the pre-override tilted split
  // even though the dollar amounts have changed (amount/% mismatch bug).
  if (totalBudget > 0) {
    holdings.forEach(h => { finalPct[h.ticker] = (alloc[h.ticker] / totalBudget) * 100; });
  }
  return { alloc, finalPct };
}

// Adding an asset to the watchlist is just observation, not a commitment —
// so a 0% or partial baseline split is valid, not an error to paper over:
//  - 'zero': nothing allocated yet → show a muted 0% donut
//  - 'partial': sum is between 0–100% → can't compute a result yet, the
//     remaining % is undefined, so we show nothing rather than guess
//  - 'complete': sum ≈ 100% → normal tilted allocation, as before
function paBaselineSumState(map) {
  const m = map || paChosenMap;
  const rawSum = Math.round(paHoldings.reduce((s, h) => s + (m[h.ticker] || 0), 0) * 10) / 10;
  if (rawSum <= 0) return { state: 'zero', sum: 0 };
  if (Math.abs(rawSum - 100) <= 0.5) return { state: 'complete', sum: rawSum };
  return { state: 'partial', sum: rawSum };
}

function paPlanTotal(map) {
  if (!paHoldings.length) return 0;
  const m = map || paChosenMap;
  // Normalize to ensure percentages sum to 100 before computing
  const rawSum = paHoldings.reduce((s, h) => s + (m[h.ticker] || 0), 0);
  const scale = rawSum > 0 ? 100 / rawSum : 1;
  return paHoldings.reduce((s, h) => s + paOriginalBudget * ((m[h.ticker] || 0) * scale / 100) * h.mult, 0);
}
// Tiles are two independent, mutually-exclusive views for comparison —
// tapping one never writes into another. AI Strategy just previews its
// own full plan (% split + $ total) without touching the saved baseline.
function paApplyPlanAmount() {
  if (!paHoldings.length) return; // data not ready yet
  paViewMode = 'ai';
  paManualOverride = null;
  paRenderAllocation(null);
}

function paRenderAllocation(draggingTicker) {
  if (!paHoldings.length) return; // guard: don't render with empty data
  const zh = currentLang === 'zh';
  // Each tile is a self-contained scenario: its own $ total AND its own
  // % split. Selecting one never writes into the others.
  const calcMap = paViewMode === 'ai' ? paSuggestedMap : paChosenMap;
  const actualBudget = paViewMode === 'ai' ? paPlanTotal(paSuggestedMap) : paOriginalBudget;
  const planTotal = paPlanTotal(paSuggestedMap);

  // ── Two tiles ── (independent of allocation state below)
  const budgetEl = $('paTileBudgetVal');
  const aiEl     = $('paTileAIVal');
  if (budgetEl) budgetEl.textContent = '$' + Math.round(paOriginalBudget).toLocaleString();
  if (aiEl)     aiEl.textContent     = '$' + Math.round(planTotal).toLocaleString();
  // round22新增:carousel裡手動設定/AI建議兩張各自的預算數字,跟舊的兩顆磚是同一份資料,不重算
  const pcarBudgetManualEl = $('pcarBudgetManual');
  const pcarBudgetAIEl = $('pcarBudgetAI');
  if (pcarBudgetManualEl) pcarBudgetManualEl.textContent = '$' + Math.round(paOriginalBudget).toLocaleString();
  if (pcarBudgetAIEl) pcarBudgetAIEl.textContent = '$' + Math.round(planTotal).toLocaleString();

  // Exactly one tile is ever highlighted — whichever the user tapped.
  const budgetTileEl = $('paTileBudget');
  const aiTileEl      = $('paTileAI');
  if (budgetTileEl) budgetTileEl.classList.toggle('pa-tile-active', paViewMode === 'budget');
  if (aiTileEl)     aiTileEl.classList.toggle('pa-tile-active', paViewMode === 'ai');

  // Carry the same theme color down through the donut card, asset cards,
  // and buttons, so scrolling away from the tiles doesn't lose track of
  // which scenario is currently in view.
  const wlPanelEl = $('wlPanel');
  if (wlPanelEl) {
    wlPanelEl.classList.remove('pa-theme-budget', 'pa-theme-ai');
    wlPanelEl.classList.add(paViewMode === 'ai' ? 'pa-theme-ai' : 'pa-theme-budget');
  }

  const { state, sum } = paBaselineSumState(calcMap);
  const wrap    = $('paDonutWrap');
  const legend  = $('paLegend');
  const pending = $('paDonutPending');

  if (state === 'partial') {
    // Sum is between 0–100% — the remaining % is undefined, so we don't
    // guess. No donut, no legend, no per-card amounts until the user
    // finishes allocating (or switches to AI 策略, a separate path that
    // always sums to 100%).
    if (wrap) wrap.style.display = 'none';
    if (legend) legend.style.display = 'none';
    if (pending) {
      pending.style.display = 'block';
      const pctEl = $('paDonutPendingPct');
      if (pctEl) pctEl.textContent = sum.toFixed(1).replace(/\.0$/, '') + '%';
      const txtEl = $('paDonutPendingText');
      if (txtEl) txtEl.textContent = zh
        ? '比例加總還沒到 100%，調整完成後才會顯示配置結果'
        : 'Allocation doesn\'t add up to 100% yet — finish adjusting to see the result';
    }
    paLastAlloc = {};
    paHoldings.forEach(h => {
      const amtEl = $(`pa-amt-${h.ticker}`);
      const pctEl = $(`pa-pct-${h.ticker}`);
      if (amtEl) amtEl.textContent = '—';
      if (pctEl) pctEl.textContent = '—';
      const slider = $(`pa-slider-${h.ticker}`);
      if (slider) slider.disabled = true;
    });
    return;
  }

  if (wrap) wrap.style.display = '';
  if (legend) legend.style.display = '';
  if (pending) pending.style.display = 'none';

  let alloc, finalPct;
  if (state === 'zero') {
    // Nothing allocated — every asset is explicitly 0%, not an error.
    alloc = {};
    finalPct = {};
    paHoldings.forEach(h => { alloc[h.ticker] = 0; finalPct[h.ticker] = 0; });
  } else {
    // round41修正:「手動設定」(budget模式)不該被個別資產的當期DCA倍數傾斜——
    // 跟上面滑桿範圍那段的邏輯保持一致(budget模式滑桿本身就是基準,0-100%,不套用倍數上下限)。
    // 只有「AI建議」(ai模式)才帶入資產真實的h.mult做傾斜配置,budget模式一律視為mult=1.0,
    // 讓金額/百分比單純等於「基準% × 預算」,不會因為某支資產這期觸發訊號就跟畫面設定的%對不起來。
    const holdingsForTilt = paHoldings.map(h => ({ ticker: h.ticker, mult: paViewMode === 'ai' ? (h.mult || 1.0) : 1.0 }));
    ({ alloc, finalPct } = paTiltedAllocation(holdingsForTilt, calcMap, actualBudget, paManualOverride));
  }
  paLastAlloc = alloc;

  // ── Donut (Retina) ──
  const canvas = $('paDonut');
  if (canvas && wrap) {
    wrap.classList.toggle('pa-zero', state === 'zero');
    if (legend) legend.classList.toggle('pa-zero', state === 'zero');
    const dpr = window.devicePixelRatio || 2;
    const cssSize = 160;
    canvas.style.width  = cssSize + 'px';
    canvas.style.height = cssSize + 'px';
    wrap.style.width    = cssSize + 'px';
    wrap.style.height   = cssSize + 'px';
    canvas.width  = cssSize * dpr;
    canvas.height = cssSize * dpr;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    const cx = cssSize / 2, cy = cssSize / 2;
    const R = cssSize * 0.44, r = cssSize * 0.30, gap = 0.025;
    if (state === 'zero') {
      // Single muted ring spanning the full circle — "nothing allocated".
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.arc(cx, cy, r, Math.PI * 2, 0, true);
      ctx.closePath();
      ctx.fillStyle = '#d8d3c8';
      ctx.fill();
    } else {
      let startAngle = -Math.PI / 2;
      paHoldings.forEach((h, i) => {
        const pct = (finalPct[h.ticker] || 0) / 100;
        const sweep = pct * Math.PI * 2 - gap;
        if (sweep <= 0) return;
        ctx.beginPath();
        ctx.arc(cx, cy, R, startAngle, startAngle + sweep);
        ctx.arc(cx, cy, r, startAngle + sweep, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = PA_COLORS[i % PA_COLORS.length];
        ctx.fill();
        startAngle += sweep + gap;
      });
    }
  }

  if (state === 'zero') {
    $('paDonutCount').textContent = '0%';
    $('t-padonutlbl').textContent = zh ? '尚未分配' : 'Not allocated';
  } else {
    $('paDonutCount').textContent = paHoldings.length;
    $('t-padonutlbl').textContent = zh ? '檔資產' : 'holdings';
  }

  // ── Legend ──
  $('paLegend').innerHTML = paHoldings.map((h, i) => `
    <div class="pa-legend-row">
      <span class="pa-legend-dot" style="background:${state==='zero' ? '#d8d3c8' : PA_COLORS[i % PA_COLORS.length]}"></span>
      <span class="pa-legend-ticker" title="${h.ticker}">${h.ticker}</span>
      <span class="pa-legend-pct" id="pa-legend-pct-${h.ticker}">${(finalPct[h.ticker]||0).toFixed(1)}%</span>
    </div>`).join('');

  // ── Per-card amounts & sliders ──
  const ageCaps = getAgeCaps();
  paHoldings.forEach((h, i) => {
    const amt = Math.round(alloc[h.ticker] || 0);
    const pct = finalPct[h.ticker] || 0;
    let minPctForSlider, maxPctForSlider;
    if (paViewMode === 'budget') {
      // The slider IS the baseline here — a shortcut for editing it
      // directly instead of round-tripping through the setup sheet — so
      // the multiplier bound (meant for short-term tilting around an
      // already-set baseline) doesn't apply. Just 0–100%.
      minPctForSlider = 0;
      maxPctForSlider = 100;
    } else {
      // Bound the slider by this asset's own baseline % × the DCA
      // multiplier system's floor/ceiling — not a flat % of total budget.
      const basePct = calcMap[h.ticker] || 0;
      const isBS = h.marketState === 'Black Swan';
      const multMin = isBS ? 0.5 : 1.0;
      const multMax = isBS ? ageCaps.bsMax : ageCaps.normalMax;
      minPctForSlider = Math.round(basePct * multMin * 10) / 10;
      maxPctForSlider = Math.max(minPctForSlider, Math.round(basePct * multMax * 10) / 10);
    }
    const amtEl = $(`pa-amt-${h.ticker}`);
    const pctEl = $(`pa-pct-${h.ticker}`);
    if (amtEl) amtEl.textContent = '$' + amt.toLocaleString();
    if (pctEl) pctEl.innerHTML = pct.toFixed(1) + '%' + (paViewMode !== 'budget' && paManualOverride && paManualOverride.ticker === h.ticker ? `<span class="pa-pct-tag">${zh?'已調整':'Adjusted'}</span>` : '');
    const slider = $(`pa-slider-${h.ticker}`);
    if (slider) {
      slider.disabled = (paViewMode === 'ai');
      slider.min = minPctForSlider;
      slider.max = maxPctForSlider;
      slider.step = 0.1;
      if (h.ticker !== draggingTicker) slider.value = Math.min(maxPctForSlider, Math.max(minPctForSlider, pct));
    }
  });

  // round21新增:每次自選清單的配置重新算完,滑動carousel(手動設定/AI建議兩張)也要跟著刷新。
  if (typeof renderPortfolioCarousel === 'function') renderPortfolioCarousel();
}

function paGetActiveBudget() {
  return paViewMode === 'ai' ? paPlanTotal(paSuggestedMap) : paOriginalBudget;
}

// Lightweight update during slider drag — only touches this card, skips
// donut/legend/other-card redraw so dragging stays smooth on mobile.
function paOnSliderInput(ticker, value) {
  const zh = currentLang === 'zh';
  const pct = parseFloat(value) || 0;
  const activeBudget = paGetActiveBudget();
  const amt = Math.round((pct / 100) * activeBudget);
  // Live preview while dragging only ever touches this one card — full
  // redistribution across other cards happens on release (paOnSliderChange),
  // so dragging stays smooth.
  const amtEl = $(`pa-amt-${ticker}`);
  if (amtEl) amtEl.textContent = '$' + amt.toLocaleString();
  const pctEl = $(`pa-pct-${ticker}`);
  if (pctEl) pctEl.innerHTML = pct.toFixed(1) + '%' + (paViewMode !== 'budget' ? `<span class="pa-pct-tag">${zh?'已調整':'Adjusted'}</span>` : '');
}

// Tap-to-adjust: nudges the slider by a fixed step (in percentage points).
// Tapping is more reliable than dragging on small screens, so this is the
// primary interaction; the slider itself remains available for fine-tuning.
function paSliderStep(ticker, dir) {
  const slider = $(`pa-slider-${ticker}`);
  if (!slider || slider.disabled) return;
  const min = parseFloat(slider.min) || 0;
  const max = parseFloat(slider.max) || 100;
  const range = Math.max(0.1, max - min);
  const stepAmt = Math.max(0.5, Math.round(range * 0.1 * 2) / 2);
  const cur = parseFloat(slider.value) || 0;
  const next = Math.min(max, Math.max(min, cur + dir * stepAmt));
  slider.value = next;
  paOnSliderChange(ticker, next);
}

// The slider IS the baseline in "我的預算" mode — dragging it edits and
// saves pi_baseline_pct directly (a shortcut for the setup sheet), rather
// than a temporary per-session override. Whatever % the dragged asset
// gives up or gains is redistributed among the OTHER currently-nonzero
// assets, weighted by their own current DCA multiplier (stronger signal
// = takes/keeps a bigger share) — not by their old baseline %. Assets
// already at 0% (that the user didn't touch) stay at 0% untouched, unless
// there's no other nonzero asset to redistribute into, in which case they
// have to absorb it (keeps the total at exactly 100%).
function paRedistributeBaselineOnDrag(draggedTicker, newPct) {
  const tickers = paHoldings.map(h => h.ticker);
  const current = { ...paChosenMap };
  const clamped = Math.max(0, Math.min(100, newPct));
  const remaining = 100 - clamped;
  let others = tickers.filter(t => t !== draggedTicker && (current[t] || 0) > 0);
  if (others.length === 0) others = tickers.filter(t => t !== draggedTicker);
  const multByTicker = {};
  paHoldings.forEach(h => { multByTicker[h.ticker] = h.mult || 1; });
  const multSum = others.reduce((s, t) => s + (multByTicker[t] || 1), 0);
  const newMap = { [draggedTicker]: Math.round(clamped * 10) / 10 };
  others.forEach(t => {
    newMap[t] = multSum > 0 ? Math.round((remaining * (multByTicker[t] || 1) / multSum) * 10) / 10 : 0;
  });
  tickers.forEach(t => { if (!(t in newMap)) newMap[t] = current[t] || 0; });
  return newMap;
}

function paOnSliderChange(ticker, value) {
  const pct = parseFloat(value) || 0;
  if (paViewMode === 'budget') {
    const newMap = paRedistributeBaselineOnDrag(ticker, pct);
    paCurrentMap = newMap;
    paChosenMap = newMap;
    paSaveBaselinePct(newMap);
    try { localStorage.setItem('pi_setup_done', '1'); } catch(e) {}
    paManualOverride = null;
    paRenderAllocation(ticker);
    return;
  }
  const activeBudget = paGetActiveBudget();
  const amt = Math.round((pct / 100) * activeBudget);
  paManualOverride = { ticker, amount: amt };
  paRenderAllocation(ticker);
}
function paEditOriginalBudget() {
  const zh = currentLang === 'zh';
  const v = prompt(zh ? '輸入原始預算金額' : 'Enter original budget', Math.round(paOriginalBudget));
  const n = parseFloat((v || '').replace(/[^0-9.]/g, ''));
  if (n && n > 0) {
    paOriginalBudget = n;
    paSaveBudget({ ...paGetBudget(), original: n });
    paRenderAllocation(null);
  }
}
function paResetAll() {
  paManualOverride = null;
  paRenderAllocation(null);
}
function paSelectPill(which) {
  paBaselineSource = which;
  $('paPillCurrent').classList.toggle('active', which === 'current');
  $('paPillSuggested').classList.toggle('active', which === 'suggested');
  paChosenMap = which === 'suggested' ? paSuggestedMap : paCurrentMap;
  if (which === 'suggested') {
    paSaveBaselinePct(paSuggestedMap);
    $('paPillCard').style.display = 'none';
  }
  paManualOverride = null;
  paRenderAllocation(null);
}
