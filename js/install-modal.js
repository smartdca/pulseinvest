/* js/install-modal.js — 「加入主畫面」彈窗（首頁與資產頁共用）
 *
 * 做什麼:
 *   自選清單這類「要存資料」的功能,只有從主畫面圖示打開(standalone)才放行;
 *   在瀏覽器裡按,就跳出這個彈窗教他加入主畫面。
 *   以前整段寫死在 index.html,資產頁的膠囊也要用,所以抽成這一支,兩頁讀同一份,
 *   文案改一次兩邊一起變。
 *
 * 對外的函式(維持原本的名字,首頁其他地方與 js/watchlist.js 等都直接呼叫):
 *   isStandaloneMode()          是不是從主畫面圖示打開
 *   isAndroidDevice()
 *   requireSilverBean()         standalone 就回 true;否則開彈窗、回 false
 *   openInstallModal(reason)    reason='silverbean' 會多顯示 Silver Bean 權益那段
 *   closeInstallModal()
 *   installApplyLang()          語言切換時重畫(首頁 setLang 會呼叫)
 *   installAndroidPWA()         Android 一鍵安裝
 *
 * 語言:首頁讀 currentLang,資產頁讀 LANG(網址鎖定),都沒有就看 <html lang>。
 * 頁面差異:只有第 3 步不同。資產頁加入的是「這一頁」,主畫面出現的是本頁圖示,
 *   不是 DCAcafé 圖示,所以網址在 /asset/ 底下時換句子。
 * 彈窗的 HTML 第一次打開時才放進頁面。
 */
(function () {
  'use strict';
  if (window.__dcaInstallModal) return;
  window.__dcaInstallModal = true;

  var ACC = 'color:#c8813a;';
  var BEAN = '<img src="/images/silver-bean-v3.png" style="width:20px;height:20px;object-fit:contain;vertical-align:-4px;margin:0 2px;" alt=""><b style="' + ACC + '">Silver Bean</b>';
  var STR = {
    zh: {
      tagline: '圍繞你而設計的投資體驗。',
      head: '只差一步，解鎖完整投資追蹤',
      subIOS: '加入主畫面，免費升級 ' + BEAN + ' 會員——自選清單、每日精選推播，通通解鎖。',
      subAndroid: '安裝 DCAcafé，免費升級 ' + BEAN + ' 會員——自選清單、每日精選推播，通通解鎖。',
      step1: '<b style="color:#1c1c1e;">Safari</b>：點網址列左邊的 <strong style="' + ACC + '">☰</strong>，再點 <strong style="' + ACC + '">分享</strong><br>'
           + '<b style="color:#1c1c1e;">Chrome</b>：點網址列右邊的 <strong style="' + ACC + '">分享</strong> 圖示',
      step2: '往下滑，點選 <strong style="' + ACC + '">「加入主畫面」</strong>',
      step3: '點右上角 <strong style="' + ACC + '">「新增」</strong>，完成！桌面會出現 DCAcafé 圖示。',
      step3Asset: '點右上角 <strong style="' + ACC + '">「新增」</strong>，完成！主畫面出現本頁圖示。',
      got: '知道了',
      joinBtn: '馬上加入',
      androidInstallText: '點下方按鈕，系統會跳出安裝確認，一鍵完成，不需要任何額外設定。',
      androidInstallBtn: '安裝 DCAcafé',
      androidSkip: '下次再說'
    },
    en: {
      tagline: 'An investing experience designed around you.',
      head: "You're one step away",
      subIOS: 'Add to Home Screen to unlock ' + BEAN + ' membership for free — watchlist and daily top-pick alerts, all unlocked.',
      subAndroid: 'Install DCAcafé to unlock ' + BEAN + ' membership for free — watchlist and daily top-pick alerts, all unlocked.',
      step1: '<b style="color:#1c1c1e;">Safari</b>: tap <strong style="' + ACC + '">☰</strong> on the left of the address bar, then <strong style="' + ACC + '">Share</strong><br>'
           + '<b style="color:#1c1c1e;">Chrome</b>: tap the <strong style="' + ACC + '">Share</strong> icon on the right of the address bar',
      step2: 'Scroll down and tap <strong style="' + ACC + '">"Add to Home Screen"</strong>',
      step3: 'Tap <strong style="' + ACC + '">"Add"</strong> in the top-right corner — done! The DCAcafé icon will appear on your home screen.',
      step3Asset: 'Tap <strong style="' + ACC + '">"Add"</strong> in the top-right corner — done! This page’s icon will appear on your home screen.',
      got: 'Got it',
      joinBtn: 'Join Now',
      androidInstallText: 'Tap below — your browser will show a native install confirmation. No extra steps needed.',
      androidInstallBtn: 'Install DCAcafé',
      androidSkip: 'Maybe later'
    }
  };

  function lang() {
    try { if (typeof currentLang !== 'undefined') return currentLang === 'zh' ? 'zh' : 'en'; } catch (e) {}
    try { if (typeof LANG !== 'undefined') return LANG === 'zh' ? 'zh' : 'en'; } catch (e) {}
    return (document.documentElement.lang || '').indexOf('zh') === 0 ? 'zh' : 'en';
  }
  function isAssetPage() { return /\/asset\//.test(location.pathname); }

  window.isStandaloneMode = function () {
    try {
      return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    } catch (e) { return false; }
  };
  window.isAndroidDevice = function () { return /Android/i.test(navigator.userAgent); };

  // Chrome 的安裝提示不會自己跳,要先攔下來,等使用者按我們的「安裝」才觸發(瀏覽器規定的做法)
  var deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredInstallPrompt = e;
  });
  window.installAndroidPWA = function () {
    if (!deferredInstallPrompt) { window.closeInstallModal(); return; }
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(function () { deferredInstallPrompt = null; });
    window.closeInstallModal();
  };

  var FONT = 'font-family:var(--font-sans,-apple-system,BlinkMacSystemFont,"PingFang TC",sans-serif);';
  function num(n) {
    return '<div style="background:#c8813a;color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;' + FONT + 'font-size:12px;font-weight:700;flex-shrink:0;">' + n + '</div>';
  }
  function step(n) {
    return '<div style="display:flex;align-items:flex-start;gap:14px;">' + num(n)
      + '<p id="t-pwa-step' + n + '" style="' + FONT + 'font-size:14px;color:#1c1c1e;line-height:1.5;padding-top:3px;margin:0;"></p></div>';
  }
  function ensureDom() {
    var m = document.getElementById('installModal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'installModal';
    m.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:flex-end;justify-content:center;';
    m.innerHTML =
      '<div style="background:#fff;border-radius:20px 20px 0 0;padding:24px 24px 40px;width:100%;max-width:480px;box-sizing:border-box;">'
      + '<div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">'
      +   '<span style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:14px;overflow:hidden;flex-shrink:0;background:#fff;border:1px solid #d1d1d6;box-shadow:0 1px 3px rgba(0,0,0,0.12);"><img src="/IMG_9104.png" style="width:44px;height:44px;object-fit:contain;display:block;" alt=""></span>'
      +   '<div><img src="/IMG_9110.png" alt="DCAcafé" style="height:22px;max-width:140px;object-fit:contain;display:block;">'
      +   '<div id="t-pwa-tagline-m" style="' + FONT + 'font-size:13px;color:#6e6e73;margin-top:4px;"></div></div>'
      + '</div>'
      + '<div id="installPitch" style="display:none;margin-bottom:20px;">'
      +   '<p id="installPitchHead" style="' + FONT + 'font-size:18px;font-weight:700;color:#1a1a1a;line-height:1.35;margin:0 0 6px;"></p>'
      +   '<p id="installPitchSub" style="' + FONT + 'font-size:14px;color:#555;line-height:1.6;margin:0;"></p>'
      + '</div>'
      + '<div id="installStepsIOS" style="display:flex;flex-direction:column;gap:16px;">' + step(1) + step(2) + step(3) + '</div>'
      + '<div id="installRowAndroid" style="display:none;align-items:center;gap:12px;background:#f7f7f8;border-radius:14px;padding:14px 16px;margin-bottom:4px;">'
      +   '<div style="font-size:22px;flex-shrink:0;">📲</div>'
      +   '<div id="installAndroidText" style="flex:1;' + FONT + 'font-size:13px;color:#6e6e73;line-height:1.5;"></div>'
      + '</div>'
      + '<button type="button" id="t-pwa-got" style="display:block;width:100%;margin-top:24px;background:#f2f2f7;border:none;border-radius:12px;padding:14px;' + FONT + 'font-size:15px;font-weight:600;color:#1c1c1e;cursor:pointer;"></button>'
      + '<button type="button" id="installAndroidBtn" style="display:none;width:100%;margin-top:24px;background:#c8813a;border:none;border-radius:12px;padding:14px;' + FONT + 'font-size:15px;font-weight:700;color:#fff;cursor:pointer;"></button>'
      + '<button type="button" id="installAndroidSkip" style="display:none;width:100%;margin-top:10px;background:none;border:none;padding:10px;' + FONT + 'font-size:14px;color:#999;cursor:pointer;"></button>'
      + '</div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target === m) window.closeInstallModal(); });
    document.getElementById('t-pwa-got').onclick = function () { window.closeInstallModal(); };
    document.getElementById('installAndroidBtn').onclick = function () { window.installAndroidPWA(); };
    document.getElementById('installAndroidSkip').onclick = function () { window.closeInstallModal(); };
    return m;
  }

  var openReason = null;
  window.installApplyLang = function () {
    var m = document.getElementById('installModal');
    if (!m) return;   // 還沒打開過,不用畫
    var S = STR[lang()];
    var android = window.isAndroidDevice();
    var $ = function (id) { return document.getElementById(id); };
    $('t-pwa-tagline-m').textContent = S.tagline;
    $('t-pwa-step1').innerHTML = S.step1;
    $('t-pwa-step2').innerHTML = S.step2;
    $('t-pwa-step3').innerHTML = isAssetPage() ? S.step3Asset : S.step3;
    if (openReason === 'silverbean') {
      $('installPitch').style.display = 'block';
      $('installPitchHead').textContent = S.head;
      $('installPitchSub').innerHTML = android ? S.subAndroid : S.subIOS;
    } else {
      $('installPitch').style.display = 'none';
    }
    if (android) {
      $('installStepsIOS').style.display = 'none';
      $('installRowAndroid').style.display = 'flex';
      $('installAndroidText').textContent = S.androidInstallText;
      $('t-pwa-got').style.display = 'none';
      $('installAndroidBtn').style.display = 'block';
      $('installAndroidBtn').textContent = S.androidInstallBtn;
      $('installAndroidSkip').style.display = 'block';
      $('installAndroidSkip').textContent = S.androidSkip;
    } else {
      $('installStepsIOS').style.display = 'flex';
      $('installRowAndroid').style.display = 'none';
      $('t-pwa-got').style.display = 'block';
      $('t-pwa-got').textContent = openReason === 'silverbean' ? S.joinBtn : S.got;
      $('installAndroidBtn').style.display = 'none';
      $('installAndroidSkip').style.display = 'none';
    }
  };
  window.openInstallModal = function (reason) {
    var m = ensureDom();
    openReason = reason || null;
    window.installApplyLang();
    m.style.display = 'flex';
  };
  window.closeInstallModal = function () {
    var m = document.getElementById('installModal');
    if (m) m.style.display = 'none';
  };
  // 所有「需要儲存」的功能入口先呼叫這支:standalone 放行,否則跳解鎖引導、回 false
  window.requireSilverBean = function () {
    if (window.isStandaloneMode()) return true;
    window.openInstallModal('silverbean');
    return false;
  };
})();
