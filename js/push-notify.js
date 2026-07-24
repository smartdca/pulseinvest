// ============================================================
// push-notify.js — Web Push 每日提醒 + Service Worker 註冊(push*/notify*)
// 從 index.html 拆分而出(2026-07-24 瘦身②),邏輯逐行原樣搬移,未做任何修改。
//
// 本檔載入時會立即執行兩件事(原本也是如此,位置不變):
//   1. 註冊 /sw.js(不等於訂閱推播,只是讓 Service Worker 就緒)
//   2. 掛上 visibilitychange 監聽,頁面消失時用 sendBeacon 強制同步清單
//
// 依賴:paper-account.js 的 acctLoad()、index.html 的 watchlist/$ 等,
//       皆為執行時才呼叫。本檔必須排在 paper-account.js 之後。
// 後端對應:Proxy repo 的 push-daily.js / api/sheets.js?table=push-subscribe
// ============================================================

// round43新增:推播訂閱的清單同步——把自選清單+虛擬帳戶持股(去重合併)同步到後端,
// 讓每日推播能找到「當下」最新的代碼清單,不是訂閱當下的舊快照。
//
// 設計原則(round43討論定案):只在乎「最後結果」,不在乎過程。
//   1. 每次清單/配置/持股異動,不會立刻送出,只重新排一次debounce計時器(PUSH_SYNC_DEBOUNCE_MS)。
//      短時間內連續異動(增減好幾次、調整完又調整),只會排到最後一次真正觸發送出。
//   2. 頁面要消失的當下(切分頁/切App/鎖螢幕),不管計時器走到哪,立刻用sendBeacon強制送出
//      當下最新狀態——sendBeacon是瀏覽器保證「頁面消失也會送完」的機制,一般fetch在頁面
//      消失時可能被瀏覽器直接砍斷,不保證送達。
//   3. 唯一真的攔不住的情況是iOS因記憶體不足直接砍掉分頁——這種情況兩種機制都會一起消失,
//      不是能靠加機制解決的問題,屬於可接受的最壞情況(頂多當天推播用到稍舊的清單)。
//   4. 沒開通知的裝置,pushGetSubscription()一律回傳null,以下所有函式直接no-op,
//      完全不會觸發任何額外的API呼叫,對絕大多數還沒訂閱的使用者零負擔。
//
// PUSH_SUBSCRIPTION_KEY 目前還沒有寫入的地方——訂閱流程(Service Worker+VAPID+
// 「允許通知」按鈕)是下一步才要做的東西。這裡先把同步機制寫好、掛上呼叫點,
// 等訂閱流程做出來,只需要在那邊把訂閱物件存進這個key,以下機制會自動開始運作,
// 不用回頭改這段程式碼或任何呼叫點。
const PUSH_SUBSCRIPTION_KEY = 'pi_push_subscription';
const PUSH_SYNC_DEBOUNCE_MS = 3 * 60 * 1000; // 3分鐘,靜置夠久才真的送出;可依實測調整
let pushSyncTimer = null;

// round43新增:VAPID公鑰——可以公開,瀏覽器訂閱推播時要用這把鑰匙驗證身份。
// 對應的私鑰只存在Vercel環境變數(VAPID_PRIVATE_KEY),絕不會出現在前端。
const VAPID_PUBLIC_KEY = 'BLl5pgOFmyRFhH4XBM7W6allr4yTFNvMbvAf0zzQl1DmHDNxMy7lX_pYqHZtwrOghd0Mp78KcKOf-m8ziNjZNEo';

// PushManager.subscribe()要吃Uint8Array格式的applicationServerKey,不是字串本身,
// 這是標準的base64url→Uint8Array轉換,web push教學文件裡的固定寫法。
function pushUrlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// 頁面載入時就註冊Service Worker(不代表訂閱推播,只是讓sw.js就緒待命——
// 使用者按下訂閱的當下才會真的要求通知權限)。註冊失敗(例如舊瀏覽器不支援)
// 安靜忽略,不影響網站其他功能。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// 真正的訂閱動作——由使用者主動點擊觸發(Dynamic Allocation Strategy Center的
// 「開啟每日提醒」勾選項+確認鍵)。回傳true/false代表這次有沒有成功訂閱。
async function pushSubscribeUser() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false; // 使用者拒絕,安靜放棄,不重複騷擾

    const registration = await navigator.serviceWorker.ready;
    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true, // iOS/瀏覽器規定:訂閱時必須承諾每次推播都會顯示可見通知
        applicationServerKey: pushUrlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const subJson = sub.toJSON(); // { endpoint, keys:{p256dh,auth}, expirationTime }
    try {
      localStorage.setItem(PUSH_SUBSCRIPTION_KEY, JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }));
    } catch(e) {}

    pushDoSync(false); // 訂閱成功當下立刻同步一次目前的清單,不用等debounce

    // round50新增:GA4事件——成功開啟Web Push通知
    if (typeof gtag !== 'undefined') {
      gtag('event', 'push_subscribe', { event_category: 'push' });
    }
    return true;
  } catch (e) {
    console.error('push subscribe failed:', e);
    return false;
  }
}

// round43新增:雙重詢問的第一層——我們自己畫的彈窗,按「開啟」才會真的觸發
// pushSubscribeUser()裡的iOS原生詢問。這裡按「不用」,iOS原生詢問完全不會被觸發,
// 之後隨時可以再跳這個彈窗重問一次,不會有「問過一次永久失效」的問題。
const PUSH_PRE_STR = {
  zh: {
    title: '開啟 DCA Score 提醒',
    desc: '每天提醒你自選清單裡最高分的資產，掌握新聞、事件、重大價格變化等市場資訊。',
    accept: '開啟',
    dismiss: '不用，謝謝',
    deniedHint: '看起來之前已經關閉過通知權限——需要到手機的「設定」裡手動重新開啟才能恢復。',
  },
  en: {
    title: 'Enable DCA Score Alerts',
    desc: 'Get notified about your top-scoring asset each day, plus key news, events, and major price moves.',
    accept: 'Enable',
    dismiss: 'No thanks',
    deniedHint: 'It looks like notifications were previously blocked — you\'ll need to re-enable them manually in your phone Settings.',
  },
};

// round46新增:「答過一次不再自動跳出」機制——不管使用者最後選開啟還是不用,都算「已經有
// 決定」,之後bpOnConfirm不會再自動跳這個彈窗。想改變心意(不管哪個方向),改用🔔常駐設定入口。
const PUSH_DECIDED_KEY = 'pi_push_decided';
function pushHasDecided() {
  try { return localStorage.getItem(PUSH_DECIDED_KEY) === '1'; } catch(e) { return false; }
}
function pushMarkDecided() {
  try { localStorage.setItem(PUSH_DECIDED_KEY, '1'); } catch(e) {}
}

function openPushPrePrompt() {
  const S = PUSH_PRE_STR[currentLang === 'zh' ? 'zh' : 'en'];
  document.getElementById('pushPreTitle').textContent = S.title;
  document.getElementById('pushPreDesc').textContent = S.desc;
  document.getElementById('pushPreAcceptBtn').textContent = S.accept;
  document.getElementById('pushPreDismissBtn').textContent = S.dismiss;
  document.getElementById('pushPrePromptModal').style.display = 'flex';
}
function closePushPrePrompt() {
  pushMarkDecided(); // 使用者關掉這次詢問(不管是按「不用」還是點背景),視同已經做過決定
  document.getElementById('pushPrePromptModal').style.display = 'none';
}
async function pushPrePromptAccept() {
  pushMarkDecided();
  closePushPrePrompt();
  const ok = await pushSubscribeUser();
  // 只有真的是被封鎖(denied)才提示——使用者單純關掉這次詢問(default)不用特別說明。
  if (!ok && typeof Notification !== 'undefined' && Notification.permission === 'denied') {
    const S = PUSH_PRE_STR[currentLang === 'zh' ? 'zh' : 'en'];
    alert(S.deniedHint);
  }
}

function pushGetSubscription() {
  try {
    const raw = localStorage.getItem(PUSH_SUBSCRIPTION_KEY);
    return raw ? JSON.parse(raw) : null; // { endpoint, keys:{p256dh,auth} }
  } catch(e) { return null; }
}

// round46新增:🔔常駐通知設定——不掛在setLang()的ids翻譯陣列裡(跟memberModal同一套做法),
// 因為文案內容(開啟/已開啟兩種狀態)是動態的,彈窗開啟當下才渲染。
const NOTIFY_STR = {
  zh: {
    titleOn: '每日提醒已開啟', descOn: '每天提醒你自選清單裡最高分的資產。', toggleOn: '關閉通知',
    titleOff: '開啟每日提醒', descOff: '每天提醒你自選清單裡最高分的資產，掌握新聞、事件、重大價格變化等市場資訊。', toggleOff: '開啟通知',
    close: '關閉',
  },
  en: {
    titleOn: 'Daily Alerts On', descOn: 'Get notified about your top-scoring asset each day.', toggleOn: 'Turn Off',
    titleOff: 'Enable Daily Alerts', descOff: 'Get notified about your top-scoring asset each day, plus key news, events, and major price moves.', toggleOff: 'Turn On',
    close: 'Close',
  },
};
function notifyApplyLang() {
  const zh = currentLang === 'zh';
  const S = NOTIFY_STR[zh ? 'zh' : 'en'];
  const subscribed = !!pushGetSubscription();
  const titleEl = document.getElementById('notifyModalTitle');
  const descEl = document.getElementById('notifyModalDesc');
  const btnEl = document.getElementById('notifyToggleBtn');
  const closeEl = document.getElementById('notifyCloseBtn');
  if (!titleEl || !descEl || !btnEl || !closeEl) return;
  titleEl.textContent = subscribed ? S.titleOn : S.titleOff;
  descEl.textContent = subscribed ? S.descOn : S.descOff;
  btnEl.textContent = subscribed ? S.toggleOn : S.toggleOff;
  btnEl.style.background = subscribed ? '#fdecea' : '#c8813a';
  btnEl.style.color = subscribed ? '#c62828' : '#fff';
  closeEl.textContent = S.close;
}
function openNotifySheet() {
  notifyApplyLang();
  document.getElementById('notifyModal').style.display = 'flex';
}
function closeNotifySheet() {
  document.getElementById('notifyModal').style.display = 'none';
}
async function notifyToggle() {
  const subscribed = !!pushGetSubscription();
  pushMarkDecided();
  if (subscribed) {
    // 關閉通知:清掉本機訂閱記錄,並嘗試呼叫瀏覽器API真的取消訂閱(non-blocking,失敗也不影響本機狀態清除)
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      }
    } catch(e) {}
    try { localStorage.removeItem(PUSH_SUBSCRIPTION_KEY); } catch(e) {}
  } else {
    const ok = await pushSubscribeUser();
    if (!ok && typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      const S = PUSH_PRE_STR[currentLang === 'zh' ? 'zh' : 'en'];
      alert(S.deniedHint);
    }
  }
  notifyApplyLang();
}

// 自選清單 + 虛擬帳戶持股,去重合併——推播要挑「兩邊加起來」分數最高的那支。
function pushCollectTickers() {
  const wlTickers = (typeof watchlist !== 'undefined' ? watchlist : []).map(w => w.ticker);
  const acct = acctLoad();
  const acctTickers = (acct && acct.holdings) ? acct.holdings.map(h => h.ticker) : [];
  return Array.from(new Set([...wlTickers, ...acctTickers]));
}

// 排一次(或重新排一次)debounce計時器,不會立刻送出。
function pushScheduleSync() {
  if (!pushGetSubscription()) return; // 沒開通知,完全不觸發
  if (pushSyncTimer) clearTimeout(pushSyncTimer);
  pushSyncTimer = setTimeout(() => {
    pushSyncTimer = null;
    pushDoSync(false);
  }, PUSH_SYNC_DEBOUNCE_MS);
}

// 真正送出同步請求。useBeacon=true用於頁面消失當下的強制送出(見下方visibilitychange)。
function pushDoSync(useBeacon) {
  const sub = pushGetSubscription();
  if (!sub) return;
  const payload = JSON.stringify({
    endpoint: sub.endpoint,
    keys: sub.keys,
    tickers: pushCollectTickers(),
    lang: currentLang === 'zh' ? 'zh' : 'en',
  });
  const url = 'https://proxy-three-mu-47.vercel.app/api/sheets?table=push-subscribe';
  if (useBeacon && navigator.sendBeacon) {
    // sendBeacon預設是text/plain,用Blob指定application/json,後端才能正常解析req.body
    navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
  } else {
    fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: payload, keepalive: true }).catch(()=>{});
  }
}

// 頁面即將消失(切分頁/切App/鎖螢幕)的當下,不管debounce計時器走到哪,強制立刻送出最新狀態。
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && pushGetSubscription()) {
    if (pushSyncTimer) { clearTimeout(pushSyncTimer); pushSyncTimer = null; }
    pushDoSync(true);
  }
});
