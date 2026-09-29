#!/usr/bin/env python3
# ============================================================
# update_analyst.py — 資產頁「華爾街，這樣看。」卡片的資料來源
#
# 【做什麼】
#   從 assets.js 讀出所有資產,逐一向 Yahoo 抓:
#     ① 券商評級紀錄(upgradeDowngradeHistory)
#     ② 過去一年的每日收盤價
#   依下方規則算好,寫成根目錄的 analyst.json,資產頁直接讀這份檔案。
#   訪客打開資產頁時不會去連 Yahoo。
#
# 【計算規則】(全部資產同一套,不做個別調整)
#   · 只看最近 WINDOW_DAYS 天內有發表評級的券商;同一家只取最新一筆。
#   · 評級分三類:看好 / 中立 / 看淡,對照表在 BUY_GRADES / SELL_GRADES,
#     其餘一律算中立。
#   · 目標價:取上述券商各自最新的目標價;高於最新收盤價 OUTLIER_X 倍以上、
#     或低於 1/OUTLIER_X 以下的視為極端值,不列入最高/中位數/最低。
#     用倍數而不用固定百分比,是因為漲跌不對稱:「-70%」已經是很極端的看法,
#     「+70%」在成長股身上卻很常見(實測 NVDA 會誤刪四個正常的看好目標價)。
#   · 券商數少於 MIN_FIRMS 視為沒有資料,卡片整張不顯示。
#   · 走勢線:收盤價先做 SMOOTH_DAYS 日移動平均,再每 SAMPLE_STEP 天取一點,
#     最後一點固定為最新收盤價。頁面上的「現價」另外吃資產頁即時價格。
#
# 【失敗處理】
#   · 某一檔抓失敗 → 保留 analyst.json 裡該檔的舊資料,不刪除。
#   · 全部失敗 → 不改動檔案,以非零代碼結束(Actions 顯示紅叉)。
#
# 【Yahoo 負擔】
#   驗證碼(crumb)整次執行只拿一次;每檔之間間隔 GAP_SEC 秒。
#   分析師資料的接口需要瀏覽器指紋,所以用 curl_cffi 模擬 Chrome。
# ============================================================
import json, os, re, sys, time, statistics
from datetime import datetime, timezone

try:
    from curl_cffi import requests as cr
except ImportError:
    sys.exit("需要 curl_cffi:pip install curl_cffi")

ROOT        = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS_JS   = os.path.join(ROOT, "assets.js")
OUT         = os.path.join(ROOT, "analyst.json")

WINDOW_DAYS = 91      # 近 3 個月
OUTLIER_X   = 3.0     # 目標價高於現價 3 倍或低於 1/3 視為極端值
MIN_FIRMS   = 3       # 少於 3 家券商就不顯示
SMOOTH_DAYS = 7
SAMPLE_STEP = 2
GAP_SEC     = 2.0

BUY_GRADES = {
    "buy", "strong buy", "outperform", "overweight", "positive", "accumulate", "add",
    "market outperform", "sector outperform", "conviction buy", "top pick",
    "long-term buy", "speculative buy", "moderate buy", "outperformer",
}
SELL_GRADES = {
    "sell", "strong sell", "underperform", "underweight", "negative", "reduce",
    "market underperform", "sector underperform", "moderate sell", "underperformer",
}


def read_assets():
    """回傳 [(顯示代號, 查詢代號, 類別)];加密類沒有券商評級,直接略過。"""
    src = open(ASSETS_JS, encoding="utf-8").read()
    start = src.find("window.DCA_ASSETS")
    end = src.find("];", start)
    block = src[start:end]
    pos = [m.start() for m in re.finditer(r"\bticker\s*:\s*'", block)] + [len(block)]
    out = []
    for a, b in zip(pos, pos[1:]):
        seg = block[a:b]
        t = re.match(r"ticker\s*:\s*'([^']+)'", seg).group(1)
        q = re.search(r"\bquery\s*:\s*'([^']+)'", seg)
        c = re.search(r"\bcat\s*:\s*'([^']+)'", seg)
        cat = c.group(1) if c else ""
        if cat == "crypto":
            continue
        out.append((t, q.group(1) if q else t, cat))
    return out


def classify(grade):
    g = (grade or "").strip().lower()
    if g in BUY_GRADES:
        return "buy"
    if g in SELL_GRADES:
        return "sell"
    return "hold"


def smooth_series(closes):
    sm = []
    for i in range(len(closes)):
        w = closes[max(0, i - SMOOTH_DAYS + 1): i + 1]
        sm.append(sum(w) / len(w))
    pts = sm[::SAMPLE_STEP]
    if (len(sm) - 1) % SAMPLE_STEP:
        pts.append(sm[-1])
    pts[-1] = closes[-1]
    return [round(v, 2) for v in pts]


class Yahoo:
    def __init__(self):
        self.s = cr.Session(impersonate="chrome")
        self.crumb = None

    def ensure_crumb(self):
        if self.crumb:
            return
        try:
            self.s.get("https://fc.yahoo.com", timeout=20)
        except Exception:
            pass  # 這一步只是為了拿 cookie,本身回 404 是正常的
        for host in ("query1", "query2"):
            r = self.s.get(f"https://{host}.finance.yahoo.com/v1/test/getcrumb", timeout=20)
            if r.status_code == 200 and r.text and "<" not in r.text and len(r.text) < 40:
                self.crumb = r.text.strip()
                return
        raise RuntimeError("拿不到 Yahoo 驗證碼")

    def history(self, sym):
        self.ensure_crumb()
        r = self.s.get(f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{sym}",
                       params={"modules": "upgradeDowngradeHistory", "crumb": self.crumb}, timeout=25)
        if r.status_code != 200:
            raise RuntimeError(f"quoteSummary HTTP {r.status_code}")
        res = (r.json().get("quoteSummary") or {}).get("result") or []
        if not res:
            return []
        return (res[0].get("upgradeDowngradeHistory") or {}).get("history") or []

    def closes(self, sym):
        r = self.s.get(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}",
                       params={"range": "1y", "interval": "1d"}, timeout=25)
        if r.status_code != 200:
            raise RuntimeError(f"chart HTTP {r.status_code}")
        res = r.json()["chart"]["result"][0]
        return [c for c in res["indicators"]["quote"][0]["close"] if c]


def build_entry(hist, closes, now_ts):
    if len(closes) < 20:
        return None
    last = closes[-1]
    latest = {}
    for h in sorted(hist, key=lambda x: x.get("epochGradeDate", 0)):
        if h.get("epochGradeDate", 0) >= now_ts - WINDOW_DAYS * 86400 and h.get("firm"):
            latest[h["firm"]] = h
    if len(latest) < MIN_FIRMS:
        return None
    counts = {"buy": 0, "hold": 0, "sell": 0}
    for h in latest.values():
        counts[classify(h.get("toGrade"))] += 1
    targets, excluded = [], 0
    for h in latest.values():
        t = h.get("currentPriceTarget")
        if not isinstance(t, (int, float)) or t <= 0:
            continue
        if t > last * OUTLIER_X or t < last / OUTLIER_X:
            excluded += 1
            continue
        targets.append(float(t))
    tgt = None
    if targets:
        tgt = {"high": round(max(targets), 2), "median": round(statistics.median(targets), 2),
               "low": round(min(targets), 2), "n": len(targets), "excluded": excluded}
    return {"firms": len(latest), "counts": counts, "target": tgt,
            "lastClose": round(last, 2), "px": smooth_series(closes)}


def main():
    assets = read_assets()
    try:
        old = json.load(open(OUT, encoding="utf-8")).get("assets", {})
    except Exception:
        old = {}
    y = Yahoo()
    now_ts = time.time()
    data, ok, failed = {}, 0, []
    for i, (disp, sym, _cat) in enumerate(assets):
        if i:
            time.sleep(GAP_SEC)
        try:
            entry = build_entry(y.history(sym), y.closes(sym), now_ts)
            ok += 1
            if entry:
                data[disp] = entry
                print(f"[{disp}] {entry['firms']} 家券商,目標價 {entry['target']}")
            else:
                print(f"[{disp}] 沒有足夠的分析師資料,卡片不顯示")
        except Exception as e:
            failed.append(disp)
            print(f"[{disp}] 抓取失敗:{e}")
            if disp in old:
                data[disp] = old[disp]  # 保留舊資料
    if ok == 0:
        sys.exit("全部抓取失敗,analyst.json 不改動")
    if data == old:
        print("資料沒有變化,analyst.json 不改動")
        sys.exit(1 if failed else 0)
    out = {"updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "assets": data}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"完成:{ok} 檔成功,{len(failed)} 檔失敗 {failed}")
    if failed:
        sys.exit(1)  # 部分失敗:資料已寫入,但讓 Actions 顯示紅叉提醒


if __name__ == "__main__":
    main()
