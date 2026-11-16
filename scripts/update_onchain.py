# -*- coding: utf-8 -*-
"""
比特幣鏈上數據 → 根目錄 onchain.json(資產頁「成本與位置」那一排卡片吃這個)。

來源:Bitview(https://bitview.space),免費、不用帳號,資料以 CC BY 4.0 授權,
     頁面上必須標註來源(js/asset-page.js 已寫在每張卡的說明裡)。
只顯示,不進 DCA Score。

輸出格式:{ "btc": { "mvrv": 1.2, "realizedPrice": 53621.07,
                     "sthRealizedPrice": 74399.26, "supplyInProfit": 50.49 } }
任何一項抓不到就不寫那一項(前端遇到缺的會整張卡不顯示);
全部抓不到就保留舊檔不動,並以非零代碼結束讓 Actions 顯示紅叉。
"""
import json, os, sys, urllib.request

API = 'https://bitview.space/api/series/%s/day1/latest'
SERIES = {               # 前端欄位名 : Bitview 序列名
    'mvrv':             'mvrv',
    'realizedPrice':    'realized_price',
    'sthRealizedPrice': 'sth_realized_price',
    'supplyInProfit':   'supply_in_profit_share',
}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'onchain.json')

def fetch(name):
    req = urllib.request.Request(API % name, headers={'User-Agent': 'dcacafe-onchain/1.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        v = float(r.read().decode().strip())
    if v != v or v <= 0:          # NaN 或不合理的值
        raise ValueError('bad value %r' % v)
    return v

def main():
    btc, failed = {}, []
    for key, name in SERIES.items():
        try:
            btc[key] = round(fetch(name), 4)
            print('ok  ', key, btc[key])
        except Exception as e:
            failed.append(key); print('FAIL', key, e)
    if not btc:
        print('全部抓取失敗,保留舊的 onchain.json'); sys.exit(1)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'btc': btc}, f, ensure_ascii=False, indent=2); f.write('\n')
    if failed:
        sys.exit(1)

if __name__ == '__main__':
    main()
