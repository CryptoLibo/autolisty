// Service worker de Autolisty: muestra las notificaciones del servidor.
// El push llega vacío; aquí se piden las notificaciones pendientes de ESTE
// dispositivo, identificándose con su endpoint de push.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let notifications = []
    try {
      const subscription = await self.registration.pushManager.getSubscription()
      const response = await fetch("/api/notifications/pending", {
        cache: "no-store",
        headers: { "x-push-endpoint": subscription ? subscription.endpoint : "" },
      })
      if (response.ok) notifications = (await response.json()).notifications || []
    } catch {
      notifications = []
    }
    if (!notifications.length) {
      // iOS exige mostrar algo en cada push.
      notifications = [{ title: "Autolisty", body: "Hay novedades en Automation.", url: "/?section=automation", tag: "autolisty" }]
    }
    await Promise.all(notifications.map((item) =>
      self.registration.showNotification(item.title, {
        body: item.body,
        tag: item.tag || `autolisty-${item.id || Date.now()}`,
        icon: "/app-icons/icon-192.png",
        badge: "/app-icons/icon-192.png",
        data: { url: item.url || "/?section=automation" },
      })
    ))
  })())
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/?section=automation"
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
    for (const client of windows) {
      if ("focus" in client && new URL(client.url).origin === self.location.origin && !/^https?:/.test(url)) {
        await client.navigate(url).catch(() => {})
        return client.focus()
      }
    }
    return self.clients.openWindow(url)
  })())
})
