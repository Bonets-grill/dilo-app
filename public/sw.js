const CACHE_NAME = 'dilo-v5-20260417-fix';
const SUPPORTED_LOCALES = ['es', 'en', 'fr', 'it', 'de'];
const DEFAULT_LOCALE = 'es';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Wipe old cache buckets left behind by prior CACHE_NAME bumps.
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/**
 * Fetch handler — scoped cautiously.
 *
 * Previous version (pre 2026-04-17) did:
 *   event.respondWith(fetch(req).catch(() => caches.match(req)))
 *
 * When BOTH the network request failed AND the cache had no entry,
 * caches.match resolved to `undefined`, so respondWith received undefined
 * and crashed with:
 *   "TypeError: Failed to convert value to 'Response'"
 *
 * The crash propagated to every GET the browser routed through the SW —
 * HTML documents, /api/* fetches, /_next/static chunks, Supabase Realtime
 * websocket handshake (the initial /auth exchange). Full page breakage.
 *
 * This version:
 *   1. Passes through non-GET, cross-origin, and dynamic routes untouched
 *      (no respondWith called → browser handles it natively, SW cannot
 *      corrupt the response).
 *   2. For truly static same-origin assets, tries network first and falls
 *      back to cache; guarantees a Response either way so respondWith
 *      never receives undefined.
 */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  if (url.origin !== self.location.origin) return;

  // Never intercept these — let the browser hit the network directly.
  const p = url.pathname;
  if (p.startsWith('/api/')) return;
  if (p.startsWith('/_next/data/')) return;
  if (p.startsWith('/_next/image')) return;
  if (p.startsWith('/auth/')) return;

  // Only take over for genuinely static assets.
  const isStatic =
    p.startsWith('/_next/static/') ||
    p.startsWith('/icons/') ||
    /\.(png|jpg|jpeg|svg|ico|css|js|woff2?|ttf|webp|mp3|mp4|webm|wav)$/i.test(p);
  if (!isStatic) return;

  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      return res;
    } catch (_) {
      const cached = await caches.match(req);
      if (cached) return cached;
      // Last-resort offline response — ALWAYS a Response, never undefined.
      return new Response('', { status: 503, statusText: 'offline' });
    }
  })());
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
