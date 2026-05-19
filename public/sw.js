self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil((async () => {
    const appUrl = new URL(self.registration.scope)
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    const currentWindow = windows.find((client) => client.url.startsWith(appUrl.href))

    if (currentWindow) {
      await currentWindow.focus()
      return
    }

    await clients.openWindow(appUrl.href)
  })())
})