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

# ── TEMPLATE TEXT ───────────────────────────────────────────────
def make_blurb(ticker, pool_key, prsi, drawdown, rsi, price, score):
    dd_abs = abs(drawdown)
    prsi_pct = int(prsi * 100)
    pool_names = {"bluechip": "blue-chip", "growth": "growth", "alternative": "alternative"}
    pool_zh    = {"bluechip": "藍籌股", "growth": "成長股", "alternative": "另類資產"}

    en = (
        f"{ticker} has pulled back {dd_abs:.1f}% from its 52-week high. "
        f"RSI sits at the {prsi_pct}th historical percentile — a level rarely seen "
        f"in this {pool_names[pool_key]} name. "
        f"Our Smart DCA formula scores this entry at {score}/100, "
        f"making it this cycle's strongest signal in the pool."
    )
    zh = (
        f"{ticker} 距 52 週高點已回撤 {dd_abs:.1f}%，"
        f"RSI 處於歷史第 {prsi_pct} 百分位，屬於近年少見低位。"
        f"智能定投公式本期入場評分 {score}/100，"
        f"為{pool_zh[pool_key]}池訊號最強標的。"
    )
    return {"en": en, "zh": zh}

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

def pick_best(pool_key, pool_cfg):
    print(f"\n── {pool_key.upper()} pool ──")
    candidates = []
    for ticker in pool_cfg["tickers"]:
        print(f"  Checking {ticker}...")
        result = analyze_ticker(ticker)
        if result is None:
            continue
        # Minimum signal threshold: score > 30
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
        best["rsi"], best["price"], best["score"]
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

    picks = []
    for pool_key, pool_cfg in POOLS.items():
        pick = pick_best(pool_key, pool_cfg)
        if pick:
            picks.append(pick)

    # Featured = highest score across all pools
    featured = max(picks, key=lambda x: x["score"]) if picks else None

    output = {
        "updated":         updated,
        "updated_display": updated_display,
        "featured":        featured,
        "picks":           picks,
    }

    with open("picks.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n✅ picks.json written — {len(picks)} picks, featured: {featured['ticker'] if featured else 'none'}")

if __name__ == "__main__":
    main()
