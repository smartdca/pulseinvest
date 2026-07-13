// ============================================================
// member.js — 會員身份查詢工具模組(🫆)
// 從 index.html 拆分而出(round46 架構瘦身),邏輯逐行原樣搬移,未做任何修改。
// 依賴:currentLang(全域變數,定義於 index.html 的 language 區塊)
// ============================================================

// round42新增:會員身份查詢工具——一個裝置只存一份email(跟虛擬帳戶同一套
// 「一裝置一身份」原則),隨時可更換/刪除,不會寫進Waitlist分頁,純粹拿本機存的
// email去問check-membership.js查Members分頁,回報這個裝置目前算不算會員。
const MEMBER_EMAIL_KEY = 'pi_member_email';

const MEMBER_STR = {
  zh: {
    title:'會員身份', descForm:'輸入你的信箱，確認會員身份。',
    emailLabel:'目前綁定信箱', save:'確認', change:'更換', delete:'刪除', close:'關閉',
    checking:'查詢中…', isMember:'✅ 會員', notMember:'尚未加入會員', checkFailed:'查詢失敗，稍後再試',
    triggerLabel:'會員身份',
  },
  en: {
    title:'Membership', descForm:'Enter your email to check your membership status.',
    emailLabel:'Linked email', save:'Confirm', change:'Change', delete:'Remove', close:'Close',
    checking:'Checking…', isMember:'✅ Member', notMember:'Not a member yet', checkFailed:'Check failed, try again later',
    triggerLabel:'Membership',
  },
};

function memberGetEmail() {
  try { return localStorage.getItem(MEMBER_EMAIL_KEY) || ''; } catch(e) { return ''; }
}
function memberSetEmail(email) {
  try { localStorage.setItem(MEMBER_EMAIL_KEY, email); } catch(e) {}
}
function memberClearEmail() {
  try { localStorage.removeItem(MEMBER_EMAIL_KEY); } catch(e) {}
}

// 靜態文字(標題/欄位標籤/按鈕)集中在這裡更新,語言切換時(setLang)跟開啟彈窗時都會呼叫,
// 確保彈窗開著的時候切語言,或關掉後再打開,文字都一定是當下語言,不會殘留另一種語言的字。
function memberApplyLang() {
  const S = MEMBER_STR[currentLang === 'zh' ? 'zh' : 'en'];
  const titleEl = document.getElementById('memberModalTitle');
  if (titleEl) titleEl.textContent = S.title;
  const saveBtn = document.getElementById('memberSaveBtn');
  if (saveBtn) saveBtn.textContent = S.save;
  const labelEl = document.getElementById('memberEmailLabel');
  if (labelEl) labelEl.textContent = S.emailLabel;
  const changeBtn = document.getElementById('memberChangeBtn');
  if (changeBtn) changeBtn.textContent = S.change;
  const deleteBtn = document.getElementById('memberDeleteBtn');
  if (deleteBtn) deleteBtn.textContent = S.delete;
  const closeBtn = document.getElementById('memberCloseBtn');
  if (closeBtn) closeBtn.textContent = S.close;
  const triggerBtn = document.getElementById('memberTriggerBtn');
  if (triggerBtn) triggerBtn.setAttribute('aria-label', S.triggerLabel);
}

function openMemberSheet() {
  memberApplyLang();
  const email = memberGetEmail();
  if (email) { memberRenderStatus(email); } else { memberRenderForm(); }
  document.getElementById('memberModal').style.display = 'flex';
}
function closeMemberSheet() {
  document.getElementById('memberModal').style.display = 'none';
}
document.getElementById('memberModal').addEventListener('click', function(e) {
  if(e.target === this) closeMemberSheet();
});

function memberRenderForm() {
  memberApplyLang();
  const S = MEMBER_STR[currentLang === 'zh' ? 'zh' : 'en'];
  document.getElementById('memberModalDesc').textContent = S.descForm;
  document.getElementById('memberModalForm').style.display = 'block';
  document.getElementById('memberModalStatus').style.display = 'none';
  document.getElementById('memberEmailInput').value = '';
  document.getElementById('memberEmailInput').style.borderColor = '#e0e0e0';
}

async function memberRenderStatus(email) {
  memberApplyLang();
  const S = MEMBER_STR[currentLang === 'zh' ? 'zh' : 'en'];
  document.getElementById('memberModalDesc').textContent = '';
  document.getElementById('memberModalForm').style.display = 'none';
  document.getElementById('memberModalStatus').style.display = 'block';
  document.getElementById('memberEmailDisplay').textContent = email;
  const badgeEl = document.getElementById('memberStatusBadge');
  badgeEl.textContent = S.checking;
  badgeEl.style.color = '#9a9a9f';
  try {
    const res = await fetch(`https://proxy-three-mu-47.vercel.app/api/sheets?table=check-membership&email=${encodeURIComponent(email)}`);
    const data = await res.json();
    if (data.isMember) {
      badgeEl.textContent = S.isMember;
      badgeEl.style.color = '#2e7d32';
    } else {
      badgeEl.textContent = S.notMember;
      badgeEl.style.color = '#9a9a9f';
    }
  } catch(e) {
    badgeEl.textContent = S.checkFailed;
    badgeEl.style.color = '#c62828';
  }
}

function memberSaveEmail() {
  const val = document.getElementById('memberEmailInput').value.trim();
  if (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    document.getElementById('memberEmailInput').style.borderColor = '#e53935';
    return;
  }
  memberSetEmail(val);
  memberRenderStatus(val);
}
function memberChangeEmail() {
  memberRenderForm();
}
function memberDeleteEmail() {
  memberClearEmail();
  memberRenderForm();
}
