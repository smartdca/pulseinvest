/* ============================================================
   DCAcafé 說明文字句庫(計算機結果 + 本週精選 共用)
   ------------------------------------------------------------
   用詞規則:
   ‧ 方法(工具)一律稱「AI 策略 / AI strategy」;結果(數字)一律稱「DCA Score」,不縮寫。
   ‧ 只寫算得出來的事實(回撤、RSI 百分位、VIX、DCA Score、市場狀態),
     不寫沒有數據佐證的歷史勝率、反彈預測或「報酬遠超等待者」這類說法。
   ‧ 形容詞一律依數字分級挑選(見下方 ddWord / rsiWord / vixWord),
     永遠跟數字相符,不會出現「僅 80%」「一切正常但 VIX 很高」這種矛盾。
   ‧ 加碼倍數只有計算機會帶入(倍數依使用者年齡設定而定);
     本週精選沒有使用者資料,不帶倍數。
   ‧ 不使用「建議」一詞。

   市場狀態判定(marketState)必須跟 index.html 計算機裡
   「Determine market state for display」那段完全一致,改一邊就要改另一邊。
   ============================================================ */
(function () {
  function marketState(score, drawdown, prsi, blackSwan) {
    if (blackSwan) return 'Black Swan';
    if (score >= 60) return drawdown <= -25 ? 'Bear Market' : 'Dip';
    if (prsi > 0.8 && drawdown > -5) return 'Elevated';
    return 'Normal';
  }

  // ── 分級形容詞 ──
  function ddWord(drawdown, zh) {
    const a = Math.abs(drawdown);
    if (a < 2)  return zh ? '接近高點' : 'near its high';
    if (a < 10) return zh ? '小幅回檔' : 'a mild pullback';
    if (a < 20) return zh ? '明顯回檔' : 'a clear pullback';
    return zh ? '深度修正' : 'a deep correction';
  }
  function rsiWord(prsi, zh) {
    if (prsi < 0.2) return zh ? '歷史低檔' : 'near historic lows';
    if (prsi < 0.4) return zh ? '偏低' : 'on the low side';
    if (prsi < 0.6) return zh ? '中段' : 'mid-range';
    if (prsi < 0.8) return zh ? '偏高' : 'on the high side';
    return zh ? '歷史高檔' : 'near historic highs';
  }
  function vixWord(vix, zh) {
    if (vix < 15) return zh ? '平靜' : 'calm';
    if (vix < 20) return zh ? '正常' : 'normal';
    if (vix < 30) return zh ? '偏高' : 'elevated';
    if (vix < 40) return zh ? '高檔' : 'high';
    return zh ? '極端' : 'extreme';
  }

  function sentences(state, n, zh) {
    const { dd, p, vx, ddW, rW, vW } = n;
    if (state === 'Black Swan') {
      return zh ? [
        `VIX 恐慌指數升至 ${vx}，處於${vW}水位；價格距近期高點回撤 ${dd}%，屬於${ddW}。AI 策略判定目前符合黑天鵝條件：大跌與市場極度恐慌同時出現。`,
        `回撤 ${dd}%、VIX ${vx}：價格大幅修正與市場恐慌同時發生，AI 策略判定為黑天鵝狀態。定期定額在這種時期，會用同樣的金額買到更多單位。`,
        `VIX ${vx}、RSI 百分位 ${p}%（${rW}）、距高點 ${dd}%。這是 AI 策略定義中最極端的市場狀態，大跌與高度恐慌同時成立。`
      ] : [
        `The VIX fear index has risen to ${vx}, an ${vW} level, and the price is ${dd}% below its recent high — ${ddW}. The AI strategy flags Black Swan conditions: a steep drop and extreme fear at the same time.`,
        `A ${dd}% drawdown with the VIX at ${vx}: a sharp decline and market panic are happening together, which the AI strategy classifies as a Black Swan state. In periods like this, a fixed DCA budget buys more units.`,
        `VIX ${vx}, RSI at the ${p}th percentile (${rW}), ${dd}% off the high. This is the most extreme market state the AI strategy defines: a steep drop and high fear at once.`
      ];
    }
    if (state === 'Bear Market') {
      return zh ? [
        `價格距近期高點回撤 ${dd}%，屬於${ddW}；RSI 位於歷史第 ${p} 百分位（${rW}）。AI 策略判定為熊市狀態，DCA Score 已達加碼門檻。`,
        `${dd}% 的跌幅代表這檔資產承受了持續的賣壓，RSI 歷史百分位為 ${p}%（${rW}）。定期定額在這種時期，會以較低的價格累積較多單位。`,
        `熊市條件成立：距高點 ${dd}%，RSI 百分位 ${p}%，VIX ${vx}（${vW}）。AI 策略綜合這些指標，DCA Score 已進入加碼區間。`
      ] : [
        `The price is ${dd}% below its recent high — ${ddW} — with RSI at the ${p}th historical percentile (${rW}). The AI strategy classifies this as a bear market, and the DCA Score has reached the scale-up threshold.`,
        `A ${dd}% decline shows sustained selling pressure, with RSI at the ${p}th historical percentile (${rW}). In periods like this, DCA accumulates more units at lower prices.`,
        `Bear market conditions: ${dd}% off the high, RSI at the ${p}th percentile, VIX at ${vx} (${vW}). Combining these indicators, the AI strategy puts the DCA Score in the scale-up range.`
      ];
    }
    if (state === 'Dip') {
      return zh ? [
        `價格距近期高點回撤 ${dd}%，屬於${ddW}；RSI 位於歷史第 ${p} 百分位（${rW}）。AI 策略判定為回調狀態，DCA Score 已達加碼門檻。`,
        `這檔資產從近期高點下跌 ${dd}%，RSI 歷史百分位 ${p}%（${rW}）。這不是全面崩跌，但 AI 策略綜合各項指標後，DCA Score 已達加碼門檻。`,
        `回撤 ${dd}%、RSI 百分位 ${p}%、VIX ${vx}（${vW}）：AI 策略偵測到回調訊號。定期定額在回調時，會以較低的成本買入更多單位。`
      ] : [
        `The price is ${dd}% below its recent high — ${ddW} — with RSI at the ${p}th historical percentile (${rW}). The AI strategy classifies this as a dip, and the DCA Score has reached the scale-up threshold.`,
        `Down ${dd}% from its recent high, with RSI at the ${p}th historical percentile (${rW}). Not a breakdown, but across all indicators the AI strategy puts the DCA Score at the scale-up threshold.`,
        `A ${dd}% pullback, RSI at the ${p}th percentile, VIX at ${vx} (${vW}): the AI strategy detects a dip signal. During dips, DCA buys more units at a lower cost.`
      ];
    }
    if (state === 'Elevated') {
      return zh ? [
        `RSI 位於歷史第 ${p} 百分位（${rW}），價格距近期高點 ${dd}%，目前處於相對高位。DCA Score 未達加碼門檻。`,
        `價格接近近期高點（距高點 ${dd}%），RSI 百分位 ${p}%（${rW}）。這不是停止投資的訊號，定期定額的紀律就是持續投入；AI 策略判定本期沒有加碼訊號。`,
        `這檔資產在近期高點附近交易，RSI 歷史百分位 ${p}%。AI 策略沒有偵測到加碼訊號，DCA Score 未達加碼門檻。`
      ] : [
        `RSI is at the ${p}th historical percentile (${rW}) and the price is ${dd}% from its recent high — a relatively high position. The DCA Score has not reached the scale-up threshold.`,
        `The price is close to its recent high (${dd}% below it), with RSI at the ${p}th percentile (${rW}). This is not a signal to stop — DCA means investing consistently — but the AI strategy sees no scale-up signal this period.`,
        `This asset is trading near its recent highs with RSI at the ${p}th historical percentile. The AI strategy detects no scale-up signal; the DCA Score is below the threshold.`
      ];
    }
    // Normal
    return zh ? [
      `目前沒有觸發加碼或黑天鵝條件：距近期高點 ${dd}%（${ddW}），RSI 百分位 ${p}%（${rW}），VIX ${vx}（${vW}）。DCA Score 未達加碼門檻。`,
      `RSI 百分位 ${p}%（${rW}）、距高點 ${dd}%、VIX ${vx}（${vW}）。AI 策略綜合各項指標，DCA Score 尚未達到加碼門檻。`,
      `DCA Score 未達加碼門檻，AI 策略判定為一般狀態。目前距高點 ${dd}%、RSI 百分位 ${p}%、VIX ${vx}（${vW}）。持續投入，本身就是定期定額的核心。`
    ] : [
      `No scale-up or Black Swan conditions are triggered: ${dd}% from the recent high (${ddW}), RSI at the ${p}th percentile (${rW}), VIX at ${vx} (${vW}). The DCA Score is below the scale-up threshold.`,
      `RSI at the ${p}th percentile (${rW}), ${dd}% off the high, VIX at ${vx} (${vW}). Across all indicators, the AI strategy puts the DCA Score below the scale-up threshold.`,
      `The DCA Score is below the scale-up threshold, so the AI strategy classifies this as a normal state: ${dd}% off the high, RSI at the ${p}th percentile, VIX at ${vx} (${vW}). Investing consistently is the core of DCA.`
    ];
  }

  // opts: { state, prsi (0–1), drawdown (負數%), vix, rsi, mult (選填,只有計算機傳), zh, variant (選填) }
  function build(opts) {
    const zh = !!opts.zh;
    const prsi = Number(opts.prsi) || 0;
    const drawdown = Number(opts.drawdown) || 0;
    const vix = Number(opts.vix) || 20;
    const n = {
      dd: Math.abs(drawdown).toFixed(1),
      p: Math.round(prsi * 100),
      vx: vix.toFixed(0),
      ddW: ddWord(drawdown, zh),
      rW: rsiWord(prsi, zh),
      vW: vixWord(vix, zh)
    };
    const list = sentences(opts.state || 'Normal', n, zh);
    const v = (typeof opts.variant === 'number' ? Math.abs(opts.variant) : new Date().getMinutes()) % list.length;
    let text = list[v];
    if (typeof opts.mult === 'number' && isFinite(opts.mult)) {
      text += zh ? `本期對應倍數為 ${opts.mult.toFixed(2)}×。` : ` This period's multiplier: ${opts.mult.toFixed(2)}×.`;
    }
    return text;
  }

  // 主打說明用:依這檔資產「實際用到的指標」照實列出(個股有財報=5項,ETF/加密=4項,歷史太短再少均線)
  function factorsSentence(hasMa, hasPfcf, zh) {
    const zhNames = [], enNames = [];
    if (hasMa) { zhNames.push('長期趨勢'); enNames.push('long-term trend'); }
    zhNames.push('動能', '回撤深度', '市場恐慌'); enNames.push('momentum', 'drawdown depth', 'market fear');
    if (hasPfcf) { zhNames.push('估值'); enNames.push('valuation'); }
    const count = zhNames.length;
    const zhNum = ['', '一', '二', '三', '四', '五', '六'][count] || String(count);
    const enNum = ['', 'one', 'two', 'three', 'four', 'five', 'six'][count] || String(count);
    if (zh) {
      const last = zhNames.pop();
      return `AI 策略綜合${zhNames.join('、')}與${last}${zhNum}項指標計算。`;
    }
    const lastEn = enNames.pop();
    return `The AI strategy combines ${enNum} indicators: ${enNames.join(', ')} and ${lastEn}.`;
  }

  window.DCA_EXPLAIN = { marketState, build, factorsSentence, ddWord, rsiWord, vixWord };
})();
