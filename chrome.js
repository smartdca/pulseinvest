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
  /* ══ 中英雙網址(2026-09-02)══════════════════════════════════
     頁面若在 <head> 設了 window.DCA_LANG_LOCKED = true,表示它是
     「一個網址一種語言」的檔案(/asset/aapl.html 英文、/zh/asset/aapl.html 中文)。
     這種頁面:語言由網址決定,語言鈕改成真的 <a href>,Google 跟得過去。
     還沒轉換的頁面完全維持原本行為(localStorage + <button>),不受影響。 */
  var LOCKED = (window.DCA_LANG_LOCKED === true);
  var URLZH  = /^\/zh(\/|$)/.test(location.pathname);

  /* 已經有中文版的頁面。做好一支就在這裡加一行(填英文版的路徑)。
     沒列在這裡的路徑,fhref() 不會加 /zh 前綴,避免連到不存在的網址。 */
  var ZH_READY = [
    '/asset/aapl.html'
  ];
  function hasZh(path) {
    var p = String(path).split('#')[0].split('?')[0];
    if (p === '/') p = '/index.html';
    return ZH_READY.indexOf(p) >= 0;
  }

  /* 這一頁的「另一個語言」網址,query 與錨點原樣帶過去 */
  function langHref(l) {
    var base = location.pathname.replace(/^\/zh(?=\/|$)/, '') || '/';
    var tail = (location.search || '') + (location.hash || '');
    if (l === 'zh' && hasZh(base)) return '/zh' + base + tail;
    return base + tail;
  }

  function getLang() {
    if (LOCKED) return URLZH ? 'zh' : 'en';
    return localStorage.getItem(LANGKEY) === 'zh' ? 'zh' : 'en';
  }

  /* 鎖定頁把語言寫回 localStorage:使用者從 /zh 頁點到「還沒轉換」的頁面時,
     那些頁面仍然讀 localStorage,語言才不會突然跳回英文。 */
  if (LOCKED) { try { localStorage.setItem(LANGKEY, URLZH ? 'zh' : 'en'); } catch (e) {} }

  /* 語言鈕:鎖定頁產生 <a href>(給 Google 跟),其餘維持 <button> 原行為 */
  function langCtl(cls, l, label) {
    if (LOCKED) return '<a class="' + cls + '" data-lang="' + l + '" href="' + langHref(l) + '">' + label + '</a>';
    return '<button class="' + cls + '" data-lang="' + l + '">' + label + '</button>';
  }

  var T = {
    en: {
      footerInsights: 'Insights', footerPrivacy: 'Privacy Policy',
      /* ══ 頁尾網站地圖(2026-09-01改版)══ */
      fgStart:'Get started', fgLearn:'Go deeper', fgMember:'Member features', fgAbout:'About DCAcaf\u00e9',
      fStrategy:'Strategy DCA', fBacktest:'Backtest', fTrending:'Trending', fAssets:'Asset pages',
      fLearn:'Learning Space', fInsightsLink:'Insights',
      fWatchlist:'Watchlist', fPaper:'Paper account', fInstall:'Add to Home Screen',
      fPrivacy:'Privacy Policy', fValues:'Our thinking', fContact:'Contact us',
      fLangLabel:'Language',
      footerNote:'DCAcaf\u00e9 helps you decide how much to put in and when, using a single score built from market data. It is a tool for thinking, not a recommendation to buy or sell anything.',
      footerCopy: '\u00a9 2026 DCAcaf\u00e9. All rights reserved.',
      footerDisclaimer: 'DCAcaf\u00e9 is an informational tool only and does not constitute financial or investment advice. All investment decisions are made solely at your own risk. Past performance is not indicative of future results. Market data provided by Yahoo Finance. All data provided on DCAcaf\u00e9 is provided for informational purposes only, and is not intended for trading or investing purposes. Figures shown across the site are calculated from different data windows and sampling methods, so the same measure may differ slightly from one page to another.',
      pwaTagline: 'An investing experience designed around you.',
      pwaStep1: 'Tap the <strong style="color:#c8813a;">Share</strong> icon in the toolbar below (the square with an arrow)',
      pwaStep2: 'Scroll down and tap <strong style="color:#c8813a;">"Add to Home Screen"</strong>',
      pwaStep3: 'Tap <strong style="color:#c8813a;">"Add"</strong> in the top right \u2014 done! The DCAcaf\u00e9 icon will appear on your home screen.',
      pwaGot: 'Got it',
      navExplore: 'Explore DCA Café', navInsights: 'Insights', navContact: 'Contact Us', navLang: 'Language',
      navBacktest: 'Backtest', navLearn: 'Learn'
    },
    zh: {
      footerInsights: '\u6295\u8cc7\u898b\u89e3', footerPrivacy: '\u96b1\u79c1\u653f\u7b56',
      /* ══ 頁尾網站地圖(2026-09-01改版)══ */
      fgStart:'\u958b\u59cb\u67e5\u770b', fgLearn:'\u6df1\u5165\u4e86\u89e3', fgMember:'\u6703\u54e1\u529f\u80fd', fgAbout:'\u95dc\u65bc DCAcaf\u00e9',
      fStrategy:'\u7b56\u7565 DCA', fBacktest:'\u6b77\u53f2\u56de\u6e2c', fTrending:'\u4eba\u6c23\u71b1\u641c', fAssets:'\u8cc7\u7522\u9801\u9762',
      fLearn:'\u5b78\u7fd2\u7a7a\u9593', fInsightsLink:'\u6295\u8cc7\u898b\u89e3',
      fWatchlist:'\u81ea\u9078\u6e05\u55ae', fPaper:'\u865b\u64ec\u5e33\u6236', fInstall:'\u52a0\u5165\u4e3b\u756b\u9762',
      fPrivacy:'\u96b1\u79c1\u653f\u7b56', fValues:'\u50f9\u503c\u7406\u5ff5', fContact:'\u806f\u7d61\u6211\u5011',
      fLangLabel:'\u8a9e\u8a00',
      footerNote:'DCAcaf\u00e9 \u7528\u4e00\u500b\u7531\u5e02\u5834\u6578\u64da\u7d44\u6210\u7684\u5206\u6578\uff0c\u5e6b\u4f60\u770b\u61c2\u73fe\u5728\u9069\u5408\u6295\u5165\u591a\u5c11\u3001\u4ec0\u9ebc\u6642\u5019\u6295\u5165\u3002\u5b83\u662f\u4e00\u500b\u7528\u4f86\u601d\u8003\u7684\u5de5\u5177\uff0c\u4e0d\u662f\u8cb7\u8ce3\u5efa\u8b70\u3002',
      footerCopy: '\u00a9 2026 DCAcaf\u00e9 \u7248\u6b0a\u6240\u6709',
      footerDisclaimer: 'DCAcaf\u00e9 \u50c5\u4f9b\u53c3\u8003\uff0c\u4e0d\u69cb\u6210\u4efb\u4f55\u6295\u8cc7\u5efa\u8b70\u3002\u6240\u6709\u6295\u8cc7\u6c7a\u7b56\u98a8\u96aa\u7531\u4f7f\u7528\u8005\u81ea\u884c\u627f\u64d4\u3002\u904e\u53bb\u7e3e\u6548\u4e0d\u4ee3\u8868\u672a\u4f86\u7d50\u679c\u3002\u5e02\u5834\u6578\u64da\u4f86\u6e90\uff1aYahoo Finance\u3002\u7ad9\u4e0a\u5404\u9801\u7684\u8a08\u7b97\u6240\u53d6\u7684\u8cc7\u6599\u5340\u9593\u8207\u53d6\u6a23\u65b9\u5f0f\u4e0d\u5b8c\u5168\u76f8\u540c\uff0c\u540c\u4e00\u9805\u6578\u5b57\u5728\u4e0d\u540c\u9801\u9762\u53ef\u80fd\u6703\u6709\u5c0f\u5e45\u843d\u5dee\u3002DCAcaf\u00e9 \u6240\u63d0\u4f9b\u4e4b\u6240\u6709\u8cc7\u6599\u50c5\u4f9b\u53c3\u8003\u4e4b\u7528\uff0c\u4e26\u975e\u7528\u65bc\u4ea4\u6613\u6216\u6295\u8cc7\u6c7a\u7b56\u4e4b\u76ee\u7684\u3002',
      pwaTagline: '\u570d\u7e5e\u4f60\u800c\u8a2d\u8a08\u7684\u6295\u8cc7\u9ad4\u9a57\u3002',
      pwaStep1: '\u9ede\u4e0b\u65b9\u5de5\u5177\u5217\u7684 <strong style="color:#c8813a;">\u5206\u4eab</strong> \u5716\u793a\uff08\u65b9\u6846\u52a0\u5411\u4e0a\u7bad\u982d\uff09',
      pwaStep2: '\u5f80\u4e0b\u6ed1\uff0c\u9ede\u9078 <strong style="color:#c8813a;">\u300c\u52a0\u5165\u4e3b\u756b\u9762\u300d</strong>',
      pwaStep3: '\u9ede\u53f3\u4e0a\u89d2 <strong style="color:#c8813a;">\u300c\u65b0\u589e\u300d</strong>\uff0c\u5b8c\u6210\uff01\u684c\u9762\u6703\u51fa\u73fe DCAcaf\u00e9 \u5716\u793a\u3002',
      pwaGot: '\u77e5\u9053\u4e86',
      navExplore: '探索 DCA Café', navInsights: '投資見解', navContact: '聯絡我們', navLang: '支援語言',
      navBacktest: '歷史回測', navLearn: '學習'
    }
  };

  var CSS = ''
    + '#siteHeader nav{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;background:#fff;border-bottom:1px solid #e6e6ea;position:sticky;top:0;z-index:100;box-shadow:0 1px 8px rgba(0,0,0,.05);}'
    + '#siteHeader .nav-logo{display:flex;align-items:center;text-decoration:none;}'
    + '#siteHeader .nav-right{display:flex;align-items:center;gap:14px;}'
    + '#siteHeader .nav-lang{display:flex;gap:6px;}'
    + '#siteHeader .lang-btn{padding:4px 12px;font-size:11px;border-radius:16px;border:1px solid #e6e6ea;background:transparent;font-weight:500;color:#6e6e73;cursor:pointer;font-family:' + FONT + ';transition:all .25s cubic-bezier(.4,0,.2,1);}'
    + '#siteHeader .lang-btn.active{background:#1d1d1f;color:#fff;border-color:#1d1d1f;}'
    /* ══ 頁尾字級:自成一套,不跟任何頁面共用 ══
       全站各頁的基準字級與字型都不一樣(insights/jury 15px、資產頁 16px、
       privacy 用 DM Sans),頁尾是唯一到處出現的元件,所以一律寫死、
       一律指定字型、選擇器一律帶 #siteFooter 前綴,不受各頁影響。
       要調字級只改下面這一組變數。手機值在這裡,桌機值在媒體查詢裡。 */
    + '#siteFooter{--ff-group:16px;--ff-link:15px;--ff-note:13px;--ff-mini:12px;'
    +   'font-family:' + FONT + ';}'
    + '#siteFooter .site-footer{background:#f5f5f7;border-top:1px solid #e6e6ea;padding:34px 22px 40px;}'
    + '#siteFooter .site-footer-inner{max-width:1120px;margin:0 auto;}'
    /* 頂部註腳:蘋果頁尾的開頭那段極小字 */
    + '#siteFooter .footer-note{font-size:var(--ff-mini);line-height:1.7;color:#86868b;padding-bottom:18px;border-bottom:1px solid #d2d2d7;}'
    /* 分組:手機摺疊(details),桌機展開成多欄 */
    + '#siteFooter .footer-cols{display:block;}'
    + '#siteFooter .fgroup{border-bottom:1px solid #d2d2d7;}'
    + '#siteFooter .fgroup > summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:17px 2px;font-size:var(--ff-group);font-weight:600;color:#1d1d1f;}'
    + '#siteFooter .fgroup > summary::-webkit-details-marker{display:none;}'
    + '#siteFooter .fgroup > summary::after{content:\'\';width:8px;height:8px;border-right:1.5px solid #86868b;border-bottom:1.5px solid #86868b;transform:rotate(45deg);margin-right:4px;transition:transform .2s ease;}'
    + '#siteFooter .fgroup[open] > summary::after{transform:rotate(-135deg);}'
    + '#siteFooter .flist{list-style:none;padding:0 0 16px;margin:0;}'
    + '#siteFooter .flist li{margin:0 0 15px;}'
    + '#siteFooter .flist a{font-size:var(--ff-link);line-height:1.5;color:#424245;text-decoration:none;}'
    + '#siteFooter .flist a:hover{color:#1d1d1f;text-decoration:underline;}'
    /* 尚未開放 / 需要手機才能用的項目:灰掉、不可點 */
    /* 「加入主畫面」只有手機做得到:手機顯示可點連結,桌機顯示灰字 */
    + '#siteFooter .finstall{cursor:pointer;}'
    + '#siteFooter #t-f-install-off{display:none;}'
    /* 已經從主畫面打開的:這件事做完了,改成灰字 */
    + '#siteFooter.is-installed .finstall{display:none;}'
    + '#siteFooter.is-installed #t-f-install-off{display:inline;}'
    + '#siteFooter .flist .off{font-size:var(--ff-link);line-height:1.5;color:#aeaeb2;cursor:default;}'
    /* 資產頁清單:再摺一層,資產再多也不撐長頁面 */
    + '#siteFooter .fsub{margin:0 0 11px;}'
    + '#siteFooter .fsub > summary{list-style:none;cursor:pointer;font-size:var(--ff-link);color:#424245;display:inline-flex;align-items:center;gap:8px;padding:2px 0;}'
    + '#siteFooter .fsub > summary::-webkit-details-marker{display:none;}'
    + '#siteFooter .fsub > summary::after{content:\'\';width:6px;height:6px;border-right:1.4px solid #86868b;border-bottom:1.4px solid #86868b;transform:rotate(45deg);transition:transform .2s ease;}'
    + '#siteFooter .fsub[open] > summary::after{transform:rotate(-135deg);}'
    + '#siteFooter .fsub ul{list-style:none;padding:10px 0 0 12px;margin:0;'
    +   'display:flex;flex-wrap:wrap;gap:10px 18px;}'   /* 橫排,排滿一行再換行,資產再多也不往下長 */
    + '#siteFooter .fsub ul li{margin:0;}'
    /* 最底一列:版權、語言、免責 */
    + '#siteFooter .footer-bottom{display:flex;flex-wrap:wrap;align-items:center;gap:14px;padding-top:18px;}'
    + '#siteFooter .footer-copy{font-size:var(--ff-mini);color:#86868b;}'
    + '#siteFooter .footer-lang{margin-left:auto;display:flex;align-items:center;gap:8px;}'
    + '#siteFooter .footer-lang .lbl{font-size:var(--ff-mini);color:#aeaeb2;}'
    + '#siteFooter .flang-btn{font-size:var(--ff-mini);padding:6px 14px;border-radius:16px;border:1px solid #d2d2d7;background:transparent;color:#424245;cursor:pointer;transition:all .2s ease;}'
    + '#siteFooter .flang-btn.active{background:#1d1d1f;color:#fff;border-color:#1d1d1f;}'
    + '#siteFooter .footer-disclaimer{font-size:var(--ff-mini);color:#86868b;line-height:1.7;margin-top:14px;}'
    /* ── 桌機:分組全部展開成四欄,摺疊箭頭收起來 ── */
    + '@media(min-width:960px){'
    + '#siteFooter{--ff-group:12px;--ff-link:12px;--ff-note:11px;--ff-mini:11px;}'
    + '#siteFooter .site-footer{padding:56px 40px 64px;}'
    + '#siteFooter .footer-note{padding-bottom:26px;}'
    + '#siteFooter .footer-cols{display:grid;grid-template-columns:repeat(4,1fr);gap:40px;padding:30px 0 34px;border-bottom:1px solid #d2d2d7;}'
    + '#siteFooter .fgroup{border-bottom:none;}'
    + '#siteFooter .fgroup > summary{padding:0 0 14px;cursor:default;pointer-events:none;}'
    + '#siteFooter .fgroup > summary::after{display:none;}'
    + '#siteFooter .flist{padding-bottom:0;}'
    + '#siteFooter .flist li{margin:0 0 11px;}'
    + '#siteFooter .finstall{display:none;}'
    + '#siteFooter #t-f-install-off{display:inline;}'
    + '#siteFooter .footer-bottom{padding-top:22px;}'
    + '}'
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
    + '.nav-menu-panel.is-open{display:block;}'
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

  /* 語言鈕在鎖定頁是 <a>,補上 button 沒有的幾項(底線、行高、置中) */
  CSS += ''
    + '#siteHeader a.lang-btn{display:inline-block;text-decoration:none;line-height:1.35;}'
    + '.nav-menu-lang-btn{text-decoration:none;}'
    + '#siteFooter a.flang-btn{display:inline-block;text-decoration:none;line-height:1.35;}';

  var HEADER = ''
    + '<nav>'
    + '<a class="nav-logo" href="/">'
    + '<img src="/IMG_9110.png" alt="DCAcaf\u00e9" height="32" style="display:inline-block;vertical-align:middle;max-width:160px;object-fit:contain;" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline\'">'
    + '<span style="display:none;font-family:' + FONT + ';font-weight:700;font-size:20px;">DCA<span style="color:#c8813a;">cafe</span></span>'
    + '</a>'
    + '<div class="nav-right"><div class="nav-lang">'
    + langCtl('lang-btn', 'en', 'EN')
    + langCtl('lang-btn', 'zh', '\u4e2d\u6587')
    + '</div>'
    + '<div class="nav-menu-trigger">'
    + '<button class="hamburger-btn" aria-label="Menu" aria-expanded="false">'
    + '<svg width="20" height="14" viewBox="0 0 20 14" fill="none"><line x1="0" y1="1" x2="20" y2="1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="0" y1="7" x2="20" y2="7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="0" y1="13" x2="20" y2="13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
    + '</button>'
    + '<div class="nav-menu-panel"><div class="nav-menu-inner">'
    + '<div class="nav-menu-col"><div class="nav-menu-heading" id="t-navmenu-explore"></div>'
    + '<a class="nav-menu-link" href="/trending.html" id="t-navmenu-trending"></a>'
    + '<a class="nav-menu-link" href="/insights.html" id="t-navmenu-insights"></a>'
    + '<a class="nav-menu-link" href="/index.html#backtest" id="t-navmenu-backtest"></a>'
    + '<a class="nav-menu-link" href="/index.html#learn" id="t-navmenu-learn"></a>'
    + '<a class="nav-menu-link" href="mailto:help@dcacafe.com" id="t-navmenu-contact"></a></div>'
    + '<div class="nav-menu-col nav-menu-lang"><div class="nav-menu-heading" id="t-navmenu-lang"></div>'
    + langCtl('nav-menu-lang-btn', 'en', 'English')
    + langCtl('nav-menu-lang-btn', 'zh', '\u4e2d\u6587') + '</div>'
    + '</div></div>'
    + '</div>'
    + '</div>'
    + '</nav>';

  /* ══ 頁尾(2026-09-01改版)══
     蘋果式:頂部一段極小字註腳 → 多欄分組網站地圖 → 最底一列版權/語言/免責。
     手機:每一組是 <details>,預設收起,點標題展開。
     桌機:四欄全部展開,摺疊箭頭隱藏。
     連結一律用 fhref() 產生,會自動跟著目前網址的語言前綴走
     (之後做 /zh 雙語網址時,頁尾不用回頭改)。 */
  function fhref(path){
    try{
      if(!URLZH) return path;
      if(path.charAt(0) !== '/') return path;
      /* 該頁還沒有中文版就維持原網址,連過去仍是中文介面(localStorage 已同步) */
      return hasZh(path) ? ('/zh' + path) : path;
    }catch(e){ return path; }
  }
  function li(href, id){ return '<li><a href="' + fhref(href) + '" id="' + id + '"></a></li>'; }
  function liOff(id, tagId){
    return '<li><span class="off" id="' + id + '"></span>'
         + (tagId ? '<span class="tag" id="' + tagId + '"></span>' : '') + '</li>';
  }

  var ASSET_LINKS = [
    { t:'AAPL', href:'/asset/aapl.html' },
    { t:'NVDA', href:'/asset/nvda.html' },
    { t:'NFLX', href:'/asset/nflx.html' }
  ];

  var FOOTER = ''
    + '<footer class="site-footer"><div class="site-footer-inner">'
    + '<div class="footer-note" id="t-footer-note"></div>'
    + '<div class="footer-cols">'

    /* ① 開始查看 */
    + '<details class="fgroup"><summary id="t-fg-start"></summary><ul class="flist">'
    +   li('/index.html', 't-f-strategy')
    +   li('/index.html#backtest', 't-f-backtest')
    +   li('/trending.html', 't-f-trending')
    +   '<li><details class="fsub"><summary id="t-f-assets"></summary><ul>'
    +     ASSET_LINKS.map(function(a){
            return '<li><a href="' + fhref(a.href) + '">' + a.t + '</a></li>';
          }).join('')
    +   '</ul></details></li>'
    + '</ul></details>'

    /* ② 深入了解 */
    + '<details class="fgroup"><summary id="t-fg-learn"></summary><ul class="flist">'
    +   li('/index.html#learn', 't-f-learn')
    +   li('/insights.html', 't-f-insights2')
    + '</ul></details>'

    /* ③ 會員功能:需要用手機加入主畫面,桌機一律灰掉不可點 */
    + '<details class="fgroup"><summary id="t-fg-member"></summary>'
    +   '<ul class="flist">'
    +     liOff('t-f-watchlist')
    +     liOff('t-f-paper')
    +     '<li><a href="#" id="t-f-install" class="finstall"></a>'
    +       '<span class="off" id="t-f-install-off"></span></li>'
    +   '</ul>'
    + '</details>'

    /* ④ 關於 */
    + '<details class="fgroup"><summary id="t-fg-about"></summary><ul class="flist">'
    +   li('/privacy.html', 't-f-privacy2')
    +   liOff('t-f-values')
    +   li('mailto:help@dcacafe.com', 't-f-contact2')
    + '</ul></details>'

    + '</div>'
    + '<div class="footer-bottom">'
    +   '<div class="footer-copy" id="t-footer-copy"></div>'
    +   '<div class="footer-lang">'
    +     '<span class="lbl" id="t-footer-langlabel"></span>'
    +     langCtl('flang-btn', 'en', 'EN')
    +     langCtl('flang-btn', 'zh', '\u4e2d\u6587')
    +   '</div>'
    + '</div>'
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
    /* ── 頁尾網站地圖 ── */
    set('t-footer-note', t.footerNote);
    set('t-fg-start', t.fgStart);   set('t-fg-learn', t.fgLearn);
    set('t-fg-member', t.fgMember); set('t-fg-about', t.fgAbout);
    set('t-f-strategy', t.fStrategy);   set('t-f-backtest', t.fBacktest);
    set('t-f-trending', t.fTrending);
    set('t-f-assets', t.fAssets);
    set('t-f-learn', t.fLearn);         set('t-f-insights2', t.fInsightsLink);
    set('t-f-watchlist', t.fWatchlist); set('t-f-paper', t.fPaper);
    set('t-f-install', t.fInstall);     set('t-f-install-off', t.fInstall);
    set('t-f-privacy2', t.fPrivacy);
    set('t-f-values', t.fValues);
    set('t-f-contact2', t.fContact);
    set('t-footer-langlabel', t.fLangLabel);
    set('t-footer-copy', t.footerCopy);
    set('t-footer-disclaimer', t.footerDisclaimer);
    /* 頁尾語言鈕的選中狀態 */
    Array.prototype.forEach.call(document.querySelectorAll('.flang-btn'), function(b){
      b.classList.toggle('active', b.getAttribute('data-lang') === l);
    });
    set('t-pwa-tagline-m', t.pwaTagline);
    set('t-pwa-step1', t.pwaStep1, true);
    set('t-pwa-step2', t.pwaStep2, true);
    set('t-pwa-step3', t.pwaStep3, true);
    set('t-pwa-got', t.pwaGot);
    set('t-navmenu-explore', t.navExplore);
    set('t-navmenu-trending', t.fTrending);   /* 與頁尾同一組文案,名稱一致 */
    set('t-navmenu-insights', t.navInsights);
    set('t-navmenu-contact', t.navContact);
    set('t-navmenu-backtest', t.navBacktest);
    set('t-navmenu-learn', t.navLearn);
    set('t-navmenu-lang', t.navLang);
    var btns = document.querySelectorAll('#siteHeader .lang-btn, #siteHeader .nav-menu-lang-btn');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].getAttribute('data-lang') === l);
    document.documentElement.lang = l === 'zh' ? 'zh-Hant' : 'en';
  }

  function setLang(l) {
    l = (l === 'zh') ? 'zh' : 'en';
    localStorage.setItem(LANGKEY, l);
    renderChrome(l);
    /* 各頁重繪自己的內文:資產頁用 applyPageLang,首頁用自己的全域 setLang。
       兩者都試,才不會出現「按了頁尾語言鈕,頁首和內文沒跟著換」。 */
    if (typeof window.applyPageLang === 'function') { try { window.applyPageLang(l); } catch (e) { console.error(e); } }
    else if (typeof window.setLang === 'function' && window.setLang !== setLang) {
      try { window.setLang(l); } catch (e) { console.error(e); }
    }
    window.dispatchEvent(new CustomEvent('dca:lang', { detail: l }));
  }

  /* 頁面若已有自己的版本就不覆蓋。首頁那支會判斷 Android、帶 reason 參數,
     比這裡的通用版完整,蓋掉會退功能。 */
  if (typeof window.openInstallModal !== 'function') {
    window.openInstallModal = function () { var m = document.getElementById('installModal'); if (m) m.style.display = 'flex'; };
  }
  if (typeof window.closeInstallModal !== 'function') {
    window.closeInstallModal = function () { var m = document.getElementById('installModal'); if (m) m.style.display = 'none'; };
  }
  window.dcaSetLang = setLang;

  /* 頁面若有自己的語言鈕(首頁右上角那組、privacy/jury 的 setLang),
     按下去只會重繪它自己的內容,頁尾不會跟著換。這裡把頁面的 setLang
     包一層,跑完之後補畫一次頁首頁尾。 */
  var relangGuard = false;
  function wrapPageSetLang(){
    var pageFn = window.setLang;
    if (typeof pageFn !== 'function' || pageFn.__dcaWrapped) return;
    var wrapped = function (l) {
      var r = pageFn.apply(this, arguments);
      if (!relangGuard) {
        relangGuard = true;
        try { renderChrome(getLang()); } catch (e) { console.error(e); }
        relangGuard = false;
      }
      return r;
    };
    wrapped.__dcaWrapped = true;
    window.setLang = wrapped;
  }

  function inject() {
    if (!document.getElementById('dcaChromeCSS')) {
      var s = document.createElement('style'); s.id = 'dcaChromeCSS'; s.textContent = CSS; document.head.appendChild(s);
    }
    var h = document.getElementById('siteHeader'); if (h) h.innerHTML = HEADER;
    wrapPageSetLang();
    var f = document.getElementById('siteFooter');
    if (f) {
      f.innerHTML = FOOTER;
      /* 已加入主畫面(從桌面圖示打開)→ 頁尾的「加入主畫面」改成灰字,
         不再叫使用者去做一件已經做完的事。iOS 用 navigator.standalone,
         其他平台用 display-mode: standalone。 */
      var installed = false;
      try {
        installed = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
                 || window.navigator.standalone === true;
      } catch (e) {}
      f.classList.toggle('is-installed', !!installed);
    }
    if (!document.getElementById('installModal')) {
      var wrap = document.createElement('div'); wrap.innerHTML = MODAL;
      var modal = wrap.firstChild; document.body.appendChild(modal);
      modal.addEventListener('click', function (e) { if (e.target === modal) window.closeInstallModal(); });
    }
    /* 鎖定頁的語言鈕是 <a href>,交給瀏覽器直接換網址,不掛 click */
    var btns = LOCKED ? [] : document.querySelectorAll('#siteHeader .lang-btn, #siteHeader .nav-menu-lang-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () { setLang(this.getAttribute('data-lang')); });
    }
    // 2026-08-24修正:漢堡選單原本純靠CSS:hover控制開關,觸發範圍(小按鈕本身)
    // 跟視覺上選單出現的位置(position:absolute,基準是整個nav)之間有一段
    // 沒被hover判定覆蓋到的空隙,滑鼠從按鈕移向選單途中就會先離開hover範圍、
    // 選單瞬間收起,導致選單裡的連結完全點不到。改成JS控制class開關:
    // 滑鼠移到漢堡按鈕上開啟(維持原本開啟方式不變),開啟後不再依賴hover,
    // 只有「點擊選單外部」或「點擊選單裡的連結」才會收起。
    /* ══ 頁尾的三件事,與頁首完全脫鉤 ══
       首頁沒有 #siteHeader(它有自己的頁首),先前這幾段被包在
       「頁首存在才執行」的判斷裡,導致首頁的頁尾語言鈕沒反應、
       桌機四欄也沒被展開。 */
    /* ① 「加入主畫面」:開既有的安裝說明彈窗 */
    var fIns = document.getElementById('t-f-install');
    if (fIns) {
      fIns.addEventListener('click', function (e) {
        e.preventDefault();
        if (typeof window.openInstallModal === 'function') window.openInstallModal();
      });
    }

    /* ② 分組:手機預設收合(點標題展開),桌機一律展開。
       <details> 收合時內容不會渲染,桌機要用 JS 打開,不能只靠 CSS。 */
    (function () {
      var mq = window.matchMedia('(min-width:960px)');
      function syncGroups() {
        if (!mq.matches) return;                    // 手機:維持使用者自己的展開狀態
        Array.prototype.forEach.call(
          document.querySelectorAll('#siteFooter .fgroup'),
          function (d) { d.open = true; }
        );
      }
      syncGroups();
      if (mq.addEventListener) mq.addEventListener('change', syncGroups);
      else if (mq.addListener) mq.addListener(syncGroups);
      window.addEventListener('resize', syncGroups);
    })();

    /* ③ 語言鈕:跟頁首同一支 setLang。
       在頁尾按的人應該留在頁尾——首頁的 setLang 會重繪整頁,重繪後高度改變,
       瀏覽器會把畫面推走,所以前後把捲動位置存回去。 */
    Array.prototype.forEach.call(LOCKED ? [] : document.querySelectorAll('.flang-btn'), function (b) {
      b.addEventListener('click', function () {
        var y = window.pageYOffset || document.documentElement.scrollTop || 0;
        setLang(b.getAttribute('data-lang'));
        function keep(){ window.scrollTo(0, y); }
        keep();
        requestAnimationFrame(function(){ keep(); requestAnimationFrame(keep); });
        setTimeout(keep, 120);
        setTimeout(keep, 360);
      });
    });

    var navTrigger = document.querySelector('#siteHeader .nav-menu-trigger');
    var navPanel = document.querySelector('#siteHeader .nav-menu-panel');
    if (navTrigger && navPanel) {
      navTrigger.addEventListener('mouseenter', function () { navPanel.classList.add('is-open'); });
      document.addEventListener('click', function (e) {
        if (!navTrigger.contains(e.target)) { navPanel.classList.remove('is-open'); }
      });
      var navLinks = navPanel.querySelectorAll('.nav-menu-link, .nav-menu-lang-btn');
      for (var j = 0; j < navLinks.length; j++) {
        navLinks[j].addEventListener('click', function () { navPanel.classList.remove('is-open'); });
      }
    }
    renderChrome(getLang());
    if (typeof window.applyPageLang === 'function') { try { window.applyPageLang(getLang()); } catch (e) { console.error(e); } }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();
