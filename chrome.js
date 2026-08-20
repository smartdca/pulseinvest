/* ══════════════════════════════════════════════════════════════════
   DCAcafé 共用頁首 / 頁尾 / 安裝彈窗(sub-page chrome)
   用法:頁面放 <div id="siteHeader"></div> 與 <div id="siteFooter"></div>,
        末尾 <script src="chrome.js"></script>。
   語言:讀寫 localStorage['dcacafe_lang'];語言鈕按下時,chrome 換自己的字,
        再呼叫 window.applyPageLang(lang) 並發出 'dca:lang' 事件,由各頁重繪自己的內文。
   ════════════════════════════════════════════════════════════════════ */
(function () {
  var LANGKEY = 'dcacafe_lang';
  var FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Helvetica Neue',Arial,sans-serif";
  function getLang() { return localStorage.getItem(LANGKEY) === 'zh' ? 'zh' : 'en'; }

  var T = {
    en: {
      footerInsights: 'Insights', footerPrivacy: 'Privacy Policy',
      footerCopy: '\u00a9 2026 DCAcaf\u00e9. All rights reserved.',
      footerDisclaimer: 'DCAcaf\u00e9 is an informational tool only and does not constitute financial or investment advice. All investment decisions are made solely at your own risk. Past performance is not indicative of future results. Market data provided by Yahoo Finance.',
      pwaTagline: 'An investing experience designed around you.',
      pwaStep1: 'Tap the <strong style="color:#c8813a;">Share</strong> icon in the toolbar below (the square with an arrow)',
      pwaStep2: 'Scroll down and tap <strong style="color:#c8813a;">"Add to Home Screen"</strong>',
      pwaStep3: 'Tap <strong style="color:#c8813a;">"Add"</strong> in the top right \u2014 done! The DCAcaf\u00e9 icon will appear on your home screen.',
      pwaGot: 'Got it',
      navExplore: 'Explore DCA Café', navInsights: 'Insights', navContact: 'Contact Us', navLang: 'Language'
    },
    zh: {
      footerInsights: '\u6295\u8cc7\u898b\u89e3', footerPrivacy: '\u96b1\u79c1\u653f\u7b56',
      footerCopy: '\u00a9 2026 DCAcaf\u00e9 \u7248\u6b0a\u6240\u6709',
      footerDisclaimer: 'DCAcaf\u00e9 \u50c5\u4f9b\u53c3\u8003\uff0c\u4e0d\u69cb\u6210\u4efb\u4f55\u6295\u8cc7\u5efa\u8b70\u3002\u6240\u6709\u6295\u8cc7\u6c7a\u7b56\u98a8\u96aa\u7531\u4f7f\u7528\u8005\u81ea\u884c\u627f\u64d4\u3002\u904e\u53bb\u7e3e\u6548\u4e0d\u4ee3\u8868\u672a\u4f86\u7d50\u679c\u3002\u5e02\u5834\u6578\u64da\u4f86\u6e90\uff1aYahoo Finance\u3002',
      pwaTagline: '\u570d\u7e5e\u4f60\u800c\u8a2d\u8a08\u7684\u6295\u8cc7\u9ad4\u9a57\u3002',
      pwaStep1: '\u9ede\u4e0b\u65b9\u5de5\u5177\u5217\u7684 <strong style="color:#c8813a;">\u5206\u4eab</strong> \u5716\u793a\uff08\u65b9\u6846\u52a0\u5411\u4e0a\u7bad\u982d\uff09',
      pwaStep2: '\u5f80\u4e0b\u6ed1\uff0c\u9ede\u9078 <strong style="color:#c8813a;">\u300c\u52a0\u5165\u4e3b\u756b\u9762\u300d</strong>',
      pwaStep3: '\u9ede\u53f3\u4e0a\u89d2 <strong style="color:#c8813a;">\u300c\u65b0\u589e\u300d</strong>\uff0c\u5b8c\u6210\uff01\u684c\u9762\u6703\u51fa\u73fe DCAcaf\u00e9 \u5716\u793a\u3002',
      pwaGot: '\u77e5\u9053\u4e86',
      navExplore: '探索 DCA Café', navInsights: '投資見解', navContact: '聯絡我們', navLang: '支援語言'
    }
  };

  var CSS = ''
    + '#siteHeader nav{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;background:#fff;border-bottom:1px solid #e6e6ea;position:sticky;top:0;z-index:100;box-shadow:0 1px 8px rgba(0,0,0,.05);}'
    + '#siteHeader .nav-logo{display:flex;align-items:center;text-decoration:none;}'
    + '#siteHeader .nav-right{display:flex;align-items:center;gap:14px;}'
    + '#siteHeader .nav-lang{display:flex;gap:6px;}'
    + '#siteHeader .lang-btn{padding:4px 12px;font-size:11px;border-radius:16px;border:1px solid #e6e6ea;background:transparent;font-weight:500;color:#6e6e73;cursor:pointer;font-family:' + FONT + ';transition:all .25s cubic-bezier(.4,0,.2,1);}'
    + '#siteHeader .lang-btn.active{background:#1d1d1f;color:#fff;border-color:#1d1d1f;}'
    + '#siteFooter .site-footer{background:#f5f5f7;border-top:1px solid #e6e6ea;padding:30px 20px 44px;margin-top:0;}'
    + '#siteFooter .site-footer-inner{max-width:520px;margin:0 auto;}'
    + '#siteFooter .site-footer-top{display:flex;flex-direction:column;gap:12px;margin-bottom:22px;background:#fff;padding:15px 17px;border-radius:14px;box-shadow:0 1px 2px rgba(0,0,0,.04),0 8px 24px rgba(0,0,0,.05);}'
    + '#siteFooter .footer-brand{display:flex;align-items:center;flex-shrink:0;}'
    + '#siteFooter .footer-brand span{color:#c8813a;}'
    + '#siteFooter .footer-links{display:flex;gap:20px;flex-wrap:wrap;align-items:center;}'
    + '#siteFooter .footer-links a{font-size:14px;color:#6e6e73;text-decoration:none;}'
    + '#siteFooter .footer-links a:hover{color:#1d1d1f;}'
    + '#siteFooter .site-footer-top a{-webkit-text-decoration:none;text-decoration:none;background:transparent!important;color:#6e6e73!important;font-size:14px;white-space:nowrap;}'
    + '#siteFooter .footer-divider{height:1px;background:#e6e6ea;margin:0 0 14px;}'
    + '#siteFooter .footer-copy{font-size:11px;color:#9a9a9f;font-family:' + FONT + ';}'
    + '#siteFooter .footer-disclaimer{font-size:11px;color:#9a9a9f;line-height:1.6;margin-top:12px;}'
    /* 2026-08-20新增:桌機限定漢堡選單,跟index.html web.css同一套設計(hover展開,
       語言切換獨立一欄)。手機完全不受影響(.nav-menu-trigger預設display:none,
       只在≥960px media query開啟;lang-toggle在桌機才隱藏)。 */
    + '.nav-menu-trigger{display:none;}'
    + '@media (min-width:960px){'
    + '#siteHeader .nav-lang{display:none;}'
    + '.nav-menu-trigger{display:flex;align-items:center;flex-shrink:0;}'
    + '.hamburger-btn{background:none;border:none;padding:10px;cursor:pointer;color:#1d1d1f;display:flex;align-items:center;justify-content:center;border-radius:8px;transition:background .15s ease;}'
    + '.hamburger-btn:hover{background:#f5f5f7;}'
    + '.nav-menu-panel{display:none;position:absolute;top:100%;left:0;right:0;background:#f5f5f7;border-top:1px solid #e6e6ea;box-shadow:0 12px 32px rgba(0,0,0,.1);}'
    + '.nav-menu-trigger:hover .nav-menu-panel,.nav-menu-panel:hover{display:block;}'
    + '.nav-menu-inner{max-width:1200px;margin:0 auto;padding:56px max(40px,calc((100vw - 1200px) / 2 + 40px));display:flex;justify-content:flex-end;gap:96px;}'
    + '.nav-menu-heading{font-size:13px;letter-spacing:1.6px;text-transform:uppercase;color:#9a9a9f;font-weight:600;margin-bottom:22px;}'
    + '.nav-menu-link{display:block;font-size:20px;font-weight:500;color:#1d1d1f;text-decoration:none;margin-bottom:20px;letter-spacing:-.2px;}'
    + '.nav-menu-link:hover{color:#c8813a;}'
    + '.nav-menu-lang{display:flex;flex-direction:column;}'
    + '.nav-menu-lang-btn{display:block;background:none;border:none;padding:0;text-align:left;font-size:20px;font-weight:500;color:#9a9a9f;cursor:pointer;margin-bottom:20px;letter-spacing:-.2px;}'
    + '.nav-menu-lang-btn:hover{color:#1d1d1f;}'
    + '.nav-menu-lang-btn.active{color:#c8813a;}'
    + '#siteHeader nav{position:fixed;top:0;left:0;right:0;z-index:200;-webkit-transform:translateZ(0);transform:translateZ(0);}'
    + '}';

  var HEADER = ''
    + '<nav>'
    + '<a class="nav-logo" href="/">'
    + '<img src="/IMG_9110.png" alt="DCAcaf\u00e9" height="32" style="display:inline-block;vertical-align:middle;max-width:160px;object-fit:contain;" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline\'">'
    + '<span style="display:none;font-family:' + FONT + ';font-weight:700;font-size:20px;">DCA<span style="color:#c8813a;">cafe</span></span>'
    + '</a>'
    + '<div class="nav-right"><div class="nav-lang">'
    + '<button class="lang-btn" data-lang="en">EN</button>'
    + '<button class="lang-btn" data-lang="zh">\u4e2d\u6587</button>'
    + '</div>'
    + '<div class="nav-menu-trigger">'
    + '<button class="hamburger-btn" aria-label="Menu" aria-expanded="false">'
    + '<svg width="20" height="14" viewBox="0 0 20 14" fill="none"><line x1="0" y1="1" x2="20" y2="1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="0" y1="7" x2="20" y2="7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="0" y1="13" x2="20" y2="13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
    + '</button>'
    + '<div class="nav-menu-panel"><div class="nav-menu-inner">'
    + '<div class="nav-menu-col"><div class="nav-menu-heading" id="t-navmenu-explore"></div>'
    + '<a class="nav-menu-link" href="/insights.html" id="t-navmenu-insights"></a>'
    + '<a class="nav-menu-link" href="mailto:help@dcacafe.com" id="t-navmenu-contact"></a></div>'
    + '<div class="nav-menu-col nav-menu-lang"><div class="nav-menu-heading" id="t-navmenu-lang"></div>'
    + '<button class="nav-menu-lang-btn" data-lang="en">English</button>'
    + '<button class="nav-menu-lang-btn" data-lang="zh">\u4e2d\u6587</button></div>'
    + '</div></div>'
    + '</div>'
    + '</div>'
    + '</nav>';

  var FOOTER = ''
    + '<footer class="site-footer"><div class="site-footer-inner"><div class="site-footer-top">'
    + '<a class="footer-brand" href="/" style="text-decoration:none;">'
    + '<img src="/IMG_9110.png" alt="DCAcaf\u00e9" height="20" style="max-width:110px;object-fit:contain;" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline-block\'">'
    + '<span style="display:none;font-family:' + FONT + ';font-weight:700;font-size:15px;color:#1d1d1f;">DCA<span style="color:#c8813a;">cafe</span></span>'
    + '</a>'
    + '<div class="footer-links" style="display:flex;align-items:center;justify-content:space-between;width:100%;">'
    + '<div style="display:flex;gap:20px;align-items:center;">'
    + '<a href="/insights.html" id="t-footer-insights">Insights</a>'
    + '<a href="/privacy.html" id="t-footer-privacy">Privacy Policy</a>'
    + '</div>'
    + '<div style="display:flex;gap:14px;align-items:center;">'
    + '<a href="mailto:help@dcacafe.com" id="t-footer-contact" aria-label="Contact Us" style="display:flex;align-items:center;line-height:1;text-decoration:none;"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="#6e6e73"><path d="M22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6zm-2 0-8 5-8-5h16zm0 12H4V8l8 5 8-5v10z"/></svg></a>'
    + '<button onclick="openInstallModal()" aria-label="Add to Home Screen" style="background:none;border:none;padding:0;cursor:pointer;display:flex;align-items:center;"><span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;background:#fff;border:1px solid #d1d1d6;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.12);"><img src="/IMG_9104.png" alt="DCAcaf\u00e9" style="width:24px;height:24px;object-fit:contain;display:block;"></span></button>'
    + '</div></div>'
    + '</div>'
    + '<div class="footer-divider"></div>'
    + '<div class="footer-bottom"><div class="footer-copy" id="t-footer-copy"></div></div>'
    + '<div class="footer-disclaimer" id="t-footer-disclaimer"></div>'
    + '</div></footer>';

  var MODAL = ''
    + '<div id="installModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:flex-end;justify-content:center;">'
    + '<div style="background:#fff;border-radius:20px 20px 0 0;padding:28px 24px 48px;width:100%;max-width:480px;">'
    + '<div style="display:flex;align-items:center;gap:14px;margin-bottom:24px;">'
    + '<span style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:14px;overflow:hidden;flex-shrink:0;background:#fff;border:1px solid #d1d1d6;box-shadow:0 1px 3px rgba(0,0,0,0.12);"><img src="/IMG_9104.png" style="width:44px;height:44px;object-fit:contain;display:block;"></span>'
    + '<div><img src="/IMG_9110.png" alt="DCAcaf\u00e9" style="height:22px;max-width:140px;object-fit:contain;display:block;"><div id="t-pwa-tagline-m" style="font-family:' + FONT + ';font-size:13px;color:#6e6e73;margin-top:4px;"></div></div>'
    + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:16px;">'
    + '<div style="display:flex;align-items:flex-start;gap:14px;"><div style="background:#c8813a;color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:' + FONT + ';font-size:12px;font-weight:700;flex-shrink:0;">1</div><p id="t-pwa-step1" style="font-family:' + FONT + ';font-size:14px;color:#1c1c1e;line-height:1.5;padding-top:3px;"></p></div>'
    + '<div style="display:flex;align-items:flex-start;gap:14px;"><div style="background:#c8813a;color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:' + FONT + ';font-size:12px;font-weight:700;flex-shrink:0;">2</div><p id="t-pwa-step2" style="font-family:' + FONT + ';font-size:14px;color:#1c1c1e;line-height:1.5;padding-top:3px;"></p></div>'
    + '<div style="display:flex;align-items:flex-start;gap:14px;"><div style="background:#c8813a;color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:' + FONT + ';font-size:12px;font-weight:700;flex-shrink:0;">3</div><p id="t-pwa-step3" style="font-family:' + FONT + ';font-size:14px;color:#1c1c1e;line-height:1.5;padding-top:3px;"></p></div>'
    + '</div>'
    + '<button id="t-pwa-got" onclick="closeInstallModal()" style="display:block;width:100%;margin-top:24px;background:#f2f2f7;border:none;border-radius:12px;padding:14px;font-family:' + FONT + ';font-size:15px;font-weight:600;color:#1c1c1e;cursor:pointer;"></button>'
    + '</div></div>';

  function set(id, v, html) { var e = document.getElementById(id); if (e) { if (html) e.innerHTML = v; else e.textContent = v; } }

  function renderChrome(l) {
    var t = T[l];
    set('t-footer-insights', t.footerInsights);
    set('t-footer-privacy', t.footerPrivacy);
    set('t-footer-copy', t.footerCopy);
    set('t-footer-disclaimer', t.footerDisclaimer);
    set('t-pwa-tagline-m', t.pwaTagline);
    set('t-pwa-step1', t.pwaStep1, true);
    set('t-pwa-step2', t.pwaStep2, true);
    set('t-pwa-step3', t.pwaStep3, true);
    set('t-pwa-got', t.pwaGot);
    set('t-navmenu-explore', t.navExplore);
    set('t-navmenu-insights', t.navInsights);
    set('t-navmenu-contact', t.navContact);
    set('t-navmenu-lang', t.navLang);
    var btns = document.querySelectorAll('#siteHeader .lang-btn, #siteHeader .nav-menu-lang-btn');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].getAttribute('data-lang') === l);
    document.documentElement.lang = l === 'zh' ? 'zh-Hant' : 'en';
  }

  function setLang(l) {
    l = (l === 'zh') ? 'zh' : 'en';
    localStorage.setItem(LANGKEY, l);
    renderChrome(l);
    if (typeof window.applyPageLang === 'function') { try { window.applyPageLang(l); } catch (e) { console.error(e); } }
    window.dispatchEvent(new CustomEvent('dca:lang', { detail: l }));
  }

  window.openInstallModal = function () { var m = document.getElementById('installModal'); if (m) m.style.display = 'flex'; };
  window.closeInstallModal = function () { var m = document.getElementById('installModal'); if (m) m.style.display = 'none'; };
  window.dcaSetLang = setLang;

  function inject() {
    if (!document.getElementById('dcaChromeCSS')) {
      var s = document.createElement('style'); s.id = 'dcaChromeCSS'; s.textContent = CSS; document.head.appendChild(s);
    }
    var h = document.getElementById('siteHeader'); if (h) h.innerHTML = HEADER;
    var f = document.getElementById('siteFooter'); if (f) f.innerHTML = FOOTER;
    if (!document.getElementById('installModal')) {
      var wrap = document.createElement('div'); wrap.innerHTML = MODAL;
      var modal = wrap.firstChild; document.body.appendChild(modal);
      modal.addEventListener('click', function (e) { if (e.target === modal) window.closeInstallModal(); });
    }
    var btns = document.querySelectorAll('#siteHeader .lang-btn, #siteHeader .nav-menu-lang-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () { setLang(this.getAttribute('data-lang')); });
    }
    renderChrome(getLang());
    if (typeof window.applyPageLang === 'function') { try { window.applyPageLang(getLang()); } catch (e) { console.error(e); } }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();
