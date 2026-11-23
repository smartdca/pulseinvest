#!/usr/bin/env python3
# ============================================================
# update_scores.py — 首頁人氣熱搜、泡泡頁、資產頁相關卡的分數來源
#
# 【為什麼要有這支】
#   原本這三個地方是「每個訪客、每個資產各打一次 ticker-score」。
#   資產會一直增加(幾百支),一個人打開泡泡頁就要打幾百次後端。
#   改成:每天收盤後由這支一次抓好,寫成根目錄的 scores.json,
#   頁面只讀這一份檔案。訪客不管多少,後端每天只被問一輪。
#
# 【做什麼】
#   從 assets.js 讀出所有資產(含加密與 ETF),依序向後端
#   api/ticker-score 問分數,寫進 scores.json:
#     { "updatedAt": "...", "scores": { "<查詢代號大寫>": { "s": 分數, "at": 秒數 } } }
#   at 是這一支最後一次成功抓到的時間(Unix 秒),頁面用它判斷太舊就不用。
#
# 【失敗處理】
#   · 某一支抓失敗 → 保留舊值(連同舊的 at),頁面會自己判斷要不要改回即時抓。
#   · 全部失敗 → 不改動檔案,以非零代碼結束(Actions 顯示紅叉)。
#   · 已經不在 assets.js 的代號會從檔案移除。
#
# 【計數器】
#   這支「不算」DCA Score 計算次數:計數只在訪客的瀏覽器裡發生
#   (js/score-count.js 的 dcaCountShown),排程本身不回報。
#   不要把這支併進 push/Alpaca/Brew/Bot 那些會直接寫計數的排程。
# ============================================================
import json, os, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone

ROOT      = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS_JS = os.path.join(ROOT, "assets.js")
OUT       = os.path.join(ROOT, "scores.json")
API       = os.environ.get("SCORE_API", "https://proxy-three-mu-47.vercel.app/api/ticker-score")
GAP_SEC   = 0.4     # 每支之間間隔,不要一次轟後端
TRIES     = 3


def read_assets():
    """回傳 assets.js 裡每支資產的查詢代號(大寫,不重複,保留順序)。"""
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
        q = (q.group(1) if q else t).upper()
        if q not in out:
            out.append(q)
    return out


def fetch_score(q):
    url = API + "?ticker=" + urllib.parse.quote(q)
    req = urllib.request.Request(url, headers={"User-Agent": "dcacafe-scores-bot"})
    for i in range(TRIES):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                j = json.loads(r.read().decode("utf-8"))
            s = j.get("score")
            if s is None and isinstance(j.get("data"), dict):
                s = j["data"].get("score")
            if isinstance(s, (int, float)):
                return round(float(s), 2)
        except Exception as e:
            print(f"  {q} 第 {i + 1} 次失敗:{e}")
        time.sleep(2 * (i + 1))
    return None


def main():
    queries = read_assets()
    try:
        old = json.load(open(OUT, encoding="utf-8")).get("scores", {})
    except Exception:
        old = {}

    now = int(time.time())
    scores, ok, bad = {}, 0, []
    for q in queries:
        s = fetch_score(q)
        if s is not None:
            scores[q] = {"s": s, "at": now}
            ok += 1
        else:
            bad.append(q)
            if q in old:
                scores[q] = old[q]
        time.sleep(GAP_SEC)

    print(f"成功 {ok} / {len(queries)}" + (f",失敗:{', '.join(bad)}" if bad else ""))
    if ok == 0:
        sys.exit("全部失敗,不改動 scores.json")

    data = {"updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "scores": scores}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
