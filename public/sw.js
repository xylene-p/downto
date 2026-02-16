// down to — Service Worker for Web Push Notifications

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "down to", body: event.data.text() };
  }

  const { title = "down to", body = "", type, relatedId } = data;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: type ? `${type}-${relatedId || "default"}` : undefined,
      data: { type, relatedId },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const { type } = event.notification.data || {};

  // Map notification type to a tab
  let tab = "/";
  if (type === "friend_request" || type === "friend_accepted") {
    tab = "/?tab=profile";
  } else if (type === "squad_message") {
    tab = "/?tab=groups";
  } else if (type === "check_response") {
    tab = "/?tab=feed";
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.postMessage({
            type: "NOTIFICATION_CLICK",
            notificationType: type,
          });
          return;
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(tab);
    })
  );
});
