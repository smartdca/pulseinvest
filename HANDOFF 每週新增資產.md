# 每週新增一支資產 — 完整流程

DCAcafé 每週上一支新資產。這份文件是**從頭到尾的操作順序**，
開新對話時把這份貼給 AI，它就能接手。

三張對決素材的技術規格另見 `HANDOFF_對決卡換主角.md`，
這份只在第 2 步指過去，不重複。

**做完之後的狀態**：
- 首頁對決卡換成新資產（舊的圖檔留著，隨時可換回）
- 首頁人氣熱搜、泡泡頁 `trending.html` 出現新資產
- `dcacafe.com/asset/<代號>.html` 可以打開
- 舊資產的頁面、文章全部保留不動

---

## 步驟 1 — 先驗資料源

**決定代號之後、動手做任何東西之前先驗。** 10 秒的事，可以省掉一整輪白工。

開這個網址（把 `XXXX` 換成代號）：

```
proxy-three-mu-47.vercel.app/api/ticker-score?ticker=XXXX&full=1&debug=1
```

**只看 `basic.partial`：**

| 看到 | 意思 | 怎麼辦 |
|---|---|---|
| `"partial": false` | ✅ 財報拿得到 | 往下做 |
| `"partial": true` | ❌ 兩個資料源都失敗 | 看 `_debugBasic` 判斷（見下） |

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

MU（2026-09）做完三張圖、寫完資料檔、全部上線之後，
才發現五張數據卡（市值／本益比／EPS／年營收／殖利率）永遠停在「更新中」。

追查後發現 FMP 免費方案對 MU 回 `402` —— 不是額度用完（那會回 `429`），
是方案不涵蓋這支代號。同一時間 TSLA 完全正常，同一把金鑰、同一段程式碼，
**差別只在代號**，而且官方定價頁沒有列出哪些代號不涵蓋，無法事先預測。

後來加了 Finnhub 備援才解決：FMP 失敗時自動改打 Finnhub，
Finnhub 免費方案的限制是「每分鐘幾次」而不是「哪些代號」，正好補上缺口。

那一輪從發現到修好花了將近兩小時。

### 已知的缺口：`hasPfcf`

估值因子（P/FCF）走的是**另一條 FMP 路徑，沒有加備援**。
FMP 不涵蓋的代號，五因子會少估值那一項（`hasPfcf: false`）。

這是刻意的取捨：P/FCF 本來就是加分項，缺了不影響分數計算，
而補那條路徑要另外處理百分位的歷史區間，複雜度遠高於 basic。
**不打算補** —— 資料源的涵蓋範圍不是我們能控制的。

---

## 步驟 2 — 準備三張對決素材

規格與做法**全部在 `HANDOFF_對決卡換主角.md`**，那份講得很細，這裡只列要產出什麼：

| 素材 | 檔名 | 一句話規格 |
|---|---|---|
| 徽章 | `logo/<小寫代號>.png` | 320×320、實心滿版、四角方形 |
| VS 圖 | `img/duel-vs-<小寫代號>-spy.png` | 畫布 720×693、煙霧佔高 62.8%、VS 字水平置中 |
| wordmark | `img/duel-wordmark-<小寫代號>.png` | 標誌貼滿畫布不留白，字高自動對上右側 `S&P 500` |

**核心原則：CSS 永遠不動，所有適配在出圖階段完成。**

會用到的素材要請 Henry 提供：

- **VS 圖**：Henry 用生圖工具做好的原檔（白底 JPEG），AI 負責去背、正規化
- **徽章與 wordmark**：品牌素材包或單張圖。**AI 沒有網路，不能自己抓圖**

一次只換一個元素，換完上線看實機，確認沒問題再換下一個。

---

## 步驟 3 — 寫 `assets-data/<小寫代號>.html`

複製 `tsla.html` 來改最快。一支約 200 行，**四個區塊都要有**：

### `<!--EN-HEAD-->` / `<!--ZH-HEAD-->`
title、description、og、twitter。每支必改，代號和公司名換掉。

### `<!--ASSET-->`
`COPY.asset` 的 JS 物件。裡面分兩種東西：

| 分類 | 欄位 | 怎麼處理 |
|---|---|---|
| **真正照抄** | `faq` 四題 | 逐字複製，`{T}` 會自動代換 |
| **結構照抄、數值每支重填** | `factors`、`earn`、`risk` | **一定要換成這支的數字** |
| **每支獨立寫** | `intro` 四段、`seo.description` 中英各四套 | 全新撰寫 |
| **每支填自己的** | `ticker`、`company`、`idData`、`price`、`score` | — |

> **`earn` / `risk` / `factors` 不是「照抄」**。範例裡裝的是那一支的專屬數值
> （市值、本益比、EPS、52 週高低）。照抄到別支上，頁面在資料載入完成前
> 會閃現錯誤的財務數字，而且某個欄位載入失敗就會永久停在錯的值。

`descPick` 每支挑不同的一套（NFLX 用 0、TSLA 用 1、MU 用 3）。

### `<!--STATIC-->`
**給不執行 JS 的 AI 爬蟲讀的英文靜態內容。** 見下一節。

---

## 步驟 3b — STATIC 區塊（不要漏）

### 為什麼需要

ChatGPT、Claude、Perplexity 這類 AI 爬蟲**不執行 JS**，讀到的是原始 HTML。
而頁面上看得到的資產內容全部由 JS 載入後才替換 —— 所以在它們眼中，
每一支資產頁都長得跟當初抽範本的那一頁一樣（TSLA 頁被讀成「AAPL、Apple Inc.」）。

Google 會執行 JS 所以看起來沒事，但那個前提只涵蓋 Google。

### 格式

放在資料檔最尾巴，複製 `tsla.html` 那一段來改：

```
<!--STATIC  給不執行 JS 的 AI 爬蟲讀的英文靜態內容。
@H1@
TSLA DCA Score and dollar-cost-averaging signals
@LOGO@
T
@TICKER@
TSLA
@COMPANY@
Tesla, Inc. · NASDAQ
@INTRO_EYEBROW@
Explore TSLA
@INTRO_BODY@
      <p><span class="lead">Who it is.</span>…</p>
      （四段，就是 ASSET 區塊 intro.en 的文字）
@CHART_BODY@
      <p>…</p>（三段，代號換掉即可）
@FAQ_ITEMS@
      <div class="faq-item">…</div>（四題，代號換掉即可）
STATIC-->
```

### 三個注意事項

1. **寫英文。** `asset/*.html` 是英文版，中文版由 `build-i18n.py` 另外產生。
2. **內容跟 ASSET 的 `intro.en` / `faq` 一致就好。** 重複是刻意的：
   一份給 JS 用，一份給爬蟲讀。
3. **不要寫即時數字。** 分數、股價、漲跌幅一律不碰，範本裡留著「—」。
   寫死會過期，而過期的金融數字比空著更糟 —— 空著看得出來，過期看不出來。

### 漏寫會怎樣

**不會擋建置，也不會留下別支資產的內容。** 會套中性備援：
代號類欄位用自己的代號組出來、公司名顯示 `—`、介紹用通用說明。

CI 輸出會列出哪幾支還沒補：
```
[build-assets] ⚠ 缺 STATIC 區塊（套中性備援）：xxxx.html
```

---

## 步驟 4 — 改 `assets.js`

新資產放最上面，並把 `duel:true` 和三張素材從舊主角搬過來：

```js
window.DCA_ASSETS = [
  { ticker:'MU', duel:true,
    duelVs:'img/duel-vs-mu-spy.png',
    duelLogo:'/logo/mu.png',
    duelWordmark:'img/duel-wordmark-mu.png',
    name:{ zh:'美光', en:'Micron' }, cat:'growth' },

  { ticker:'TSLA',                      // ← duel:true 已移除，三張圖留著
    duelVs:'img/duel-vs-tsla-spy.png',
    duelLogo:'/logo/tsla.png',
    duelWordmark:'img/duel-wordmark-tsla.png',
    name:{ zh:'特斯拉', en:'Tesla' }, cat:'growth' },
  ...
];
```

| 欄位 | 作用 |
|---|---|
| `duel: true` | 對決卡主角。**同時決定卡片下方回測連結指向哪一支**。只能有一支 |
| `query` | 顯示代號 ≠ 後端查詢代號時才填（例：BTC 顯示 `BTC`、查詢用 `BTC-USD`）。**漏填不會報錯，會靜默回錯資料** |
| `cat` | `growth` / `value` / `crypto` |

**舊主角的三張圖不要刪**，之後想換回去只要把 `duel:true` 搬回那一筆。

---

## 步驟 5 — 上傳

| 檔案 | 放哪 |
|---|---|
| `<小寫代號>.html` | `assets-data/` |
| `assets.js` | 根目錄 |
| `<小寫代號>.png` | `logo/` |
| `duel-vs-<小寫代號>-spy.png` | `img/` |
| `duel-wordmark-<小寫代號>.png` | `img/` |

推上去之後 CI 自動生成 `asset/*.html` 和 `zh/asset/*.html`。

**不要按 GitHub 的 Re-run。** 重跑會產生兩份同名 artifact，
部署階段會失敗（`Multiple artifacts named "github-pages"`）。
要重新部署就推一個新 commit —— 重傳任何一個檔案都算。

---

## 步驟 6 — 驗收

- [ ] 首頁對決卡是新資產，兩側徽章位置跟換之前相同
- [ ] 兩邊 wordmark 等高、各自置中於自己的 logo
- [ ] VS 煙霧沒有壓到徽章、邊緣沒有直線切痕
- [ ] 桌機版 `S&P 500` 沒有斷成兩行
- [ ] 「看看結果」的連結指向新資產
- [ ] 人氣熱搜、泡泡頁有新資產
- [ ] `asset/<代號>.html` 打得開，不是 404
- [ ] **五張數據卡有數字，不是「更新中」**（若是，代表步驟 1 沒驗）
- [ ] 五因子若少了估值那一項，是已知缺口，不是壞掉
- [ ] **AI 爬蟲看到的內容正確**（見下）

### 驗 AI 爬蟲讀到什麼

看原始碼，不是看畫面 —— 畫面本來就是對的。

```
r.jina.ai/https://dcacafe.com/asset/<代號>.html
```

確認標題、代號、公司名、介紹文字都是該資產自己的，
而且**沒有出現別支資產的公司名**。

---

## 給 AI 的工作方式提醒

這幾條是實際踩過的，不是原則宣示。

**照指示做完就停。** 不要因為自己覺得「還可以更好」就多補一個調整。
多一個變數，下一輪就多一個說不清楚的變化，而且 Henry 會分不清畫面上的
變化是他要的那一步造成的、還是 AI 自己加的。

**實機是唯一可信的基準。** AI 靠計算畫出來的示意圖會有誤差
（例如曾把徽章當成 72% 內距去算，實際上是滿版，導致每次都算偏）。
討論時以實機截圖為準。

**不要拿錯階段的東西互相比較。** 曾經拿「處理後的成品圖」去比「未處理的原檔」，
得出「素材形狀不同」的錯誤結論，白走一輪。比對前先確認兩邊是同一個階段。

**推論要有證據，不要靠猜。** MU 那次先猜是 `instrumentType` 不對、
再猜是額度用完，都錯。後來在程式裡加了一行 debug 輸出，一次就看到真正的原因
（`FMP 402`）。**先加 debug 看事實，比連續猜三輪快得多。**

**共用檔要先拿線上最新版當基準。** `index.html`、`web.css`、`assets.js`
可能同時被別的窗口改。曾經拿舊版當基準改完交出去，差點把別人的改動蓋掉。

**Henry 只用 iPhone + GitHub 網頁版操作。** 不要給 patch 或 diff，
一律給完整替換檔。GitHub 網頁版的 Upload files 沒有路徑欄位，
要先點進資料夾再上傳。
