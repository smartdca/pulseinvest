# -*- coding: utf-8 -*-
"""
首頁對決卡 VS 圖：母圖換色。

做法：拿 img/duel-vs-meta-spy.png 當母圖（唯一完全合規的一張），
只把「左半邊藍色煙霧」換成新主角的主色，右邊 SPY 的綠色、VS 金屬字、
alpha 透明度與幾何形狀全部原封不動。所以新圖在版面上的位置與大小
跟母圖逐點相同，CSS 一個字都不用改。

用法（在 repo 根目錄）：
  黑／灰系主色（用一張黑煙霧參考圖來決定深淺分布）：
    python3 scripts/duel-vs-recolor.py img/duel-vs-amd-spy.png --like <黑煙霧參考圖>
  有彩度的主色（直接給色碼）：
    python3 scripts/duel-vs-recolor.py img/duel-vs-xxx-spy.png --color "#E31937"

⚠ 母圖 img/duel-vs-meta-spy.png 永遠不要覆蓋。
⚠ 主色是白色或很淡的顏色時不能用：白煙放在白卡片上會看不見，要另外挑色。
"""
import sys, argparse
import numpy as np
from PIL import Image

MOTHER = 'img/duel-vs-meta-spy.png'

def hue_sat(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1); mn = rgb.min(-1); d = mx - mn + 1e-6
    hue = np.zeros_like(mx)
    i = (mx == b); hue[i] = (240 + 60 * (r - g) / d)[i]
    i = (mx == g); hue[i] = (120 + 60 * (b - r) / d)[i]
    i = (mx == r); hue[i] = ((60 * (g - b) / d) % 360)[i]
    return hue, d / (mx + 1e-6)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--like', help='黑／灰系：參考圖（白底、左半邊是黑煙霧）')
    g.add_argument('--color', help='有彩度：主色色碼，例如 #E31937')
    ap.add_argument('--mother', default=MOTHER)
    a = ap.parse_args()

    im = np.array(Image.open(a.mother).convert('RGBA')).astype(np.float32)
    rgb, alpha = im[..., :3], im[..., 3]
    L = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    hue, sat = hue_sat(rgb)

    # 藍色權重：165°（青綠）→195°（藍）漸進，綠色完全不動；幾乎無彩度的銀色字不動
    w = np.clip((hue - 165) / 30.0, 0, 1) * (hue < 300) * np.clip((sat - 0.04) / 0.10, 0, 1)
    # 只有明顯是藍煙霧（高彩度）才改亮度；偏藍的灰色金屬字只去色、亮度不變
    mapw = np.clip((sat - 0.25) / 0.20, 0, 1)
    smoke = (w > 0.5) & (alpha > 200)

    if a.like:
        ref = np.array(Image.open(a.like).convert('RGB')).astype(np.float32)
        rL = ref @ np.array([0.299, 0.587, 0.114], np.float32)
        rs = ref.max(-1) - ref.min(-1)
        H, W = rL.shape
        black = (rs < 18) & (rL < 200) & (np.arange(W)[None, :] < W * 0.5)
        q = np.linspace(0, 100, 101)
        newL = np.interp(L, np.percentile(L[smoke], q), np.percentile(rL[black], q))
        tL = L * (1 - mapw) + newL * mapw
        target = np.stack([tL] * 3, -1)
    else:
        c = np.array([int(a.color.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)], np.float32)
        # 「深淺」照母圖藍煙霧走:t=1 是煙霧的典型亮度(中位數)→ 剛好是主色;
        # t<1(較淡的煙霧尾巴)往白色漸淡,所以淡邊是淺色調的主色,不會變成一圈灰;
        # t>1(較濃的地方)往黑色加深,保留煙霧的層次。
        med = float(np.median(L[smoke]))
        t = (255.0 - L) / max(1.0, 255.0 - med)
        light = 255.0 - t[..., None] * (255.0 - c[None, None, :])
        dark = c[None, None, :] * np.clip(2.0 - t, 0.35, 1.0)[..., None]
        col = np.where((t <= 1)[..., None], light, dark)
        # 半透明的煙霧邊緣一律當煙霧上色(不看彩度);不透明又低彩度的才是金屬字,只去色
        edge = np.clip((235.0 - alpha) / 40.0, 0, 1)
        mw = np.maximum(mapw, edge)[..., None]
        target = np.clip(col, 0, 255) * mw + np.stack([L] * 3, -1) * (1 - mw)

    out = rgb * (1 - w[..., None]) + target * w[..., None]
    res = np.dstack([np.clip(out, 0, 255), alpha]).astype(np.uint8)
    Image.fromarray(res, 'RGBA').save(a.out)

    # 自檢：alpha 必須跟母圖逐點相同（=位置、大小、形狀完全不變）
    same = (np.array(Image.open(a.out))[..., 3] == alpha.astype(np.uint8)).all()
    print('ok ->', a.out, '| alpha 與母圖相同:', bool(same))
    if not same:
        sys.exit(1)

if __name__ == '__main__':
    main()
