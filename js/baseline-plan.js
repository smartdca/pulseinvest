// ============================================================
// baseline-plan.js — 基準配置設定彈窗模組(bp*)
// 從 index.html 拆分而出(round46 架構瘦身,第四批),邏輯逐行原樣搬移,未做任何修改。
// 依賴:paSaveBaselinePct(paper-allocation.js)、acctLoad/acctSave/acctState等(acct相關,定義於index.html)、
// pushScheduleSync/pushGetSubscription/openPushPrePrompt(push相關,定義於index.html)、renderWatchlist(watchlist.js)
// ============================================================

// ════════════════════════════════════════════════════════════
// SET BASELINE % SHEET (Round 12)
// ════════════════════════════════════════════════════════════
let bpRows = [];       // [{ticker, aiSuggested, current}]
let bpAiMode = false; // true = AI-suggested values applied & locked; false (default) = original/manual values, editable
let bpScrollLockY = 0;

// Rapid swipes inside the sheet could escape the contained scroll area and
// trigger Safari's pull-to-refresh, which reloads the whole page (looks
// like a crash back to the homepage). This explicitly blocks overscroll
// at the edges of the sheet's scrollable body, and blocks all touch-scroll
// outside it (header/footer), regardless of swipe speed.
(function() {
  const overlay = document.getElementById('bpOverlay');
  if (!overlay) return;
  let startY = 0;
  overlay.addEventListener('touchstart', function(e) {
    if (e.touches && e.touches[0]) startY = e.touches[0].clientY;
  }, { passive: true });
  overlay.addEventListener('touchmove', function(e) {
    const scroller = e.target.closest('.bp-body');
    if (!scroller) { e.preventDefault(); return; }
    if (!e.touches || !e.touches[0]) return;
    const y = e.touches[0].clientY;
    const deltaY = y - startY;
    const atTop = scroller.scrollTop <= 0;
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
    if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) e.preventDefault();
  }, { passive: false });
})();

function openBaselineSheet(fromAccount) {
  const stored = paGetBaselinePct();
  let setupDone = false;
  try { setupDone = localStorage.getItem('pi_setup_done') === '1'; } catch(e) {}
  // Only trust stored % values if the user has actually confirmed a setup
  // before — otherwise stray/leftover values (e.g. from an asset that was
  // later removed) could silently pre-fill a field that should be blank.
  const hasStored = setupDone && Object.keys(stored).length > 0;
  const tickers = watchlist.map(w => w.ticker);
  bpRows = tickers.map(t => ({
    ticker: t,
    aiSuggested: 0,
    // Default 0 for any not-yet-set asset — adding to the watchlist is just
    // observation, not a commitment to invest, so there's no reason to
    // force any allocation (including for a single asset).
    current: hasStored && stored[t] != null ? stored[t] : 0,
  }));
  bpRefreshAiSuggested();
  // Always open with AI suggestion OFF — show the user's own original
  // settings (or blank for a brand-new asset), editable at a glance.
  bpAiMode = false;
  $('bpManualToggle').checked = false;
  const budgetEl = $('bpBudgetInput');
  const storedB = paGetBudget();
  if (budgetEl) budgetEl.value = (storedB.original && storedB.original !== PA_INTERNAL_BUDGET) ? Math.round(storedB.original) : '';
  // round32新增:「同時套用到虛擬帳戶」勾選項——只有已經開過帳戶的人才看得到;
  // 從帳戶的「調整策略」按鈕進來的話預設幫他打勾(反正還有二次確認擋著,不會誤觸真的套用)。
  const hasAccount = !!acctLoad();
  const applyRow = $('bpAcctApplyRow');
  if (applyRow) applyRow.style.display = hasAccount ? 'flex' : 'none';
  const applyChk = $('bpAcctApplyChk');
  if (applyChk) applyChk.checked = !!(hasAccount && fromAccount);
  bpCancelAddAsset();
  bpRender();
  $('bpOverlay').style.display = 'flex';
  // Prevent body scroll while sheet is open (iOS Safari fix)
  bpScrollLockY = window.scrollY || window.pageYOffset || 0;
  document.body.style.position = 'fixed';
  document.body.style.top = (-bpScrollLockY) + 'px';
  document.body.style.width = '100%';
  document.body.style.overflow = 'hidden';
}
function closeBaselineSheet() {
  $('bpOverlay').style.display = 'none';
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  window.scrollTo(0, bpScrollLockY);
}
function bpOnBudgetChange() {
  const el = $('bpBudgetInput');
  const v = parseFloat((el ? el.value : '').replace(/[^0-9.]/g, ''));
  if (v && v > 0) { paOriginalBudget = v; paSaveBudget({ ...paGetBudget(), original: v }); }
  // Re-validate confirm button
  bpUpdateSum();
}

function bpSum() { return bpRows.reduce((s, r) => s + r.current, 0); }

// Recompute aiSuggested for every row in bpRows against the *current* asset
// list. Tickers with real vol data (already fetched via renderWatchlist)
// use that; a ticker just added inside this sheet has no vol yet, so it
// falls back to 0.3 (neutral) until the sheet is closed and renderWatchlist
// fetches its real data. Call this any time bpRows' ticker set changes
// (add/delete) and right before applying AI mode, so toggling AI on always
// reflects the current set of assets instead of a stale snapshot.
function bpRefreshAiSuggested() {
  const assets = bpRows.map(r => {
    const h = paHoldings.find(x => x.ticker === r.ticker);
    return { ticker: r.ticker, vol: (h && h.vol) ? h.vol : 0.3, dev: h ? h.currentDeviation : null };
  });
  const suggested = calcBaselineWeights(assets, getAgeBand());
  // round34修正:原本每支各自Math.round(),小數各自進位/捨去後加總會漂成99%或101%——
  // 改用最大餘數法:先全部無條件捨去,缺的點數依小數部分由大到小逐支+1補回,保證加總剛好100。
  if (!bpRows.length) return;
  const entries = bpRows.map(r => {
    const raw = suggested[r.ticker] || 0;
    return { r, floor: Math.floor(raw), frac: raw - Math.floor(raw) };
  });
  let deficit = 100 - entries.reduce((s, e) => s + e.floor, 0);
  entries.sort((a, b) => b.frac - a.frac);
  entries.forEach(e => { e.r.aiSuggested = e.floor + (deficit > 0 ? 1 : 0); if (deficit > 0) deficit--; });
}

function bpRender() {
  $('bpRowsList').innerHTML = bpRows.map((r, i) => {
    const stepperLocked = bpAiMode;
    // Always show the real number, including 0 — 0 is a valid, meaningful
    // value (not yet allocating budget to this asset), not "unset".
    const val = r.current;
    return `
    <div class="bp-row">
      <div class="bp-row-logo" id="bp-logo-${i}"></div>
      <div class="bp-row-ticker">${r.ticker}</div>
      <div style="display:flex;align-items:center;gap:6px;">
        <div class="bp-stepper">
          <button onclick="bpStep(${i},-1)" ${stepperLocked?'disabled':''}>−</button>
          <input type="text" inputmode="numeric" value="${val}" placeholder="0" ${stepperLocked?'readonly':''} onchange="bpOnType(${i}, this.value)">
          <button onclick="bpStep(${i},1)" ${stepperLocked?'disabled':''}>＋</button>
        </div>
        <span style="font-size:13px;font-weight:600;color:var(--ink2);font-family:var(--font-sans);">%</span>
      </div>
      <button class="bp-del-btn" onclick="bpDelAsset(${i})">🗑</button>
    </div>`;
  }).join('');
  bpRows.forEach((r, i) => { const el = $(`bp-logo-${i}`); if (el) el.appendChild(createLogoImg(r.ticker, 38)); });
  bpUpdateSum();
}
function bpUpdateSum() {
  const sum = Math.round(bpSum());
  const el = $('bpSumVal');
  el.textContent = sum + '%';
  el.className = 'bp-sum-val ' + (sum > 100 ? 'bad' : 'ok');
  // Budget must be filled; total just can't exceed 100% (0% is valid —
  // it simply means nothing is allocated to invest yet).
  const budgetFilled = parseFloat(($('bpBudgetInput') ? $('bpBudgetInput').value : '').replace(/[^0-9.]/g,'')) > 0;
  $('bpConfirmBtn').disabled = (sum > 100 || !budgetFilled);
  // 0% and partial sums are still confirmable here — but the result page
  // can't compute anything until the split reaches exactly 100%, so warn
  // up front rather than let the user discover it after leaving.
  const hintEl = $('bpSumHint');
  if (hintEl) {
    const zh = currentLang === 'zh';
    if (sum !== 100) {
      hintEl.style.display = 'block';
      hintEl.textContent = sum > 100
        ? (zh ? '⚠️ 加總超過 100%，請減少後才能確定' : '⚠️ Total exceeds 100% — reduce it to confirm')
        : (zh ? '提醒：加總需剛好 100%，結果頁面才會顯示配置計算' : 'Note: the split must total exactly 100% for the result page to calculate');
    } else {
      hintEl.style.display = 'none';
    }
  }
}
function bpStep(i, delta) {
  bpRows[i].current = Math.max(0, Math.round(bpRows[i].current + delta));
  $('bpRowsList').querySelectorAll('.bp-stepper input')[i].value = bpRows[i].current;
  bpUpdateSum();
}
function bpOnType(i, val) {
  const n = parseFloat(val.replace(/[^0-9.]/g, '')) || 0;
  bpRows[i].current = Math.max(0, Math.round(n));
  bpUpdateSum();
}
function bpOnToggleManual() {
  bpAiMode = $('bpManualToggle').checked;
  if (bpAiMode) {
    // round32修正:切到AI建議前,先把目前的手動比例存進manualBackup,不然切回去的時候
    // 手動設定已經被蓋掉、還原不回來——這才是真正能來回切換比對的「切換」,不是單向覆蓋。
    bpRows.forEach(r => { r.manualBackup = r.current; });
    bpRefreshAiSuggested();
    bpRows.forEach(r => { r.current = r.aiSuggested; });
  } else {
    // 切回手動:還原剛剛存的備份。如果這個資產是在AI模式底下才新增的、從來沒有手動值可以還原,
    // 保守給0%(跟「新增資產預設0%,不自動重新分配」的既有規則一致),不要亂猜一個數字。
    bpRows.forEach(r => { r.current = r.manualBackup != null ? r.manualBackup : 0; });
  }
  bpRender();
}
function bpAddAsset() {
  const zh = currentLang === 'zh';
  $('bpAddError').style.display = 'none';
  $('bpAddRow').style.display = 'flex';
  $('bpAddInput').placeholder = zh ? '輸入代號，例如 TSLA' : 'Enter ticker, e.g. TSLA';
  $('bpAddInput').value = '';
  $('t-bpaddbtn').style.display = 'none';
  $('bpAddInput').focus();
}
function bpShowAddError(msg) {
  const el = $('bpAddError');
  el.textContent = msg;
  el.style.display = 'block';
}
function bpConfirmAddAsset() {
  const zh = currentLang === 'zh';
  const t = ($('bpAddInput').value || '').replace(/[^A-Za-z0-9.-]/g,'').toUpperCase().trim();
  if (!t) { bpShowAddError(zh ? '請輸入資產代號' : 'Please enter a ticker'); return; }
  if (bpRows.find(r => r.ticker === t)) { bpShowAddError(zh ? '這個資產已經在清單裡了' : 'This asset is already in your list'); return; }
  if (watchlist.length >= WL_MAX_ITEMS && !watchlist.find(w => w.ticker === t)) {
    showUpgradeModal();
    return;
  }
  bpRows.push({ ticker: t, aiSuggested: 0, current: 0 });
  if (!watchlist.find(w => w.ticker === t)) {
    watchlist.push({ ticker: t, budget: paOriginalBudget > 0 ? Math.round(paOriginalBudget / Math.max(1, bpRows.length)) : 100 });
    try { localStorage.setItem('pi_watchlist', JSON.stringify(watchlist)); } catch(e) {}
  }
  bpRefreshAiSuggested();
  if (bpAiMode) {
    bpAiMode = false;
    $('bpManualToggle').checked = false;
    // round32修正:強制切回手動模式時,也要還原備份,不然畫面停留在AI值、跟「已切回手動」的
    // 狀態不一致(新加的這支本來就是current:0,不用管,舊的幾支要還原)。
    bpRows.forEach(r => { if (r.ticker !== t) r.current = r.manualBackup != null ? r.manualBackup : 0; });
  }
  bpCancelAddAsset();
  bpRender();
}
function bpCancelAddAsset() {
  $('bpAddRow').style.display = 'none';
  $('bpAddError').style.display = 'none';
  $('bpAddInput').value = '';
  const btn = document.getElementById('t-bpaddbtn');
  if (btn) btn.style.display = 'block';
}
function bpDelAsset(i) {
  const zh = currentLang === 'zh';
  const t = bpRows[i].ticker;
  const msg = zh ? `確定要從自選清單移除 ${t}？` : `Remove ${t} from your watchlist?`;
  if (!confirm(msg)) return;
  bpRows.splice(i, 1);
  watchlist = watchlist.filter(w => w.ticker !== t);
  try { localStorage.setItem('pi_watchlist', JSON.stringify(watchlist)); } catch(e) {}
  bpRefreshAiSuggested();
  // round32修正:刪除資產當下如果還在AI模式,剩下資產的current要跟著重新算好的aiSuggested更新,
  // 不然畫面顯示的還是刪除前那批舊的AI值,跟「AI模式應該永遠顯示當下建議」不一致。
  if (bpAiMode) { bpRows.forEach(r => { r.current = r.aiSuggested; }); }
  bpRender();
}
function bpOnConfirm() {
  if (Math.round(bpSum()) > 100) return;
  const map = {};
  bpRows.forEach(r => { map[r.ticker] = r.current; });
  paSaveBaselinePct(map);
  bpOnBudgetChange();
  try { localStorage.setItem('pi_setup_done', '1'); } catch(e) {}
  paManualOverride = null;
  paViewMode = 'budget';

  // round32新增:勾了「同時套用到虛擬帳戶」才會問——二次確認,確定了才真的把這次設定的
  // 持股+比例存回帳戶(取代原本的持股清單)。用bpRows/map現算,不用等renderWatchlist()
  // 跑完更新paHoldings,兩者資料是一致的(同一份map剛存進paSaveBaselinePct())。
  const applyChk = $('bpAcctApplyChk');
  if (applyChk && applyChk.checked) {
    const zh = currentLang === 'zh';
    const msg = zh
      ? '確定要用這個配置更新虛擬帳戶嗎？這會取代帳戶原本的持股清單。'
      : 'Update your virtual account with this allocation? This will replace its current holdings.';
    if (confirm(msg)) {
      const state = acctLoad();
      if (state) {
        state.holdings = Object.keys(map).map(ticker => ({ ticker, pct: map[ticker] }));
        acctSave(state);
        acctState = state;
        // 資產可能整個換了,舊的抓分數快取跟舊的大師會診快取都不能繼續用——健診本來就是要
        // 使用者主動按才會重跑(不會自動觸發),所以這裡主動清快取,不能只靠之後剛好蓋掉。
        acctHoldingsData = {};
        try { sessionStorage.removeItem('dcacafe_jury_PORTFOLIO'); } catch(e) {}
      }
    }
  }

  pushScheduleSync();
  closeBaselineSheet();
  renderWatchlist(false);

  // round43修正:改成「雙重詢問」模式——不在這裡直接觸發iOS原生的通知詢問,
  // 先跳我們自己畫的說明彈窗(openPushPrePrompt),使用者在那邊按「開啟」才會
  // 真的觸發iOS原生詢問。已經訂閱過的裝置,不會再問。
  if (!pushGetSubscription()) {
    openPushPrePrompt();
  }
}
