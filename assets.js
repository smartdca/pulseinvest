/* ══════════════════════════════════════════════════════════════
   DCAcafé 資產清單 — 單一來源(single source of truth)
   新增一支資產頁時,只要在這裡加一行,以下全部自動同步:
     · 首頁 POPULAR(人氣熱搜)卡片 + 分數
     · 每支資產頁底部「相關資產」卡片
   欄位:
     ticker  代號(大寫)
     domain  logo 來源網域(cdn.tickerlogos.com/<domain>)
     name    顯示名 {zh, en}(相關卡副標用)
     cat     類別(growth / value / index / crypto / metal / reit / bond)—未來分類/排序用
   用法:頁面 <head> 內 <script src="/assets.js"></script>(在主程式之前)。
   ══════════════════════════════════════════════════════════════ */
window.DCA_ASSETS = [
  { ticker:'AAPL', domain:'apple.com',  name:{ zh:'蘋果',   en:'Apple'  }, cat:'growth' },
  { ticker:'NVDA', domain:'nvidia.com', name:{ zh:'輝達',   en:'NVIDIA' }, cat:'growth' },
];
