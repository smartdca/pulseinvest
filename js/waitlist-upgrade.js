// ============================================================
// waitlist-upgrade.js — 候補名單 / 升級彈窗模組
// 從 index.html 拆分而出(round46 架構瘦身),邏輯逐行原樣搬移,未做任何修改。
// 依賴:currentLang(全域變數)、gtag(全域函式,由GA4腳本提供)
// ============================================================

async function submitWaitlistEmail() {
  const zh = currentLang === 'zh';
  const email = document.getElementById('upgradeEmailInput').value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    document.getElementById('upgradeEmailInput').style.borderColor = '#e53935';
    return;
  }
  const btn = document.getElementById('upgradeModalBtn');
  btn.disabled = true;
  btn.textContent = zh ? '送出中...' : 'Submitting...';
  if(typeof gtag !== 'undefined') gtag('event', 'upgrade_waitlist_click', {event_category:'upgrade'});
  try {
    const res = await fetch('https://proxy-three-mu-47.vercel.app/api/sheets?table=waitlist', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email})
    });
    const data = await res.json();
    localStorage.setItem('pi_waitlist_joined', '1');
    document.getElementById('upgradeModalForm').style.display = 'none';
    document.getElementById('upgradeModalTitle').style.color = '#bbb';
    document.getElementById('upgradeModalDesc').style.color = '#bbb';
    const successEl = document.getElementById('upgradeModalSuccess');
    successEl.style.display = 'block';
    successEl.style.textAlign = 'center';
    successEl.textContent = zh ? "✓ 已收到！推薦機制上線時會通知你。" : "✓ Got it! We'll notify you when membership launches.";
    document.getElementById('upgradeModalClose').textContent = 'OK';
  } catch(e) {
    btn.disabled = false;
    btn.textContent = zh ? '加入候補名單 →' : 'Join the Waitlist →';
  }
}

function showUpgradeModal() {
  const zh = currentLang === 'zh';
  const modal = document.getElementById('upgradeModal');
  const alreadyJoined = localStorage.getItem('pi_waitlist_joined');
  if (alreadyJoined) {
    document.getElementById('upgradeModalTitle').textContent = zh ? '已達免費上限' : 'Watchlist Limit Reached';
    document.getElementById('upgradeModalDesc').textContent = zh
      ? '免費帳戶最多追蹤 5 檔股票，所以這次還是沒辦法新增。不過你已經留過資料、在候補名單中了——推薦機制上線時會通知你。'
      : "Free accounts can track up to 5 stocks, so this one still can't be added. But you're already on our waitlist — we'll notify you when membership launches.";
    document.getElementById('upgradeModalForm').style.display = 'none';
    document.getElementById('upgradeModalSuccess').style.display = 'none';
    document.getElementById('upgradeModalClose').textContent = 'OK';
    modal.style.display = 'flex';
    if(typeof gtag !== 'undefined') gtag('event', 'upgrade_modal_shown', {event_category:'upgrade'});
    return;
  }
  document.getElementById('upgradeModalForm').style.display = 'block';
  document.getElementById('upgradeModalSuccess').style.display = 'none';
  document.getElementById('upgradeModalTitle').style.color = '#1a1a1a';
  document.getElementById('upgradeModalDesc').style.color = '#555';
  document.getElementById('upgradeModalTitle').textContent = zh ? '已達免費上限' : 'Watchlist Limit Reached';
  document.getElementById('upgradeModalDesc').textContent = zh
    ? '免費帳戶最多追蹤 5 檔股票。\n\n加入候補名單，搶先體驗 AI 策略觸發的進場提醒 — 不只是價格到了，而是 AI 判斷真正值得加碼的時機。早期加入者優先解鎖。'
    : "Free accounts can track up to 5 stocks.\n\nJoin the waitlist for early access to AI-driven alerts — they tell you when our AI determines conditions are actually worth adding more, not just when a price target hits. Early members unlock first.";
  document.getElementById('upgradeModalBtn').textContent = zh ? '加入候補名單 →' : 'Join the Waitlist →';
  document.getElementById('upgradeModalBtn').disabled = false;
  document.getElementById('upgradeEmailInput').value = '';
  document.getElementById('upgradeEmailInput').style.borderColor = '#e0e0e0';
  document.getElementById('upgradeModalClose').textContent = zh ? '下次再說' : 'Maybe later';
  modal.style.display = 'flex';
  if(typeof gtag !== 'undefined') gtag('event', 'upgrade_modal_shown', {event_category:'upgrade'});
}
function closeUpgradeModal() {
  document.getElementById('upgradeModal').style.display = 'none';
}
// Close modal when clicking backdrop
document.getElementById('upgradeModal').addEventListener('click', function(e) {
  if(e.target === this) closeUpgradeModal();
});
