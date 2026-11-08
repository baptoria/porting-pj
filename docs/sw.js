// Retire the former ED4 root worker; keep game data and child scopes.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const prefix = 'ed4-shell-' + encodeURIComponent(new URL(self.registration.scope).pathname) + '-';
  await Promise.all((await caches.keys()).filter(key => key.startsWith(prefix)).map(key => caches.delete(key)));
  await self.registration.unregister();
})()));
