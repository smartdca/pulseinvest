/* app-badge.js — 資產頁加入主畫面後的「桌面圖示紅點 = 這一檔的 DCA Score」
   只在「從桌面圖示打開」(standalone)時動作;在 Safari 一般瀏覽完全不做事。
   - 用自己的 service worker 範圍(只涵蓋這一頁),推播訂閱跟 DCAcafé 主圖示分開,互不覆蓋
   - 第一次打開:跳提示 → 使用者同意 → 訂閱推播(後端每個交易日推一次,順便更新紅點)
   - 剛開啟時先放一次目前分數當紅點;之後只靠每天台北 09:05 的推播更新(收盤分數)
   由 scripts/build-assets.py 只插在有開放的資產頁;代號從 script 標籤的 data-* 讀。 */
(function () {
  var me = document.currentScript;
  if (!me) return;
  var NAME = me.getAttribute('data-name');      // 顯示用,例如 NVDA
  var QUERY = me.getAttribute('data-query');    // 算分用,例如 NVDA / BTC-USD
  if (!NAME || !QUERY) return;

  var standalone = window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  if (!standalone) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;

  var LANG = window.DCA_LANG === 'zh' ? 'zh' : 'en';
  var API = 'https://proxy-three-mu-47.vercel.app/api';
  var VAPID = 'BLl5pgOFmyRFhH4XBM7W6allr4yTFNvMbvAf0zzQl1DmHDNxMy7lX_pYqHZtwrOghd0Mp78KcKOf-m8ziNjZNEo';
  var KEY_DECIDED = 'dca_app_decided_' + NAME;
  var SCOPE = location.pathname;                // 只涵蓋這一頁,跟主圖示(範圍 /)分開

  var S = {
    zh: { t: '開啟每日 ' + NAME + ' DCA Score',
          d: '每個交易日，小紅點上的數字<br>會更新成 ' + NAME + ' 最新的分數，<br>顯示在桌面不用開就看得到。<br>每個交易日都會收到分數通知。',
          a: '開啟', x: '不用，謝謝',
          denied: '通知權限之前被關掉了，<br>要到手機「設定」裡重新開啟。' },
    en: { t: 'Get ' + NAME + '\u2019s DCA Score daily',
          d: 'Every trading day, the badge on this icon<br>updates to ' + NAME + '\u2019s latest score \u2014<br>right on your Home Screen, no tap needed.<br>One score notification per trading day.',
          a: 'Turn On', x: 'Not Now',
          denied: 'Notifications are turned off for this icon. You can turn them back on in Settings.' }
  }[LANG];

  function u8(b64) {
    var pad = '='.repeat((4 - b64.length % 4) % 4);
    var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function decided() { try { return localStorage.getItem(KEY_DECIDED) === '1'; } catch (e) { return false; } }
  function setDecided() { try { localStorage.setItem(KEY_DECIDED, '1'); } catch (e) {} }

  // 抓最新分數,直接更新紅點(需要已經允許通知)
  function refreshBadge() {
    if (Notification.permission !== 'granted' || !('setAppBadge' in navigator)) return;
    fetch(API + '/ticker-score?ticker=' + encodeURIComponent(QUERY))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (typeof d.score === 'number') navigator.setAppBadge(Math.round(d.score)).catch(function () {});
      }).catch(function () {});
  }

  function saveSub(sub) {
    var j = sub.toJSON();
    return fetch(API + '/sheets?table=push-subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys, tickers: [QUERY], lang: LANG, kind: 'asset' })
    });
  }

  var regP = navigator.serviceWorker.register('/sw.js', { scope: SCOPE });

  function subscribe() {
    return Notification.requestPermission().then(function (p) {
      if (p !== 'granted') return false;
      return regP.then(function (reg) {
        return reg.pushManager.getSubscription().then(function (sub) {
          return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(VAPID) });
        });
      }).then(function (sub) {
        return saveSub(sub).then(function () {
          if (typeof gtag === 'function') gtag('event', 'app_badge_subscribe', { ticker: NAME });
          refreshBadge();
          return true;
        });
      });
    }).catch(function () { return false; });
  }

  function modal(html, buttons) {
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:24px;';
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:20px;padding:32px 24px;max-width:360px;width:100%;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,.18);';
    box.innerHTML = html;
    ov.appendChild(box);
    buttons.forEach(function (b) { box.appendChild(b); });
    document.body.appendChild(ov);
    return ov;
  }
  function btn(text, primary, fn) {
    var b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = primary
      ? 'display:block;width:100%;background:#c8813a;color:#fff;border:none;border-radius:12px;padding:14px;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:8px;'
      : 'background:none;border:none;color:#999;font-size:14px;cursor:pointer;padding:8px;';
    b.addEventListener('click', fn);
    return b;
  }

  function showPrompt() {
    var icon = '<div style="position:relative;width:72px;height:72px;margin:0 auto 16px;">' +
      '<img src="/app/' + NAME.toLowerCase() + '.png" alt="" style="width:72px;height:72px;border-radius:16px;display:block;">' +
      '<span style="position:absolute;top:-10px;right:-14px;background:#eb4d3d;color:#fff;font-weight:600;font-size:16px;border-radius:15px;padding:4px 9px;" id="dcaAppBadgeNum">··</span></div>';
    var html = icon +
      '<h2 style="font-size:18px;font-weight:700;margin:0 0 8px;color:#1a1a1a;">' + S.t + '</h2>' +
      '<p style="font-size:13px;color:#888;margin:0 0 20px;line-height:1.6;">' + S.d + '</p>';
    var ov;
    var yes = btn(S.a, true, function () {
      setDecided();
      ov.remove();
      subscribe();
    });
    var no = btn(S.x, false, function () { setDecided(); ov.remove(); });
    ov = modal(html, [yes, no]);
    // 提示裡的紅點顯示今天真正的分數
    fetch(API + '/ticker-score?ticker=' + encodeURIComponent(QUERY))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var el = document.getElementById('dcaAppBadgeNum');
        if (el && typeof d.score === 'number') el.textContent = Math.round(d.score);
      }).catch(function () {});
  }

  function start() {
    if (Notification.permission === 'granted') {
      // 已允許:確認這個圖示自己的訂閱還在(沒有就補訂),再更新紅點
      // 紅點平常只靠每天早上的推播更新(收盤分數),打開時不另外更新,免得晚上開盤後變成盤中分數
      regP.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
        if (!sub) return subscribe();
      }).catch(function () {});
      return;
    }
    if (decided()) return;
    if (Notification.permission === 'denied') return;
    showPrompt();
  }

  if (document.readyState === 'complete') setTimeout(start, 600);
  else window.addEventListener('load', function () { setTimeout(start, 600); });
})();
