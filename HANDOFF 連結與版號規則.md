# HANDOFF — 連結與版號規則

> CI 的守門程式 `scripts/check-links.py` 擋下推送時，錯誤訊息會指向這份文件。
> 這裡說明：它在擋什麼、為什麼要擋、怎麼修、以及什麼情況可以放行。

---

## 一、動手之前：先確認線上有什麼檔案

**這是整份文件最重要的一段。** 今天（連結修復那一輪）繞掉的兩個多小時，
全部來自同一個錯誤：**拿手上的檔案當成線上的檔案在推論。**

實際發生過的事：

| 情況 | 後果 |
|---|---|
| 對話框裡留著一份自己重寫的簡化版 `build-i18n.py`，差點拿它當基底改 | 會覆蓋掉線上真正在跑的版本 |
| 斷定線上的 `generate blog.py` 是新版，實際上是舊版 | 修了半天，修的是另一支檔案 |
| repo 根目錄和 `scripts/` 各有一份 `generate blog.py`，只有根目錄那份在跑 | CI 報的行號跟手上的檔案永遠對不上，繞了兩小時 |
| 沒確認就判斷根目錄那份是「舊備份」，叫人刪掉 | 文章發布流程直接掛掉 |

### 規則

1. **要改哪支檔案，就先請 Henry 下載那支檔案。** 不要用先前對話留下的副本，
   不要用自己重建的版本，不要憑印象重打。
2. **不確定一支檔案有沒有人在用，就問，不要猜。** 特別是 `.py` 和 `.yml`。
   判斷依據只能是「看到 workflow 裡寫著它的路徑」，不能是「看起來像備份」。
3. **同名檔案可能不只一份。** 動手前用 GitHub 搜尋框搜檔名，確認只有一個位置。
4. **CI 錯誤訊息裡的路徑要一個字一個字看。**
   `generate blog.py` 和 `scripts/generate blog.py` 是兩支不同的檔案。
   `check-links.py` 印路徑時，根目錄的檔案沒有前綴，子目錄的有。

---

## 二、GitHub Actions 的兩個陷阱

### 陷阱 1：Re-run 不會用新檔案

按 **Re-run**（build 面板右上角那個 ⟳ 圖示）會回到**那個 commit 當時的檔案狀態**
重跑一次。檔案已經修好了也沒用，它看不到。

畫面上的差別：

- `Re-run triggered N minutes ago` ← 重跑，看的是舊狀態
- `#57: Commit xxxxxxx pushed by smartdca` ← 真正的新執行

**修好檔案之後要推一個新 commit**，不能按重跑。

### 陷阱 2：一次推送分成多個 commit 會撞車

上傳檔案時如果分成好幾次 commit，Pages 會同時觸發多個部署，
出現 `Multiple artifacts named "github-pages"` 並失敗。

**一次 commit 上傳所有檔案。**

### 附帶：workflow 的 paths 過濾

`build-i18n.yml` 和 `publish-blog.yml` 都有 `push.paths` 過濾。
只刪掉一支不在清單裡的檔案，可能整條 workflow 都不會被觸發。
看到「推了但 Actions 沒動靜」，先去 `.yml` 裡確認 paths。

---

## 三、`check-links.py` 在擋什麼

### 設計原則

**不列舉「哪種寫法是錯的」，而是拿實際存在的檔案來對。**

第一版是列舉錯誤樣式，被兩種寫法繞過去：

```js
li('/index.html#backtest')                        // 網址當函式參數傳
'<a href="/asset/' + ticker.toLowerCase() + '.html">'   // 網址切成三段字串接起來
```

現在的版本只問客觀事實：這個網址指得到東西嗎？該有中文版的有沒有帶前綴？

### 五條規則

| # | 擋什麼 | 為什麼 |
|---|---|---|
| ① | 連結指向不存在的檔案 | 拆頁、改檔名、刪檔之後忘了改連結 |
| ② | 已拆成獨立頁面的舊錨點（`/index.html#backtest` 等） | 頁面還在但區塊搬走了，連過去只會停在首頁 |
| ③ | 指向「有中文版的頁面」卻沒經過語言判斷 | 中文使用者點下去掉到英文版 |
| ④ | 共用檔版號不一致，或沒帶版號 | 同一支檔被當兩個檔案抓兩份，症狀是「改好了一半」 |
| ⑤ | 版號字串帶日期 | 站台硬規則：任何檔案不出現日期 |

---

## 四、被擋下來時怎麼修

### 「指向不存在的檔案」

網址打錯，或那支檔案已經刪了。改成正確路徑，或把連結拿掉。

### 「舊網址 /index.html#backtest」

回測和學習空間已經是獨立頁面：

- `/index.html#backtest` → `/backtest.html`
- `/index.html#learn` → `/learn.html`

### 「寫死的連結 xxx（這頁有中文版）」

改成走語言判斷。判斷邏輯全站只有一份，在 `chrome.js` 的 `fhref()`，
對外暴露成 `window.dcaHref`。

**寫法 A — 執行時產生的連結：**

```js
var href = '/asset/aapl.html';
try { if (typeof window.dcaHref === 'function') href = window.dcaHref(href); } catch(e){}
```

`dcaHref` 還沒載入時維持原本的英文網址，不會壞掉。

**寫法 B — 寫在 HTML 裡的連結：**

用 `data-href` 交給 `syncNavHrefs()` 處理（首頁選單就是這樣做的）。

**寫法 C — chrome.js 內部：** 直接用 `fhref()` 或 `li()`。

### 「沒有版號」／「版號不一致」

全站共用檔（`chrome.js`、`assets.js`、`css/*.css`、`js/*.js`）必須帶同一個版號。
現在是 `?v=5`。改了任何一支共用檔的內容，**全站版號一起跳到下一個數字**。

> 文章頁的 `chrome.js` 長期沒帶版號，導致全站的語言修正對文章頁一律不生效——
> 這就是「改好了一半」那種難查症狀的來源。

### 「版號帶日期」

版號寫成年月日那種格式（八位數字加尾碼）就會被擋。改成 `?v=6` 這種純數字。

---

## 五、什麼情況可以放行

真的必須寫死時，在那一行或**前三行以內**加 `lang-ok`，並在旁邊寫清楚理由。

```js
/* lang-ok:這段跑在所有資源之前，chrome.js 還沒載入、window.dcaHref 不存在，
   只能自己讀 localStorage 判斷語言。 */
var zh = false;
try { zh = localStorage.getItem('dcacafe_lang') === 'zh'; } catch(e){}
var url = (zh ? '/zh' : '') + '/backtest.html';   /* lang-ok:見上方說明 */
```

**注意標記的距離。** 檢查程式只看「該行與前三行」。說明寫得長的話，
在被擋的那一行本身也補一個 `lang-ok:見上方說明`。

### 已內建的例外，不用另外標記

- 含有 `canonical`、`hreflang`、`og:url`、`LANG_PATHS` 的行——
  那是給搜尋引擎的宣告或語言對照表，本來就該是絕對且固定的
- `chrome.js` 裡由 CI 維護的三個區塊：`ZH_READY-ASSETS`、`ZH_READY-BLOG`、`FOOTER-ASSETS`
- `scripts/check-links.py` 自己（內文全是錯誤範例）

---

## 六、由 CI 自動維護的區塊

這些地方**不要手改**，改了下次會被蓋掉。要改請改產生它的程式。

| 區塊 | 位置 | 由誰維護 | 來源 |
|---|---|---|---|
| `ZH_READY-ASSETS` | `chrome.js` | `scripts/build-i18n.py` | `asset/` 目錄 + `ROOT_PAGES` |
| `FOOTER-ASSETS` | `chrome.js` | `scripts/build-i18n.py` | `asset/` 目錄 |
| `ZH_READY-BLOG` | `chrome.js` | 根目錄 `generate blog.py` | `posts.json` |
| `ASSETS-START/END` | `sitemap.xml` | `scripts/build-i18n.py` | `asset/` 目錄 |
| `BLOG-START/END` | `sitemap.xml` | 根目錄 `generate blog.py` | `posts.json` |

**設計理念：能消除的就消除，不能消除的才偵測。**

頁尾的資產清單原本是手寫的三支，BTC 加進來之後漏掉了。
改成 CI 依 `asset/` 目錄產生之後，這種疏漏不可能再發生——
不是「有人會抓到」，而是「根本沒有出錯的機會」。

---

## 七、檔案位置備忘（容易搞錯的）

| 檔案 | 正確位置 | 備註 |
|---|---|---|
| `generate blog.py` | **根目錄** | `ROOT = Path(__file__).parent`，搬到子目錄會找不到 `posts.json`。檔名含空格，上傳時用「Add file → Create new file」手動打路徑 |
| `build-i18n.py` | `scripts/` | `ROOT` 取的是上上層，設計上就在子目錄 |
| `build-assets.py` | `scripts/` | 同上 |
| `check-links.py` | `scripts/` | 同上 |

> `generate blog.py` 和 `build-i18n.py` 的 `ROOT` 算法**不一樣**，
> 不要看到都是 `.py` 就以為可以互相搬動。

---

## 八、後續拆分工作要注意的事

佇列上還有兩項會大量動到連結：

- **首頁計算引擎抽成 `js/score-engine.js`**
- **`index.html` 中英雙網址拆分**

拆分時的檢查點：

1. **先確認線上檔案**（見第一節）。`index.html` 是多個對話框共用的檔案，
   一定要下載當下的線上版本當基底。
2. **拆完之後，舊錨點要進 `DEAD_ANCHORS`。** 位置在 `check-links.py` 開頭。
   拆頁而不更新這份清單，全站連過去的地方都會靜默停在首頁。
3. **新頁面若有中文版，要加進 `build-i18n.py` 的 `ROOT_PAGES`。**
   沒加的話 `zh/` 底下不會產生，`ZH_READY` 也不會列它，
   語言判斷會認為「這頁沒有中文版」而不加前綴。
4. **來源檔必須具備四樣東西**（照現有頁面複製就有）：
   `<html lang="en">`、canonical、`<!--ZH-HEAD ... ZH-HEAD-->` 區塊、
   `window.DCA_LANG='en'`。
5. **推之前先在本機跑一次 `python3 scripts/check-links.py`**（若手邊有完整 repo），
   或至少確認新頁面的版號跟全站一致。

---

## 九、驗收流程

1. **CI 綠勾** — 看的是 `Build assets + i18n`，不是 `pages build and deployment`。
   兩者是不同的 workflow，後者綠不代表前者有跑。
2. **確認產物真的更新** — 到 GitHub 看 `zh/` 目錄的「Last commit date」。
   還停在幾小時前就代表 CI 沒跑完，往下測都是白測。
3. **Cloudflare Purge Everything**
4. **無痕視窗測**，中英各一輪，看網址列有沒有 `/zh/`：
   - 首頁 → 文章卡 → 文章頁 → 麵包屑
   - 頁尾人氣熱搜 → 泡泡 → 資產頁
   - 頁尾資產選單（數量要跟 `asset/` 目錄一致）
   - 資產頁 → 回測按鈕
   - 舊網址 `dcacafe.com/?ticker=NVDA#backtest`
5. 桌機專屬項目加 `?desktop=1`，測完 `?desktop=0` 關閉。

---

## 十、這套機制的邊界

`check-links.py` 看得到「靜態寫在程式碼裡的路徑」。
如果網址完全用變數組出來、程式碼裡看不到任何路徑字串，它就抓不到。

能靠 CI 自動維護消除的（頁尾清單、`ZH_READY`、sitemap）已經消除了，
剩下的才交給偵測。**這不是「保證不會再發生」，是「大幅縮小出錯的面積」。**

新增這類自動維護區塊時，記得同步加進 `check-links.py` 的 `SKIP_BLOCKS`——
那是資料定義，不是連結，掃它只會誤報。
