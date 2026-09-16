# 首頁對決卡 — 換主角標準流程

適用範圍：首頁「歷史回測 / BACKTEST」區塊那張對比卡。
換一次主角（例如 BTC → TSLA）要做什麼、不能做什麼，全部寫在這裡。

---

## 最重要的一條

> **CSS 是固定的，換主角時一個字都不要改。所有適配都在出圖階段完成。**

這條不是風格偏好，是踩過坑換來的。

對決卡有一個容易誤判的性質：**圖片的長寬比，本身就是版面的一部分**。
CSS 上只鎖住高度、寬度寫 `auto`，所以：

```css
.duel-vs-asset    { height: 52px; width: auto; }   /* 寬度 = 52 × 圖片長寬比 */
.duel-wordmark img{ height: 23px; width: auto; }   /* 寬度 = 23 × 圖片長寬比 */
```

換一張長寬比不同的圖，它在 flex 版面裡佔的寬度就變了，
**兩側徽章會被推開或拉近，整排重新置中，左右位置全部跑掉。**
CSS 一個字沒改，畫面卻變了 — 這是最容易被誤判成「有人偷改東西」的地方。

如果這時候再用 `scale` / `translate` 去把畫面「補回來」，
就等於把 CSS 和「某一張特定的圖」綁死。換下一支資產時，整組數字全部作廢，
必須從頭再試一次。實際發生過，一輪就燒掉整個工作階段。

**正確做法：把新圖做成「在版面上的行為與舊圖完全相同」，CSS 自然不用動。**

---

## 三張素材的規格

換主角要準備三張圖，規格如下。**符合這三條，CSS 就不用碰。**

### ① 徽章 Logo

| 項目 | 規格 |
|---|---|
| 尺寸 | **320 × 320**（正方） |
| 內容 | **實心滿版**，填滿整個畫布 |
| 四角 | **方形，不要自己畫圓角** |
| 格式 | PNG |
| 路徑 | `logo/<小寫代號>.png` |

圓角是由 `.duel-badge` 的 `border-radius: 22%` + `overflow: hidden` 裁出來的。
圖自己帶圓角會出現雙重圓角。

參考：`logo/spy.png` 就是一塊深綠實心方形，四角不透明。Tesla 版是紅底白 T，同結構。

> **注意**：對決卡的徽章走 `assets.js` 的 `duelLogo` 欄位，
> **不是** `DCA_LOGO_IMG`。後者是全站自動查詢用的（首頁熱搜卡、相關卡、
> Watchlist 都吃它），為了對決卡去改那張表會連帶影響那些地方。

### ② VS 圖

| 項目 | 規格 |
|---|---|
| 畫布 | **720 × 693**（長寬比 1.039，必須一致） |
| 煙霧 | 佔畫布**高度 62.8%**，垂直置中 |
| VS 字 | **水平置中**於畫布 |
| 邊緣 | 最外兩圈 alpha 必須為 0 |
| 路徑 | `img/duel-vs-<主角小寫>-spy.png` |

**畫布長寬比 1.039 是硬條件**：它決定這張圖在版面裡佔多寬，比例一變兩側徽章就移動。

**煙霧 62.8%** 是線上 TSLA 版的實測值，CSS 的 `scale(2.0)` 是配合它算的。
新素材如果煙霧形狀不同，**在出圖階段正規化到 62.8%**，不要去動 `scale`。

這個比例不是憑空訂的：它是「煙霧盡量大」和「VS 字必須水平置中」兩個條件
互相妥協的結果。字在煙霧裡通常偏一邊，要把字推到畫布正中，
整張圖就得縮到某個程度才不會撞到畫布邊界。

**VS 字水平置中**：字在煙霧裡通常偏一邊。以字為準置中，不是以煙霧外框為準
— 視覺上人看的是字的位置。煙霧外框因此會左右不對稱，這是正常的。

做法：先縮到高度 62.8%，量出縮放後「字中心距圖左緣」多少，
再把圖貼在 `360 − 字中心距左緣` 的位置。左右各允許數 px 溢出被畫布裁掉。

### ③ wordmark 字樣

| 項目 | 規格 |
|---|---|
| 字 | 佔畫布**高度 47.2%**，左右貼滿，垂直置中 |
| 畫布比例 | 由字形比例決定：`字形比例 ÷ 0.472` |
| 邊緣 | 上下兩圈 alpha 必須為 0 |
| 路徑 | `img/duel-wordmark-<主角小寫>.png` |

**47.2% 是關鍵數字。** 它讓字高在 `height: 23px` 之下落在 **13 CSS px**，
剛好對上右側 `S&P 500`（15px 字級）的字高 —— 兩邊 wordmark 自動等高，
不用調 CSS。

TESLA 的例子：字形 799×82（比例 9.74）→ 畫布 1000×218（比例 4.59），
字上下留白、佔高 47.2%。

> **細長 wordmark 的上限**：字形比例超過 **11:1** 時，等高之後寬度會超出卡片左緣。
> TESLA 是 9.74、渲染 126 CSS px，還有餘裕。
> 遇到更細長的（某些科技公司的長條字樣），**先量出來回報，不要直接送出**。

---

## 出圖步驟

### 去背（素材通常是白底 JPEG）

1. 白底判定門檻拉到 **252**。JPEG 白底是 248–255 的雜訊，用 255 會留下一圈灰霧。
2. **從畫布邊界做連通填充**來判定背景，不要只用顏色判斷。
   這樣才能保護 VS 字中央那道白色高光，不會被一起挖掉。
3. alpha 依「離白有多遠」給軟邊，煙霧邊緣才不會鋸齒。
4. 極低 alpha（< 8）歸零，避免整片灰霧。

### 緊裁

用 alpha 的行／列剖面，取**最大值的 5%** 當門檻找邊界。

不要用接近 0 的門檻 — 幾乎看不見的煙霧尾巴也會被算進去，
導致有效內容只佔畫布一小塊，顯示時整體看起來會縮水。

### 放進畫布

依各自規格縮放置中，**最外兩圈 alpha 強制歸零**。

這一步不能省：煙霧如果剛好貼齊畫布邊緣，放大之後會出現一條硬邊，
看起來像把旁邊的元素切掉一塊。實際發生過（一條淡線切過 SPY 徽章左緣）。

---

## `assets.js` 接線

換主角要改兩筆：**新主角加上四個欄位，舊主角拿掉 `duel`**。

```js
window.DCA_ASSETS = [
  { ticker:'TSLA', duel:true,
    duelVs:'img/duel-vs-tsla-spy.png',
    duelLogo:'/logo/tsla.png',
    duelWordmark:'img/duel-wordmark-tsla.png',
    name:{ zh:'特斯拉', en:'Tesla' }, cat:'growth' },

  { ticker:'BTC', query:'BTC-USD',      // ← duel:true 已移除
    duelVs:'img/duel-vs-btc-spy.png',
    duelWordmark:'img/duel-wordmark-btc.png',
    name:{ zh:'比特幣', en:'Bitcoin' }, cat:'crypto' },
  ...
];
```

| 欄位 | 作用 |
|---|---|
| `duel: true` | 標記對決卡主角。**同時決定卡片下方回測連結指向哪一支**。只能有一支。 |
| `duelVs` | 中間的 VS 圖 |
| `duelLogo` | 左側徽章圖（與 `DCA_LOGO_IMG` 分開） |
| `duelWordmark` | 左側品牌字樣圖 |

**檔名按對戰組合命名，不要覆蓋舊檔。** 舊主角的圖留著，
之後要換回去只要把 `duel:true` 搬回那一筆即可。

---

## 目前的 CSS 定案值（僅供對照，不要動）

這些值是實機逐項調出來的，記錄在這裡是為了讓後續對話知道「現況是什麼」，
**不是讓人拿去微調的**。

### 手機版（`web.css` 不包 media query 的區段）

```css
.duel-row      { gap: 14px; }
.duel-side     { gap: 5px; width: 74px; }
.duel-side-left  { transform-origin: 100% 0%; transform: scale(1.196); }
.duel-side-right { transform-origin: 0% 0%;  transform: scale(1.196); margin-left: 0; }
.duel-badge    { width: 74px; height: 74px; border-radius: 22%; }
.duel-wordmark { height: 23px; }
.duel-wordmark img { height: 23px; width: auto; }
.duel-wm-spy   { font-size: 15px; line-height: 23px; letter-spacing: -1px; font-weight: 900; }
.duel-vs-asset { height: 52px; width: auto; z-index: 3;
                 transform-origin: 50% 100%;
                 transform: translate(3px, 24px) scale(2.0); }
.duel-headline { font-size: 11px; font-weight: 600; color: var(--ink3);
                 letter-spacing: 2px; text-transform: uppercase; }
```

### 桌機版（`@media (min-width: 960px)`）

```css
.duel-row      { gap: 31px; }
.duel-side     { gap: 10px; width: 195px; }
.duel-side-right { margin-left: 50px; }
.duel-badge    { width: 195px; height: 195px; }
.duel-wordmark { height: 48px; }
.duel-wordmark img { height: 48px; width: auto; }
.duel-wm-spy   { font-size: 29px; line-height: 48px; letter-spacing: -2px; white-space: nowrap; }
.duel-vs-asset { height: 110px; width: auto;
                 transform-origin: 50% 50%;
                 transform: translate(40px, -14.5px) scale(2.55); }
.duel-headline { font-size: 34px; font-weight: 600; color: var(--ink3);
                 letter-spacing: 2px; text-transform: uppercase; }
```

**手機與桌機是兩套獨立的值，不成比例，改一邊不會影響另一邊。**
`web.css` 裡 `.duel-*` 的規則名稱兩邊重複出現，
改的時候務必確認行號落在哪一個區段。

---

## 幾條有理由的設計，不要「順手優化」掉

### `.duel-side { width: 74px / 195px }` — 側邊寬度必須鎖死

不鎖的話，側邊寬度會取「徽章」和「wordmark」的較大值。
換一張比較寬的 wordmark、或調一次 `S&P 500` 的字級，
那一側就變寬變窄，整排跟著重新置中 —— **左右位置就跑掉了**。

鎖死之後 wordmark 只是視覺溢出，永遠不會推動版面。
今晚偏移的成因都是這個，兩邊都修掉了。

### `.duel-wm-spy` 的字級跟著 wordmark 走

右側 `S&P 500` 是**文字**不是圖，字級要對到左側 wordmark 的字高才會等高。
換主角後如果左側字高變了，這個字級要重算 —— 這是唯一一個
「換圖後可能要動 CSS」的例外，而且只動這一個數字。

手機 15px / 桌機 29px 是對應 TESLA 的字高算出來的。

### 桌機 `.duel-side-right { margin-left: 50px }`

補償用的。桌機的 VS 錨點原本是 `0% 100%`（只往右長），整團會偏右，
用 50px 把右側推開來補。手機版錨點是 `50% 100%`（往兩側均勻長），
所以 `margin-left` 設成 0。

（桌機錨點後來改成 `50% 50%` 並用 translate 補償，
這個 `margin-left` 目前仍然生效，動它兩側間距會變。）

### `.duel-badge img { width: 72% }` 實際上沒有生效

徽章的圖是由 `js/logo.js` 的 `createLogoImg()` 產生的，
那支函式在 `<img>` 上寫了**行內樣式** `width:100%;height:100%;object-fit:cover`，
行內樣式優先於 CSS，所以 72% 那條規則被蓋掉了，**兩側徽章實際都是滿版**。

曾經照 72% 去算尺寸，每次都算偏。要算徽章相關的東西，請以 **100% 滿版**為準。

### VS 圖的 `z-index: 3`

讓 VS 蓋在兩側徽章上。煙霧邊緣輕微重疊是設計的一部分，不是 bug。

---

## 驗收清單

換完主角，依序確認：

- [ ] 手機版：兩側徽章位置與換之前相同（沒有被推開或拉近）
- [ ] 手機版：兩邊 wordmark 等高、各自置中於自己的 logo
- [ ] 手機版：VS 煙霧沒有壓到徽章，邊緣沒有直線切痕
- [ ] 桌機版：`S&P 500` 沒有斷成兩行
- [ ] 桌機版：徽章上緣位置與換之前相同
- [ ] 卡片下方「看看結果」的連結指向新主角（`duel:true` 有搬過去）
- [ ] 首頁人氣熱搜、泡泡頁 `trending.html` 有出現新資產（要在 `DCA_ASSETS` 裡）
- [ ] 新資產的 `assets-data/<代號>.html` 已上傳（否則卡片點進去 404）

---

## 常見誤判

**「沒有人改過 CSS，為什麼尺寸不一樣？」**
先檢查圖片的長寬比有沒有變。`width: auto` 的元素，圖片比例就是尺寸的一部分。

**「這張素材比較扁，是素材的問題」**
先確認比對的對象是不是同一個階段的東西。
`duel-vs-btc-spy.png` 是**處理後**的成品，它的原始素材同樣是寬扁的
—— 拿成品去比別人的原檔，會得到完全錯誤的結論。

**「V 被切掉了」**
代表用了 cover 或裁切過頭。照規格用 contain，尺寸不足是正常的，
由出圖階段的比例正規化處理，不要動 `scale`。

**「改了字級，為什麼整排位置跑掉？」**
`.duel-side` 的寬度沒鎖，或是改到了 wordmark 那一側。見上面「側邊寬度必須鎖死」。

---

## 工作方式

**一次只換一個元素。** 對決卡有三個會變的元素：VS 圖、徽章、wordmark。
換完一個就上線看實機，確認沒問題再換下一個。版面數值全部鎖住不動。

這樣畫面上出現任何變化，都能確定是這一步造成的。
混在一起換，出問題就分不清是哪個元素、還是版面被動到了。

**實機是唯一可信的基準。** 靠計算畫出來的示意圖會有誤差
（例如前面提到的 72% 那個坑），討論時以實機截圖為準。

**照指示做完就停。** 不要因為自己看了覺得「還可以更好」就多補一個調整。
多一個變數，下一輪就多一個說不清楚的變化。
