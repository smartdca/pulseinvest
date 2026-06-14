#!/usr/bin/env python3
"""
DCAcafe — Auto Pick Generator v2
- Weekly (Tue & Fri): score tickers from tickers.json, write picks.json
- Quarterly (first Tue of Jan/Apr/Jul/Oct): refresh tickers.json from Wikipedia
"""

import json, math, datetime, urllib.request, urllib.parse, html, re, sys, time

PROXY = "https://proxy-three-mu-47.vercel.app/api/proxy"

ALTERNATIVE_TICKERS = [
    "GLD", "SLV", "GDX", "USO", "COPX", "URA",
    "BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "AVAX-USD", "LINK-USD"
]

TICKERS_FILE = "tickers.json"
PICKS_FILE   = "picks.json"

# ── POOL LABELS ─────────────────────────────────────────────────
POOL_META = {
    "bluechip":    {"label_en": "Blue Chip",    "label_zh": "藍籌股"},
    "growth":      {"label_en": "Growth",        "label_zh": "成長股"},
    "alternative": {"label_en": "Alternative",   "label_zh": "另類資產"},
}


# ════════════════════════════════════════════════════════════════
# SECTION 1 — FETCH HELPERS
# ════════════════════════════════════════════════════════════════

def fetch_yahoo(ticker, range_="1y", interval="1d", retries=2):
    yahoo_url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(ticker)}"
        f"?range={range_}&interval={interval}"
    )
    url = f"{PROXY}?url={urllib.parse.quote(yahoo_url)}"
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read())
        except Exception as e:
            if attempt < retries:
                time.sleep(2)
            else:
                raise e

def get_daily_closes(ticker, range_="5y"):
    """Returns (closes, dates) or (None, None)."""
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
    """Fetch 5y VIX history, return (current_vix, percentile 0–1)."""
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
    """Return market cap in USD or None."""
    try:
        data = fetch_yahoo(ticker, range_="1d", interval="1d")
        meta = data["chart"]["result"][0]["meta"]
        return meta.get("marketCap", None)
    except:
        return None


# ════════════════════════════════════════════════════════════════
# SECTION 2 — SIGNAL MATH (v2 four-indicator formula)
# ════════════════════════════════════════════════════════════════

def calc_rsi(closes, period=14):
    if len(closes) < period + 1:
        return 50.0
    gains, losses = [], []
    for i in range(1, period + 1):
        d = closes[-period - 1 + i] - closes[-period - 2 + i]
        (gains if d > 0 else losses).append(abs(d))
    avg_gain = sum(gains) / period if gains else 0
    avg_loss = sum(losses) / period if losses else 0.001
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
    """% drawdown from 52-week high."""
    high_52 = max(closes[-252:]) if len(closes) >= 252 else max(closes)
    return round((closes[-1] - high_52) / high_52 * 100, 1)

def calc_max_drawdown(closes):
    """Historical max drawdown (negative %)."""
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
    """Percentile of current drawdown relative to historical drawdowns."""
    max_dd = calc_max_drawdown(closes)
    floor_dd = min(max_dd, -20.0)  # floor at -20%
    if floor_dd == 0:
        return 0.0
    ratio = abs(current_dd) / abs(floor_dd)
    return round(min(ratio, 1.0), 3)

def calc_ma1000_deviation_percentile(closes):
    """
    1000-day MA deviation percentile.
    Returns (has_enough_data, percentile 0-1).
    Higher percentile = price further BELOW MA = better entry.
    """
    if len(closes) < 1000:
        return False, 0.5
    ma1000 = sum(closes[-1000:]) / 1000
    current = closes[-1]
    current_dev = (current - ma1000) / ma1000  # negative = below MA

    # Build history of deviations
    devs = []
    for i in range(1000, len(closes)):
        ma = sum(closes[i-1000:i]) / 1000
        devs.append((closes[i] - ma) / ma)

    if not devs:
        return False, 0.5

    # Lower deviation (more below MA) = higher score → invert
    below = sum(1 for d in devs if d >= current_dev)
    pct = below / len(devs)
    return True, round(pct, 3)

def calc_score_v2(prsi, dd_pct, dd_percentile, vix_percentile, ma_percentile, has_ma):
    """
    v2 four-indicator score (0–100).
    Weights match index.html:
      With MA:    MA 35% + RSI 25% + DD 25% + VIX 15%
      Without MA: RSI 43.2% + DD 34.6% + VIX 22.2%
    """
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

def calc_multiplier(score):
    """Mirror index.html multiplier logic."""
    if score < 60:
        return 1.0
    return round(1.0 + ((score - 60) / 40) * 0.8, 2)


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
    score        = calc_score_v2(prsi, dd_pct, dd_pct_ile, vix_pct, ma_pct_ile, has_ma)
    price        = round(closes[-1], 2)

    return {
        "ticker":   ticker,
        "price":    price,
        "rsi":      rsi,
        "prsi":     prsi,
        "drawdown": dd_pct,
        "score":    score,
        "has_ma":   has_ma,
    }


# ════════════════════════════════════════════════════════════════
# SECTION 4 — BLURB TEMPLATES
# ════════════════════════════════════════════════════════════════

def make_blurb(ticker, pool_key, prsi, drawdown, rsi, price, score, rank=0):
    dd_abs    = abs(drawdown)
    prsi_pct  = int(prsi * 100)

    templates = {
        "featured": {
            "en": (
                f"Among all screened tickers, {ticker} is showing the "
                f"strongest entry signal right now. It has retraced {dd_abs:.1f}% "
                f"from its peak, with RSI at the {prsi_pct}th percentile — "
                f"historically one of the better setups for a Smart DCA trigger. "
                f"Formula score: {score}/100."
            ),
            "zh": (
                f"本期所有篩選標的中，{ticker} 的入場訊號最強。"
                f"距高點回撤 {dd_abs:.1f}%，RSI 百分位 {prsi_pct}%，"
                f"歷史上這個位置的定投勝率相對較高。"
                f"公式評分：{score}/100。"
            ),
        },
        "bluechip": {
            "en": (
                f"{ticker} has dipped {dd_abs:.1f}% off its 52-week high — "
                f"meaningful for a name of this size and stability. "
                f"With RSI at just the {prsi_pct}th percentile, momentum is compressed. "
                f"Smart DCA score: {score}/100."
            ),
            "zh": (
                f"{ticker} 距 52 週高點下滑 {dd_abs:.1f}%，"
                f"對這類規模的藍籌股來說是相當顯著的回撤。"
                f"RSI 僅在第 {prsi_pct} 百分位，動能明顯收縮。"
                f"智能定投評分：{score}/100。"
            ),
        },
        "growth": {
            "en": (
                f"{ticker} is down {dd_abs:.1f}% from its high, placing RSI at the "
                f"{prsi_pct}th historical percentile. "
                f"Growth names can swing hard — this kind of reset is where our "
                f"AI formula tends to find value. Entry score: {score}/100."
            ),
            "zh": (
                f"{ticker} 距高點下跌 {dd_abs:.1f}%，RSI 歷史百分位 {prsi_pct}%。"
                f"成長股波動大，這類深度修正正是 AI 公式設計尋找的入場點。"
                f"入場評分：{score}/100。"
            ),
        },
        "alternative": {
            "en": (
                f"{ticker} has pulled back {dd_abs:.1f}% with RSI at the "
                f"{prsi_pct}th percentile — a combination that historically "
                f"precedes recoveries in this asset class. "
                f"Smart DCA score: {score}/100."
            ),
            "zh": (
                f"{ticker} 回撤 {dd_abs:.1f}%，RSI 百分位 {prsi_pct}%。"
                f"這種組合在此類資產的歷史中常出現在反彈前夕。"
                f"公式評分：{score}/100。"
            ),
        },
    }

    key = "featured" if rank == 0 else pool_key
    return templates[key]


# ════════════════════════════════════════════════════════════════
# SECTION 5 — QUARTERLY POOL REFRESH
# ════════════════════════════════════════════════════════════════

def fetch_wikipedia_tickers(url, table_index=0):
    """Scrape ticker symbols from a Wikipedia table."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=20) as r:
            content = r.read().decode("utf-8")

        # Find all tables
        tables = re.findall(r'<table[^>]*wikitable[^>]*>(.*?)</table>', content, re.DOTALL)
        if not tables or table_index >= len(tables):
            return []

        table = tables[table_index]
        rows  = re.findall(r'<tr>(.*?)</tr>', table, re.DOTALL)
        tickers = []
        for row in rows[1:]:  # skip header
            cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
            if not cells:
                continue
            # First cell is usually the ticker
            raw = re.sub(r'<[^>]+>', '', cells[0]).strip()
            raw = html.unescape(raw).split('\n')[0].strip()
            # Clean: remove footnotes like [1]
            raw = re.sub(r'\[\d+\]', '', raw).strip()
            if raw and re.match(r'^[A-Z]{1,5}(-[A-Z]+)?$', raw):
                tickers.append(raw)
        return tickers
    except Exception as e:
        print(f"  Wikipedia fetch error: {e}")
        return []

def is_old_enough(ticker, min_years=8):
    """Check if ticker has at least min_years of history."""
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
    """Quarterly: rebuild tickers.json from Wikipedia + filters."""
    print("\n═══ QUARTERLY POOL REFRESH ═══")

    # ── Blue Chip: S&P 500 top 60 by market cap ──
    print("\n[1/3] Fetching S&P 500 from Wikipedia...")
    sp500 = fetch_wikipedia_tickers(
        "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    )
    print(f"  Found {len(sp500)} S&P 500 tickers")

    # ── Growth: NASDAQ 100 ──
    print("\n[2/3] Fetching NASDAQ 100 from Wikipedia...")
    nasdaq100 = fetch_wikipedia_tickers(
        "https://en.wikipedia.org/wiki/Nasdaq-100",
        table_index=4  # the components table
    )
    print(f"  Found {len(nasdaq100)} NASDAQ 100 tickers")

    # ── Filter: 8-year history + market cap ──
    print("\n[3/3] Filtering by age and market cap...")

    bluechip_candidates = []
    for ticker in sp500[:80]:  # check top 80, keep best 50
        print(f"  Checking {ticker}...")
        cap = get_market_cap(ticker)
        if cap and cap >= 10_000_000_000:  # $10B+
            if is_old_enough(ticker, min_years=8):
                bluechip_candidates.append((ticker, cap))
                print(f"    ✓ cap=${cap/1e9:.0f}B")
            else:
                print(f"    ✗ history too short")
        else:
            print(f"    ✗ market cap too small")
        if len(bluechip_candidates) >= 50:
            break

    bluechip_tickers = [t for t, _ in sorted(bluechip_candidates, key=lambda x: -x[1])]

    # Growth: NASDAQ 100 minus already in bluechip
    bluechip_set = set(bluechip_tickers)
    growth_candidates = []
    for ticker in nasdaq100:
        if ticker in bluechip_set:
            continue
        print(f"  Checking {ticker} (growth)...")
        if is_old_enough(ticker, min_years=8):
            growth_candidates.append(ticker)
            print(f"    ✓")
        else:
            print(f"    ✗ history too short")
        if len(growth_candidates) >= 40:
            break

    tickers = {
        "updated": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "bluechip": bluechip_tickers,
        "growth":   growth_candidates,
        "alternative": ALTERNATIVE_TICKERS,
    }

    with open(TICKERS_FILE, "w", encoding="utf-8") as f:
        json.dump(tickers, f, ensure_ascii=False, indent=2)

    print(f"\n✅ tickers.json written:")
    print(f"   Blue Chip:   {len(bluechip_tickers)} tickers")
    print(f"   Growth:      {len(growth_candidates)} tickers")
    print(f"   Alternative: {len(ALTERNATIVE_TICKERS)} tickers")


# ════════════════════════════════════════════════════════════════
# SECTION 6 — WEEKLY PICKS
# ════════════════════════════════════════════════════════════════

def load_tickers():
    """Load tickers.json, fallback to hardcoded defaults if missing."""
    try:
        with open(TICKERS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data
    except FileNotFoundError:
        print("  tickers.json not found — using built-in defaults")
        return {
            "bluechip": [
                "AAPL","MSFT","GOOGL","AMZN","META","NVDA","JPM","V","MA",
                "JNJ","WMT","PG","KO","HD","BAC","XOM","UNH","CVX",
                "SPY","QQQ","VTI","VOO"
            ],
            "growth": [
                "RKLB","CELH","DUOL","AXON","CAVA","CRWD","DDOG",
                "NET","SNOW","PLTR","COIN","SHOP","MELI","ENPH","FSLR",
                "GLBE","IOT","ASTS"
            ],
            "alternative": ALTERNATIVE_TICKERS,
        }

def pick_best(pool_key, tickers, vix_pct, exclude_ticker=None, rank=1):
    print(f"\n── {pool_key.upper()} pool ({len(tickers)} tickers) ──")
    candidates = []
    for ticker in tickers:
        if exclude_ticker and ticker == exclude_ticker:
            print(f"  [{ticker}] skipped (already featured)")
            continue
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
    blurb = make_blurb(
        best["ticker"], pool_key,
        best["prsi"], best["drawdown"],
        best["rsi"], best["price"], best["score"], rank=rank
    )
    return {
        "pool":      pool_key,
        "label_en":  POOL_META[pool_key]["label_en"],
        "label_zh":  POOL_META[pool_key]["label_zh"],
        "ticker":    best["ticker"],
        "price":     best["price"],
        "rsi":       best["rsi"],
        "prsi_pct":  int(best["prsi"] * 100),
        "drawdown":  best["drawdown"],
        "score":     best["score"],
        "blurb":     blurb,
    }

def run_weekly_picks():
    print("\n═══ WEEKLY PICKS ═══")
    pools = load_tickers()

    # Fetch VIX once, share across all tickers
    print("\nFetching VIX...")
    vix_val, vix_pct = get_vix_percentile()
    print(f"  VIX={vix_val}  percentile={vix_pct:.1%}")

    now            = datetime.datetime.utcnow()
    updated        = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    updated_display = now.strftime("%b %d, %Y")

    # Step 1: best from each pool
    raw_picks = []
    for pool_key in ["bluechip", "growth", "alternative"]:
        tickers = pools.get(pool_key, [])
        pick = pick_best(pool_key, tickers, vix_pct, rank=1)
        if pick:
            raw_picks.append((pool_key, pick))

    if not raw_picks:
        print("No picks generated.")
        return

    # Step 2: featured = highest score across all pools
    featured_pool_key, featured_pick = max(raw_picks, key=lambda x: x[1]["score"])
    fp = featured_pick
    featured_pick["blurb"] = make_blurb(
        fp["ticker"], featured_pool_key,
        fp["prsi_pct"] / 100, fp["drawdown"],
        fp["rsi"], fp["price"], fp["score"], rank=0
    )

    # Step 3: pool cards — if featured ticker appears in a pool, find next best
    final_picks = []
    for pool_key in ["bluechip", "growth", "alternative"]:
        tickers = pools.get(pool_key, [])
        existing = next((p for k, p in raw_picks if k == pool_key), None)
        if existing and existing["ticker"] == featured_pick["ticker"]:
            print(f"\n  [{pool_key}] top pick is featured — finding next best...")
            replacement = pick_best(pool_key, tickers, vix_pct,
                                    exclude_ticker=featured_pick["ticker"], rank=1)
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
    """True on the first Tuesday of Jan, Apr, Jul, Oct."""
    now = datetime.datetime.utcnow()
    if now.month not in (1, 4, 7, 10):
        return False
    if now.weekday() != 1:  # Tuesday = 1
        return False
    # First Tuesday = day <= 7
    return now.day <= 7

if __name__ == "__main__":
    force_refresh = "--refresh" in sys.argv

    if force_refresh or is_quarterly_refresh():
        refresh_tickers()

    run_weekly_picks()
