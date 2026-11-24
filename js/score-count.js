/* js/score-count.js — DCA Score 計數器(前端回報端)
 *
 * 做什麼:每當頁面成功取到一次 DCA Score(呼叫 ticker-score 且回應有分數),
 *   就回報給後端「算了一次」。後端在 Proxy 的 api/sheets.js(?table=score-count),
 *   寫進試算表 ScoreCountLog 分頁。
 *
 * 為什麼用「攔 fetch」而不是在每個呼叫點各加一行:
 *   取分數的地方很多(首頁、資產頁、相關資產、熱搜、自選清單、泡泡頁、文章膠囊、Live…),
 *   而且之後每週還會新增資產頁。集中在這一支,新頁面只要載入這支就自動被算到,
 *   不會有人忘記加。代價是它掛在全域 fetch 上,所以寫得非常保守:
 *   任何錯誤都吞掉,而且絕不碰原本的 fetch 結果(只複製一份來讀)。
 *
 * 規則(Henry 定案):每次都算、每個代號各算一次;自己的瀏覽也算,但用 who 標記起來。
 *   - who:localStorage dca_team === '1'(即 ?team=on)→ team,否則 user
 *   - src:預設 auto(頁面載入就取);使用者自己輸入代號查詢要 manual
 *     (呼叫 window.dcaCountHint('manual', 'quick'|'calc') 再打 fetch,只管下一次呼叫)
 *   - ch:來源頁面,由網址路徑判斷;有 hint 時以 hint 為準
 *   - mode=quote(Live 的報價)、debug、hc(健康檢查)不是「算分數」,一律不算
 *
 * 心跳(Live 看板還開著)用 window.dcaBeat(ticker),不算進歷史總數。
 *
 * 後端網址與欄位說明見 Proxy 的 api/sheets.js 中段註解。
 */
(function () {
  'use strict';
  if (window.__dcaCountInit) return;
  window.__dcaCountInit = true;

  var ENDPOINT = 'https://proxy-three-mu-47.vercel.app/api/sheets?table=score-count';
  var BEAT_EVERY_MS = 10 * 60 * 1000;
  var MAX_PER_POST = 10;     // 後端一次最多收 10 個代號
  var FLUSH_MS = 400;        // 同一頁一次載入十幾個分數,合併成幾次請求

  function who() {
    try { return localStorage.getItem('dca_team') === '1' ? 'team' : 'user'; } catch (e) { return 'user'; }
  }

  function post(payload) {
    var body = JSON.stringify(payload);   // text/plain:不觸發預檢,sendBeacon 也是這樣送
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return;
    } catch (e) {}
    try {
      var f = window.__dcaOrigFetch || window.fetch;
      f.call(window, ENDPOINT, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(function () {});
    } catch (e) {}
  }

  // ── 來源頁面 ───────────────────────────────────────────────
  // 首頁:網址最後一段是空的(站根)或 index.html。不寫成整串路徑,避免被連結檢查當成寫死的連結。
  function isHomePath(p) { var leaf = p.split('/').pop(); return leaf === '' || leaf === 'index.html' || p === '/zh'; }
  function chByPath(url) {
    var p = location.pathname.replace(/^\/zh(?=\/)/, '') || '/';
    if (p.indexOf('/blog/') === 0) return 'blog-chip';
    if (p.indexOf('/asset/') === 0) return /[?&]full=1/.test(url) ? 'asset-page' : 'asset-related';
    if (p.indexOf('trending') >= 0) return 'trending';
    if (p.indexOf('live') >= 0 || p.indexOf('station-test') >= 0) return 'live';
    if (isHomePath(p)) return 'index-hot';
    return 'other';
  }
  function isHome() {
    var p = location.pathname.replace(/^\/zh(?=\/)/, '') || '/';
    return isHomePath(p);
  }

  // ── 手動／自動 hint:只管「下一次」ticker-score 呼叫 ──────────
  var hint = null;
  window.dcaCountHint = function (src, ch) {
    var c = ch;
    if (ch === 'quick') c = isHome() ? 'index-quick' : 'floating';
    hint = { src: src === 'manual' ? 'manual' : 'auto', ch: c };
  };

  // ── 佇列:同 src|ch 合併,延遲一下一起送 ────────────────────
  var queue = {};   // key -> { src, ch, t: [] }
  var timer = null;
  function enqueue(ticker, src, ch) {
    var k = src + '|' + ch;
    (queue[k] = queue[k] || { src: src, ch: ch, t: [] }).t.push(ticker);
    if (!timer) timer = setTimeout(flush, FLUSH_MS);
  }
  function flush() {
    timer = null;
    var q = queue; queue = {};
    var w = who();
    Object.keys(q).forEach(function (k) {
      var g = q[k];
      for (var i = 0; i < g.t.length; i += MAX_PER_POST) {
        post({ kind: 'calc', t: g.t.slice(i, i + MAX_PER_POST), src: g.src, who: w, ch: g.ch });
      }
    });
  }
  // ── 分數檔(scores.json):每天收盤後由排程抓好,首頁熱搜/泡泡頁/相關卡共用 ──
  // 這三處的計數規則(與計數器對話框定案):
  //   · 卡片/泡泡「真的出現在畫面上」才記一次(auto),沒滑到、沒浮上來的不記。
  //   · 同一次瀏覽、同一個 ch、同一個代號最多記一次,卡片重畫幾次都一樣。
  //   · 分數不管來自檔案還是後備的 ticker-score,都照這個規則;後備那支不經過攔截器,不會先記一次。
  //   · 點進資產頁那一次由資產頁自己記(asset-page),這裡不另外記。
  var seen = {};
  function countOnce(t, ch) {
    var c = ch || chByPath('');
    var k = c + '|' + t;
    if (seen[k]) return;
    seen[k] = 1;
    enqueue(t, 'auto', c);
  }
  // dcaCountShown(代號陣列, ch):這些代號已經顯示在畫面上,各記一次(同一次瀏覽重複呼叫不會重複記)
  window.dcaCountShown = function (tickers, ch) {
    try {
      (tickers || []).forEach(function (t) { if (t) countOnce(String(t).toUpperCase(), ch); });
    } catch (e) {}
  };
  // dcaCountWhenSeen(元素陣列, ch):元素上要有 data-count-tkr="代號"(只標有分數的卡)。
  //   元素一半以上進到畫面時記一次。不支援 IntersectionObserver 的舊瀏覽器就直接記。
  window.dcaCountWhenSeen = function (els, ch) {
    try {
      var list = Array.prototype.filter.call(els || [], function (el) { return el && el.getAttribute('data-count-tkr'); });
      var tk = function (el) { return el.getAttribute('data-count-tkr'); };
      if (!('IntersectionObserver' in window)) { window.dcaCountShown(list.map(tk), ch); return; }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { window.dcaCountShown([tk(en.target)], ch); io.unobserve(en.target); }
        });
      }, { threshold: 0.5 });
      list.forEach(function (el) { io.observe(el); });
    } catch (e) {}
  };

  var SCORES_MAX_AGE = 4 * 86400;   // 某支超過 4 天沒更新就不用檔案,改即時抓(長週末也夠)
  var scoresP = null, scoresT = 0;
  function loadScoresFile() {
    // 同一頁只讀一次;頁面開很久(例如泡泡頁離開太久回來重抓)超過 30 分鐘才重讀
    if (!scoresP || Date.now() - scoresT > 30 * 60 * 1000) {
      scoresT = Date.now(); liveP = {};
      scoresP = window.fetch('/scores.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          var out = {}, now = Date.now() / 1000, s = (j && j.scores) || {};
          Object.keys(s).forEach(function (k) {
            var e = s[k];
            if (e && typeof e.s === 'number' && isFinite(e.s) && now - (e.at || 0) < SCORES_MAX_AGE) out[k.toUpperCase()] = e.s;
          });
          return out;
        })
        .catch(function () { return {}; });
    }
    return scoresP;
  }
  // 後備:直接用原本的 fetch(不經過攔截器),計數交給上面「出現才記」的規則
  var liveP = {};   // 同一頁同一支只問一次(相關卡會重畫好幾次)
  function liveScore(q) {
    if (liveP[q]) return liveP[q];
    var f = window.__dcaOrigFetch || window.fetch;
    return liveP[q] = f.call(window, 'https://proxy-three-mu-47.vercel.app/api/ticker-score?ticker=' + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var s = j && (j.score != null ? j.score : (j.data && j.data.score));
        return (typeof s === 'number' && isFinite(s)) ? s : null;
      })
      .catch(function () { return null; });
  }
  // dcaGetScores(查詢代號陣列, ch) → Promise<{ 代號大寫: 分數 }>
  //   檔案有、而且夠新的直接用;沒有或太舊的那支才打 ticker-score。
  //   這裡不記次數,由頁面在卡片出現時呼叫 dcaCountWhenSeen / dcaCountShown。
  //   拿不到分數的代號不會出現在結果裡。
  window.dcaGetScores = function (queries, ch) {
    var qs = (queries || []).map(function (q) { return String(q || '').toUpperCase(); }).filter(Boolean);
    return loadScoresFile().then(function (file) {
      var res = {}, miss = [];
      qs.forEach(function (q) {
        if (q in res) return;
        if (q in file) res[q] = file[q];
        else if (miss.indexOf(q) < 0) miss.push(q);
      });
      return Promise.all(miss.map(function (q) {
        return liveScore(q).then(function (s) { if (s != null) res[q] = s; });
      })).then(function () { return res; });
    });
  };

  // 頁面要關了,還沒送的趕快送
  function flushNow() { if (timer) { clearTimeout(timer); flush(); } }
  window.addEventListener('pagehide', flushNow);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushNow(); });

  // ── 攔 fetch ───────────────────────────────────────────────
  var origFetch = window.fetch;
  if (typeof origFetch !== 'function') return;
  window.__dcaOrigFetch = origFetch;

  window.fetch = function (input, init) {
    var p = origFetch.apply(this, arguments);
    try {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      if (url.indexOf('/api/ticker-score') < 0) return p;
      if (/[?&](mode=quote|debug=|hc=)/.test(url)) { hint = null; return p; }
      var m = /[?&]ticker=([^&]+)/.exec(url);
      if (!m) { hint = null; return p; }
      var ticker = decodeURIComponent(m[1]).toUpperCase();
      var h = hint; hint = null;               // hint 只管這一次
      var src = h ? h.src : 'auto';
      var ch = h ? h.ch : chByPath(url);
      p.then(function (r) {
        if (!r || !r.ok) return;
        r.clone().json().then(function (j) {
          if (j && typeof j.score === 'number') enqueue(ticker, src, ch);
        }).catch(function () {});
      }).catch(function () {});
    } catch (e) { /* 計數壞掉不能影響原本的 fetch */ }
    return p;
  };

  // ── 心跳(Live 看板):打開時送一次,之後每 10 分鐘一次 ───────
  var beatTimer = null;
  var sid = (function () {
    var s = '';
    try { var a = new Uint8Array(9); crypto.getRandomValues(a); for (var i = 0; i < a.length; i++) s += a[i].toString(36); }
    catch (e) { s = String(Date.now()) + Math.floor(Math.random() * 1e6); }
    return s.slice(0, 20);
  })();
  function beat(ticker) {
    post({ kind: 'beat', t: [ticker], who: who(), ch: 'live', sid: sid });
  }
  // isActive:可選,回傳 false 就跳過這一次(例如看板暫停、沒人在看)
  window.dcaBeat = function (ticker, isActive) {
    try {
      if (beatTimer) clearInterval(beatTimer);
      var get = (typeof ticker === 'function') ? ticker : function () { return ticker; };
      var tick = function () {
        var t = get();
        if (t && (!isActive || isActive())) beat(String(t).toUpperCase());
      };
      tick();
      beatTimer = setInterval(tick, BEAT_EVERY_MS);
    } catch (e) {}
  };
})();
