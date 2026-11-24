/* js/asset-share.js — 資產頁底部膠囊:左「分享」、右「自選清單」(只在手機顯示)
 *
 * 樣式照首頁的膠囊(css/main.css .tab-bar),左邊那格亮著,跟首頁一樣。
 * 電腦版不顯示(跟首頁一致)。
 *
 * 【分享】
 *   在手機上用 canvas 畫一張 1080×1350 的分享卡,不經過後端、不存檔:
 *     上方是資產頁頁首的縮影(Logo、代號、公司名、咖啡豆、分數、杯型標籤),
 *     下方白色「杯套」放 DCAcafé 字標與網址。
 *   咖啡豆用資產頁同一段程式(js/asset-page.js 的 window.__beanSVG)。
 *   杯型標籤(Henry 定案):59 以下 中杯/Tall、60–79 大杯/Grande、80–89 特大杯/Venti、90 以上 超大杯/Trenta。
 *   iPhone 規定「按下去要立刻」叫分享選單,所以真分數一到(dca-asset-ready)就先把圖畫好放著,
 *   還沒畫好之前分享鍵是半透明、按了不動作。
 *   分享內容:圖片+網址(網址帶 utm 來源標記,GA4 看得出分享帶來的流量)。
 *   不支援分享檔案的瀏覽器改成下載圖片。
 *   Logo 只用網站自己存的圖(assets.js 的 DCA_LOGO_IMG);外部抓來的 Logo 畫進 canvas 會被
 *   瀏覽器擋住存檔,所以沒有本地圖就用代號文字方塊(跟網站其他地方的後備一樣)。
 *
 * 【自選清單】
 *   跟首頁同一套規則:從主畫面打開的 → 回首頁打開自選清單;
 *   在瀏覽器裡 → 跳「加入主畫面」彈窗(js/install-modal.js 的 requireSilverBean)。
 *
 * 兩顆都不記進 DCA Score 計數器;各記一個 GA4 事件(asset_share / asset_watchlist)。
 */
(function () {
  'use strict';
  if (window.__dcaAssetShare) return;
  window.__dcaAssetShare = true;

  var ZH = (typeof LANG !== 'undefined' ? LANG : window.DCA_LANG) === 'zh';
  var FONT = '-apple-system, BlinkMacSystemFont, "PingFang TC", "Helvetica Neue", Helvetica, Arial, sans-serif';
  var ZONES = [
    { max: 59,  main: '#FF453A', zh: '中杯',   en: 'Tall' },
    { max: 79,  main: '#FF9F0A', zh: '大杯',   en: 'Grande' },
    { max: 89,  main: '#30D158', zh: '特大杯', en: 'Venti' },
    { max: 100, main: '#30D158', zh: '超大杯', en: 'Trenta' }
  ];
  function zone(s) { for (var i = 0; i < ZONES.length; i++) if (s <= ZONES[i].max) return ZONES[i]; return ZONES[ZONES.length - 1]; }
  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function ga(name, params) { try { if (typeof gtag === 'function') gtag('event', name, params || {}); } catch (e) {} }

  /* ── 膠囊 ─────────────────────────────────────────────── */
  var css = document.createElement('style');
  css.textContent =
    '.ap-dock{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);z-index:200;display:flex;align-items:center;'
    + 'background:rgba(29,29,31,.78);backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);'
    + 'border-radius:44px;padding:5px 6px;gap:2px;width:fit-content;'
    + 'box-shadow:0 12px 36px rgba(0,0,0,.28),0 2px 8px rgba(0,0,0,.16),inset 0 1px 0 rgba(255,255,255,.08);}'
    + '.ap-dock button{flex:none;padding:8px 18px;border:none;background:transparent;border-radius:36px;font-size:11px;font-weight:500;'
    + 'color:rgba(255,255,255,.5);cursor:pointer;font-family:' + FONT + ';display:flex;flex-direction:column;align-items:center;gap:3px;white-space:nowrap;-webkit-tap-highlight-color:transparent;}'
    + '.ap-dock button .ti{font-size:19px;line-height:1;}'
    + '.ap-dock button.on{background:rgba(255,255,255,.16);color:#fff;}'
    + '.ap-dock button.wait{opacity:.45;}'
    + '@media (min-width:960px){.ap-dock{display:none !important;}}'
    + '@media (max-width:959px){#siteFooter .site-footer{padding-bottom:120px !important;}}';   // 頁尾最後一行不要被膠囊蓋住
  document.head.appendChild(css);

  var dock = document.createElement('div');
  dock.className = 'ap-dock';
  dock.setAttribute('role', 'navigation');
  dock.innerHTML =
    '<button type="button" class="on wait" id="apShare" aria-label="' + (ZH ? '分享' : 'Share') + '"><span class="ti">📤</span><span>' + (ZH ? '分享' : 'Share') + '</span></button>'
    + '<button type="button" id="apWatch" aria-label="' + (ZH ? '自選清單' : 'Watchlist') + '"><span class="ti">⭐</span><span>' + (ZH ? '自選清單' : 'Watchlist') + '</span></button>';
  document.body.appendChild(dock);
  var shareBtn = document.getElementById('apShare');

  document.getElementById('apWatch').addEventListener('click', function () {
    var t = (typeof COPY !== 'undefined' && COPY.asset && COPY.asset.ticker) || '';
    ga('asset_watchlist', { ticker: t });
    var ok = (typeof window.requireSilverBean === 'function') ? window.requireSilverBean() : true;
    if (!ok) return;
    var home = (typeof window.dcaHref === 'function') ? window.dcaHref('/') : '/';
    location.href = home + '#watchlist';
  });

  /* ── 分享卡 ───────────────────────────────────────────── */
  var FILE = null, building = false;

  function loadImg(src) {
    return new Promise(function (res) {
      if (!src) return res(null);
      var i = new Image();
      i.onload = function () { res(i); };
      i.onerror = function () { res(null); };
      i.src = src;
    });
  }
  function spaced(x, text, cx, y, gap) {   // 字距:不依賴 ctx.letterSpacing(舊版 Safari 沒有)
    var w = 0, i;
    for (i = 0; i < text.length; i++) w += x.measureText(text[i]).width + (i < text.length - 1 ? gap : 0);
    var px = cx - w / 2;
    x.textAlign = 'left';
    for (i = 0; i < text.length; i++) { x.fillText(text[i], px, y); px += x.measureText(text[i]).width + gap; }
    x.textAlign = 'center';
  }
  function roundRect(x, l, t, w, h, r) {
    x.beginPath();
    x.moveTo(l + r, t); x.lineTo(l + w - r, t); x.quadraticCurveTo(l + w, t, l + w, t + r);
    x.lineTo(l + w, t + h - r); x.quadraticCurveTo(l + w, t + h, l + w - r, t + h);
    x.lineTo(l + r, t + h); x.quadraticCurveTo(l, t + h, l, t + h - r);
    x.lineTo(l, t + r); x.quadraticCurveTo(l, t, l + r, t);
    x.closePath();
  }

  function build() {
    if (building || typeof COPY === 'undefined' || !COPY.asset || typeof COPY.asset.score !== 'number') return;
    building = true;
    var A = COPY.asset;
    var tk = String(A.ticker || '').toUpperCase();
    var score = Math.round(A.score);
    var z = zone(score);
    var co = ((A.company && (A.company[ZH ? 'zh' : 'en'] || A.company.en)) || '').split(' · ')[0];
    var slug = tk.toLowerCase();
    var logoSrc = (window.DCA_LOGO_IMG || {})[tk] || null;
    var beanSvg = (typeof window.__beanSVG === 'function') ? window.__beanSVG(score).replace('<svg width="220" height="220"', '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"') : '';
    var beanSrc = beanSvg ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(beanSvg) : null;

    Promise.all([loadImg(logoSrc), loadImg(beanSrc), loadImg('/IMG_9110.png')]).then(function (im) {
      var logo = im[0], bean = im[1], wm = im[2];
      var W = 1080, H = 1350, TOP = 1200;
      var c = document.createElement('canvas'); c.width = W; c.height = H;
      var x = c.getContext('2d');

      // 背景:深色漸層+分數顏色的光暈
      var g = x.createLinearGradient(0, 0, 0, TOP);
      g.addColorStop(0, '#16171a'); g.addColorStop(1, '#0b0c0e');
      x.fillStyle = g; x.fillRect(0, 0, W, TOP);
      var rg = x.createRadialGradient(W / 2, TOP * 0.58, 0, W / 2, TOP * 0.58, 700);
      rg.addColorStop(0, rgba(z.main, 0.22)); rg.addColorStop(1, rgba(z.main, 0));
      x.fillStyle = rg; x.fillRect(0, 0, W, TOP);

      // 頁首:Logo+代號+公司名,整組置中
      x.textBaseline = 'alphabetic';
      x.font = '800 84px ' + FONT; var wT = x.measureText(tk).width;
      x.font = '400 30px ' + FONT; var wC = x.measureText(co).width;
      var L = 120, gap = 30, rowW = L + gap + Math.max(wT, wC), lx = (W - rowW) / 2, ly = 92;
      x.save(); roundRect(x, lx, ly, L, L, 30); x.clip();
      if (logo) { x.drawImage(logo, lx, ly, L, L); }
      else {
        x.fillStyle = '#2a2a2e'; x.fillRect(lx, ly, L, L);
        x.fillStyle = '#fff'; x.font = '800 50px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(tk.replace(/[-.].*$/, '').slice(0, 2), lx + L / 2, ly + L / 2 + 2);
        x.textBaseline = 'alphabetic';
      }
      x.restore();
      x.textAlign = 'left';
      x.fillStyle = '#fff'; x.font = '800 84px ' + FONT; x.fillText(tk, lx + L + gap, ly + 72);
      x.fillStyle = '#8e8e93'; x.font = '400 30px ' + FONT; x.fillText(co, lx + L + gap, ly + 116);

      // 咖啡豆
      if (bean) x.drawImage(bean, (W - 500) / 2, 246, 500, 500);

      // 分數、DCA SCORE、杯型標籤
      x.textAlign = 'center';
      x.fillStyle = '#fff'; x.font = '900 210px ' + FONT; x.fillText(String(score), W / 2, 915);
      x.fillStyle = '#8e8e93'; x.font = '600 30px ' + FONT; spaced(x, 'DCA SCORE', W / 2, 990, 12);
      var tag = ZH ? z.zh : z.en;
      x.font = '700 32px ' + FONT;
      var tw = x.measureText(tag).width + 60, th = 70, tx = (W - tw) / 2, ty = 1026;
      roundRect(x, tx, ty, tw, th, th / 2);
      x.fillStyle = rgba(z.main, 0.12); x.fill();
      x.lineWidth = 2; x.strokeStyle = z.main; x.stroke();
      x.fillStyle = z.main; x.textBaseline = 'middle'; x.fillText(tag, W / 2, ty + th / 2 + 1); x.textBaseline = 'alphabetic';

      // 杯套:DCAcafé 字標+網址
      x.fillStyle = '#f4f2ec'; x.fillRect(0, TOP, W, H - TOP);
      if (wm) {
        var wh = 58, ww = wm.width * wh / wm.height;
        x.globalCompositeOperation = 'multiply';   // 字標圖是白底,疊乘後白底消失
        x.drawImage(wm, 64, TOP + (H - TOP - wh) / 2, ww, wh);
        x.globalCompositeOperation = 'source-over';
      }
      x.textAlign = 'right'; x.fillStyle = '#8a5a3a'; x.font = '600 34px ' + FONT; x.textBaseline = 'middle';
      x.fillText('dcacafe.com/asset/' + slug, W - 64, TOP + (H - TOP) / 2 + 1);

      c.toBlob(function (b) {
        building = false;
        if (!b) return;
        FILE = new File([b], slug + '-dca-score.png', { type: 'image/png' });
        shareBtn.classList.remove('wait');
      }, 'image/png');
    }).catch(function () { building = false; });
  }

  function shareUrl() {
    var t = (typeof COPY !== 'undefined' && COPY.asset && COPY.asset.ticker) || '';
    return location.origin + location.pathname + '?utm_source=share&utm_medium=asset_card&utm_campaign=' + encodeURIComponent(String(t).toLowerCase());
  }
  function download(f) {
    var u = URL.createObjectURL(f), a = document.createElement('a');
    a.href = u; a.download = f.name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 1000);
  }
  shareBtn.addEventListener('click', function () {
    if (!FILE) return;   // 圖還沒畫好(真分數還沒到)
    var t = (typeof COPY !== 'undefined' && COPY.asset && COPY.asset.ticker) || '';
    var data = { files: [FILE], url: shareUrl() };
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [FILE] })) {
      ga('asset_share', { ticker: t, method: 'share_sheet' });
      navigator.share(data).catch(function () { /* 使用者關掉選單,不用處理 */ });
    } else {
      ga('asset_share', { ticker: t, method: 'download' });
      download(FILE);
    }
  });

  if (window.__dcaAssetReady) build();
  document.addEventListener('dca-asset-ready', build);
})();
