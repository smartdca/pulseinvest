#!/usr/bin/env python3
"""
DCAcafé — 本週精選資產產生器 v3

每週二、五(台北 09:00):從 tickers.json 的候選池評分,寫出 picks.json。
每季(1/4/7/10 月第一個週二):重建 tickers.json 的候選池。

────────────────────────────────────────────────────────────────
【候選池】(依「投資標的」分類,不是依工具;ETF 不是一個類別)
  index        大盤指數   固定名單(同一指數只收一檔,不收產業型、槓桿、反向)
  bluechip     藍籌股     S&P 500 依市值權重前 100 名(slickcharts)
  growth       成長股     S&P 500 成長股指數成分股,扣掉藍籌 100 檔後依權重前 100 名
                          (SSGA 公開的 SPYG 每日持股檔)。原本規劃用 Russell 1000 成長股
                          (iShares),但 iShares 會擋 GitHub Actions,改用這個來源。
                          非美國公司(ASML、ARM 等)不在指數內,這個缺口是刻意接受的,
                          不另外手動補。
  real         實物資產   固定名單:實物持有(金、銀、鉑、鈀、REIT)+ 礦業股;不收期貨型
  crypto       加密貨幣   市值前 20 名(CoinGecko),排除穩定幣、黃金代幣、包裝/質押幣,
                          且必須能在 Yahoo 查到同一個幣(價格比對驗證)
  tw           台股       市值前 50 大個股(期交所市值排名,近似台灣 50)+ 國內成分股 ETF
                          ——只在中文版顯示,不參與主打的跨池比較

  「優質」由候選池把關(有公信力的名單 + 市值排名),所以沒有分數門檻、
  也沒有上市年數門檻:每池永遠挑最高分。

【評分:兩階段】
  1. 初篩:每一檔抓 10 年日線,用跟正式計分(/api/ticker-score)完全相同的算法
     算出百分位,再送 /api/score 取分數。這一步不耗 FMP 額度,唯一的差別是
     沒有 P/FCF(估值)。
  2. 決選:每池初篩前 5 名改打正式 /api/ticker-score,用正式 DCA Score 決定冠軍。
     只有這幾檔會用到 FMP(而且有 90 天季快取)。正式計分失敗 → 退回初篩分數。
     Actions 紀錄會列出兩種分數的差距。
  分數是快照(卡片上有更新日期),本來就不會跟使用者即時查詢完全一致;
  這裡要確保的只是差距小到不會改變排名。

【Yahoo 負擔】
  每檔之間間隔 2 秒(Yahoo 擋人看的是「短時間打太快」,不是總量);
  公司名稱、幣別直接從同一次 10 年日線的回應取,不再多打一次。

【季度重建防護】
  任何一個名單來源抓取失敗或筆數不足 → 不覆寫那一池,沿用舊名單,
  選股照常執行並寫出 picks.json,最後以非零代碼結束,讓 Actions 顯示紅叉。
  (update-picks.yml 的 commit 步驟設了 always(),紅叉時 picks.json 照樣會推上去。)
"""

import json, datetime, urllib.request, urllib.parse, re, sys, time, csv, io

PROXY           = "https://proxy-three-mu-47.vercel.app/api/proxy"
SCORE_API_URL   = "https://proxy-three-mu-47.vercel.app/api/score"
TICKER_SCORE_URL = "https://proxy-three-mu-47.vercel.app/api/ticker-score"

TICKERS_FILE = "tickers.json"
PICKS_FILE   = "picks.json"

YAHOO_GAP_SEC     = 2.0   # 每檔之間的間隔
TICKER_SCORE_GAP  = 2.5   # /api/ticker-score 限流每分鐘 30 次,間隔 2.5 秒保持在 24 次以下
FINALISTS_PER_POOL = 5

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

# ════════════════════════════════════════════════════════════════
# 固定名單
# ════════════════════════════════════════════════════════════════

# 大盤指數:美國(大盤/科技/道瓊/小型/中型/價值/成長/高股息)、全球與區域、單一國家
INDEX_TICKERS = [
    "VOO", "QQQ", "DIA", "IWM", "IJH", "VTV", "VUG", "SCHD",
    "VT", "VEA", "VWO",
    "EWJ", "EWT", "EWY", "INDA", "MCHI", "EWG", "EWU", "EWZ",
]

# 實物資產:實物持有 + 礦業股(期貨型 USO/DBC/DBB 長期有換約損耗,不收)
REAL_TICKERS = ["GLD", "SLV", "PPLT", "PALL", "VNQ", "GDX", "COPX", "URA"]

# 台股 ETF:國內成分股 ETF,依規模取前 10,同一指數只留一檔(0050 與 006208 只留 0050),
# 不收槓桿/反向/債券/投資海外者。
# ⚠️ 目前找不到穩定可自動抓取的「規模排名」來源,先用固定名單,每季手動核對一次
#    (證交所 ETF 專區的規模排名),有變動就改這裡。
TW_ETFS = ["0050", "0056", "00878", "00919", "00929", "00713", "00940", "00939", "00881", "0052"]
# 台股 ETF 中文名稱(台股卡只在中文版顯示,名稱用中文)
TW_ETF_NAMES = {
    "0050": "元大台灣50", "0056": "元大高股息", "00878": "國泰永續高股息", "00919": "群益台灣精選高息",
    "00929": "復華台灣科技優息", "00713": "元大台灣高息低波", "00940": "元大台灣價值高息",
    "00939": "統一台灣高息動能", "00881": "國泰台灣科技龍頭", "0052": "富邦科技",
}

# 同一家公司的不同股票代碼:只留一檔(左邊併入右邊)
SAME_COMPANY = {
    "GOOG": "GOOGL",
    "HONA": "HON",
    "FOX": "FOXA",
    "NWS": "NWSA",
    "BRK-A": "BRK-B",
}

# 首次建立或來源失敗時的備用名單(只在完全沒有舊名單可用時才會用到)
DEFAULT_CRYPTO = ["BTC-USD", "ETH-USD", "BNB-USD", "XRP-USD", "SOL-USD", "TRX-USD", "DOGE-USD",
                  "ADA-USD", "LINK-USD", "XLM-USD", "BCH-USD", "LTC-USD", "AVAX-USD"]
DEFAULT_TW_STOCKS = ["2330", "2317", "2454", "2308", "2382", "2881", "2882", "2891", "3711", "2412",
                     "2303", "2886", "2884", "2885", "2892", "2357", "1216", "2002", "2880", "5880",
                     "2887", "3008", "2345", "2327", "3231", "2395", "2379", "6669", "3034", "2883",
                     "2890", "2912", "1303", "1301", "2207", "4938", "3037", "2301", "3045", "4904",
                     "2603", "2609", "2615", "1101", "5871", "2474", "3661", "2059", "3017", "2376"]

STABLECOIN_SYMBOLS = {"USDT", "USDC", "USDE", "DAI", "USD1", "USDG", "PYUSD", "RLUSD", "USDD", "U",
                      "TUSD", "FDUSD", "USDS", "EURC", "USD0", "USDTB", "BUSD", "GUSD", "USDP",
                      "FRAX", "LUSD", "USDX", "USDF", "BFUSD", "SUSDE", "SUSDS"}
GOLD_TOKEN_SYMBOLS = {"XAUT", "PAXG", "KAU"}
DERIVATIVE_NAME_WORDS = ("wrapped", "staked", "bridged", "restaked", "binance-peg", "liquid staking",
                         "stakewise", "coinbase wrapped")

POOL_ORDER = ["index", "bluechip", "growth", "real", "crypto"]   # 首頁分類卡順序(台股另外處理,排最後)
POOL_META = {
    "index":    {"label_en": "Market Index", "label_zh": "大盤指數"},
    "bluechip": {"label_en": "Blue Chip",    "label_zh": "藍籌股"},
    "growth":   {"label_en": "Growth",       "label_zh": "成長股"},
    "real":     {"label_en": "Real Assets",  "label_zh": "實物資產"},
    "crypto":   {"label_en": "Crypto",       "label_zh": "加密貨幣"},
    "tw":       {"label_en": "Taiwan",       "label_zh": "台股"},
}

# ════════════════════════════════════════════════════════════════
# SECTION 1 — HTTP / YAHOO
# ════════════════════════════════════════════════════════════════

def http_get(url, timeout=30, headers=None):
    h = {"User-Agent": UA, "Accept": "*/*", "Accept-Language": "en-US,en;q=0.9"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def fetch_yahoo_chart(ticker, range_="10y", interval="1d", retries=1):
    """直接打 Yahoo(GitHub Actions 自己的 IP);失敗再走 Proxy 當備援。"""
    yahoo_url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(ticker)}"
                 f"?range={range_}&interval={interval}")
    urls = [yahoo_url, f"{PROXY}?url={urllib.parse.quote(yahoo_url)}"]
    last_err = None
    for url in urls:
        for attempt in range(retries + 1):
            try:
                return json.loads(http_get(url, timeout=25, headers={"Accept": "application/json"}))
            except Exception as e:
                last_err = e
                if attempt < retries:
                    time.sleep(4)
    raise last_err

def get_closes_and_meta(ticker, range_="10y"):
    """回傳 (closes, meta)。closes 只保留 >0 的值,跟 ticker-score.js 相同。"""
    try:
        data = fetch_yahoo_chart(ticker, range_=range_)
        result = data["chart"]["result"][0]
        raw = result["indicators"]["quote"][0].get("close") or []
        closes = [c for c in raw if c is not None and c > 0]
        if len(closes) < 20:
            return None, None
        return closes, result.get("meta", {}) or {}
    except Exception as e:
        print(f"  [{ticker}] Yahoo fetch error: {e}")
        return None, None

def format_price(price):
    """>=10 用 2 位小數,<10 用 4 位(加密/低價資產)。輸出字串避免 JSON 吃掉尾端 0。"""
    if price is None:
        return None
    return f"{price:.{2 if price >= 10 else 4}f}"

# ════════════════════════════════════════════════════════════════
# SECTION 2 — 指標計算(逐行比照 Proxy 的 api/ticker-score.js)
# ════════════════════════════════════════════════════════════════

def calc_rsi(closes, period=14):
    # ticker-score.js calculateRSI:最後 period 根的漲跌簡單平均(不是 Wilder 平滑)
    if len(closes) < period + 1:
        return 50.0
    gains = losses = 0.0
    for i in range(len(closes) - period, len(closes)):
        diff = closes[i] - closes[i - 1]
        if diff > 0:
            gains += diff
        else:
            losses -= diff
    avg_gain, avg_loss = gains / period, losses / period
    if avg_loss == 0:
        return 100.0
    return 100 - (100 / (1 + avg_gain / avg_loss))

def compute_indicators(closes, vix_closes):
    # RSI + 歷史百分位
    rsi = calc_rsi(closes, 14)
    history = []
    for i in range(14, len(closes) - 1):
        history.append(calc_rsi(closes[max(0, i - 14):i + 1], min(14, i)))
    prsi = (sum(1 for r in history if r <= rsi) / len(history)) if history else 0.5

    # 52 週回撤
    current = closes[-1]
    high52 = max(closes[-252:])
    drawdown = (current - high52) / high52 * 100

    # 歷史最大回撤(下限 -20)→ 回撤百分位
    max_dd, peak = 0.0, closes[0]
    for c in closes[1:]:
        if c > peak:
            peak = c
        dd = (c - peak) / peak * 100
        if dd < max_dd:
            max_dd = dd
    max_dd = min(max_dd, -20.0)
    dd_percentile = min(1.0, abs(drawdown) / abs(max_dd or -40))

    # 1000 日均線乖離百分位(ticker-score.js 的「200 週均線」同樣用 1000 日)
    period = 1000
    has_ma, ma_percentile = False, 0.5
    if len(closes) >= period:
        csum = [0.0]
        for c in closes:
            csum.append(csum[-1] + c)
        devs = []
        for end in range(period, len(closes) + 1):
            ma = (csum[end] - csum[end - period]) / period
            if ma > 0:
                devs.append(closes[end - 1] / ma - 1)
        if devs:
            cur_dev = devs[-1]
            has_ma = True
            ma_percentile = sum(1 for d in devs if d >= cur_dev) / len(devs)

    # VIX
    vix = vix_closes[-1] if vix_closes else 20.0
    vix_percentile = (sum(1 for v in vix_closes if v <= vix) / len(vix_closes)) if vix_closes else 0.5

    return {
        "rsi": rsi, "prsi": prsi, "drawdown": drawdown, "dd_percentile": dd_percentile,
        "has_ma": has_ma, "ma_percentile": ma_percentile,
        "vix": vix, "vix_percentile": vix_percentile,
        "black_swan": drawdown <= -20 and vix >= 40,
    }

def calc_score_fallback(ind):
    """/api/score 打不通時的最後備援(舊版四因子公式),只用來排序,不影響正式分數。"""
    if ind["has_ma"]:
        s = ind["ma_percentile"] * 35 + (1 - ind["prsi"]) * 25 + ind["dd_percentile"] * 25 + ind["vix_percentile"] * 15
    else:
        s = (1 - ind["prsi"]) * 43.2 + ind["dd_percentile"] * 34.6 + ind["vix_percentile"] * 22.2
    return round(s, 1)

def fetch_screen_score(ind):
    """初篩分數:/api/score 只吃百分位、不抓任何資料,不耗 FMP。P/FCF 固定跳過。"""
    payload = json.dumps({
        "prsi": ind["prsi"], "ddPercentile": ind["dd_percentile"],
        "vixPercentile": ind["vix_percentile"], "maPercentile": ind["ma_percentile"],
        "hasMa": ind["has_ma"], "pfcfPercentile": 0.5, "hasPfcf": False,
    }).encode("utf-8")
    req = urllib.request.Request(SCORE_API_URL, data=payload,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def fetch_official(ticker, full=False):
    """正式 DCA Score(跟計算機、部落格 chip 同一支 API)。"""
    url = f"{TICKER_SCORE_URL}?ticker={urllib.parse.quote(ticker)}" + ("&full=1" if full else "")
    return json.loads(http_get(url, timeout=40, headers={"Accept": "application/json"}))

# ════════════════════════════════════════════════════════════════
# SECTION 3 — 單檔初篩
# ════════════════════════════════════════════════════════════════

def screen_ticker(ticker, vix_closes):
    closes, meta = get_closes_and_meta(ticker, "10y")
    if not closes:
        return None
    ind = compute_indicators(closes, vix_closes)
    lights, score = None, None
    try:
        res = fetch_screen_score(ind)
        score = res.get("score")
        lights = res.get("lights")
    except Exception as e:
        print(f"  [{ticker}] /api/score failed, using fallback formula: {e}")
    if not isinstance(score, (int, float)):
        score = calc_score_fallback(ind)
    return {
        "ticker": ticker,
        "companyName": meta.get("longName") or meta.get("shortName") or ticker,
        "currency": meta.get("currency") or "USD",
        "price": format_price(round(closes[-1], 4)),
        "rsi": round(ind["rsi"], 1),
        "prsi": round(ind["prsi"], 3),
        "drawdown": round(ind["drawdown"], 1),
        "has_ma": ind["has_ma"],
        "has_pfcf": False,
        "blackSwan": ind["black_swan"],
        "screen_score": round(float(score), 1),
        "score": round(float(score), 1),
        "score_source": "screen",
        "lights": lights,
    }

# ════════════════════════════════════════════════════════════════
# SECTION 4 — 池子評分(初篩 → 決選)
# ════════════════════════════════════════════════════════════════

def rank_pool(pool_key, tickers, vix_closes):
    """回傳依正式分數排序的決選名單(最多 FINALISTS_PER_POOL 檔)。"""
    print(f"\n── {pool_key.upper()} pool ({len(tickers)} tickers) ──")
    screened = []
    for i, t in enumerate(tickers):
        if i > 0:
            time.sleep(YAHOO_GAP_SEC)
        r = screen_ticker(t, vix_closes)
        if r is None:
            continue
        # 只接受有效分數(排除抓資料失敗的結果)
        if not isinstance(r["screen_score"], (int, float)):
            continue
        screened.append(r)
        print(f"  {t:<12} screen={r['screen_score']:>5}  dd={r['drawdown']:>6}%  prsi={r['prsi']:.2f}  ma={r['has_ma']}")
    if not screened:
        print(f"  ⚠️ no valid results for {pool_key}")
        return []

    screened.sort(key=lambda x: x["screen_score"], reverse=True)
    finalists = screened[:FINALISTS_PER_POOL]
    print(f"  決選(正式 DCA Score):")
    for r in finalists:
        time.sleep(TICKER_SCORE_GAP)
        try:
            off = fetch_official(r["ticker"])
            if isinstance(off.get("score"), (int, float)):
                r["score"] = round(float(off["score"]), 1)
                r["score_source"] = "official"
                r["blackSwan"] = bool(off.get("blackSwan", r["blackSwan"]))
        except Exception as e:
            print(f"    [{r['ticker']}] ticker-score failed, keep screen score: {e}")
        gap = r["score"] - r["screen_score"]
        print(f"    {r['ticker']:<12} screen={r['screen_score']:>5}  official={r['score']:>5}  gap={gap:+.1f}  ({r['score_source']})")
    finalists.sort(key=lambda x: x["score"], reverse=True)
    return finalists

def enrich_pick(r, pool_key):
    """最終入選者:打一次 full=1,取正式燈號、實際用到哪些指標(給主打說明文字用)。"""
    time.sleep(TICKER_SCORE_GAP)
    try:
        full = fetch_official(r["ticker"], full=True)
        factors = full.get("factors") or {}
        if isinstance(full.get("score"), (int, float)):
            r["score"] = round(float(full["score"]), 1)
            r["score_source"] = "official"
        r["has_ma"] = bool((factors.get("ma") or {}).get("hasMa", r["has_ma"]))
        r["has_pfcf"] = bool((factors.get("pfcf") or {}).get("hasPfcf", False))
        lights = {k: (factors.get(k) or {}).get("light") for k in ("ma", "rsi", "dd", "vix", "pfcf")}
        if any(lights.values()):
            r["lights"] = {"ma200w": lights["ma"], "rsi": lights["rsi"], "dd": lights["dd"],
                           "vix": lights["vix"], "pfcf": lights["pfcf"]}
        if full.get("multiplier") is not None:
            r["multiplier"] = full.get("multiplier")
        if full.get("currency"):
            r["currency"] = full["currency"]
    except Exception as e:
        print(f"  [{r['ticker']}] full ticker-score failed, keep screen data: {e}")
    return to_pick(r, pool_key)

def fact_blurb(p):
    """純事實備援句(前端句庫載入失敗、或舊版首頁讀到新資料時用)。"""
    dd = abs(p["drawdown"])
    pct = int(round(p["prsi"] * 100))
    return {
        "en": f"{p['ticker']} is {dd:.1f}% below its 52-week high, with RSI at the {pct}th percentile. DCA Score: {p['score']}.",
        "zh": f"{p['ticker']} 距 52 週高點 {dd:.1f}%，RSI 百分位 {pct}%。DCA Score：{p['score']}。",
    }

def to_pick(r, pool_key):
    p = {
        "pool": pool_key,
        "label_en": POOL_META[pool_key]["label_en"],
        "label_zh": POOL_META[pool_key]["label_zh"],
        "ticker": r["ticker"],
        "companyName": r["companyName"],
        "price": r["price"],
        "currency": r["currency"],
        "rsi": r["rsi"],
        "prsi": r["prsi"],
        "prsi_pct": int(round(r["prsi"] * 100)),
        "drawdown": r["drawdown"],
        "score": r["score"],
        "score_source": r["score_source"],
        "lights": r.get("lights"),
        "multiplier": r.get("multiplier"),
        "blackSwan": r["blackSwan"],
        "has_ma": r["has_ma"],
        "has_pfcf": r["has_pfcf"],
    }
    p["blurb"] = fact_blurb(p)
    return p

# ════════════════════════════════════════════════════════════════
# SECTION 5 — 名單清理規則
# ════════════════════════════════════════════════════════════════

def norm_ticker(t):
    """「.」「/」一律轉「-」(BRK.B → BRK-B),全站用同一套 Yahoo 格式。"""
    return re.sub(r"[./ ]", "-", t.strip().upper())

def norm_name(name):
    n = (name or "").lower()
    n = re.sub(r"\b(class|cl) [a-z]\b", " ", n)
    n = re.sub(r"\b(inc|incorporated|corp|corporation|co|company|ltd|plc|holdings?|group|the|sa|nv|ag)\b", " ", n)
    n = re.sub(r"[^a-z0-9]+", " ", n)
    return " ".join(n.split())

def dedupe_companies(rows, exclude_tickers=(), exclude_names=()):
    """rows = [(ticker, name)],依原順序。同一家公司只留排名最前面的一檔。"""
    seen_t, seen_n, out = set(exclude_tickers), set(exclude_names), []
    for t, name in rows:
        t = norm_ticker(t)
        canon = SAME_COMPANY.get(t, t)
        nn = norm_name(name)
        if canon in seen_t or t in seen_t or (nn and nn in seen_n):
            continue
        seen_t.update({t, canon})
        if nn:
            seen_n.add(nn)
        out.append((t, name))
    return out

# ════════════════════════════════════════════════════════════════
# SECTION 6 — 季度重建:各名單來源(每一個都有筆數防護)
# ════════════════════════════════════════════════════════════════

def fetch_sp500():
    """S&P 500 依權重排序(slickcharts)。回傳 [(ticker, name)]。"""
    html = http_get("https://www.slickcharts.com/sp500").decode("utf-8", "replace")
    rows, seen = [], {}
    for sym, text in re.findall(r'href="/symbol/([A-Z]{1,5}(?:\.[A-Z]{1,2})?)"[^>]*>([^<]*)</a>', html):
        text = text.strip()
        if sym not in seen:
            seen[sym] = len(rows)
            rows.append([sym, ""])
        if text and text != sym and not rows[seen[sym]][1]:
            rows[seen[sym]][1] = text
    rows = [(s, n) for s, n in rows]
    if len(rows) < 400:
        raise ValueError(f"S&P 500 only {len(rows)} tickers (expected ~500)")
    return rows

def _xlsx_rows(data):
    """用標準函式庫讀 xlsx 第一個工作表,回傳每一列的字串清單(不需要安裝 openpyxl)。"""
    import zipfile, xml.etree.ElementTree as ET
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    zf = zipfile.ZipFile(io.BytesIO(data))
    shared = []
    if "xl/sharedStrings.xml" in zf.namelist():
        for si in ET.fromstring(zf.read("xl/sharedStrings.xml")).findall("m:si", ns):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % ns["m"])))
    sheet = sorted(n for n in zf.namelist() if n.startswith("xl/worksheets/sheet"))[0]
    rows = []
    for row in ET.fromstring(zf.read(sheet)).iter("{%s}row" % ns["m"]):
        cells = {}
        for c in row.findall("m:c", ns):
            col = re.match(r"[A-Z]+", c.get("r", "A")).group(0)
            idx = 0
            for ch in col:
                idx = idx * 26 + (ord(ch) - 64)
            t = c.get("t")
            v = c.find("m:v", ns)
            if t == "s" and v is not None:
                val = shared[int(v.text)]
            elif t == "inlineStr":
                val = "".join(x.text or "" for x in c.iter("{%s}t" % ns["m"]))
            else:
                val = v.text if v is not None else ""
            cells[idx - 1] = (val or "").strip()
        if cells:
            rows.append([cells.get(i, "") for i in range(max(cells) + 1)])
    return rows

def fetch_growth_source():
    """S&P 500 成長股指數成分股(SSGA 公開的 SPYG 每日持股檔),依權重排序。回傳 [(ticker, name)]。
    原本用 iShares 的 Russell 1000 成長股持股檔,但 iShares 會擋 GitHub Actions 的機器
    (回傳網頁而不是 CSV,試過帶 cookie 也一樣),所以改用 SSGA。"""
    url = ("https://www.ssga.com/us/en/intermediary/library-content/products/fund-data/"
           "etfs/us/holdings-daily-us-en-spyg.xlsx")
    data = http_get(url, timeout=40, headers={"Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*"})
    if not data.startswith(b"PK"):
        snippet = data[:300].decode("utf-8", "replace").replace("\n", " | ")
        raise ValueError(f"SPYG holdings is not an xlsx; response starts with: {snippet}")
    rows = _xlsx_rows(data)
    head_i = next((i for i, r in enumerate(rows[:30]) if "Ticker" in r and "Name" in r), None)
    if head_i is None:
        raise ValueError(f"SPYG holdings header not found; first rows: {rows[:6]}")
    head = rows[head_i]
    ti, ni = head.index("Ticker"), head.index("Name")
    wi = head.index("Weight") if "Weight" in head else None
    out, skipped = [], []
    for r in rows[head_i + 1:]:
        if len(r) <= max(ti, ni):
            continue
        t, n = r[ti], r[ni]
        if not t and not n:
            continue
        if not t or t in ("-", "CASH_USD") or "CASH" in t.upper() or not re.match(r"^[A-Z][A-Z.\-/]{0,6}$", t):
            skipped.append(t or n[:30])
            continue
        try:
            w = float(r[wi]) if wi is not None and wi < len(r) and r[wi] else 0.0
        except ValueError:
            w = 0.0
        out.append((t, n, w))
    out.sort(key=lambda x: x[2], reverse=True)
    # 把讀到幾檔、略過哪些印出來,下次出問題時直接看紀錄就知道是資料本身還是過濾規則
    print(f"  S&P 500 Growth holdings: {len(out)} kept, {len(skipped)} skipped {skipped[:10]}")
    # 防護門檻只用來判斷「下載的是不是一份完整的持股檔」,不是預期的成分股數量。
    # (上一版寫 150、以為成分股約 210,實際下載到 148 檔就被自己擋掉——門檻是我憑印象訂的,不是資料問題。)
    if len(out) < 80:
        raise ValueError(f"S&P 500 Growth only {len(out)} holdings — download looks incomplete")
    return [(t, n) for t, n, _ in out]

def fetch_crypto_top20():
    """CoinGecko 市值排名 → 排除穩定幣/黃金代幣/包裝質押幣 → Yahoo 價格比對驗證 → 前 20。"""
    url = ("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd"
           "&order=market_cap_desc&per_page=100&page=1")
    coins = json.loads(http_get(url, timeout=30, headers={"Accept": "application/json"}))
    picked = []
    for c in coins:
        sym = (c.get("symbol") or "").upper()
        name = (c.get("name") or "")
        price = c.get("current_price") or 0
        lname = name.lower()
        if sym in STABLECOIN_SYMBOLS or sym in GOLD_TOKEN_SYMBOLS:
            continue
        if any(w in lname for w in DERIVATIVE_NAME_WORDS):
            continue
        if 0.97 <= price <= 1.03 and ("usd" in lname or "usd" in sym.lower() or "dollar" in lname):
            continue
        if "gold" in lname:
            continue
        yt = f"{sym}-USD"
        time.sleep(YAHOO_GAP_SEC)
        try:
            meta = fetch_yahoo_chart(yt, range_="5d")["chart"]["result"][0]["meta"]
            yp = meta.get("regularMarketPrice") or 0
            if meta.get("instrumentType") != "CRYPTOCURRENCY" or not price or not yp or abs(yp / price - 1) > 0.15:
                print(f"  crypto {yt}: Yahoo mismatch or not found (cg={price}, yahoo={yp}), skip")
                continue
        except Exception as e:
            print(f"  crypto {yt}: Yahoo not available ({e}), skip")
            continue
        picked.append(yt)
        if len(picked) >= 20:
            break
    if len(picked) < 10:
        raise ValueError(f"crypto only {len(picked)} valid coins")
    return picked

def fetch_tw_top50():
    """台灣市值前 50 大個股(期交所公布的證交所市值排名),近似台灣 50 成分股。

    期交所這一頁的表格是「左右兩欄並排」:同一列左邊是第 1~75 名、右邊是第 76~150 名。
    上一版直接依網頁順序抓 4 位數代碼,結果變成第 1 名、第 76 名、第 2 名、第 77 名……
    交錯,前 50 個裡有一半是 76 名以後的中小型股(堤維西、達方、東泥等就是這樣混進來的)。
    這版改成成對讀取「排名 + 代碼」,再依排名排序取前 50,不依賴網頁上的排列順序。"""
    html = http_get("https://www.taifex.com.tw/cht/9/futuresQADetail", timeout=30).decode("utf-8", "replace")
    # 排名、代碼,以及緊接在後的中文名稱(名稱欄可能包著連結標籤,取出純文字)
    pairs = re.findall(r"<td[^>]*>\s*(\d{1,3})\s*</td>\s*<td[^>]*>\s*(\d{4})\s*</td>(?:\s*<td[^>]*>(.*?)</td>)?",
                       html, flags=re.S)
    ranked, names = {}, {}
    for rank, code, name in pairs:
        r = int(rank)
        if code.startswith("00"):
            continue
        if r not in ranked:
            ranked[r] = code
            clean = re.sub(r"<[^>]+>", "", name or "").strip()
            if clean and not re.match(r"^[\d.,%\s]+$", clean):
                names[code] = clean
    codes = []
    for r in sorted(ranked):
        if ranked[r] not in codes:
            codes.append(ranked[r])
        if len(codes) >= 50:
            break
    top = sorted(ranked)[:5]
    print(f"  TW ranking parsed: {len(ranked)} ranks; top 5 = {[(r, ranked[r]) for r in top]}")
    # 排名要從 1 開始連續,否則代表讀錯欄位(例如把別的數字當成排名)
    if len(codes) < 45 or sorted(ranked)[:3] != [1, 2, 3]:
        raise ValueError(f"TW market-cap ranking looks wrong: {len(codes)} codes, first ranks {sorted(ranked)[:5]}")
    print(f"  TW names parsed: {sum(1 for c in codes if c in names)}/{len(codes)}; e.g. {[(c, names.get(c)) for c in codes[:3]]}")
    return codes, {c: names[c] for c in codes if c in names}

def load_tickers_raw():
    try:
        with open(TICKERS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}

def refresh_tickers(old):
    """重建候選池。回傳 (新名單, 失敗清單)。失敗的池沿用舊名單,不會被清空。"""
    print("\n═══ QUARTERLY POOL REFRESH ═══")
    failures = []
    new = {
        "index": INDEX_TICKERS,
        "real": REAL_TICKERS,
    }

    # 藍籌:S&P 500 前 100(去重後)
    try:
        sp = dedupe_companies(fetch_sp500())
        new["bluechip"] = [t for t, _ in sp[:100]]
        blue_names = {norm_name(n) for _, n in sp[:100]}
        print(f"  bluechip: {len(new['bluechip'])}")
    except Exception as e:
        failures.append(f"bluechip ({e!r})")
        new["bluechip"] = [t for t, _ in dedupe_companies([(t, "") for t in old.get("bluechip", [])])][:100]
        blue_names = set()
        print(f"  ❌ bluechip refresh failed, keep old list: {e}")

    # 成長:S&P 500 成長股指數扣掉藍籌後前 100
    try:
        rg = dedupe_companies(fetch_growth_source(),
                              exclude_tickers={SAME_COMPANY.get(t, t) for t in new["bluechip"]} | set(new["bluechip"]),
                              exclude_names=blue_names)
        growth = [t for t, _ in rg[:100]]
        # S&P 500 成長股扣掉藍籌 100 檔後,剩下的不到 100 檔是正常的(有多少用多少,不硬湊)。
        # 但少於 30 檔就代表資料或去重出了問題,視為失敗、沿用舊名單,不讓成長股池變得過小。
        if len(growth) < 30:
            raise ValueError(f"growth pool only {len(growth)} tickers after removing blue chips")
        new["growth"] = growth
        print(f"  growth: {len(new['growth'])} (after removing blue chips)")
    except Exception as e:
        failures.append(f"growth ({e!r})")
        new["growth"] = [t for t in (norm_ticker(x) for x in old.get("growth", [])) if t not in set(new["bluechip"])]
        print(f"  ❌ growth refresh failed, keep old list: {e!r}")

    # 加密:前 20
    try:
        new["crypto"] = fetch_crypto_top20()
        print(f"  crypto: {len(new['crypto'])}")
    except Exception as e:
        failures.append(f"crypto ({e!r})")
        new["crypto"] = old.get("crypto") or DEFAULT_CRYPTO
        print(f"  ❌ crypto refresh failed, keep old list: {e}")

    # 台股:市值前 50 + 國內成分股 ETF
    try:
        tw_stocks, tw_names = fetch_tw_top50()
        print(f"  tw stocks: {len(tw_stocks)}")
    except Exception as e:
        failures.append(f"tw ({e!r})")
        tw_stocks = [c.replace(".TW", "") for c in (old.get("tw") or []) if not c.startswith("00")] or DEFAULT_TW_STOCKS
        tw_names = old.get("tw_names") or {}
        print(f"  ❌ tw refresh failed, keep old list: {e}")
    new["tw"] = [f"{c}.TW" for c in tw_stocks + TW_ETFS]
    new["tw_names"] = {**tw_names, **TW_ETF_NAMES}

    new["updated"] = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(TICKERS_FILE, "w", encoding="utf-8") as f:
        json.dump({k: new[k] for k in ["updated", "index", "bluechip", "growth", "real", "crypto", "tw", "tw_names"]},
                  f, ensure_ascii=False, indent=2)
    print(f"\n✅ tickers.json written" + (f" (with {len(failures)} failed source(s), old lists kept)" if failures else ""))
    return new, failures

# ════════════════════════════════════════════════════════════════
# SECTION 7 — 每週選股
# ════════════════════════════════════════════════════════════════

def run_weekly_picks(pools):
    print("\n═══ WEEKLY PICKS ═══")
    vix_closes, _ = get_closes_and_meta("^VIX", "5y")
    vix_closes = vix_closes or []
    vix_now = vix_closes[-1] if vix_closes else 20.0
    print(f"  VIX={vix_now:.2f}")

    ranked = {}
    for key in POOL_ORDER + ["tw"]:
        tickers = pools.get(key) or []
        ranked[key] = rank_pool(key, tickers, vix_closes) if tickers else []

    # 主打:五個池子的冠軍中分數最高者(台股不參與)
    champions = [(k, ranked[k][0]) for k in POOL_ORDER if ranked[k]]
    if not champions:
        print("❌ No picks generated for ANY pool — all fetches failed (Yahoo blocking?).")
        sys.exit(1)
    feat_key, feat_r = max(champions, key=lambda x: x[1]["score"])
    print(f"\n★ featured: {feat_r['ticker']} ({feat_key}) {feat_r['score']}")

    featured = enrich_pick(feat_r, feat_key)
    picks = []
    for k in POOL_ORDER:
        lst = ranked[k]
        if not lst:
            continue
        # 主打所在的池子改用第二名,主打不會重複出現在分類卡
        r = lst[1] if (k == feat_key and len(lst) > 1) else (None if k == feat_key else lst[0])
        if r is not None:
            picks.append(enrich_pick(r, k))

    tw_pick = enrich_pick(ranked["tw"][0], "tw") if ranked["tw"] else None
    if tw_pick:
        # 台股卡只在中文版顯示,公司名稱改用中文(沒抓到中文名稱時維持 Yahoo 的英文名)
        code = tw_pick["ticker"].replace(".TW", "")
        zh_name = (pools.get("tw_names") or {}).get(code) or TW_ETF_NAMES.get(code)
        if zh_name:
            tw_pick["companyName"] = zh_name

    now = datetime.datetime.utcnow()
    output = {
        "updated": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "updated_display": now.strftime("%b %d, %Y"),
        "vix": round(vix_now, 2),
        "featured": featured,
        "picks": picks,
        "tw": tw_pick,
    }
    with open(PICKS_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n✅ picks.json written — featured {featured['ticker']}, {len(picks)} pool cards"
          + (f", TW {tw_pick['ticker']}" if tw_pick else ""))

# ════════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════════

def is_quarterly_refresh():
    now = datetime.datetime.utcnow()
    return now.month in (1, 4, 7, 10) and now.weekday() == 1 and now.day <= 7

NEW_SCHEMA_KEYS = ("index", "bluechip", "growth", "real", "crypto", "tw")

if __name__ == "__main__":
    old = load_tickers_raw()
    # 舊版 tickers.json(只有 bluechip/growth/alternative)→ 第一次執行時自動重建成新的五池 + 台股
    needs_migration = not all(k in old for k in NEW_SCHEMA_KEYS)
    failures = []
    if "--refresh" in sys.argv or is_quarterly_refresh() or needs_migration:
        if needs_migration:
            print("tickers.json 是舊格式,自動重建候選池")
        pools, failures = refresh_tickers(old)
    else:
        pools = old

    run_weekly_picks(pools)

    if failures:
        # picks.json 已經寫好;這裡以非零代碼結束只是為了讓 Actions 顯示紅叉提醒
        # (commit 步驟設了 always(),picks.json 照樣會推上去)
        print("\n❌ 候選池重建有來源失敗,已沿用舊名單:")
        for f in failures:
            print(f"   - {f}")
        sys.exit(1)
