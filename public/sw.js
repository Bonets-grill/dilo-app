const CACHE_NAME = 'dilo-v3';
const SUPPORTED_LOCALES = ['es', 'en', 'fr', 'it', 'de'];
const DEFAULT_LOCALE = 'es';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fetch: network first
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Push notification — LOUD
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'DILO';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/chat' },
    vibrate: [300, 100, 300, 100, 300],
    sound: '/notification.mp3',
    requireInteraction: true,
    tag: data.tag || 'dilo-notification',
    renotify: true,
    actions: data.actions || [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Given a raw URL path from a push payload (possibly relative and locale-less)
 * and the URL of a currently-open client (if any), return a fully-qualified URL
 * with a correct locale prefix so navigation doesn't land on a 404 or a
 * redirect loop through next-intl middleware.
 */
function resolveTargetUrl(rawUrl, existingClientUrl) {
  if (!rawUrl) rawUrl = '/chat';

  // Absolute URL → respect as-is
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;

  // Ensure leading slash
  if (!rawUrl.startsWith('/')) rawUrl = '/' + rawUrl;

  // Already has locale prefix?
  const firstSeg = rawUrl.split('/')[1];
  if (SUPPORTED_LOCALES.includes(firstSeg)) {
    return self.location.origin + rawUrl;
  }

  // Don't prefix API routes or static assets
  if (rawUrl.startsWith('/api/') || rawUrl.startsWith('/_next/')) {
    return self.location.origin + rawUrl;
  }

  // Try to infer locale from an existing client's URL
  let locale = DEFAULT_LOCALE;
  if (existingClientUrl) {
    try {
      const segs = new URL(existingClientUrl).pathname.split('/');
      if (segs[1] && SUPPORTED_LOCALES.includes(segs[1])) locale = segs[1];
    } catch (_) { /* ignore */ }
  }

  return self.location.origin + '/' + locale + rawUrl;
}

// Click notification → open app at the right URL (locale-aware)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.url || '/chat';

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    const existing = clients.find((c) => c.url.includes(self.location.origin));
    const target = resolveTargetUrl(rawUrl, existing ? existing.url : null);

    if (existing) {
      await existing.focus();
      // `navigate` can fail cross-origin or on some versions; use setTimeout
      // + postMessage fallback if the direct navigate throws.
      try {
        await existing.navigate(target);
      } catch (_) {
        existing.postMessage({ type: 'dilo:navigate', url: target });
      }
    } else {
      await self.clients.openWindow(target);
    }
  })());
});
