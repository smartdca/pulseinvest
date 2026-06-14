#!/usr/bin/env python3
"""
PulseInvest — Auto Pick Generator
Runs every Mon & Thu, writes picks.json
"""

import json, math, datetime, urllib.request, urllib.parse

# ── STOCK POOLS ────────────────────────────────────────────────
POOLS = {
    "bluechip": {
        "label_en": "Blue Chip",
        "label_zh": "藍籌股",
        "tickers": [
            "AAPL","MSFT","GOOGL","AMZN","META","NVDA","JPM","V","MA",
            "JNJ","WMT","PG","KO","HD","BAC","XOM","UNH","CVX",
            "SPY","QQQ","VTI","VOO"
        ]
    },
    "growth": {
        "label_en": "Growth",
        "label_zh": "成長股",
        "tickers": [
            "RKLB","CELH","DUOL","AXON","CAVA","TMDX","CRWD","DDOG",
            "NET","SNOW","PLTR","COIN","SHOP","MELI","BURL","SAIA",
            "ENPH","FSLR","GTLS","RCM","GLBE","IOT","AEHR","ASTS"
        ]
    },
    "alternative": {
        "label_en": "Alternative",
        "label_zh": "另類資產",
        "tickers": [
            "GLD","SLV","GDX","USO","COPX","URA",
            "BTC-USD","ETH-USD","SOL-USD","BNB-USD","AVAX-USD","LINK-USD"
        ]
    }
}

PROXY = "https://proxy-v408.onrender.com/api/proxy"

# ── FETCH HELPERS ───────────────────────────────────────────────
def fetch_yahoo(ticker, range_="1y", interval="1d"):
    yahoo_url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(ticker)}"
        f"?range={range_}&interval={interval}"
    )
    url = f"{PROXY}?url={urllib.parse.quote(yahoo_url)}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def get_price_data(ticker):
    """Returns closes list or None."""
    try:
        data = fetch_yahoo(ticker, range_="2y", interval="1d")
        result = data["chart"]["result"][0]
        closes = [c for c in result["indicators"]["quote"][0]["close"] if c]
        if len(closes) < 60:
            return None
        return closes
    except Exception as e:
        print(f"  [{ticker}] fetch error: {e}")
        return None

def get_current_price(ticker):
    try:
        data = fetch_yahoo(ticker, range_="5d", interval="1d")
        closes = [c for c in data["chart"]["result"][0]["indicators"]["quote"][0]["close"] if c]
        return round(closes[-1], 2) if closes else None
    except:
        return None

# ── SIGNAL MATH ─────────────────────────────────────────────────
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
    """RSI percentile over available history."""
    rsi_history = []
    for i in range(period + 1, len(closes)):
        slice_ = closes[max(0, i - period - 1):i]
        rsi_history.append(calc_rsi(slice_, period))
    if not rsi_history:
        return 0.5
    current = rsi_history[-1]
    below = sum(1 for r in rsi_history if r <= current)
    return round(below / len(rsi_history), 3)

def calc_drawdown(closes):
    """% drawdown from 52-week high."""
    high_52 = max(closes[-252:]) if len(closes) >= 252 else max(closes)
    current = closes[-1]
    return round((current - high_52) / high_52 * 100, 1)

def signal_score(prsi, drawdown_pct):
    """
    Lower prsi + deeper drawdown = higher score (more attractive entry).
    Score 0–100; triggers only if score > 40.
    """
    dd_abs = abs(min(drawdown_pct, 0))
    score = (1 - prsi) * 50 + min(dd_abs / 40, 1) * 50
    return round(score, 1)

# ── TEMPLATE TEXT (4 distinct styles) ──────────────────────────
def make_blurb(ticker, pool_key, prsi, drawdown, rsi, price, score, rank=0):
    dd_abs = abs(drawdown)
    prsi_pct = int(prsi * 100)
    pool_zh = {"bluechip": "藍籌股", "growth": "成長股", "alternative": "另類資產"}
    zh_pool = pool_zh[pool_key]

    # 4 templates, chosen by rank (0=featured, 1=bluechip, 2=growth, 3=alternative)
    templates = {
        "featured": {
            "en": (
                f"Across all three pools, {ticker} is showing the strongest entry signal right now. "
                f"It has retraced {dd_abs:.1f}% from its peak, with RSI at the {prsi_pct}th percentile — "
                f"historically one of the better setups for a Smart DCA trigger. "
                f"Formula score: {score}/100."
            ),
            "zh": (
                f"本期三個池子中，{ticker} 的入場訊號最強。"
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
                f"{ticker} is down {dd_abs:.1f}% from its high, placing RSI at the {prsi_pct}th historical percentile. "
                f"Growth names can swing hard — this kind of reset is where our formula tends to find value. "
                f"Entry score: {score}/100."
            ),
            "zh": (
                f"{ticker} 距高點下跌 {dd_abs:.1f}%，RSI 歷史百分位 {prsi_pct}%。"
                f"成長股波動大，這類深度修正正是公式設計尋找的入場點。"
                f"入場評分：{score}/100。"
            ),
        },
        "alternative": {
            "en": (
                f"{ticker} has pulled back {dd_abs:.1f}% with RSI at the {prsi_pct}th percentile — "
                f"a combination that historically precedes recoveries in this asset class. "
                f"Not your typical recommendation. Smart DCA score: {score}/100."
            ),
            "zh": (
                f"{ticker} 回撤 {dd_abs:.1f}%，RSI 百分位 {prsi_pct}%。"
                f"這種組合在此類資產的歷史中常出現在反彈前夕。"
                f"非典型推薦，公式評分：{score}/100。"
            ),
        },
    }

    key = "featured" if rank == 0 else pool_key
    return templates[key]

# ── MAIN ────────────────────────────────────────────────────────
def analyze_ticker(ticker):
    closes = get_price_data(ticker)
    if not closes:
        return None
    prsi     = calc_rsi_percentile(closes)
    drawdown = calc_drawdown(closes)
    rsi      = calc_rsi(closes)
    score    = signal_score(prsi, drawdown)
    price    = get_current_price(ticker) or round(closes[-1], 2)
    return {
        "ticker":   ticker,
        "price":    price,
        "rsi":      rsi,
        "prsi":     prsi,
        "drawdown": drawdown,
        "score":    score,
    }

def pick_best(pool_key, pool_cfg, exclude_ticker=None, rank=1):
    print(f"\n── {pool_key.upper()} pool ──")
    candidates = []
    for ticker in pool_cfg["tickers"]:
        if exclude_ticker and ticker == exclude_ticker:
            print(f"  [{ticker}] skipped (already featured)")
            continue
        print(f"  Checking {ticker}...")
        result = analyze_ticker(ticker)
        if result is None:
            continue
        if result["score"] > 30:
            candidates.append(result)
            print(f"    score={result['score']}  drawdown={result['drawdown']}%  prsi={result['prsi']}")
        else:
            print(f"    score={result['score']} — below threshold, skipped")

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
        "label_en":  pool_cfg["label_en"],
        "label_zh":  pool_cfg["label_zh"],
        "ticker":    best["ticker"],
        "price":     best["price"],
        "rsi":       best["rsi"],
        "prsi_pct":  int(best["prsi"] * 100),
        "drawdown":  best["drawdown"],
        "score":     best["score"],
        "blurb":     blurb,
    }

def main():
    now = datetime.datetime.utcnow()
    updated = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    updated_display = now.strftime("%b %d, %Y")

    # Step 1: get best from each pool (no exclusions yet)
    raw_picks = []
    for pool_key, pool_cfg in POOLS.items():
        pick = pick_best(pool_key, pool_cfg, rank=1)
        if pick:
            raw_picks.append((pool_key, pick))

    # Step 2: featured = highest score across pools
    if not raw_picks:
        print("No picks generated.")
        return

    featured_pool_key, featured_pick = max(raw_picks, key=lambda x: x[1]["score"])

    # Re-generate featured blurb with rank=0 (featured template)
    fp = featured_pick
    featured_pick["blurb"] = make_blurb(
        fp["ticker"], featured_pool_key,
        fp["prsi_pct"] / 100, fp["drawdown"],
        fp["rsi"], fp["price"], fp["score"], rank=0
    )

    # Step 3: pool cards — if featured ticker appears in a pool, replace with next-best
    final_picks = []
    for pool_key, pool_cfg in POOLS.items():
        existing = next((p for k, p in raw_picks if k == pool_key), None)
        if existing and existing["ticker"] == featured_pick["ticker"]:
            # Featured ticker is from this pool — fetch next best (exclude featured)
            print(f"\n  [{pool_key}] top pick is featured — finding next best...")
            replacement = pick_best(pool_key, pool_cfg,
                                    exclude_ticker=featured_pick["ticker"], rank=1)
            if replacement:
                final_picks.append(replacement)
            # else: pool gets no card this cycle
        elif existing:
            final_picks.append(existing)

    output = {
        "updated":         updated,
        "updated_display": updated_display,
        "featured":        featured_pick,
        "picks":           final_picks,
    }

    with open("picks.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n✅ picks.json written — {len(final_picks)} pool cards, featured: {featured_pick['ticker']}")

if __name__ == "__main__":
    main()
