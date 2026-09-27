// Service Worker: sirve texturas y datos desde Cache Storage (instalados desde la página de
// entrada) y guarda la app para que funcione sin conexión.
const ASSETS = 'sistema-solar-assets-v1';
const SHELL = 'sistema-solar-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![ASSETS, SHELL].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isAsset = (url) => /\/(textures|data)\//.test(url.pathname);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // El servidor de desarrollo de Vite no se cachea
  if (url.pathname.includes('/@') || url.pathname.includes('/node_modules/') || url.search.includes('import')) return;

  if (isAsset(url)) {
    // Texturas y datos: primero la caché (instalada), si no, red y se guarda
    e.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // App: red primero (para recibir actualizaciones) y caché si no hay conexión
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r ?? caches.match('./'))),
  );
});
