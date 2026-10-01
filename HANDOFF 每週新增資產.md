# DCAcafé — 每週新增一支資產（完整交接）

> **給下一個對話窗口的人／AI：讀這一份就能接手。**
> 這是唯一的流程文件（`HANDOFF 對決卡換主角.md` 已併入這裡）。
> 主要用途：**每週新資產頁的圖文執行細節，手機版與桌機版都涵蓋。**
>
> **AI 現在直接在 repo 裡工作**：自己讀檔、改檔、預覽、推送，不用再跟 Henry 要檔案。
> 只有兩樣要 Henry 給：**VS 主色的決定**與**品牌 logo 原檔**（品牌官網連不到，見步驟 2）。

DCAcafé 每週上一支新資產。做完之後：

- 首頁對決卡換成新資產（舊資產的圖檔留著，隨時可換回）
- 首頁人氣熱搜、泡泡頁 `trending.html` 出現新資產
- `dcacafe.com/asset/<代號>.html` 可以打開
- 舊資產的頁面與文章全部保留，**只有對決卡輪替**

**這份文件的重點順序**：先讀第一部分（工作方式），再讀第三部分（出圖）
與第四部分（排版）。流程步驟反而是最容易的。

---

# 第一部分：工作方式

這幾條不是原則宣示，是實際踩過的坑。**先讀這段，比讀規格重要。**
違反其中任何一條，那一輪幾乎一定會白做。

## 用拉的，不要用算的

需要決定尺寸、位置、間距時，**不要靠計算推出一個「正確答案」再交出去**。
正確做法是產出一組連續變化的圖（例如從小到大六張），讓 Henry 指哪一張。

實際發生過：算出「字高上限 15.6 CSS」交給他，他的回應是
「我跟你說過很多次，不要用算的，直接用拉的」。因為算出來的數字建立在
一堆假設上，而那些假設常常是錯的——而且錯了在數字上看不出來。

**做法**：同一張卡片渲染 4–6 個版本，每版只差一個變數，標上數值，一次給他看。
他會回「B」「第四張」「B 和 C 的中間」。回「中間」時就取兩者的中點值。

## 產出選項圖之前，先確認自己畫得對

渲染選項圖時，**錨點（`transform-origin`）必須跟真實 CSS 一致**。

實際發生過：桌機版的 VS 用 `transform-origin: 50% 50%`（中心），
但預覽圖是用手機版的 `50% 100%`（底部中央）去畫的，四個選項全部沒對齊。
Henry 的回應是「你發給我的時候你自己看得到嗎？都沒有對齊呀。」

**送出前先自己看一眼那張圖。** 手機與桌機的錨點不一樣，見第四部分。

## 一次只改一件事

對決卡有三個會變的元素（VS 圖、徽章、wordmark）。一次只換一個，
換完上線看實機，確認沒問題再換下一個。版面數值全部鎖住不動。

混在一起換，出問題就分不清是哪個元素造成的、還是版面被動到了。

## 照指示做完就停

不要因為自己覺得「還可以更好」就多補一個調整。

實際發生過：Henry 說「超出、蓋掉都不要管」，AI 還是自己去調了裁切位置，
結果畫面偏掉，他分不清是圖的問題還是 AI 動了手腳——事實上就是 AI 動了手腳。

多一個變數，下一輪就多一個說不清楚的變化。

## 未經實機驗證的微調不要送出

實際發生過：把 wordmark 從 23/23/27 改成 28/28/25，理由是「讓兩邊看起來等高」。
結果整組往兩側撐開、幾乎頂到卡片邊緣，比原本更差，已撤回。

Henry 的結論：**「未經實機驗證就送出微調 = 把可接受的狀態改差。」**

## 實機是唯一可信的基準

AI 靠計算畫出來的示意圖會有誤差。曾經把徽章當成 72% 內距去算，
實際上是滿版（`createLogoImg()` 用行內樣式覆蓋了 CSS），導致每次都算偏。

討論時以實機截圖為準；示意圖只能當草稿。

## 不要拿錯階段的東西互相比較

曾經拿「處理後的成品圖」去比「未處理的原檔」，得出「素材形狀不同」的
錯誤結論，白走一輪。比對前先確認兩邊是同一個階段。

## 推論要有證據，不要猜

MU 那次先猜是 `instrumentType` 不對、再猜是額度用完，都錯。
後來在程式裡加一行 debug 輸出，一次就看到真正的原因（`FMP 402`）。

**先加 debug 看事實，比連續猜三輪快得多。**

## 共用檔一定要先拿線上最新版

`index.html`、`css/web.css`、`assets.js`、`scripts/asset-template.html`
可能同時被別的窗口改。**動工前先 `git pull`（或重新 clone）拿 main 最新版**，
推之前再拉一次，有衝突就停下來跟 Henry 說，不要硬蓋。

實際發生過兩次。第二次 Henry 的回應是「不知道為什麼你用到舊的版本，
剛剛花了一些時間才把它修好」。

**交付前的自保動作**：用 `git diff` 看一次，
確認「只有我打算改的那幾行不同、行數一致」。改 4 行就應該只看到 4 行差異。

## 手機版與桌機版要一起想

實際發生過：VS 圖與 wordmark 都換了，**只改了手機版**，桌機版留著舊數值，
上線後才被 Henry 抓到。

原因是前面十幾輪的討論全部圍繞手機版，桌機版「一直沒動」被誤當成「不用動」。
但兩套值是獨立的（見第四部分），手機改了桌機就一定要跟。

**每次動到對決卡，收尾前問自己：桌機版對應的那幾行改了嗎？**

## Henry 的操作環境

**只用 iPhone + GitHub 網頁版。** 所以：

- AI 直接改 repo、直接推，不要叫他自己上傳或改檔
- 給他看的東西一律是**圖**（預覽截圖），不是 diff
- **手機版、桌機版的選項圖分兩次傳**，每張在說明裡寫清楚是哪一版
  （兩張一起傳，他在手機上分不出哪張是哪張，實際發生過）
- 推送一定等他說「推」，一次推送一個 commit

---

# 第二部分：每週流程

## 步驟 1 — 先驗資料源

**決定代號之後、動手做任何東西之前先驗。** 10 秒的事，可以省掉一整輪白工。

```
proxy-three-mu-47.vercel.app/api/ticker-score?ticker=XXXX&full=1&debug=1
```

**只看 `basic.partial`：**

| 看到 | 意思 | 怎麼辦 |
|---|---|---|
| `"partial": false` | ✅ 財報拿得到 | 往下做 |
| `"partial": true` | ❌ 兩個資料源都失敗 | 看 `_debugBasic`（見下） |

`partial: false` 時，`_debugBasic` 會顯示來源：

- 沒有 `usedFallback` → FMP 正常
- `"usedFallback": "finnhub"` → FMP 失敗、Finnhub 接手。**正常狀態，不用處理**

兩個都失敗時：

| `reason`（FMP） | 意思 |
|---|---|
| `all_failed` | 免費方案對這支代號回 `402`（方案不涵蓋） |
| `server_not_configured` | Vercel 少了 `FMP_API_KEY` |

| `fallbackReason`（Finnhub） | 意思 |
|---|---|
| `finnhub_not_configured` | Vercel 少了 `FINNHUB_API_KEY` |
| `finnhub_429` | 超過每分鐘 60 次，稍後再試 |
| `finnhub_empty` | Finnhub 沒有這支的資料 |

兩個都失敗才需要換資產。

### 背景：為什麼要驗

MU 做完三張圖、寫完資料檔、全部上線之後，才發現五張數據卡
（市值／本益比／EPS／年營收／殖利率）永遠停在「更新中」。

追查後發現 FMP 免費方案對 MU 回 `402` —— 不是額度用完（那會回 `429`），
是方案不涵蓋這支代號。同一時間 TSLA 完全正常，同一把金鑰、同一段程式碼，
**差別只在代號**，而且官方沒有列出哪些代號不涵蓋，無法事先預測。

後來加了 Finnhub 備援才解決：FMP 失敗時自動改打 Finnhub，
Finnhub 免費方案的限制是「每分鐘幾次」而不是「哪些代號」，正好補上缺口。

那一輪從發現到修好花了將近兩小時。

### 已知缺口：`hasPfcf`

估值因子（P/FCF）走的是**另一條 FMP 路徑，沒有加備援**。
FMP 不涵蓋的代號，五因子會少估值那一項（`hasPfcf: false`）。

刻意不補：P/FCF 是加分項，缺了不影響分數計算，而補那條路徑要另外處理
百分位的歷史區間，複雜度遠高於 basic。資料源的涵蓋範圍不是我們能控制的。

### 已驗證過的代號

| 可以 | 要走備援 |
|---|---|
| TSLA / NFLX / NVDA / AAPL / META / AMD | MU（Finnhub 備援才有資料） |

> **WebFetch 可以直接開這個網址**（bash 的 curl 對外會被擋），AI 自己就能驗，不用請 Henry 開。
> 同一支 API 帶 `full=1`（不帶 `debug`）就拿得到 `earn` / `risk` / `factors` 要填的數字。

每週補一筆，累積起來就知道命中率。

---

## 步驟 2 — 準備三張對決素材

規格與出圖方法見**第三部分**。

- **VS 圖**：**不用生圖了。** 拿母圖 `img/duel-vs-meta-spy.png` 把左邊煙霧換成新主角的主色
  （`scripts/duel-vs-recolor.py`）。只要跟 Henry 確認主色。
- **徽章與 wordmark**：要請 Henry 傳品牌 logo 原檔（直接傳到對話裡）。

> **AI 抓不到品牌官網的圖。** bash 對外連線會被擋（連 npm 上的圖示套件也被擋），
> WebFetch 只回文字、而且品牌素材頁常常禁止自動讀取（AMD 那頁就是）。
>
> Henry 傳來的檔案先檢查：**「透明背景」的 logo 常常其實是 JPEG，灰白格子是畫進去的**
> （AMD 那次就是）。這種不能直接去背，改用同一個 logo 的**黑底白字版**：
> 白字的亮度直接當 alpha，邊緣最乾淨。

---

## 步驟 3 — 寫 `assets-data/<小寫代號>.html`

複製上一支來改最快。一支約 200 行，**四個區塊都要有**。

### `<!--EN-HEAD-->` / `<!--ZH-HEAD-->`

title、description、og、twitter。每支必改，代號和公司名換掉。

`<title>` 和 `og:title` 是**刻意的兩種寫法**，不是漏改：

- `<title>`：`META DCA Score｜Dollar-Cost-Averaging Signals & Key Indicators - DCAcafé`（塞關鍵字給 SEO）
- `og:title`：`Meta Platforms (META) · DCA Score | Smarter dollar-cost averaging - DCAcafé`（給分享卡片）

### `<!--ASSET-->`

`COPY.asset` 的 JS 物件。裡面分四種東西：

| 分類 | 欄位 | 怎麼處理 |
|---|---|---|
| **真正照抄** | `faq` 四題 | 逐字複製，`{T}` 會自動代換成代號 |
| **結構照抄、數值每支重填** | `factors`、`earn`、`risk` | **一定要換成這支的數字** |
| **每支獨立寫** | `intro`、`seo.description`（中英各四套） | 全新撰寫 |
| **每支填自己的** | `ticker`、`company`、`idData`、`price`、`score` | — |

> ⚠ **`earn` / `risk` / `factors` 不是「照抄」。** 範例裡裝的是上一支的專屬數值
> （市值、本益比、EPS、52 週高低）。照抄到新的一支，頁面在資料載入完成前
> 會閃現錯誤的財務數字，而且某個欄位載入失敗就會**永久停在錯的值**。

`descPick` 每支挑不同的一套（NFLX 用 0、TSLA 用 1、META 用 2、MU 用 3、AMD 用 3）。
0–3 都用過了，之後輪流用即可。

`intro` 是 `.map()` 動態渲染，**段數不限**。預設四段
（這是誰 / 它的脾氣 / 所以交給工具 / 專屬提醒），有重大題材可以插第五段。

### `<!--STATIC-->`

**給不執行 JS 的 AI 爬蟲讀的英文靜態內容。** 見下一節，不要漏。

---

## 步驟 3b — STATIC 區塊（最容易漏的一步）

### 為什麼需要

ChatGPT、Claude、Perplexity 這類 AI 爬蟲**不執行 JS**，讀到的是原始 HTML。
而頁面上看得到的資產內容全部由 JS 載入後才替換 —— 所以在它們眼中，
每一支資產頁都長得跟當初抽範本的那一頁一樣（TSLA 頁被讀成「AAPL、Apple Inc.」）。

Google 會執行 JS 所以看起來沒事，但那個前提只涵蓋 Google。

### 格式

放在資料檔最尾巴：

```
<!--STATIC  給不執行 JS 的 AI 爬蟲讀的英文靜態內容。
@H1@
META DCA Score and dollar-cost-averaging signals
@LOGO@
M
@TICKER@
META
@COMPANY@
Meta Platforms, Inc. · NASDAQ
@INTRO_EYEBROW@
Explore META
@INTRO_BODY@
      <p><span class="lead">Who it is.</span>…</p>
      （段數要跟 ASSET 的 intro.en 一致）
@CHART_BODY@
      <p>…</p>（三段，代號換掉即可）
@FAQ_ITEMS@
      <div class="faq-item">…</div>（四題，代號換掉即可）
STATIC-->
```

解析規則只有一條：**整行剛好是 `@欄位@` 就當分隔，其餘原樣搬運、不解讀**。
所以內容裡有引號、HTML 標籤都不影響。

### 三個注意事項

1. **寫英文。** `asset/*.html` 是英文版，中文版由 `build-i18n.py` 另外產生。
2. **內容跟 ASSET 的 `intro.en` / `faq` 一致就好。** 重複是刻意的：
   一份給 JS 用，一份給爬蟲讀。改一邊記得改另一邊。
3. **不要寫即時數字。** 分數、股價、漲跌幅一律不碰，範本裡留著「—」。
   寫死會過期，而過期的金融數字比空著更糟 —— 空著看得出來，過期看不出來。

### 漏寫會怎樣

不會擋建置，也不會留下別支資產的內容。會套中性備援：代號類欄位用自己的
代號組出來、公司名顯示 `—`、介紹用通用說明。CI 輸出會列出哪幾支還沒補。

---

## 步驟 4 — 改 `assets.js`

新資產放最上面，把 `duel:true` 和三張素材從舊主角搬過來：

```js
window.DCA_ASSETS = [
  { ticker:'META', duel:true,
    duelVs:'img/duel-vs-meta-spy.png',
    duelLogo:'/logo/meta.png',
    duelWordmark:'img/duel-wordmark-meta.png',
    name:{ zh:'Meta', en:'Meta' }, cat:'growth' },

  { ticker:'MU',                        // ← duel:true 已移除，三張圖留著
    duelVs:'img/duel-vs-mu-spy.png',
    duelLogo:'/logo/mu.png',
    duelWordmark:'img/duel-wordmark-mu.png',
    name:{ zh:'美光', en:'Micron' }, cat:'growth' },
  …
];
```

| 欄位 | 作用 |
|---|---|
| `duel: true` | 對決卡主角。**同時決定卡片下方回測連結指向哪一支**。只能有一支 |
| `query` | 顯示代號 ≠ 後端查詢代號時才填（例：BTC 顯示 `BTC`、查詢用 `BTC-USD`）。**漏填不會報錯，會靜默回錯資料** |
| `duelLogo` | 對決卡徽章。跟 `DCA_LOGO_IMG` **分開**：那張表是全站自動查詢用的（熱搜卡／相關卡／Watchlist 都吃），改它會影響那些地方 |
| `cat` | `growth` / `value` / `crypto` |

**舊主角的三張圖不要刪。** 之後想換回去只要把 `duel:true` 搬回那一筆。

改完用 `node --check assets.js` 驗一次語法再交。

> ⚠ **`assets.js` 是全站共用檔。改了它（或任何 `css/*.css`、`js/*.js`、`chrome.js`）
> 就要全站版號一起跳下一號**（AMD 那次 `?v=8 → ?v=9`），包含 `generate blog.py`、
> `asset/`、`zh/`、`blog/` 裡寫死的版號，以及 `CLAUDE.md` 的「目前是」那一行。
> 跳完跑 `python3 scripts/check-links.py`，要看到「共用檔版號統一為 ?v=N」。

---

## 步驟 5 — 推送（Henry 說「推」之後）

**全部變動一個 commit 推上去。** 推之前：

1. `python3 scripts/check-links.py` 通過
2. 在暫存資料夾複製一份 repo 跑 `scripts/build-assets.py` 和 `scripts/build-i18n.py`，
   確認新資產有產出、三道自檢都過（產物不用 commit，CI 會自己生）
3. `git pull` 確認沒有別人剛推的東西被蓋掉

會動到的檔案：

| 檔案 | 放哪 |
|---|---|
| `<小寫代號>.html` | `assets-data/` |
| `assets.js` | 根目錄 |
| `web.css` | `css/`（只有調整過才需要） |
| `<小寫代號>.png` | `logo/` |
| `duel-vs-<小寫代號>-spy.png` | `img/` |
| `duel-wordmark-<小寫代號>.png` | `img/` |

推上去之後 CI 自動生成 `asset/*.html` 和 `zh/asset/*.html`；
`update-analyst` 也會因為 `assets.js` 有變而自動補抓新資產的分析師資料。
推完確認 Actions 都是綠勾。

> **不要按 GitHub 的 Re-run。** 重跑會產生兩份同名 artifact，部署階段會失敗
> （`Multiple artifacts named "github-pages"`）。要重新部署就推一個新 commit
> —— 重傳任何一個檔案都算。

---

## 步驟 6 — 驗收

**推之前先用本機預覽自己驗一次**（不改任何檔案）：

```
python3 scripts/preview-duel.py <輸出資料夾>
```

它用 repo 裡真的 `index.html` 與 CSS，在 Chromium 截出手機（390 寬）和桌機（1440 寬）的對決卡。
**自己先看過沒問題才傳給 Henry。** 跟上一週的截圖比，右半邊（SPY）應該逐點相同，
差異只能出現在左邊徽章、wordmark 和 VS。

預覽是 Chromium 不是 iPhone Safari，最後仍以 Henry 手機實機為準。

上線後：

- [ ] 首頁對決卡是新資產，兩側徽章位置跟換之前相同
- [ ] **手機版**：兩邊 wordmark 等高、各自置中於自己的 logo
- [ ] **桌機版**：同上，而且 VS 與兩側徽章垂直置中
- [ ] **`S&P 500` 沒有斷成兩行**（手機與桌機都要看）
- [ ] VS 煙霧置中，沒有壓到徽章、邊緣沒有直線切痕
- [ ] 「看看結果」的連結指向新資產
- [ ] 人氣熱搜、泡泡頁有新資產
- [ ] `asset/<代號>.html` 打得開，不是 404
- [ ] **五張數據卡有數字，不是「更新中」**（若是，代表步驟 1 沒驗）
- [ ] 五因子若少估值那一項，是已知缺口，不是壞掉
- [ ] 資料檔搜尋 `{`，確認只有 `{T}`，沒有 `{M}` 之類的手誤
- [ ] **AI 爬蟲看到的內容正確**（見下）

### 驗 AI 爬蟲讀到什麼

```
r.jina.ai/https://dcacafe.com/asset/<代號>.html?check=9
```

**兩個必要的提醒：**

1. **一定要帶 `?check=` 參數繞過快取。** 不帶的話會抓到舊版。
2. **`r.jina.ai` 會等 JS 跑完才抓，所以它證明不了原始 HTML 是對的。**
   它只能用來看「有沒有出現別支資產的名字」。要真正驗證原始 HTML，
   要在本地跑 `build-assets.py` 檢查產物。

### 畫面有改但看起來沒變？先想快取

共用 CSS 的網址是 `css/web.css?v=5`，**版號一直沒跳**。
Henry 回報過「`S&P 500` 還是兩行」，後來確認是快取，檔案其實是對的。

**遇到「改了沒反應」先請他強制重整，不要急著再改一次數值。**

---

# 第三部分：三張素材的出圖方法

## 最重要的一條

> **CSS 是固定的，換主角時不要動。所有適配都在出圖階段完成。**

對決卡有一個容易誤判的性質：**圖片的長寬比，本身就是版面的一部分**。
CSS 只鎖高度、寬度寫 `auto`：

```css
.duel-vs-asset     { height: 52px; width: auto; }   /* 寬度 = 52 × 圖片長寬比 */
.duel-wordmark img { height: 13px; width: auto; }   /* 寬度 = 13 × 圖片長寬比 */
```

換一張長寬比不同的圖，它在 flex 版面裡佔的寬度就變了，
**兩側徽章會被推開或拉近，整排重新置中，左右位置全部跑掉。**
CSS 一個字沒改，畫面卻變了 —— 這是整張卡片最容易被誤判成
「有人偷改東西」的地方。Henry 問過「為什麼沒有任何人改過，它會不一樣？」
答案就是這條。

如果這時候再用 `scale` / `translate` 去把畫面「補回來」，
就等於把 CSS 和「某一張特定的圖」綁死。換下一支時整組數字全部作廢，
必須從頭再試一次。實際發生過，燒掉整個工作階段。

**唯一的例外**：右側 `S&P 500` 是**文字**不是圖，字級要對到左側 wordmark
的字高才會等高。換主角後左側字高變了，這個字級要重算 —— 見下。

---

## ① 徽章 Logo

| 項目 | 規格 |
|---|---|
| 尺寸 | **320 × 320**（正方） |
| 內容 | **實心滿版**，填滿整個畫布 |
| 四角 | **方形，不要自己畫圓角** |
| 路徑 | `logo/<小寫代號>.png` |

圓角由 `.duel-badge` 的 `border-radius: 22%` + `overflow: hidden` 裁出來。
圖自己帶圓角會出現雙重圓角。

**做法**：從品牌包取符號（不要取含字樣的 lockup），放在品牌色實心背景上，
符號佔畫布約 55–60%。參考：META 是 `#0064E0` 藍底 + 白色 ∞。

> ⚠ `.duel-badge img { width: 72%; height: 72% }` 這條規則**實際上沒有生效**。
> 徽章的圖由 `js/logo.js` 的 `createLogoImg()` 產生，那支函式在 `<img>` 上
> 寫了行內樣式 `width:100%;height:100%;object-fit:cover`，行內樣式優先。
> **兩側徽章實際都是滿版。** 算尺寸時請以 100% 為準。
> 這條錯誤假設曾經讓連續好幾輪的計算全部偏掉。

---

## ② VS 圖 —— 現在的做法：母圖換色（AMD 起）

**以前每週最花時間的一張，現在一步到位。** 不再拿生圖工具的新圖去背、量煙霧、正規化，
而是拿**母圖 `img/duel-vs-meta-spy.png`**，只把左半邊的藍色煙霧換成新主角的主色：

```
# 黑／灰系主色：用一張白底黑煙霧的圖當深淺參考
python3 scripts/duel-vs-recolor.py img/duel-vs-<代號>-spy.png --like <黑煙霧參考圖>
# 有彩度的主色：直接給色碼
python3 scripts/duel-vs-recolor.py img/duel-vs-<代號>-spy.png --color "#E31937"
```

**為什麼這樣就對**：腳本只改顏色，alpha（透明度）一個像素都不動，
所以畫布、煙霧大小、VS 字大小、置中位置全部跟母圖逐點相同。
CSS 是配合母圖調好的，換色後版面不可能跑掉，不用再量、再算、再拉。
腳本最後會自檢「alpha 與母圖相同」，不同就報錯。

**換色規則**（腳本已內建，記在這裡是讓人知道為什麼）：

- 只動藍色（色相 165°→195° 漸進）。右邊 SPY 的綠色完全不動。
- VS 金屬字本身帶一點藍。**金屬字只去色、亮度不變**，否則字面會出現黑色雜點
  （AMD 第一版就出現過，S 字上一片髒點）。
- 黑色模式的深淺分布，取自參考圖左半邊黑煙霧的亮度分布（百分位對應），
  所以濃淡跟生圖工具畫的黑煙一樣自然。

**限制**：

- 母圖 `img/duel-vs-meta-spy.png` **永遠不要覆蓋**。
- 主色是**白色或很淡**的品牌不能用：白煙放在白卡片上會看不見，要跟 Henry 另外挑色。
- `--color` 模式只測過一次（紅色試跑，看起來正常），第一次正式用時要多看一眼淡邊。

### 舊做法：生圖原檔去背＋正規化（只在要換母圖時才用）

**為什麼放棄**：「煙霧佔高 62.8%」量的是煙霧最外框，而煙霧邊界非常不可靠。
AMD 那張原圖右邊緣有一條幾乎看不見的淡線、四周有零星雜點，腳本把它們都算成煙霧，
結果框被撐大、縮完之後 VS 小了一大截——**數字自檢全部合格，畫面卻是錯的**。
每張生圖的雜訊都不一樣，這就是以前 VS 圖每週都要來回很多輪的根本原因。

以下保留原本的規格與腳本，給「要重做母圖」時參考：

| 項目 | 規格 |
|---|---|
| 畫布 | **720 × 693**（長寬比 1.039，必須一致） |
| 煙霧 | 佔畫布**高度 62.8%** |
| 水平位置 | **煙霧整團置中**（不是 VS 字置中） |
| 垂直位置 | 畫布垂直置中 |
| 邊緣 | **最外兩圈 alpha 必須為 0** |
| 路徑 | `img/duel-vs-<主角小寫>-spy.png` |

### 三條硬條件，各自對應一個踩過的坑

**1. 畫布長寬比 1.039。**
它決定這張圖在版面裡佔多寬。比例一變，兩側徽章就移動。所有主角共用同一個畫布。

**2. 置中的基準是「煙霧整團」，不是 VS 字。**
曾經以 VS 字為準置中，結果煙霧整團偏左、壓在左邊徽章上，
Henry 看到的就是「明顯偏左」。
改成整團置中之後，**手機版 CSS 的 `translateX` 才能歸零**
（在那之前是 3px，就是在補這個偏移）。

**3. 最外兩圈 alpha 強制歸零。**
不做這步，煙霧貼齊畫布邊緣時放大會出現一條硬邊，看起來像把旁邊的元素
切掉一塊。實際發生過：一條淡線切過 SPY 徽章左緣。

### 62.8% 是怎麼來的

實測 BTC 那張原始素材得到的比例，CSS 的 `scale` 值是配合它定的。
**新素材形狀不同時，在出圖階段正規化到 62.8%，不要去動 `scale`。**

### 出圖腳本（可直接跑，已驗證能重現規格）

存成 `make_vs.py`，`python3 make_vs.py <白底原檔> img/duel-vs-<代號>-spy.png`。

```python
# -*- coding: utf-8 -*-
"""VS 圖正規化：白底原檔 → 720x693 去背 PNG（煙霧佔高 62.8%、整團水平置中）"""
import sys
import numpy as np
from PIL import Image
from collections import deque

CANVAS_W, CANVAS_H = 720, 693
SMOKE_H_RATIO      = 0.628
WHITE_THRESHOLD    = 252     # JPEG 白底是 248–255 的雜訊，用 255 會留一圈灰霧
CROP_PROFILE_RATIO = 0.05    # 緊裁門檻：剖面最大值的 5%
EDGE_RINGS         = 2

def cutout(src_path):
    im = Image.open(src_path).convert('RGB')
    a  = np.asarray(im).astype(np.int16)
    h, w, _ = a.shape
    # 「離白有多遠」：三通道中離白最遠的那一個
    dist = (255 - a).max(axis=2)
    is_white = dist <= (255 - WHITE_THRESHOLD)
    # 從畫布邊界做連通填充，只有「連得到邊界」的白才算背景。
    # 這一步是為了保護 VS 字中央那道白色高光 —— 直接用門檻去背會把它挖掉。
    bg = np.zeros((h, w), bool)
    q  = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_white[y, x] and not bg[y, x]:
                bg[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if is_white[y, x] and not bg[y, x]:
                bg[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny, nx = y+dy, x+dx
            if 0 <= ny < h and 0 <= nx < w and is_white[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True; q.append((ny, nx))
    alpha = np.clip(dist * (255.0 / max(1, 255 - WHITE_THRESHOLD)), 0, 255)
    alpha[bg] = 0
    alpha[alpha < 8] = 0      # 極低 alpha 歸零，否則緊裁會抓到看不見的尾巴
    out = np.dstack([np.asarray(im), alpha.astype(np.uint8)])
    return Image.fromarray(out, 'RGBA')

def tight_crop(im):
    # 用 alpha 的行／列剖面，取最大值的 5% 當門檻。
    # 不要用接近 0 的門檻 —— 看不見的煙霧尾巴會被算進內容，顯示時整體縮水。
    a = np.asarray(im)[:, :, 3].astype(np.float32)
    rows, cols = a.max(axis=1), a.max(axis=0)
    ty, tx = rows.max()*CROP_PROFILE_RATIO, cols.max()*CROP_PROFILE_RATIO
    ys, xs = np.where(rows >= ty)[0], np.where(cols >= tx)[0]
    return im.crop((xs.min(), ys.min(), xs.max()+1, ys.max()+1))

def place(im):
    target_h = int(round(CANVAS_H * SMOKE_H_RATIO))
    scale    = target_h / im.height
    im = im.resize((max(1, int(round(im.width*scale))), target_h), Image.LANCZOS)
    canvas = Image.new('RGBA', (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    # 以「煙霧 bbox 中心」對齊畫布中心 —— 不是以 VS 字為準
    canvas.paste(im, ((CANVAS_W - im.width)//2, (CANVAS_H - target_h)//2), im)
    a = np.asarray(canvas).copy()
    a[:EDGE_RINGS, :, 3] = 0; a[-EDGE_RINGS:, :, 3] = 0
    a[:, :EDGE_RINGS, 3] = 0; a[:, -EDGE_RINGS:, 3] = 0
    return Image.fromarray(a, 'RGBA')

if __name__ == '__main__':
    place(tight_crop(cutout(sys.argv[1]))).save(sys.argv[2])
    print('ok ->', sys.argv[2])
```

### 出完圖一定要自檢

```python
from PIL import Image; import numpy as np
a = np.array(Image.open('img/duel-vs-meta-spy.png').convert('RGBA'))[:, :, 3]
ys, xs = np.where(a > 8); h, w = a.shape
print((w, h), '高佔比 %.1f%%' % (100*(ys.max()-ys.min()+1)/h),
      '水平中心 %.1f / 畫布 %.1f' % ((xs.min()+xs.max())/2, (w-1)/2))
# 期望：(720, 693) 高佔比 62.8% 水平中心 359.x / 畫布 359.5
```

水平中心對不上畫布中心，就是「以 VS 字為準」的老毛病又回來了。

### 現有圖檔的實測值（對照用）

| 檔案 | 畫布 | 高佔比 | 水平中心 |
|---|---|---|---|
| `duel-vs-meta-spy.png` | 720×693 | 62.8% | 359.5 ✅ 正中 |
| `duel-vs-mu-spy.png` | 720×693 | 62.8% | 334.5（偏左 25px） |
| `duel-vs-tsla-spy.png` | 720×693 | 62.8% | 332.0（偏左 27px） |
| `duel-vs-btc-spy.png` | 720×693 | 100%（舊做法，未正規化） | — |

**META 那張是唯一完全合規的。** 換回舊主角時要留意：那些圖偏左，
畫面上 VS 會靠左，需要用 `translateX` 補 —— 或者更好的做法是重跑一次腳本。

---

## ③ wordmark 字樣

| 項目 | 規格 |
|---|---|
| 內容 | 品牌字樣，**字貼滿畫布、不留白** |
| 邊緣 | 上下左右不留透明邊 |
| 路徑 | `img/duel-wordmark-<主角小寫>.png` |

**字高由 CSS 的 `.duel-wordmark img { height }` 直接決定**，不需要在圖裡留白調整。

> **這是後來改掉的做法。** 之前是「在圖裡留白，讓字高對齊右側 `S&P 500`」——
> 那樣每支都要重算留白比例，很麻煩，而且留白比例錯了看不出來。
> 現在改成圖一律貼滿、靠 CSS 的 `height` 控制，簡單得多。

### 貼滿的自檢

```python
from PIL import Image; import numpy as np
a = np.array(Image.open('img/duel-wordmark-meta.png').convert('RGBA'))[:, :, 3]
ys, xs = np.where(a > 8); h, w = a.shape
print('填滿 寬 %.1f%% 高 %.1f%%' % (100*(xs.max()-xs.min()+1)/w,
                                   100*(ys.max()-ys.min()+1)/h))
# 期望：兩個都接近 100%
```

現有檔案：META 100.0 / 99.3 ✅、MU 100.0 / 99.4 ✅、BTC 100 / 100 ✅、
**TSLA 100.0 / 47.2 ❌**（舊做法留下的上下留白，換回 TSLA 時要重做）。

### 素材選擇

如果品牌有 lockup（符號 + 字樣），**用 lockup 比只用字樣好** ——
純文字的品牌名通常太短（「Meta」只有 39 CSS 寬），掛在 88 CSS 寬的徽章下面
很單薄。用 lockup 可以拉到 60–130 CSS，左右比較平衡。

符號重複出現在徽章和 wordmark 是可以接受的（Micron、Meta 都是這樣）。

### 右側 `S&P 500` 要跟著重算（**手機、桌機各一次**）

左側 wordmark 的字高變了，右側字級就要跟著調，否則兩邊不等高。

**不要用算的，用拉的**：渲染 4–6 個版本讓 Henry 挑，手機一組、桌機一組。

目前定案：

| | `font-size` | `letter-spacing` | `line-height` |
|---|---|---|---|
| 手機 | 18px | −1.2px | 13px |
| 桌機 | 46px | −3px | 32px |

（AMD 那次定的：手機從 20 拉到 18、桌機從 48 拉到 46。
「AMD」三個字母撐滿 wordmark 的整個高度，比 Meta 的 lockup 字高，所以右邊要縮。
選項圖用 `scripts/preview-duel.py <資料夾> --spy-mobile 20,19,18,17,16,15 --spy-desktop 48,46,44,42,40,38` 產生。）

> `white-space: nowrap` **不能省**。`.duel-side` 的寬度鎖成 74px / 195px，
> `S&P 500` 放大之後會超過側邊寬度，沒有 nowrap 就會被擠成兩行。
> 這個問題手機版出現過一次。

---

# 第四部分：排版方式（目前學會的全部）

## 兩套值完全獨立

`web.css` 裡 `.duel-*` 的規則名稱**手機與桌機各出現一次**：

- **手機版**：不包 media query 的區段（約第 62–117 行）
- **桌機版**：`@media (min-width: 960px)` 內（約第 1334–1380 行）

**改的時候務必確認行號落在哪一段。** 兩套值各自獨立、**不成比例**
（例如手機徽章 74px、桌機 195px，是 2.64 倍；但 VS 高度 52 → 110 是 2.12 倍），
所以不能用倍率去推另一邊的值。一邊改完，另一邊要重新拉一次選項給 Henry 挑。

## 兩個版本最關鍵的差別：VS 的錨點不同

| | `transform-origin` | 意思 |
|---|---|---|
| 手機 | `50% 100%` | **底部中央**。放大時往上與左右均勻長，底邊不動 |
| 桌機 | `50% 50%` | **正中心**。放大時四面均勻長，中心不動 |

**畫預覽圖時一定要用對應的那一套。** 用錯會整批對不齊（實際發生過）。

桌機改成中心錨點是刻意的：Henry 要「以中心為準放大」，中心錨點下
調整尺寸不會連帶位移，比較好調。手機維持底部錨點是因為它要「往下靠近 wordmark」
的那組微調是以底邊為基準談出來的，改掉會讓既有數值全部失效。

## 手機版（不包 media query）

```css
.duel-stage      { padding: 28px 12px 0; }
.duel-row        { display: flex; align-items: center; justify-content: center; gap: 14px; }
.duel-side       { display: flex; flex-direction: column; align-items: center;
                   gap: 4px; width: 74px; }
.duel-side-left  { transform-origin: 100% 0%; transform: scale(1.196); }
.duel-side-right { transform-origin: 0% 0%;   transform: scale(1.196); margin-left: 0; }
.duel-badge      { width: 74px; height: 74px; border-radius: 22%; }
.duel-wordmark     { height: 13px; }
.duel-wordmark img { height: 13px; width: auto; }
.duel-wm-spy     { font-weight: 900; font-size: 18px; line-height: 13px;
                   color: #2F4437; letter-spacing: -1.2px; white-space: nowrap; }
.duel-tksub      { display: none; }
.duel-vs-asset   { height: 52px; width: auto; z-index: 3;
                   transform-origin: 50% 100%;
                   transform: translate(0, 24px) scale(2.0); }
.duel-headline-zone { padding: 26px 18px 14px; }
.duel-headline   { font-size: 11px; font-weight: 600; color: var(--ink3);
                   letter-spacing: 2px; text-transform: uppercase;
                   font-family: var(--font-sans); }
```

## 桌機版（`@media (min-width: 960px)`）

```css
.duel-stage      { padding: 60px 50px 0; }
.duel-row        { display: flex; align-items: center; justify-content: center; gap: 31px; }
.duel-side       { display: flex; flex-direction: column; align-items: center;
                   gap: 10px; width: 195px; }
.duel-side-left  { transform-origin: 100% 0%; transform: scale(1.196); }
.duel-side-right { transform-origin: 0% 0%;   transform: scale(1.196); margin-left: 50px; }
.duel-badge      { width: 195px; height: 195px; border-radius: 22%; }
.duel-wordmark     { height: 32px; }
.duel-wordmark img { height: 32px; width: auto; }
.duel-wm-spy     { font-weight: 900; font-size: 46px; line-height: 32px;
                   color: #2F4437; letter-spacing: -3px; white-space: nowrap; }
.duel-tksub      { font-size: 13px; font-weight: 700; letter-spacing: 2.6px;
                   text-transform: uppercase; color: var(--ink3); margin-top: -8px; }
.duel-vs-asset   { height: 110px; width: auto; z-index: 3;
                   transform-origin: 50% 50%;
                   transform: translate(29.5px, 0) scale(2.78); }
.duel-headline-zone { padding: 60px 40px 28px; }
.duel-headline   { font-size: 34px; font-weight: 600; color: var(--ink3);
                   letter-spacing: 2px; text-transform: uppercase;
                   font-family: var(--font-sans); }
```

**這些值是實機逐項調出來的。記錄在這裡是為了讓後續對話知道現況是什麼，
不是讓人拿去猜著改的。**

## 有理由的設計，不要「順手優化」掉

**`.duel-side { width: 74px / 195px }` — 側邊寬度必須鎖死**

不鎖的話，側邊寬度會取「徽章」和「wordmark」的較大值。換一張比較寬的
wordmark、或調一次 `S&P 500` 的字級，那一側就變寬變窄，整排跟著重新置中
—— **左右位置就跑掉了**。鎖死之後 wordmark 只是視覺溢出，不會推動版面。

**`.duel-side-left / right { transform: scale(1.196) }` — 兩側各自從內側角落放大**

錨點一個是 `100% 0%`（右上）、一個是 `0% 0%`（左上），
所以兩側是「往外、往下」長，**上緣位置不變**。
Henry 明確要求過「左右兩個 Logo 在向下放大靠近 wordmark，上緣位置不變」，
就是靠這兩個錨點達成的，不要改成中心錨點。

**桌機 `.duel-side-right { margin-left: 50px }` — 補償用的**

桌機的 VS 錨點原本是 `0% 100%`（只往右長），整團會偏右，用 50px 把右側推開來補。
手機版錨點是 `50% 100%`（往兩側均勻長），所以 `margin-left` 設成 0。
桌機錨點後來改成 `50% 50%` 並用 `translateX` 補償，**這個 `margin-left` 仍然生效，
不要順手刪掉**。

**VS 圖的 `z-index: 3`**

讓 VS 蓋在兩側徽章上。煙霧邊緣輕微重疊是設計的一部分，不是 bug。

**`.duel-headline` 的六個屬性比照 `main.css` 的 `.insights-title`**

Henry 給的標準是「就用這張卡片標題『歷史回測』那四個字，大小顏色都一樣」。
**只有手機版要一致**（桌機的 `font-size` 維持 34px，其餘五項比照）。
中英文共用同一組值。

## 微調的常用語彙（Henry 的說法 → 實際改哪裡）

| 他說 | 改什麼 |
|---|---|
| 「兩個 Logo 加大，但只能往下放大」 | `.duel-side-*` 的 `scale`，錨點保持在上緣 |
| 「VS 以中心為準放大 50%」 | 桌機 `.duel-vs-asset` 的 `scale`，錨點 `50% 50%` |
| 「VS 水平高度往下移動一點」 | `transform` 的 `translateY`（手機每次 2px 為宜；曾經一次 6px 太多） |
| 「三個元素維持原尺寸間距，一起往下靠近 wordmark」 | `.duel-stage` 的上 padding 與 `.duel-side` 的 `gap` |
| 「字距太散」 | `letter-spacing`（`S&P 500` 用負值） |
| 「B 和 C 的中間」 | 取兩個選項數值的中點 |

---

# 第五部分：生成流程與全站規則

## `scripts/build-assets.py`

`assets-data/*.html` + `scripts/asset-template.html` → `asset/*.html`。

**內建三道自檢，任何一道沒過就擋建置：**

| 自檢 | 訊息 |
|---|---|
| 產物出現日期（`20XX-XX-XX`） | `的產物出現日期：…` |
| 產物出現簡體字 | `的產物出現簡體字：…` |
| 殘留未替換的 `@TOKEN@` | `的產物殘留 token：…` |

簡體字那道是後來加的。實際發生過：資料檔的 ZH-HEAD 和註解裡混進了簡體字
（「聰」「蟲」「靜」的簡體寫法），會出現在中文版的分享卡片上。
字表收約 60 個常見字，刻意不求窮盡 —— 寧可漏抓，不要誤殺
（例如「著/着」兩岸都用，不列入）。

## `scripts/build-i18n.py`

`asset/*.html` → `zh/asset/*.html` + `chrome.js` + `sitemap.xml`。

**它只替換 head 區塊、`<html lang>` 和 `DCA_LANG`，不碰 `<body>` 的文字。**

所以中英文共用同一份 body。這造成一個取捨：

- `asset/*.html`（英文版）的原始 HTML **必須是英文**
- `zh/asset/*.html` 的原始 HTML 因此**也是英文**

**已決定走這條路**：中文版人看到的還是中文（JS 會換），
只有不執行 JS 的爬蟲會讀到英文。而那些爬蟲主要抓英文頁，中文頁權重低得多。
要兩邊都對得多寫一份中文 STATIC，工作量三倍還要人工同步，不划算。

**所以：`asset-template.html` 裡寫死的文字一律用英文。**
英文寫法取自 `U` 物件的 `{zh:…, en:…}` 對照和 `asset-page.js`，不要自己編。

## 全站硬規則

- **任何檔案（含註解）都不寫日期。** CI 會擋。
- **繁體中文**，不寫簡體。CI 會擋。
- 投資語境用「訊號／指標」，不用「建議」。

### 文案不能有時效性

資產頁會一直留著（BTC、NFLX 上線後都沒下架），**隨時打開都必須是對的**。

| ❌ 不能用 | ✅ 改成 |
|---|---|
| 今年、今天、最近、近期、近年、如今 | 直接寫絕對年份：「2025 年起」 |
| this year / recently / lately / currently / today | `In 2025` / `From 2024` / `at any given moment` |

絕對年份十年後讀還是對的；「今年」明年就錯了，而且**沒有機制會提醒我們回頭改**。

寫某一年會發生什麼變化是可以的（「2026 年的變數」），
不能用的是那些「以閱讀當下為基準」的詞。

**一個例外**：指「使用者打開頁面的當下」的「現在」是可以的，
例如 FAQ 的「{T} 現在的『加碼倍數』是什麼意思？」、description 的
「看 META 現在的 DCA Score 落在哪裡」。分數本來就每天在變，這個「現在」永遠成立。

### 佔位符一律是 `{T}`

`faq` 和 `intro` 裡的代號佔位符是 **`{T}`**，由程式自動代換成該資產的代號。

**實際踩過**：MU 和 META 兩支誤寫成 `{M}`（各 26 / 28 處），
頁面上直接顯示「`{M}` 旗下有 Facebook…」。
寫完一定要搜一次 `{`，確認只有 `{T}`。

---

# 第六部分：待辦與未決

## 1. `?v=` 版號

已經改成「動到共用檔就全站一起跳」，AMD 那次是 `?v=9`。
`check-links.py` 要求所有共用檔版號一致。Henry 回報「改了沒反應」時仍然先想快取。

## 2. C 方案：把分數寫進 HTML（先不做）

目標是讓 AI 直接引用 DCA Score。目前分數在原始 HTML 裡是「—」，
所以不執行 JS 的爬蟲（GPTBot、ClaudeBot、PerplexityBot）看不到分數。

**不做的理由**：要架每日重生頁面的排程，而且有個難察覺的風險 ——
排程某天掛了，頁面會停在一個看起來正常、其實過期的數字，比顯示「—」更糟。

等 Henry 決定方向再談。

## 3. ASSET 與 STATIC 內容重複

`intro.en` / `faq` 在兩個區塊各寫一次，只改一邊就會不一致。
之後可以考慮在 CI 加比對檢查。低優先。

## 4. 舊主角的圖不合新規格

`duel-vs-btc-spy.png`（未正規化）、`duel-vs-tsla-spy.png` / `duel-vs-mu-spy.png`
（偏左 25–27px）、`duel-wordmark-tsla.png`（上下留白 53%）。
換回這些主角時，VS 圖直接用 `scripts/duel-vs-recolor.py` 從母圖換色重做，不要直接改 CSS 去補。

## 5. 全形冒號

英文頁顯示 `Updated：…` 的冒號是全形，在 `js/asset-page.js` 裡。
**Henry 說不用改。**

---

# 附錄：AMD 那一週的實際產出

| 項目 | 值 |
|---|---|
| 代號 | AMD，`cat: 'growth'`，中文名「超微」 |
| 資料源 | FMP 正常（沒有 `usedFallback`），`hasPfcf: true` |
| 徽章 | 黑底 + 白色完整 logo（AMD 字樣＋箭頭），logo 寬佔畫布 76%，320×320 |
| VS 圖 | **母圖換色**：META 那張的藍煙換成黑煙，alpha 與母圖逐點相同 |
| wordmark | 只取「AMD」三個字（去掉箭頭），黑字透明底，596×171，比例 3.49，貼滿 |
| 素材來源 | Henry 傳的黑底白字 logo。他另外傳的「透明」黑字版其實是畫了灰白格子的 JPEG，不能用 |
| 財務數字 | 市值 1.00 兆、P/E 229、EPS 2.67、營收 346 億（年增 34%）、淨利率 15.6%、毛利率 53.2%、不配息、52 週 $162–$631 |
| `descPick` | 3 |
| intro | 四段（這是誰／它的脾氣／所以交給工具／專屬提醒：本益比被 Xilinx 攤銷墊高） |
| CSS | 只動 `.duel-wm-spy` 字級兩行：手機 20→18、桌機 48→46 |
| 版號 | `?v=8 → ?v=9` |

**這一週的流程（以後照這個）**：
驗資料源 → 跟 Henry 確認主色、拿 logo → 換色出 VS、做徽章與 wordmark →
`preview-duel.py` 截手機／桌機，自己先看 → 給 Henry 看一次 →
拉 S&P 500 字級選項（手機、桌機分開傳）→ 寫資料檔、改 `assets.js`、跳版號 →
本機跑 build 與 check-links → Henry 說「推」→ 一個 commit 推上去。

---

# 附錄：META 那一週的實際產出

素材與數值，可以當下一支的參考：

| 項目 | 值 |
|---|---|
| 代號 | META，`cat: 'growth'` |
| 徽章 | `#0064E0` 藍底 + 白色 ∞，符號佔畫布 82%×54%，320×320 |
| VS 圖 | 藍／綠煙霧，720×693，佔高 62.8%，**整團置中（水平中心 359.5 = 畫布正中）** |
| wordmark | 完整 lockup（∞ + Meta），1400×283，比例 4.95，字貼滿畫布 |
| 資料源 | FMP 正常，`hasPfcf: true` |
| 財務數字 | 市值 1.92 兆、P/E 31、EPS 23.98、營收 2,010 億、淨利率 29.8%、毛利率 81.7%、殖利率 0.28%、52 週 $526–$761 |
| `descPick` | 2 |
| intro | 五段（多插一段講 Muse） |

## 這一輪改到的 CSS

**手機版**：`.duel-side` gap 5→4、`.duel-wordmark` 23→13px、
`.duel-wm-spy` 15→20px / `-1.2px` / 補 `nowrap`、VS `translateX` 3→0。

**桌機版**（4 行，逐行 diff 驗證過只有這 4 行變動）：
`.duel-wordmark` 48→32px、`.duel-wordmark img` 48→32px、
`.duel-wm-spy` 29px/`-2px`/`line-height:48px` → 48px/`-3px`/`line-height:32px`、
`.duel-vs-asset` `translate(40px,-14.5px) scale(2.55)` → `translate(29.5px,0) scale(2.78)`。

## Muse 的寫法

Meta 推出的個人 AI 代理人，不是聊天機器人 —— 跑在專屬安全環境、
連接信箱／行事曆／支付／購物，能訂行程、填表單、下單。
有訂閱制（免費層 + 月費 20 / 100 美元）。

Henry 的定調：**「不會是新聞，而是未來 10 年內的重點項目」**，所以要提到，
但用投資面的角度寫，不要寫成產品發表稿：
AI 支出第一次有了看得見的產品可以評估，而訂閱制是 Meta 第一次讓廣告以外的
收入具備規模潛力；同時也是一場信任測試。

段落標題用「新的變數。／A new variable.」，**不要用「今年的轉折」**（有時效性）。
