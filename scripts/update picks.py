#!/usr/bin/env python3
"""
DCAcafe — Auto Pick Generator v2
- Weekly (Tue & Fri): score tickers from tickers.json, write picks.json
- Quarterly (first Tue of Jan/Apr/Jul/Oct): refresh tickers.json from Wikipedia
"""

import json, math, datetime, urllib.request, urllib.parse, re, sys, time

PROXY = "https://proxy-three-mu-47.vercel.app/api/proxy"

ALTERNATIVE_TICKERS = [
    "GLD", "SLV", "GDX", "USO", "COPX", "URA", "PPLT", "PALL", "DBB", "DBC", "VNQ",
    "BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "AVAX-USD", "LINK-USD", "XRP-USD"
]

TICKERS_FILE = "tickers.json"
PICKS_FILE   = "picks.json"

POOL_META = {
    "bluechip":    {"label_en": "Blue Chip",    "label_zh": "藍籌股"},
    "growth":      {"label_en": "Growth",        "label_zh": "成長股"},
    "alternative": {"label_en": "Alternative",   "label_zh": "另類資產"},
}

# ════════════════════════════════════════════════════════════════
# SECTION 1 — FETCH HELPERS
# ════════════════════════════════════════════════════════════════

def fetch_yahoo(ticker, range_="1y", interval="1d", retries=1):
    yahoo_url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(ticker)}"
        f"?range={range_}&interval={interval}"
    )
    # 2026-08-18 排查(第二輪):放慢速度+拉長重試沒有解決問題——連第一個請求(單獨抓VIX,
    # 根本還沒開始密集打)都馬上被403擋掉,證明不是「打太快被抓」,是 Proxy 對外那個固定IP
    # 本身已經被 Yahoo 長期拉黑(Proxy 24小時服務全站即時查詢,流量大,被盯上機率本來就高)。
    # 這支腳本是在伺服器上跑(不是瀏覽器),本來就不需要靠 Proxy 轉一手(那層通常是為了解決
    # 瀏覽器端的跨網域限制)——改成直接打 Yahoo,用 GitHub Actions 自己的IP,是不同的IP池。
    # 保留原本經 Proxy 的路線當備援(萬一直接打也被擋,至少還有第二條路可以試)。
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
    }
    urls_to_try = [
        yahoo_url,                                    # 路線1:直接打Yahoo(GitHub Actions自己的IP)
        f"{PROXY}?url={urllib.parse.quote(yahoo_url)}", # 路線2:原本經Proxy的路線,當備援
    ]
    last_err = None
    for url in urls_to_try:
        for attempt in range(retries + 1):
            try:
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=20) as r:
                    return json.loads(r.read())
            except Exception as e:
                last_err = e
                if attempt < retries:
                    time.sleep(4)
    raise last_err

def get_daily_closes(ticker, range_="5y"):
    try:
        data = fetch_yahoo(ticker, range_=range_, interval="1d")
        result = data["chart"]["result"][0]
        timestamps = result.get("timestamp", [])
        closes_raw = result["indicators"]["quote"][0]["close"]
        pairs = [(t, c) for t, c in zip(timestamps, closes_raw) if c is not None]
        if len(pairs) < 60:
            return None, None
        closes = [p[1] for p in pairs]
        dates  = [datetime.datetime.utcfromtimestamp(p[0]).strftime("%Y-%m-%d") for p in pairs]
        return closes, dates
    except Exception as e:
        print(f"  [{ticker}] daily fetch error: {e}")
        return None, None

def get_vix_percentile():
    try:
        closes, _ = get_daily_closes("^VIX", range_="5y")
        if not closes or len(closes) < 30:
            return 20.0, 0.5
        current = closes[-1]
        pct = sum(1 for v in closes if v <= current) / len(closes)
        return round(current, 2), round(pct, 3)
    except Exception as e:
        print(f"  [VIX] fetch error: {e}")
        return 20.0, 0.5

def get_market_cap(ticker):
    try:
        data = fetch_yahoo(ticker, range_="1d", interval="1d")
        meta = data["chart"]["result"][0]["meta"]
        return meta.get("marketCap", None)
    except:
        return None

# ════════════════════════════════════════════════════════════════
# SECTION 2 — SIGNAL MATH (v2 four-indicator formula)
# ════════════════════════════════════════════════════════════════

# 2026-08-19新增:價格格式化——用字串固定小數位輸出,不要用float(JSON序列化
# float會吃掉尾端的0,例如28.40會變成28.4,這也是XRP顯示"1 USD"沒有小數的原因
# 之一)。>=$10的資產用2位小數(一般股票夠用);<$10用4位小數(加密貨幣/低價資產
# 需要更精細的報價,不然差異都被四捨五入吃掉了)。門檻抓$10是財經網站常見慣例,
# 不是絕對規則,之後有需要可以調整。
def format_price(price):
    if price is None:
        return None
    decimals = 2 if price >= 10 else 4
    return f"{price:.{decimals}f}"

def calc_rsi(closes, period=14):
    if len(closes) < period + 1:
        return 50.0
    gains, losses = [], []
    for i in range(1, period + 1):
        d = closes[-period - 1 + i] - closes[-period - 2 + i]
        (gains if d > 0 else losses).append(abs(d))
    avg_gain = sum(gains) / period if gains else 0
    avg_loss = sum(losses) / period if losses else 0.001
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - 100 / (1 + rs), 1)

def calc_rsi_percentile(closes, period=14):
    rsi_history = []
    for i in range(period + 2, len(closes) + 1):
        slice_ = closes[max(0, i - period - 1):i]
        if len(slice_) < period + 1:
            continue
        try:
            rsi_history.append(calc_rsi(slice_, period))
        except Exception:
            continue
    if not rsi_history:
        return 0.5
    current = rsi_history[-1]
    below = sum(1 for r in rsi_history if r <= current)
    return round(below / len(rsi_history), 3)

def calc_drawdown(closes):
    high_52 = max(closes[-252:]) if len(closes) >= 252 else max(closes)
    return round((closes[-1] - high_52) / high_52 * 100, 1)

def calc_max_drawdown(closes):
    peak = closes[0]
    max_dd = 0.0
    for c in closes:
        if c > peak:
            peak = c
        dd = (c - peak) / peak * 100
        if dd < max_dd:
            max_dd = dd
    return round(max_dd, 1)

def calc_drawdown_percentile(current_dd, closes):
    max_dd = calc_max_drawdown(closes)
    floor_dd = min(max_dd, -20.0)
    if floor_dd == 0:
        return 0.0
    ratio = abs(current_dd) / abs(floor_dd)
    return round(min(ratio, 1.0), 3)

def calc_ma1000_deviation_percentile(closes):
    if len(closes) < 1000:
        return False, 0.5
    ma1000 = sum(closes[-1000:]) / 1000
    current = closes[-1]
    current_dev = (current - ma1000) / ma1000
    devs = []
    for i in range(1000, len(closes)):
        ma = sum(closes[i-1000:i]) / 1000
        devs.append((closes[i] - ma) / ma)
    if not devs:
        return False, 0.5
    below = sum(1 for d in devs if d >= current_dev)
    pct = below / len(devs)
    return True, round(pct, 3)

def calc_score_v2(prsi, dd_pct, dd_percentile, vix_percentile, ma_percentile, has_ma):
    if has_ma:
        score = (
            ma_percentile  * 35 +
            (1 - prsi)     * 25 +
            dd_percentile  * 25 +
            vix_percentile * 15
        )
    else:
        score = (
            (1 - prsi)     * 43.2 +
            dd_percentile  * 34.6 +
            vix_percentile * 22.2
        )
    return round(score, 1)

# 2026-08-19新增:改打正式的計分API(/api/score),不再用上面那套本地土砲公式。
# 這支API只吃「已經算好的百分位數字」當輸入,自己不抓任何原始資料——所以不會
# 多消耗FMP額度。回傳的score/multiplier/lights都是跟主力計算卡片同一套受保護
# 公式算出來的,顏色分級(lights)才會跟正式站一致。P/FCF這裡固定傳hasPfcf:false
# (跳過,公式本身就有這種資產的降級處理),避免批次掃100+支候選股票時另外打FMP。
#
# 已知落差(跟Henry確認過,先這樣做,之後有需要再調):這支腳本算均線用的是「過去
# 1000個交易日」,主力卡片用的是「200週均線」——兩個概念接近(都約4年)但計算
# 方法不同(日線vs週線),數字不會完全一致,只會非常接近。
SCORE_API_URL = "https://proxy-three-mu-47.vercel.app/api/score"

def fetch_real_score(prsi, dd_percentile, vix_percentile, ma_percentile, has_ma):
    payload = json.dumps({
        "prsi": prsi,
        "ddPercentile": dd_percentile,
        "vixPercentile": vix_percentile,
        "maPercentile": ma_percentile,
        "hasMa": has_ma,
        "pfcfPercentile": 0.5,
        "hasPfcf": False,
    }).encode("utf-8")
    req = urllib.request.Request(
        SCORE_API_URL, data=payload,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

# ════════════════════════════════════════════════════════════════
# SECTION 3 — ANALYZE A SINGLE TICKER
# ════════════════════════════════════════════════════════════════

def analyze_ticker(ticker, vix_pct):
    closes, _ = get_daily_closes(ticker, range_="5y")
    if not closes:
        return None
    prsi         = calc_rsi_percentile(closes)
    rsi          = calc_rsi(closes)
    dd_pct       = calc_drawdown(closes)
    dd_pct_ile   = calc_drawdown_percentile(dd_pct, closes)
    has_ma, ma_pct_ile = calc_ma1000_deviation_percentile(closes)
    # 改打正式計分API,不再用本地土砲公式——失敗時安全降級,分數還是能算出來,
    # 只是lights會是None(前端遇到None會顯示中性/不上色,不會壞掉)。
    lights = None
    multiplier = None
    try:
        score_res  = fetch_real_score(prsi, dd_pct_ile, vix_pct, ma_pct_ile, has_ma)
        score      = score_res.get("score")
        lights     = score_res.get("lights")
        multiplier = score_res.get("multiplier")
    except Exception as e:
        print(f"  [{ticker}] /api/score call failed, falling back to local formula: {e}")
        score = calc_score_v2(prsi, dd_pct, dd_pct_ile, vix_pct, ma_pct_ile, has_ma)
    price = format_price(round(closes[-1], 4))
    # Get company name from Yahoo meta
    company_name = ticker
    try:
        data = fetch_yahoo(ticker, range_="1d", interval="1d")
        meta = data["chart"]["result"][0]["meta"]
        company_name = meta.get("longName") or meta.get("shortName") or ticker
    except:
        pass
    return {
        "ticker":      ticker,
        "price":       price,
        "rsi":         rsi,
        "prsi":        prsi,
        "drawdown":    dd_pct,
        "score":       score,
        "lights":      lights,
        "multiplier":  multiplier,
        "has_ma":      has_ma,
        "companyName": company_name,
    }

# ════════════════════════════════════════════════════════════════
# SECTION 4 — BLURB TEMPLATES
# ════════════════════════════════════════════════════════════════

def make_blurb(ticker, pool_key, prsi, drawdown, rsi, price, score, rank=0):
    dd_abs    = abs(drawdown)
    prsi_pct  = int(prsi * 100)
    score_str = f"{score}/100"
    templates = {
        "featured": {
            "en": (f"Among all screened tickers, {ticker} is showing the strongest entry signal right now. "
                   f"It has retraced {dd_abs:.1f}% from its peak, with RSI at the {prsi_pct}th percentile — "
                   f"historically one of the better setups for a Smart DCA trigger. "
                   f"Our AI formula weighs long-term trend, momentum, drawdown depth, and market fear together. "
                   f"Formula score: {score_str}."),
            "zh": (f"本期所有篩選標的中，{ticker} 的入場訊號最強。"
                   f"距高點回撤 {dd_abs:.1f}%，RSI 百分位 {prsi_pct}%，"
                   f"歷史上這個位置的定投勝率相對較高。"
                   f"我們的 AI 公式綜合長期趨勢、動能、回撤深度與市場恐慌四項指標加權計算。"
                   f"公式評分：{score_str}。"),
        },
        "bluechip": {
            "en": (f"{ticker} has dipped {dd_abs:.1f}% off its 52-week high — "
                   f"meaningful for a name of this size and stability. "
                   f"With RSI at just the {prsi_pct}th percentile, momentum is compressed and the market has repriced this blue chip lower. "
                   f"For long-term DCA investors, this is the kind of setup our formula is designed to flag. "
                   f"Smart DCA score: {score_str}."),
            "zh": (f"{ticker} 距 52 週高點下滑 {dd_abs:.1f}%，"
                   f"對這類規模的藍籌股來說是相當顯著的回撤。"
                   f"RSI 僅在第 {prsi_pct} 百分位，動能明顯收縮，市場已對這支藍籌股重新定價。"
                   f"對長期定投者而言，這正是我們公式設計來捕捉的訊號。"
                   f"智能定投評分：{score_str}。"),
        },
        "growth": {
            "en": (f"{ticker} is down {dd_abs:.1f}% from its high, placing RSI at the {prsi_pct}th historical percentile. "
                   f"Growth names can swing hard — and this kind of reset is exactly where our AI formula tends to find its best entries. "
                   f"High volatility cuts both ways, but dollar-cost averaging into weakness has historically been a strong approach for this category. "
                   f"Entry score: {score_str}."),
            "zh": (f"{ticker} 距高點下跌 {dd_abs:.1f}%，RSI 歷史百分位 {prsi_pct}%。"
                   f"成長股波動幅度大，而這類深度修正正是我們 AI 公式最常找到優質入場點的位置。"
                   f"高波動是雙面刃，但在弱勢中持續定投，歷史上對這類標的效果顯著。"
                   f"入場評分：{score_str}。"),
        },
        "alternative": {
            "en": (f"{ticker} has pulled back {dd_abs:.1f}% with RSI at the {prsi_pct}th percentile — "
                   f"a combination that historically precedes recoveries in this asset class. "
                   f"Alternative assets often move independently of equities, making them a useful diversification layer in a DCA portfolio. "
                   f"Smart DCA score: {score_str}."),
            "zh": (f"{ticker} 回撤 {dd_abs:.1f}%，RSI 百分位 {prsi_pct}%。"
                   f"這種組合在此類資產的歷史中常出現在反彈前夕。"
                   f"另類資產的走勢通常與股市相關性較低，在定投組合中能提供有效的分散效果。"
                   f"公式評分：{score_str}。"),
        },
    }
    key = "featured" if rank == 0 else pool_key
    return templates[key]

# ════════════════════════════════════════════════════════════════
# SECTION 5 — QUARTERLY POOL REFRESH
# ════════════════════════════════════════════════════════════════

def fetch_wikipedia_sp500():
    """Fetch S&P 500 tickers from slickcharts.com (sorted by market cap weight)."""
    try:
        url = "https://www.slickcharts.com/sp500"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"})
        with urllib.request.urlopen(req, timeout=30) as r:
            html = r.read().decode("utf-8")
        # Table rows: <td><a href="/symbol/NVDA">NVDA</a></td>
        tickers = re.findall(r'href="/symbol/([A-Z]{1,5}(?:\.[A-Z]{1,2})?)"', html)
        seen = set()
        unique = []
        for t in tickers:
            if t not in seen:
                seen.add(t)
                unique.append(t)
        print(f"  S&P 500: found {len(unique)} tickers from slickcharts (by weight)")
        return unique
    except Exception as e:
        print(f"  S&P 500 slickcharts error: {e}")
        return []

def fetch_wikipedia_nasdaq100():
    """Fetch NASDAQ 100 tickers from slickcharts.com (sorted by market cap weight)."""
    try:
        url = "https://www.slickcharts.com/nasdaq100"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"})
        with urllib.request.urlopen(req, timeout=30) as r:
            html = r.read().decode("utf-8")
        tickers = re.findall(r'href="/symbol/([A-Z]{1,5}(?:\.[A-Z]{1,2})?)"', html)
        seen = set()
        unique = []
        for t in tickers:
            if t not in seen:
                seen.add(t)
                unique.append(t)
        if not unique:
            raise Exception("Empty result")
        print(f"  NASDAQ 100: found {len(unique)} tickers from slickcharts (by weight)")
        return unique
    except Exception as e:
        print(f"  NASDAQ 100 slickcharts error: {e}")
        return []

def is_old_enough(ticker, min_years=8):
    try:
        data = fetch_yahoo(ticker, range_="max", interval="3mo")
        result = data["chart"]["result"][0]
        timestamps = result.get("timestamp", [])
        if not timestamps:
            return False
        earliest = datetime.datetime.utcfromtimestamp(timestamps[0])
        years = (datetime.datetime.utcnow() - earliest).days / 365.25
        return years >= min_years
    except:
        return False

def refresh_tickers():
    print("\n═══ QUARTERLY POOL REFRESH ═══")

    print("\n[1/3] Fetching S&P 500 from Wikipedia API...")
    sp500 = fetch_wikipedia_sp500()

    print("\n[2/3] Fetching NASDAQ 100 from Wikipedia API...")
    nasdaq100 = fetch_wikipedia_nasdaq100()


    print("\n[3/3] Building pools from CSV...")

    # Blue Chip: first 50 from S&P 500 CSV
    # S&P 500 members all have 8yr+ history and $10B+ market cap by definition
    bluechip_candidates = sp500[:50]
    print(f"  Blue Chip: {len(bluechip_candidates)} tickers from S&P 500 CSV")

    # Growth: NASDAQ 100 minus bluechip, up to 40
    bluechip_set = set(bluechip_candidates)
    growth_candidates = [t for t in nasdaq100 if t not in bluechip_set][:40]
    print(f"  Growth: {len(growth_candidates)} NASDAQ 100 tickers not in Blue Chip")

    tickers = {
        "updated": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "bluechip": bluechip_candidates,
        "growth":   growth_candidates,
        "alternative": ALTERNATIVE_TICKERS,
    }

    with open(TICKERS_FILE, "w", encoding="utf-8") as f:
        json.dump(tickers, f, ensure_ascii=False, indent=2)

    print(f"\n✅ tickers.json written:")
    print(f"   Blue Chip:   {len(bluechip_candidates)} tickers")
    print(f"   Growth:      {len(growth_candidates)} tickers")
    print(f"   Alternative: {len(ALTERNATIVE_TICKERS)} tickers")

# ════════════════════════════════════════════════════════════════
# SECTION 6 — WEEKLY PICKS
# ════════════════════════════════════════════════════════════════

def load_tickers():
    try:
        with open(TICKERS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data
    except FileNotFoundError:
        print("  tickers.json not found — using built-in defaults")
        return {
            "bluechip": ["AAPL","MSFT","GOOGL","AMZN","META","NVDA","JPM","V","MA","JNJ","WMT","PG","KO","HD","BAC","XOM","UNH","CVX","SPY","QQQ","VTI","VOO"],
            "growth":   ["RKLB","CELH","DUOL","AXON","CRWD","DDOG","NET","PLTR","COIN","SHOP","MELI","ENPH","FSLR","GLBE","IOT","ASTS"],
            "alternative": ALTERNATIVE_TICKERS,
        }

def pick_best(pool_key, tickers, vix_pct, exclude_ticker=None, rank=1):
    print(f"\n── {pool_key.upper()} pool ({len(tickers)} tickers) ──")
    candidates = []
    for i, ticker in enumerate(tickers):
        if exclude_ticker and ticker == exclude_ticker:
            print(f"  [{ticker}] skipped (already featured)")
            continue
        # 2026-08-18新增:每支股票檢查之間間隔0.8秒,不要瞬間連續打上百次——
        # 這正是造成三個池同時被 Yahoo 403/429 全軍覆沒的主因(見排查記錄)。
        if i > 0:
            time.sleep(0.8)
        print(f"  Checking {ticker}...")
        result = analyze_ticker(ticker, vix_pct)
        if result is None:
            continue
        print(f"    score={result['score']}  dd={result['drawdown']}%  rsi={result['rsi']}  has_ma={result['has_ma']}")
        if result["score"] > 30:
            candidates.append(result)

    if not candidates:
        print(f"  No qualifying picks for {pool_key}")
        return None

    best = max(candidates, key=lambda x: x["score"])
    blurb = make_blurb(best["ticker"], pool_key, best["prsi"], best["drawdown"], best["rsi"], best["price"], best["score"], rank=rank)
    return {
        "pool":        pool_key,
        "label_en":    POOL_META[pool_key]["label_en"],
        "label_zh":    POOL_META[pool_key]["label_zh"],
        "ticker":      best["ticker"],
        "companyName": best.get("companyName", best["ticker"]),
        "price":       best["price"],
        "rsi":         best["rsi"],
        "prsi_pct":    int(best["prsi"] * 100),
        "drawdown":    best["drawdown"],
        "score":       best["score"],
        "lights":      best.get("lights"),
        "blurb":       blurb,
    }

def run_weekly_picks():
    print("\n═══ WEEKLY PICKS ═══")
    pools = load_tickers()

    print("\nFetching VIX...")
    vix_val, vix_pct = get_vix_percentile()
    print(f"  VIX={vix_val}  percentile={vix_pct:.1%}")

    now             = datetime.datetime.utcnow()
    updated         = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    updated_display = now.strftime("%b %d, %Y")

    raw_picks = []
    for pool_key in ["bluechip", "growth", "alternative"]:
        tickers = pools.get(pool_key, [])
        pick = pick_best(pool_key, tickers, vix_pct, rank=1)
        if pick:
            raw_picks.append((pool_key, pick))

    if not raw_picks:
        # 2026-08-18修正:原本這裡只是 print + return,腳本本身沒有丟出任何錯誤,
        # 導致 GitHub Actions 顯示「成功」(綠勾勾),但 picks.json 其實完全沒被更新——
        # 這正是本次排查發現的根本問題。改成 sys.exit(1),讓失敗真的顯示成失敗,
        # 之後這種情況你會在 Actions 頁面直接看到紅叉叉,不用再靠自己發現網站沒更新。
        print("❌ No picks generated for ANY pool — all ticker fetches failed.")
        print("   This usually means Yahoo Finance is rate-limiting/blocking requests")
        print("   (see per-ticker error lines above for 403/429 details).")
        sys.exit(1)

    featured_pool_key, featured_pick = max(raw_picks, key=lambda x: x[1]["score"])
    fp = featured_pick
    featured_pick["blurb"] = make_blurb(fp["ticker"], featured_pool_key, fp["prsi_pct"]/100, fp["drawdown"], fp["rsi"], fp["price"], fp["score"], rank=0)

    final_picks = []
    for pool_key in ["bluechip", "growth", "alternative"]:
        tickers = pools.get(pool_key, [])
        existing = next((p for k, p in raw_picks if k == pool_key), None)
        if existing and existing["ticker"] == featured_pick["ticker"]:
            print(f"\n  [{pool_key}] top pick is featured — finding next best...")
            replacement = pick_best(pool_key, tickers, vix_pct, exclude_ticker=featured_pick["ticker"], rank=1)
            if replacement:
                final_picks.append(replacement)
        elif existing:
            final_picks.append(existing)

    output = {
        "updated":          updated,
        "updated_display":  updated_display,
        "featured":         featured_pick,
        "picks":            final_picks,
    }

    with open(PICKS_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n✅ picks.json written — {len(final_picks)} pool cards, featured: {featured_pick['ticker']}")

# ════════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════════

def is_quarterly_refresh():
    now = datetime.datetime.utcnow()
    if now.month not in (1, 4, 7, 10):
        return False
    if now.weekday() != 1:
        return False
    return now.day <= 7

if __name__ == "__main__":
    force_refresh = "--refresh" in sys.argv
    if force_refresh or is_quarterly_refresh():
        refresh_tickers()
    run_weekly_picks()
