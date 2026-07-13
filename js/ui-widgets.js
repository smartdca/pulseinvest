// ============================================================
// ui-widgets.js — 共用 UI 元件模組(Tooltip、分數量表SVG)
// 從 index.html 拆分而出(round46 架構瘦身),邏輯逐行原樣搬移,未做任何修改。
// 純渲染函式,無外部依賴。
// ============================================================

// ── Tooltip helper ──
function makeTooltip(message) {
  return `<span class="tooltip-wrap" onclick="toggleTooltip(this)" ontouchstart="toggleTooltip(this)">
    <span class="tooltip-icon">⚠️</span>
    <span class="tooltip-bubble">${message}</span>
  </span>`;
}
function toggleTooltip(el) {
  event.stopPropagation();
  document.querySelectorAll('.tooltip-wrap.open').forEach(t => { if(t!==el) t.classList.remove('open'); });
  const opening = !el.classList.contains('open');
  el.classList.toggle('open');
  // round17重寫:不再用「相對於圖示容器」的left:0/right:0切換,改成直接用視窗座標
  // 定位並夾在螢幕邊界內——不管中英文字長短、圖示落在畫面哪個位置，泡泡永遠不會切邊，
  // 箭頭永遠對準圖示。這是一次性通用修法，之後新增任何泡泡都不需要再個別調整。
  if (opening) {
    const bubble = el.querySelector('.tooltip-bubble');
    const icon = el.querySelector('.tooltip-icon, [style*="border-radius:50%"]') || el;
    if (bubble) {
      const margin = 12;
      const bw = bubble.offsetWidth || 240;
      const bh = bubble.offsetHeight || 60;
      const iconRect = icon.getBoundingClientRect();
      const vw = window.innerWidth;

      let left = iconRect.left + iconRect.width / 2 - bw / 2;
      left = Math.max(margin, Math.min(vw - bw - margin, left));

      let top = iconRect.top - bh - 8; // 預設開在圖示上方
      let flipped = false;
      if (top < margin) { top = iconRect.bottom + 8; flipped = true; } // 上方空間不夠時改開下方

      bubble.style.position = 'fixed';
      bubble.style.left = left + 'px';
      bubble.style.top = top + 'px';
      bubble.style.right = 'auto';
      bubble.style.bottom = 'auto';
      bubble.style.transform = 'none';
      bubble.classList.toggle('arrow-flip', flipped);

      const arrowLeft = Math.max(14, Math.min(bw - 14, iconRect.left + iconRect.width / 2 - left));
      bubble.style.setProperty('--arrow-left', arrowLeft + 'px');
    }
  }
}
document.addEventListener('click', () => {
  document.querySelectorAll('.tooltip-wrap.open').forEach(t => t.classList.remove('open'));
});

// ── Score badge helper ──
function scoreBadgeHTML(score, dark = false) {
  const s = parseFloat(score) || 0;
  const tier = s >= 60 ? (dark ? 'high-dark' : 'high')
                       : (dark ? 'low-dark'  : 'low');
  return `<span class="score-badge ${tier}"><span class="score-num">${s.toFixed(0)}</span></span>`;
}

// round9新增:本週精選卡的DCA Score要改成跟大師健檢頁同款的score-strip(數字+圓弧gauge),
// 這個gauge畫法直接從jury.html搬過來,確保兩邊視覺一致
const PICK_LIGHT_GAUGE_COLORS = {green:'#2d7a4f', amber:'#9a6a1a', red:'#b83232'};
const PICK_DARK_GAUGE_COLORS = {green:'#7fd8a8', amber:'#f0c078', red:'#e8907e'};

// ── Smooth gradient gauge (shared by big Score arc and signal chips) ──
function gaugeInterpolateColor(t) {
  // 0→red, 0.45→amber, 1→green
  let r, g, b;
  if (t < 0.45) {
    const s = t / 0.45;
    r = Math.round(224 + (232 - 224) * s); g = Math.round(80 + (160 - 80) * s); b = Math.round(80 + (58 - 80) * s);
  } else {
    const s = (t - 0.45) / 0.55;
    r = Math.round(232 + (93 - 232) * s); g = Math.round(160 + (188 - 160) * s); b = Math.round(58 + (135 - 58) * s);
  }
  return `rgb(${r},${g},${b})`;
}

function bigScoreGaugeSvg(score, displaySize) {
  displaySize = displaySize || 260;
  const N = 120, CX = 130, CY = 130, R = 100, strokeW = 14, needleR = 108;
  let paths = '';
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const a0 = (180 - t0 * 180) * Math.PI / 180, a1 = (180 - t1 * 180) * Math.PI / 180;
    const x0 = (CX + R * Math.cos(a0)).toFixed(2), y0 = (CY - R * Math.sin(a0)).toFixed(2);
    const x1 = (CX + R * Math.cos(a1)).toFixed(2), y1 = (CY - R * Math.sin(a1)).toFixed(2);
    paths += `<path d="M ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1}" fill="none" stroke="${gaugeInterpolateColor(t0)}" stroke-width="${strokeW}" stroke-linecap="butt" opacity="0.88"/>`;
  }
  const frac = Math.max(0, Math.min(1, score / 100));
  const na = (180 - frac * 180) * Math.PI / 180;
  const nx = (CX + needleR * Math.cos(na)).toFixed(2), ny = (CY - needleR * Math.sin(na)).toFixed(2);
  const leftPad = 24, rightPad = 38;
  const vbX = CX - R - leftPad, vbY = CY - R - 12, vbW = R * 2 + leftPad + rightPad, vbH = R + 28;
  const svgH = Math.round(displaySize * vbH / vbW);
  return `<svg width="${displaySize}" height="${svgH}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}">${paths}
    <line x1="${CX}" y1="${CY}" x2="${nx}" y2="${ny}" stroke="rgba(255,255,255,.15)" stroke-width="4" stroke-linecap="round"/>
    <line x1="${CX}" y1="${CY}" x2="${nx}" y2="${ny}" stroke="rgba(255,255,255,.95)" stroke-width="2" stroke-linecap="round"/>
    <circle cx="${CX}" cy="${CY}" r="7" fill="#fff" opacity=".95"/>
    <circle cx="${CX}" cy="${CY}" r="3.5" fill="#c8813a"/>
    <text x="${CX - R - 16}" y="${CY + 5}" fill="rgba(255,255,255,.25)" font-size="11" font-family="-apple-system,sans-serif" text-anchor="end">0</text>
    <text x="${CX + R + 16}" y="${CY + 5}" fill="rgba(255,255,255,.25)" font-size="11" font-family="-apple-system,sans-serif" text-anchor="start">100</text>
  </svg>`;
}

function signalChipGaugeSvg(frac, highIsGood, size) {
  size = size || 48;
  const N = 60, CX = 130, CY = 130, R = 90, strokeW = 22, needleR = 100;
  let paths = '';
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const colorT = highIsGood ? t0 : (1 - t0);
    const a0 = (180 - t0 * 180) * Math.PI / 180, a1 = (180 - t1 * 180) * Math.PI / 180;
    const x0 = (CX + R * Math.cos(a0)).toFixed(2), y0 = (CY - R * Math.sin(a0)).toFixed(2);
    const x1 = (CX + R * Math.cos(a1)).toFixed(2), y1 = (CY - R * Math.sin(a1)).toFixed(2);
    paths += `<path d="M ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1}" fill="none" stroke="${gaugeInterpolateColor(colorT)}" stroke-width="${strokeW}" stroke-linecap="butt" opacity="0.85"/>`;
  }
  const na = (180 - frac * 180) * Math.PI / 180;
  const nx = (CX + needleR * Math.cos(na)).toFixed(2), ny = (CY - needleR * Math.sin(na)).toFixed(2);
  const h = Math.round(size * 0.56);
  return `<svg width="${size}" height="${h}" viewBox="28 32 204 102">${paths}
    <line x1="${CX}" y1="${CY}" x2="${nx}" y2="${ny}" stroke="rgba(255,255,255,.9)" stroke-width="4" stroke-linecap="round"/>
    <circle cx="${CX}" cy="${CY}" r="8" fill="rgba(255,255,255,.9)"/>
    <circle cx="${CX}" cy="${CY}" r="4" fill="#c8813a"/></svg>`;
}
function pickArcGauge(frac, bandColors, size, onDark){
  size = size || 44;
  const h = Math.round(size*0.59);
  frac = Math.max(0, Math.min(1, isNaN(frac) ? 0.5 : frac));
  const palette = onDark ? PICK_DARK_GAUGE_COLORS : PICK_LIGHT_GAUGE_COLORS;
  const needleBase = onDark ? 'rgba(255,255,255,.9)' : '#1a1814';
  const cx0 = 110, cy0 = 110, R = 85, Rneedle = 95;
  function pt(angleDeg, r){
    const rad = angleDeg * Math.PI/180;
    return [(cx0 + r*Math.cos(rad)).toFixed(1), (cy0 - r*Math.sin(rad)).toFixed(1)];
  }
  const p180 = pt(180,R), p135 = pt(135,R), p90 = pt(90,R), p45 = pt(45,R), p0 = pt(0,R);
  const segs = [
    {d:'M '+p180[0]+' '+p180[1]+' A '+R+' '+R+' 0 0 1 '+p135[0]+' '+p135[1], c:bandColors[0]},
    {d:'M '+p135[0]+' '+p135[1]+' A '+R+' '+R+' 0 0 1 '+p90[0]+' '+p90[1], c:bandColors[1]},
    {d:'M '+p90[0]+' '+p90[1]+' A '+R+' '+R+' 0 0 1 '+p45[0]+' '+p45[1], c:bandColors[2]},
    {d:'M '+p45[0]+' '+p45[1]+' A '+R+' '+R+' 0 0 1 '+p0[0]+' '+p0[1], c:bandColors[3]}
  ];
  const paths = segs.map(function(s){
    return '<path d="'+s.d+'" fill="none" stroke="'+palette[s.c]+'" stroke-width="26" opacity="0.85"/>';
  }).join('');
  const needleAngle = 180 - frac*180;
  const tip = pt(needleAngle, Rneedle);
  return '<svg class="mini-gauge" width="'+size+'" height="'+h+'" viewBox="0 0 220 130">'+paths
    + '<line x1="110" y1="110" x2="'+tip[0]+'" y2="'+tip[1]+'" stroke="'+needleBase+'" stroke-width="3.5" stroke-linecap="round"/>'
    + '<line x1="110" y1="110" x2="'+tip[0]+'" y2="'+tip[1]+'" stroke="#c8813a" stroke-width="2" stroke-linecap="round"/>'
    + '<circle cx="110" cy="110" r="6" fill="'+needleBase+'"/></svg>';
}

// round9新增:回撤幅度用迷你折線箭頭icon(跟jury.html miniDrawdownIcon同款),
// 跟DCA Score/RSI用的圓弧gauge是不同視覺語言——回撤本質是「趨勢往下掉多少」,不是位置百分比
function pickDrawdownIcon(colorKey){
  const c = PICK_LIGHT_GAUGE_COLORS[colorKey] || '#aba69e';
  return '<svg class="mini-gauge" width="40" height="26" viewBox="0 0 24 24">'
    + '<path d="M4 6 L9 12 L13 9 L20 19" fill="none" stroke="'+c+'" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<circle cx="20" cy="19" r="2.2" fill="'+c+'"/></svg>';
}
