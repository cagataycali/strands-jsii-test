/**
 * Service Worker generator for PWA support.
 * Call generateServiceWorker() to get the SW code as a string,
 * then register it via navigator.serviceWorker.register().
 */

export function generateServiceWorker(options?: {
  cacheName?: string;
  assetsToCache?: string[];
}): string {
  const cacheName = options?.cacheName ?? 'strands-jsii-v1';
  const assets = JSON.stringify(options?.assetsToCache ?? ['/', '/index.html']);

  return `
const CACHE_NAME = '${cacheName}';
const ASSETS = ${assets};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!url.protocol.startsWith('http')) return;
  if (url.hostname.includes('anthropic.com') || url.hostname.includes('openai.com') ||
      url.hostname.includes('googleapis.com') || url.hostname.includes('bedrock')) return;
  event.respondWith(
    caches.match(event.request).then(r => r || fetch(event.request).then(resp => {
      if (resp.status === 200 && resp.type === 'basic') {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
      }
      return resp;
    })).catch(() => caches.match('/'))
  );
});

self.addEventListener('push', (event) => {
  const data = event.data ? (function() { try { return event.data.json(); } catch(e) { return { title: 'strands', body: event.data.text() }; } })() : { title: 'strands', body: 'New message' };
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, icon: data.icon || '/icon-192.svg', badge: '/icon-192.svg',
    vibrate: [100, 50, 100], data: { url: data.url || '/' },
    actions: [{ action: 'open', title: 'Open' }, { action: 'dismiss', title: 'Dismiss' }],
    tag: data.tag || 'strands-notification', renotify: true,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const c of list) if (c.url.includes(self.location.origin)) return c.focus();
      return clients.openWindow(event.notification.data?.url || '/');
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(event.data.title || 'strands', {
      body: event.data.body || '', icon: '/icon-192.svg',
      tag: event.data.tag || 'strands-' + Date.now(), renotify: true,
    });
  }
});
`;
}

/** Register a service worker in the browser. */
export async function registerServiceWorker(swUrl?: string): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    if (swUrl) {
      return await navigator.serviceWorker.register(swUrl);
    }
    // Generate and register inline SW via blob URL
    const code = generateServiceWorker();
    const blob = new Blob([code], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const reg = await navigator.serviceWorker.register(url);
    URL.revokeObjectURL(url);
    return reg;
  } catch { return null; }
}

/** Generate a manifest.json string for PWA. */
export function generateManifest(options?: { name?: string; shortName?: string; themeColor?: string }): string {
  return JSON.stringify({
    name: options?.name ?? 'Strands Agent',
    short_name: options?.shortName ?? 'Strands',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: options?.themeColor ?? '#0a0a0a',
    icons: [
      { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
      { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
    ],
  }, null, 2);
}
