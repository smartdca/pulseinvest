// ============================================================
// member.js — Silver Bean 會員狀態顯示模組(🫆)
// round46修正:原本是「輸入email查Members表」的測試工具,改成裝置層級的
// Silver Bean 會員狀態顯示——不再需要email,判斷依據是 isStandaloneMode()。
// 依賴:currentLang(全域變數)、isStandaloneMode()/openInstallModal()(定義於 index.html)
// ============================================================

// round46新增:第一次偵測到standalone環境時,記錄解鎖日期,之後彈窗顯示用。
// 只寫一次(已經有值就不覆蓋),確保顯示的永遠是「第一次」解鎖的日期,不會因為
// 之後每次打開都是standalone就被覆蓋掉。
const SILVERBEAN_UNLOCK_KEY = 'pi_silverbean_unlocked_at';
function memberEnsureUnlockDateRecorded() {
  try {
    if (isStandaloneMode() && !localStorage.getItem(SILVERBEAN_UNLOCK_KEY)) {
      localStorage.setItem(SILVERBEAN_UNLOCK_KEY, new Date().toISOString().slice(0, 10));
    }
  } catch(e) {}
}
memberEnsureUnlockDateRecorded();

const MEMBER_STR = {
  zh: {
    titleUnlocked: 'Silver Bean 會員',
    descUnlocked: '自選清單、虛擬帳戶、配置設定、每日精選推播——都已經解鎖了。',
    unlockedSince: (date) => `解鎖於 ${date}`,
    titleLocked: '尚未解鎖',
    descLocked: '加入主畫面，免費成為 Silver Bean 會員，解鎖自選清單、虛擬帳戶、每日精選推播。',
    unlockBtn: '立即加入',
    close: '關閉',
    triggerLabel: '會員身份',
  },
  en: {
    titleUnlocked: 'Silver Bean Member',
    descUnlocked: 'Watchlist, virtual account, allocation settings, and daily top-pick alerts — all unlocked.',
    unlockedSince: (date) => `Member since ${date}`,
    titleLocked: 'Not unlocked yet',
    descLocked: 'Add to Home Screen to become a Silver Bean member for free — unlock watchlist, virtual account, and daily top-pick alerts.',
    unlockBtn: 'Join Now',
    close: 'Close',
    triggerLabel: 'Membership',
  },
};

// 靜態文字集中在這裡更新,語言切換時(setLang)跟開啟彈窗時都會呼叫,
// 確保彈窗開著的時候切語言,或關掉後再打開,文字都一定是當下語言。
function memberApplyLang() {
  const S = MEMBER_STR[currentLang === 'zh' ? 'zh' : 'en'];
  const unlocked = typeof isStandaloneMode === 'function' && isStandaloneMode();

  const titleEl = document.getElementById('memberModalTitle');
  const descEl = document.getElementById('memberModalDesc');
  const statusEl = document.getElementById('memberModalStatus');
  const unlockDateEl = document.getElementById('memberUnlockDate');
  const unlockBtn = document.getElementById('memberUnlockBtn');
  const iconImg = document.getElementById('memberModalIcon');
  const iconFallback = document.getElementById('memberModalIconFallback');
  const triggerBtn = document.getElementById('memberTriggerBtn');

  if (titleEl) titleEl.textContent = unlocked ? S.titleUnlocked : S.titleLocked;
  if (descEl) descEl.textContent = unlocked ? S.descUnlocked : S.descLocked;

  if (unlocked) {
    if (statusEl) statusEl.style.display = 'block';
    if (unlockDateEl) {
      let dateStr = '';
      try { dateStr = localStorage.getItem(SILVERBEAN_UNLOCK_KEY) || ''; } catch(e) {}
      unlockDateEl.textContent = dateStr ? S.unlockedSince(dateStr) : '';
    }
    if (unlockBtn) unlockBtn.style.display = 'none';
    if (iconImg) iconImg.style.display = 'inline-block';
    if (iconFallback) iconFallback.style.display = 'none';
  } else {
    if (statusEl) statusEl.style.display = 'none';
    if (unlockBtn) { unlockBtn.style.display = 'block'; unlockBtn.textContent = S.unlockBtn; }
    if (iconImg) iconImg.style.display = 'none';
    if (iconFallback) iconFallback.style.display = 'block';
  }

  const closeBtn = document.getElementById('memberCloseBtn');
  if (closeBtn) closeBtn.textContent = S.close;
  if (triggerBtn) triggerBtn.setAttribute('aria-label', S.triggerLabel);
}

function openMemberSheet() {
  memberApplyLang();
  document.getElementById('memberModal').style.display = 'flex';
}
function closeMemberSheet() {
  document.getElementById('memberModal').style.display = 'none';
}
document.getElementById('memberModal').addEventListener('click', function(e) {
  if(e.target === this) closeMemberSheet();
});

// 「立即加入」按鈕:關掉這個狀態彈窗,改開安裝引導彈窗(帶reason='silverbean')
function memberGoUnlock() {
  closeMemberSheet();
  if (typeof openInstallModal === 'function') openInstallModal('silverbean');
}
