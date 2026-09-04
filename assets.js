/* ══════════════════════════════════════════════════════════════
   DCAcafé 資產清單 — 單一來源(single source of truth)
   新增一支資產頁時,只要在這裡加一行(放到最上面),以下全部自動同步:
     · 首頁 POPULAR(人氣熱搜)卡片 + 分數
     · 每支資產頁底部「人氣資產」相關卡片
   排序規則:最新/最近更新的放最上面 → 首頁最左、相關卡最前。
   欄位:
     ticker  代號,同時決定資產頁網址(/asset/<小寫>.html)與卡片上顯示的字
     query   選填。送給後端 API 的代號。跟 ticker 不同時才需要填
             (例:BTC 顯示 BTC,但 Yahoo/後端要 BTC-USD)。沒填就用 ticker。
     domain  選填。logo 網域,走 cdn.tickerlogos.com。有本地圖時可省略。
     duel    選填。標記「首頁桌機對比卡」的主角。只能有一支。
             沒有任何一支標記時,自動退回清單第一支(舊行為)。
             ※ 對比卡需要另外配 VS 圖與 wordmark 圖,所以跟排序脫鉤,
               不會因為新資產置頂就被動換角。
     duelVs        選填。對比卡中間的 VS 素材圖。
     duelWordmark  選填。對比卡左側的品牌字樣圖。沒填就整塊隱藏,不留破圖。
             ※ 這兩個欄位跟著資產走、不跟著「當週主角」走,所以檔名按對戰組合
               命名(img/duel-vs-<主角>-spy.png),換主角時不會覆蓋掉舊配色,
               之後想換回來,圖還在。
     name    顯示名{zh,en} / cat 類別
   用法:頁面 <head> 內 <script src="/assets.js"></script>(在主程式之前)。
   ══════════════════════════════════════════════════════════════ */
window.DCA_ASSETS = [
  { ticker:'BTC',  query:'BTC-USD', duel:true,
    duelVs:'img/duel-vs-btc-spy.png',
    duelWordmark:'img/duel-wordmark-btc.png',
    name:{ zh:'比特幣', en:'Bitcoin' }, cat:'crypto' },

  { ticker:'NFLX', domain:'netflix.com',
    duelVs:'img/duel-vs-nflx-spy.png',
    duelWordmark:'https://commons.wikimedia.org/wiki/Special:FilePath/Netflix_2015_logo.svg',
    name:{ zh:'網飛', en:'Netflix' }, cat:'growth' },

  { ticker:'NVDA', domain:'nvidia.com', name:{ zh:'輝達', en:'NVIDIA' }, cat:'growth' },
  { ticker:'AAPL', domain:'apple.com',  name:{ zh:'蘋果', en:'Apple'  }, cat:'growth' },
];

/* ══════════════════════════════════════════════════════════════
   Logo 修補表 — 共用單一來源
   用途:第三方 logo CDN 抓不到、或抓到的圖很醜(長條 wordmark、低解析)時,
        在這裡指一張自己放的本地圖,優先於所有 CDN 與自動查詢。
   吃這張表的地方(全部自動,不用改程式):
     · 首頁熱搜卡、桌機對比卡、本週精選、Today's Brew、Watchlist
       → 都走 js/logo.js 的 createLogoImg()
     · 資產頁 hero 大 logo、底部相關卡
   ※ 這張表不限於有資產頁的資產,任何代號都可以修補。
   ※ 新增方式:把方形去背 PNG 放到 repo 的 /logo/ 底下,再加一行。
     檔名一律小寫,副檔名 .png,注意 iOS 拖放上傳可能夾帶開頭空白。
   ══════════════════════════════════════════════════════════════ */
window.DCA_LOGO_IMG = {
  BTC: '/logo/btc.png',
};
