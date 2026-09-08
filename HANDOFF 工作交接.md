# HANDOFF — DCAcafé 工作交接

> 這份給接手的對話框開場用。讀完應該知道：站在哪裡、下一步做什麼、怎麼跟 Henry 合作。
> 連結與版號的細部規則另有一份 `HANDOFF_連結與版號規則.md`，在 repo 根目錄。

---

## 零、開工前先讀這一段

### 不要假設你知道線上有什麼

**要改哪支檔案，就先請 Henry 下載那支檔案給你。**

不要用對話裡留下的副本、不要用自己重建的版本、不要憑印象重打。
這件事在連結修復那一輪造成兩個多小時的損失，實際發生過的：

- 對話框裡留著自己重寫的簡化版 `build-i18n.py`，差點拿它當基底改
- 斷定線上的 `generate blog.py` 是新版，實際是舊版，修了半天修錯檔案
- 根目錄和 `scripts/` 各有一份 `generate blog.py`，只有根目錄那份在跑，
  CI 報的行號跟手上的檔案永遠對不上
- 沒確認就判斷根目錄那份是「舊備份」，叫 Henry 刪掉，文章發布流程直接掛掉

### 不確定就問，不要猜

Henry 明確要求過：**不懂就說、不會就說、需要什麼就問。**
猜錯的代價是他要重測一輪、重推一次，那是真實的時間。

「我猜沒有人在用」這種話說出口之前，先問。

---

## 一、Henry 的工作方式

| 項目 | 規則 |
|---|---|
| 流程 | **討論 → 確認 → 執行**。沒有明確同意（「開始」「可以」「OK」「come on」）不要產出檔案 |
| 交付 | **完整替換檔**，不用 patch、不用 diff |
| 修改 | **不要叫他自己改檔案**（加一行、刪一行都不行）。他不做修改，只做覆蓋和刪除 |
| 設備 | 只有 iPhone/Safari + GitHub 網頁版。沒有桌機、沒有 console、沒有本機環境 |
| 回應 | **白話、簡短**。不要長篇技術說明，不要列一堆選項 |
| 提問 | 一次問一個問題 |
| 視覺 | 版面／UI 決定要先給 mockup，他在裝置上看過才實作 |
| 收集 | 先收齊所有變更需求，再一次實作 |

### 上傳的實務限制

- **一次 commit 上傳所有檔案**。分成多次會撞上 `Multiple artifacts named "github-pages"`
- 檔名含空格的（`generate blog.py`）要用「Add file → Create new file」手動打路徑，
  iOS 拖放會出錯
- **Re-run 沒有用**，它會回到當時的檔案狀態。要推新 commit

---

## 二、站台硬規則

違反這些會被 CI 擋下，或是需求上不被接受。

| 規則 | 說明 |
|---|---|
| **任何檔案不出現日期** | 包含註解、版號字串。版號用 `?v=1`、`?v=2` 這種純數字 |
| **UI 文案不用「建議」** | 合規考量。改用「參考」「顯示」等 |
| **合規文案以系統／分數為主詞** | 不能寫成「你應該…」 |
| **DCA Score 一律寫全** | 不縮寫、不簡稱 |
| **DCA Score 不暗示減碼** | 系統永遠不回傳低於 1.0 的倍數 |
| **加密資產頁** | `seo.description` 不出現「估值/valuation」；不使用暗示資產會「賺錢」的說法 |
| **共用檔版號全站一致** | 目前 `?v=5`。改了任何共用檔，全站一起跳下一號 |
| **雙語頁的資源路徑一律絕對** | 有 `<!--ZH-HEAD-->` 區塊的頁面會被複製到 `/zh/`，相對路徑會解成 `/zh/css/...` 而找不到。CI 第七條會擋 |

---

## 三、現在的架構

### 前端（`smartdca/pulseinvest`，GitHub Pages）

```
根目錄
  index.html            首頁（最大的檔案，多對話框共用）
  backtest.html         歷史回測（已從 index.html 拆出）
  learn.html            學習空間（已從 index.html 拆出）
  trending.html         人氣熱搜（泡泡頁）
  insights.html         投資見解列表
  jury.html             大師陪審團
  privacy.html
  chrome.js             共用頁首/頁尾/語言判斷（每一頁都載入）
  assets.js             資產註冊表（單一來源）
  generate blog.py      文章產生器 ← 注意在根目錄，不在 scripts/
  posts.json            文章資料
  sitemap.xml

  css/main.css          手機基準樣式（不要動）
  css/web.css           桌機覆寫（全部包在 @media(min-width:960px) 裡）
  css/asset-web.css     資產頁桌機覆寫

  js/                   各功能模組
  asset/*.html          資產頁（CI 產物，不要手改）
  zh/**                 中文版頁面（CI 產物，不要手改）
  blog/*.html           文章頁（CI 產物，不要手改）
  assets-data/*.html    資產頁資料檔 ← 新增資產只改這裡
  scripts/              建置程式
```

### 後端（`smartdca/Proxy`，Vercel Hobby，私有）

`proxy-three-mu-47.vercel.app`

主要 endpoint：`api/score.js`（DCA Score 演算法，私有）、`api/ticker-score.js`、
`api/sheets.js`、`api/fmp-fundamentals.js`、`api/historical-score.js`、
`api/buddy.js`（AI 客服小咖）、`api/push-daily.js`

> **函式數已達 12/12 上限。** 需要新增時，先刪 `api/logo.js`（已無用的死檔）。

### 資料

Google Sheets（ID `1msqXlcSfVVNkfPFzMQelHQq3YjDrkwP5B95liXylNug`）
分頁：Waitlist、JuryLog、PaperAccountLog、PfcfCache、HistoricalScoreCache、ChatLog、BasicCache

---

## 四、建置流程

### `Build assets + i18n`（`.github/workflows/build-i18n.yml`）

```
① scripts/check-links.py    檢查連結與版號（七條規則），不過就擋下推送
② scripts/build-assets.py   assets-data/ + asset-template.html → asset/*.html
③ scripts/build-i18n.py     asset/ + ROOT_PAGES → zh/**、更新 chrome.js、sitemap.xml
④ 提交結果
```

### `Publish Blog`（`.github/workflows/publish-blog.yml`）

跑**根目錄**的 `generate blog.py`，從 `posts.json` 產生 `blog/` 與 `zh/blog/`，
並更新 `chrome.js` 的 `ZH_READY-BLOG` 區塊和 `sitemap.xml` 的 `BLOG` 區塊。

> `generate blog.py` 的 `ROOT = Path(__file__).parent`，
> **搬到子目錄會壞掉**（找不到 `posts.json`）。
> `build-i18n.py` 的 `ROOT` 取上上層，設計上就在 `scripts/`。
> 兩者算法不同，不要看到都是 `.py` 就以為能互搬。

### CI 自動維護的區塊（不要手改）

| 區塊 | 檔案 | 由誰維護 |
|---|---|---|
| `ZH_READY-ASSETS` | `chrome.js` | `build-i18n.py` |
| `FOOTER-ASSETS` | `chrome.js` | `build-i18n.py` |
| `ZH_READY-BLOG` | `chrome.js` | `generate blog.py` |
| `ASSETS-START/END` | `sitemap.xml` | `build-i18n.py` |
| `BLOG-START/END` | `sitemap.xml` | `generate blog.py` |

---

## 五、剛完成、已上線

- **資產頁範本化**：四支資產頁從各約 1840 行的獨立檔案，改為
  `scripts/asset-template.html` + `assets-data/*.html`（各約 140 行）+ CI 生成
- **全站中英連結修復**：首頁選單、對決卡、熱搜卡、文章卡、分頁列、頁尾、
  泡泡頁、資產頁相關卡、回測按鈕、文章頁麵包屑、舊網址轉址
- **共用檔版號統一 `?v=5`**（先前有六種不同版號，包含文章頁的 `chrome.js` 完全沒版號）
- **頁尾資產清單改由 CI 維護**（原本手寫三支，BTC 漏掉過）
- **CI 守門程式** `scripts/check-links.py`
- **回測頁 K 線載入動畫**與捲動定位修正
- **清理**：`p1`~`p5.html`、`trending-preview.html`、重複的 `scripts/generate blog.py`
- **浮動 DCA Score 查詢獨立成 `js/quick-score.js`**：改走單次 `api/ticker-score`，
  加一行 script 標籤就能裝到任何頁面
- **Logo 來源改用 Brandfetch**：`js/logo.js` 三層結構（本地圖 → Brandfetch → 文字後備），
  原本散在 19 處的圖庫網址收攏成六支來源檔
- **虛擬帳戶定投解鎖 bug**：`acctNextInvestDate()` 同時被拿來做顯示與鎖定判斷，
  投過一次就永遠不解鎖。新增 `acctDueDate()` 專供鎖定判斷
- **首頁中英雙網址拆分**（見下方「首頁拆分的完整經過」）
- **首次到訪遮罩改版**：語言鈕即入口，選完年齡才亮起
- **CI 第六、第七條規則**

---

## 五之二、首頁拆分的完整經過

這是全站最後一塊，也是踩坑最多的一輪。記下來是為了讓下一輪不必重走。

### 定案的決定

| 項目 | 決定 | 理由 |
|---|---|---|
| 網址 | `dcacafe.com` 英文、`dcacafe.com/zh/` 中文 | 與其他頁面一致 |
| canonical | 維持站根 `/`，不用 `/index.html` | 改掉等於換網址，先前累積的權重要重來 |
| hreflang | `zh-Hant`（不是 `zh-TW`） | 站上其他 30 幾頁都用這個，兩套標準會讓 Google 當成不同目標 |
| 自動轉址 | **不做** | Google 明確建議避免；Apple 主站也不轉址 |
| 語言判斷 | 由網址決定（`window.DCA_LANG`），不再讀 localStorage | |
| 語言鈕 | 三組（頁首、側邊選單、遮罩）全部改成真的連結，帶著 query 與錨點 | |
| sitemap | 首頁優先度 1.0，其餘照舊 | |

`build-i18n.py` 為首頁開了唯一一個特例 `urls_for()`：網址走 `/` 與 `/zh/`，
不是 `/index.html`。其餘流程完全共用。

### CI 連擋三輪，全部是連鎖反應

**第一輪：寫死指向首頁的連結。**
首頁一旦進入雙語清單，全站任何 `/index.html` 的寫法都會把中文使用者送回英文版。
`learn.html` 兩個函式、`js/quick-score.js` 一處。改走 `dcaHref()` 即可。

**第二輪：中文版整頁沒有樣式。**
首頁 33 處資源用相對路徑（`css/main.css`、13 支 js、圖片、manifest），
在 `/zh/` 底下全部解成 `/zh/css/...`。全改絕對路徑。
另外資料檔帶進來的圖片路徑（`post.hero_image`、`asset.duelVs`、`asset.duelWordmark`）
也是相對的，加了一支 `siteAsset()` 統一補斜線。

**第三輪：第七條規則抓到 `insights.html` 兩處圖示相對路徑。**

### 最值得記的一件事

`insights.html` 裡有兩條註解寫著「index.json 存的是相對路徑，
在 `/zh/insights.html` 底下會解錯，所以改成絕對路徑」——
**這個坑當初踩過、也修好了，但沒有變成規則，所以首頁拆分時整件事又發生一遍。**

修好一個 bug 之後要問：這類 bug 還會不會有別的地方？能不能讓機器記得？
第七條規則就是這個問題的答案，它上線第一天就抓到 `learn.html` 與 `insights.html`
兩支頁面壞了很久的圖示（分頁圖示不見了，沒有任何錯誤訊息，很安靜）。

### SEO 文案定稿

英文 Title：`DCA Calculator — Get Your DCA Score for Stocks & ETFs | DCAcafé`
中文 Title：`定期定額該投多少？取得你的 DCA Score｜DCAcafé`

文案迭代的要點（下次寫別頁可以直接套用）：

- 中文標題**必須放「定期定額」**——那是台灣人真的會打進 Google 的字。
  `DCA Score` 是自有品牌詞，現在還沒有人會搜它，要靠關鍵字帶路
- **不要寫時間週期**（「這個月」）。虛擬帳戶支援每週／每兩週／每三週，寫死是錯的
- **不用 Any／任何**這種絕對字眼
- 提到 RSI／回撤／VIX 時要加「**包含**」，讓它是舉例而非全部（實際是五因子）
- 「熟練者」→「**老手**」。「專業投資人」在台灣有法律定義，不能用
- 英文 Title 控制在 60 字元內，描述 155 字元內，否則品牌詞與差異點會被截斷

---

## 六、佇列（依序）

### 第 3 項｜首頁計算引擎抽成 `js/score-engine.js`

把 `index.html` 裡的計算邏輯抽成獨立模組。
目的是讓 `index.html` 瘦身，也讓其他頁面能重用同一套邏輯。

**開工前：** 請 Henry 下載當下的 `index.html`。這支檔案多個對話框都會碰，
用舊副本當基底一定會造成回歸。

### 第 4 項｜首頁頁首收攏到 `chrome.js`

全站最後一個還在自己造一份頁首的地方。其他頁面都用 `chrome.js` 注入。

**為什麼要單獨一輪：**
其他頁的頁首原本就只是一條 logo 加語言鈕，沒有程式在操作它，換掉等於換一塊死的東西。
**首頁的頁首是活的**——上面掛著 `setLang()` 會去找的元素 id
（`btnEn`／`btnZh`／`navMenuBtnEn`／`navMenuBtnZh`）。換成 `chrome.js` 之後那些 id
就不存在了，`setLang()` 會找不到。而 `setLang()` 是全站最長的函式，動它容易掃到別的東西。

另外 `chrome.js` 是全站共用檔，為了首頁去改它，30 幾頁會一起受影響。

**Henry 已同意分開推**：拆分先上（已完成），頁首收攏單獨一輪，
方便驗收也方便出事時回頭。

### 第 5 項｜`scripts/asset-template.html` 的 Logo 收攏版

檔案已經寫好，壓著沒推。**原因**：資產頁（`asset/*.html`）是由範本產生的靜態檔，
而產生流程是「對話框產出 → Henry 手動上傳」。範本改了，現有四支資產頁
（BTC／NFLX／NVDA／AAPL）不會自動更新，要連同資產頁重新產生一起做。

## 七、其他待辦

### 需要處理

- **資產頁的版面種子內容仍是舊 AAPL 文字**（含 `<h1 id="seoH1">`）。
  JS 會覆寫，但搜尋引擎首波抓到的是 AAPL。刻意留待單獨處理
- **`js/logo.js` 和 `assets.js` 的快取版號**要納入全站統一機制
- **抽出共用的資產頁邏輯到 `js/asset-page.js`**，在資產數達到 6～7 支之前做
- **Fear & Greed 顏色分級**尚未定案（目前三級）
- **公式收口的終點**：關掉 `api/score` 對外的門。該端點接受任意編造的輸入且有問必答，
  十幾次請求就能反推五因子權重、倍數門檻與燈號切點。唯一杜絕方式是前端只送代號、
  全部後端算完（即 `ticker-score` 模式）。未解問題：年齡上限、VIX 加成、股息加成
  依賴使用者本機資料；走勢圖原始價格 `ticker-score` 不回傳
- **陪審團頁頁首上方空白**（暫緩）：只在 `jury.html` 出現，修過一次無效。
  **重要線索：空白在頁首「上面」而非頁首與內容之間**，這推翻了原本
  「body padding-top」的診斷方向，較像 `chrome.js` 注入時在前面留下東西。
  需要開發者工具才能確認，Henry 手機上做不到
- **本週精選資產池擴充**：資料由 `update_picks.py` 產生成 `picks.json`，牽涉選股邏輯
- **待盤點**：Vercel 上 `alpaca`、`classify-purp…`、`like-calendar` 三支函式
  這份文件完全沒記錄；`scale-preview.html`、`hero-preview.html`、
  `asset-desktop-mock.html` 三支 Henry 確認不用，可清理

### 尚未開始的功能

- **`push-daily.js` 個別資產警示**：以 SPY 為基準的相對落差，
  −15pp 門檻、約 180 個交易日連續確認。超買側門檻未定
- **Portfolio Allocation**：規格已完整設計，尚未動工
- **大師陪審團**：引擎已完成，前端部分完成；
  組合模式目前沒有傳入真實的 RSI／drawdown／VIX（用預設值，已知缺口）
- **ChatLog IP 濫用監控自動化**（目前人工）
- **共用後端 logo 快取**（Proxy 新函式 + Sheets 新分頁），取代現行的
  每裝置 localStorage 快取。注意函式額度已滿
- **P/FCF 係數重新評估**：現有歷史資料只有 3.5～4.5 年，不足；
  可能需要升級 FMP 付費方案
- **App 內回報 bug 按鈕**（beta 使用者用）

---

## 八、多對話框分工

每個對話框負責特定檔案。**共用檔案（`index.html`、`css/web.css`、`chrome.js`）
在動之前一定要請 Henry 下載當下的線上版本當基底。**

跨對話框污染已經造成過多次回歸，把它當成首要風險。

結束一個階段時產出交接檔（`HANDOFF_*.md`），讓下一個對話框接得上。

---

## 九、驗收流程

1. **CI 綠勾** — 看 `Build assets + i18n`，不是 `pages build and deployment`。
   兩者是不同的 workflow，後者綠不代表前者跑過
2. **確認產物真的更新** — GitHub 上看 `zh/` 目錄的 Last commit date。
   還停在幾小時前就代表 CI 沒跑完，往下測都是白測
3. **Cloudflare Purge Everything**
4. **無痕視窗**，中英各測一輪，看網址列有沒有 `/zh/`
5. 桌機項目加 `?desktop=1`，測完 `?desktop=0` 關閉

### 交付前的自我檢查

- **JS 語法**：用 Python regex 抽出 `<script>` 區塊（排除 `src=` 與 `ld+json`），
  寫成 `.js` 後跑 `node --check`
- **f-string 陷阱**：`generate blog.py` 裡的 HTML 是 f-string，
  插入 JS 的大括號要寫成 `{{` `}}`
- **與原檔逐行 diff**，確認只改了預期的地方

---

## 十、iOS/WebKit 已確認的地雷

這些都是實際踩過的，不要重蹈。

| 現象 | 原因與解法 |
|---|---|
| `position:sticky` 全部失效 | `html,body` 上的 `overflow-x:hidden` 會讓 WebKit 裁切兩軸 → 改用 `position:fixed` + JS 量測的 `syncNavOffset()` |
| `position:fixed` 被綁架 | 祖先有 `backdrop-filter` → 移除或改結構 |
| 動畫瞬間完成 | `display:none → flex` 與動畫同一幀 → 雙層 `requestAnimationFrame` + 強制 reflow |
| 版面寬度量錯 | 中文造成水平溢出時 `window.innerWidth` 會膨脹 → 用 `document.documentElement.clientWidth` |
| FAQ 字級跳動 | iOS 自動放大文字 → `text-size-adjust:100%` |
| 注音輸入重複字 | 不要在 `oninput` 裡改寫 `this.value` → 用 CSS `text-transform:uppercase`，計算時再清理 |
| 數字出現斜線零 | DM Mono 在 iOS Safari 的問題 → 數字一律用 DM Sans |
| SVG 圖表變形 | `preserveAspectRatio="none"` → viewBox 用實際像素尺寸 |
| 下拉刷新誤觸 | 門檻 110px、上限 150px、手勢至少 300ms |
| tooltip 位置跑掉 | 用 `getBoundingClientRect()` + `position:fixed` + 視窗夾制，不要用容器相對定位 |
| 偵測不到 Chrome 預先渲染 | 用 `document.prerendering` 或 `activationStart`，不是 `navigation.type` |
| 捲動定位「停好又被拉走一點」 | iOS 工具列收合造成頁首高度變化，觸發校正 → 校正門檻放寬到 28px |

---

## 十一、DCA Score 演算法備忘

五個因子，計算在私有後端 `api/score.js`：

| 因子 | 權重 |
|---|---|
| 200 週均線乖離 | 28.7% |
| RSI 百分位 | 20.5% |
| 回撤百分位 | 20.5% |
| VIX 百分位 | 12.3% |
| P/FCF 百分位 | 18%（僅個股） |

- P/FCF 用 `hasMa × hasPfcf` 四分支加權；ETF／加密／貴金屬倍數維持 1.0x，不報錯
- 分數 < 60 → 倍數固定 1.0x；60–100 → 線性至 1.8x（受年齡上限限制）
- 黑天鵝（回撤 ≤ −20% 且 VIX ≥ 40）→ 解鎖至 2.5x
- 股息加成：殖利率 1%–5%+ 線性 +0.02～+0.10（僅個股，黑天鵝時抑制）
- VIX 加成：VIX 30–40 之間線性 +0.00～+0.10

---

## 十二、常用工具與測試

- **測試**：Safari 無痕；`?desktop=1` 強制 1200px 視窗；`?v=N` 破快取
- **無痕視窗是第一個診斷步驟**，不是最後一個
- **外部 API**：Yahoo Finance（股價）、CoinGecko（加密）、alternative.me（恐懼貪婪）、
  FMP 免費版（P/FCF，每日 250 次）、Anthropic Claude Haiku（小咖）、
  Cloudflare Turnstile
- **Logo**：`cdn.tickerlogos.com`，allinvestview API 備援，
  `assets.js` 裡的 `DCA_LOGO_IMG` 可覆寫
- **圖片副檔名一律 `.jpg`**（不用 `.jpeg`），不一致會造成 `posts.json` 圖片破圖

---

## 十三、文章工作流程

1. 討論方向 → 確認骨架 → 完整中英草稿給 Henry 審 → 組進 `posts.json` → 轉圖
2. **草稿審過之前不要組裝**
3. 日期填實際預計發布日
4. **DCA Score chip 規則**：文章提到明確代號或公司名就加 chip
   （公司名要對應到代號）；只用後端有分數的代號；
   超過三個取分數最高的三個；Henry 可指定例外

---

*連結、版號、`lang-ok` 標記、CI 錯誤排除的細節，見 `HANDOFF_連結與版號規則.md`。*
