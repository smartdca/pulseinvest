# CLAUDE.md — DCAcafé（dcacafe.com）

給在這個 repo 裡工作的 Claude 看的開工須知。細節規則在根目錄的 `HANDOFF *.md`，
這份只放「每次都一定要知道」的東西。規則衝突時，以 Henry 在對話中的最新指示為準。

---

## 一、跟 Henry 合作

- **一律用繁體中文回覆，白話、簡短**。Henry 在手機上看，不要長篇技術說明、不要列一堆選項。
- **Henry 不寫程式**，只用 iPhone／Safari + GitHub 網頁版。不要叫他自己改檔案或跑指令。
- **討論 → 確認 → 執行**。沒有明確同意（「開始」「可以」「OK」「推」）不要改檔、不要推送。
- **推送一定要等 Henry 說「推」**。推之前先跑檢查（見第四節），推完確認 Actions 綠勾。
- **一次推送 = 一個 commit**。分多個 commit 會讓 Pages 部署互撞（`Multiple artifacts named "github-pages"`）。
- **版面／UI 的改動先給 mockup**，Henry 在手機上看過才實作。
- **不確定就問，不要猜**。尤其是「這支檔案有沒有人在用」——判斷依據只能是 workflow 裡寫著它的路徑。

## 二、站台硬規則

| 規則 | 說明 |
|---|---|
| 任何檔案不出現日期 | 包含註解、版號字串 |
| 「DCA Score」一律寫全 | 不縮寫、不簡稱 |
| UI 文案不用「建議」 | 合規考量，改用「參考」「顯示」等；文案以系統／分數為主詞 |
| DCA Score 不暗示減碼 | 系統回傳的倍數永遠 ≥ 1.0 |
| 所有資產同一套公式 | 不為個別資產設不同參數 |
| 部落格圖片副檔名 | 一律 `.jpg`，不用 `.jpeg` |

## 三、檔案地圖（改之前先確認改的是哪一支）

| 路徑 | 說明 |
|---|---|
| `index.html` | 首頁，最大的檔案 |
| `css/main.css` | 手機基準樣式——**不要動** |
| `css/web.css` | 桌機覆寫。大部分規則包在 `@media (min-width:960px)`；檔案前段有一區「手機桌機都生效」的全域規則 |
| `css/asset-web.css` | 資產頁桌機樣式 |
| `js/logo.js` | 全站唯一的 Logo 來源：`assets.js` 的 `DCA_LOGO_IMG` 本地圖 → Brandfetch → 文字後備 |
| `assets.js` | 資產註冊表。新增資產要手動加一筆 |
| `assets-data/*.html` | 資產頁資料檔，新增資產改這裡 |
| `scripts/asset-template.html` | 資產頁範本（版面／HTML） |
| `generate blog.py` | 文章產生器，**在根目錄**（不是 `scripts/`），搬走會壞 |
| `posts.json` | 文章資料 |

**CI 產物，不要手改**（改了會被蓋掉）：`asset/`、`zh/`、`blog/`、`zh/blog/`，
以及 `chrome.js` 與 `sitemap.xml` 裡由 CI 維護的區塊（`ZH_READY-*`、`FOOTER-ASSETS`、`ASSETS-START/END`、`BLOG-START/END`）。

中文版頁面由 `scripts/build-i18n.py` 從英文版自動產生，只改英文版來源檔即可。

## 四、版號與 CI

- **全站共用檔（`chrome.js`、`assets.js`、`css/*.css`、`js/*.js`）必須帶同一個版號**，目前是 `?v=11`。
  改了任何一支共用檔的內容，**全站版號一起跳到下一個數字**，不能只改一頁。
- 版號只用純數字（`?v=11`），不可帶日期。
- **推送前一定要跑** `python3 scripts/check-links.py`，通過才推。細則見 `HANDOFF 連結與版號規則.md`。
- `Build assets + i18n` 與 `Publish Blog` 兩個 workflow 同時推送時可能互撞，後推的會被拒。
  遇到時在最新的 main 上手動觸發（workflow_dispatch）一次，不要按 Re-run（Re-run 用的是舊 commit 的檔案）。

## 五、後端與資料（不在這個 repo）

- DCA Score 在私有後端 `smartdca/Proxy`（Vercel）計算，公式與權重**不可出現在這個公開 repo**。
- 前端取分數走 `api/ticker-score`。

## 六、更多細節

根目錄的交接文件：

- `HANDOFF 工作交接.md` — 整體架構、建置流程、合作方式
- `HANDOFF 連結與版號規則.md` — check-links 七條規則與修法
- `HANDOFF 每週新增資產.md` — 每週新增資產的完整流程（含首頁對決卡、VS 圖換色、預覽）
- `HANDOFF 對決卡換主角.md` — 已併入上一份，只剩指引
- `HANDOFF 浮動計算獨立化與公式收口.md` — 浮動 DCA Score 查詢元件
