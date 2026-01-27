import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

declare let self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
self.skipWaiting()
clientsClaim()

// Push Notification Handler
self.addEventListener('push', (event) => {
    const data = event.data?.json()

    // console.log('Push received:', data);

    const title = data.title || 'Lantern Notification';
    const options = {
        body: data.body || 'New activity detected.',
        icon: data.icon || '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        data: data.url
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.openWindow(event.notification.data || '/')
    );
});
