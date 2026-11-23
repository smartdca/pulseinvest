/* 頁尾「DCA Score 累計計算次數」翻牌數字
 *
 * 由 chrome.js 在頁尾快要進入畫面時才載入。每約 30 秒向後台讀一次真實總數,
 * 新增多少就在下一個 30 秒內用對應的速度慢慢翻過去:新增少就慢,新增多就快。
 *
 * 原則:顯示的數字永遠不會超過真實總數(只追趕,不預測);沒有新增就停住,不自己亂跳。
 * 讀不到(後台失敗)就一直不顯示,不影響頁面其他東西。
 * 頁尾不在畫面內、或分頁在背景時,不翻也不去讀,省手機電量。
 */
(function () {
  'use strict';
  if (window.__dcaFooterCounter) return;
  window.__dcaFooterCounter = true;

  var ENDPOINT = 'https://proxy-three-mu-47.vercel.app/api/sheets?table=score-count-total';
  var POLL_MS = 30000;
  var MIN_GAP_MS = 10000;      // 回到畫面時的立即重讀,至少隔這麼久
  var SNAP_GAP = 1000;         // 落後超過這個量(久沒看)就先直接跳到接近,剩下的再翻
  var FLIP_MS = 200;           // 翻一張牌的時間(上半 + 下半)

  var box = document.getElementById('footerCount');
  var bd = document.getElementById('footerCountBd');
  if (!box || !bd) return;

  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  // ── 牌子樣式(顏色、圓角沿用頁尾社群圓形的淺灰與深灰字) ──
  var css = ''
    + '#footerCountBd{display:inline-flex;align-items:center;gap:2px;height:40px;}'
    + '#footerCountBd .fc-tile{position:relative;width:22px;height:40px;perspective:200px;font-family:inherit;font-weight:500;font-size:24px;line-height:40px;font-variant-numeric:tabular-nums;color:#424245;}'
    + '#footerCountBd .fc-h{position:absolute;left:0;right:0;height:20px;overflow:hidden;background:#e8e8ed;}'
    + '#footerCountBd .fc-h span{position:absolute;left:0;right:0;height:40px;line-height:40px;text-align:center;}'
    + '#footerCountBd .fc-t{top:0;border-radius:4px 4px 0 0;border-bottom:1px solid #d2d2d7;}'
    + '#footerCountBd .fc-t span{top:0;}'
    + '#footerCountBd .fc-m{bottom:0;border-radius:0 0 4px 4px;background:#e1e1e6;}'
    + '#footerCountBd .fc-m span{top:-20px;}'
    + '#footerCountBd .fc-ft{top:0;border-radius:4px 4px 0 0;transform-origin:50% 100%;backface-visibility:hidden;-webkit-backface-visibility:hidden;z-index:2;}'
    + '#footerCountBd .fc-ft span{top:0;}'
    + '#footerCountBd .fc-fb{bottom:0;border-radius:0 0 4px 4px;background:#e1e1e6;transform-origin:50% 0;transform:rotateX(90deg);backface-visibility:hidden;-webkit-backface-visibility:hidden;z-index:2;}'
    + '#footerCountBd .fc-fb span{top:-20px;}'
    + '#footerCountBd .fc-go .fc-ft{animation:fcTop .09s ease-in forwards;}'
    + '#footerCountBd .fc-go .fc-fb{animation:fcBot .09s ease-out .09s forwards;}'
    + '@keyframes fcTop{to{transform:rotateX(-90deg);}}'
    + '@keyframes fcBot{to{transform:rotateX(0);}}'
    + '#footerCountBd .fc-cm{width:6px;text-align:center;font-family:inherit;font-weight:500;font-size:20px;line-height:40px;color:#424245;}';
  var st = document.createElement('style');
  st.id = 'dcaFooterCounterCSS';
  st.textContent = css;
  document.head.appendChild(st);

  // ── 狀態 ──
  var tiles = [];
  var T = null;          // 後台給的真實總數
  var D = 0;             // 目前顯示的數字(永遠 <= T)
  var pace = 0;          // 每秒翻多少
  var lastFrame = 0;
  var raf = 0;
  var pollTimer = 0;
  var lastFetch = 0;
  var inView = false;

  function digitsOf(n) { return String(Math.floor(n)).length; }

  function build(count, initial) {
    bd.innerHTML = '';
    tiles = [];
    var s = String(Math.floor(initial)).padStart(count, '0');
    for (var i = 0; i < count; i++) {
      if (i > 0 && (count - i) % 3 === 0) {
        var c = document.createElement('div');
        c.className = 'fc-cm';
        c.textContent = ',';
        bd.appendChild(c);
      }
      var t = document.createElement('div');
      t.className = 'fc-tile';
      t.innerHTML = '<div class="fc-h fc-t"><span></span></div><div class="fc-h fc-m"><span></span></div>'
        + '<div class="fc-h fc-ft"><span></span></div><div class="fc-h fc-fb"><span></span></div>';
      bd.appendChild(t);
      var o = {
        el: t, cur: Number(s[i]), target: Number(s[i]), busy: false,
        top: t.querySelector('.fc-t span'), mid: t.querySelector('.fc-m span'),
        ft: t.querySelector('.fc-ft span'), fb: t.querySelector('.fc-fb span')
      };
      o.top.textContent = o.mid.textContent = o.ft.textContent = o.fb.textContent = o.cur;
      tiles.push(o);
    }
  }

  function step(o) {
    if (o.busy || o.cur === o.target) return;
    if (reduce) {
      o.cur = o.target;
      o.top.textContent = o.mid.textContent = o.ft.textContent = o.fb.textContent = o.cur;
      return;
    }
    o.busy = true;
    var nx = (o.cur + 1) % 10;
    o.top.textContent = nx;
    o.ft.textContent = o.cur;
    o.fb.textContent = nx;
    o.el.classList.remove('fc-go');
    void o.el.offsetWidth;
    o.el.classList.add('fc-go');
    setTimeout(function () {
      o.cur = nx;
      o.mid.textContent = nx;
      o.ft.textContent = nx;
      o.el.classList.remove('fc-go');
      o.busy = false;
      step(o);
    }, FLIP_MS);
  }

  function anyBusy() {
    for (var i = 0; i < tiles.length; i++) if (tiles[i].busy || tiles[i].cur !== tiles[i].target) return true;
    return false;
  }

  function active() { return inView && !document.hidden; }

  function frame(now) {
    raf = 0;
    if (!active()) return;
    var dt = lastFrame ? (now - lastFrame) / 1000 : 0;
    lastFrame = now;
    if (T !== null && D < T) D = Math.min(T, D + pace * dt);
    var s = String(Math.floor(D)).padStart(tiles.length, '0');
    for (var i = 0; i < tiles.length; i++) {
      tiles[i].target = Number(s[i]);
      step(tiles[i]);
    }
    if ((T !== null && D < T) || anyBusy()) raf = requestAnimationFrame(frame);
    else lastFrame = 0;
  }

  function kick() {
    if (!raf && active()) raf = requestAnimationFrame(frame);
  }

  function label() {
    var cap = document.getElementById('t-footer-count');
    box.setAttribute('aria-label', (cap ? cap.textContent + ' ' : '') + Math.floor(T).toLocaleString('en-US'));
  }

  function onTotal(n) {
    if (T === null) {               // 第一次:直接顯示,不從 0 翻起
      T = n; D = n;
      build(digitsOf(T), D);
      box.classList.add('is-on');
      label();
      return;
    }
    if (n < D) D = n;               // 理論上不會發生;保險起見不顯示超過真實總數
    T = n;
    if (digitsOf(T) > tiles.length) {
      // 位數增加(例如 999,999 → 1,000,010):直接重建,不翻
      D = T; build(digitsOf(T), D);
    }
    if (T - D > SNAP_GAP) D = T - 200;   // 久沒看,落後太多:先跳近,剩下的翻
    pace = (T - D) / (POLL_MS / 1000);
    label();
    kick();
  }

  function fetchTotal() {
    lastFetch = Date.now();
    try {
      fetch(ENDPOINT).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        if (j && j.ok && typeof j.total === 'number' && isFinite(j.total) && j.total >= 0) onTotal(j.total);
      }).catch(function () {});
    } catch (e) {}
  }

  function startPoll() {
    if (pollTimer) return;
    if (Date.now() - lastFetch > MIN_GAP_MS) fetchTotal();
    pollTimer = setInterval(fetchTotal, POLL_MS);
    kick();
  }
  function stopPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = 0; }
  }
  function sync() { if (active()) startPoll(); else stopPoll(); }

  document.addEventListener('visibilitychange', sync);
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      inView = es.some(function (e) { return e.isIntersecting; });
      sync();
    }, { rootMargin: '100px' });
    io.observe(box.parentNode || box);
  } else {
    inView = true;
    sync();
  }
})();
