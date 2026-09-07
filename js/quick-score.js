// ============================================================
// quick-score.js — 浮動 DCA Score 快速查詢(可獨立掛載的元件)
//
// 【怎麼用】
//   任何一頁加上這一行就有這個功能,不加就沒有:
//       <script src="js/quick-score.js?v=5"></script>
//   面板的 HTML 由本檔自己注入,不需要在頁面裡貼任何標記。
//   樣式沿用 css/main.css 裡既有的 .qs-* 規則(每一頁本來就會載入 main.css)。
//   開啟方式:呼叫 openQuickScore()。首頁是底部分頁列第一顆按鈕。
//
// 【資料來源:單一請求,不在前端組裝分數】
//   直接問後端「這個代號幾分」(api/ticker-score),一次請求拿到分數與價格。
//   刻意不走首頁 calculate() 那條(fetchData + fetchVIX + fmp + api/score):
//     ① 那條要 3～4 次外部請求,而且必須通過 Turnstile —— Turnstile 綁定自家網域,
//        結構上離不開首頁,這個元件就永遠搬不出去。
//     ② api/score 接受任意輸入,呼叫端越多、對外暴露面越大。
//        長期目標是把 api/score 對外的入口關掉,新做的東西一律不再增加呼叫點。
//   分數不會因此不同:ticker-score 與 api/score 共用同一份 calcScore。
//
// 【可有可無的相依,全部有就用、沒有就降級,絕不因此壞掉】
//   pickArcGauge  (js/ui-widgets.js) — 沒有就不畫儀表,其餘照常
//   getLogoUrl / autoLookupLogo (js/logo.js) — 沒有就顯示代號首字母
//   acSearch      (首頁) — 沒有就退回純輸入框,自行輸入完整代號一樣查得到
//   switchTab / calculate (首頁) — 沒有就跳回首頁帶代號,由首頁自動開始計算
//
// 【語言】
//   自帶中英文案,不依賴任何一頁的翻譯字典。切語言時呼叫 quickScoreApplyLang()。
// ============================================================

(function () {
  'use strict';

  var ENDPOINT = 'https://proxy-three-mu-47.vercel.app/api/ticker-score';

  var TXT = {
    en: {
      title: 'Quick DCA Score',
      loading: 'Calculating…',
      full: 'Full Analysis',
      reset: 'Recalculate',
      empty: 'Please enter a ticker',
      notfound: 'Ticker not found. Please check the symbol and try again.',
      busy: 'Too many requests. Please wait a moment and try again.',
      fail: 'Could not load data. Please try again later.'
    },
    zh: {
      title: '快速查詢 DCA SCORE',
      loading: '計算中…',
      full: '完整分析',
      reset: '重新計算',
      empty: '請輸入股票代號',
      notfound: '找不到這個代號，請確認後再試一次。',
      busy: '短時間內查詢次數過多，請稍等一下再試。',
      fail: '資料暫時無法取得，請稍後再試。'
    }
  };

  // 語言判斷依序:首頁的 currentLang → 拆分後頁面的 window.DCA_LANG → 網址前綴。
  // 三條都取不到就走英文(站台預設)。
  function lang() {
    try {
      if (typeof currentLang !== 'undefined' && currentLang) return currentLang === 'zh' ? 'zh' : 'en';
      if (window.DCA_LANG) return window.DCA_LANG === 'zh' ? 'zh' : 'en';
      if (/^\/zh(\/|$)/.test(location.pathname)) return 'zh';
    } catch (e) {}
    return 'en';
  }
  function t(key) { return TXT[lang()][key]; }
  function el(id) { return document.getElementById(id); }

  var lastResult = null;

  // 結構、class、id 與先前寫在 index.html 裡的完全一致,確保 css/main.css 的既有樣式
  // 一個字都不用改。事件改成 JS 掛載(不寫 inline onclick),才能對缺席的相依做防呆。
  var MARKUP =
    '<div class="qs-backdrop" id="qsBackdrop">' +
    '<div class="qs-sheet" id="qsSheet">' +
      '<div class="qs-handle"></div>' +
      '<div class="qs-header">' +
        '<div class="qs-title">✨ <span id="t-qstitle"></span></div>' +
        '<button class="qs-close" id="qsCloseBtn">✕</button>' +
      '</div>' +
      '<div class="qs-inputrow" id="qsInputRow">' +
        '<div class="ac-wrap" style="flex:1;">' +
          '<input type="text" id="qsTicker" placeholder="AAPL · 0050.TW · BTC-USD" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" data-form-type="other" data-lpignore="true">' +
          '<div class="ac-dropdown" id="qsAcDrop"></div>' +
        '</div>' +
        '<button class="qs-go" id="qsGoBtn"><span id="t-qsgo">→</span></button>' +
      '</div>' +
      '<div class="qs-loading" id="qsLoading"><span class="kline-loader" style="height:15px;"><span style="height:15px;"></span><span style="height:15px;"></span><span style="height:15px;"></span></span> <span id="t-qsloading"></span></div>' +
      '<div class="qs-err" id="qsErr"></div>' +
      '<div class="qs-result" id="qsResult">' +
        '<div class="qs-resultcard">' +
          '<span class="rm-logo" id="qsLogo">—</span>' +
          '<div class="rm-idblock">' +
            '<span class="rm-ticker" id="qsRName">—</span>' +
            '<span class="rm-price" id="qsRPrice">—</span>' +
          '</div>' +
          '<span class="rm-score" id="qsRScore">—</span>' +
          '<span class="rm-gauge" id="qsRGauge"></span>' +
        '</div>' +
        '<div class="qs-result-actions">' +
          '<div class="qs-link" id="qsFullLink">🔍 <span id="t-qslink"></span></div>' +
          '<div class="qs-link secondary" id="qsResetLink">🔄 <span id="t-qsreset"></span></div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '</div>';

  // ── 掛載 ──────────────────────────────────────────────────
  function mount() {
    if (el('qsBackdrop')) return; // 已經有了(重複載入)就不再注入第二份
    var holder = document.createElement('div');
    holder.innerHTML = MARKUP;
    while (holder.firstChild) document.body.appendChild(holder.firstChild);
    bind();
    applyLang();
  }

  function bind() {
    var backdrop = el('qsBackdrop'), sheet = el('qsSheet'), input = el('qsTicker');

    if (backdrop) backdrop.addEventListener('click', closeQuickScore);
    // 點面板本身不要穿透到遮罩,否則點輸入框就把面板關掉
    if (sheet) sheet.addEventListener('click', function (e) { e.stopPropagation(); });

    var closeBtn = el('qsCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeQuickScore);

    var goBtn = el('qsGoBtn');
    if (goBtn) goBtn.addEventListener('click', runQuickScore);

    var fullLink = el('qsFullLink');
    if (fullLink) fullLink.addEventListener('click', goToFullAnalysis);

    var resetLink = el('qsResetLink');
    if (resetLink) resetLink.addEventListener('click', resetQuickScore);

    if (input) {
      // 注意:這裡刻意不改寫 input.value。iOS 注音輸入法在 input 事件裡改值會重複字,
      // 清理一律留到按下查詢時才做(跟站上其他輸入框同一套處理)。
      input.addEventListener('input', function () {
        if (typeof acSearch === 'function') acSearch('qsTicker', 'qsAcDrop');
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); runQuickScore(); }
      });
    }
  }

  function applyLang() {
    var map = { 't-qstitle': 'title', 't-qsloading': 'loading', 't-qslink': 'full', 't-qsreset': 'reset' };
    for (var id in map) {
      var node = el(id);
      if (node) node.textContent = t(map[id]);
    }
  }

  // ── 取分數:一次請求 ─────────────────────────────────────────
  // 回傳形狀維持與先前一致(ticker / price / currency / score),
  // 首頁「今日一杯」也是呼叫這支,兩邊不需要各自處理。
  async function quickCalculateScore(ticker) {
    var res;
    try {
      res = await fetch(ENDPOINT + '?ticker=' + encodeURIComponent(ticker));
    } catch (e) {
      throw new Error('__FAIL__');
    }
    if (!res.ok) {
      if (res.status === 400) throw new Error('__NOTFOUND__');
      if (res.status === 429) throw new Error('__BUSY__');
      throw new Error('__FAIL__');
    }
    var d = await res.json();
    if (!d || typeof d.score !== 'number') throw new Error('__FAIL__');
    return {
      ticker: d.ticker || ticker.toUpperCase(),
      companyName: d.ticker || ticker.toUpperCase(),
      price: (typeof d.price === 'number') ? d.price : null,
      currency: d.currency || '',
      score: d.score
    };
  }

  function errorText(e) {
    var m = (e && e.message) || '';
    if (m === '__NOTFOUND__') return t('notfound');
    if (m === '__BUSY__') return t('busy');
    return t('fail');
  }

  // ── Logo:有 logo.js 就用,沒有就顯示首字母 ──────────────────
  function setQsLogo(ticker) {
    var node = el('qsLogo');
    if (!node) return;
    // 後備文字取前四碼,跟全站共用的 showTickerFallback 一致。
    // 曾經只取第一個字,結果 0050.TW 的後備顯示成孤零零一個「0」。
    var letter = String(ticker || '?').slice(0, 4);
    node.innerHTML = '';
    if (typeof getLogoUrl === 'function') {
      var url = getLogoUrl(ticker);
      if (url) {
        var img = document.createElement('img');
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit;';
        img.onerror = function () { node.textContent = letter; };
        img.src = url;
        node.appendChild(img);
        return;
      } else if (typeof autoLookupLogo === 'function') {
        var img2 = document.createElement('img');
        img2.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit;';
        img2.onerror = function () { node.textContent = letter; };
        node.appendChild(img2);
        autoLookupLogo(ticker, img2);
        return;
      }
    }
    node.textContent = letter;
  }

  // ── 開關 ──────────────────────────────────────────────────
  function openQuickScore() {
    mount(); // 保險:萬一在 DOM 就緒前就被呼叫,這裡補掛一次
    if (!el('qsBackdrop')) return;
    el('qsBackdrop').classList.add('open');
    el('qsSheet').classList.add('open');
    el('qsResult').classList.remove('show');
    el('qsInputRow').style.display = 'flex';
    el('qsErr').classList.remove('show');
    el('qsLoading').classList.remove('show');
    el('qsTicker').value = '';
    setTimeout(function () { if (el('qsTicker')) el('qsTicker').focus(); }, 350);
  }

  function closeQuickScore() {
    if (!el('qsBackdrop')) return;
    el('qsBackdrop').classList.remove('open');
    el('qsSheet').classList.remove('open');
    if (el('qsTicker')) el('qsTicker').blur();
  }

  // 「重新計算」——清掉目前結果,輸入列重新出現,不用整個面板重開
  function resetQuickScore() {
    if (!el('qsResult')) return;
    el('qsResult').classList.remove('show');
    el('qsInputRow').style.display = 'flex';
    el('qsErr').classList.remove('show');
    el('qsTicker').value = '';
    lastResult = null;
    setTimeout(function () { if (el('qsTicker')) el('qsTicker').focus(); }, 100);
  }

  // ── 查詢 ──────────────────────────────────────────────────
  async function runQuickScore() {
    var input = el('qsTicker');
    if (!input) return;
    input.value = input.value.replace(/[^A-Za-z0-9.-]/g, '').toUpperCase();
    var ticker = input.value.trim();

    el('qsErr').classList.remove('show');
    if (!ticker) {
      el('qsErr').textContent = t('empty');
      el('qsErr').classList.add('show');
      return;
    }

    el('qsResult').classList.remove('show');
    el('qsLoading').classList.add('show');
    el('qsGoBtn').disabled = true;

    try {
      var r = await quickCalculateScore(ticker);
      lastResult = r;
      var s = r.score;
      var numColor = s >= 60 ? '#2e9e5b' : s >= 20 ? '#d9a441' : '#d9534f';
      setQsLogo(ticker);
      el('qsRName').textContent = ticker;
      el('qsRPrice').textContent = (typeof r.price === 'number')
        ? (r.price.toFixed(2) + (r.currency ? ' ' + r.currency : ''))
        : '—';
      el('qsRScore').textContent = s.toFixed(0);
      el('qsRScore').style.color = numColor;
      var gauge = el('qsRGauge');
      if (gauge) {
        gauge.innerHTML = (typeof pickArcGauge === 'function')
          ? pickArcGauge(s / 100, ['red', 'amber', 'green', 'green'], 40, false)
          : '';
      }
      // 結果出現後,輸入列隱藏,畫面只留結果那一條,不會兩種狀態同時出現
      el('qsInputRow').style.display = 'none';
      el('qsResult').classList.add('show');
    } catch (e) {
      el('qsErr').textContent = errorText(e);
      el('qsErr').classList.add('show');
    } finally {
      el('qsLoading').classList.remove('show');
      el('qsGoBtn').disabled = false;
    }
  }

  // ── 完整分析 ───────────────────────────────────────────────
  // 只帶代號過去,分數不繼承 —— 完整分析需要的資料(走勢圖、五因子、倍數、滑桿)
  // 比這張卡多得多,傳一半再補一半會出現「分數是舊的、圖是新的」對不起來的狀況,
  // 所以一律重算。這是先前就有的行為,不是本次改動。
  function goToFullAnalysis() {
    if (!lastResult) return;
    var ticker = lastResult.ticker;
    closeQuickScore();

    var onHomepage = (typeof switchTab === 'function') &&
                     (typeof calculate === 'function') &&
                     !!el('ticker');

    if (onHomepage) {
      switchTab('advisor', false);
      setTimeout(function () {
        el('ticker').value = ticker;
        calculate();
      }, 350);
      return;
    }

    // 其他頁面:回首頁帶代號,首頁載入時本來就會接手自動計算(部落格 chip 走的是同一條)。
    var path = '/index.html';
    try { if (typeof dcaHref === 'function') path = dcaHref(path); } catch (e) {}
    location.href = path + '?ticker=' + encodeURIComponent(ticker);
  }

  // ── 對外 ──────────────────────────────────────────────────
  window.openQuickScore = openQuickScore;
  window.closeQuickScore = closeQuickScore;
  window.resetQuickScore = resetQuickScore;
  window.runQuickScore = runQuickScore;
  window.goToFullAnalysis = goToFullAnalysis;
  window.quickCalculateScore = quickCalculateScore;
  window.setQsLogo = setQsLogo;
  window.quickScoreApplyLang = applyLang;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
