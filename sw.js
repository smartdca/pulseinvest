// sw.js — DCAcafé Service Worker
// 職責很單純:接收後端發來的推播事件,跳出通知+更新桌面icon的數字。
// 不做離線快取(現階段不需要,避免快取邏輯反過來讓開發階段的「檔案沒更新」問題更難排查)。

// round43新增:每次收到推播,都會顯示一則可見通知(iOS/瀏覽器規定,訂閱時
// userVisibleOnly:true 就是承諾這件事,沒有「只偷偷更新數字不跳通知」的選項)。
// badgeCount如果有帶,連同桌面icon的數字一起更新;沒帶就只跳通知,不動icon數字。
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}

  const title = data.title || 'DCAcafé';
  const body = data.body || '';
  const badgeCount = data.badgeCount;

  const badgePromise = ('setAppBadge' in self.navigator && typeof badgeCount === 'number')
    ? self.navigator.setAppBadge(badgeCount)
    : Promise.resolve();

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: body,
        icon: 'IMG_9104.png',
        badge: 'IMG_9104.png',
        data: { url: data.url || '/' },
      }),
      badgePromise,
    ])
  );
});

// 點了通知之後:把使用者帶回網站(已經開著的分頁就直接focus,沒有開著的分頁才新開一個),
// 避免同時開好幾個分頁。
// round51新增:拿掉原本點通知就清空角標的動作——角標現在的定位改成「目前最新分數」,
// 不是「未讀提示」,點開/打開網站都不應該讓它消失,只有下一次新推播進來才會覆蓋掉。
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
