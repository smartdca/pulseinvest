/* ══════════════════════════════════════════════════════════════
   DCAcafé 資產清單 — 單一來源(single source of truth)
   新增一支資產頁時,只要在這裡加一行(放到最上面),以下全部自動同步:
     · 首頁 POPULAR(人氣熱搜)卡片 + 分數
     · 每支資產頁底部「人氣資產」相關卡片
   排序規則:最新/最近更新的放最上面 → 首頁最左、相關卡最前。
   欄位:ticker 代號 / domain logo 網域 / name 顯示名{zh,en} / cat 類別
   用法:頁面 <head> 內 <script src="/assets.js"></script>(在主程式之前)。
   ══════════════════════════════════════════════════════════════ */
window.DCA_ASSETS = [
  { ticker:'NVDA', domain:'nvidia.com', name:{ zh:'輝達', en:'NVIDIA' }, cat:'growth' },
  { ticker:'AAPL', domain:'apple.com',  name:{ zh:'蘋果', en:'Apple'  }, cat:'growth' },
];
