self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: "HBC REMIX", body: event.data ? event.data.text() : "" };
  }

  const options = {
    body: data.body || "",
    icon: data.icon || "logo.png",
    badge: "logo.png",
    data: { songId: data.songId || null },
  };

  event.waitUntil(self.registration.showNotification(data.title || "HBC REMIX", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const songId = event.notification.data?.songId;
  const targetUrl = songId
    ? `./index.html?song=${songId}`
    : "./index.html";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
